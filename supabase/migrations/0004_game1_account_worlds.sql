-- 0004_game1_account_worlds.sql — 게임1(동그란 사이) 계정 월드 저장: 계정당 최대 3월드, 로컬 월드 계보 → 서버 월드 매핑
-- 상태: 초안(미적용). 김PO 가 Supabase 대시보드 SQL Editor 에서 postgres 역할로 실행한다.
-- 근거: PO-AUTH-001 §3·§4, PO-DEC-006 §4, DEV-25 3.2. 전제: 0001·0002 적용 완료(game1_private, game1_profiles).
-- 원칙: RLS 필수(조회·추가·수정·삭제 각각 본인 조건), 필요한 열만 GRANT, SECURITY INVOKER + search_path='',
--   service_role 사용 안 함, anon 접근 불가. 기존 game1_worlds(계정당 1월드, SB-0002)는 그대로 두고 쓰지 않는다(PO-DEC-006).
-- 명령 구분(PO-DEC-006 §4):
--   game1_create_account_world  = "이 로컬 월드를 계정에 새 월드로 만들기". 같은 계보·같은 스냅샷 재전송은 같은 월드를 돌려준다(복제 0).
--   game1_update_account_world  = "이미 연결된 계정 월드 갱신". expected_version 이 서버 version 과 달라야 충돌(조용히 덮어쓰지 않음).
--   "로컬 월드를 별도 월드로 저장"은 클라이언트가 새 계보 id 를 만들어 create 를 부르는 명시 명령이다.
-- 전체를 한 트랜잭션으로 적용한다.

begin;

-- ---------------------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------------------
create table if not exists public.game1_account_worlds (
  world_id             uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null default auth.uid()
                                   references public.game1_profiles (user_id) on delete cascade,
  lineage_id           text        not null check (lineage_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  title                text        not null default '내 월드' check (char_length(title) between 1 and 40),
  version              integer     not null default 1 check (version >= 1),
  snapshot_fingerprint text        not null check (snapshot_fingerprint ~ '^[A-Za-z0-9_-]{16,128}$'),
  world                jsonb       not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint game1_account_worlds_lineage unique (user_id, lineage_id),
  -- 저장본 모양(prototype/store.js validateState 상한과 같음) + 저장 형식(save_format 1~2, 앱이 지원하는 범위)
  constraint game1_account_worlds_world_shape check (
    jsonb_typeof(world) is not distinct from 'object'
    and (world -> 'schema_version') is not distinct from '1'::jsonb
    and (case when jsonb_typeof(world -> 'pawns') = 'array'
              then jsonb_array_length(world -> 'pawns') <= 3
              else false end)
    and (case when world ? 'save_format'
              then jsonb_typeof(world -> 'save_format') = 'number' and (world ->> 'save_format')::numeric in (1, 2)
              else true end)
    and pg_column_size(world) <= 33554432
  )
);
comment on table public.game1_account_worlds is '게임1 계정 월드(명시 스냅샷 저장). 계정당 최대 3. (user_id, lineage_id) 하나가 로컬 월드 계보 하나와 대응.';
comment on column public.game1_account_worlds.lineage_id is '로컬 월드 계보 id(클라이언트 생성). 같은 로컬 월드의 재저장은 같은 행을 갱신한다.';
comment on column public.game1_account_worlds.snapshot_fingerprint is '보낸 스냅샷의 지문(SHA-256 base64url). 같은 스냅샷 재전송을 멱등으로 만든다.';
comment on column public.game1_account_worlds.version is '서버 버전. 트리거가 설정(만들 때 1, 바뀔 때마다 +1).';

create index if not exists game1_account_worlds_user on public.game1_account_worlds (user_id, updated_at desc);
alter table public.game1_account_worlds enable row level security;

-- ---------------------------------------------------------------------------
-- 2. 트리거 — 버전·소유자·계보 고정, 계정당 3월드 상한(같은 사용자 요청은 advisory lock 으로 직렬화)
-- ---------------------------------------------------------------------------
create or replace function game1_private.game1_account_worlds_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from (select auth.uid()) then
      raise exception 'save.not_owner' using errcode = '42501';
    end if;
    -- 같은 사용자의 동시 생성이 상한을 넘지 못하게 사용자 단위로 잠근다(트랜잭션 끝에 풀림)
    perform pg_advisory_xact_lock(hashtextextended('game1_account_worlds:' || new.user_id::text, 0));
    select count(*) into v_count from public.game1_account_worlds w where w.user_id = new.user_id;
    if v_count >= 3 then
      raise exception 'save.world_limit' using errcode = 'P0001', detail = format('limit 3, current %s', v_count);
    end if;
    new.version    := 1;
    new.created_at := now();
  else
    new.user_id    := old.user_id;      -- 소유자 변경 금지
    new.lineage_id := old.lineage_id;   -- 계보 변경 금지
    new.created_at := old.created_at;
    new.version    := old.version + 1;  -- 어떤 경로로 바꿔도 서버가 1 올린다
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function game1_private.game1_account_worlds_before_write() from public, anon, authenticated;

drop trigger if exists game1_account_worlds_before_write on public.game1_account_worlds;
create trigger game1_account_worlds_before_write
  before insert or update on public.game1_account_worlds
  for each row execute function game1_private.game1_account_worlds_before_write();

-- ---------------------------------------------------------------------------
-- 3. 권한 — authenticated 에만, 필요한 열만
-- ---------------------------------------------------------------------------
revoke all on table public.game1_account_worlds from public, anon, authenticated, service_role;
grant select                                                          on public.game1_account_worlds to authenticated;
grant insert (user_id, lineage_id, title, world, snapshot_fingerprint) on public.game1_account_worlds to authenticated;
grant update (title, world, snapshot_fingerprint)                      on public.game1_account_worlds to authenticated;
grant delete                                                          on public.game1_account_worlds to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS — 조회·추가·수정·삭제 각각 본인 행만
-- ---------------------------------------------------------------------------
drop policy if exists game1_account_worlds_select_own on public.game1_account_worlds;
create policy game1_account_worlds_select_own on public.game1_account_worlds
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists game1_account_worlds_insert_own on public.game1_account_worlds;
create policy game1_account_worlds_insert_own on public.game1_account_worlds
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists game1_account_worlds_update_own on public.game1_account_worlds;
create policy game1_account_worlds_update_own on public.game1_account_worlds
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists game1_account_worlds_delete_own on public.game1_account_worlds;
create policy game1_account_worlds_delete_own on public.game1_account_worlds
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. RPC (public: 브라우저 PostgREST 는 public 스키마 함수만 부른다 — SB-0002 와 같은 이유)
-- ---------------------------------------------------------------------------
-- 5-1. 새 월드로 만들기(멱등)
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
  -- 저장본 검사(game1_private 함수는 authenticated 가 부를 수 없으므로 RPC 안에서 직접 한다)
  if p_fingerprint is null or p_fingerprint !~ '^[A-Za-z0-9_-]{16,128}$'
     or jsonb_typeof(p_world) is distinct from 'object'
     or (p_world -> 'schema_version') is distinct from '1'::jsonb
     or jsonb_typeof(p_world -> 'pawns') is distinct from 'array'
     or jsonb_array_length(p_world -> 'pawns') > 3
     or pg_column_size(p_world) > 33554432 then
    raise exception 'save.invalid_data' using errcode = '23514';
  end if;
  if p_world ? 'save_format' and (jsonb_typeof(p_world -> 'save_format') <> 'number' or (p_world ->> 'save_format')::numeric not in (1, 2)) then
    raise exception 'save.unsupported_format' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('game1_account_worlds:' || v_uid::text, 0));
  select w.world_id, w.version, w.snapshot_fingerprint into v_row
    from public.game1_account_worlds w
   where w.user_id = v_uid and w.lineage_id = p_lineage;
  if found then
    if v_row.snapshot_fingerprint = p_fingerprint then
      return query select v_row.world_id, v_row.version, false;   -- 같은 스냅샷 재전송: 복제 없이 같은 월드
      return;
    end if;
    raise exception 'save.world_exists' using errcode = 'P0001', detail = v_row.world_id::text;  -- 갱신 명령을 써야 한다
  end if;

  insert into public.game1_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  return query
    insert into public.game1_account_worlds as w (user_id, lineage_id, title, world, snapshot_fingerprint)
    values (v_uid, p_lineage, p_title, p_world, p_fingerprint)
    returning w.world_id, w.version, true;
