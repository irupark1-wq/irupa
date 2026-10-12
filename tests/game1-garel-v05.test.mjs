import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveAxes,relationshipProjection} from '../src/contracts/game1-derived.ts';
import {createWorkshopTrial,CHOICES,TEST_READY} from '../src/contracts/game1-workshop.ts';
import {DEFAULT_AXES} from '../src/contracts/game1-traits.ts';
const direction={from_pawn_id:'morae',to_pawn_id:'bam'};
const empty=()=>({resources:[],roles:[],commitments:[],conflicts:[]});
test('trait-rel:GAREL-07/08/09 derived axes from independent evidence, integer ratios',()=>{
 const input=empty(); input.resources=[{...direction,id:'link',active:true,importance_permille:800,contribution_permille:750,irreplaceability_permille:900}];
 assert.equal(deriveAxes(direction,input).dependence,540);input.resources[0].irreplaceability_permille=400;assert.equal(deriveAxes(direction,input).dependence,241);
 assert.deepEqual(deriveAxes(direction,empty()),{dependence:1,power:500,obligation:1,conflict:1,basis_status:'no_active_basis'});
 input.roles=[{...direction,id:'role',active:true,importance_permille:1000,share_permille:600}];
 input.commitments=[{...direction,id:'promise',active:true,accepted:false,burden:700}];
 input.conflicts=[{...direction,id:'issue',active:true,scope_id:'order-001',topic:'credit',severity:650}];
 assert.equal(deriveAxes(direction,input).power,600);assert.equal(deriveAxes(direction,input).obligation,1);
 input.commitments[0].accepted=true;assert.equal(deriveAxes(direction,input).obligation,700);
 input.commitments[0].active=false;input.roles[0].active=false;assert.equal(deriveAxes(direction,input).obligation,1);assert.equal(deriveAxes(direction,input).basis_status,'no_active_basis');
 assert.equal(deriveAxes(direction,input).conflict,650);
 assert.equal(deriveAxes({from_pawn_id:'bam',to_pawn_id:'morae'},input).conflict,1);
});
test('structural validation, multi-link clamp and weighted roles',()=>{
 const input=empty();input.resources=[1,2].map(n=>({...direction,id:'link-'+n,active:true,importance_permille:1000,contribution_permille:1000,irreplaceability_permille:1000}));
 assert.equal(deriveAxes(direction,input).dependence,1000);
 input.roles=[{...direction,id:'role-a',active:true,importance_permille:1000,share_permille:600},{...direction,id:'role-b',active:true,importance_permille:500,share_permille:200}];
 assert.equal(deriveAxes(direction,input).power,467);
 input.resources[0].importance_permille=1001;assert.throws(()=>deriveAxes(direction,input));
});
test('trait-rel:GAREL-13 restricted projection identical for absent/present secrets, allowlist for own direction',()=>{
 const denied={requester_id:'user-a',observer_owner_id:'user-b',target_owner_id:'user-a'};
 const hidden={scores:{private_score:123},basis_status:'blocked_secret',memories:[{id:'secret',private_text:'hidden'}],personality:'secret',tags:['secret']};
 assert.deepEqual(relationshipProjection(denied,hidden),relationshipProjection(denied,null));
 const scores={affection:100,trust:300,respect:300,reciprocity:500,dependence:1,power:500,obligation:1,conflict:1,hidden:123};
 const internal={scores,basis_status:'no_active_basis',memories:[{id:'memory-1',known:true,reason_known:false,resolution:'open',private_text:'hidden'},{id:'unknown',known:false,reason_known:true,resolution:'open'}],tags:['private']};
 const own=relationshipProjection({requester_id:'user-a',observer_owner_id:'user-a',target_owner_id:'user-b'},internal);
 assert.deepEqual(own.allowed_actions,[]);assert.equal(own.memories.length,1);assert.equal(own.memories[0].private_text,undefined);assert.equal(own.scores.hidden,undefined);assert.equal(own.tags,undefined);
 assert.deepEqual(relationshipProjection({requester_id:'user-a',observer_owner_id:'user-a',target_owner_id:'user-a'},internal).allowed_actions,['relationship.view_reverse']);
});
const fixture=JSON.parse(readFileSync(new URL('../fixtures/game1-workshop-design-v05.json',import.meta.url),'utf8'));
assert.equal(fixture.runtime_import_ready,false);
for(const path of fixture.nominal_paths){
 test('trait-rel:'+path.id+' basic profile nominal cost, direction, evidence and ending',()=>{
  const trial=createWorkshopTrial();const codes=path.selection_code.split('-');
  assert.deepEqual(codes.map(c=>CHOICES[c].id),path.choices);
  codes.forEach((code,i)=>assert.ok(['committed','exited'].includes(trial.step('command-'+i,code).status)));
  const actual=trial.project();
  assert.deepEqual(actual.test_balance,{work_time:5-path.nominal_cost_fixture_points.work_time,material:3-path.nominal_cost_fixture_points.material});
  assert.equal(actual.status,'completed');assert.equal(actual.emotion_penalty,0);assert.equal(actual.betrayal_memories,0);
  assert.equal(actual.credit_corrected,codes[0]==='C');assert.equal(actual.dependence,codes[1]==='A'?241:540);
  assert.equal(actual.effects.some(e=>e.event_id==='EVT-09'),codes[0]==='C');assert.equal(actual.effects.some(e=>e.event_id==='EVT-04'),codes[1]==='H');
  assert.equal(actual.effects.some(e=>['EVT-10','EVT-12'].includes(e.event_id)),false);
  assert.equal(actual.own_exited,codes[2]==='E');
 });
}
test('trait-rel:GAREL-NEG-01/02/03/04/08 rejected preconditions have safe fallbacks and no charge',()=>{
 for(const [code,changes,prior] of [['C',{delivery_committed:false},null],['H',{role_consent:false},'D'],['A',{method_learned:false},'D'],['R',{role_change_accepted:false},'D'],['C',{connected:false},null]]){
  const t=createWorkshopTrial();if(prior)t.step('prior',prior);const before=t.project();
  const r=t.step('proposal',code,{...TEST_READY,...changes});assert.ok(['unavailable','paused'].includes(r.status));assert.ok(r.allowed_actions.includes('workshop.exit'));
  assert.deepEqual(t.project().test_balance,before.test_balance);assert.deepEqual(t.project().effects,before.effects);assert.equal(t.project().accepted_role,before.accepted_role);assert.equal(t.project().emotion_penalty,0);
 }
});
test('trait-rel:GAREL-NEG-05/06/07 own exit immediate, deferral no monopoly, command replay receipt',()=>{
 const t=createWorkshopTrial();t.step('defer','D');const receipt=t.step('help','H');const before=t.project();
 assert.deepEqual(t.step('help','H',{...TEST_READY,role_consent:false}),receipt);assert.deepEqual(t.project(),before);
 assert.throws(()=>t.step('help','A'),/command_conflict/);
 const exit=t.step('exit','E',{...TEST_READY,settlement_accepted:false,connected:false});
 assert.equal(exit.status,'exited');assert.equal(exit.projection.own_exited,true);assert.equal(exit.projection.settlement_pending,true);assert.equal(exit.projection.accepted_role,'original');
 assert.equal(exit.projection.effects.some(e=>e.event_id==='EVT-10'),false);assert.equal(exit.projection.emotion_penalty,0);
});
test('workshop missing consent/awareness/budget never invents effects; exit independent of budget',()=>{
 const t=createWorkshopTrial();t.step('correct','C',{...TEST_READY,bam_knows:false});t.step('help','H',{...TEST_READY,morae_knows:false});assert.deepEqual(t.project().effects,[]);assert.equal(t.project().obligation,1);
 assert.equal(t.step('continue','P',{...TEST_READY,major_transition_accepted:false}).status,'unavailable');
 const low=createWorkshopTrial(DEFAULT_AXES,{work_time:0,material:0});assert.equal(low.step('correct','C').reason_key,'workshop.insufficient_test_points');assert.equal(low.step('exit','E').status,'exited');
});
for(const axis of ['fairness_sensitivity','closeness_orientation','risk_aversion'])for(const level of ['low','high'])test('trait-rel:GAREL-CROSS-'+axis+'-'+level,()=>{
 const t=createWorkshopTrial({...DEFAULT_AXES,[axis]:level});t.step('correct','C');t.step('learn','A');t.step('continue','P');
 assert.equal(t.project().effects[0].contribution.reciprocity,axis==='fairness_sensitivity'?(level==='low'?14:22):18);
 assert.equal(t.project().dependence,241); // Qualitative preference weights remain undefined.
});
