-- 0004_account_worlds_check.sql — 0004_game1_account_worlds.sql 적용 뒤 거부·허용 시험
-- 실행: Supabase 대시보드 SQL Editor(postgres 역할). 전체가 BEGIN ... ROLLBACK 이라 DB 에 아무것도 남지 않는다.
-- 결과: 마지막 SELECT 의 pass 열이 전부 true, fail_total 이 0 이어야 한다.
-- 시험 사용자 2명을 auth.users 에 임시로 넣는다(롤백됨). 권한 오류가 나면 SB-0002 시험과 같은 방법으로 실제 사용자 uuid 를 쓴다.
-- 동시 요청으로 3월드 상한을 넘는지는 한 세션에서 재현할 수 없다. 대신 advisory lock 사용(T00i)과 순차 상한(T08)을 확인한다.

begin;

create temp table game1_test_users (label text primary key, id uuid not null);
insert into game1_test_users values
  ('A', 'a0000000-0000-4000-8000-0000000000a4'),
  ('B', 'b0000000-0000-4000-8000-0000000000b4');
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', false, now(), now()
  from game1_test_users;

create temp table game1_test_results (seq serial primary key, step text, expected text, result text, pass boolean);

create temp table game1_test_ids (k text primary key, v uuid);

-- 시험 세계(앱 저장본과 같은 최소 모양)
create temp table game1_test_world (k text primary key, w jsonb);
insert into game1_test_world values
  ('w1', '{"save_format":2,"schema_version":1,"version":3,"authority":1,"pawns":[{"id":"p1"}],"events":[],"sessions":[],"structures":{},"memories":[],"tag_history":{},"receipts":{}}'),
  ('w2', '{"save_format":2,"schema_version":1,"version":4,"authority":1,"pawns":[{"id":"p1"},{"id":"p2"}],"events":[],"sessions":[],"structures":{},"memories":[],"tag_history":{},"receipts":{}}'),
  ('future', '{"save_format":9,"schema_version":1,"pawns":[]}'),
  ('bad', '{"schema_version":1,"pawns":[1,2,3,4]}');

