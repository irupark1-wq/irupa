// Local deterministic trial, costs are fixture points; no economy or server writes.
import { DEFAULT_AXES, validateAxes, fairnessContribution, snapshot } from './game1-traits.ts';
import { deriveAxes } from './game1-derived.ts';
import type { AxisValues } from './game1-traits.ts';
export const CHOICES = {
 C:{id:'correct_credit_publicly',round:1,time:1,material:0},D:{id:'finish_first_defer_resolution',round:1,time:0,material:0},V:{id:'verify_attribution_records',round:1,time:1,material:0},
 H:{id:'request_bam_help_with_consent',round:2,time:1,material:1},A:{id:'learn_alternate_method_from_noeul',round:2,time:2,material:1},R:{id:'redefine_accepted_roles',round:2,time:1,material:0},
 P:{id:'continue_partnership_by_agreement',round:3,time:1,material:0},S:{id:'separate_roles',round:3,time:1,material:0},E:{id:'end_partnership_with_handover',round:3,time:1,material:0},
} as const;
export type Choice = keyof typeof CHOICES;
const conditionNames=['participation','active','connected','record_available','correction_committed','delivery_committed','bam_knows','role_consent','help_completed','morae_knows','noeul_available','method_learned','role_change_accepted','major_transition_accepted','settlement_accepted'] as const;
export type Conditions=Record<typeof conditionNames[number],boolean>;
export const TEST_READY: Conditions=Object.fromEntries(conditionNames.map(k=>[k,true])) as Conditions;
const link=(difficulty:number)=>({id:'resource-001',from_pawn_id:'morae',to_pawn_id:'bam',active:true,importance_permille:800,contribution_permille:750,irreplaceability_permille:difficulty});
export function createWorkshopTrial(axes: AxisValues=DEFAULT_AXES, budget={work_time:5,material:3}) {
 const trait=validateAxes(axes);
 for(const v of Object.values(budget))if(!Number.isSafeInteger(v)||v<0||v>100)throw new Error('workshop.invalid_budget');
 const state={round:1, test_balance:{...budget}, status:'running',credit_corrected:false,knowledge_revision:0,progress:0,
  resource:link(900),accepted_role:'original',obligation:1,own_exited:false,settlement_pending:false,emotion_penalty:0,betrayal_memories:0,
  effects:[] as {event_id:string;observer_id:string;target_id:string;contribution:Record<string,number>}[]};
 const receipts=new Map<string,{payload:string;result:unknown}>();
 function project(){return {...structuredClone(state),unit:'fixture_points',dependence:deriveAxes({from_pawn_id:'morae',to_pawn_id:'bam'},{resources:[state.resource],roles:[],commitments:[],conflicts:[]}).dependence};}
 return {project,step(commandId:string,code:Choice,conditions:Conditions=TEST_READY){
  if(typeof commandId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(commandId)||!Object.hasOwn(CHOICES,code))throw new Error('workshop.invalid_command');
  for(const name of conditionNames)if(typeof conditions[name]!=='boolean')throw new Error('workshop.invalid_condition');
  const payload=code,previous=receipts.get(commandId);
  if(previous){if(previous.payload!==payload)throw new Error('workshop.command_conflict');return structuredClone(previous.result);}
  // Conditions are simulated authoritative state, not mutable command parameters.
  const result=(status:string,reason_key:string,actions:string[])=>({status,reason_key,allowed_actions:actions,projection:project()});
  if(code==='E') {const handoverConfirmed=state.status!=='completed'&&state.round===3&&conditions.connected&&conditions.settlement_accepted&&state.test_balance.work_time>=1;
   state.own_exited=true;state.status='completed';state.settlement_pending=!handoverConfirmed;state.round=4;
   if(handoverConfirmed)state.test_balance.work_time-=1;
   const receipt=result('exited',state.settlement_pending?'workshop.handover_pending':'workshop.exited',['workshop.view_record']);receipts.set(commandId,{payload,result:receipt});return structuredClone(receipt);}
  const option=CHOICES[code];
  if(state.status==='completed'||option.round!==state.round) return result('unavailable','workshop.wrong_phase',['workshop.view_record','workshop.exit']);
  if(!conditions.connected){state.status='paused';return result('paused','workshop.technical_pause',['workshop.reconnect','workshop.exit']);}
  if(!conditions.participation||!conditions.active)return result('unavailable','workshop.activity_unavailable',['workshop.stop','workshop.exit']);
  const fail=(reason:string,actions:string[])=>result('unavailable',reason,actions);
  if((code==='C'||code==='V')&&!conditions.record_available)return fail('workshop.record_unavailable',['workshop.defer','workshop.exit']);
  if(code==='C'&&(!conditions.correction_committed||!conditions.delivery_committed))return fail('workshop.delivery_unconfirmed',['workshop.verify_delivery','workshop.defer','workshop.exit']);
  if(code==='H'&&(!conditions.role_consent||!conditions.help_completed))return fail('workshop.help_unconfirmed',['workshop.learn_alternative','workshop.stop','workshop.exit']);
  if(code==='A'&&(!conditions.noeul_available||!conditions.method_learned))return fail('workshop.method_unavailable',['workshop.request_help','workshop.stop','workshop.exit']);
  if((code==='R'||code==='S')&&!conditions.role_change_accepted)return fail('workshop.role_change_unconfirmed',['workshop.keep_roles','workshop.exit']);
  if(code==='P'&&!conditions.major_transition_accepted)return fail('workshop.transition_unconfirmed',['workshop.stop','workshop.exit']);
  if(state.test_balance.work_time<option.time||state.test_balance.material<option.material)return fail('workshop.insufficient_test_points',['workshop.stop','workshop.exit']);
  state.status='running';state.test_balance.work_time-=option.time;state.test_balance.material-=option.material;
  if(code==='C'){state.credit_corrected=true;if(conditions.bam_knows)state.effects.push({event_id:'EVT-09',observer_id:'bam',target_id:'morae',contribution:{respect:15,reciprocity:fairnessContribution('EVT-09','reciprocity',18,snapshot(1,trait,{authority_stream_id:'game1-workshop-test',authority_order_id:1}),true)}});}
  if(code==='D')state.progress+=1;
  if(code==='V')state.knowledge_revision=1;
  if(code==='H'){if(conditions.morae_knows)state.effects.push({event_id:'EVT-04',observer_id:'morae',target_id:'bam',contribution:{affection:10,trust:6}});}
  if(code==='A')state.resource=link(400);
  if(code==='R') {state.accepted_role='redefined';state.obligation=700;}
  if(code==='S') {state.accepted_role='separated';state.obligation=1;}
  if(code==='P'||code==='S')state.status='completed';state.round+=1;
  const receipt=result('committed','workshop.step_committed',['workshop.continue','workshop.exit']);receipts.set(commandId,{payload,result:receipt});return structuredClone(receipt);
 }};
}
