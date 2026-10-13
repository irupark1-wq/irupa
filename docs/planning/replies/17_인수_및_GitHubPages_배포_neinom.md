# 2026-10-13 Claude(김도현) 인수 및 GitHub Pages 배포 — https://neinom.com

작성: 김도현(Claude). 대상: 김PO.

## 결론

- 《동그란 사이》가 **https://neinom.com** 에서 열립니다(GitHub Pages, HTTPS 강제, 인증서 승인됨). 푸시할 때마다 `.github/workflows/pages.yml` 이 테스트 114개를 돌린 뒤 `prototype/` 을 자동 배포합니다.
- 작업 폴더는 `C:\claude\donggeuran` 하나뿐이며, 이 폴더의 git 은 기존 저장소 `irupark1-wq/irupa` 의 이력(12커밋) 위에 올라가 있습니다. 다른 프로젝트의 저장소·Supabase·자격증명은 건드리지 않았습니다.
- Supabase 는 아직 코드에서 호출하지 않습니다. SQL·함수·secret 은 `supabase/` 폴더에 번호 순서로 누적해 두고, 김PO 님이 대시보드에서 직접 입력하는 방식으로 고정했습니다.

## 확정 / 가정 / 확인 필요

| 구분 | 내용 |
|---|---|
| 확정 | GitHub `irupark1-wq/irupa`, Supabase `yvsqivhdwzbshpapfcsy`, 도메인 neinom.com, 접두어 `game1_`, 폴더 `C:\claude\donggeuran` |
| 확정 | Supabase 입력은 김PO 가 직접. Claude 는 파일만 만든다 |
| 가정 | Windows 자격 증명 관리자의 `git:https://github.com` 항목(`irupark1-wq`, scope: repo·workflow)이 이 프로젝트 전용 계정이다 — 이 항목으로 push 가 성공했다. 다른 계정 `irupark500-cmd` 항목은 손대지 않았다 |
| 확인 필요 | Supabase 에 이전 개발자가 만든 `game1_` 객체가 실제로 있는지 — `supabase/README.md` 의 확인 SQL 결과 |

## 바꾼 것

| 항목 | 내용 | 이유 |
|---|---|---|
| 경로 | `index.html` 37곳, `app.js` 2곳, `life-ui.js` 5곳, `skin.css` 9곳, `style.css` 주석 2곳의 `/assets/...` → `./assets/...` | Pages 가 하위 경로로 서비스돼도 깨지지 않게. 커스텀 도메인(루트)에서도 동일 동작 |
| `prototype/.nojekyll` | 빈 파일 | Jekyll 처리 생략(밑줄 폴더·속도) |
| `prototype/CNAME` | `neinom.com` | 저장소 설정과 일치시켜 기록 |
| CSP 메타 | `index.html` 에 로컬 서버와 같은 CSP 추가 | Pages 는 헤더를 못 붙이므로 메타로 동일 보안 유지. Supabase 연결 시 `connect-src` 에 URL 추가 필요 |
| `.github/workflows/pages.yml` | checkout → Node 24 → `npm test` → configure-pages → upload `prototype/` → deploy. Action 은 commit SHA 고정 | 보안 기준 8 |
| `supabase/` | `migrations/0001_game1_security_baseline.sql`(docs/sql 에서 이동), `README.md`(적용 기록·확인 SQL) | 누적 관리 |
| 문서 | `CLAUDE.md` 계정 절, `AGENTS.md`·`README.md` 계정·폴더 교체, `.gitattributes`(LF 고정) | 다음 세션 혼동 방지 |

## 실행해 확인한 것

- `npm test` 114개 통과(로컬, 경로 수정 후). `node --check` app.js·life-ui.js 통과.
- 로컬 서버(포트 4199 — 4173 은 다른 프로세스가 쓰고 있어 비움)에서 index·css·js·png 200.
- `git push` → Actions `game1-pages` 성공, `game1-security` 성공.
- https://neinom.com 에서 index(30 KB)·skin.css·i18n.js·독 바·가로 배경 PNG 모두 200. 브라우저 콘솔 오류 0. 첫 화면(폰 만들기)이 디자이너 스킨으로 표시됨 — `docs/evidence/game1-pages-v1-desktop.jpg`, `game1-pages-v1-mobile.jpg`.
- GitHub Pages 설정(API 조회): build_type=workflow, cname=neinom.com, https_enforced=true, 인증서 neinom.com·www.neinom.com 승인(2027-01-11 만료, 자동 갱신).

## 하지 않은 것 / 한계

- 실기기(폰) 터치·그리기·저장 흐름은 이번에 확인하지 않았다(브라우저 창 크기 흉내만).
- 포트 4173 을 점유한 프로세스(PID 6788)는 다른 프로젝트일 수 있어 종료하지 않았다. 로컬 확인은 `GAME1_PROTOTYPE_PORT=4199` 로 했다. `.claude/launch.json` 도 4199 로 바꿨다.
- Supabase 는 호출·변경 없음.

## 다음 작업 제안

1. **Supabase 1차 설계** — 확인 SQL 결과를 받은 뒤 `0002_game1_core.sql`: 익명/이메일 계정, 월드 저장(현재 localStorage 레코드를 서버에 백업·복구), RLS·`game1_private`. 브라우저에는 publishable key 만.
2. 디자이너 라운드: 폰 만들기·성격·관계 전체 창 시안(케이티정 형식 v1.6).
3. 글꼴: 디자이너 답 없으면 나눔스퀘어라운드 woff2 를 `assets/fonts/` 에 넣고 `style.css` 주석 해제(이미 상대 경로로 바꿔 둠).
