import {snapshot,validateAxes,DEFAULT_AXES} from './core/game1-traits.js';
import {createTestLedger} from './core/game1-ledger.js';
import {deriveAxes,relationshipProjection} from './core/game1-derived.js';
import {evaluateBasicTags} from './core/game1-tags.js';
import {createWorkshopTrial,TEST_READY} from './core/game1-workshop.js';
export const STORE_KEY='game1-local-a-v1';
const initial=()=>({schema_version:1,version:0,authority:1,pawns:[],events:[],sessions:[],structures:{resources:[],roles:[],commitments:[],conflicts:[]},memories:[],tag_history:{},receipts:{}});
const position=n=>({authority_stream_id:'game1-local-authority',authority_order_id:n});
const base={affection:100,trust:300,respect:300,reciprocity:500};
const direction=(from,to)=>({from_pawn_id:from,to_pawn_id:to});
function ledger(state,from,to){
 const l=createTestLedger({observer_id:from,target_id:to,scope_id:'order-001',checkpoint:{position:position(1),scores:base},repair_target:{conflict_id:'credit-001',topic:'credit_attribution',scope_id:'order-001'}});
 for(const row of state.events.filter(e=>e.event.observer_id===from&&e.event.target_id===to))l.append(row.event,row.knowledge);
 return l;
}
function scores(state,from,to){return {...ledger(state,from,to).project().scores,...deriveAxes(direction(from,to),state.structures)};}
function context(state,from,to){const a=scores(state,from,to),b=scores(state,to,from);return {a,b,role:state.structures.roles.some(r=>r.active&&((r.from_pawn_id===from&&r.to_pawn_id===to)||(r.from_pawn_id===to&&r.to_pawn_id===from))),competition:false,major_betrayal:false,hostile:false,reverse_hostile:false,attachment:false,wound:false,repeat_reason:false,friend_history:false,related_conflict:a.conflict>1,blocked:false};}
function validateState(state){
 if(!state||state.schema_version!==1||!Number.isSafeInteger(state.version)||state.version<0||!Number.isSafeInteger(state.authority)||state.authority<1||!Array.isArray(state.pawns)||state.pawns.length>3||!Array.isArray(state.events)||state.events.length>500||!Array.isArray(state.sessions)||state.sessions.length>20||!state.receipts)throw Error('save.invalid_data');
 const seen=new Set();for(const p of state.pawns){if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(p.id)||seen.has(p.id)||typeof p.name!=='string'||p.name.length>20)throw Error('save.invalid_pawn');seen.add(p.id);validateAxes(p.trait.axis_values);
  for(const layer of Object.values(p.appearance.layers))if(typeof layer!=='string'||(layer!==''&&(!layer.startsWith('data:image/png;base64,')||layer.length>1500000)))throw Error('save.invalid_image');}
 for(const p of state.pawns)for(const other of state.pawns)if(p.id!==other.id)scores(state,p.id,other.id);
 return state;
}
export function createLocalStore(storage){
 const raw=storage.getItem(STORE_KEY);let state=raw?validateState(JSON.parse(raw)):initial();
 function commit(commandId,command,change,expected=state.version){
  if(typeof commandId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(commandId))throw Error('command.invalid_id');
  const fingerprint=JSON.stringify(command),old=state.receipts[commandId];if(old){if(old.fingerprint!==fingerprint)throw Error('command.payload_conflict');return structuredClone(old.result);}
  const onDisk=storage.getItem(STORE_KEY);if(expected!==state.version||(onDisk&&JSON.parse(onDisk).version!==state.version))throw Error('save.version_conflict');
  const next=structuredClone(state);const result=change(next);next.version++;next.receipts[commandId]={fingerprint,result};validateState(next);
  storage.setItem(STORE_KEY,JSON.stringify(next));state=next;return structuredClone(result);
 }
 function append(next,event_id,from,to,actionId,evidence={},knowledge={revision:1,known:true,delay_reason:'unconfirmed'}){
  const observer=next.pawns.find(p=>p.id===from);if(!observer)throw Error('event.observer_missing');
  const event={source_event_id:actionId+'-'+event_id,scope_id:'order-001',observer_id:from,target_id:to,event_id,position:position(++next.authority),trait_snapshot:structuredClone(observer.trait),rule_version:'game1-rel-test-v041',seed:'seed-a',repeat_multiplier:1,evidence:{action_id:actionId,...evidence}};
  const l=ledger(next,from,to);l.append(event,knowledge);next.events.push({event,knowledge});
  if(knowledge.known)next.memories.push({id:event.source_event_id,from,to,scope_id:'order-001',topic:event_id==='EVT-04'?'help':'credit_attribution',known:true,reason_known:false,resolution:'open'});
  return event;
 }
 return {
  read:()=>structuredClone(state),
  createPawn(commandId,name,appearance,axes,expected){return commit(commandId,{kind:'create',name,appearance,axes},next=>{
   if(next.pawns.length>=3)throw Error('pawn.limit');const id='pawn-'+commandId;const checked=validateAxes(axes);
   next.pawns.push({id,name:name.trim().slice(0,20)||['모래','밤','노을'][next.pawns.length],owner:'local-owner',appearance:structuredClone(appearance),appearance_version:1,trait:snapshot(1,checked,position(++next.authority))});return {status:'applied',pawn_id:id};
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
  projection(from,to,otherOwner=false){const internal=scores(state,from,to),c=context(state,from,to);const dto=relationshipProjection({requester_id:'local-owner',observer_owner_id:otherOwner?'another-owner':'local-owner',target_owner_id:'local-owner'},{scores:internal,basis_status:internal.basis_status,memories:state.memories.filter(m=>m.from===from&&m.to===to)});
   if(dto.visibility!=='restricted')dto.tags=evaluateBasicTags(state.tag_history[from+'->'+to]||[],c).tags.slice(0,3);return dto;
  },
 };
}
