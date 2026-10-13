# 《동그란 사이》 (Little Circles / まるい縁) — Claude 작업 규칙

이 파일은 이 폴더에서 Claude Code 를 열면 자동으로 읽힌다. 자세한 인수인계는 `docs/planning/00_클로드_인수인계_2026-10-13.md`.

## 0. 가장 중요한 규칙

- **이 프로젝트는 다른 모든 프로젝트와 완전히 별개다.** Restiq, Oryxa AGI, SoojiN, 말랑 등 다른 창에서 하던 일과 GitHub 계정·Supabase 계정이 다르다. 그쪽 레포·DB·메모리를 절대 건드리지 않는다. 헷갈리면 멈추고 사용자에게 묻는다.
- 이 프로젝트의 GitHub·Supabase 계정은 **아래 "계정" 절의 것만** 쓴다(사용자 확정 2026-10-13).
- 작업 폴더는 **`C:\claude\donggeuran`** 뿐이다(사용자 지정). `C:\code\game`·`D:\code\game` 은 이전 복사본이며 쓰지 않는다. `AGENTS.md` 보안 기준(비밀값 금지, RLS 등)은 그대로 유효하다.
- 역할: Claude 가 메인 개발자. GitHub Pages 업로드(git push + Actions)는 Claude 가 직접 한다. Supabase 는 Claude 가 SQL·Edge Function·secret 을 **파일로 만들어 주면 사용자가 직접 입력**한다.
- 설명·보고는 한국어. 코드·커밋 메시지는 영어 가능.

## 계정 (사용자 확정 2026-10-13 — 이 프로젝트에서만 사용)

