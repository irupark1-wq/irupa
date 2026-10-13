// 폰 위 대화 말풍선(PO-REQ-001 §3): 저장이 확정된 생활 기록 → 화자·청자·상황별 짧은 대사.
// 대사는 개발용 임시 문구다(DIALOGUE_SOURCE). 김플레이 대사팩(OUT-PLAY-002) 채택 후 이 표만 교체한다.
// 규칙: 완료 전 성공 대사 없음(기록 기반), 같은 기록 → 같은 대사(재생·정정으로 새 대화처럼 재연출하지 않음),
//       말투(친밀 지향)와 따뜻함(애정·신뢰)을 따로 본다, 수치·속마음·미인지 사실을 말하지 않는다.
export const DIALOGUE_SOURCE = "dev-provisional-v1";

const LINES = {
  greet_offer: { warm: ["안녕! 잠깐 얘기할래?", "여기 있었구나, 같이 얘기하자."], plain: ["잠깐 시간 있어?", "저기, 잠깐만."], reserved: ["…잠깐 괜찮아?", "할 말이 좀 있어서."] },
  greet_accept: { warm: ["좋아, 마침 얘기하고 싶었어.", "응! 반가워."], plain: ["그래, 잠깐이면.", "응, 말해."], reserved: ["…그래.", "응."] },
  decline_busy: { any: ["이것만 마저 하고.", "지금은 하던 일부터 끝낼게."] },
  decline_tired: { any: ["지금은 혼자 쉬고 싶어.", "조금만 쉬고 나서."] },
  decline_distance: { any: ["지금은 좀 떨어져 있고 싶어.", "오늘은 각자 있자."] },
  decline_alone: { any: ["잠깐 혼자 있고 싶어.", "나중에 얘기하자."] },
  chat: { warm: ["너랑 얘기하니까 기분 좋다.", "오늘 창가 햇살 좋더라."], plain: ["창밖 나무가 많이 자랐네.", "오늘은 조용하네."], reserved: ["…그렇구나.", "응, 알겠어."] },
  chat_reply: { warm: ["나도! 또 얘기하자.", "그러게, 좋은 하루다."], plain: ["그러게.", "응, 그런 것 같아."], reserved: ["…응.", "그래."] },
  chat_neutral: { any: ["그래, 또 보자.", "응, 이따 봐."] },
  help_offer: { warm: ["이 일은 네가 잘하니까 같이 해보자.", "내가 거들어 줄게."], plain: ["도와줄까?", "같이 하면 빨리 끝날 거야."], reserved: ["…손 필요하면 말해.", "이쪽은 내가 할게."] },
  help_accept: { any: ["좋아, 같이 하자.", "고마워, 이쪽 좀 잡아 줘."] },
  help_decline: { any: ["지금은 혼자 해볼게.", "괜찮아, 거의 다 했어."] },
  help_done: { any: ["덕분에 금방 끝났어.", "같이 하니까 수월했다."] },
  repair_offer: { any: ["기록 다시 같이 확인해 볼래?", "그 일, 같이 정리해 보자."] },
  repair_accept: { any: ["응, 같이 보자.", "그래, 확인해 보자."] },
  repair_decline: { any: ["그 얘기는 조금 나중에 하자.", "지금은 준비가 안 됐어."] },
  repair_done: { any: ["기록은 고쳤어.", "이제 제대로 적혔네."] },
  // 제3자 기록 흐름(PO-HAND-005 §3B). 이유·의도를 단정하지 않는다(정연우 DLG-05~08).
  credit_ask: { warm: ["기록에 내 이름이 없네. 같이 확인해 줄래?", "아까 작업 기록 말인데, 한 번만 봐 줄래?"], plain: ["기록에 내 이름이 없네. 확인해 줄래?", "작업 기록, 한 번 확인해 줄 수 있어?"], reserved: ["…기록, 한 번 봐 줄래?", "작업 기록 확인 좀."] },
  credit_ask_accept: { any: ["그래, 다시 볼게.", "응, 확인해 볼게."] },
  credit_ask_pending: { any: ["지금은 어려워, 이따 볼게.", "하던 일 끝나고 볼게."] },
  credit_fixed: { any: ["기록은 고쳤어.", "작업 기록 다시 적어 뒀어."] },
  credit_ack: { warm: ["확인했어, 고마워.", "고쳐 줘서 고마워."], plain: ["확인했어.", "응, 봤어."], reserved: ["…확인했어.", "응."] },
};
export const ALL_LINES = Object.values(LINES).flatMap((g) => Object.values(g).flat());

