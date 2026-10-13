// 제3자 공동작업 기록 흐름(PO-HAND-005 v1.0 §3B, v1.1 §2~3, SYS-CONF-001, 정연우 v1.3).
// 도움 완료(원천, 불변) → 제3의 폰 C 의 결과 기록(C 가 B 의 참여를 직접 본 증거가 없으면 B 가 빠질 수 있음)
// → B 의 합법 열람(지식 갱신, 사유 미확인) → B 의 확인 요청(열린 확인사항 OpenIssue) → C 의 사실 확인·정정 게시
// → 정정 전달·B 인지 → B→C EVT-09 후보. 실제 Conflict 생성·EVT-08/10·EVT-12 는 이 흐름에서 만들지 않는다(정의 미결).
// 저장 위치: state.credit. 모든 변경은 store 의 한 commit 안에서 일어난다.
import { dayIndex } from "./repeat.js";
import { roll } from "./accept.js";

export const CREDIT_RULE = { id: "CREDIT-RULE-workbench-v1", scope: "workbench_joint_work", version: 1 };
/** 빈도 레버(PO-HAND-005: A 만 최종 채택하지 않고 B 를 체험 후보로 우선). 사실(누가 도왔는지·누가 봤는지)은 바꾸지 않고 행동 선택 경향만 바꾼다. */
export const CREDIT_VARIANTS = {
  A: { record_bonus: 10, read_bonus: 6, express: { high: 0.6, medium: 0.4, low: 0.2 }, rule_version: "game1-credit-flow-a-test-v1" },
  B: { record_bonus: 22, read_bonus: 18, express: { high: 0.85, medium: 0.6, low: 0.35 }, rule_version: "game1-credit-flow-b-test-v1" },
};
const RECORD_WINDOW = 240; // 도움 완료 후 이 시간 안에만 기록 후보
const REQUEST_RETRY = 35; // 확인 요청 재시도 간격(접근 재시도 시험값 참조)
const REQUESTS_PER_DAY = 2; // 같은 확인사항에 하루 요청 상한(압박 방지)
const KEEP = 60;

export function emptyCredit(variant = "B") {
  return { schema: 1, variant, helps: {}, records: {}, issues: {} };
}
export function validateCredit(c) {
  if (!c || c.schema !== 1 || !CREDIT_VARIANTS[c.variant] || [c.helps, c.records, c.issues].some((o) => !o || typeof o !== "object" || Array.isArray(o))) throw Error("life.invalid_credit");
  if (Object.keys(c.helps).length > KEEP * 2 || Object.keys(c.records).length > KEEP * 2 || Object.keys(c.issues).length > KEEP * 2) throw Error("life.invalid_credit");
  return c;
}
/* 보관 상한(PO-DEC-005 §3-5): 오래된 것부터 지우되, 아직 진행 중인 확인사항이 가리키는 기록·도움 원천은 지우지 않는다(pinning).
   진행 중 = 말하려 함·답 기다림·확인 수락·정정 전달 전. "봤지만 말하지 않음(observed)"·닫힌 확인사항은 지울 수 있다.
   지워진 옛 완료가 다시 들어오면 store 의 stale 규칙(어제 이전 action 거절)이 막는다. */
const LIVE = ["intends_request", "verification_pending", "verification_accepted", "correction_published"];
const dropOldest = (obj, pinned) => {
  let extra = Object.keys(obj).length - KEEP;
  for (const k of Object.keys(obj)) {
    if (extra <= 0) break;
    if (pinned(k)) continue;
    delete obj[k];
    extra--;
  }
};
export function trimCredit(c) {
  const live = Object.values(c.issues).filter((i) => LIVE.includes(i.state)),
    liveRecords = new Set(live.map((i) => i.record_id)),
    liveHelps = new Set([...liveRecords].map((r) => c.records[r]?.help_id).filter(Boolean));
  dropOldest(c.issues, (k) => LIVE.includes(c.issues[k].state));
  dropOldest(c.records, (k) => liveRecords.has(k));
  dropOldest(c.helps, (k) => liveHelps.has(k));
}

/** 목격 모델(작은안: "권한 있는 단순 관측"). 같은 소유자의 다른 폰이 작업대 3칸 안에 있고 쉬는 중(눈 감음)이 아니면 그 순간을 본 것으로 기록한다.
    증거가 없다는 것은 "못 봤다고 확정"이 아니라 "봤다는 근거가 없음"이다. 가림·시선 방향은 아직 모델링하지 않는다. */
