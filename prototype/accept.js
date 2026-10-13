// 행동별 수락 판단(PO-HAND-005 §2·§3A, 정연우 v1.2 §4). 순수 함수, 시드로 재현 가능.
// 파이프라인: 권한·프라이버시 → 상대의 현재 상태(바쁨·피로·경계) → 행동별 "주요 관계 단서"로 수락 경향 → 시드 판정.
// 애정·존중·신뢰는 "경향"이지 유일한 허가·거절 게이트가 아니다. 갈등은 관련 범위에서만 경향을 낮춘다.
// 모든 계수는 A2 체험 시험값(ACCEPT_RULE)이며 출시 밸런스가 아니다.
export const ACCEPT_RULE = "game1-accept-a2-test-v1";
const level = (n) => (n === "high" ? 1 : n === "low" ? -1 : 0);
const clamp01 = (p, lo = 0.05, hi = 0.95) => Math.max(lo, Math.min(hi, p));

/** 결정적 난수 [0,1): 같은 seed·tick·행위자·대상·행동 → 같은 값 */
export function roll(...parts) {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 100000) / 100000;
}

/** 가벼운 대화: 주요 단서 = 상대가 나에게 갖는 애정 + 상대의 친밀 지향. 신뢰가 낮다고 인사를 막지 않는다. */
export function talkResponse(responder, traits, rel, u, ctx = {}) {
  if (responder.mode !== "idle") return { accepted: false, code: "declined_by_pawn", reason: "지금 하던 일을 마치고 싶어요" };
  if (responder.tired >= 65) return { accepted: false, code: "declined_by_pawn", reason: "지금은 쉬고 싶어요" };
  if (ctx.boundaryUntil && ctx.tick < ctx.boundaryUntil) return { accepted: false, code: "declined_by_pawn", reason: "조금 거리를 두고 싶어요" };
  if (responder.social < 24 && traits.closeness_orientation !== "high") return { accepted: false, code: "declined_by_pawn", reason: "잠깐 혼자 있고 싶어요" };
  const p = clamp01(0.55 + ((rel.affection - 300) / 1000) * 0.7 + level(traits.closeness_orientation) * 0.15 + (responder.social - 50) / 250 - (rel.conflict || 1) / 2500);
  return u < p ? { accepted: true, code: "accepted", reason: "같이 잠깐 이야기해요", p } : { accepted: false, code: "declined_by_pawn", reason: "잠깐 혼자 있고 싶어요", p };
}

/** 작업 도움 받기(작업자 쪽 응답): 주요 단서 = 작업자가 돕는 폰을 존중하는 정도 + 공동 목표. 애정은 쓰지 않는다. */
export function helpResponse(worker, traits, rel, u, ctx = {}) {
  if (worker.mode !== "working" || worker.partner || worker.until - ctx.tick < 2 || worker.tired >= 80) return { accepted: false, code: "declined_by_pawn", reason: "지금 도움을 받기 어려워요" };
  if (ctx.blocked) return { accepted: false, code: "no_path", reason: "작업대로 갈 길이 없어요" };
  const scopedConflict = ctx.conflictInScope ? (rel.conflict || 1) / 2000 : 0;
  const p = clamp01(0.5 + ((rel.respect - 300) / 1000) * 0.9 + (ctx.commonGoal === false ? 0 : 0.1) - level(traits.risk_aversion) * 0.05 - scopedConflict);
  return u < p ? { accepted: true, code: "accepted", reason: "도움 제안을 상대가 수락했어요", p } : { accepted: false, code: "declined_by_pawn", reason: "지금 도움을 받기 어려워요", p };
}

/** 옆에 있다가 함께 만들기에 끼기(돕는 폰 쪽 의사): 돕는 폰이 작업자를 존중하는 정도. */
export function joinResponse(helper, traits, rel, u) {
  if (helper.mode !== "idle" || helper.tired >= 65) return { accepted: false, code: "declined_by_pawn" };
  const p = clamp01(0.45 + ((rel.respect - 300) / 1000) * 0.9 + level(traits.closeness_orientation) * 0.05);
  return { accepted: u < p, code: u < p ? "accepted" : "declined_by_pawn", p };
}

/**
 * 정보 맡기기(가벼운 위임) 응답. 하드 게이트: 비민감·같은 소유자·소유자 승인·받는 폰의 경계/휴식.
 * 주요 단서 = 받는 폰이 맡기는 폰을 믿는 정도 + 이행 이력. 수락만으로 신뢰가 오르지 않는다(효과는 정의 확정 전 0).
 */
export function delegateResponse(recipient, traits, rel, u, ctx = {}) {
  if (ctx.sensitive || ctx.otherOwnerPrivate || ctx.ownerApproved === false) return { accepted: false, code: "not_shareable", reason: "이 메모는 맡길 수 없는 정보예요" };
  if (recipient.mode === "resting" || recipient.tired >= 65 || (ctx.boundaryUntil && ctx.tick < ctx.boundaryUntil)) return { accepted: false, code: "declined_by_pawn", reason: "이번 메모는 맡지 않기로 했어요" };
  const p = clamp01(0.15 + ((rel.trust - 300) / 1000) * 1.3 + Math.min(0.3, (ctx.fulfilledHistory || 0) * 0.1) - level(traits.risk_aversion) * 0.1);
  return u < p ? { accepted: true, code: "accepted", reason: "메모를 맡기로 했어요", p } : { accepted: false, code: "declined_by_pawn", reason: "이번 메모는 맡지 않기로 했어요", p };
}

/** 공로 확인 요청 응답(기록한 폰 C): 바쁨·피로·단절은 미회신(pending)일 뿐 대립·고의 증거가 아니다. */
export function checkResponse(writer, traits, rel, u, ctx = {}) {
  if (ctx.offline || writer.mode !== "idle" || writer.tired >= 65) return { accepted: false, code: "verification_pending", reason: "지금은 어려워, 이따 볼게" };
  const p = clamp01(0.7 + ((rel.respect - 300) / 1000) * 0.6 + level(traits.fairness_sensitivity) * 0.1, 0.3, 0.97);
  return u < p ? { accepted: true, code: "accepted", reason: "기록을 다시 확인해 보기로 했어요", p } : { accepted: false, code: "verification_pending", reason: "지금은 어려워, 이따 볼게", p };
}
