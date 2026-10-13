-- 0002_rls_check.sql — 0002_game1_core.sql 적용 뒤 거부·허용 테스트
-- 실행: Supabase 대시보드 SQL Editor(postgres 역할). 전체가 BEGIN ... ROLLBACK 이라 DB 에 아무것도 남지 않는다.
-- 결과: 마지막 SELECT 가 단계별 PASS/FAIL 표를 보여 준다. pass 열이 전부 true 여야 한다.
-- 시험 사용자: 아래 두 고정 uuid 를 auth.users 에 임시로 넣는다(트랜잭션 안, 롤백됨).
--   auth.users INSERT 권한 오류가 나면 → 대시보드 Authentication 에서 사용자 2명을 만들고
--   그 uuid 로 아래 'A','B' 값을 바꾼 뒤 "insert into auth.users" 문을 지우고 다시 실행한다.
-- 역할 전환: set_config('role', 'authenticated' | 'anon', true) + request.jwt.claims(sub). PostgREST 가 하는 일을 흉내낸다.

begin;

create temp table game1_test_users (label text primary key, id uuid not null);
insert into game1_test_users values
  ('A', 'a0000000-0000-4000-8000-00000000000a'),
  ('B', 'b0000000-0000-4000-8000-00000000000b');

-- 시험용 익명 사용자 2명(롤백됨). 기존 사용자를 쓰면 이 문장을 지운다.
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()
  from game1_test_users;

create temp table game1_test_results (
  seq      serial primary key,
  step     text,
  expected text,
  result   text,
  pass     boolean
);

-- ---------------------------------------------------------------------------
-- T00 카탈로그: RLS 켜짐, anon 권한 없음, authenticated 는 함수 실행만, game1_private 접근 불가
-- ---------------------------------------------------------------------------
insert into game1_test_results (step, expected, result, pass)
select 'T00a game1_profiles RLS 활성', 'true', relrowsecurity::text, relrowsecurity
  from pg_class where oid = 'public.game1_profiles'::regclass;
insert into game1_test_results (step, expected, result, pass)
select 'T00b game1_worlds RLS 활성', 'true', relrowsecurity::text, relrowsecurity
  from pg_class where oid = 'public.game1_worlds'::regclass;
insert into game1_test_results (step, expected, result, pass)
select 'T00c anon 은 game1_worlds SELECT 불가', 'false', v::text, not v
  from (select has_table_privilege('anon', 'public.game1_worlds', 'select') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00d anon 은 game1_save_world 실행 불가', 'false', v::text, not v
  from (select has_function_privilege('anon', 'public.game1_save_world(jsonb, integer)', 'execute') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00e authenticated 는 game1_save_world 실행 가능', 'true', v::text, v
  from (select has_function_privilege('authenticated', 'public.game1_save_world(jsonb, integer)', 'execute') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00f authenticated 는 game1_private 스키마 USAGE 없음', 'false', v::text, not v
  from (select has_schema_privilege('authenticated', 'game1_private', 'usage') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00g authenticated 는 version 열 UPDATE 불가', 'false', v::text, not v
  from (select has_column_privilege('authenticated', 'public.game1_worlds', 'version', 'update') v) s;

-- ---------------------------------------------------------------------------
-- T01~T02 익명(anon) 역할: 테이블·함수 모두 거부
-- ---------------------------------------------------------------------------
do $$
declare r text; n integer;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.game1_profiles;
    r := 'rows ' || n;
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass)
  values ('T01 anon SELECT game1_profiles', 'ERR 42501', r, r = 'ERR 42501');
end $$;

do $$
declare r text;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
  begin
    r := public.game1_save_world('{"schema_version":1,"pawns":[]}'::jsonb, 0)::text;
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass)
  values ('T02 anon rpc game1_save_world', 'ERR 42501', r, r = 'ERR 42501');
end $$;

-- ---------------------------------------------------------------------------
-- T03 authenticated 이지만 sub 없음(auth.uid() null): 저장 거부, 조회 0행
-- ---------------------------------------------------------------------------
do $$
declare r text; n integer;
begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'authenticated', true);
  begin
    r := public.game1_save_world('{"schema_version":1,"pawns":[]}'::jsonb, 0)::text;
  exception when others then r := 'ERR ' || sqlerrm;
  end;
  select count(*) into n from public.game1_worlds;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass)
  values ('T03a sub 없는 authenticated 저장', 'ERR save.not_authenticated', r, r = 'ERR save.not_authenticated');
  insert into game1_test_results (step, expected, result, pass)
  values ('T03b sub 없는 authenticated 조회', 'rows 0', 'rows ' || n, n = 0);
