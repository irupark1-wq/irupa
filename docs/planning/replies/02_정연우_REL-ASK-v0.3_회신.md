# 김도현 → 정연우: REL-ASK-v0.3 회신

답변일: 2026-10-12 / v0.1. 전달용 기술검토, 실제 구현·새 DB배포 전. 최신 (1)파일5개는 이번에 제공되지 않았으므로 이전수령0.2와 이번질문서를 대조했다. v0.3 전체PRD를 검토했다고 주장하지 않는다.

## P0 답변

| ID | 가능여부 | 권장구현/데이터·API | 위험/결정권한 |
| --- | --- | --- | --- |
| DEV-ASK-01 | 조건부 | Supabase익명인증 UID+게임멤버십+RLS+소유권, 기존세션 재사용; 자세한복구는 디자인회신§1 | 브라우저삭제/다른기기 자동복구 불가. 복구수단/삭제/악용정책 PO; 기술검증 개발 |
| DEV-ASK-02 | 가능·검증필요 | Pages는 정적클라이언트, game1_command Edge API 후보→서버검증→단일DB트랜잭션; delta/보상결과 입력금지 | 상시시뮬레이션은 추가권위자 필요가능. 트랜잭션실험 G5, 운영비 PO |
| DEV-ASK-03 | 가능·검증필요 | game1_private의 game1_events/event_knowledge/effect_ledger/relationship_checkpoints/conflicts/memories; 서버에서checkpoint replay | 정정범위/원장증가/동시잠금 테스트필수; 개발, 의미변경은PO/자문 |
| DEV-ASK-04 | 조건부 | 대표폰 입력/자율폰 후보→명령의도→소유/참가/동의/상태/경로/자원검사→서버사건. 로컬 후보는 비권위 | 방문자에게호스트폰조작권없음. 자율허용/직접조작범위 PO, 구현 개발 |
| DEV-ASK-05 | 조건부 | 활동참가/역할수락/새공동목표/중대전환은 scope별consent; UTC만료/활동clock분리; 차단과명령 원자적순서 | 중대행동목록/동의UX PO. 기술중단/거절/만료벌점0은기존계약 |

### DEV-ASK-01 보충

