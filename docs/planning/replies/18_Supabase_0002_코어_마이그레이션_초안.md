# 18. Supabase 0002 코어 마이그레이션 초안 (2026-10-13)

받는 사람: 김PO. 작성: Claude(김도현). 상태: **2026-10-13 김PO 가 적용 완료, RLS 테스트 31/31 통과. push 는 아직.**

## 한 줄 요약

익명 로그인 → 이메일 연결 전제로 `game1_profiles`(소유자 1행)·`game1_worlds`(월드 저장본 + 서버 버전) 테이블, 본인 행만 허용하는 RLS, 낙관적 잠금 저장 함수 `game1_save_world` 를 `supabase/migrations/0002_game1_core.sql` 로 만들고, 거부·허용 테스트 31건을 `supabase/tests/0002_rls_check.sql` 로 붙였습니다. 적용 순서와 확인 방법은 `supabase/README.md` 에 있습니다.

## 만든 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/0002_game1_core.sql` | 테이블 2, RLS 정책 6, 트리거 2(`game1_private`), 저장 함수 1(`public`). 한 트랜잭션 |
| `supabase/tests/0002_rls_check.sql` | anon 거부, sub 없는 토큰 거부, 타인 행 조회·INSERT·UPDATE 차단, 프로필 없는 월드 INSERT 거부(FK), 버전 충돌, 직접 UPDATE 시 버전 자동 증가, 잘못된 저장본·긴 이름 거부. BEGIN…ROLLBACK |
| `supabase/README.md` | 적용 기록 표에 0002 행, 적용 순서 6단계, 설계 요약, 로컬 검증 기록 |
| `SECURITY.md` | 2026-10-13 항목 추가 |

## 결정 기록

| 구분 | 내용 |
|---|---|
| 확정(지시) | 익명 로그인 + 이메일 연결. RLS 본인 행만, UPDATE 는 USING·WITH CHECK. anon 역할 접근 불가. SECURITY INVOKER·고정 search_path. 브라우저 코드 미수정. 커밋만, push 없음 |
| 가정 | 1 사용자 = 월드 1개(슬롯 없음). `version` 은 서버만 올린다(없음 0 → 첫 저장 1). 첫 저장이 프로필을 함께 만든다(= 게임1 참여). 저장본 상한은 `store.js` 와 같게(pawns ≤3, 32MiB) |
| 가정(지시와 다른 점) | 저장 함수를 **`public`** 에 두었습니다. 지시는 `game1_private` 였지만 브라우저(PostgREST rpc)는 public 함수만 호출할 수 있고, private 에 두고 래퍼로 부르려면 0001 이 회수한 스키마 USAGE 를 되돌려야 합니다. `game1_private` 에는 클라이언트가 못 부르는 트리거 함수 2개를 두었습니다. 다르게 원하시면 알려 주세요 |
| 확인 필요 | 0001 이 실제 적용돼 있는지(README 확인 SQL). 테스트 중 `auth.users` INSERT 권한(안 되면 README 3단계 대안) |

## 검증

- 로컬에 PostgreSQL 이 없어 실행은 못 했고, PostgreSQL 17 파서(libpg_query WASM)로 SQL 문법과 PL/pgSQL 본문을 검사했습니다. 결과는 `supabase/README.md` "로컬 검증 기록" 에 있습니다.
- 실제 동작 검증은 김PO 가 0002 적용 후 테스트 파일을 실행해 `fail_total = 0` 을 확인하는 것으로 합니다.
- `npm test` 는 이번 변경과 무관(브라우저 코드 미수정)하지만 실행해 기존 114개 통과를 확인했습니다.

## 다음

1. 김PO: README 의 0002 적용 순서 1~6 수행 → 결과 회신.
2. Claude: 적용 확인 후 `prototype/` 에 Supabase 클라이언트 연결(publishable key 만, CSP `connect-src` 추가), 익명 로그인·저장/복구 UI, 다국어 문구.
3. 후속 설계: 친구 방문용 공개 DTO 뷰(비공개 욕구·성격 제외), 저장 요청 제한, 계정 삭제.

## 적용 결과 (2026-10-13, 김PO 실행)

- 0002 적용: Success. No rows returned.
- `tests/0002_rls_check.sql`: 31건 전부 pass, fail_total 0. anon 거부·sub 없는 토큰 거부·타인 행 차단·FK·버전 충돌·입력 검증 모두 기대대로.
- 2026-10-13 추가 확인(김PO): Advisors → Security 경고 0건, Anonymous sign-ins 켬, Site URL neinom.com 설정됨. Email provider 는 이메일 연결 구현 전에 재확인.
