import {snapshot,validateAxes,DEFAULT_AXES} from './core/game1-traits.js';
import {createTestLedger} from './core/game1-ledger.js';
import {deriveAxes,relationshipProjection} from './core/game1-derived.js';
import {evaluateBasicTags} from './core/game1-tags.js';
import {createWorkshopTrial,TEST_READY} from './core/game1-workshop.js';
import {initialLife,advanceLife,validateLife,actorsFor,GRID} from './life.js';
import {evaluateLayout,releasePlace,standingCells,LAYOUT_OWNER} from './layout.js';
import {judge,grant,dayIndex,emptyRepeat,migrateLegacyTalk} from './repeat.js';
export const STORE_KEY='game1-local-a-v1';
const initial=()=>({schema_version:1,version:0,authority:1,pawns:[],events:[],sessions:[],structures:{resources:[],roles:[],commitments:[],conflicts:[]},memories:[],tag_history:{},receipts:{}});
const position=n=>({authority_stream_id:'game1-local-authority',authority_order_id:n});
const base={affection:100,trust:300,respect:300,reciprocity:500};
const direction=(from,to)=>({from_pawn_id:from,to_pawn_id:to});
function ledger(state,from,to){
 const l=createTestLedger({observer_id:from,target_id:to,scope_id:'order-001',allowed_scope_ids:['life-001'],checkpoint:{position:position(1),scores:{...base,...(state.relation_baseline?.[from+'->'+to]||{})}},repair_target:{conflict_id:'credit-001',topic:'credit_attribution',scope_id:'order-001'},repair_targets:state.structures.conflicts.filter(c=>c.from_pawn_id===from&&c.to_pawn_id===to).map(c=>({conflict_id:c.id,topic:c.topic,scope_id:c.scope_id}))});
 for(const row of state.events.filter(e=>e.event.observer_id===from&&e.event.target_id===to))l.append(row.event,row.knowledge);
 return l;
}
function scores(state,from,to){return {...ledger(state,from,to).project().scores,...deriveAxes(direction(from,to),state.structures)};}
function context(state,from,to){const a=scores(state,from,to),b=scores(state,to,from);return {a,b,role:state.structures.roles.some(r=>r.active&&((r.from_pawn_id===from&&r.to_pawn_id===to)||(r.from_pawn_id===to&&r.to_pawn_id===from))),competition:false,major_betrayal:false,hostile:false,reverse_hostile:false,attachment:false,wound:false,repeat_reason:false,friend_history:false,related_conflict:a.conflict>1,blocked:false};}
function validateState(state){
 if(!state||state.schema_version!==1||!Number.isSafeInteger(state.version)||state.version<0||!Number.isSafeInteger(state.authority)||state.authority<1||!Array.isArray(state.pawns)||state.pawns.length>3||!Array.isArray(state.events)||state.events.length>500||!Array.isArray(state.sessions)||state.sessions.length>20||!state.receipts)throw Error('save.invalid_data');
 if(state.life)validateLife(state.life);
 if(state.relation_baseline!==undefined){if(!state.relation_baseline||typeof state.relation_baseline!=='object'||Object.keys(state.relation_baseline).length>12)throw Error('save.invalid_baseline');for(const v of Object.values(state.relation_baseline))for(const [k,n] of Object.entries(v))if(!(k in base)||!Number.isSafeInteger(n)||n<1||n>1000)throw Error('save.invalid_baseline');}
 if(state.life?.neutral_activity!==undefined&&(!Array.isArray(state.life.neutral_activity)||state.life.neutral_activity.length>NEUTRAL_MAX))throw Error('save.invalid_neutral');
 if(state.life?.neutral_summary!==undefined&&(typeof state.life.neutral_summary!=='object'||Object.keys(state.life.neutral_summary).length>2000))throw Error('save.invalid_neutral');
 const seen=new Set();for(const p of state.pawns){if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(p.id)||seen.has(p.id)||typeof p.name!=='string'||p.name.length>20)throw Error('save.invalid_pawn');seen.add(p.id);validateAxes(p.trait.axis_values);
  for(const layer of Object.values(p.appearance.layers))if(typeof layer!=='string'||(layer!==''&&(!layer.startsWith('data:image/png;base64,')||layer.length>1500000)))throw Error('save.invalid_image');}
 for(const p of state.pawns)for(const other of state.pawns)if(p.id!==other.id)scores(state,p.id,other.id);
 return state;
}

