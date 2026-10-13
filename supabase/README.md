# Supabase (게임1 · 동그란 사이)

- 프로젝트: `yvsqivhdwzbshpapfcsy` (https://supabase.com/dashboard/project/yvsqivhdwzbshpapfcsy). **이 프로젝트 전용.** 다른 프로젝트(Restiq·SoojiN·Sigmate·Oryxa 등)의 Supabase 와 절대 섞지 않는다.
- 적용 방식: Claude(김도현)가 `migrations/NNNN_*.sql`, `tests/NNNN_*.sql`, `functions/<name>/`, `secrets.md` 를 만들어 두면 **김PO 가 대시보드에서 직접 입력**한다. Claude 는 Supabase 에 직접 접속하지 않고 키도 받지 않는다.
- 이름 규칙: DB 객체·Edge Function `game1_`, 내부 스키마 `game1_private`, secret·환경변수 `GAME1_`.
- 파일은 번호 순서대로 누적한다. 이미 적용한 파일도 지우지 않는다(이력). 적용 여부는 아래 표에 기록한다.

## 적용 기록

| 파일 | 내용 | 상태 |
|---|---|---|
| `migrations/0001_game1_security_baseline.sql` | `game1_private` 스키마, 기본 권한 회수(이전 개발자 작성) | 적용됨(0002 가 `game1_private` 에 함수를 만들며 성공했고 T00f 통과로 확인) |
| `migrations/0002_game1_core.sql` | `game1_profiles`(소유자 1행), `game1_worlds`(월드 저장본 jsonb + 서버 버전), RLS 6정책, 트리거 2개(`game1_private`), 저장 함수 `public.game1_save_world(jsonb, integer)` | **적용됨 2026-10-13** (김PO 가 SQL Editor 에서 실행, "Success. No rows returned") |
| `tests/0002_rls_check.sql` | 0002 거부·허용 테스트 31건(anon 거부, 타인 행 차단, 버전 충돌, 입력 검증). BEGIN…ROLLBACK 이라 흔적 없음 | **실행 완료 2026-10-13: 31/31 PASS, fail_total 0** |

## 0002 적용 순서 (김PO) — 1~3 완료 2026-10-13, 4~6 남음

1. **0001 확인**: 아래 "현재 상태 확인 SQL" 을 실행해 결과에 `schema | game1_private` 행이 있는지 본다. 없으면 `migrations/0001_game1_security_baseline.sql` 을 먼저 실행한다(0002 는 `game1_private` 스키마가 있어야 한다).
2. **0002 적용**: 대시보드 → SQL Editor → New query → `migrations/0002_game1_core.sql` 전체를 붙여 넣고 Run. 파일 안에 `begin; … commit;` 이 있어서 중간에 실패하면 아무것도 남지 않는다. 성공하면 "Success. No rows returned" 류의 메시지만 나온다.
3. **테스트**: 새 query 에 `tests/0002_rls_check.sql` 전체를 붙여 넣고 Run. 마지막 결과표에서 **`pass` 열이 모두 true, `fail_total` 이 0** 이어야 한다. 파일 끝이 `rollback;` 이라 시험 사용자·행은 모두 사라진다.
   - `permission denied for table users` 가 나오면: Authentication → Users 에서 "Add user" 로 사용자 2명을 만들고, 그 UUID 를 테스트 파일 상단 `'A'`, `'B'` 값에 넣은 뒤 `insert into auth.users …` 문장을 지우고 다시 실행한다.
4. **Security Advisors**: 대시보드 → Advisors → Security 에서 새 경고가 0건인지 본다(RLS 미활성·SECURITY DEFINER 경고가 없어야 함).
5. **Auth 설정**(코드 연결 전에): Authentication → Providers → **Anonymous sign-ins 켜기**, Email 켜기(이메일 연결용). Authentication → URL Configuration 에 `https://neinom.com` 을 Site URL/Redirect 에 넣는다. Attack protection 의 CAPTCHA·요청 제한은 외부 알파 전에 검토.
6. 결과(확인 SQL 결과 전체, 테스트 결과표의 fail_total, Advisors 경고 수)를 Claude 에게 알려 준다. Claude 가 이 표의 상태를 "적용됨(날짜)" 로 바꾸고, 그다음에 브라우저 코드(`prototype/`)에 Supabase 연결을 넣는다.

## 0002 설계 요약

- **인증 모델**: 첫 진입은 익명 로그인(`signInAnonymously`), 나중에 이메일 연결(`updateUser({email})`). 익명 사용자도 JWT `role` 은 `authenticated` 이므로 정책은 "로그인 여부"가 아니라 `auth.uid() = user_id` 로만 허용한다. `anon` 역할(로그인 전)은 테이블·함수에 아무 권한이 없다.
- **`public.game1_profiles`**: `user_id`(PK, `auth.users` FK, cascade), `display_name`(≤20자), 시각. 이 행이 있어야 게임1 참여자다. 같은 Supabase 의 다른 게임 사용자는 이 행이 없으면 월드를 만들 수 없다(FK).
- **`public.game1_worlds`**: `user_id`(PK, profiles FK), `version`(서버가 올림: 없음=0 → 첫 저장=1), `world` jsonb(localStorage 레코드 `game1-local-a-v1` 전체), `client_saved_at`. CHECK: 객체·`schema_version=1`·`pawns` ≤3·≤32MiB (`prototype/store.js` 의 `validateState` 상한과 동일).
- **RLS**: 두 테이블 모두 select/insert/update 본인 행만, UPDATE 는 USING·WITH CHECK 둘 다, `to authenticated`. DELETE 정책·권한 없음(계정 삭제 cascade 로만).
- **권한**: `authenticated` 에 select 전체, insert/update 는 열 단위(`user_id, world, client_saved_at` / `world, client_saved_at`). `version`·`created_at`·`updated_at` 은 클라이언트가 쓸 수 없고 트리거가 설정한다(직접 UPDATE 를 해도 version 이 1 오른다).
- **`game1_private`**: 트리거 함수 2개(`game1_profiles_before_write`, `game1_worlds_before_write`, SECURITY INVOKER, `search_path=''`). 트리거 함수는 CREATE TRIGGER 시점에만 EXECUTE 를 검사하므로 클라이언트 권한 없이 동작하며 직접 호출은 불가. 테이블은 아직 없음.
- **`public.game1_save_world(p_world jsonb, p_expected_version integer) returns integer`**: SECURITY INVOKER, `search_path=''`, 모든 객체 스키마 한정. 본인 행을 `for update` 로 잠근 뒤 기대 버전과 비교. 불일치 → 예외 `save.version_conflict`(detail 에 expected/current). 잘못된 저장본 → `save.invalid_data`, 로그인 없음 → `save.not_authenticated`. 첫 저장(기대 0)은 프로필이 없으면 함께 만든다. 반환값은 새 version. 오류 키는 `prototype/store.js` 와 같은 이름을 쓴다.
  - 함수가 `game1_private` 가 아니라 `public` 에 있는 이유: 브라우저(PostgREST `rpc`)는 노출 스키마(public)의 함수만 부를 수 있고, `game1_private` 에 두고 public 래퍼로 부르려면 0001 이 회수한 스키마 USAGE 를 `authenticated` 에 되돌려야 하기 때문. 내부용(트리거)만 `game1_private` 에 둔다.
- **아직 없는 것(후속)**: 친구 방문용 타인 월드 읽기 정책(공개 DTO 뷰로 설계 예정, 현재 저장본에는 비공개 욕구·성격이 들어 있어 그대로 노출 불가), 저장 요청 제한(rate limit), 월드 다중 슬롯, 계정 삭제 UI, service_role 을 쓰는 Edge Function.

## 로컬 검증 기록 (Claude, 2026-10-13)

- 로컬에 PostgreSQL·Docker 가 없어 실행 검증은 못 했다. 대신 PostgreSQL 17 파서(libpg_query WASM: `@pgsql/parser` 1.5.0 으로 SQL 문 44+20+10개, `libpg-query` 18.1.5 의 `parsePlPgSQL` 로 plpgsql 본문 9개 = 함수 3 + DO 6. 레포 밖 임시 폴더에 설치, 레포 의존성 아님)로 세 파일(0001·0002·tests/0002)을 파싱해 **문법 오류 0건**. 고의로 깨뜨린 SQL·plpgsql 은 FAIL 로 잡히는지 확인함.
- 파서가 못 잡는 것(실행 시에만 드러남): 객체 존재 여부(`auth.uid()`, `auth.users` 열), 권한, 트리거 실행 권한 가정. 그래서 `tests/0002_rls_check.sql` 이 실제 적용 직후의 검증이다.
- 수동 검토 포인트: CHECK 제약은 NULL 이면 통과하므로 키 누락이 false 가 되게 `is not distinct from`/`case` 로 썼다. `jsonb_array_length` 는 배열이 아니면 오류를 내므로 CASE 로 순서를 고정했다. `select auth.uid()` 는 정책 안에서 `(select …)` 로 감싸 행마다 재평가되지 않게 했다.

## 현재 상태 확인 SQL (SQL Editor 에서 실행 후 결과를 Claude 에게 알려 주세요)

```sql
select 'schema' as kind, nspname as name from pg_namespace where nspname like 'game1%'
union all
select 'table', table_schema || '.' || table_name from information_schema.tables where table_name like 'game1_%' or table_schema like 'game1%'
union all
select 'function', n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname like 'game1_%' or n.nspname like 'game1%'
order by 1, 2;
```

0002 적용 후 기대 결과: `schema game1_private`, `table public.game1_profiles`, `table public.game1_worlds`, `function game1_private.game1_profiles_before_write`, `function game1_private.game1_worlds_before_write`, `function public.game1_save_world`.
