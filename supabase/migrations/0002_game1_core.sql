-- 0002_game1_core.sql — 게임1(동그란 사이) 1차 코어: 계정 프로필 + 월드 저장본 + RLS + 저장 함수
-- 상태: 초안(미적용). 김PO 가 Supabase 대시보드 SQL Editor 에서 postgres 역할로 실행한다.
-- 전제: 0001_game1_security_baseline.sql 적용 완료(game1_private 스키마 존재, 기본 권한 회수).
-- 원칙(AGENTS.md 보안 기준): RLS 필수, 필요한 권한만 명시 GRANT, UPDATE 는 USING·WITH CHECK 둘 다,
--   SECURITY INVOKER + 고정 search_path, service_role 사용 안 함, 익명(anon) 역할은 접근 불가.
-- 인증 모델: Supabase Auth 익명 로그인(signInAnonymously) → 이후 이메일 연결(updateUser/linkIdentity).
--   익명 사용자도 JWT role 은 authenticated 이므로 "로그인 여부"가 아니라 auth.uid() = 소유자 로 판정한다.
--   같은 Supabase 프로젝트의 다른 게임 사용자는 game1_profiles 행이 없으면 game1 월드를 만들 수 없다(FK).
-- 전체를 한 트랜잭션으로 적용한다.

begin;

