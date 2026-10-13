// PO-HAND-005 §4-5: 제3자 기록 흐름의 단계별 실제 발생 집계(외주 산술 예상 대신 실측).
// 사용: node scripts/game1_credit_diagnostics.mjs [ticks=2000] [seeds=4]
// 도움 완료 → C 기록 → B 누락 → B 열람(인지) → 확인 요청 의사 → 확인 요청 → C 정정 → 전달/재열람 → EVT-09 → 실제 Conflict
import { createLocalStore, STORE_KEY } from '../prototype/store.js';
import { PRESETS } from '../prototype/core/game1-traits.js';

const TICKS = Number(process.argv[2] || 2000), SEEDS = Number(process.argv[3] || 4);
const art = { layers: { base: '', eyes_pair: '', mouth: '', back_hair: '', front_hair: '', frame_accessory: '' }, transforms: {} };
const disk = () => { const m = new Map(); return { getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v) }; };

function run(variant, seed, layout) {
  const storage = disk(); let s = createLocalStore(storage);
  [0, 1, 2].forEach(i => s.createPawn('cd-' + i, ['모래', '밤', '노을'][i], art, PRESETS[i].axis_values));
  const st = s.read(); st.life.seed = seed; st.credit.variant = variant;
  if (layout === 'compact') st.life.places = st.life.places.map(p => p.kind === 'work' ? { ...p, x: 6, y: 3 } : p.kind === 'social' ? { ...p, x: 7, y: 5 } : { ...p, x: 4, y: 4 });
  storage.setItem(STORE_KEY, JSON.stringify(st)); s = createLocalStore(storage); s.lifePause('cd-run', false);
  const seen = { helps: new Set(), records: new Set(), omitted: new Set(), read_omission: new Set(), intends: new Set(), requested: new Set(), corrected: new Set() };
  let checkRequests = 0, checkDeclined = 0, lastSeq = 0;
  for (let t = 1; t <= TICKS; t++) {
    s.lifeStep(t);
    const c = s.read().credit, logs = s.life().logs;
    for (const h of Object.values(c.helps)) seen.helps.add(h.help_id);
    for (const r of Object.values(c.records)) { seen.records.add(r.record_id); if (r.true_contributors.length > r.recorded.length || r.revision > 1) seen.omitted.add(r.record_id); if (r.correction_action_id) seen.corrected.add(r.record_id); }
    for (const i of Object.values(c.issues)) { seen.read_omission.add(i.issue_id); if (i.state !== 'observed') seen.intends.add(i.issue_id); if (i.requests.length) seen.requested.add(i.issue_id); }
    for (const l of logs) { const q = Number(String(l.id).split('-').pop()); if (q <= lastSeq) continue; lastSeq = q; if (l.text === '기록을 확인해 달라고 부탁했어요') checkRequests++; if (/기록 확인을 부탁했지만/.test(l.text)) checkDeclined++; }
  }
  const st2 = s.read();
  return {
    help_completed: seen.helps.size, records_written: seen.records.size, records_with_omission: seen.omitted.size,
    omission_read_by_B: seen.read_omission.size, B_chose_to_ask: seen.intends.size, check_requests_accepted: checkRequests, check_requests_pending: checkDeclined,
    corrections_published: seen.corrected.size, evt09: st2.events.filter(e => e.event.event_id === 'EVT-09').length,
    real_conflicts: st2.structures.conflicts.length, negative_events: st2.events.filter(e => ['EVT-07', 'EVT-08', 'EVT-10'].includes(e.event.event_id)).length,
  };
}
const out = { ticks: TICKS, seeds: SEEDS, note: '실측. 갈등(Conflict)은 정의 미결로 생성하지 않음(blocked).', runs: [] };
for (const variant of ['A', 'B']) for (const layout of ['default', 'compact']) for (let k = 0; k < SEEDS; k++) {
  const seed = 'credit-diag-' + k;
  out.runs.push({ variant, layout, seed, ...run(variant, seed, layout) });
}
const sum = (v, l) => out.runs.filter(r => r.variant === v && r.layout === l).reduce((a, r) => { for (const [k, n] of Object.entries(r)) if (typeof n === 'number') a[k] = (a[k] || 0) + n; return a; }, {});
out.totals = Object.fromEntries(['A', 'B'].flatMap(v => ['default', 'compact'].map(l => [v + '/' + l, sum(v, l)])));
console.log(JSON.stringify(out, null, 1));
