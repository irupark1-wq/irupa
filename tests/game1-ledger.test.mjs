import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestLedger } from '../src/contracts/game1-ledger.ts';
import { snapshot, DEFAULT_AXES, PRESETS, AXES } from '../src/contracts/game1-traits.ts';
import { readFileSync } from 'node:fs';
const position = n => ({ authority_stream_id: 'game1-order-001', authority_order_id: n });
const known = { revision: 1, known: true, delay_reason: 'unconfirmed' };
const config = { checkpoint: { position: position(1), scores: { affection:500, trust:500, respect:500, reciprocity:500 } }, observer_id:'bam', target_id:'morae', scope_id:'order-001', repair_target:{ conflict_id:'credit-001',topic:'credit',scope_id:'order-001' } };
function event(kind,order=2,extra={}) { return { source_event_id:'source-'+order, observer_id:'bam',target_id:'morae',scope_id:'order-001', event_id:kind,position:position(order),trait_snapshot:snapshot(1,DEFAULT_AXES,position(1)),rule_version:'game1-rel-test-v041',seed:'seed-a',repeat_multiplier:1,evidence:{},...extra }; }
test('REL-NEXT-01 unseen event contributes zero in internal trace; public DTO pending', () => {
 const l=createTestLedger(config); l.append(event('EVT-07'),{...known,known:false});
 assert.deepEqual(l.project().scores,config.checkpoint.scores);
 assert.equal(l.project().trace[0].knowledge.known,false); // Internal trace; NOT a public memory DTO.
});
test('REL-NEXT-02/03 evidence-gated exact fairness and unaffected respect/trust', () => {
 ['low','medium','high'].forEach((level,i)=>{
  const l=createTestLedger(config), trait=snapshot(1,{...DEFAULT_AXES,fairness_sensitivity:level},position(1));
  l.append(event('EVT-09',2,{trait_snapshot:trait,evidence:{action_id:'correct',record_corrected:true,delivery_committed:true}}),known);
  assert.equal(l.project().scores.reciprocity,500+[14,18,22][i]); assert.equal(l.project().scores.respect,515);
  const m=createTestLedger(config);
  assert.throws(()=>m.append(event('EVT-10'),known),/monopoly_evidence/); assert.equal(m.project().trace.length,0);
  m.append(event('EVT-10',2,{trait_snapshot:trait,evidence:{monopoly_proven:true}}),known);
  assert.equal(m.project().scores.reciprocity,500+[-24,-30,-36][i]); assert.equal(m.project().scores.trust,475); assert.equal(m.project().scores.respect,485);
 });
});
test('REL-NEXT-04 knowledge replaces original slot, duplicates no-op, fixed snapshot persists', () => {
 const l=createTestLedger(config), e=event('EVT-07'); l.append(e,known);
 const revised={revision:2,known:true,delay_reason:'proven_concealment',reason_evidence_id:'conceal-proof-1'};
 assert.equal(l.revise(e.source_event_id,revised).status,'revised');
 assert.equal(l.project().scores.trust,468); assert.equal(l.project().trace.length,1);
 assert.equal(l.revise(e.source_event_id,revised).status,'duplicate'); assert.equal(l.append(e,known).status,'stale');
 assert.deepEqual(l.project().trace[0].trait_snapshot,e.trait_snapshot);
 assert.equal(l.project().reward_reexecutions,0); assert.equal(l.project().action_reexecutions,0);
 assert.throws(()=>l.revise(e.source_event_id,{...revised,known:false}),/payload_conflict/);
});
test('REL-NEXT-05 checkpoint clamp replay after revision and late arrival', () => {
 const l=createTestLedger({...config,checkpoint:{position:position(1),scores:{...config.checkpoint.scores,reciprocity:990}}});
 // Actual supported test events: +18 clips to1000, then -30 ->970.
 const credit=event('EVT-09',2,{evidence:{action_id:'correct',record_corrected:true,delivery_committed:true}});
 l.append(event('EVT-10',3,{evidence:{monopoly_proven:true}}),known); l.append(credit,known);
 assert.equal(l.project().scores.reciprocity,970);
 l.revise(credit.source_event_id,{...known,revision:2,known:false});
 assert.equal(l.project().scores.reciprocity,960); // Naive 970-18=952 is wrong.
 assert.deepEqual(l.project().trace.map(t=>t.position.authority_order_id),[2,3]);
});
test('REL-NEXT-06 independent EVT08 requires distinct action evidence', () => {
 const l=createTestLedger(config); l.append(event('EVT-07',2,{evidence:{action_id:'delay-action'}}),known);
 for(const evidence of [{},{action_id:'delay-action',independent_action:true}]) assert.throws(()=>l.append(event('EVT-08',3,{evidence}),known),/independent_action/);
 l.append(event('EVT-08',3,{evidence:{action_id:'conceal-action',independent_action:true}}),known);
 assert.equal(l.project().scores.trust,456);
});
test('REL-NEXT-07/08 distinct repair evidence and exact target; rejected append atomic', () => {
 const l=createTestLedger(config); l.append(event('EVT-09',2,{evidence:{action_id:'correct',record_corrected:true,delivery_committed:true}}),known);
 const evidence={action_id:'repair',conflict_id:'credit-001',topic:'credit',repair_scope_id:'order-001',repair_plan_id:'repair-plan-1',repair_executed:true,repair_accepted:true};
 const before=l.project();
 for(const change of [{action_id:'correct'},{repair_scope_id:'order-other'},{topic:'other'},{repair_accepted:false},{repair_plan_id:undefined}]) assert.throws(()=>l.append(event('EVT-12',3,{evidence:{...evidence,...change}}),known));
 assert.deepEqual(l.project(),before);
 assert.equal(l.append(event('EVT-12',3,{evidence}),known).status,'applied'); assert.equal(l.project().scores.trust,510);
});
test('correction_id idempotency and defensive copies', () => {
 const l=createTestLedger(config), e=event('EVT-07'); l.append(e,known); e.evidence.action_id='mutated';
 assert.equal(l.recordCorrection('correction-1','source-2','proof-1').status,'recorded');
 assert.equal(l.recordCorrection('correction-1','source-2','proof-1').status,'duplicate');
 assert.throws(()=>l.recordCorrection('correction-1','source-2','different'),/payload_conflict/);
 const projection=l.project(); projection.scores.trust=1; projection.trace[0].trait_snapshot.axis_values.fairness_sensitivity='high';
 assert.equal(l.project().scores.trust,488); assert.equal(l.project().trace[0].trait_snapshot.axis_values.fairness_sensitivity,'medium');
 assert.equal(l.project().correction_count,1);
});
test('authority and invalid knowledge/evidence fail without state mutation', () => {
 const l=createTestLedger(config);
 assert.throws(()=>l.append(event('EVT-07',2,{position:{authority_stream_id:'other',authority_order_id:2}}),known),/incomparable/);
 assert.throws(()=>l.append(event('EVT-07'),{...known,known:'false'}),/invalid_knowledge/);
 assert.throws(()=>l.append(event('EVT-10',2,{evidence:{monopoly_proven:'true'}}),known),/invalid_evidence/);
 assert.equal(l.project().trace.length,0);
});
test('design-v06 GetTraitOptions stable ordering, label keys and exact presets',()=>{
 const f=JSON.parse(readFileSync(new URL('../fixtures/game1-trait-options.json',import.meta.url),'utf8'));
 assert.equal(f.production_import_allowed,false); assert.deepEqual(f.axes.map(a=>a.axis_id),AXES);
 assert.deepEqual(f.presets.map(p=>({preset_id:p.preset_id,label:p.label,axis_values:p.axis_values})),PRESETS);
 assert.ok(f.axes.every(a=>a.description_key&&a.label_key));
});
test('REL-NEXT-04 serialized fixture expected scores and idempotent correction',()=>{
 const f=JSON.parse(readFileSync(new URL('../fixtures/game1-ledger-v041.json',import.meta.url),'utf8'));
 const l=createTestLedger(f.config);
 assert.deepEqual(l.append(f.event,f.initial_knowledge).projection.scores,f.expected.before_revision);
 assert.deepEqual(l.revise(f.event.source_event_id,f.revision).projection.scores,f.expected.after_revision);
 assert.equal(l.revise(f.event.source_event_id,f.revision).status,f.expected.duplicate_revision_status);
 l.recordCorrection(f.correction.correction_id,f.event.source_event_id,f.correction.evidence_id);
 assert.equal(l.recordCorrection(f.correction.correction_id,f.event.source_event_id,f.correction.evidence_id).status,'duplicate');
 assert.equal(l.project().correction_count,f.expected.correction_count);
 assert.equal(l.project().trace.length,f.expected.source_slots);
});
