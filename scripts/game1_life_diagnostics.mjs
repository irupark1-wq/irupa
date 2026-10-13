// PO-REQ-001 §2 개발 원인 점검: 실제 자율 생활을 돌려 후보→제안→수락/거절→완료→관계 변화 단계별 개수를 센다.
// 사용: node scripts/game1_life_diagnostics.mjs [ticks=2000] > out.json
// 출력은 개발 진단 자료다(플레이어 화면 아님). 같은 seed 에서 성격만 / 관계만 바꾼 비교를 함께 낸다.
import { createLocalStore, STORE_KEY } from '../prototype/store.js';
import { PRESETS } from '../prototype/core/game1-traits.js';

const TICKS = Number(process.argv[2] || 2000);
const art = { layers: { base: '', eyes_pair: '', mouth: '', back_hair: '', front_hair: '', frame_accessory: '' }, transforms: {} };
const disk = () => { const m = new Map(); return { getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v) }; };

function run(label, { axes = [0, 1, 2].map(i => PRESETS[i].axis_values), baseline = null, seed = null } = {}) {
  const storage = disk(); let s = createLocalStore(storage);
  axes.forEach((a, i) => s.createPawn('diag-' + i, ['모래', '밤', '노을'][i], art, a));
  if (baseline || seed) { // 시험 조건: 관계 초기값·seed 를 저장본에 넣고 다시 연다
    const st = s.read(), [A, B, C] = st.pawns.map(p => p.id);
    if (baseline) st.relation_baseline = baseline(A, B, C);
    if (seed) st.life.seed = seed;
    storage.setItem(STORE_KEY, JSON.stringify(st)); s = createLocalStore(storage); s.lifePause('diag-run', false);
  }
  const ids = s.read().pawns.map(p => p.id), name = id => s.read().pawns.find(p => p.id === id)?.name || id;
  const c = { moves: {}, accepted: 0, declined: {}, completed: {}, neutral: 0, blocked: 0, cancelled: 0, limited: 0, events: {}, negative_events: 0, conflicts_created: 0, per_pawn: {} };
  let lastSeq = 0;
  for (let t = 1; t <= TICKS; t++) {
    s.lifeStep(t);
    const life = s.life();
    for (const l of life.logs) {
      const seq = Number(String(l.id).split('-').pop()); if (seq <= lastSeq) continue; lastSeq = Math.max(lastSeq, seq);
      const who = name(l.actor); c.per_pawn[who] ??= { meet: 0, rest: 0, work: 0, social: 0, assist: 0, repair: 0, declined_by_others: 0 };
      if (l.kind === 'move') {
        const k = /다가가요/.test(l.text) ? 'meet' : /도움/.test(l.text) ? 'assist' : /보완/.test(l.text) ? 'repair' : /쉼터/.test(l.text) ? 'rest' : /작업대/.test(l.text) ? 'work' : 'social';
        c.moves[k] = (c.moves[k] || 0) + 1; c.per_pawn[who][k]++;
      } else if (l.kind === 'accepted') c.accepted++;
      else if (l.kind === 'declined') { const r = l.text.replace(' · 관계 벌점 없음', ''); c.declined[r] = (c.declined[r] || 0) + 1; }
      else if (l.kind === 'completed') { const k = /이야기/.test(l.text) ? 'talk' : /함께 작업/.test(l.text) ? 'help' : /작업/.test(l.text) ? 'work_alone' : /쉬/.test(l.text) ? 'rest' : /보완/.test(l.text) ? 'repair' : 'other'; c.completed[k] = (c.completed[k] || 0) + 1; }
      else if (l.kind === 'neutral') c.neutral++;
      else if (l.kind === 'blocked') c.blocked++;
      else if (l.kind === 'occupied') c.occupied = (c.occupied || 0) + 1;
      else if (l.kind === 'cancelled') c.cancelled++;
      else if (l.kind === 'limited') c.limited++;
    }
  }
  const st = s.read();
  for (const e of st.events) c.events[e.event.event_id] = (c.events[e.event.event_id] || 0) + 1;
  c.negative_events = st.events.filter(e => ['EVT-07', 'EVT-08', 'EVT-10'].includes(e.event.event_id)).length;
  c.conflicts_created = st.structures.conflicts.length;
  const rel = {}; for (const a of ids) for (const b of ids) if (a !== b) { const p = s.projection(a, b); rel[name(a) + '→' + name(b)] = { affection: p.scores.affection, trust: p.scores.trust, respect: p.scores.respect, conflict: p.scores.conflict, tags: p.tags.map(t => t.label) }; }
  return { label, ticks: TICKS, ...c, relations: rel };
}

const same = PRESETS[0].axis_values;
const out = {
  generated_at_ticks: TICKS,
  presets_used: [0, 1, 2].map(i => ({ id: PRESETS[i].preset_id, axes: PRESETS[i].axis_values })),
  general: run('일반 생활: 기본 프리셋 3명, 기본 seed'),
  general_seed_b: run('일반 생활: 같은 폰, 다른 seed', { seed: 'game1-auto-v06-seed-b' }),
  trait_only: {
    closeness_low: run('성격만 변경: 3명 모두 친밀 낮음', { axes: [0, 1, 2].map(() => ({ ...same, closeness_orientation: 'low' })) }),
    closeness_high: run('성격만 변경: 3명 모두 친밀 높음', { axes: [0, 1, 2].map(() => ({ ...same, closeness_orientation: 'high' })) }),
  },
  relation_only: {
    low_trust: run('관계만 변경: 서로 신뢰 150', { axes: [0, 1, 2].map(() => same), baseline: (A, B, C) => Object.fromEntries([[A, B], [B, A], [A, C], [C, A], [B, C], [C, B]].map(([x, y]) => [x + '->' + y, { trust: 150 }])) }),
    high_trust: run('관계만 변경: 서로 신뢰 700·애정 600', { axes: [0, 1, 2].map(() => same), baseline: (A, B, C) => Object.fromEntries([[A, B], [B, A], [A, C], [C, A], [B, C], [C, B]].map(([x, y]) => [x + '->' + y, { trust: 700, affection: 600 }])) }),
  },
};
console.log(JSON.stringify(out, null, 1));
