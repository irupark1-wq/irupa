// Local A prototype only. No authentication, network writes or database adapter.
export const TRAIT_SCHEMA_VERSION = 'game1-traits-a1';
export const AXES = Object.freeze(['fairness_sensitivity', 'closeness_orientation', 'risk_aversion'] as const);
export const LEVELS = Object.freeze(['low', 'medium', 'high'] as const);
export type Axis = typeof AXES[number];
export type Level = typeof LEVELS[number];
export type AxisValues = Readonly<Record<Axis, Level>>;
export const DEFAULT_AXES: AxisValues = Object.freeze({ fairness_sensitivity: 'medium', closeness_orientation: 'medium', risk_aversion: 'medium' });
export const PRESETS = Object.freeze([
  { id: 'cautious_mediator', label: '신중한 조율자', values: ['high', 'medium', 'high'] },
  { id: 'warm_explorer', label: '다정한 탐험가', values: ['medium', 'high', 'low'] },
  { id: 'quiet_crafter', label: '조용한 공방인', values: ['high', 'low', 'medium'] },
  { id: 'relaxed_neighbor', label: '느긋한 이웃', values: ['low', 'high', 'medium'] },
  { id: 'independent_pioneer', label: '독립적인 개척자', values: ['medium', 'low', 'low'] },
  { id: 'balanced', label: '균형형', values: ['medium', 'medium', 'medium'] },
].map(p => Object.freeze({ preset_id: p.id, label: p.label, axis_values: Object.freeze(Object.fromEntries(AXES.map((a, i) => [a, p.values[i]]))) as AxisValues })));

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
export function validateAxes(value: unknown): AxisValues {
  if (!plainObject(value) || Object.keys(value).length !== AXES.length || Object.keys(value).some(k => !AXES.includes(k as Axis))) throw new Error('traits.invalid_axes');
  for (const axis of AXES) if (!Object.hasOwn(value, axis) || !LEVELS.includes(value[axis] as Level)) throw new Error('traits.invalid_level');
  return Object.freeze(Object.fromEntries(AXES.map(a => [a, value[a]]))) as AxisValues;
}
export function allCombinations(): AxisValues[] {
  return LEVELS.flatMap(f => LEVELS.flatMap(c => LEVELS.map(r => validateAxes({ fairness_sensitivity: f, closeness_orientation: c, risk_aversion: r }))));
}
export function presetMatches(id: string | null, axes: AxisValues): boolean {
  const checked = validateAxes(axes);
  if (id === null) return false;
  const preset = PRESETS.find(p => p.preset_id === id);
  return !!preset && AXES.every(a => preset.axis_values[a] === checked[a]);
}
export const SCOPES = Object.freeze(['activity_participation', 'light_auto_events', 'role_commitment', 'public_relation_declaration', 'major_transition'] as const);
export type ConsentScope = typeof SCOPES[number];
const ALIASES: Readonly<Record<string, ConsentScope>> = Object.freeze({ light_autonomous_events: 'light_auto_events', responsibility_acceptance: 'role_commitment', public_relationship_declaration: 'public_relation_declaration' });
// Aliases are accepted ONLY in explicit document-import adapters, never wire APIs.
export function parseScope(value: unknown, documentImport = false): ConsentScope {
  if (typeof value !== 'string') throw new Error('consent.invalid_scope');
  if (SCOPES.includes(value as ConsentScope)) return value as ConsentScope;
  if (documentImport && Object.hasOwn(ALIASES, value)) return ALIASES[value];
  throw new Error('consent.invalid_scope');
}
export type AuthorityPosition = Readonly<{ authority_stream_id: string; authority_order_id: number }>;
export function validatePosition(value: AuthorityPosition): AuthorityPosition {
  if (!value || typeof value.authority_stream_id !== 'string' || !value.authority_stream_id.trim() || !Number.isSafeInteger(value.authority_order_id) || value.authority_order_id < 1) throw new Error('authority.invalid_position');
  return Object.freeze({ authority_stream_id: value.authority_stream_id, authority_order_id: value.authority_order_id });
}
export function comparePosition(a: AuthorityPosition, b: AuthorityPosition): number {
  const x = validatePosition(a), y = validatePosition(b);
  if (x.authority_stream_id !== y.authority_stream_id) throw new Error('authority.incomparable_streams');
  return Math.sign(x.authority_order_id - y.authority_order_id);
}
export type TraitSnapshot = Readonly<{ schema_version: string; profile_version: number; axis_values: AxisValues; fixed_at: AuthorityPosition }>;
export function snapshot(profileVersion: number, axes: unknown, position: AuthorityPosition): TraitSnapshot {
  if (!Number.isSafeInteger(profileVersion) || profileVersion < 1) throw new Error('traits.invalid_version');
  return Object.freeze({ schema_version: TRAIT_SCHEMA_VERSION, profile_version: profileVersion, axis_values: validateAxes(axes), fixed_at: validatePosition(position) });
}
// Exact rational multiplier, half away from zero. Reject unsafe arithmetic.
export function roundRatio(value: number, numerator: number, denominator: number): number {
  if (![value, numerator, denominator].every(Number.isSafeInteger) || numerator < 0 || denominator < 1 || !Number.isSafeInteger(value * numerator)) throw new Error('effect.invalid_arithmetic');
  const product = value * numerator;
  const magnitude = Math.abs(product);
  const rounded = Math.floor(magnitude / denominator) + (magnitude % denominator >= denominator / 2 ? 1 : 0);
  return product < 0 ? -rounded : rounded;
}
export function fairnessContribution(eventId: string, axis: string, base: number, trait: TraitSnapshot, known: boolean): number {
  if (typeof known !== 'boolean' || !Number.isSafeInteger(base)) throw new Error('effect.invalid_input');
  const axes = validateAxes(trait.axis_values);
  if (!known) return 0;
  if (axis !== 'reciprocity' || !['EVT-09', 'EVT-10'].includes(eventId)) return base;
  return roundRatio(base, { low: 8, medium: 10, high: 12 }[axes.fairness_sensitivity], 10);
}
export function replayEmotion(initial: number, contributions: readonly number[]): number {
  if (!Number.isSafeInteger(initial) || initial < 1 || initial > 1000) throw new Error('effect.invalid_score');
  return contributions.reduce((score, delta) => {
    if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(score + delta)) throw new Error('effect.invalid_delta');
    return Math.min(1000, Math.max(1, score + delta));
  }, initial);
}
