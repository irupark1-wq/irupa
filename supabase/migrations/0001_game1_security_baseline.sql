-- game1 baseline; shared public defaults affect FUTURE postgres-owned objects.
-- Supabase-managed auth/storage objects and existing grants are not changed.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
create schema if not exists game1_private authorization postgres;
revoke all on schema game1_private from public, anon, authenticated;
alter default privileges for role postgres in schema game1_private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema game1_private revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema game1_private revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;
-- PUBLIC execute is a GLOBAL PostgreSQL default: schema-local revoke cannot remove it.
alter default privileges for role postgres revoke execute on functions from public;
