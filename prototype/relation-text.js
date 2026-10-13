// 관계·기억 공개 문구(PO-15 §5, PO-DEC-001, PO-REQ-001 §4). store.memoryView 의 키를 화면 문장으로 바꾼다.
// 확인되지 않은 악의·상대 속마음을 만들지 않는다. 문장은 모두 T() 키 = 한국어 원문.
import { t as T } from "./i18n.js";

const FACT = {
  conversation: "{name}와(과) 인사하고 이야기를 나눴어요.",
  help: "{name}이(가) 내 작업을 도와줬어요.",
  repair: "{name}와(과) 남은 문제를 함께 확인하고 보완했어요.",
  correction: "{name}이(가) 공동작업 기록을 바로잡아 알려 줬어요.",
  credit_gap: "공동작업 기록에서 내 이름이 빠져 있었어요.",
};
const INTERP = {
  conversation: "반가운 시간이었다고 여겼어요.",
  help: "도움을 고맙게 여겼어요.",
  repair: "문제를 바로잡으려는 노력을 받아들였어요.",
  correction: "내 기여가 기록에 다시 올라간 것을 확인했어요.",
  credit_gap: "내 기여가 인정되지 않았다고 느꼈어요.",
};

/** memoryView(store) + 이름 함수 → {fact, interpretation, reason, resolution} (해당 없으면 null) */
export function memoryText(view, nameOf) {
  const name = nameOf(view.target);
  return {
    fact: T(FACT[view.kind] || FACT.conversation, { name }),
    interpretation: T(INTERP[view.kind] || INTERP.conversation),
    reason: view.reason === "not_applicable" ? null : view.reason === "known" ? T("왜 그랬는지 알고 있어요.") : T("왜 그랬는지는 아직 몰라요."),
    resolution:
      view.resolution === "not_applicable"
        ? null
        : view.resolution === "resolved"
          ? T("해결됐어요. 기억은 남아 있어요.")
          : view.kind === "correction"
            ? T("기록은 고쳐졌지만 갈등은 아직 남아 있어요.")
            : T("아직 풀리지 않았어요."),
  };
}

/** 관계 8축 이름과 짧은 설명(PO-13 §6.1). 수치는 1~1000 정수. */
export const AXES = [
  ["affection", "애정", "정서적 호감과 가까움"],
  ["trust", "신뢰", "말과 행동을 믿는 정도"],
  ["respect", "존중", "능력과 인격을 인정하는 정도"],
  ["dependence", "의존", "상대가 없으면 어려운 정도"],
  ["power", "권력", "결정에 미치는 영향과 거절의 자유"],
  ["reciprocity", "호혜성", "주고받음이 공정하다고 느끼는 정도"],
  ["obligation", "의무", "받아들인 책임과 기대"],
  ["conflict", "갈등", "욕구·의견·목표의 충돌"],
];