익명인증 사용자는 authenticated역할이므로 ‘인증됨’만으로허용하지 않는다. 서버가 JWT/게임참여/소유/접촉권한을확인하며 조회projection도같다. 닉네임/UID/초대링크로소유권을인계하지않는다. 선택계정연결/별도복구는PO정책과검증전미구현이다. 익명생성남용·삭제후차단회피·게임간Auth공유는운영위험으로남긴다. [공식안내](https://supabase.com/docs/guides/auth/auth-anonymous).

### DEV-ASK-02/03 원자성·replay 경로

Pages는 정적호스팅이므로 사건서버가 아니다. [공식설명](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). 권위명령후보는 JWT검증→게임/권한/상태검사→receipt조회→규칙판정→DB확정이다. 여러REST쓰기만으로원자성을가정하지않는다. DB연결트랜잭션 또는 서버전용함수 경로를G5에서선택한다.

한commit에 receipt/사건/원장/관계/기억/갈등/책임/보상/outbox를묶는다. 명령입력canonical hash, actor+command 유일키, 효과유일키(rule_version제외), 고정ID잠금, seed/당시규칙보존을적용한다. 실패시부분결과0, 응답유실시원결과조회다. receipt의응답도현재공개권한으로재필터한다.

지식revision정정은 서버관계서비스가실행한다. 원슬롯직전checkpoint→유효기여순서replay→이후checkpoint재생성→projection CAS로확정한다. replay는보상/행동/푸시재실행이아니다. 구조전이는별도명시처리한다. 일정규모를넘는replay는작업분리/불일치임시projection차단을검토하되 원자성·순서·당시규칙 의미를훼손하지않는다. 초기엔규모/지연을측정하며상한정책을정한다.

### DEV-ASK-04/05 권한·활동 경계

대표폰은본인소유·현재인스턴스·조작세션범위만직접입력한다. 자율폰은owner설정과참가scope안에서행동하며방문자는자기폰만조작한다. 가구사용과월드편집을분리한다. 클라이언트의시각적이동은예측표현이며중요상호작용·위치예약·보상은서버검사다. B상시NPC판정은권위활동서비스가담당하며Edge Function이계속돌아간다고가정하지않는다.

타사용자참가/책임수락은각소유자의명시scope승인후활성화한다. 이미승인된범위의작은행동을매클릭재승인하게만드는것도피한다. 높은게이지는승인아니다. 차단/철회와명령은일관된잠금/직렬순서로확정하고차단commit후새접촉0이다. 기존commit사건은이력으로남되중복적용0/알림재필터. 사용자는즉시퇴장가능하다.

기술중단은clock/활동을안전중지하고새책임/벌점/배신기억을만들지않는다. 이미발생한확정사건을취소하지는않는다. ‘동업해지’는상대에게책임/재화분배변경을강제하는합의종료와본인활동중단을구별한다. 상대동의없이는본인퇴장을막지않고정산은서버규칙으로처리한다. 정책확정전자동해지·정산콘텐츠를고정하지않는다.

## P1 답변

| ID | 가능여부 | 구현/데이터·API | 위험/결정권한 |
| --- | --- | --- | --- |
| DEV-ASK-06 | 가능 | 버전JSON TagDefinition: id/scope(direction|mutual)/enter/exit/evidence_count/immediate/visibility/reason_keys | 원본임계값미수령; 감정2유효사건, 명시전환즉시. 값/의미 PO+자문 |
| DEV-ASK-07 | 가능 | game1_clocks: clock_id/active_tick/paused/revision; Commitment.clock_id/due_tick; Consent.expires_at_utc | 서버단조진행/clock귀속불변. 시간비율/유예값 PO검토 |
| DEV-ASK-08 | 가능 | 검증된버전JSON EventDefinition과seed/입력fixture 자동재생; 새버전은새사건만 | 12종/값은제안, 임의스크립트실행금지; 코드/콘텐츠동일릴리즈개발 |
| DEV-ASK-09 | 가능·검증필요 | 공개projection1곳, endpoint/preview/추천/알림/timeline/로그마다viewer scope적용 | 상대사유/내부태그유출검사 DEV-11; 정책 PO, 보안개발 |
| DEV-ASK-10 | 조건부 | 활성근거, observer/target/scope/관계별인덱스, 영향관계만재계산, 원장별sequence/checkpoint | 부하실측전성능보장불가; 보존/삭제/규모 PO |

### DEV-ASK-06~09 구체사항

정의표는JSON schema와범위/참조무결성검사를통과해야한다. 해석분기/효과는제한된연산자와등록된함수key로작성하며 eval/임의JavaScript를허용하지않는다. 유효근거는서로다른source_event_id와판정조건을보존하고동일틱/재전송/정보정정은새횟수0이다. 상호태그를다른소유자DTO에자동노출하지않는다.

EventDefinition: id/version/conditions/knowledge_conditions/interpretation_branches/emotion_contributions/structural_transitions/memory_keys/conflict_rules/consent_requirements/dialogue_keys. round_half_away_from_zero와clamp순서, seed·반복배수·해석입력을fixture에고정한다. 기존rule_version을정정도중최신값으로바꾸지않는다. 과거규칙migration은별도dry run/복구과제다.

약속은생성clock_id/due_tick을계속사용한다. 인스턴스이동으로기한을다시시작하지않으며정지clock에서불이행을발생시키지않는다. 타소유자활동은권위clock, 동의만료는서버UTC다. 재접속은snapshot+streamcursor이고기술단절을사회적배신으로해석하지않는다.

권한제한DTO는visibility=restricted/scores=null/일반문구만제공하며사건/기억/태그/revision도빼관계존재/차단정보를특정하지않는다. allowed_actions와reason_key도사적상대감정을설명하지않는다. 행동관찰은공개사실만제공한다. 로그는개인원문/토큰/사적평가를분석용으로남기지않는다.

### DEV-ASK-10 비용·지연 관리

ResourceLink(observer,target,active), DecisionRole(activity,pair,active), Commitment(accepter,beneficiary,state,due_tick), Conflict(observer,target,topic,scope_id,state), Ledger(relationship,sequence), Knowledge(source,observer,revision)에맞는유일키/복합·부분인덱스를검토한다. 실제쿼리와EXPLAIN을보고추가하며모든열에인덱스를만들지않는다. 수식근거변경시영향관계만재계산하고 revision으로캐시를확인한다.

비활성항목은현재계산에서제외하되영향증거/재투영자료를임의삭제하지않는다. 메모리·DB쿼리·정정p95·원장길이·outbox대기량을측정한다. 보존기간과정정가능기간/삭제정책이결정되기전원장정리는확정하지않는다.

## PO 요청 및 진행 가능 범위

PO-REL-01~04는그대로유지한다. 플랫폼/로그인없는UX는전달된요구와기존미정의차이를CR-013으로등록했다. CR-014복구/삭제, CR-015동의/중대전환, CR-016원본임계값/최신파일검토와함께PO에게전달할수있다.

지금진행가능: 순수reducer/원장replay/clock/DTO fixture/반례테스트/제안콘텐츠. 미완료: 인증설정, 게임테이블·RLS배포, 소셜권위처리, 실측성능/QA. 현재답변은모든10질문의개발검토회신이며작동검증결과가아니다.

