// In-memory, single-stream test model. Not an API, persistent transaction or reward engine.
import { comparePosition, fairnessContribution, snapshot, TRAIT_SCHEMA_VERSION, validatePosition } from './game1-traits.ts';
import type { AuthorityPosition, TraitSnapshot } from './game1-traits.ts';
export const EMOTION_AXES = ['affection', 'trust', 'respect', 'reciprocity'] as const;
type EmotionAxis = typeof EMOTION_AXES[number];
export type Scores = Record<EmotionAxis, number>;
type EventKind = 'EVT-07' | 'EVT-08' | 'EVT-09' | 'EVT-10' | 'EVT-12';
export type TestEvent = {
  source_event_id: string; scope_id: string; observer_id: string; target_id: string;
  event_id: EventKind; position: AuthorityPosition; trait_snapshot: TraitSnapshot;
  rule_version: 'game1-rel-test-v041'; seed: string; repeat_multiplier: 1;
  evidence: { action_id?: string; independent_action?: boolean; monopoly_proven?: boolean;
    record_corrected?: boolean; delivery_committed?: boolean; conflict_id?: string; topic?: string;
    repair_scope_id?: string; repair_plan_id?: string; repair_executed?: boolean; repair_accepted?: boolean };
};
export type Knowledge = { revision: number; known: boolean; delay_reason: 'unconfirmed' | 'proven_concealment'; reason_evidence_id?: string };
type Slot = { event: TestEvent; knowledge: Knowledge };
function id(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('ledger.invalid_id');
}
function validateKnowledge(value: Knowledge): Knowledge {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.known !== 'boolean' || !['unconfirmed', 'proven_concealment'].includes(value.delay_reason)) throw new Error('ledger.invalid_knowledge');
  if (value.delay_reason === 'proven_concealment') id(value.reason_evidence_id as string);
  return { revision: value.revision, known: value.known, delay_reason: value.delay_reason, ...(value.reason_evidence_id === undefined ? {} : { reason_evidence_id: value.reason_evidence_id }) };
}
function copyEvent(input: TestEvent): TestEvent {
  const value = structuredClone(input);
  for (const key of ['source_event_id','scope_id','observer_id','target_id','seed'] as const) id(value[key]);
  if (value.observer_id === value.target_id || !['EVT-07','EVT-08','EVT-09','EVT-10','EVT-12'].includes(value.event_id) || value.rule_version !== 'game1-rel-test-v041' || value.repeat_multiplier !== 1) throw new Error('ledger.unsupported_event');
  value.position = validatePosition(value.position);
  if (value.trait_snapshot.schema_version !== TRAIT_SCHEMA_VERSION) throw new Error('ledger.unsupported_snapshot');
  value.trait_snapshot = snapshot(value.trait_snapshot.profile_version, value.trait_snapshot.axis_values, value.trait_snapshot.fixed_at);
  if (comparePosition(value.trait_snapshot.fixed_at, value.position) > 0) throw new Error('ledger.future_snapshot');
  if (!value.evidence || typeof value.evidence !== 'object' || Array.isArray(value.evidence)) throw new Error('ledger.invalid_evidence');
  for (const key of ['independent_action','monopoly_proven','record_corrected','delivery_committed','repair_executed','repair_accepted'] as const) {
    if (Object.hasOwn(value.evidence, key) && typeof value.evidence[key] !== 'boolean') throw new Error('ledger.invalid_evidence');
  }
  if (value.evidence.action_id !== undefined) id(value.evidence.action_id);
  return value;
}
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(fingerprint).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + fingerprint((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
function baseContribution(slot: Slot): Scores {
  const { event, knowledge } = slot;
  const result: Scores = { affection: 0, trust: 0, respect: 0, reciprocity: 0 };
  if (!knowledge.known) return result;
  if (event.event_id === 'EVT-07') {
    result.trust = knowledge.delay_reason === 'proven_concealment' ? -32 : -12;
    result.reciprocity = knowledge.delay_reason === 'proven_concealment' ? -18 : 0;
  } else if (event.event_id === 'EVT-08') { result.trust = -32; result.reciprocity = -18; }
  else if (event.event_id === 'EVT-09') { result.respect = 15; result.reciprocity = 18; }
  else if (event.event_id === 'EVT-10') { result.trust = -25; result.respect = -15; result.reciprocity = -30; }
  else { result.trust = 10; result.reciprocity = 18; }
  result.reciprocity = fairnessContribution(event.event_id, 'reciprocity', result.reciprocity, event.trait_snapshot, true);
  return result;
}
export function createTestLedger(input: {
  checkpoint: { position: AuthorityPosition; scores: Scores }; observer_id: string; target_id: string; scope_id: string;
  repair_target?: { conflict_id: string; topic: string; scope_id: string };
}) {
  const config = structuredClone(input);
  config.checkpoint.position = validatePosition(config.checkpoint.position);
  for (const key of ['observer_id','target_id','scope_id'] as const) id(config[key]);
  if (config.observer_id === config.target_id) throw new Error('ledger.invalid_direction');
  if (Object.keys(config.checkpoint.scores).length !== 4 || EMOTION_AXES.some(a => !Number.isSafeInteger(config.checkpoint.scores[a]) || config.checkpoint.scores[a] < 1 || config.checkpoint.scores[a] > 1000)) throw new Error('ledger.invalid_checkpoint');
  const slots = new Map<string, Slot>();
  const corrections = new Map<string, string>();
  function ordered(): Slot[] { return [...slots.values()].sort((a,b) => comparePosition(a.event.position,b.event.position)); }
  function project() {
    const scores = { ...config.checkpoint.scores };
    const trace = ordered().map(slot => {
      const before = { ...scores }, contribution = baseContribution(slot);
      for (const axis of EMOTION_AXES) scores[axis] = Math.max(1,Math.min(1000,scores[axis]+contribution[axis]));
      return { source_event_id: slot.event.source_event_id, event_id: slot.event.event_id,
        position: structuredClone(slot.event.position), knowledge: { ...slot.knowledge },
        trait_snapshot: structuredClone(slot.event.trait_snapshot), rule_version: slot.event.rule_version,
        seed: slot.event.seed, repeat_multiplier: slot.event.repeat_multiplier, before, contribution, after: { ...scores } };
    });
    return { direction: { observer_id: config.observer_id, target_id: config.target_id }, scope_id: config.scope_id,
      checkpoint: structuredClone(config.checkpoint), scores, trace, correction_count: corrections.size,
      reward_reexecutions: 0, action_reexecutions: 0, push_reexecutions: 0 };
  }
  return {
    append(inputEvent: TestEvent, inputKnowledge: Knowledge) {
      const event = copyEvent(inputEvent), knowledge = validateKnowledge(inputKnowledge);
      if (event.observer_id !== config.observer_id || event.target_id !== config.target_id || event.scope_id !== config.scope_id) throw new Error('ledger.wrong_direction_or_scope');
      if (comparePosition(event.position, config.checkpoint.position) <= 0) throw new Error('ledger.before_checkpoint');
      const existing = slots.get(event.source_event_id);
      if (existing) {
        if (fingerprint(existing.event) !== fingerprint(event)) throw new Error('ledger.source_payload_conflict');
        if (knowledge.revision < existing.knowledge.revision) return { status: 'stale', projection: project() };
        if (fingerprint(existing.knowledge) !== fingerprint(knowledge)) throw new Error('ledger.use_revision_command');
        return { status: 'duplicate', projection: project() };
      }
      if ([...slots.values()].some(s => comparePosition(s.event.position,event.position) === 0)) throw new Error('ledger.order_collision');
      const evidence = event.evidence;
      if (event.event_id === 'EVT-08' && (evidence.independent_action !== true || !evidence.action_id || [...slots.values()].some(s => s.event.evidence.action_id === evidence.action_id))) throw new Error('ledger.independent_action_required');
      if (event.event_id === 'EVT-10' && evidence.monopoly_proven !== true) throw new Error('ledger.monopoly_evidence_required');
      if (event.event_id === 'EVT-09' && (evidence.record_corrected !== true || evidence.delivery_committed !== true || !evidence.action_id)) throw new Error('ledger.correction_delivery_required');
      if (event.event_id === 'EVT-12') {
        const target = config.repair_target;
        if (!target || evidence.conflict_id !== target.conflict_id || evidence.topic !== target.topic || evidence.repair_scope_id !== target.scope_id || target.scope_id !== config.scope_id) throw new Error('ledger.repair_target_mismatch');
        if (!evidence.action_id || !evidence.repair_plan_id || evidence.repair_executed !== true || evidence.repair_accepted !== true) throw new Error('ledger.repair_evidence_required');
        id(evidence.repair_plan_id);
      }
      if (['EVT-09','EVT-12'].includes(event.event_id) && [...slots.values()].some(s => ['EVT-09','EVT-12'].includes(s.event.event_id) && s.event.evidence.action_id === evidence.action_id)) throw new Error('ledger.action_already_rewarded');
      slots.set(event.source_event_id,{ event, knowledge });
      return { status: 'applied', projection: project() };
    },
    revise(sourceId: string, inputKnowledge: Knowledge) {
      const knowledge = validateKnowledge(inputKnowledge), slot = slots.get(sourceId);
      if (!slot) throw new Error('ledger.source_not_found');
      if (knowledge.revision < slot.knowledge.revision) return { status: 'stale', projection: project() };
      if (knowledge.revision === slot.knowledge.revision) {
        if (fingerprint(knowledge) !== fingerprint(slot.knowledge)) throw new Error('ledger.revision_payload_conflict');
        return { status: 'duplicate', projection: project() };
      }
      if (knowledge.revision !== slot.knowledge.revision + 1) throw new Error('ledger.revision_gap');
      slot.knowledge = knowledge;
      return { status: 'revised', projection: project() };
    },
    recordCorrection(correctionId: string, sourceId: string, evidenceId: string) {
      id(correctionId); id(evidenceId);
      if (!slots.has(sourceId)) throw new Error('ledger.source_not_found');
      const payload = fingerprint({ sourceId, evidenceId }), existing = corrections.get(correctionId);
      if (existing !== undefined && existing !== payload) throw new Error('ledger.correction_payload_conflict');
      corrections.set(correctionId,payload);
      return { status: existing === undefined ? 'recorded' : 'duplicate', projection: project() };
    },
    project,
  };
}
