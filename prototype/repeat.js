// A2 기반(PO-15 §2): 반복 효과 자격. 화면·저장과 분리된 순수 함수.
// 접근·상대 반응·완료는 여기서 판단하지 않는다. "완료된 사건이 관계 효과를 받을 자격이 있는가"만 판정한다.

/** 게임 Day: 1 tick = 게임 1분, 시작 08:00. day_index 0 = 화면의 Day 1. 화면 시계와 같은 식(PO-15 §2). */
export const dayIndex = (tick) => Math.floor((480 + tick) / 1440);

/** A2 시험값(출시값 아님). rule_version 은 사건 기록에 남겨 나중에 값이 바뀌어도 당시 판정을 재현할 수 있게 한다. */
export const LIGHT_SOCIAL = Object.freeze({
  family: "light_social",
  per_day: 3, // 방향당 Day 별 자격 3회
  min_interval: 60, // 마지막 자격 부여 tick 부터 최소 간격(Day 를 넘어 유지)
  approach_retry: 35, // 접근 재시도 간격(life.js 의 쌍 쿨다운, 상대 반응 tick 기준) — 자격과 별개
  rule_version: "game1-repeat-a2-test-v1",
});

/** 방향별 bucket 키: observer → target, 안정 scope, family. Day 는 bucket 안에 저장(가구 위치와 무관). */
export const bucketKey = (observer, target, scope, family = LIGHT_SOCIAL.family) => observer + ">" + target + "|" + scope + "|" + family;

export function emptyRepeat() {
  return { schema: 1, rule_version: LIGHT_SOCIAL.rule_version, buckets: {} };
}

/** 자격 판정만 한다(상태 불변). 이유: null(허용) | 'min_interval' | 'daily_cap' */
export function judge(repeat, { observer, target, scope, tick, family = LIGHT_SOCIAL.family }) {
  const day = dayIndex(tick),
    b = repeat.buckets[bucketKey(observer, target, scope, family)],
    count = b && b.day === day ? b.count : 0,
    since = b && Number.isSafeInteger(b.last_grant_tick) ? tick - b.last_grant_tick : null;
  let reason = null;
  if (since !== null && since < LIGHT_SOCIAL.min_interval) reason = "min_interval";
  else if (count >= LIGHT_SOCIAL.per_day) reason = "daily_cap";
  return { eligible: reason === null, reason, day, count_before: count, since_last_grant: since, family, rule_version: LIGHT_SOCIAL.rule_version };
}

/** 자격을 부여하고 bucket 을 갱신한다. judge 결과가 eligible 일 때만 부른다. 부여 순번(1..per_day)을 돌려준다. */
export function grant(repeat, { observer, target, scope, tick, family = LIGHT_SOCIAL.family }) {
  const key = bucketKey(observer, target, scope, family),
    day = dayIndex(tick),
    b = repeat.buckets[key];
  const count = (b && b.day === day ? b.count : 0) + 1;
  repeat.buckets[key] = { day, count, last_grant_tick: tick };
  return count;
}

export function validateRepeat(repeat) {
  if (!repeat || repeat.schema !== 1 || typeof repeat.buckets !== "object" || Array.isArray(repeat.buckets)) throw Error("life.invalid_repeat");
  const keys = Object.keys(repeat.buckets);
  if (keys.length > 200) throw Error("life.invalid_repeat");
  for (const k of keys) {
    const b = repeat.buckets[k];
    if (typeof k !== "string" || k.length > 300 || !Number.isSafeInteger(b?.day) || b.day < 0 || !Number.isSafeInteger(b.count) || b.count < 0 || b.count > LIGHT_SOCIAL.per_day || !Number.isSafeInteger(b.last_grant_tick)) throw Error("life.invalid_repeat");
  }
  return repeat;
}

/**
 * 이전 저장본 이전: 옛 life.effects 의 '정렬된 쌍-talk' 누적 기록을 방향별 bucket 으로 옮긴다.
 * 효과를 다시 주는 근거가 되지 않도록 보수적으로: 마지막 부여 tick 을 유지하고, 그 Day 의 횟수는 min(누적, 3).
 * (누적 ≥ 그날 횟수이므로 그날 자격을 더 주는 일은 없다.) 옮긴 키는 지운다.
 */
export function migrateLegacyTalk(life) {
  life.repeat ??= emptyRepeat();
  for (const [key, usage] of Object.entries(life.effects || {})) {
    if (!key.endsWith("-talk") || !Number.isSafeInteger(usage?.last) || usage.last < 0) continue;
    const ids = key.slice(0, -5),
      actorIds = Object.keys(life.actors || {});
    let pair = null;
    for (const x of actorIds) for (const y of actorIds) if (x < y && [x, y].sort().join("-") === ids) pair = [x, y];
    if (!pair) continue;
    const [a, b] = pair;
    for (const [o, t] of [[a, b], [b, a]]) {
      const k = bucketKey(o, t, "life-001");
      if (!life.repeat.buckets[k]) life.repeat.buckets[k] = { day: dayIndex(usage.last), count: Math.min(LIGHT_SOCIAL.per_day, usage.count || 0), last_grant_tick: usage.last };
    }
    delete life.effects[key];
  }
  return life;
}
