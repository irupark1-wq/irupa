# REQ-05 DES-09 후속 — 말풍선 본체 PNG 보완, DES-08 원문, 말풍선 상태 매핑

- 문서번호: REQ-05 / 작성: 김도현 / 받는 사람: 김PO (김디자인님께 전달 부탁) / 날짜: 2026-10-13 / 상태: 요청
- 근거: DES-09 렌더 검사 결과(DEV-24 5절), PO-HAND-005 §5 김디자인 항목

## 1. 말풍선 본체 PNG (선택 사항)

지금은 꼬리 PNG 만 쓰고, 본체는 DES-09 PNG 에서 잰 색·외곽선으로 CSS 로 그립니다. 겉모습은 같습니다. 본체를 그림으로 바꾸고 싶으시면 아래 규격으로 다시 주세요.

| 항목 | 규격 |
|---|---|
| 파일명 | `speech-bubble-v2.png` |
| 형식 | PNG, RGBA, sRGB |
| 크기 | 120×60 px (실제 표시 크기의 약 2배) |
| 9-slice | 사방 16px |
| 안쪽 채움 | 알파 255(완전 불투명). DES-09 판은 254 라서 조각 사이 이음선이 생김 |
| 바깥 여백 | 0px(외곽선이 그림 가장자리에 닿게) |
| 질감 | 단색(조각마다 무늬가 다르면 이음선이 보임) |

## 2. DES-08 원문

DES-09 가 인용한 DES-08(말풍선·관계창 수치 계약) 원문을 받지 못했습니다. 파일 그대로 전달 부탁드립니다.

## 3. 말풍선 상태 매핑

PO-HAND-005 가 말한 "말풍선 8종 상태 매핑"이 있으면 표로 주세요. 지금 화면에 있는 상태는 아래와 같습니다.

| 상태 키 | 뜻 | 지금 아이콘 |
|---|---|---|
| idle | 주변을 살펴봄 | `bubbles/idle.png` |
| moving | 이동 | `bubbles/moving.png` |
| working / recording | 만들기 / 기록판에 적기 | `bubbles/working.png` |
| resting | 쉬기 | `bubbles/resting.png` |
| talking / listening / checking | 대화 / 듣기 / 기록 확인 부탁 | `bubbles/talking.png` |
| assisting | 함께 만들기 | `bubbles/assisting.png` |
| repairing / correcting | 보완 / 기록 바로잡기 | `bubbles/repairing.png` |
| waiting | 기다림 | `bubbles/waiting.png` |
| reading | 기록판 읽기 | (지금은 idle 그림을 씀) |
| declined / blocked | 거절 / 길 막힘 | `bubbles/declined.png`, `bubbles/blocked.png` |

새 그림이 필요하면: `bubbles/reading.png`, `bubbles/recording.png`, PNG RGBA, 기존 아이콘과 같은 328×328 px.
