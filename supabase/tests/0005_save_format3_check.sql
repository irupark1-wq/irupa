-- 0005_save_format3_check.sql — 0005 적용 뒤 시험. BEGIN … ROLLBACK 이라 DB 에 아무것도 남지 않는다.
-- 결과: 마지막 SELECT 의 fail_total 이 0 이어야 한다.

begin;

create temp table game1_test_users (label text primary key, id uuid not null);
insert into game1_test_users values ('A', 'a0000000-0000-4000-8000-0000000000a5'), ('B', 'b0000000-0000-4000-8000-0000000000b5');
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', false, now(), now() from game1_test_users;

create temp table game1_test_results (seq serial primary key, step text, expected text, result text, pass boolean);
create temp table game1_test_before (rows integer, versions bigint);
insert into game1_test_before select count(*), coalesce(sum(version), 0) from public.game1_account_worlds;

-- T00 카탈로그
insert into game1_test_results (step, expected, result, pass)
select 'T00a 형식 판정 함수 있음', 'true', (count(*) = 1)::text, count(*) = 1 from pg_proc where proname = 'game1_supported_save_format';
insert into game1_test_results (step, expected, result, pass)
select 'T00b anon 은 형식 함수 실행 불가', 'false', v::text, not v from (select has_function_privilege('anon', 'public.game1_supported_save_format(jsonb)', 'execute') v) s;
insert into game1_test_results (step, expected, result, pass)
select 'T00c 형식 1·2·3 허용, 4·문자 거절, 없음=1',
       'true true true false false true',
       concat_ws(' ', public.game1_supported_save_format('{"save_format":1}'), public.game1_supported_save_format('{"save_format":2}'),
                 public.game1_supported_save_format('{"save_format":3}'), public.game1_supported_save_format('{"save_format":4}'),
                 public.game1_supported_save_format('{"save_format":"3"}'), public.game1_supported_save_format('{}')),
       public.game1_supported_save_format('{"save_format":3}') and not public.game1_supported_save_format('{"save_format":4}')
       and not public.game1_supported_save_format('{"save_format":"3"}') and public.game1_supported_save_format('{}');

-- T01~T05 사용자 A
do $$
declare a uuid := (select id from game1_test_users where label = 'A');
        w2 jsonb := '{"save_format":2,"schema_version":1,"pawns":[{"id":"p1"}]}';
        w3 jsonb := '{"save_format":3,"schema_version":1,"pawns":[{"id":"p1"}],"life":{"rooms":{"cozy":{}}}}';
        w4 jsonb := '{"save_format":4,"schema_version":1,"pawns":[]}';
        r text; id3 uuid; v integer; c boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('role', 'authenticated', true);
  select world_id, version, created into id3, v, c from public.game1_create_account_world('lineage-five-0003', '형식3', w3, 'fingerprint-five-three-01');
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values ('T01 형식 3 새 월드 저장', '1 true', v || ' ' || c, v = 1 and c);

  perform set_config('role', 'authenticated', true);
  begin perform public.game1_create_account_world('lineage-five-0002', '형식2', w2, 'fingerprint-five-two-0001'); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values ('T02 형식 2(옛 클라이언트)도 계속 저장', 'ok', r, r = 'ok');

  perform set_config('role', 'authenticated', true);
  begin perform public.game1_create_account_world('lineage-five-0004', '형식4', w4, 'fingerprint-five-four-001'); r := 'ok'; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values ('T03 형식 4(더 새 형식) 거절', 'ERR save.unsupported_format', r, r = 'ERR save.unsupported_format');

  perform set_config('role', 'authenticated', true);
  begin v := public.game1_update_account_world(id3, w4, 'fingerprint-five-four-002', 1); r := v::text; exception when others then r := 'ERR ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values ('T04 형식 3 월드를 형식 4 로 갱신 거절', 'ERR save.unsupported_format', r, r = 'ERR save.unsupported_format');

  perform set_config('role', 'authenticated', true);
  v := public.game1_update_account_world(id3, w3 || '{"version":9}'::jsonb, 'fingerprint-five-three-02', 1);
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values ('T05 형식 3 갱신(기대 1) → 2', '2', v::text, v = 2);
end $$;

-- T06 사용자 B: A 의 형식 3 월드를 볼 수 없다(RLS 그대로)
do $$
declare b uuid := (select id from game1_test_users where label = 'B'); n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.game1_account_worlds;
  perform set_config('role', 'none', true);
  insert into game1_test_results (step, expected, result, pass) values ('T06 B 는 A 월드 못 봄', 'rows 0', 'rows ' || n, n = 0);
end $$;

-- T07 시험 전부터 있던 실제 계정 월드는 그대로(행 수·버전 합 비교, 시험 사용자 행 제외)
insert into game1_test_results (step, expected, result, pass)
select 'T07 기존 계정 월드 변경 없음', b.rows || ' / ' || b.versions, n.rows || ' / ' || n.versions, b.rows = n.rows and b.versions = n.versions
  from game1_test_before b,
       (select count(*)::integer rows, coalesce(sum(version), 0) versions from public.game1_account_worlds
         where user_id not in (select id from game1_test_users)) n;

select seq, step, expected, result, pass from game1_test_results order by seq;
select count(*) filter (where not pass) as fail_total, count(*) as total from game1_test_results;

rollback;
