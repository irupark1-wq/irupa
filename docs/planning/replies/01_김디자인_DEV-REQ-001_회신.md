# 김도현 → 김디자인: DEV-REQ-001 회신

답변일: 2026-10-12 / v0.1 / 상태: 전달용 기술 검토 답변, 구현·배포 전.

두 문의서를 읽고 기존 개발 계획과 대조했습니다. ‘확정’은 기존 계약 또는 이 회신의 개발 작업 기준을 뜻하며 구현 검증 완료를 뜻하지 않습니다. 제품 의미/복구 UX/최종 아트는 김피오님 검토가 필요합니다.

GitHub Pages와 로그인 화면 없는 UX는 이번 문의서가 전한 기존 사용자 요구로 기록합니다. 이 채팅에서 직접 확인된 선택은 Supabase입니다. 기존 미정 표기와의 충돌을 CR-013으로 등록하며, 전달받은 요구를 이 채팅의 직접 승인으로 바꾸지 않습니다. 별도 로그인 화면은 임의 추가하지 않습니다.

## 1. 계정·소유권 — 변경 제안 / 구현 검토 필요

권장안은 첫 진입 시 Supabase 익명 인증, 재방문 시 기존 세션 재사용입니다. 익명 사용자도 authenticated 역할이므로 단순 로그인 여부가 아닌 auth.uid·game1 멤버십·소유권·참가/방문/차단 권한을 검사합니다. public anon 역할에는 게임 데이터 쓰기를 허용하지 않습니다.