/* ───────── A2 기반(PO-15): 완료 사건 → 반복 자격 → 원장·기억·태그 ───────── */
export const NEUTRAL_MAX=300;
function append(next,event_id,from,to,actionId,evidence={},knowledge={revision:1,known:true,delay_reason:'unconfirmed'},scope='order-001'){
  const observer=[...next.pawns,...(next.life?.guest?[next.life.guest]:[])].find(p=>p.id===from);if(!observer)throw Error('event.observer_missing');
  const event={source_event_id:actionId+'-'+event_id,scope_id:scope,observer_id:from,target_id:to,event_id,position:position(++next.authority),trait_snapshot:structuredClone(observer.trait),rule_version:'game1-rel-test-v041',seed:'seed-a',repeat_multiplier:1,evidence:{action_id:actionId,...evidence}};
  const l=ledger(next,from,to);l.append(event,knowledge);next.events.push({event,knowledge});
  next.memories.push({id:event.source_event_id,from,to,scope_id:scope,topic:event_id==='EVT-01'?'conversation':event_id==='EVT-04'?'help':'credit_attribution',known:knowledge.known,reason_known:false,resolution:'open'});
  return event;
 }
/* 태그 이력 재구축(PO-15 §4): 행(source)은 그대로 두고, 각 행의 긍정 여부와 당시 점수 문맥을 원장 replay 로 다시 계산한다.
   positive = 생활 완료로 자격을 얻은 행(qualifies) ∧ observer 가 현재 인지. 중립(상한)·미인지는 긍정이 아니다. */
export function rebuildTagHistory(next){
 const afterAt=(proj,order)=>{let sc=proj.checkpoint.scores;for(const t of proj.trace){if(t.position.authority_order_id<=order)sc=t.after;else break;}return sc;};
 for(const [key,rows] of Object.entries(next.tag_history)){
  const [from,to]=key.split('->');if(!from||!to)continue;
  const pa=ledger(next,from,to).project(),pb=ledger(next,to,from).project(),flags=context(next,from,to);
  const da=deriveAxes(direction(from,to),next.structures),db=deriveAxes(direction(to,from),next.structures);
  for(const row of rows){
   const ev=next.events.find(e=>e.event.source_event_id===row.source_event_id);
   row.positive=row.qualifies!==false&&(ev?ev.knowledge.known:row.positive);
   row.context={...flags,a:{...afterAt(pa,row.tick),...da},b:{...afterAt(pb,row.tick),...db}};
  }
 }
}
const actionTick=id=>{const m=/^game1-auto-(\d+)-/.exec(id);return m?Number(m[1]):null;};
/* 중립 기록 보존: 오늘·어제는 행 단위(재전송·정정 참조용), 그 이전은 Day×방향×family 개수로 압축 */
function compactNeutral(life){
 const keepFrom=dayIndex(life.tick)-1,keep=[],fold=n=>{const k=n.day+'|'+n.observer+'>'+n.target+'|'+n.family;life.neutral_summary[k]=(life.neutral_summary[k]||0)+1;};
 for(const n of life.neutral_activity){if(n.day>=keepFrom)keep.push(n);else fold(n);}
 while(keep.length>NEUTRAL_MAX)fold(keep.shift());
 life.neutral_activity=keep;
}
/**
 * 한 tick 에 확정된 완료 사건들을 반영한다(같은 commit 안에서 호출). 결과: action 별 'applied' | 'neutral' | 'duplicate' | 'stale'.
 * - 인사·대화(light_social): 방향마다 자격 판정. 허용 → EVT-01 원장 + 기억 + 태그 행. 불허 → 중립 기록만(원장·기억·태그 없음).
 * - 도움·복구: 기존 정의 그대로(도움 한도는 life.js 의 기존 시험 규칙, minor_help 매핑 검수 전).
 * - 같은 물리 action 의 재전송은 아무것도 더하지 않는다. 자격은 완료 시점에 동결되고, 인지 여부와 무관하게 quota 를 쓴다.
 */
