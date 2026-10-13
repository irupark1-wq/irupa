-- 0005_game1_save_format3.sql — 계정 월드가 저장 형식 3(두 번째 방 + 성격 카드 빈 자리)을 받도록 허용 범위를 넓힌다
-- 상태: 초안(미적용). 김PO 가 Supabase SQL Editor 에서 postgres 역할로 실행한다.
-- 근거: PO-HAND-011 §2, PO-DEC-007 §5. 전제: 0004 적용 완료.
-- 바뀌는 것: 허용 형식 1·2 → 1·2·3. 4 이상(더 새 형식)은 계속 거절.
-- 바뀌지 않는 것: 이미 저장된 계정 월드(행을 고치지 않는다), RLS·권한·3개 상한·멱등·버전 충돌 규칙.
-- 배포 순서(반쪽 migration 방지): ① 이 SQL 적용·시험 → ② 형식 3 클라이언트 배포(김도현) → ③ 형식 3 저장 실기 확인.
--   ①만 된 상태: 옛 클라이언트(형식 2)는 그대로 저장 가능. ②가 ①보다 먼저면 형식 3 저장이 거절되고 로컬은 그대로(클라이언트 시험으로 확인).
-- 앞으로 형식을 올릴 때는 아래 함수 하나만 바꾼다.

begin;

-- 1. 허용 형식 판정 함수(한 곳). 저장본에 save_format 이 없으면 형식 1 로 본다.
create or replace function public.game1_supported_save_format(p_world jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when not (p_world ? 'save_format') then true
    when jsonb_typeof(p_world -> 'save_format') <> 'number' then false
    else (p_world ->> 'save_format')::numeric in (1, 2, 3)
  end;
$$;
comment on function public.game1_supported_save_format(jsonb) is '계정 월드가 받는 저장 형식(현재 1·2·3). 형식을 올릴 때 이 함수만 바꾼다.';
revoke all on function public.game1_supported_save_format(jsonb) from public, anon, service_role;
grant execute on function public.game1_supported_save_format(jsonb) to authenticated;

-- 2. 표 제약: 모양 검사는 그대로, 형식 판정만 함수로 바꾼다(기존 행은 다시 검사하지 않게 NOT VALID 로 추가 후 검증)
alter table public.game1_account_worlds drop constraint if exists game1_account_worlds_world_shape;
alter table public.game1_account_worlds add constraint game1_account_worlds_world_shape check (
  jsonb_typeof(world) is not distinct from 'object'
  and (world -> 'schema_version') is not distinct from '1'::jsonb
  and (case when jsonb_typeof(world -> 'pawns') = 'array'
            then jsonb_array_length(world -> 'pawns') <= 3
            else false end)
  and public.game1_supported_save_format(world)
  and pg_column_size(world) <= 33554432
) not valid;
alter table public.game1_account_worlds validate constraint game1_account_worlds_world_shape;

-- 3. RPC 두 개: 형식 검사를 같은 함수로(나머지 본문은 0004 와 같음)
create or replace function public.game1_create_account_world(p_lineage text, p_title text, p_world jsonb, p_fingerprint text)
returns table (world_id uuid, version integer, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_row record;
begin
  if v_uid is null then
    raise exception 'save.not_authenticated' using errcode = '42501';
  end if;
  if p_lineage is null or p_lineage !~ '^[A-Za-z0-9_-]{8,64}$' or p_title is null or char_length(p_title) not between 1 and 40 then
    raise exception 'save.invalid_data' using errcode = '22023';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[A-Za-z0-9_-]{16,128}$'
     or jsonb_typeof(p_world) is distinct from 'object'
     or (p_world -> 'schema_version') is distinct from '1'::jsonb
     or jsonb_typeof(p_world -> 'pawns') is distinct from 'array'
     or jsonb_array_length(p_world -> 'pawns') > 3
     or pg_column_size(p_world) > 33554432 then
    raise exception 'save.invalid_data' using errcode = '23514';
  end if;
  if not public.game1_supported_save_format(p_world) then
    raise exception 'save.unsupported_format' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('game1_account_worlds:' || v_uid::text, 0));
  select w.world_id, w.version, w.snapshot_fingerprint into v_row
    from public.game1_account_worlds w
   where w.user_id = v_uid and w.lineage_id = p_lineage;
  if found then
    if v_row.snapshot_fingerprint = p_fingerprint then
      return query select v_row.world_id, v_row.version, false;
      return;
    end if;
    raise exception 'save.world_exists' using errcode = 'P0001', detail = v_row.world_id::text;
  end if;

  insert into public.game1_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  return query
    insert into public.game1_account_worlds as w (user_id, lineage_id, title, world, snapshot_fingerprint)
    values (v_uid, p_lineage, p_title, p_world, p_fingerprint)
    returning w.world_id, w.version, true;
end;
$$;

create or replace function public.game1_update_account_world(p_world_id uuid, p_world jsonb, p_fingerprint text, p_expected_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row record;
  v_new integer;
begin
  if v_uid is null then
    raise exception 'save.not_authenticated' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'save.invalid_version' using errcode = '22023';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[A-Za-z0-9_-]{16,128}$'
     or jsonb_typeof(p_world) is distinct from 'object'
     or (p_world -> 'schema_version') is distinct from '1'::jsonb
     or jsonb_typeof(p_world -> 'pawns') is distinct from 'array'
     or jsonb_array_length(p_world -> 'pawns') > 3
     or pg_column_size(p_world) > 33554432 then
    raise exception 'save.invalid_data' using errcode = '23514';
  end if;
  if not public.game1_supported_save_format(p_world) then
    raise exception 'save.unsupported_format' using errcode = '23514';
  end if;

  select w.version, w.snapshot_fingerprint into v_row
    from public.game1_account_worlds w
   where w.world_id = p_world_id and w.user_id = v_uid
   for update;
  if not found then
    raise exception 'save.not_found' using errcode = 'P0002';
  end if;
  if v_row.snapshot_fingerprint = p_fingerprint then
    return v_row.version;
  end if;
  if v_row.version <> p_expected_version then
    raise exception 'save.version_conflict' using errcode = 'P0001',
      detail = format('expected %s, current %s', p_expected_version, v_row.version);
  end if;
  update public.game1_account_worlds w
     set world = p_world, snapshot_fingerprint = p_fingerprint
   where w.world_id = p_world_id and w.user_id = v_uid and w.version = p_expected_version
   returning w.version into v_new;
  if v_new is null then
    raise exception 'save.version_conflict' using errcode = 'P0001', detail = 'row changed concurrently';
  end if;
  return v_new;
end;
$$;

-- 권한은 0004 와 같다(create or replace 는 기존 권한을 유지하지만 명시해 둔다)
revoke all on function public.game1_create_account_world(text, text, jsonb, text) from public, anon, service_role;
revoke all on function public.game1_update_account_world(uuid, jsonb, text, integer) from public, anon, service_role;
grant execute on function public.game1_create_account_world(text, text, jsonb, text) to authenticated;
grant execute on function public.game1_update_account_world(uuid, jsonb, text, integer) to authenticated;

commit;