-- ---------------------------------------------------------------------------
-- 1. game1_profiles — 소유자 1행(= 게임1 참여 기록)
-- ---------------------------------------------------------------------------
create table if not exists public.game1_profiles (
  user_id      uuid        primary key default auth.uid()
                           references auth.users (id) on delete cascade,
  display_name text        check (display_name is null or char_length(display_name) between 1 and 20),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.game1_profiles is '게임1 소유자 프로필. 1 사용자 = 1행. 행이 있어야 게임1 참여자로 본다.';
comment on column public.game1_profiles.display_name is '표시 이름(선택, 1~20자). 폰 이름 상한(20자)과 동일.';

alter table public.game1_profiles enable row level security;

-- ---------------------------------------------------------------------------
-- 2. game1_worlds — 소유자별 월드 저장본(localStorage 레코드 game1-local-a-v1 전체를 jsonb 로)
-- ---------------------------------------------------------------------------
create table if not exists public.game1_worlds (
  user_id         uuid        primary key default auth.uid()
                              references public.game1_profiles (user_id) on delete cascade,
  version         integer     not null default 0 check (version >= 0),
  world           jsonb       not null,
  client_saved_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- 저장본 모양 검사(prototype/store.js validateState 와 같은 상한): 객체, schema_version=1, pawns 배열 ≤3, 크기 ≤32MiB
  -- NULL 은 CHECK 를 통과하므로 키가 없을 때도 false 가 되게 is not distinct from / case 로 쓴다.
  constraint game1_worlds_world_shape check (
    jsonb_typeof(world) is not distinct from 'object'
    and (world -> 'schema_version') is not distinct from '1'::jsonb
    and (case when jsonb_typeof(world -> 'pawns') = 'array'
              then jsonb_array_length(world -> 'pawns') <= 3
              else false end)
    and pg_column_size(world) <= 33554432
  )
);
comment on table public.game1_worlds is '게임1 월드 저장본. 1 소유자 = 1행. version 은 서버가 올리는 낙관적 잠금 번호(없음=0, 첫 저장=1).';
comment on column public.game1_worlds.version is '서버 버전. 클라이언트가 보내는 값은 무시되고 트리거가 설정한다.';
comment on column public.game1_worlds.world is 'localStorage game1-local-a-v1 레코드 전체(jsonb).';
comment on column public.game1_worlds.client_saved_at is '클라이언트가 저장한 시각(참고용, 신뢰하지 않음).';

alter table public.game1_worlds enable row level security;

-- ---------------------------------------------------------------------------
-- 3. 내부 트리거 함수(game1_private) — 클라이언트가 직접 호출할 수 없다
--    트리거 함수는 CREATE TRIGGER 시점에만 EXECUTE 권한을 검사하므로 authenticated 에 권한을 주지 않아도 동작한다.
-- ---------------------------------------------------------------------------
create or replace function game1_private.game1_profiles_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id    := old.user_id;     -- 소유자 변경 금지
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function game1_private.game1_profiles_before_write() from public, anon, authenticated;

create or replace function game1_private.game1_worlds_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version    := 1;               -- 첫 저장본은 항상 1
    new.created_at := now();
  else
    new.user_id    := old.user_id;     -- 소유자 변경 금지
    new.created_at := old.created_at;
    new.version    := old.version + 1; -- 어떤 경로로 갱신해도 서버가 1 올린다
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function game1_private.game1_worlds_before_write() from public, anon, authenticated;

drop trigger if exists game1_profiles_before_write on public.game1_profiles;
create trigger game1_profiles_before_write
  before insert or update on public.game1_profiles
  for each row execute function game1_private.game1_profiles_before_write();

drop trigger if exists game1_worlds_before_write on public.game1_worlds;
create trigger game1_worlds_before_write
  before insert or update on public.game1_worlds
  for each row execute function game1_private.game1_worlds_before_write();

-- ---------------------------------------------------------------------------
-- 4. 권한 — authenticated 에만, 필요한 열만. anon 은 아무 권한 없음(0001 기본 권한 회수 + 명시 REVOKE).
-- ---------------------------------------------------------------------------
revoke all on table public.game1_profiles from public, anon, authenticated, service_role;
revoke all on table public.game1_worlds   from public, anon, authenticated, service_role;

grant select                                   on public.game1_profiles to authenticated;
grant insert (user_id, display_name)           on public.game1_profiles to authenticated;
grant update (display_name)                    on public.game1_profiles to authenticated;

grant select                                   on public.game1_worlds to authenticated;
grant insert (user_id, world, client_saved_at) on public.game1_worlds to authenticated;
grant update (world, client_saved_at)          on public.game1_worlds to authenticated;
-- DELETE 는 부여하지 않는다. 계정 삭제 시 auth.users → profiles → worlds 로 cascade.

-- ---------------------------------------------------------------------------
-- 5. RLS 정책 — 본인 행만. (select auth.uid()) 는 행마다 재평가되지 않도록 하는 관용구.
-- ---------------------------------------------------------------------------
drop policy if exists game1_profiles_select_own on public.game1_profiles;
create policy game1_profiles_select_own on public.game1_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists game1_profiles_insert_own on public.game1_profiles;
create policy game1_profiles_insert_own on public.game1_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists game1_profiles_update_own on public.game1_profiles;
create policy game1_profiles_update_own on public.game1_profiles
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists game1_worlds_select_own on public.game1_worlds;
create policy game1_worlds_select_own on public.game1_worlds
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists game1_worlds_insert_own on public.game1_worlds;
create policy game1_worlds_insert_own on public.game1_worlds
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists game1_worlds_update_own on public.game1_worlds;
create policy game1_worlds_update_own on public.game1_worlds
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. 저장 함수 — public.game1_save_world(p_world jsonb, p_expected_version integer) returns integer
--    SECURITY INVOKER: 호출자 권한·RLS 그대로 적용. search_path 고정(''), 모든 객체 스키마 한정.
--    낙관적 잠금: p_expected_version = 현재 서버 version(없으면 0) 이어야 한다. 불일치 → 예외 'save.version_conflict'.
--    반환: 새 version. 첫 저장(0 → 1)은 프로필이 없으면 함께 만든다(게임1 참여).
--    위치 메모: 브라우저(PostgREST rpc)는 public 스키마의 함수만 호출할 수 있다. game1_private 에 두면
--      authenticated 에 스키마 USAGE 를 다시 부여해야 해서 0001 의 차단을 되돌리게 되므로 RPC 는 public 에 둔다.
--      예외 메시지는 prototype/store.js 의 오류 키(save.version_conflict / save.invalid_data)와 맞춘다.
-- ---------------------------------------------------------------------------
create or replace function public.game1_save_world(p_world jsonb, p_expected_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_current integer;
  v_new     integer;
begin
  if v_uid is null then
    raise exception 'save.not_authenticated' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'save.invalid_version' using errcode = '22023';
  end if;
  if not (
       jsonb_typeof(p_world) is not distinct from 'object'
       and (p_world -> 'schema_version') is not distinct from '1'::jsonb
       and (case when jsonb_typeof(p_world -> 'pawns') = 'array'
                 then jsonb_array_length(p_world -> 'pawns') <= 3
                 else false end)
       and pg_column_size(p_world) <= 33554432
  ) then
    raise exception 'save.invalid_data' using errcode = '23514';
  end if;

  -- 현재 서버 버전(본인 행만 보임: RLS). 같은 사용자의 동시 저장을 직렬화하기 위해 행을 잠근다.
  select w.version into v_current
    from public.game1_worlds w
   where w.user_id = v_uid
   for update;

  if v_current is null then
    -- 저장본 없음 → 기대 버전은 0 이어야 한다
    if p_expected_version <> 0 then
      raise exception 'save.version_conflict'
        using errcode = 'P0001',
              detail  = format('expected %s, current 0', p_expected_version);
    end if;
    insert into public.game1_profiles (user_id) values (v_uid)
      on conflict (user_id) do nothing;
    insert into public.game1_worlds (user_id, world, client_saved_at)
      values (v_uid, p_world, now())
      returning version into v_new;
  else
    if v_current <> p_expected_version then
      raise exception 'save.version_conflict'
        using errcode = 'P0001',
              detail  = format('expected %s, current %s', p_expected_version, v_current);
    end if;
    update public.game1_worlds
       set world = p_world, client_saved_at = now()
     where user_id = v_uid and version = p_expected_version
     returning version into v_new;
    if v_new is null then
      raise exception 'save.version_conflict'
        using errcode = 'P0001',
              detail  = format('expected %s, row changed concurrently', p_expected_version);
    end if;
  end if;

  return v_new;
end;
$$;
comment on function public.game1_save_world(jsonb, integer) is
  '게임1 월드 저장(낙관적 잠금). p_expected_version 은 마지막으로 받은 서버 version(처음은 0). 반환=새 version. 불일치 시 save.version_conflict.';

revoke all on function public.game1_save_world(jsonb, integer) from public, anon, service_role;
grant execute on function public.game1_save_world(jsonb, integer) to authenticated;

commit;