- GitHub 저장소: **https://github.com/irupark1-wq/irupa** (계정 `irupark1-wq`, 기본 브랜치 `main`). 이 폴더의 `.git` 은 이 원격의 이력 위에 있다.
- GitHub 자격증명: Windows 자격 증명 관리자의 `git:https://github.com` 항목이 `irupark1-wq` 다. 다른 프로젝트 계정(`irupark500-cmd`)은 URL 에 사용자명이 박힌 별도 항목이라 섞이지 않는다. 전역 git 설정·다른 항목을 바꾸지 않는다. 토큰을 파일·문서·커밋에 넣지 않는다.
- GitHub Pages: `.github/workflows/pages.yml` 이 push 때마다 `prototype/` 을 업로드·배포(Source = GitHub Actions). 커스텀 도메인 **https://neinom.com** (DNS 는 사용자가 설정 완료, `prototype/CNAME`). 배포는 Claude 가 `git push` 로 직접 한다.
- Supabase: **프로젝트 `yvsqivhdwzbshpapfcsy`** (https://supabase.com/dashboard/project/yvsqivhdwzbshpapfcsy). Claude 는 접속하지 않고 `supabase/` 폴더에 SQL·Edge Function·secret 안내 파일을 **번호 순서로 누적**해 두면 **사용자가 대시보드에서 직접 입력**한다(다른 프로젝트와 섞이지 않게). 적용 기록은 `supabase/README.md`. 코드에는 `.env.example` 자리만, publishable key 만 브라우저에. service_role 키는 절대 받지 않는다.
- 다른 프로젝트(Restiq·SoojiN·Sigmate·Oryxa·DB 등)의 저장소·Supabase·메모리는 절대 건드리지 않는다.
- 이름 접두어: **`game1_` 유지**(사용자 확정 2026-10-13). DB 객체·Edge Function 은 `game1_`, 환경변수·secret 은 `GAME1_`, 리소스는 `게임1`.

## 실행·검증

```bash
npm start        # http://127.0.0.1:4173 (Node 24+). 처음이면 node scripts/game1_build_prototype.mjs 먼저
npm test         # 140개 통과해야 함 (core/·store·life·layout·A2 기반·대사 계약)
```
- 브라우저 확인은 PC 가로(1440×900)와 폰 세로(375×812) 둘 다. 서버 CSP 가 `style-src 'self'` 라 **인라인 `style=` 속성 금지**(JS 의 `element.style` 은 됨), 외부 폰트·이미지 링크 금지(모든 파일은 레포 안).
- 변경 후: `node --check` + `npm test` + HTML id ↔ JS `$("id")` 대조 + 브라우저 스크린샷을 `docs/evidence/` 에 남기고 `docs/planning/replies/NN_*.md` 에 기록.

## 코드 지도 (`prototype/`)

| 파일 | 역할 |
|---|---|
| `index.html` | 게임 셸: 장면(HUD·독·상세 패널·배치 트레이) + 팝업 시트 5개 + 전체 창(폰 만들기·성격·관계·공방·비교). 인라인 SVG 아이콘 스프라이트 |
| `style.css` | 토큰, 게임 버튼(`.gbtn`), 명판(`.plate`), 독, 시트/전체 창, 편집기·성격·관계. 분기는 `@container game (max-width: 820px)` |
| `world-design.css` | 장면·폰·활동 지점·상세 패널·배치 트레이·팝업 목록 |
| `skin.css` | **디자이너 그림 스킨**(9-slice border-image 등). 빼면 코드 그림으로 돌아감 |
| `fx.css` | 모션 연출(시간대 색조·먼지·발걸음·떠오르는 그림·Day 배너·버튼 통통) |
| `i18n.js` | 다국어. **사전 키 = 한국어 원문**. `T("한국어")`, `T("{name}…", {name})`, `tLife()`(시뮬레이션 문장), `applyStatic()`. 언어 변경 = localStorage `game1-lang` 저장 후 새로고침 |
| `app.js` | 화면 전환(screen/sheet), 얼굴 편집기, 성격, 저장/불러오기 파일, 관계 화면, 언어 선택 |
| `life-ui.js` | 월드 렌더: 카메라 `frameScene()`(방향별 배경·바닥 비율 `BACKGROUNDS`), 폰·말풍선, 상세 패널 탭 3개, 기록·관계·방문·목록 팝업, fx |
| `repeat.js` | A2 반복 효과 자격(PO-15): Day=⌊(480+tick)/1440⌋, 방향별 bucket, 하루 3회·60tick. 순수 함수 |
| `dialogue.js` | 폰 위 대화 말풍선 대사(개발용 임시, 김플레이 대사팩으로 교체). 기록→대사, 말투(친밀 지향)·따뜻함(애정·신뢰) 분리 |
| `relation-text.js` | 기억의 사실/해석/사유/해결 문구, 8축 이름·설명 |
| `accept.js` | 행동별 수락(PO-HAND-005): 대화=애정·친밀, 협력=존중, 위임=신뢰. 독립 거절 조건(바쁨·피로·경계·길막·비공개). seed 재현 `roll()` |
| `credit.js` | 제3자 기록 흐름: 도움 원천 → C 기록(목격 3칸) → B 열람 → 확인 부탁(OpenIssue) → 정정 → 전달 → B→C EVT-09. 실제 Conflict 는 만들지 않음(blocked). 저장 `state.credit` |
| `layout.js` | A1 배치 판정 순수 함수(경계·겹침·폰 칸·30칸·통로/고립)와 장소 변경 시 활동 중지. 미리보기·저장이 같은 판정을 쓴다 |
| `life.js`, `store.js`, `core/*` | 시뮬레이션·저장소·계약(core 는 `src/contracts/*.ts` 에서 생성). **UI 작업으로 건드리지 않는다** |
| `assets/` | 디자이너 조각: `background/ brand/ bubbles/ furniture/ log/ needs/ relation/ ui/(dock,hud,icon)`, 임시 예시 파츠 `six_layers/`, 임시 배경 `game1-cozy-room-v1.png` |

## 꼭 지킬 제품 원칙 (케이티정 리뷰, `docs/planning/persona/케이티정.md`)

1. 폰 얼굴은 **플레이어가 그린다.** 기본 얼굴을 주지 않는다. 디자이너 캐릭터는 "참고 예시"로만.
2. UI 가 창작 공간(방·폰)보다 커지면 안 된다. 상단은 명판·시계만, 나머지는 하단 독 7버튼의 팝업.
3. 관계는 숫자보다 장면(말풍선·이펙트)으로 느끼게. 숨은 수치만으로 설명하지 않는다.
4. 그림 안에 글자를 넣지 않는다(제목 명판만 언어별 그림). 새 문구는 반드시 `T()` + `i18n.js` en·ja 사전.
5. 세로 9:16 과 가로 16:9 둘 다 지원. 배경은 방향별 2장.

## 문서번호 (2026-10-13 부터 모든 문서는 번호로 주고받는다)

- 규칙과 목록은 `docs/00_문서대장.md`. 코드: `PO-NN`(김PO 기획·세부계획서, `docs/planning/source/`), `DEV-NN`(김도현 계획·회신, `docs/planning/`; 이전 `replies/NN` 은 그대로 DEV-NN), `REQ-NN`(김도현 → 김PO 요청서, `docs/planning/requests/`), `DES-NN`·`REL-NN`(김디자인·정연우 수신 자료, `docs/reference/`), `SB-NNNN`(Supabase 파일).
- 새 문서를 만들거나 받으면 반드시 대장에 한 줄 추가. 문서 첫머리에 번호·작성자·받는 사람·날짜·상태.
- 팀원(김디자인·정연우)에게 직접 보내지 않는다. 필요한 것(규격·파일명·확장자·검수 항목)을 `REQ-NN` 으로 김PO 에게 요청하고, 김PO 가 전달·관리한다.
- 현재 기준 기획서: **PO-13 전체개발계획서 v1.0**. 개발계획: **DEV-19**. 세부계획서는 단계마다 하나씩 요청(PO-14 부터).
- 팀원 역할 문서: `docs/planning/persona/` (김PO, 김디자인, 정연우, 케이티정).

## 디자이너·PO 협업

- 디자이너에게 보내는 문서: `docs/planning/동그란사이_케이티정_디자이너_회신_v*.md` (최신 v1.4 체크리스트 + v1.5 다국어). 받은 원본은 `docs/reference/design-YYYYMMDD-*/` 에 보관, 수정하지 않는다.
- 디자이너는 AI 생성 투명 WebP 시트로 조각을 준다. 자르기 도구는 `tools/slicer/` (sharp, 레포 의존성 아님: `cd tools/slicer && npm install` 후 사용).
- PO = 김PO. 결정 사항은 회신 문서의 "결정 기록"에 확정/가정/확인 필요로 구분해 적는다.

## 다음 할 일 (우선순위)

1. (완료 2026-10-13) 상대 경로 전환, `prototype/.nojekyll`·`CNAME`, `pages.yml`, CSP 메타, 계정 문서 교체. 배포 기록은 `docs/planning/replies/17_*.md`.
2. (완료 2026-10-13) SB-0002 계정·월드 저장 테이블 적용, RLS 테스트 31/31 (DEV-18). 브라우저 연결(익명 로그인·저장/복구, CSP `connect-src`)은 DEV-19 의 B0.5 단계에서.
3. **진행(2026-10-13 기준)**: A1 납품(DEV-20, 판정 대기) → A2 기반 납품(DEV-22) → PO-REQ-001 말풍선·관계창 기반(DEV-23) → PO-HAND-005 행동별 수락·제3자 기록 흐름·초기 관계 편차(DEV-24) → 저장·이력 보완(DEV-25: 원장 접기·save_format·credit pinning) → **다음: A1-10 → 로그인(PO-AUTH-001, SB-0003 설정 대기) → 계정 월드 저장(SB-0004) → 두 방(PO-ROOM-001) → 국소 공로 분쟁 250(정연우 검수 대기)** → STORY-C(PO-15 v1.1) → 두 번째 방 → A3 → B-ACCOUNT → B1.
   - store.js 의 `applyLifeCompletions` 가 완료 사건 → 반복 자격 → 원장·기억·태그를 한 commit 에서 처리(시험도 같은 함수 사용). 상한 대화는 `life.neutral_activity`(원장 아님). 정정 시 `rebuildTagHistory`.
   - 진단: `node scripts/game1_life_diagnostics.mjs 2000` (단계별 개수, 성격만/관계만 비교).
   - 기록 흐름 진단: `node scripts/game1_credit_diagnostics.mjs 2000 4` (변형 A/B × 배치, 도움→기록→누락→열람→정정→EVT-09).
   - 원장 접기: 살아 있는 사건 300 초과 시 인지 확정+어제 이전 사건을 방향별 `ledger_checkpoints` 로 접어 150. `save_format`=2, 더 새 형식 거절·옛 형식 `.backup-f1` 보관. **배포를 형식 2 이전 커밋으로 되돌리지 않는다.** 시험은 `configureHistory()` 로 작은 기준 사용.
   - 새 월드만 초기 관계 편차(±20, `INIT_RULE`). 앱은 `createLocalStore(storage, {initialSpread:true})`. 시험 fixture 는 옵션 없이 기존 기본값.
   - 이전 메모 — 단계 순서(PO-DEC-001): A1 공간 정합(**DEV-20 납품, 김PO 판정 대기**) → A2 관계 서사(PO-15 요청 중 = REQ-02, 반복 상한 Day 규칙은 DEV-20 6.2) → A3 AUTO22 실행 증거(PO-16) → B-ACCOUNT 계정 연결 → B1. B0 온라인 설계는 A2/A3 와 병행(PO-17).
   - **두 번째 방(사용자 결정 2026-10-13):** 이전 "아늑한 방" 배경·가구 그림(`prototype/assets/legacy-room/`)을 게임 안 두 번째 장소로 넣는다. **A2 다음, A3 전**에 한다(약 2~3일: 방 전환, 방별 배치 저장, 그림 속 침대·책장 자리를 막힌 칸으로 등록). PO-14 의 '방 1개'를 바꾸는 결정이므로 착수 전 세부계획서(REQ-04 로 요청)를 받는다.
   - 로컬 확인: 4173 포트는 이 PC 의 다른 프로세스가 쓰므로 `GAME1_PROTOTYPE_PORT=4199`. 시험 주소 옵션: `?debug=1`(저장 실패 1회 주입 `game1Debug.failNextSave()`), `?viewer=visitor`(비소유자 시점).
4. 디자이너 대기: 시안 글꼴 이름(없으면 나눔스퀘어라운드), 참고 예시 캐릭터 6레이어 세트(선택).
4. 아직 코드 그림인 화면: 폰 만들기·성격·관계 상세 전체 창 → 디자이너에게 시안 요청 후 스킨.
5. 온라인 기능(친구 방문·계정)은 Supabase 설계부터. 현재는 localStorage 만.
