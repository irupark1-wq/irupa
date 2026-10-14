// Deterministic local simulation. Tick time is simulation time, never wall-clock replay.
import {emptyRepeat,validateRepeat} from './repeat.js';
import {talkResponse,helpResponse,joinResponse,checkResponse,roll} from './accept.js';
import {witnessesAt} from './credit.js';
export const GRID={width:12,height:8};
export const DEFAULT_PLACES=[
 {id:'game1-rest',kind:'rest',label:'포근한 쉼터',x:2,y:2,blocked:false},
 {id:'game1-work',kind:'work',label:'함께 만드는 작업대',x:9,y:2,blocked:false},
 {id:'game1-social',kind:'social',label:'이야기 자리',x:6,y:5,blocked:false},
];
/* 두 번째 방(PO-ROOM-001). 생활방(living)은 기존 life.places·walls·layout_version 을 그대로 쓴다(이전 저장본 불변).
   아늑한 방(cozy)은 life.rooms.cozy 에 가구 3개·사용자 장애물·고정 장식 칸(fixed)·배치 버전을 따로 둔다.
   폰은 항상 한 방에만 있다(actor.room, 없으면 living). 시계·반복 자격·관계·공로 흐름은 월드 공유. */
export const ROOMS=['living','cozy'];
export const COZY_PLACES=[
 {id:'game1-cozy-rest',kind:'rest',label:'포근한 쉼터',x:2,y:2,blocked:false},
 {id:'game1-cozy-work',kind:'work',label:'함께 만드는 작업대',x:9,y:2,blocked:false},
 {id:'game1-cozy-social',kind:'social',label:'이야기 자리',x:6,y:5,blocked:false},
];
/** 그림 속 장식이 바닥을 차지하는 칸(사용자 장애물 30칸과 별개, 지울 수 없음). 김디자인 검수 전 초안: 이동 바닥을 장식 아래로 잡아 비어 있음 */
export const COZY_FIXED=[];
export const emptyCozy=()=>({places:structuredClone(COZY_PLACES),walls:[],fixed:structuredClone(COZY_FIXED),layout_version:0});
export const roomOf=a=>a?.room==='cozy'?'cozy':'living';
/** 한 방의 공간 보기: 가구·막힌 칸(사용자 장애물+고정 장식). 시뮬레이션·경로·배치 판정이 같은 것을 쓴다 */
export function roomSpace(life,room){
 if(room==='cozy'){const c=life.rooms?.cozy||emptyCozy();return {room,places:c.places,walls:[...c.walls,...(c.fixed||[])],userWalls:c.walls,fixed:c.fixed||[],layout_version:c.layout_version||0};}
 return {room:'living',places:life.places,walls:life.walls,userWalls:life.walls,fixed:[],layout_version:life.layout_version||0};
}
/** 시뮬레이션 함수(route·candidates)에 넘기는 방 보기: life 를 얕게 복사하고 places·walls 만 그 방 것으로 */
export const roomView=(life,room)=>{const sp=roomSpace(life,room);return {...life,places:sp.places,walls:sp.walls};};
export function initialLife(){return {schema:1,epoch:'game1-life-a1',seed:'game1-auto-v06-seed-a',definition_version:'game1-life-test-v06',tick:0,paused:false,host_access:true,owner_scopes:{activity_participation:true,light_auto_events:true,role_commitment:false,public_relation_declaration:false,major_transition:false},places:structuredClone(DEFAULT_PLACES),walls:[],actors:{},guest:null,logs:[],trace:[],cooldowns:{},effects:{},sequence:0,layout_version:0,repeat:emptyRepeat()};}
const cell=p=>p.x+','+p.y;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const clamp=n=>Math.max(0,Math.min(100,n));
const level=n=>n==='high'?1:n==='low'?-1:0;
export function actorState(index){return {x:3+index*2,y:6,tired:12+index*10,social:50+index*7,activity:55-index*8,mode:'idle',goal:null,until:0,cooldown:0,reason:'살펴보는 중',last_place:null};}
export function actorsFor(state){return [...state.pawns,...(state.life?.guest?.present&&state.life.guest.connected&&state.life.host_access&&state.life.owner_scopes.activity_participation&&state.life.owner_scopes.light_auto_events?[state.life.guest]:[])];}
export function validateLife(life){
 if(life?.repeat!==undefined)validateRepeat(life.repeat);
 if(life?.layout_version!==undefined&&(!Number.isSafeInteger(life.layout_version)||life.layout_version<0))throw Error('life.invalid_state');
 if(typeof life?.host_access!=='boolean'||!life.owner_scopes||['activity_participation','light_auto_events','role_commitment','public_relation_declaration','major_transition'].some(k=>typeof life.owner_scopes[k]!=='boolean')||typeof life.seed!=='string'||life.seed.length>128||!Array.isArray(life.trace)||life.trace.length>80||!Number.isSafeInteger(life.sequence)||life.sequence<0)throw Error('life.invalid_state');
 if(!life||life.schema!==1||life.epoch!=='game1-life-a1'||!Number.isSafeInteger(life.tick)||life.tick<0||typeof life.paused!=='boolean'||!Array.isArray(life.places)||life.places.length!==3||!Array.isArray(life.walls)||life.walls.length>30||!Array.isArray(life.logs)||life.logs.length>120)throw Error('life.invalid_state');
 const inside=p=>Number.isInteger(p.x)&&p.x>=0&&p.x<GRID.width&&Number.isInteger(p.y)&&p.y>=0&&p.y<GRID.height;
 if(life.places.some(p=>!inside(p)||typeof p.blocked!=='boolean')||new Set(life.places.map(cell)).size!==3||life.walls.some(p=>!inside(p))||Object.values(life.actors).some(a=>!inside(a)||['tired','social','activity'].some(k=>!Number.isFinite(a[k])||a[k]<0||a[k]>100)))throw Error('life.invalid_space');
 if(life.rooms!==undefined){const c=life.rooms?.cozy;if(!c||!Array.isArray(c.places)||c.places.length!==3||!Array.isArray(c.walls)||c.walls.length>30||!Array.isArray(c.fixed)||c.fixed.length>48||!Number.isSafeInteger(c.layout_version)||c.layout_version<0)throw Error('life.invalid_rooms');
  if(c.places.some(p=>!inside(p)||typeof p.blocked!=='boolean')||new Set(c.places.map(cell)).size!==3||[...c.walls,...c.fixed].some(p=>!inside(p)))throw Error('life.invalid_space');}
 if(Object.values(life.actors).some(a=>a.room!==undefined&&!ROOMS.includes(a.room)))throw Error('life.invalid_rooms');
 return life;
}
export function route(life,start,target,occupied=[]){
 const blocked=new Set([...life.walls,...occupied].map(cell));blocked.delete(cell(start));
 if(blocked.has(cell(target)))return null;
 const queue=[[start]],seen=new Set([cell(start)]);
 while(queue.length){const path=queue.shift(),p=path.at(-1);if(cell(p)===cell(target))return path.slice(1);
  for(const [dx,dy]of [[0,-1],[1,0],[0,1],[-1,0]]){const n={x:p.x+dx,y:p.y+dy},key=cell(n);if(n.x<0||n.y<0||n.x>=GRID.width||n.y>=GRID.height||blocked.has(key)||seen.has(key))continue;seen.add(key);queue.push([...path,n]);}}
 return null;
}
function log(life,actor,text,kind='activity',target=null){life.logs.push({id:'life-log-'+(++life.sequence),tick:life.tick,actor,target,text,kind});life.logs=life.logs.slice(-120);}
// 대화 수락: 행동별 주요 단서(애정·친밀)와 독립 조건(바쁨·피로·혼자 있고 싶음). 신뢰·갈등 일괄 게이트 없음(accept.js).
export function reaction(actor,traits,relationship,u=0,ctx={}){return talkResponse(actor,traits,relationship,u,ctx);}
/* 성격 카드(PO-HAND-016 §2, PO-PERS-002 v1.1 §3, PERS-SYS-001 v1.0 §3~4 시험안).
   카드는 유효 후보의 선호 점수만 보정한다. 후보 자격·상대 수락·관계 계산·사건 효과는 바꾸지 않는다.
   저장 ID → 명세 ID(동률 정렬은 명세 ID 순). 점수 단위는 후보 점수(0~150 범위)와 같다. */
