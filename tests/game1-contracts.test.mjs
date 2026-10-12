import test from 'node:test';
import assert from 'node:assert/strict';
import { AXES, PRESETS, DEFAULT_AXES, allCombinations, validateAxes, presetMatches, parseScope, snapshot, comparePosition, roundRatio, fairnessContribution, replayEmotion } from '../src/contracts/game1-traits.ts';
import { readFileSync } from 'node:fs';

const position = n => ({ authority_stream_id: 'game1-authority-test', authority_order_id: n });
test('trait-dev:PERS-QA01 all 27 combinations and exact six presets', () => {
  assert.equal(new Set(allCombinations().map(a => JSON.stringify(a))).size, 27);
  const expected = [['high','medium','high'],['medium','high','low'],['high','low','medium'],['low','high','medium'],['medium','low','low'],['medium','medium','medium']];
  assert.equal(PRESETS.length, 6);
  PRESETS.forEach((p, i) => assert.deepEqual(AXES.map(a => p.axis_values[a]), expected[i]));
});
test('trait-dev:PERS-QA02 malformed, inherited, extra axes and levels rejected', () => {
  for (const value of [null, [], {}, { ...DEFAULT_AXES, risk_aversion: 1000 }, { ...DEFAULT_AXES, surprise: 'low' }, Object.create(DEFAULT_AXES)]) assert.throws(() => validateAxes(value));
  const input = { ...DEFAULT_AXES }; const saved = validateAxes(input); input.risk_aversion = 'high'; assert.equal(saved.risk_aversion, 'medium');
});
test('trait-ui:TR-UI-01 manual override never overwritten by preset label', () => {
  const axes = { ...PRESETS[0].axis_values, fairness_sensitivity: 'low' };
  assert.equal(presetMatches(PRESETS[0].preset_id, axes), false);
  assert.equal(validateAxes(axes).fairness_sensitivity, 'low');
});
test('consent:canonical wire strict and document-only aliases', () => {
  for (const [alias, canonical] of [['light_autonomous_events','light_auto_events'],['responsibility_acceptance','role_commitment'],['public_relationship_declaration','public_relation_declaration']]) {
    assert.throws(() => parseScope(alias)); assert.equal(parseScope(alias, true), canonical); assert.equal(parseScope(canonical), canonical);
  }
  for (const invalid of ['__proto__','constructor','all',null]) assert.throws(() => parseScope(invalid, true));
});
test('authority:distinct streams cannot be numerically ordered', () => {
  assert.equal(comparePosition(position(1), position(2)), -1);
  assert.throws(() => comparePosition(position(1), { authority_stream_id:'other', authority_order_id:100 }));
  assert.throws(() => snapshot(1, DEFAULT_AXES, position(0)));
});
test('trait-dev:PERS-QA04 snapshot persists old values after live profile changes', () => {
  const old = { ...DEFAULT_AXES, fairness_sensitivity:'low' };
  const fixed = snapshot(1, old, position(1)); old.fairness_sensitivity = 'high';
  assert.equal(fairnessContribution('EVT-09','reciprocity',18,fixed,true), 14);
  assert.equal(fairnessContribution('EVT-09','reciprocity',18,snapshot(2,old,position(2)),true), 22);
  assert.throws(() => { fixed.axis_values.fairness_sensitivity = 'high'; });
});
test('rel-v04:REL-V04-02 exact fairness, only EVT09/10 reciprocity', () => {
  ['low','medium','high'].forEach((level,i) => {
    const s = snapshot(1,{...DEFAULT_AXES,fairness_sensitivity:level},position(1));
    assert.equal(fairnessContribution('EVT-09','reciprocity',18,s,true),[14,18,22][i]);
    assert.equal(fairnessContribution('EVT-10','reciprocity',-30,s,true),[-24,-30,-36][i]);
    for(const [evt,axis,value] of [['EVT-09','respect',15],['EVT-10','trust',-25],['EVT-10','conflict',650],['EVT-12','reciprocity',18]]) assert.equal(fairnessContribution(evt,axis,value,s,true),value);
    assert.equal(fairnessContribution('EVT-10','reciprocity',-30,s,false),0);
  });
});
test('rounding:negative and positive ties away from zero, overflow rejected', () => {
  assert.equal(roundRatio(-5,1,2),-3); assert.equal(roundRatio(5,1,2),3);
  assert.throws(() => roundRatio(Number.MAX_SAFE_INTEGER,2,10));
});
test('domain:DEV-05 boundary replay differs from naive delta subtraction', () => {
  assert.equal(replayEmotion(990,[30,-20]),980); assert.equal(replayEmotion(990,[10,-20]),980);
  assert.equal(replayEmotion(10,[-30,20]),21); assert.equal(replayEmotion(10,[-10,20]),21);
  assert.throws(() => replayEmotion(0,[1]));
});
test('design:DEV-CHECK-03 three UI fixtures and no private or forecast scores', () => {
  const f = JSON.parse(readFileSync(new URL('../fixtures/game1-trait-ui.json',import.meta.url),'utf8'));
  assert.equal(f.fixture_only,true); assert.deepEqual(Object.keys(f.cases),['default','dirty_save','version_conflict']);
  assert.equal(f.cases.dirty_save.response.status,'applied'); assert.equal(f.cases.version_conflict.response.reason_key,'traits.version_conflict');
  assert.equal(f.cases.version_conflict.draft.axis_values.risk_aversion,'high');
  assert.equal(f.preview.forecast_scores,undefined); assert.equal(f.preview.target_profile,undefined);
  assert.equal(f.preview.example_only,true);
});
