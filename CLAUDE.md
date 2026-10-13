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
npm test         # 114개 통과해야 함 (core/·store·life 계약)
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
| `life.js`, `store.js`, `core/*` | 시뮬레이션·저장소·계약(core 는 `src/contracts/*.ts` 에서 생성). **UI 작업으로 건드리지 않는다** |
| `assets/` | 디자이너 조각: `background/ brand/ bubbles/ furniture/ log/ needs/ relation/ ui/(dock,hud,icon)`, 임시 예시 파츠 `six_layers/`, 임시 배경 `game1-cozy-room-v1.png` |

## 꼭 지킬 제품 원칙 (케이티정 리뷰, `docs/planning/persona/케이티정.md`)

1. 폰 얼굴은 **플레이어가 그린다.** 기본 얼굴을 주지 않는다. 디자이너 캐릭터는 "참고 예시"로만.
2. UI 가 창작 공간(방·폰)보다 커지면 안 된다. 상단은 명판·시계만, 나머지는 하단 독 7버튼의 팝업.
3. 관계는 숫자보다 장면(말풍선·이펙트)으로 느끼게. 숨은 수치만으로 설명하지 않는다.
4. 그림 안에 글자를 넣지 않는다(제목 명판만 언어별 그림). 새 문구는 반드시 `T()` + `i18n.js` en·ja 사전.
5. 세로 9:16 과 가로 16:9 둘 다 지원. 배경은 방향별 2장.

## 디자이너·PO 협업

- 디자이너에게 보내는 문서: `docs/planning/동그란사이_케이티정_디자이너_회신_v*.md` (최신 v1.4 체크리스트 + v1.5 다국어). 받은 원본은 `docs/reference/design-YYYYMMDD-*/` 에 보관, 수정하지 않는다.
- 디자이너는 AI 생성 투명 WebP 시트로 조각을 준다. 자르기 도구는 `tools/slicer/` (sharp, 레포 의존성 아님: `cd tools/slicer && npm install` 후 사용).
- PO = 김PO. 결정 사항은 회신 문서의 "결정 기록"에 확정/가정/확인 필요로 구분해 적는다.

## 다음 할 일 (우선순위)

1. (완료 2026-10-13) 상대 경로 전환, `prototype/.nojekyll`·`CNAME`, `pages.yml`, CSP 메타, 계정 문서 교체. 배포 기록은 `docs/planning/replies/17_*.md`.
2. Supabase 설계: `supabase/README.md` 의 확인 SQL 결과를 사용자에게 받은 뒤 `game1_` 스키마(계정·월드 저장·친구 방문) 마이그레이션 작성. 브라우저 연결 시 `index.html` CSP 의 `connect-src` 에 Supabase URL 추가.
3. 디자이너 대기: 시안 글꼴 이름(없으면 나눔스퀘어라운드), 참고 예시 캐릭터 6레이어 세트(선택).
4. 아직 코드 그림인 화면: 폰 만들기·성격·관계 상세 전체 창 → 디자이너에게 시안 요청 후 스킨.
5. 온라인 기능(친구 방문·계정)은 Supabase 설계부터. 현재는 localStorage 만.