export function witnessesAt(life, ownIds, workerId, helperId) {
  const w = life.actors[workerId];
  if (!w) return [];
  return ownIds.filter((id) => {
    if (id === workerId || id === helperId) return false;
    const a = life.actors[id];
    return a && a.mode !== "resting" && Math.max(Math.abs(a.x - w.x), Math.abs(a.y - w.y)) <= 3;
  });
}

/** 시뮬레이션이 다음 행동 후보를 고를 때 읽는 갈림길(공개 정보가 아니라 같은 소유자 로컬 생활의 내부 상태). */
export function creditHooks(state) {
  const c = state.credit,
    life = state.life,
    own = new Set(state.pawns.map((p) => p.id)),
    today = dayIndex(life.tick);
  if (!c) return {};
  const v = CREDIT_VARIANTS[c.variant];
  return {
    variant: v,
    recordableFor(id) {
      if (!own.has(id)) return null;
      const h = Object.values(c.helps).find((h) => !h.recorded && h.worker !== id && h.helper !== id && life.tick - h.tick <= RECORD_WINDOW);
      return h ? h.help_id : null;
    },
    unreadFor(id) {
      return Object.values(c.records)
        .filter((r) => r.true_contributors.includes(id) && r.writer !== id && (r.readers[id]?.revision || 0) < r.revision)
        .map((r) => r.record_id);
    },
    checkFor(id) {
      const i = Object.values(c.issues).find(
        (i) => i.from === id && ["intends_request", "verification_pending"].includes(i.state) && life.tick >= (i.next_request_tick || 0) && i.requests.filter((t) => dayIndex(t) === today).length < REQUESTS_PER_DAY,
      );
      return i ? { issue_id: i.issue_id, record_id: i.record_id, to: i.to } : null;
    },
    correctionFor(id) {
      const i = Object.values(c.issues).find((i) => i.to === id && i.state === "verification_accepted");
      return i ? { issue_id: i.issue_id, record_id: i.record_id } : null;
    },
    deliveryFor(id) {
      const i = Object.values(c.issues).find((i) => i.to === id && i.state === "correction_published" && !i.delivered && life.tick >= (i.next_delivery_tick || 0));
      return i ? { issue_id: i.issue_id, record_id: i.record_id, to: i.from } : null;
    },
  };
}

/**
 * 생활 완료 한 건을 기록 흐름에 반영한다. helpers = {append, log, memory, tagRow, scores} (store 가 넘김).
 * 반환: 'applied' | 'duplicate' | 'ignored' | 'evt09'
 */