const DECLINE = {
  "지금 하던 일을 마치고 싶어요": ["greet_offer", "decline_busy"],
  "지금은 쉬고 싶어요": ["greet_offer", "decline_tired"],
  "조금 거리를 두고 싶어요": ["greet_offer", "decline_distance"],
  "잠깐 혼자 있고 싶어요": ["greet_offer", "decline_alone"],
  "지금 도움을 받기 어려워요": ["help_offer", "help_decline"],
  "지금은 보완 이야기를 할 준비가 아니에요": ["repair_offer", "repair_decline"],
  "기록 확인을 부탁했지만 지금은 어렵대요": ["credit_ask", "credit_ask_pending"],
};

/** 생활 기록 1줄 → [{speaker, situation}] (말할 차례 순서). 해당 없으면 []. */
export function speechTurns(log) {
  const a = log.actor,
    b = log.target;
  if (!a) return [];
  if (log.kind === "declined" && b) {
    const pair = DECLINE[String(log.text).replace(" · 관계 벌점 없음", "")];
    return pair ? [{ speaker: a, listener: b, situation: pair[0] }, { speaker: b, listener: a, situation: pair[1] }] : [];
  }
  if (log.kind === "accepted" && b) {
    if (/이야기를 수락/.test(log.text)) return [{ speaker: a, listener: b, situation: "greet_offer" }, { speaker: b, listener: a, situation: "greet_accept" }];
    if (/도움 제안을 상대가 수락/.test(log.text)) return [{ speaker: a, listener: b, situation: "help_offer" }, { speaker: b, listener: a, situation: "help_accept" }];
    if (/도움을 수락하고/.test(log.text)) return [{ speaker: a, listener: b, situation: "help_offer" }];
    if (/기록을 확인해 달라고 부탁했어요/.test(log.text)) return [{ speaker: a, listener: b, situation: "credit_ask" }, { speaker: b, listener: a, situation: "credit_ask_accept" }];
    if (/보완 제안을 수락/.test(log.text)) return [{ speaker: a, listener: b, situation: "repair_offer" }, { speaker: b, listener: a, situation: "repair_accept" }];
  }
  if (log.kind === "completed" && b) {
    if (/이야기를 나눴어요/.test(log.text)) return [{ speaker: a, listener: b, situation: "chat" }, { speaker: b, listener: a, situation: "chat_reply" }];
    if (/함께 작업을 마쳤어요/.test(log.text)) return [{ speaker: a, listener: b, situation: "help_done" }];
    if (/고친 기록을 전해 듣고/.test(log.text)) return [{ speaker: b, listener: a, situation: "credit_fixed" }, { speaker: a, listener: b, situation: "credit_ack" }];
    if (/보완했어요/.test(log.text)) return [{ speaker: a, listener: b, situation: "repair_done" }];
  }
  if (log.kind === "neutral" && b) return [{ speaker: a, listener: b, situation: "chat_neutral" }];
  return [];
}

/**
 * 말투: 친밀 지향 low → reserved(무뚝뚝). 그 밖에 애정 ≥160·신뢰 ≥300 → warm, 아니면 plain.
 * rel 은 화자 자신의 방향 점수(자기 폰만). 방문 폰·정보 없음 → plain.
 */
export function toneOf(trait, rel) {
  if (!trait || !rel) return "plain";
  if (trait.closeness_orientation === "low") return "reserved";
  return rel.affection >= 160 && rel.trust >= 300 ? "warm" : "plain";
}

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** 같은 기록·같은 화자 → 항상 같은 대사(결정적). */
export function lineFor(situation, tone, key) {
  const group = LINES[situation];
  if (!group) return null;
  const list = group[tone] || group.plain || group.any;
  return list[hash(key) % list.length];
}
