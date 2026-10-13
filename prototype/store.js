import {snapshot,validateAxes,DEFAULT_AXES} from './core/game1-traits.js';
import {createTestLedger} from './core/game1-ledger.js';
import {deriveAxes,relationshipProjection} from './core/game1-derived.js';
import {evaluateBasicTags} from './core/game1-tags.js';
import {createWorkshopTrial,TEST_READY} from './core/game1-workshop.js';
import {initialLife,advanceLife,validateLife,actorsFor,GRID} from './life.js';
export const STORE_KEY='game1-local-a-v1';
const initial=()=>({schema_version:1,version:0,authority:1,pawns:[],events:[],sessions:[],structures:{resources:[],roles:[],commitments:[],conflicts:[]},memories:[],tag_history:{},receipts:{}});
const position=n=>({authority_stream_id:'game1-local-authority',authority_order_id:n});
const base={affection:100,trust:300,respect:300,reciprocity:500};
const direction=(from,to)=>({from_pawn_id:from,to_pawn_id:to});
function ledger(state,from,to){
 const l=createTestLedger({observer_id:from,target_id:to,scope_id:'order-001',allowed_scope_ids:['life-001'],checkpoint:{position:position(1),scores:base},repair_target:{conflict_id:'credit-001',topic:'credit_attribution',scope_id:'order-001'},repair_targets:state.structures.conflicts.filter(c=>c.from_pawn_id===from&&c.to_pawn_id===to).map(c=>({conflict_id:c.id,topic:c.topic,scope_id:c.scope_id}))});
 for(const row of state.events.filter(e=>e.event.observer_id===from&&e.event.target_id===to))l.append(row.event,row.knowledge);
 return l;
}
function scores(state,from,to){return {...ledger(state,from,to).project().scores,...deriveAxes(direction(from,to),state.structures)};}
function context(state,from,to){const a=scores(state,from,to),b=scores(state,to,from);return {a,b,role:state.structures.roles.some(r=>r.active&&((r.from_pawn_id===from&&r.to_pawn_id===to)||(r.from_pawn_id===to&&r.to_pawn_id===from))),competition:false,major_betrayal:false,hostile:false,reverse_hostile:false,attachment:false,wound:false,repeat_reason:false,friend_history:false,related_conflict:a.conflict>1,blocked:false};}
function validateState(state){
 if(!state||state.schema_version!==1||!Number.isSafeInteger(state.version)||state.version<0||!Number.isSafeInteger(state.authority)||state.authority<1||!Array.isArray(state.pawns)||state.pawns.length>3||!Array.isArray(state.events)||state.events.length>500||!Array.isArray(state.sessions)||state.sessions.length>20||!state.receipts)throw Error('save.invalid_data');
 if(state.life)validateLife(state.life);
 const seen=new Set();for(const p of state.pawns){if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(p.id)||seen.has(p.id)||typeof p.name!=='string'||p.name.length>20)throw Error('save.invalid_pawn');seen.add(p.id);validateAxes(p.trait.axis_values);
  for(const layer of Object.values(p.appearance.layers))if(typeof layer!=='string'||(layer!==''&&(!layer.startsWith('data:image/png;base64,')||layer.length>1500000)))throw Error('save.invalid_image');}
 for(const p of state.pawns)for(const other of state.pawns)if(p.id!==other.id)scores(state,p.id,other.id);
 return state;
}
export function createLocalStore(storage){
 const raw=storage.getItem(STORE_KEY);let state=raw?validateState(JSON.parse(raw)):initial();
 const previouslyLiving=!!state.life;state.life??=initialLife();if(previouslyLiving&&state.life.tick>0)state.life.paused=true;
 function commit(commandId,command,change,expected=state.version){
  if(typeof commandId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(commandId))throw Error('command.invalid_id');
  const fingerprint=JSON.stringify(command),old=state.receipts[commandId];if(old){if(old.fingerprint!==fingerprint)throw Error('command.payload_conflict');return structuredClone(old.result);}
  const onDisk=storage.getItem(STORE_KEY);if(expected!==state.version||(onDisk&&JSON.parse(onDisk).version!==state.version))throw Error('save.version_conflict');
  const next=structuredClone(state);const result=change(next);next.version++;next.receipts[commandId]={fingerprint,result};
  if(command.kind==='life-step')for(const key of Object.keys(next.receipts))if(key.startsWith('game1-life-step-')&&key!==commandId)delete next.receipts[key];
  validateState(next);
  storage.setItem(STORE_KEY,JSON.stringify(next));state=next;return structuredClone(result);
 }
 function append(next,event_id,from,to,actionId,evidence={},knowledge={revision:1,known:true,delay_reason:'unconfirmed'},scope='order-001'){
  const observer=[...next.pawns,...(next.life?.guest?[next.life.guest]:[])].find(p=>p.id===from);if(!observer)throw Error('event.observer_missing');
  const event={source_event_id:actionId+'-'+event_id,scope_id:scope,observer_id:from,target_id:to,event_id,position:position(++next.authority),trait_snapshot:structuredClone(observer.trait),rule_version:'game1-rel-test-v041',seed:'seed-a',repeat_multiplier:1,evidence:{action_id:actionId,...evidence}};
  const l=ledger(next,from,to);l.append(event,knowledge);next.events.push({event,knowledge});
  if(knowledge.known)next.memories.push({id:event.source_event_id,from,to,scope_id:scope,topic:event_id==='EVT-01'?'conversation':event_id==='EVT-04'?'help':'credit_attribution',known:true,reason_known:false,resolution:'open'});
  return event;
 }
 return {
  read:()=>structuredClone(state),
  life:()=>structuredClone(state.life),
  visitPermission(commandId,scope,allowed){if(!['host_access','activity_participation','light_auto_events'].includes(scope)||typeof allowed!=='boolean')throw Error('visit.invalid_permission');return commit(commandId,{kind:'local-visit-permission',scope,allowed},next=>{if(scope==='host_access')next.life.host_access=allowed;else next.life.owner_scopes[scope]=allowed;return {status:allowed?'allowed':'owner_scope_denied',penalty:0};});},
  reviseLifeKnowledge(commandId,sourceId,knowledge){return commit(commandId,{kind:'life-knowledge',sourceId,knowledge},next=>{const row=next.events.find(r=>r.event.source_event_id===sourceId);if(!row)throw Error('ledger.source_not_found');const l=ledger(next,row.event.observer_id,row.event.target_id);const result=l.revise(sourceId,knowledge);if(result.status==='revised'){row.knowledge=structuredClone(knowledge);const memory=next.memories.find(m=>m.id===sourceId);if(memory){memory.known=knowledge.known;memory.reason_known=knowledge.delay_reason==='proven_concealment';}for(const history of Object.values(next.tag_history))for(const item of history)if(item.source_event_id===sourceId)item.positive=knowledge.known;}return {status:result.status,action_reexecutions:0,reward_reexecutions:0};});},
  lifePause(commandId,paused){if(typeof paused!=='boolean')throw Error('life.invalid_pause');return commit(commandId,{kind:'life-pause',paused},next=>{next.life.paused=paused;return {paused};});},
  lifeStep(expectedTick){
   if(!Number.isSafeInteger(expectedTick)||expectedTick<1)throw Error('life.invalid_tick');
   if(expectedTick<=state.life.tick)return {status:'duplicate',tick:state.life.tick};
   if(expectedTick!==state.life.tick+1)throw Error('life.tick_gap');
   if(state.life.paused)return {status:'paused',tick:state.life.tick};
   return commit('game1-life-step-'+expectedTick,{kind:'life-step',expectedTick},next=>{
    const completed=advanceLife(next,(from,to)=>{const value=scores(next,from,to),target=next.structures.conflicts.find(c=>c.active&&c.from_pawn_id===from&&c.to_pawn_id===to&&(c.scope_id==='life-001'||(c.id==='credit-001'&&next.events.some(e=>e.event.event_id==='EVT-09'&&e.event.observer_id===from&&e.event.target_id===to))));return {...value,repair_target:target?{conflict_id:target.id,scope_id:target.scope_id,topic:target.topic}:null};});
    for(const done of completed){
     if(done.limited||next.events.length>490)continue;
     const pairs=done.kind==='talk'?[[done.from,done.to],[done.to,done.from]]:[[done.from,done.to]];
     for(const [from,to]of pairs){
      const previous=scores(next,from,to),scope=done.kind==='repair'?done.conflict.scope_id:'life-001';
      const e=append(next,done.kind==='repair'?'EVT-12':done.kind==='talk'?'EVT-01':'EVT-04',from,to,done.action_id+'-'+from,{mutual_acceptance:true,greeting_completed:true,role_accepted:true,help_completed:true,...(done.kind==='repair'?{conflict_id:done.conflict.conflict_id,topic:done.conflict.topic,repair_scope_id:scope,repair_plan_id:done.action_id+'-plan',repair_executed:true,repair_accepted:true}:{})},undefined,scope);
      if(done.kind==='repair'){const target=next.structures.conflicts.find(c=>c.id===done.conflict.conflict_id&&c.scope_id===scope&&c.from_pawn_id===from&&c.to_pawn_id===to);if(!target?.active)throw Error('life.repair_target_changed');target.active=false;target.state='resolved';target.severity=1;for(const m of next.memories)if(m.from===from&&m.to===to&&m.scope_id===scope&&m.topic===done.conflict.topic)m.resolution='resolved';}
      const memory=next.memories.at(-1);memory.reason_known=true;memory.description=done.reason;
      const key=from+'->'+to;next.tag_history[key]??=[];next.tag_history[key].push({source_event_id:e.source_event_id,tick:e.position.authority_order_id,positive:true,context:context(next,from,to)});
      const current=scores(next,from,to),log=next.life.logs.findLast(l=>l.kind==='completed'&&l.actor===done.from);if(log){log.changes??=[];log.changes.push({from,to,affection:current.affection-previous.affection,trust:current.trust-previous.trust});}

     }
    }
    return {status:'applied',tick:next.life.tick,completed:completed.length};
   });
  },
  place(commandId,id,x,y,blocked){if(!Number.isInteger(x)||x<0||x>=GRID.width||!Number.isInteger(y)||y<0||y>=GRID.height||typeof blocked!=='boolean')throw Error('life.invalid_place');return commit(commandId,{kind:'place',id,x,y,blocked},next=>{const p=next.life.places.find(p=>p.id===id);if(!p)throw Error('life.missing_place');if(next.life.places.some(q=>q.id!==id&&q.x===x&&q.y===y)||next.life.walls.some(q=>q.x===x&&q.y===y))throw Error('life.occupied_place');Object.assign(p,{x,y,blocked});return {status:'applied'};});},
  wall(commandId,x,y){if(!Number.isInteger(x)||x<0||x>=GRID.width||!Number.isInteger(y)||y<0||y>=GRID.height)throw Error('life.invalid_wall');return commit(commandId,{kind:'wall',x,y},next=>{const index=next.life.walls.findIndex(p=>p.x===x&&p.y===y);if(index>=0)next.life.walls.splice(index,1);else{if(next.life.places.some(p=>p.x===x&&p.y===y)||Object.values(next.life.actors).some(p=>p.x===x&&p.y===y)||next.life.walls.length>=30)throw Error('life.occupied_wall');next.life.walls.push({x,y});}return {status:'applied'};});},
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
   if(dto.visibility!=='restricted')dto.tags=evaluateBasicTags(state.tag_history[from+'->'+to]||[],c).tags.slice(0,3);return dto;
  },
 };
}