end $$;

-- ---------------------------------------------------------------------------
-- T04~T08 사용자 A: 첫 저장, 버전 충돌, 두 번째 저장, 직접 UPDATE 시 버전 자동 증가, 소유자 변경 거부
-- ---------------------------------------------------------------------------
do $$
declare a uuid := (select id from game1_test_users where label = 'A');
        w jsonb := '{"schema_version":1,"version":0,"authority":1,"pawns":[],"events":[],"sessions":[],"structures":{"resources":[],"roles":[],"commitments":[],"conflicts":[]},"memories":[],"tag_history":{},"receipts":{}}';
        r text; np integer; nw integer; v integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('role', 'authenticated', true);

  begin r := public.game1_save_world(w, 0)::text; exception when others then r := 'ERR ' || sqlerrm; end;
  select count(*) into np from public.game1_profiles;
  select count(*), max(version) into nw, v from public.game1_worlds;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T04a A 첫 저장(기대 0) → 1', '1', r, r = '1'),
    ('T04b A 프로필 자동 생성', 'rows 1', 'rows ' || np, np = 1),
    ('T04c A 월드 1행 version 1', 'rows 1 v 1', 'rows ' || nw || ' v ' || coalesce(v::text, 'null'), nw = 1 and v = 1);

  perform set_config('role', 'authenticated', true);
  begin r := public.game1_save_world(w, 0)::text; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T05 A 같은 기대 버전(0) 재저장 → 충돌', 'ERR save.version_conflict', r, r = 'ERR save.version_conflict');

  perform set_config('role', 'authenticated', true);
  begin r := public.game1_save_world(w, 1)::text; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T06 A 저장(기대 1) → 2', '2', r, r = '2');

  perform set_config('role', 'authenticated', true);
  begin
    update public.game1_worlds set client_saved_at = now();
    select version into v from public.game1_worlds;
    r := v::text;
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T07 A 직접 UPDATE 후 version 자동 3', '3', r, r = '3');

  perform set_config('role', 'authenticated', true);
  begin
    update public.game1_worlds set user_id = (select id from game1_test_users where label = 'B');
    r := 'updated';
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T08 A 가 user_id 변경 시도 → 거부', 'ERR 42501', r, r = 'ERR 42501');
end $$;