export function applyLifeCompletions(next,completed){
 const life=next.life;life.repeat??=emptyRepeat();life.neutral_activity??=[];life.neutral_summary??={};
 const seen=new Set([...next.events.map(r=>r.event.evidence?.action_id).filter(Boolean),...life.neutral_activity.map(n=>n.action_ref)]),outcomes=[];
 for(const done of completed){
  if(done.limited||next.events.length>490)continue;
  const at=actionTick(done.action_id);
  if(at!==null&&dayIndex(at)<dayIndex(life.tick)-1){outcomes.push({action_id:done.action_id,status:'stale'});continue;}
  const pairs=done.kind==='talk'?[[done.from,done.to],[done.to,done.from]]:[[done.from,done.to]];
  if(pairs.some(([from])=>seen.has(done.action_id+'-'+from))){outcomes.push({action_id:done.action_id,status:'duplicate'});continue;}
  const log=life.logs.findLast(l=>l.kind==='completed'&&l.actor===done.from);let granted=0;
  for(const [from,to]of pairs){
   const scope=done.kind==='repair'?done.conflict.scope_id:'life-001',ref=done.action_id+'-'+from,eventId=done.kind==='repair'?'EVT-12':done.kind==='talk'?'EVT-01':'EVT-04';
   let eligibility=null;
   if(done.kind==='talk'){
    const v=judge(life.repeat,{observer:from,target:to,scope,tick:life.tick});
    if(!v.eligible){life.neutral_activity.push({action_ref:ref,action_id:done.action_id,source_ref:ref+'-'+eventId,observer:from,target:to,tick:life.tick,day:v.day,family:v.family,scope,reason:v.reason,since_last_grant:v.since_last_grant,rule_version:v.rule_version});seen.add(ref);continue;}
    eligibility={family:v.family,day:v.day,quota_index:grant(life.repeat,{observer:from,target:to,scope,tick:life.tick}),since_last_grant:v.since_last_grant,rule_version:v.rule_version};
   }
   const knowledge=done.knowledge?.[from]===false?{revision:1,known:false,delay_reason:'unconfirmed'}:undefined;
   const previous=scores(next,from,to);
   const e=append(next,eventId,from,to,ref,{mutual_acceptance:true,greeting_completed:true,role_accepted:true,help_completed:true,...(done.kind==='repair'?{conflict_id:done.conflict.conflict_id,topic:done.conflict.topic,repair_scope_id:scope,repair_plan_id:done.action_id+'-plan',repair_executed:true,repair_accepted:true}:{})},knowledge,scope);
   seen.add(ref);granted++;
   if(eligibility)next.events.at(-1).eligibility=eligibility;
   if(done.kind==='repair'){const target=next.structures.conflicts.find(c=>c.id===done.conflict.conflict_id&&c.scope_id===scope&&c.from_pawn_id===from&&c.to_pawn_id===to);if(!target?.active)throw Error('life.repair_target_changed');target.active=false;target.state='resolved';target.severity=1;for(const m of next.memories)if(m.from===from&&m.to===to&&m.scope_id===scope&&m.topic===done.conflict.topic)m.resolution='resolved';}
   const memory=next.memories.findLast(m=>m.id===e.source_event_id);if(memory){memory.reason_known=true;memory.description=done.reason;}
   const key=from+'->'+to;next.tag_history[key]??=[];next.tag_history[key].push({source_event_id:e.source_event_id,tick:e.position.authority_order_id,positive:!knowledge,qualifies:true,context:context(next,from,to)});
   const current=scores(next,from,to);if(log){log.changes??=[];log.changes.push({from,to,affection:current.affection-previous.affection,trust:current.trust-previous.trust});}
  }
  if(done.kind==='talk'&&!granted&&log){log.kind='neutral';log.text='둘은 잠깐 이야기를 나눴어요';}
  outcomes.push({action_id:done.action_id,status:granted?'applied':'neutral'});
 }
 compactNeutral(life);
 return outcomes;
}

/* 관계 상세 공개 표시(PO-15 §5, PO-DEC-001): 자기 폰이 인지한 사실·해석·사유·해결을 따로 담는다.
   문구 자체는 화면(i18n)이 키로 고른다. 확인되지 않은 악의·상대 속마음은 만들지 않는다. */