end;
$$;
comment on function public.game1_create_account_world(text, text, jsonb, text) is
  '로컬 월드를 계정 새 월드로 만들기. 같은 계보·같은 지문 재전송은 created=false 로 같은 월드. 같은 계보·다른 지문은 save.world_exists. 3개 초과는 save.world_limit.';

-- 5-2. 기존 계정 월드 갱신(낙관적 잠금 + 멱등 재전송)
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
  if p_world ? 'save_format' and (jsonb_typeof(p_world -> 'save_format') <> 'number' or (p_world ->> 'save_format')::numeric not in (1, 2)) then
    raise exception 'save.unsupported_format' using errcode = '23514';
  end if;

  -- 본인 행만 보인다(RLS). 남의 월드 id 는 "없음"과 구별되지 않는다.
  select w.version, w.snapshot_fingerprint into v_row
    from public.game1_account_worlds w
   where w.world_id = p_world_id and w.user_id = v_uid
   for update;
  if not found then
    raise exception 'save.not_found' using errcode = 'P0002';
  end if;
  if v_row.snapshot_fingerprint = p_fingerprint then
    return v_row.version;   -- 같은 스냅샷 재전송(이미 반영됨): 아무것도 바꾸지 않는다
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
comment on function public.game1_update_account_world(uuid, jsonb, text, integer) is
  '계정 월드 갱신. 같은 지문 재전송은 현재 version 을 그대로 돌려준다. expected_version 불일치는 save.version_conflict. 남의 월드·없는 월드는 save.not_found.';

-- 5-3. 목록(저장본 본문 없이 요약만)
create or replace function public.game1_list_account_worlds()
returns table (world_id uuid, title text, version integer, lineage_id text, pawns integer, save_format integer, updated_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select w.world_id, w.title, w.version, w.lineage_id,
         jsonb_array_length(w.world -> 'pawns'),
         coalesce((w.world ->> 'save_format')::integer, 1),
         w.updated_at
    from public.game1_account_worlds w
   where w.user_id = (select auth.uid())
   order by w.updated_at desc;
$$;
comment on function public.game1_list_account_worlds() is '본인 계정 월드 요약 목록(최근 저장 순). 저장본 본문은 불러오기 때 따로 읽는다.';

revoke all on function public.game1_create_account_world(text, text, jsonb, text) from public, anon, service_role;
revoke all on function public.game1_update_account_world(uuid, jsonb, text, integer) from public, anon, service_role;
revoke all on function public.game1_list_account_worlds() from public, anon, service_role;
grant execute on function public.game1_create_account_world(text, text, jsonb, text) to authenticated;
grant execute on function public.game1_update_account_world(uuid, jsonb, text, integer) to authenticated;
grant execute on function public.game1_list_account_worlds() to authenticated;

commit;