-- ---------------------------------------------------------------------------
-- T00 카탈로그
-- ---------------------------------------------------------------------------
insert into game1_test_results (step, expected, result, pass)
select 'T00a RLS 활성', 'true', relrowsecurity::text, relrowsecurity from pg_class where oid = 'public.game1_account_worlds'::regclass;
insert into game1_test_results (step, expected, result, pass)
select 'T00b anon SELECT 불가', 'false', v::text, not v from (select has_table_privilege('anon', 'public.game1_account_worlds', 'select') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00c anon create 실행 불가', 'false', v::text, not v from (select has_function_privilege('anon', 'public.game1_create_account_world(text, text, jsonb, text)', 'execute') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00d anon update 실행 불가', 'false', v::text, not v from (select has_function_privilege('anon', 'public.game1_update_account_world(uuid, jsonb, text, integer)', 'execute') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00e authenticated create 실행 가능', 'true', v::text, v from (select has_function_privilege('authenticated', 'public.game1_create_account_world(text, text, jsonb, text)', 'execute') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00f version 열 UPDATE 불가', 'false', v::text, not v from (select has_column_privilege('authenticated', 'public.game1_account_worlds', 'version', 'update') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00g user_id 열 UPDATE 불가', 'false', v::text, not v from (select has_column_privilege('authenticated', 'public.game1_account_worlds', 'user_id', 'update') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00h 정책 4개(select·insert·update·delete)', '4', count(*)::text, count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'game1_account_worlds';
insert into game1_test_results (step, expected, result, pass)
select 'T00i 트리거가 advisory lock 사용', 'true', v::text, v from (select position('pg_advisory_xact_lock' in prosrc) > 0 v from pg_proc where proname = 'game1_account_worlds_before_write') s;

-- ---------------------------------------------------------------------------
-- T01 anon: 함수·표 모두 거부
-- ---------------------------------------------------------------------------
do $$
declare r text;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
  begin perform public.game1_list_account_worlds(); r := 'ok'; exception when others then r := 'ERR ' || sqlstate; end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values ('T01 anon 목록', 'ERR 42501', r, r = 'ERR 42501');
end $$;

-- ---------------------------------------------------------------------------
-- T02~T09 사용자 A
-- ---------------------------------------------------------------------------
do $$
declare a uuid := (select id from game1_test_users where label = 'A');
        b uuid := (select id from game1_test_users where label = 'B');
        w1 jsonb := (select w from game1_test_world where k = 'w1');
        w2 jsonb := (select w from game1_test_world where k = 'w2');
        wf jsonb := (select w from game1_test_world where k = 'future');
        wb jsonb := (select w from game1_test_world where k = 'bad');
        r text; id1 uuid; id2 uuid; v integer; c boolean; n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('role', 'authenticated', true);

  select world_id, version, created into id1, v, c from public.game1_create_account_world('lineage-A-0001', '첫 월드', w1, 'fingerprint-A-one-0001');
  perform set_config('role', 'none', true); insert into game1_test_ids values ('A1', id1); perform set_config('role', 'authenticated', true);
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T02 A 새 월드 → version 1, created', '1 true', v || ' ' || c, v = 1 and c); perform set_config('role', 'authenticated', true);

  select world_id, version, created into id2, v, c from public.game1_create_account_world('lineage-A-0001', '첫 월드', w1, 'fingerprint-A-one-0001');
  select count(*) into n from public.game1_account_worlds;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T03 같은 계보·같은 지문 재전송 → 같은 월드, 복제 0', 'same 1 false rows 1', (id2 = id1) || ' ' || v || ' ' || c || ' rows ' || n, id2 = id1 and v = 1 and not c and n = 1); perform set_config('role', 'authenticated', true);

  begin perform public.game1_create_account_world('lineage-A-0001', '첫 월드', w2, 'fingerprint-A-two-0002'); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T04 같은 계보·다른 지문 create → 갱신 명령 필요', 'ERR save.world_exists', r, r = 'ERR save.world_exists'); perform set_config('role', 'authenticated', true);

  v := public.game1_update_account_world(id1, w2, 'fingerprint-A-two-0002', 1);
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T05 갱신(기대 1) → 2', '2', v::text, v = 2); perform set_config('role', 'authenticated', true);

  v := public.game1_update_account_world(id1, w2, 'fingerprint-A-two-0002', 1);
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T06 같은 갱신 재전송(지문 같음) → 2 그대로', '2', v::text, v = 2); perform set_config('role', 'authenticated', true);

  begin perform public.game1_update_account_world(id1, w1, 'fingerprint-A-three-003', 1); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T07 낡은 기대 버전(1) → 충돌, 조용한 덮어쓰기 없음', 'ERR save.version_conflict', r, r = 'ERR save.version_conflict'); perform set_config('role', 'authenticated', true);

  perform public.game1_create_account_world('lineage-A-0002', '둘째', w1, 'fingerprint-A-four-0004');
  perform public.game1_create_account_world('lineage-A-0003', '셋째', w1, 'fingerprint-A-five-0005');
  begin perform public.game1_create_account_world('lineage-A-0004', '넷째', w1, 'fingerprint-A-six-00006'); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  select count(*) into n from public.game1_account_worlds;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T08 네 번째 월드 → 상한, 기존 3개 유지', 'ERR save.world_limit rows 3', r || ' rows ' || n, r = 'ERR save.world_limit' and n = 3); perform set_config('role', 'authenticated', true);

  begin perform public.game1_create_account_world('lineage-A-0005', '미래', wf, 'fingerprint-A-seven-007'); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T09a 지원 안 하는 저장 형식 → 거절', 'ERR save.unsupported_format', r, r = 'ERR save.unsupported_format'); perform set_config('role', 'authenticated', true);
  begin perform public.game1_update_account_world(id1, wb, 'fingerprint-A-eight-008', 2); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T09b 잘못된 저장본(폰 4) → 거절', 'ERR save.invalid_data', r, r = 'ERR save.invalid_data'); perform set_config('role', 'authenticated', true);

  begin insert into public.game1_account_worlds (user_id, lineage_id, world, snapshot_fingerprint) values (b, 'lineage-spoof-01', w1, 'fingerprint-spoof-0001'); r := 'ok'; exception when others then r := 'ERR ' || sqlstate; end;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T09c A 가 user_id=B 로 직접 INSERT → 거부', 'ERR 42501', r, r = 'ERR 42501'); perform set_config('role', 'authenticated', true);

  update public.game1_account_worlds set title = '이름 바꿈' where world_id = id1;
  select version into v from public.game1_account_worlds where world_id = id1;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T09d 제목 직접 수정 → version 자동 +1', '3', v::text, v = 3); perform set_config('role', 'authenticated', true);

  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------------
-- T10~T13 사용자 B: A 의 월드를 보거나 바꾸거나 지울 수 없다. 남의 월드는 "없음"과 같은 답
-- ---------------------------------------------------------------------------
do $$
declare b uuid := (select id from game1_test_users where label = 'B');
        a1 uuid := (select v from game1_test_ids where k = 'A1');
        w1 jsonb := (select w from game1_test_world where k = 'w1');
        r text; n integer; v integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.game1_account_worlds;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T10 B 는 A 월드 못 봄', 'rows 0', 'rows ' || n, n = 0); perform set_config('role', 'authenticated', true);
  select count(*) into n from public.game1_list_account_worlds();
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T10b B 목록 0', 'rows 0', 'rows ' || n, n = 0); perform set_config('role', 'authenticated', true);

  begin perform public.game1_update_account_world(a1, w1, 'fingerprint-B-attack-01', 3); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T11 B 가 A 월드 갱신 → 없음과 같은 답', 'ERR save.not_found', r, r = 'ERR save.not_found'); perform set_config('role', 'authenticated', true);

  update public.game1_account_worlds set title = 'hacked' where world_id = a1;
  get diagnostics n = row_count;
  delete from public.game1_account_worlds where world_id = a1;
  get diagnostics v = row_count;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T12 B 의 직접 UPDATE·DELETE → 0행', 'upd 0 del 0', 'upd ' || n || ' del ' || v, n = 0 and v = 0); perform set_config('role', 'authenticated', true);

  perform public.game1_create_account_world('lineage-A-0001', 'B 의 같은 계보 이름', w1, 'fingerprint-B-own-0001');
  select count(*) into n from public.game1_account_worlds;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T13 B 는 같은 계보 이름이어도 자기 월드로 따로 저장(계정 분리)', 'rows 1', 'rows ' || n, n = 1); perform set_config('role', 'authenticated', true);
  perform set_config('role', 'none', true);
end $$;

-- ---------------------------------------------------------------------------
-- T14 A: B 의 시도 뒤에도 A 월드 그대로, 본인 삭제는 허용
-- ---------------------------------------------------------------------------
do $$
declare a uuid := (select id from game1_test_users where label = 'A');
        a1 uuid := (select v from game1_test_ids where k = 'A1');
        t text; v integer; n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('role', 'authenticated', true);
  select title, version into t, v from public.game1_account_worlds where world_id = a1;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T14a A 월드 그대로', '이름 바꿈 v3', t || ' v' || v, t = '이름 바꿈' and v = 3); perform set_config('role', 'authenticated', true);
  delete from public.game1_account_worlds where world_id = a1;
  select count(*) into n from public.game1_account_worlds;
  perform set_config('role', 'none', true); insert into game1_test_results (step, expected, result, pass) values ('T14b A 본인 삭제 → 2개 남음', 'rows 2', 'rows ' || n, n = 2); perform set_config('role', 'authenticated', true);
  perform set_config('role', 'none', true);
end $$;

select seq, step, expected, result, pass from game1_test_results order by seq;
select count(*) filter (where not pass) as fail_total, count(*) as total from game1_test_results;

rollback;