export const CARD_RULE_ACTIVE='game1-cards-score-v1';
export const CARD_SPEC_ID={kind:'warm',hot_tempered:'quick',stubborn:'firm',independent:'independent'};
// 후보 kind → 카드별 보정. credit_check = 명세 credit_ask(본인이 알고 있는 기록 누락의 확인 부탁).
// assist 의 독립적 +3 은 "상대 요청·동의한 공동 목표" 조건이 아직 게임에 없어 적용하지 않는다(조건 미정).
// credit_review·credit_state_standard·credit_accept_explanation·express_discomfort 는 행동이 아직 없다(G-PERS-2).
export const CARD_SCORES={rest:{independent:12},work:{independent:8},social:{warm:4,independent:-5},meet:{warm:6,independent:-8},assist:{warm:11},repair:{warm:4,firm:2},credit_check:{warm:3,quick:12,firm:3}};
/** 0~3장 합성: |w| 내림차순(동률은 명세 ID 순) → w1 + w2/2 + w3/4 → 마지막 1회 0에서 먼 쪽 반올림 → ±14 */
export function cardDelta(cardIds,kind){
 const w=(cardIds||[]).map(id=>({id:CARD_SPEC_ID[id]||id,v:CARD_SCORES[kind]?.[CARD_SPEC_ID[id]]||0})).filter(x=>x.v).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)||(a.id<b.id?-1:a.id>b.id?1:0));
 const raw=w.reduce((s,x,i)=>s+x.v/2**i,0),r=Math.sign(raw)*Math.round(Math.abs(raw));
 return Math.max(-14,Math.min(14,r))+0;
}
export function candidates(life,id,all,relationship,hooks={}){
 const actor=life.actors[id],pawn=all.find(p=>p.id===id),trait=pawn.trait.axis_values;
 const others=all.filter(p=>p.id!==id&&life.actors[p.id]&&life.tick>=(life.cooldowns[id+'-'+p.id]||0));
 const target=others.sort((a,b)=>distance(actor,life.actors[a.id])-distance(actor,life.actors[b.id])||a.id.localeCompare(b.id))[0];
 const result=life.places.filter(p=>!p.blocked).map(p=>({kind:p.kind,place:p.id,score:p.kind==='rest'?actor.tired*1.5+level(trait.risk_aversion)*6:p.kind==='work'?actor.activity+level(trait.fairness_sensitivity)*9:actor.social+level(trait.closeness_orientation)*22,reason:p.kind==='rest'?'피로를 풀고 싶어요':p.kind==='work'?'작업 욕구와 공정성 성향':'이야기 욕구와 친밀 성향'}));
 if(target){const r=relationship(id,target.id);result.push({kind:'meet',target:target.id,score:actor.social+level(trait.closeness_orientation)*30-level(trait.risk_aversion)*5+(r.affection-100)/10-r.conflict/20,reason:'욕구·성격·애정을 보고 접근해요'});}
 for(const other of others){const r=relationship(other.id,id);if(r.repair_target&&actor.tired<60)result.push({kind:'repair',target:other.id,conflict:r.repair_target,score:actor.activity+actor.social/2+25+level(trait.fairness_sensitivity)*8-level(trait.risk_aversion)*5,reason:'남은 갈등의 구체적인 문제를 함께 보완하려 해요'});}
 const worker=others.find(p=>life.actors[p.id].mode==='working'&&!life.actors[p.id].partner);
 if(worker&&actor.tired<65){const rw=relationship(id,worker.id);result.push({kind:'assist',target:worker.id,score:actor.activity+actor.social/2+level(trait.fairness_sensitivity)*12+(rw.respect-300)/15,reason:'작업 중인 폰을 존중해 도움을 제안해요'});}
 // 제3자 공동작업 기록 흐름(credit.js): 기록 남기기·기록판 읽기·확인 요청·정정·정정 전달. 가중치는 체험 변형(A/B)의 시험값.
 const work=life.places.find(p=>p.kind==='work'&&!p.blocked),bonus=hooks.variant||{record_bonus:0,read_bonus:0};
 if(work&&actor.tired<70){
  const help=hooks.recordableFor?.(id);if(help)result.push({kind:'record',place:work.id,help_id:help,score:actor.activity*0.6+18+bonus.record_bonus+level(trait.fairness_sensitivity)*6,reason:'끝난 공동작업을 기록판에 적으려 해요'});
  const unread=hooks.unreadFor?.(id)||[];if(unread.length)result.push({kind:'read_board',place:work.id,records:unread,score:actor.activity*0.4+14+bonus.read_bonus+level(trait.fairness_sensitivity)*8,reason:'작업대 기록판을 확인하려 해요'});
  const fix=hooks.correctionFor?.(id);if(fix)result.push({kind:'correct_record',place:work.id,issue_id:fix.issue_id,score:70,reason:'부탁받은 기록을 다시 확인하려 해요'});
 }
 const ask=hooks.checkFor?.(id);if(ask&&actor.tired<65&&all.some(p=>p.id===ask.to))result.push({kind:'credit_check',target:ask.to,issue_id:ask.issue_id,score:actor.social*0.5+30+level(trait.fairness_sensitivity)*12-level(trait.risk_aversion)*6,reason:'기록을 확인해 달라고 부탁하려 해요'});
 const tell=hooks.deliveryFor?.(id);if(tell&&all.some(p=>p.id===tell.to))result.push({kind:'deliver',target:tell.to,issue_id:tell.issue_id,record_id:tell.record_id,score:65,reason:'고친 기록을 알려 주려 해요'});
 const seedOffset=[...(life.seed||'game1-auto-v06-seed-a')].reduce((s,c)=>s+c.charCodeAt(0),0)%11;
 result.forEach(c=>{if(c.place===actor.last_place)c.score-=18;c.score+=((seedOffset+life.tick+all.indexOf(pawn)*7+(c.place?.length||3))%11)-5;});
 // 카드 보정은 기본 점수(기질·욕구·관계·기존 변동 포함) 뒤에 더한다. 카드 없는 폰은 점수·순서·난수가 그대로
 const cards=pawn.cards?.active?pawn.cards.card_ids:null;
 if(cards?.length)for(const c of result){const d=cardDelta(cards,c.kind);c.base_score=c.score;c.card_delta=d;c.score+=d;}
 return result.sort((a,b)=>b.score-a.score||a.kind.localeCompare(b.kind));
}
export function advanceLife(state,relationship,hooks={}){
 const life=state.life,all=actorsFor(state),confirmed=[],ownIds=state.pawns.map(p=>p.id);if(life.paused)return confirmed;
 life.tick++;
 for(const [index,pawn]of all.entries())life.actors[pawn.id]??=actorState(index);
 const occupied=id=>all.filter(p=>p.id!==id&&roomOf(life.actors[p.id])===roomOf(life.actors[id])).map(p=>life.actors[p.id]);
 const mates=id=>all.filter(p=>roomOf(life.actors[p.id])===roomOf(life.actors[id])); // 같은 방 폰만 서로 보고 만난다
 const ownIn=id=>ownIds.filter(o=>life.actors[o]&&roomOf(life.actors[o])===roomOf(life.actors[id])); // 목격도 같은 방에서만
 function complete(actor,pawn){
  if(actor.mode==='working'){
   actor.activity=clamp(actor.activity-55);actor.tired=clamp(actor.tired+14);
   if(actor.partner){const partner=all.find(p=>p.id===actor.partner),other=life.actors[actor.partner];
    if(partner&&other?.mode==='assisting'&&other.partner===pawn.id&&distance(actor,other)<=1){confirmed.push({kind:'help',from:pawn.id,to:partner.id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence),reason:'수락한 도움을 작업대에서 끝냈어요',room:roomOf(actor),witnesses:[...new Set([...(actor.help_witnesses||[]),...witnessesAt(life,ownIn(pawn.id),pawn.id,partner.id)])]});other.mode='idle';other.goal=null;other.partner=null;other.cooldown=life.tick+8;other.activity=clamp(other.activity-25);log(life,partner.id,'함께 작업을 마쳤어요','completed',pawn.id);}
   }log(life,pawn.id,'작업을 마쳤어요','completed');
  }else if(actor.mode==='resting'){actor.tired=clamp(actor.tired-60);log(life,pawn.id,'푹 쉬었어요');}
  else if(actor.mode==='talking'){const target=all.find(p=>p.id===actor.partner),other=life.actors[actor.partner];
   if(target&&other?.mode==='listening'&&other.partner===pawn.id&&distance(actor,other)<=1){confirmed.push({kind:'talk',from:pawn.id,to:target.id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence),reason:'인사를 나누고 수락한 짧은 대화를 마쳤어요'});actor.social=clamp(actor.social-48);other.social=clamp(other.social-40);other.mode='idle';other.partner=null;other.cooldown=life.tick+10;log(life,pawn.id,'인사를 나누고 이야기를 나눴어요','completed',target.id);}
  }else if(actor.mode==='repairing'){const other=life.actors[actor.partner];if(other?.mode==='repairListening'&&other.partner===pawn.id&&distance(actor,other)<=1){confirmed.push({kind:'repair',from:actor.partner,to:pawn.id,conflict:actor.goal.conflict,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence),reason:'수락한 기록 확인과 보완 작업을 실제로 마쳤어요'});other.mode='idle';other.partner=null;other.cooldown=life.tick+10;log(life,pawn.id,'함께 남은 문제를 확인하고 보완했어요','completed',actor.partner);}}
  else if(actor.mode==='recording'){confirmed.push({kind:'record',from:pawn.id,help_id:actor.goal.help_id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence)});}
  else if(actor.mode==='reading'){for(const record_id of actor.goal.records||[])confirmed.push({kind:'read',from:pawn.id,record_id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence)});}
  else if(actor.mode==='correcting'){confirmed.push({kind:'correct',from:pawn.id,issue_id:actor.goal.issue_id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence)});}
  else if(actor.mode==='checking'){const other=life.actors[actor.partner];if(other?.partner===pawn.id){other.mode='idle';other.partner=null;other.cooldown=life.tick+5;}}
  delete actor.help_witnesses;
  actor.last_place=actor.goal?.place||null;actor.mode='idle';actor.goal=null;actor.partner=null;actor.cooldown=life.tick+5;
  // Release the activity tile; an idle pawn must not permanently occupy furniture.
  const V=roomView(life,roomOf(actor)),free=[{x:actor.x+1,y:actor.y},{x:actor.x,y:actor.y+1},{x:actor.x-1,y:actor.y},{x:actor.x,y:actor.y-1}].find(n=>n.x>=0&&n.x<12&&n.y>=0&&n.y<8&&!V.places.some(p=>cell(p)===cell(n))&&route(V,actor,n,occupied(pawn.id))?.length===1);
  if(free)Object.assign(actor,free);
 }
 for(const pawn of all){const a=life.actors[pawn.id],V=roomView(life,roomOf(a)),here=mates(pawn.id);a.tired=clamp(a.tired+.65);a.social=clamp(a.social+.8);a.activity=clamp(a.activity+.55);
  if(['listening','assisting','repairListening'].includes(a.mode)){if(!here.some(p=>p.id===a.partner)||life.tick>a.until+2){a.mode='idle';a.partner=null;a.reason='상대가 떠나 다른 일을 살펴봐요';}continue;}
  if(['working','resting','talking','repairing','waiting','recording','reading','correcting','checking'].includes(a.mode)){if(life.tick>=a.until)complete(a,pawn);continue;}
  if(a.mode==='moving'){
   if(life.tick-(a.started||0)>24||(a.tired>90&&a.goal.kind!=='rest')){a.mode='idle';a.goal=null;a.cooldown=life.tick+2;log(life,pawn.id,'이동 대신 휴식이나 다른 장소를 찾아요','cancelled');continue;}
   const g=a.goal,place=V.places.find(p=>p.id===g.place),target=here.find(p=>p.id===g.target);
   if((g.place&&(!place||place.blocked))||(g.target&&!target)){a.mode='idle';a.goal=null;a.cooldown=life.tick+6;log(life,pawn.id,'대상이 사라져 다른 일을 찾아요','cancelled');continue;}
   let destination=place;if(target){const t=life.actors[target.id],near=[{x:t.x-1,y:t.y},{x:t.x+1,y:t.y},{x:t.x,y:t.y-1},{x:t.x,y:t.y+1}];destination=near.filter(n=>n.x>=0&&n.x<12&&n.y>=0&&n.y<8).sort((x,y)=>distance(a,x)-distance(a,y)).find(n=>route(V,a,n,occupied(pawn.id))!==null);}
   const path=destination&&route(V,a,destination,occupied(pawn.id));
   if(!path){const taken=!!place&&occupied(pawn.id).some(o=>o.x===place.x&&o.y===place.y)&&route(V,a,destination,occupied(pawn.id).filter(o=>!(o.x===place.x&&o.y===place.y)))!==null;a.mode='idle';a.goal=null;a.cooldown=life.tick+(taken?5:9);a.reason=taken?'자리가 비기를 기다리며 다른 일을 찾아요':'경로가 막혀 다른 일을 찾아요';log(life,pawn.id,a.reason,taken?'occupied':'blocked');continue;}
   if(path.length){Object.assign(a,path[0]);continue;}
   if(target){const other=life.actors[target.id],r=relationship(target.id,pawn.id);
    if(g.kind==='credit_check'){const resp=checkResponse(other,target.trait.axis_values,r,roll(life.seed,life.tick,pawn.id,target.id,'check'),{tick:life.tick});const action_id='game1-auto-'+life.tick+'-'+(++life.sequence);confirmed.push({kind:'credit_check',from:pawn.id,to:target.id,issue_id:g.issue_id,accepted:resp.accepted,action_id});
     if(resp.accepted){a.mode='checking';a.partner=target.id;a.until=life.tick+4;other.mode='listening';other.partner=pawn.id;other.until=a.until;}else{a.mode='idle';a.goal=null;a.cooldown=life.tick+8;}continue;}
    if(g.kind==='deliver'){if(other.mode==='resting'||other.tired>=80){a.mode='idle';a.goal=null;a.cooldown=life.tick+12;a.reason='상대가 쉬고 있어 나중에 알려 줄게요';continue;}
     confirmed.push({kind:'deliver',from:pawn.id,to:target.id,record_id:g.record_id,issue_id:g.issue_id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence)});a.mode='waiting';a.until=life.tick+2;a.reason='고친 기록을 알려 줬어요';continue;}
    if(g.kind==='repair'&&r.repair_target?.conflict_id===g.conflict.conflict_id&&other.mode==='idle'&&other.tired<65&&r.trust>=280&&other.social>30){a.mode='repairing';a.partner=target.id;a.until=life.tick+6;other.mode='repairListening';other.partner=pawn.id;other.until=a.until;log(life,pawn.id,'상대가 구체적인 보완 제안을 수락했어요','accepted',target.id);continue;}
    if(g.kind==='assist'&&helpResponse(other,target.trait.axis_values,r,roll(life.seed,life.tick,pawn.id,target.id,'help'),{tick:life.tick}).accepted){a.mode='assisting';a.partner=target.id;a.until=other.until;other.partner=pawn.id;other.help_witnesses=witnessesAt(life,ownIn(pawn.id),target.id,pawn.id);log(life,pawn.id,'도움 제안을 상대가 수락했어요','accepted',target.id);continue;}
    const response=g.kind==='repair'?{accepted:false,reason:'지금은 보완 이야기를 할 준비가 아니에요'}:g.kind==='assist'?{accepted:false,reason:'지금 도움을 받기 어려워요'}:reaction(other,target.trait.axis_values,r,roll(life.seed,life.tick,pawn.id,target.id,'talk'));life.cooldowns[pawn.id+'-'+target.id]=life.tick+35;life.cooldowns[target.id+'-'+pawn.id]=life.tick+35;
    if(response.accepted){a.mode='talking';a.partner=target.id;a.until=life.tick+4;other.mode='listening';other.partner=pawn.id;other.until=a.until;a.reason='상대가 이야기를 수락했어요';log(life,pawn.id,a.reason,'accepted',target.id);}
    else{a.mode='idle';a.goal=null;a.cooldown=life.tick+7;a.reason=response.reason;log(life,pawn.id,response.reason+' · 관계 벌점 없음','declined',target.id);}continue;}
   if(g.kind==='record'){a.mode='recording';a.until=life.tick+4;a.reason='기록판에 결과를 적는 중';log(life,pawn.id,a.reason);continue;}
   if(g.kind==='read_board'){a.mode='reading';a.until=life.tick+2;a.reason='기록판을 읽는 중';continue;}
   if(g.kind==='correct_record'){a.mode='correcting';a.until=life.tick+3;a.reason='기록을 다시 확인하는 중';log(life,pawn.id,a.reason);continue;}
   if(place.kind==='rest'){a.mode='resting';a.until=life.tick+6;a.reason='쉼터에서 쉬는 중';}
   else if(place.kind==='work'){
    a.mode='working';a.until=life.tick+12;a.reason='작업대에서 만드는 중';
    for(const record_id of hooks.unreadFor?.(pawn.id)||[])confirmed.push({kind:'read',from:pawn.id,record_id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence)});
    const partner=here.find(p=>p.id!==pawn.id&&distance(a,life.actors[p.id])===1&&joinResponse(life.actors[p.id],p.trait.axis_values,relationship(p.id,pawn.id),roll(life.seed,life.tick,p.id,pawn.id,'join')).accepted);
    if(partner){const other=life.actors[partner.id];a.partner=partner.id;other.partner=pawn.id;other.mode='assisting';other.until=a.until;a.help_witnesses=witnessesAt(life,ownIn(pawn.id),pawn.id,partner.id);log(life,partner.id,'도움을 수락하고 함께 만들어요','accepted',pawn.id);}
   }else{a.mode='waiting';a.until=life.tick+3;a.reason='이야기 자리에서 주변을 살펴봐요';a.social=clamp(a.social-8);}
   log(life,pawn.id,a.reason);continue;
  }
  if(life.tick<a.cooldown)continue;
  const options=candidates(V,pawn.id,here,relationship,hooks),choice=options[0];if(choice){a.intent_id='game1-intent-'+life.tick+'-'+pawn.id;a.mode='moving';a.started=life.tick;a.goal=choice;a.reason=choice.reason;life.trace??=[];life.trace.push({tick:life.tick,seed:life.seed,definition_version:life.definition_version,intent_id:a.intent_id,actor:pawn.id,room:roomOf(a),position:{x:a.x,y:a.y},...(pawn.cards?.active?{cards:{card_ids:[...pawn.cards.card_ids],rule_version:pawn.cards.rule_version,profile_version:pawn.cards.profile_version}}:{}),candidates:structuredClone(options),chosen:structuredClone(choice)});life.trace=life.trace.slice(-80);log(life,pawn.id,choice.kind==='record'?'기록판에 결과를 적으러 가요':choice.kind==='read_board'?'작업대 기록판을 보러 가요':choice.kind==='correct_record'?'기록을 다시 확인하러 가요':choice.kind==='credit_check'?'기록 확인을 부탁하러 가요':choice.kind==='deliver'?'고친 기록을 알려 주러 가요':choice.kind==='repair'?'남은 문제를 보완하러 가요':choice.kind==='assist'?'도움을 제안하러 가요':choice.kind==='meet'?'다른 폰에게 다가가요':V.places.find(p=>p.id===choice.place).label+'로 가요','move',choice.target||null);}
 }
 // Only completed, mutually accepted interactions reach the event adapter.
 // 인사·대화(light_social)의 효과 자격은 store 가 방향별로 판정한다(PO-15). 여기서는 도움의 기존 시험 한도만 유지한다(minor_help 매핑 검수 전).
 for(const event of confirmed){if(event.kind==='repair'||event.kind==='talk'){event.limited=false;continue;}const pair=[event.from,event.to].sort().join('-')+'-'+event.kind;const usage=life.effects[pair]||{count:0,last:-100};
  if(usage.count>=3||life.tick-usage.last<60){event.limited=true;log(life,event.from,'이야기는 남지만 반복 관계 효과는 제한해요','limited',event.to);}
  else{life.effects[pair]={count:usage.count+1,last:life.tick};event.limited=false;}}
 return confirmed;
}