-- ---------------------------------------------------------------------------
-- T09~T14 사용자 B: 타인 행 안 보임, 타인 행 INSERT/UPDATE 거부, 프로필 없이 월드 INSERT 거부(FK), 본인 저장 허용
-- ---------------------------------------------------------------------------
do $$
declare a uuid := (select id from game1_test_users where label = 'A');
        b uuid := (select id from game1_test_users where label = 'B');
        w jsonb := '{"schema_version":1,"pawns":[]}';
        r text; n integer; va integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.game1_worlds;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T09 B 는 A 월드 못 봄', 'rows 0', 'rows ' || n, n = 0);

  perform set_config('role', 'authenticated', true);
  begin
    insert into public.game1_profiles (user_id) values (a);
    r := 'inserted';
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T10 B 가 A 프로필 INSERT → RLS 거부', 'ERR 42501', r, r = 'ERR 42501');

  perform set_config('role', 'authenticated', true);
  begin
    insert into public.game1_worlds (user_id, world) values (a, w);
    r := 'inserted';
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T11 B 가 A 월드 INSERT → RLS 거부', 'ERR 42501', r, r = 'ERR 42501');

  perform set_config('role', 'authenticated', true);
  begin
    insert into public.game1_worlds (user_id, world) values (b, w);  -- B 프로필 없음
    r := 'inserted';
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T12 프로필 없는 B 의 월드 직접 INSERT → FK 거부', 'ERR 23503', r, r = 'ERR 23503');

  perform set_config('role', 'authenticated', true);
  begin
    insert into public.game1_worlds (user_id, world, version) values (b, w, 99);
    r := 'inserted';
  exception when others then r := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T13 B 가 version 열 직접 지정 → 열 권한 거부', 'ERR 42501', r, r = 'ERR 42501');

  perform set_config('role', 'authenticated', true);
  begin r := public.game1_save_world(w, 0)::text; exception when others then r := 'ERR ' || sqlerrm; end;
  begin
    update public.game1_worlds set client_saved_at = now();   -- WHERE 없이: RLS 로 본인 행만
    get diagnostics n = row_count;
  exception when others then n := -1;
  end;
  perform set_config('role', 'none', true);
  select version into va from public.game1_worlds where user_id = a;   -- postgres(소유자)는 RLS 우회
  insert into game1_test_results (step, expected, result, pass) values
    ('T14a B 본인 첫 저장 → 1', '1', r, r = '1'),
    ('T14b B 의 WHERE 없는 UPDATE 는 본인 1행만', 'rows 1', 'rows ' || n, n = 1),
    ('T14c A 월드 version 그대로 3', '3', coalesce(va::text, 'null'), va = 3);
end $$;

-- ---------------------------------------------------------------------------
-- T15~T17 입력 검증: 잘못된 저장본, 긴 display_name, 뒤처진 기대 버전
-- ---------------------------------------------------------------------------
do $$
declare a uuid := (select id from game1_test_users where label = 'A');
        r1 text; r2 text; r3 text; r4 text; r5 text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('role', 'authenticated', true);

  begin r1 := public.game1_save_world('{"schema_version":1,"pawns":[1,2,3,4]}'::jsonb, 3)::text; exception when others then r1 := 'ERR ' || sqlerrm; end;
  begin r2 := public.game1_save_world('{"pawns":[]}'::jsonb, 3)::text;                           exception when others then r2 := 'ERR ' || sqlerrm; end;
  begin r3 := public.game1_save_world('[]'::jsonb, 3)::text;                                     exception when others then r3 := 'ERR ' || sqlerrm; end;
  begin r4 := public.game1_save_world('{"schema_version":1,"pawns":[]}'::jsonb, 2)::text;        exception when others then r4 := 'ERR ' || sqlerrm; end;
  begin
    update public.game1_profiles set display_name = repeat('가', 21);
    r5 := 'updated';
  exception when others then r5 := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values
    ('T15a pawns 4개 → 거부', 'ERR save.invalid_data', r1, r1 = 'ERR save.invalid_data'),
    ('T15b schema_version 없음 → 거부', 'ERR save.invalid_data', r2, r2 = 'ERR save.invalid_data'),
    ('T15c 객체 아님 → 거부', 'ERR save.invalid_data', r3, r3 = 'ERR save.invalid_data'),
    ('T16 뒤처진 기대 버전(2, 현재 3) → 충돌', 'ERR save.version_conflict', r4, r4 = 'ERR save.version_conflict'),
    ('T17 display_name 21자 → CHECK 거부', 'ERR 23514', r5, r5 = 'ERR 23514');
end $$;

-- ---------------------------------------------------------------------------
-- 결과표 (pass 가 전부 true 여야 함)
-- ---------------------------------------------------------------------------
select seq, step, expected, result, pass,
       (select count(*) filter (where not pass) from game1_test_results) as fail_total
  from game1_test_results
 order by seq;

rollback;