export function memoryView(m){
 const ev=(/-(EVT-\d\d)$/.exec(m.id)||[])[1]||null;
 const kind=ev==='EVT-01'?'conversation':ev==='EVT-04'?'help':ev==='EVT-12'?'repair':ev==='EVT-09'?'correction':'credit_gap';
 const conflictKind=kind==='credit_gap'||kind==='correction'||kind==='repair';
 return {id:m.id,kind,target:m.to,reason:conflictKind?(m.reason_known?'known':'unknown'):'not_applicable',resolution:conflictKind?m.resolution:'not_applicable'};
}
export function createLocalStore(storage){
 const raw=storage.getItem(STORE_KEY);let state=raw?validateState(JSON.parse(raw)):initial();
 const previouslyLiving=!!state.life;state.life??=initialLife();if(previouslyLiving&&state.life.tick>0)state.life.paused=true;state.life.layout_version??=0;state.life.repeat??=emptyRepeat();migrateLegacyTalk(state.life);state.life.neutral_activity??=[];state.life.neutral_summary??={};
 function commit(commandId,command,change,expected=state.version){
  if(typeof commandId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(commandId))throw Error('command.invalid_id');
  const fingerprint=JSON.stringify(command),old=state.receipts[commandId];if(old){if(old.fingerprint!==fingerprint)throw Error('command.payload_conflict');return structuredClone(old.result);}
  const onDisk=storage.getItem(STORE_KEY);if(expected!==state.version||(onDisk&&JSON.parse(onDisk).version!==state.version))throw Error('save.version_conflict');
  const next=structuredClone(state);const result=change(next);next.version++;next.receipts[commandId]={fingerprint,result};
  if(command.kind==='life-step')for(const key of Object.keys(next.receipts))if(key.startsWith('game1-life-step-')&&key!==commandId)delete next.receipts[key];
  validateState(next);
  storage.setItem(STORE_KEY,JSON.stringify(next));state=next;return structuredClone(result);
 }

 return {
  read:()=>structuredClone(state),
  life:()=>structuredClone(state.life),
  visitPermission(commandId,scope,allowed){if(!['host_access','activity_participation','light_auto_events'].includes(scope)||typeof allowed!=='boolean')throw Error('visit.invalid_permission');return commit(commandId,{kind:'local-visit-permission',scope,allowed},next=>{if(scope==='host_access')next.life.host_access=allowed;else next.life.owner_scopes[scope]=allowed;return {status:allowed?'allowed':'owner_scope_denied',penalty:0};});},
  reviseLifeKnowledge(commandId,sourceId,knowledge){return commit(commandId,{kind:'life-knowledge',sourceId,knowledge},next=>{
   const row=next.events.find(r=>r.event.source_event_id===sourceId);
   // 상한 중립으로 남은 완료는 자격이 없었으므로 뒤늦게 알아도 기여가 생기지 않는다(PO-15 §3)
   if(!row){if(next.life.neutral_activity?.some(n=>n.source_ref===sourceId))return {status:'not_eligible',action_reexecutions:0,reward_reexecutions:0,quota_changes:0};throw Error('ledger.source_not_found');}
   const l=ledger(next,row.event.observer_id,row.event.target_id);const result=l.revise(sourceId,knowledge);
   if(result.status==='revised'){row.knowledge=structuredClone(knowledge);const memory=next.memories.find(m=>m.id===sourceId);if(memory){memory.known=knowledge.known;if(memory.topic==='credit_attribution')memory.reason_known=knowledge.delay_reason==='proven_concealment';}rebuildTagHistory(next);}
   return {status:result.status,action_reexecutions:0,reward_reexecutions:0,quota_changes:0};});},
  lifePause(commandId,paused){if(typeof paused!=='boolean')throw Error('life.invalid_pause');return commit(commandId,{kind:'life-pause',paused},next=>{next.life.paused=paused;return {paused};});},
  lifeStep(expectedTick){
   if(!Number.isSafeInteger(expectedTick)||expectedTick<1)throw Error('life.invalid_tick');
   if(expectedTick<=state.life.tick)return {status:'duplicate',tick:state.life.tick};
   if(expectedTick!==state.life.tick+1)throw Error('life.tick_gap');
   if(state.life.paused)return {status:'paused',tick:state.life.tick};
   return commit('game1-life-step-'+expectedTick,{kind:'life-step',expectedTick},next=>{
    const completed=advanceLife(next,(from,to)=>{const value=scores(next,from,to),target=next.structures.conflicts.find(c=>c.active&&c.from_pawn_id===from&&c.to_pawn_id===to&&(c.scope_id==='life-001'||(c.id==='credit-001'&&next.events.some(e=>e.event.event_id==='EVT-09'&&e.event.observer_id===from&&e.event.target_id===to))));return {...value,repair_target:target?{conflict_id:target.id,scope_id:target.scope_id,topic:target.topic}:null};});
    const outcomes=applyLifeCompletions(next,completed);
    return {status:'applied',tick:next.life.tick,completed:completed.length,outcomes};
   });
  },
  /* A1(PO-14): 배치는 판정(layout.js) 통과 + 배치 버전 일치 + 월드 주인일 때만 한 commit 으로 반영한다.
     실패하면 저장본은 그대로이고, 화면은 미리보기 초안을 보존한다. */
  layoutVersion:()=>state.life.layout_version||0,
  previewLayout(edit){return evaluateLayout(state.life,edit,standingCells(state));},
  applyLayout(commandId,edit,expectedLayout,viewer=LAYOUT_OWNER){
   if(!edit||!['move','wall','close'].includes(edit.kind))throw Error('layout.out_of_bounds');
   return commit(commandId,{kind:'layout',edit,expectedLayout,viewer},next=>{
    if(viewer!==LAYOUT_OWNER)throw Error('layout.not_owner');
    const current=next.life.layout_version||0;if(expectedLayout!==current)throw Error('layout.version_conflict');
    const verdict=evaluateLayout(next.life,edit,standingCells(next));if(!verdict.ok)throw Error('layout.'+verdict.reason);
    next.life.places=structuredClone(verdict.places);next.life.walls=structuredClone(verdict.walls);
    const stopped=edit.kind==='move'&&verdict.action==='move'?releasePlace(next.life,edit.id,false):edit.kind==='close'&&edit.blocked?releasePlace(next.life,edit.id,true):[];
    for(const id of stopped){next.life.logs.push({id:'life-log-'+(++next.life.sequence),tick:next.life.tick,actor:id,target:null,text:'장소가 바뀌어 하던 일을 멈췄어요',kind:'cancelled'});next.life.logs=next.life.logs.slice(-120);}
    next.life.layout_version=current+1;
    return {status:'applied',action:verdict.action,layout_version:next.life.layout_version,stopped};
   });
  },
  // 이전 호출 형태 유지(테스트·좌표 입력). 같은 판정을 거친다.
  place(commandId,id,x,y,blocked){if(!Number.isInteger(x)||x<0||x>=GRID.width||!Number.isInteger(y)||y<0||y>=GRID.height||typeof blocked!=='boolean')throw Error('life.invalid_place');const place=state.life.places.find(p=>p.id===id);if(!place)throw Error('life.missing_place');let result=null;if(place.x!==x||place.y!==y)result=this.applyLayout(commandId+'-move',{kind:'move',id,x,y},this.layoutVersion());if(place.blocked!==blocked)result=this.applyLayout(commandId+'-close',{kind:'close',id,blocked},this.layoutVersion());return result||{status:'applied',action:'same'};},
  wall(commandId,x,y){if(!Number.isInteger(x)||x<0||x>=GRID.width||!Number.isInteger(y)||y<0||y>=GRID.height)throw Error('life.invalid_wall');return this.applyLayout(commandId,{kind:'wall',x,y},this.layoutVersion());},
  visit(commandId,action){if(!['enter','leave','disconnect','reconnect'].includes(action))throw Error('visit.invalid_action');return commit(commandId,{kind:'local-visit',action},next=>{
   if(action==='enter'){if(!next.life.host_access||!next.life.owner_scopes.activity_participation||!next.life.owner_scopes.light_auto_events)throw Error('visit.owner_scope_denied');if(next.life.guest?.present)throw Error('visit.already_present');next.life.guest??={id:'game1-local-visitor',name:'루미',owner:'local-visitor-owner',local_double:true,trait:snapshot(1,{fairness_sensitivity:'medium',closeness_orientation:'high',risk_aversion:'low'},position(++next.authority))};next.life.guest.present=true;next.life.guest.connected=true;next.life.actors[next.life.guest.id]={x:0,y:6,tired:15,social:85,activity:45,mode:'idle',goal:null,until:0,cooldown:0,reason:'방문한 공간을 둘러봐요',last_place:null};}
   else{if(!next.life.guest?.present)throw Error('visit.not_present');if(action==='leave'){next.life.guest.present=false;delete next.life.actors[next.life.guest.id];}else next.life.guest.connected=action==='reconnect';}
   return {status:action,local_double:true};
  });},
  createPawn(commandId,name,appearance,axes,expected){return commit(commandId,{kind:'create',name,appearance,axes},next=>{
   if(next.pawns.length>=3)throw Error('pawn.limit');const id='pawn-'+commandId;const checked=validateAxes(axes);
   next.pawns.push({id,name:name.trim().slice(0,20)||['모래','밤','노을'][next.pawns.length],owner:'local-owner',appearance:structuredClone(appearance),appearance_version:1,trait:snapshot(1,checked,position(++next.authority))});return {status:'applied',pawn_id:id};
  },expected);},
  updatePawn(commandId,pawnId,name,appearance,axes,expected){return commit(commandId,{kind:'appearance',pawnId,name,appearance,axes},next=>{
   const p=next.pawns.find(p=>p.id===pawnId);if(!p)throw Error('pawn.missing');
   p.name=name.trim().slice(0,20)||p.name;p.appearance=structuredClone(appearance);p.appearance_version++;
   if(JSON.stringify(p.trait.axis_values)!==JSON.stringify(validateAxes(axes)))p.trait=snapshot(p.trait.profile_version+1,axes,position(++next.authority));
   return {status:'applied',pawn_id:p.id};
  },expected);},
  saveTraits(commandId,pawnId,axes,expected){return commit(commandId,{kind:'traits',pawnId,axes},next=>{const p=next.pawns.find(p=>p.id===pawnId);if(!p)throw Error('pawn.missing');p.trait=snapshot(p.trait.profile_version+1,axes,position(++next.authority));return {status:'applied',reason_key:'traits.saved_future_only'};},expected);},
  begin(commandId){return commit(commandId,{kind:'begin'},next=>{
   if(next.pawns.length!==3)throw Error('workshop.requires_three');if(next.sessions.some(s=>!s.completed))throw Error('workshop.already_active');
   const session={id:commandId,commands:[],completed:false,axes:structuredClone(next.pawns[1].trait.axis_values)};next.sessions.push(session);
   const [a,b]=next.pawns;next.structures.resources=[{...direction(a.id,b.id),id:'resource-001',active:true,importance_permille:800,contribution_permille:750,irreplaceability_permille:900}];
   if(!next.structures.conflicts.some(c=>c.id==='credit-001'))next.structures.conflicts.push({...direction(b.id,a.id),id:'credit-001',active:true,scope_id:'order-001',topic:'credit_attribution',severity:650,state:'open'});
   if(!next.structures.conflicts.some(c=>c.id==='credit-002'))next.structures.conflicts.push({...direction(b.id,a.id),id:'credit-002',active:true,scope_id:'order-002',topic:'credit_attribution',severity:500,state:'open'});
   return {status:'ready'};
  });},
  workshop(){const s=state.sessions.at(-1);if(!s)return null;const t=createWorkshopTrial(s.axes);for(const c of s.commands)t.step(c.commandId,c.code,c.conditions);const view=t.project();if(s.status==='paused')view.status='paused';return view;},
  submit(commandId,code,conditions=TEST_READY,expected){return commit(commandId,{kind:'step',code,conditions},next=>{
   const s=next.sessions.at(-1);if(!s)throw Error('workshop.missing');const t=createWorkshopTrial(s.axes);for(const c of s.commands)t.step(c.commandId,c.code,c.conditions);const prior=t.project();const receipt=t.step(commandId,code,conditions);
   const pair=next.pawns.slice(0,2);const previousScores=pair.map((p,i)=>scores(next,p.id,pair[1-i].id));
   s.status=receipt.status==='paused'?'paused':receipt.projection.status;
   if(!['committed','exited'].includes(receipt.status))return {status:receipt.status,reason_key:receipt.reason_key,allowed_actions:receipt.allowed_actions};
   s.commands.push({commandId,code,conditions:structuredClone(conditions)});s.completed=receipt.projection.status==='completed';
   const [a,b]=next.pawns;const events=[];
   for(const effect of receipt.projection.effects.slice(prior.effects.length))events.push(append(next,effect.event_id,effect.observer_id==='bam'?b.id:a.id,effect.target_id==='morae'?a.id:b.id,commandId,effect.event_id==='EVT-09'?{record_corrected:true,delivery_committed:true}:{role_accepted:true,help_completed:true}));
   next.structures.resources[0].irreplaceability_permille=receipt.projection.resource.irreplaceability_permille;
   if(code==='R'){next.structures.roles=[{...direction(a.id,b.id),id:'role-001',active:true,importance_permille:1000,share_permille:600},{...direction(b.id,a.id),id:'role-002',active:true,importance_permille:1000,share_permille:400}];next.structures.commitments=[{...direction(a.id,b.id),id:'commitment-001',active:true,accepted:true,burden:700}];}
   if(code==='S'||code==='E'){for(const row of next.structures.roles)if(code==='S'||row.from_pawn_id===a.id)row.active=false;for(const c of next.structures.commitments)if(code==='S'||c.from_pawn_id===a.id)c.active=false;}
   for(const event of events)for(const [from,to] of [[a.id,b.id],[b.id,a.id]]){const key=from+'->'+to;next.tag_history[key]??=[];next.tag_history[key].push({source_event_id:event.source_event_id,tick:event.position.authority_order_id,positive:true,context:context(next,from,to)});}
   const keys=['affection','trust','respect','reciprocity','dependence','power','obligation','conflict'];
   return {status:receipt.status,reason_key:receipt.reason_key,allowed_actions:receipt.allowed_actions,source_event_ids:events.map(e=>e.source_event_id),relations:pair.map((p,i)=>({from_pawn_id:p.id,to_pawn_id:pair[1-i].id,before:Object.fromEntries(keys.map(k=>[k,previousScores[i][k]])),after:Object.fromEntries(keys.map(k=>[k,scores(next,p.id,pair[1-i].id)[k]]))}))};
  },expected);},
  repair(commandId,{conflict_id='credit-001',scope_id='order-001',topic='credit_attribution',action_id=commandId,plan_id=commandId,remaining_severity=1,accepted=false,executed=false}={},expected){return commit(commandId,{kind:'repair',conflict_id,scope_id,topic,action_id,plan_id,remaining_severity,accepted,executed},next=>{
   const target=next.structures.conflicts.find(c=>c.id===conflict_id&&c.scope_id===scope_id&&c.topic===topic&&c.active);
   if(!target||scope_id!=='order-001'||!Number.isSafeInteger(remaining_severity)||remaining_severity<1||remaining_severity>target.severity)throw Error('repair.target_mismatch');
   const [a,b]=next.pawns;const e=append(next,'EVT-12',b.id,a.id,action_id,{conflict_id,topic,repair_scope_id:scope_id,repair_plan_id:plan_id,repair_executed:executed,repair_accepted:accepted});
   target.severity=remaining_severity;target.state=remaining_severity===1?'resolved':'open';target.active=remaining_severity>1;
   for(const m of next.memories)if(m.from===b.id&&m.to===a.id&&m.scope_id===scope_id&&m.topic===topic)m.resolution=target.state;
   return {status:'applied',source_event_id:e.source_event_id};
  },expected);},
  projection(from,to,otherOwner=false){const internal=scores(state,from,to),c=context(state,from,to);const visitor=state.life.guest?.id;const dto=relationshipProjection({requester_id:'local-owner',observer_owner_id:otherOwner||from===visitor?'another-owner':'local-owner',target_owner_id:to===visitor?'another-owner':'local-owner'},{scores:internal,basis_status:internal.basis_status,memories:state.memories.filter(m=>m.from===from&&m.to===to)});
   if(dto.visibility!=='restricted'){dto.tags=evaluateBasicTags(state.tag_history[from+'->'+to]||[],c).tags.slice(0,3);dto.memory_views=state.memories.filter(m=>m.from===from&&m.to===to&&m.known).map(memoryView);const mine=x=>x.active!==false&&x.from_pawn_id===from&&x.to_pawn_id===to;dto.basis={conflicts:state.structures.conflicts.filter(c=>c.active&&mine(c)).map(c=>({topic:c.topic,state:c.state})),roles:state.structures.roles.filter(mine).length,resources:state.structures.resources.filter(mine).length,commitments:(state.structures.commitments||[]).filter(mine).length};}return dto;
  },
 };
}