export function applyCredit(next, done, helpers) {
  const c = (next.credit ??= emptyCredit()),
    life = next.life;
  if (done.kind === "help") {
    if (c.helps[done.action_id]) return "duplicate";
    c.helps[done.action_id] = { help_id: done.action_id, worker: done.from, helper: done.to, tick: life.tick, witnesses: [...new Set(done.witnesses || [])], recorded: false };
    trimCredit(c);
    return "applied";
  }
  if (done.kind === "record") {
    const h = c.helps[done.help_id];
    if (!h || h.recorded || done.from === h.worker || done.from === h.helper) return "ignored";
    const saw = h.witnesses.includes(done.from),
      record_id = "credit-log-" + h.help_id;
    h.recorded = true;
    c.records[record_id] = {
      record_id,
      help_id: h.help_id,
      writer: done.from,
      tick: life.tick,
      rule_id: CREDIT_RULE.id,
      rule_applies: done.rule_applies !== false,
      true_contributors: [h.worker, h.helper],
      recorded: saw ? [h.worker, h.helper] : [h.worker],
      omitted: saw ? [] : [h.helper],
      revision: 1,
      corrected_by: null,
      corrected_by_visible: true,
      correction_action_id: null,
      readers: {},
      intent: "unconfirmed",
    };
    trimCredit(c);
    helpers.log(done.from, "작업대 기록판에 결과를 적었어요", "activity", null);
    return "applied";
  }
  if (done.kind === "read" || done.kind === "deliver") {
    const r = c.records[done.record_id],
      reader = done.kind === "deliver" ? done.to : done.from;
    if (!r) return "ignored";
    if ((r.readers[reader]?.revision || 0) >= r.revision) return "duplicate";
    r.readers[reader] = { revision: r.revision, tick: life.tick };
    const issueId = "issue-" + r.record_id + "-" + reader,
      issue = c.issues[issueId];
    if (r.omitted.includes(reader)) {
      // 게시 내용 관찰. 적용되는 공로 기준이 없으면 관찰에서 멈춘다(Q03).
      if (!r.rule_applies) {
        helpers.log(reader, "개인 메모에 내 이름이 없는 것을 봤어요", "activity", r.writer);
        return "applied";
      }
      helpers.memory({ id: r.record_id + "-" + reader, from: reader, to: r.writer, scope_id: "life-001", topic: "credit_attribution", known: true, reason_known: false, resolution: "open", description: "작업 기록에 내 이름이 빠져 있었어요" });
      if (!issue) {
        const fairness = next.pawns.find((p) => p.id === reader)?.trait.axis_values.fairness_sensitivity || "medium",
          express = roll(life.seed, r.record_id, reader, "express") < CREDIT_VARIANTS[c.variant].express[fairness];
        c.issues[issueId] = { issue_id: issueId, record_id: r.record_id, from: reader, to: r.writer, topic: "credit_attribution", scope_id: "life-001", state: express ? "intends_request" : "observed", requests: [], delivered: false, evt09: null, opened_tick: life.tick };
        trimCredit(c);
      }
      helpers.log(reader, "작업 기록에 내 이름이 빠진 것을 봤어요 · 이유는 아직 몰라요", "noticed", r.writer);
      return "applied";
    }
    // 정정된 기록을 본 경우: 정정자가 누구인지 알 때만 B→C EVT-09 후보(Q07). 모르면 사실만 갱신(Q08).
    if (issue && r.correction_action_id && ["correction_published", "verification_accepted"].includes(issue.state) && !issue.evt09) {
      issue.delivered = true;
      const knowsActor = done.kind === "deliver" || r.corrected_by_visible;
      if (!knowsActor) {
        // 기록이 고쳐진 것은 알지만 누가 고쳤는지는 모름(PO-DEC-005 §3-6): 확인사항·기억·공개 카드를 같은 상태로 맞추고 감정 효과(EVT-09)는 없다.
        issue.state = "resolved_record";
        issue.corrector_known = false;
        for (const m of next.memories) if (m.from === reader && m.to === r.writer && m.id === r.record_id + "-" + reader) { m.resolution = "resolved"; m.corrector_known = false; }
        helpers.log(reader, "고쳐진 작업 기록을 확인했어요 · 누가 고쳤는지는 몰라요", "activity", null);
        return "applied";
      }
      const ev = helpers.append("EVT-09", reader, r.corrected_by, r.correction_action_id + "-" + reader, { record_corrected: true, delivery_committed: true });
      issue.evt09 = ev.source_event_id;
      issue.state = "resolved_record";
      issue.corrector_known = true;
      for (const m of next.memories) if (m.from === reader && m.to === r.writer && m.id === r.record_id + "-" + reader) m.resolution = "resolved";
      helpers.log(reader, done.kind === "deliver" ? "고친 기록을 전해 듣고 확인했어요" : "고쳐진 작업 기록을 확인했어요", "completed", r.writer);
      return "evt09";
    }
    return "applied";
  }
  if (done.kind === "credit_check") {
    const i = c.issues[done.issue_id];
    if (!i || !["intends_request", "verification_pending"].includes(i.state)) return "ignored";
    i.requests.push(life.tick);
    if (done.accepted) {
      i.state = "verification_accepted";
      helpers.log(done.from, "기록을 확인해 달라고 부탁했어요", "accepted", done.to);
    } else {
      // C 의 미회신·바쁨은 대립이나 고의의 증거가 아니다(Q05). 관계 벌점 0.
      i.state = "verification_pending";
      i.next_request_tick = life.tick + REQUEST_RETRY;
      helpers.log(done.from, "기록 확인을 부탁했지만 지금은 어렵대요 · 관계 벌점 없음", "declined", done.to);
    }
    return "applied";
  }
  if (done.kind === "correct") {
    const i = c.issues[done.issue_id],
      r = i && c.records[i.record_id],
      h = r && c.helps[r.help_id];
    if (!i || i.state !== "verification_accepted" || !r || r.writer !== done.from || r.correction_action_id) return "ignored";
    // 사실 확인: 원천 도움 영수증(권위)에 B 가 있을 때만 정정한다.
    if (!h || h.helper !== i.from) return "ignored";
    r.revision += 1;
    r.recorded = [...new Set([...r.recorded, i.from])];
    r.omitted = r.omitted.filter((x) => x !== i.from);
    r.corrected_by = done.from;
    r.correction_action_id = done.action_id;
    i.state = "correction_published";
    helpers.log(done.from, "작업 기록을 바로잡았어요", "activity", null);
    return "applied";
  }
  return "ignored";
}

/** 공개용 요약(자기 폰 방향만): 열린 확인사항은 갈등과 다르게 보여 준다. */
export function openIssuesFor(state, from, to) {
  return Object.values(state.credit?.issues || {})
    .filter((i) => i.from === from && i.to === to && i.state !== "resolved_record")
    .map((i) => ({ topic: i.topic, state: i.state }));
}