브라우저 데이터 삭제·로그아웃·다른 기기에서는 익명 계정에 다시 접근할 수 없습니다. [공식 익명 인증 안내](https://supabase.com/docs/guides/auth/auth-anonymous). UID/닉네임/초대 링크만으로 소유권을 복구하지 않습니다. 기존 세션은 인증 SDK가 관리하고 access/refresh token을 링크·게임 저장 파일·로그·분석 이벤트에 넣지 않습니다.

복구 선택지는 (a) 이 브라우저 전용 사용+손실 가능성 안내, (b) 사용자가 선택하는 계정 연결/복구 수단입니다. 기본 진입에 로그인 화면을 추가하지 않더라도 (b)의 확인 UX는 필요하므로 PO 결정 대상입니다. 비밀 복구코드/기기 이전은 별도 보안 설계와 검증 전 제공하지 않습니다. 로컬 외형 백업은 계정/월드 소유권 복구와 다릅니다.

초대 링크는 짧은 만료/취소 가능·대상 범위 제한 서버 기록을 가리키며, 입장 요청만 허용하고 소유권·편집 권한을 부여하지 않습니다. 대상 지정 초대는 인증 UID와 일치해야 하고 링크 유출은 취소/재발급으로 처리합니다. 방문과 편집은 별도 권한이며 차단이 우선입니다. 익명 UID 재발급에 의한 차단 회피는 별도 악용 대응 과제입니다. 익명 생성 CAPTCHA/요청 제한·보존 정책은 외부 알파 전 검사합니다.

디자인 요청: 첫 진입 ‘접속 준비’/실패 재시도, 이 브라우저 저장 안내, 세션 만료 시 기존 계정 확인 실패, 선택 복구 정책의 상태 자리만 예약해주세요. 세션 확인 중 새 익명 계정을 자동 생성해 기존 사용자처럼 표시하지 않습니다.

## 2. 파츠 데이터 — 확정 계약 + 범위 제안

확정 계약: 원본과 합성 분리, pawn_id 유지, immutable appearance_version, undo/redo20단계 이상, 6슬롯 순서. 파츠당512×512 RGBA는 원 PRD 제안 규격을 실험 기준으로 사용합니다.

권장1차 저장은 **파츠 원본 PNG+transform+manifest**, 브러시 기록은 편집 세션/로컬 초안의 undo/redo에 사용합니다. 서버에 영구 스트로크 원장을 저장하는 것은 A 필수가 아닙니다. 저장 후 기존 스트로크를 벡터처럼 개별 수정하는 경험이 필요하면 추가 범위를 검토합니다. PNG는 다시 그릴 수 있으나 과거 개별 획을 객체로 복원하지 않습니다.

눈은 mode='pair'|'separate'를 두고 version 안에서 한 모드만 허용합니다. pair는 eyes 한 장, separate는 left_eye/right_eye 두 장입니다. D-02 샘플은 pair를 우선 권장하며 별도눈은 프리셋/도구 요구 확인 후 지원합니다. 모드 전환 때 기존 원본은 보존합니다.

| 필드 | 타입/실험 허용값 | 상태 |
| --- | --- | --- |
| position | {x:number,y:number}, 정규화 -0.25~1.25 | 장식 여유 포함 개발 제안 |
| pivot | {x:0.5,y:0.5} | 1차 고정 제안 |
| scale | {x:number,y:number}, 각0.1~2.0 | 개발 제안; mirror는 별도 bool |
| rotation_deg | number, -180~180 | 저장degree, 엔진 변환 단일 어댑터 |
| visible/mirror_x | boolean | 개발 제안 |
| PNG | 512×512, 파일당1MiB 이하, 한version 원본합계8MiB 이하 | 1차 검사 한도, 실측 후 조정 |
| checksum | sha256 문자열 | 서버 검증값 기준 |
| schema_version/appearance_version | 양의정수 | 형식버전과 외형버전 분리 |

여러 숫자는 아직 최종 디자인 한도가 아닙니다. 샘플 가독성/네트워크를 측정한 뒤 조정합니다. 슬롯별 허용목록/크기/수/decoded pixel 수/총업로드를 서버 검사합니다. 외부 사용자 SVG 업로드·스크립트·임의 파일은 허용하지 않습니다.

후보 경로: private bucket game1_art, `game1/pawns/{pawn_id}/appearance_v{n}/layers/{asset_id}.png`, preview는 별도 경로. 서버가 소유권과 경로를 생성/검증하고 저장 성공한 manifest만 활성화합니다. 업로드중 실패는 이전외형 유지·재시도/정리, 같은 pawn_id의 외형 확정은 expected_version 검사입니다. 원본은 소유자만, 합성은 조회권한 검사 후 제한기간 URL로 제공합니다. 공개프리셋은 별도 공개자료이며 사적원본을 공개버킷에 복사하지 않습니다.

## 3. 렌더러·좌표·입력 — 구현 검토 필요

검토 기본안: React UI+편집기 Canvas2D, 월드 Phaser 후보, TypeScript 규칙 모듈. Canvas2D 편집기와 월드 엔진은 역할 분리이며 두 월드 엔진을 병행하지 않습니다. G0에서 파츠/입력/UI중첩/탭복귀를 시험하고 Phaser 또는 다른 단일렌더러를 선택합니다.

UI↔월드는 typed command/event/snapshot 인터페이스만 사용합니다. 월드 엔진이 관계값을 직접 수정하거나 React 상태에 프레임마다 위치를 써 넣지 않습니다. 저장위치는 정규화 캔버스, 월드는 논리좌표, 화면변환은 한곳입니다.

1280×720 PC 마우스/키보드는 1차 테스트 화면 제안, 48/64/96px 폰 비교입니다. 모바일 지원/최저기기/최종폰 크기/픽셀여부는 PO·디자인 판단 후 확정합니다. 샘플은 모든비율에 쉽게 맞출 수 있는 독립레이어로 주세요.

## 4. 관계 projection — 확정 원칙 / DTO v0.1 제안

```ts
type Axis = 'affection'|'trust'|'respect'|'dependence'|'power'|'reciprocity'|'obligation'|'conflict';
type PawnPublic = { pawn_id: string; display_name: string; appearance_ref: string | null };
type VisibleMemory = {
  memory_id: string; reason_key: string;
  knowledge: 'known'; reason: 'known'|'unknown'; resolution: 'open'|'resolved';
};
type RelationshipDTO =
  | { visibility:'restricted'; scores:null; reason_key:'relationship.restricted'; allowed_actions:[] }
  | {
      visibility:'owner_direction'; direction:{from:PawnPublic;to:PawnPublic};
      scores:Record<Axis,number>; revision:number;
      basis_status:{power:'active_basis'|'no_active_basis'};
      own_assessment_labels:string[]; shared_facts:string[];
      memories:VisibleMemory[]; open_issues:VisibleIssue[];
      commitments:VisibleCommitment[]; last_visible_effect:VisibleEffect|null;
      allowed_actions:ActionKey[];
    };
```

VisibleIssue/VisibleCommitment/VisibleEffect/ActionKey은 W-01에서 별도 정의할 타입입니다. 이 예제는 독립 컴파일용 전체 코드가 아닙니다. 점수는 정수1~1000으로 runtime 검사하고 own_assessment_labels는 최대3개입니다.

한 DTO는 한 방향만 담습니다. 두 폰 모두 본인 소유이면 허용 방향을 별도 조회/전환합니다. 타소유자→내폰은 정상응답에 필드를 만들지 않고 임의조회만 restricted/scores=null로 거부합니다. restricted에는 revision/기억/갈등/관계존재 여부를 넣지 않습니다. 로그인된 상태에서도 권한은 매번 검사합니다.

allowed_actions는 표시용이며 서버는 실제 명령 때 재검사합니다. 태그/preview/추천/대사/알림도 같은공개정책입니다. 캐시 키는 사용자·게임·방향·권한범위를 포함하며 로그아웃/차단/삭제/공개범위변경 때 무효화합니다. 내부 이유를 reason_key에 넣지 않습니다.

## 5. 상태·명령·복구 — 확정 의미 / wire 형식 제안

command_id는 새사용자 의도마다 생성한 UUID, 재시도에는 유지합니다. consent_id는 승인대상, event_id는 서버확정 사건, stream_id+event_sequence는 해당스트림 순서입니다. 이 ID들은 서로대체하지 않습니다.

```ts
type Command = { command_id:string; expected_version:number; type:CommandType; payload:unknown };
type Result = {
  command_id:string; status:'pending'|'applied'|'rejected'|'conflict';
  entity_version:number|null; event_id:string|null;
  stream_id:string|null; event_sequence:number|null;
  reason_key:string; retryable:boolean;
};
```

CommandType별 payload schema와 0=미생성 버전 규칙은 W-01 계약에서 정의합니다. 응답 실패가 미적용의 증거는 아닙니다. 확인중→동일command 상태조회/재전송→원확정결과로 복구합니다. 같은actor/key 다른payload는 충돌입니다.

dirty/saving/saved/error/conflict는 기존계약 그대로이며 saved는 서버commit 확인뒤만 표시합니다. 연결 복귀는 별도영속상태가 아닌 과정입니다: reconnecting→권한필터 snapshot+cursor→누락복구/캐시정리→connected. 완전복구전에 민감명령을 잠급니다. 복구기록은 목록에만, 과거결과연출은 반복하지 않습니다. 로컬A 저장은 ‘이 기기 저장’으로 구별합니다.

## 6. 에셋 전달 — 지원안 / 구현 검토 필요

디자인 원본 SVG는 신뢰된 제작원본으로 수령 가능하지만 게임런타임은 검토/래스터화한 PNG를 우선합니다. 사용자 SVG는 받지 않습니다. PNG+manifest JSON은 기본교환안, atlas는 엔진결정후 생성합니다. 512원본을 보존하고48/64/96 미리보기로 검수하며 손실압축/해상도축소는 결과확인후만 적용합니다.

파일명은 슬롯/표정/버전/ID의 ASCII 대응표를 유지합니다. 모션은 상태·시간ms·pivot·transform·루프/중단·감소모션 표로 받으며 일반 표정 없는 폰에도 적용합니다. 정확8상태 목록과 도움/작업 분리는 아직디자인회신이 필요합니다. 폰트/음원/프리셋 사용권을 함께 기록해주세요.

## 필요한 후속 회신

D-02 PNG기반 재편집/눈mode/한도안, D-01 화면/시점/크기, 모션8상태목록을 확인해주세요. 계정복구·연령·중대동의·플랫폼 충돌은 CR-013~016에 기록했습니다. 이 회신은 디자인/서버를 구현하거나 검증한 결과가 아닙니다.

