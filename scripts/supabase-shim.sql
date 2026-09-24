-- Shim mínimo del entorno de Supabase para correr migraciones y tests pgTAP
-- contra un Postgres común (sin Docker). Lo usa scripts/db-test-local.sh.
--
-- NO se aplica nunca a un proyecto Supabase real: ahí todo esto ya existe.
-- Reproduce lo justo de lo que las migraciones y las políticas dan por hecho:
--   * roles anon / authenticated / service_role
--   * esquema auth con users y las funciones auth.uid(), auth.role(), auth.jwt()
--   * esquema extensions con pgcrypto y pgtap
--   * privilegios por defecto de Supabase sobre public
--   * publicación supabase_realtime

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists extensions;
create schema if not exists auth;

grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

-- Como en Supabase: todo lo que se cree en public queda otorgado a los tres
-- roles, y las migraciones tienen que restringirlo a mano.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

alter database "playus_test" set search_path to "$user", public, extensions;
set search_path to "$user", public, extensions;

-- auth.users con las columnas que usan el seed, el trigger y los tests.
create table if not exists auth.users (
  instance_id         uuid,
  id                  uuid primary key,
  aud                 varchar(255),
  role                varchar(255),
  email               varchar(255),
  encrypted_password  varchar(255),
  email_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb,
  raw_user_meta_data  jsonb,
  is_anonymous        boolean not null default false,
  created_at          timestamptz,
  updated_at          timestamptz
);

-- Mismas definiciones que usa Supabase.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

create publication supabase_realtime;
