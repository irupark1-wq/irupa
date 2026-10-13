// Deterministic local simulation. Tick time is simulation time, never wall-clock replay.
export const GRID={width:12,height:8};
export const DEFAULT_PLACES=[
 {id:'game1-rest',kind:'rest',label:'포근한 쉼터',x:2,y:2,blocked:false},
 {id:'game1-work',kind:'work',label:'함께 만드는 작업대',x:9,y:2,blocked:false},
 {id:'game1-social',kind:'social',label:'이야기 자리',x:6,y:5,blocked:false},
];
export function initialLife(){return {schema:1,epoch:'game1-life-a1',seed:'game1-auto-v06-seed-a',definition_version:'game1-life-test-v06',tick:0,paused:false,host_access:true,owner_scopes:{activity_participation:true,light_auto_events:true,role_commitment:false,public_relation_declaration:false,major_transition:false},places:structuredClone(DEFAULT_PLACES),walls:[],actors:{},guest:null,logs:[],trace:[],cooldowns:{},effects:{},sequence:0};}
const cell=p=>p.x+','+p.y;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const clamp=n=>Math.max(0,Math.min(100,n));
const level=n=>n==='high'?1:n==='low'?-1:0;
export function actorState(index){return {x:3+index*2,y:6,tired:12+index*10,social:50+index*7,activity:55-index*8,mode:'idle',goal:null,until:0,cooldown:0,reason:'살펴보는 중',last_place:null};}
export function actorsFor(state){return [...state.pawns,...(state.life?.guest?.present&&state.life.guest.connected&&state.life.host_access&&state.life.owner_scopes.activity_participation&&state.life.owner_scopes.light_auto_events?[state.life.guest]:[])];}
export function validateLife(life){
 if(typeof life?.host_access!=='boolean'||!life.owner_scopes||['activity_participation','light_auto_events','role_commitment','public_relation_declaration','major_transition'].some(k=>typeof life.owner_scopes[k]!=='boolean')||typeof life.seed!=='string'||life.seed.length>128||!Array.isArray(life.trace)||life.trace.length>80||!Number.isSafeInteger(life.sequence)||life.sequence<0)throw Error('life.invalid_state');
 if(!life||life.schema!==1||life.epoch!=='game1-life-a1'||!Number.isSafeInteger(life.tick)||life.tick<0||typeof life.paused!=='boolean'||!Array.isArray(life.places)||life.places.length!==3||!Array.isArray(life.walls)||life.walls.length>30||!Array.isArray(life.logs)||life.logs.length>120)throw Error('life.invalid_state');
 const inside=p=>Number.isInteger(p.x)&&p.x>=0&&p.x<GRID.width&&Number.isInteger(p.y)&&p.y>=0&&p.y<GRID.height;
 if(life.places.some(p=>!inside(p)||typeof p.blocked!=='boolean')||new Set(life.places.map(cell)).size!==3||life.walls.some(p=>!inside(p))||Object.values(life.actors).some(a=>!inside(a)||['tired','social','activity'].some(k=>!Number.isFinite(a[k])||a[k]<0||a[k]>100)))throw Error('life.invalid_space');
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
export function reaction(actor,traits,relationship){
 if(actor.mode!=='idle')return {accepted:false,reason:'지금 하던 일을 마치고 싶어요'};
 if(actor.tired>=65)return {accepted:false,reason:'지금은 쉬고 싶어요'};
 if(relationship.conflict>=450||relationship.trust<220)return {accepted:false,reason:'조금 거리를 두고 싶어요'};
 if(actor.social<24&&traits.closeness_orientation!=='high')return {accepted:false,reason:'잠깐 혼자 있고 싶어요'};
 return {accepted:true,reason:'같이 잠깐 이야기해요'};
}
export function candidates(life,id,all,relationship){
 const actor=life.actors[id],pawn=all.find(p=>p.id===id),trait=pawn.trait.axis_values;
 const others=all.filter(p=>p.id!==id&&life.actors[p.id]&&life.tick>=(life.cooldowns[id+'-'+p.id]||0));
 const target=others.sort((a,b)=>distance(actor,life.actors[a.id])-distance(actor,life.actors[b.id])||a.id.localeCompare(b.id))[0];
 const result=life.places.filter(p=>!p.blocked).map(p=>({kind:p.kind,place:p.id,score:p.kind==='rest'?actor.tired*1.5+level(trait.risk_aversion)*6:p.kind==='work'?actor.activity+level(trait.fairness_sensitivity)*9:actor.social+level(trait.closeness_orientation)*22,reason:p.kind==='rest'?'피로를 풀고 싶어요':p.kind==='work'?'작업 욕구와 공정성 성향':'이야기 욕구와 친밀 성향'}));
 if(target){const r=relationship(id,target.id);result.push({kind:'meet',target:target.id,score:actor.social+level(trait.closeness_orientation)*30-level(trait.risk_aversion)*5+(r.trust-300)/12-r.conflict/12,reason:'욕구·성격·현재 관계를 보고 접근해요'});}
 for(const other of others){const r=relationship(other.id,id);if(r.repair_target&&actor.tired<60)result.push({kind:'repair',target:other.id,conflict:r.repair_target,score:actor.activity+actor.social/2+25+level(trait.fairness_sensitivity)*8-level(trait.risk_aversion)*5,reason:'남은 갈등의 구체적인 문제를 함께 보완하려 해요'});}
 const worker=others.find(p=>life.actors[p.id].mode==='working'&&!life.actors[p.id].partner);
 if(worker&&actor.tired<65)result.push({kind:'assist',target:worker.id,score:actor.activity+actor.social/2+level(trait.fairness_sensitivity)*12,reason:'작업 중인 폰에게 도움을 제안해요'});
 const seedOffset=[...(life.seed||'game1-auto-v06-seed-a')].reduce((s,c)=>s+c.charCodeAt(0),0)%11;
 result.forEach(c=>{if(c.place===actor.last_place)c.score-=18;c.score+=((seedOffset+life.tick+all.indexOf(pawn)*7+(c.place?.length||3))%11)-5;});
 return result.sort((a,b)=>b.score-a.score||a.kind.localeCompare(b.kind));
}
export function advanceLife(state,relationship){
 const life=state.life,all=actorsFor(state),confirmed=[];if(life.paused)return confirmed;
 life.tick++;
 for(const [index,pawn]of all.entries())life.actors[pawn.id]??=actorState(index);
 const occupied=id=>all.filter(p=>p.id!==id).map(p=>life.actors[p.id]);
 function complete(actor,pawn){
  if(actor.mode==='working'){
   actor.activity=clamp(actor.activity-55);actor.tired=clamp(actor.tired+14);
   if(actor.partner){const partner=all.find(p=>p.id===actor.partner),other=life.actors[actor.partner];
    if(partner&&other?.mode==='assisting'&&other.partner===pawn.id&&distance(actor,other)<=1){confirmed.push({kind:'help',from:pawn.id,to:partner.id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence),reason:'수락한 도움을 작업대에서 끝냈어요'});other.mode='idle';other.goal=null;other.partner=null;other.cooldown=life.tick+8;other.activity=clamp(other.activity-25);log(life,partner.id,'함께 작업을 마쳤어요','completed',pawn.id);}
   }log(life,pawn.id,'작업을 마쳤어요','completed');
  }else if(actor.mode==='resting'){actor.tired=clamp(actor.tired-60);log(life,pawn.id,'푹 쉬었어요');}
  else if(actor.mode==='talking'){const target=all.find(p=>p.id===actor.partner),other=life.actors[actor.partner];
   if(target&&other?.mode==='listening'&&other.partner===pawn.id&&distance(actor,other)<=1){confirmed.push({kind:'talk',from:pawn.id,to:target.id,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence),reason:'인사를 나누고 수락한 짧은 대화를 마쳤어요'});actor.social=clamp(actor.social-48);other.social=clamp(other.social-40);other.mode='idle';other.partner=null;other.cooldown=life.tick+10;log(life,pawn.id,'인사를 나누고 이야기를 나눴어요','completed',target.id);}
  }else if(actor.mode==='repairing'){const other=life.actors[actor.partner];if(other?.mode==='repairListening'&&other.partner===pawn.id&&distance(actor,other)<=1){confirmed.push({kind:'repair',from:actor.partner,to:pawn.id,conflict:actor.goal.conflict,action_id:'game1-auto-'+life.tick+'-'+(++life.sequence),reason:'수락한 기록 확인과 보완 작업을 실제로 마쳤어요'});other.mode='idle';other.partner=null;other.cooldown=life.tick+10;log(life,pawn.id,'함께 남은 문제를 확인하고 보완했어요','completed',actor.partner);}}
  actor.last_place=actor.goal?.place||null;actor.mode='idle';actor.goal=null;actor.partner=null;actor.cooldown=life.tick+5;
  // Release the activity tile; an idle pawn must not permanently occupy furniture.
  const free=[{x:actor.x+1,y:actor.y},{x:actor.x,y:actor.y+1},{x:actor.x-1,y:actor.y},{x:actor.x,y:actor.y-1}].find(n=>n.x>=0&&n.x<12&&n.y>=0&&n.y<8&&!life.places.some(p=>cell(p)===cell(n))&&route(life,actor,n,occupied(pawn.id))?.length===1);
  if(free)Object.assign(actor,free);
 }
 for(const pawn of all){const a=life.actors[pawn.id];a.tired=clamp(a.tired+.65);a.social=clamp(a.social+.8);a.activity=clamp(a.activity+.55);
  if(['listening','assisting','repairListening'].includes(a.mode)){if(!all.some(p=>p.id===a.partner)||life.tick>a.until+2){a.mode='idle';a.partner=null;a.reason='상대가 떠나 다른 일을 살펴봐요';}continue;}
  if(['working','resting','talking','repairing','waiting'].includes(a.mode)){if(life.tick>=a.until)complete(a,pawn);continue;}
  if(a.mode==='moving'){
   if(life.tick-(a.started||0)>24||(a.tired>90&&a.goal.kind!=='rest')){a.mode='idle';a.goal=null;a.cooldown=life.tick+2;log(life,pawn.id,'이동 대신 휴식이나 다른 장소를 찾아요','cancelled');continue;}
   const g=a.goal,place=life.places.find(p=>p.id===g.place),target=all.find(p=>p.id===g.target);
   if((g.place&&(!place||place.blocked))||(g.target&&!target)){a.mode='idle';a.goal=null;a.cooldown=life.tick+6;log(life,pawn.id,'대상이 사라져 다른 일을 찾아요','cancelled');continue;}
   let destination=place;if(target){const t=life.actors[target.id],near=[{x:t.x-1,y:t.y},{x:t.x+1,y:t.y},{x:t.x,y:t.y-1},{x:t.x,y:t.y+1}];destination=near.filter(n=>n.x>=0&&n.x<12&&n.y>=0&&n.y<8).sort((x,y)=>distance(a,x)-distance(a,y)).find(n=>route(life,a,n,occupied(pawn.id))!==null);}
   const path=destination&&route(life,a,destination,occupied(pawn.id));
   if(!path){a.mode='idle';a.goal=null;a.cooldown=life.tick+9;a.reason='경로가 막혀 다른 일을 찾아요';log(life,pawn.id,a.reason,'blocked');continue;}
   if(path.length){Object.assign(a,path[0]);continue;}
   if(target){const other=life.actors[target.id],r=relationship(target.id,pawn.id);
    if(g.kind==='repair'&&r.repair_target?.conflict_id===g.conflict.conflict_id&&other.mode==='idle'&&other.tired<65&&r.trust>=280&&other.social>30){a.mode='repairing';a.partner=target.id;a.until=life.tick+6;other.mode='repairListening';other.partner=pawn.id;other.until=a.until;log(life,pawn.id,'상대가 구체적인 보완 제안을 수락했어요','accepted',target.id);continue;}
    if(g.kind==='assist'&&other.mode==='working'&&!other.partner&&other.until-life.tick>=2&&r.trust>=220&&r.conflict<450&&other.tired<80){a.mode='assisting';a.partner=target.id;a.until=other.until;other.partner=pawn.id;log(life,pawn.id,'도움 제안을 상대가 수락했어요','accepted',target.id);continue;}
    const response=g.kind==='repair'?{accepted:false,reason:'지금은 보완 이야기를 할 준비가 아니에요'}:g.kind==='assist'?{accepted:false,reason:'지금 도움을 받기 어려워요'}:reaction(other,target.trait.axis_values,r);life.cooldowns[pawn.id+'-'+target.id]=life.tick+35;life.cooldowns[target.id+'-'+pawn.id]=life.tick+35;
    if(response.accepted){a.mode='talking';a.partner=target.id;a.until=life.tick+4;other.mode='listening';other.partner=pawn.id;other.until=a.until;a.reason='상대가 이야기를 수락했어요';log(life,pawn.id,a.reason,'accepted',target.id);}
    else{a.mode='idle';a.goal=null;a.cooldown=life.tick+7;a.reason=response.reason;log(life,pawn.id,response.reason+' · 관계 벌점 없음','declined',target.id);}continue;}
   if(place.kind==='rest'){a.mode='resting';a.until=life.tick+6;a.reason='쉼터에서 쉬는 중';}
   else if(place.kind==='work'){
    a.mode='working';a.until=life.tick+12;a.reason='작업대에서 만드는 중';
    const partner=all.find(p=>p.id!==pawn.id&&distance(a,life.actors[p.id])===1&&reaction(life.actors[p.id],p.trait.axis_values,relationship(p.id,pawn.id)).accepted);
    if(partner){const other=life.actors[partner.id];a.partner=partner.id;other.partner=pawn.id;other.mode='assisting';other.until=a.until;log(life,partner.id,'도움을 수락하고 함께 만들어요','accepted',pawn.id);}
   }else{a.mode='waiting';a.until=life.tick+3;a.reason='이야기 자리에서 주변을 살펴봐요';a.social=clamp(a.social-8);}
   log(life,pawn.id,a.reason);continue;
  }
  if(life.tick<a.cooldown)continue;
  const options=candidates(life,pawn.id,all,relationship),choice=options[0];if(choice){a.intent_id='game1-intent-'+life.tick+'-'+pawn.id;a.mode='moving';a.started=life.tick;a.goal=choice;a.reason=choice.reason;life.trace??=[];life.trace.push({tick:life.tick,seed:life.seed,definition_version:life.definition_version,intent_id:a.intent_id,actor:pawn.id,position:{x:a.x,y:a.y},candidates:structuredClone(options),chosen:structuredClone(choice)});life.trace=life.trace.slice(-80);log(life,pawn.id,choice.kind==='repair'?'남은 문제를 보완하러 가요':choice.kind==='assist'?'도움을 제안하러 가요':choice.kind==='meet'?'다른 폰에게 다가가요':life.places.find(p=>p.id===choice.place).label+'로 가요','move',choice.target||null);}
 }
 // Only completed, mutually accepted interactions reach the event adapter.
 for(const event of confirmed){if(event.kind==='repair'){event.limited=false;continue;}const pair=[event.from,event.to].sort().join('-')+'-'+event.kind;const usage=life.effects[pair]||{count:0,last:-100};
  if(usage.count>=3||life.tick-usage.last<60){event.limited=true;log(life,event.from,'이야기는 남지만 반복 관계 효과는 제한해요','limited',event.to);}
  else{life.effects[pair]={count:usage.count+1,last:life.tick};event.limited=false;}}
 return confirmed;
}
