-- Etapa 1 · esquema base
--
-- Tablas del brief (profiles, groups, group_members, seasons, rounds, attempts),
-- restricciones, índices, trigger que crea el perfil al crearse el usuario en
-- auth.users, y publicación de realtime para el ranking en vivo.
--
-- Las políticas RLS están en 20260924000002_rls.sql y las RPC en
-- 20260924000003_rpc.sql.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares puras (sin acceso a datos)
-- ---------------------------------------------------------------------------

-- Valida un nombre de zona horaria IANA ("America/Montevideo"). Se usa como
-- check en groups.timezone: un nombre inválido rompería el cálculo del "hoy"
-- del grupo en todas las consultas.
create or replace function public.is_valid_timezone(p_tz text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_tz is null or p_tz = '' then
    return false;
  end if;
  perform timestamptz '2000-01-01 00:00:00+00' at time zone p_tz;
  return true;
exception
  when others then
    return false;
end;
$$;

-- Alfabeto del código de invitación: mayúsculas sin I ni O, dígitos sin 0 ni 1.
-- 32 símbolos, 6 posiciones: ~1.07e9 combinaciones.
create or replace function public.invite_code_alphabet()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'::text;
$$;

create or replace function public.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr(
      public.invite_code_alphabet(),
      (get_byte(extensions.gen_random_bytes(1), 0) % 32) + 1,
      1
    ),
    ''
    order by i
  )
  from generate_series(1, 6) as i;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '',
  avatar        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  constraint profiles_display_name_len check (char_length(display_name) <= 40),
  constraint profiles_avatar_is_object check (jsonb_typeof(avatar) = 'object')
);

comment on table public.profiles is 'Un perfil por usuario de auth. Se crea por trigger al crearse el usuario.';
comment on column public.profiles.display_name is 'Vacío hasta que el usuario completa la pantalla de nombre y avatar.';
comment on column public.profiles.avatar is 'Piezas del avatar (base, skin, hair, ...). Lo valida zod en la app.';

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------

create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  invite_code   text not null,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  timezone      text not null default 'America/Montevideo',
  max_attempts  smallint not null default 3,
  created_at    timestamptz not null default now(),

  constraint groups_name_len check (char_length(btrim(name)) between 1 and 40),
  constraint groups_invite_code_unique unique (invite_code),
  constraint groups_invite_code_format check (invite_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  constraint groups_timezone_valid check (public.is_valid_timezone(timezone)),
  constraint groups_max_attempts_range check (max_attempts between 1 and 10)
);

comment on table public.groups is 'Grupo privado de amigos. Se crea solo por la RPC create_group.';
comment on column public.groups.invite_code is '6 caracteres del alfabeto sin O/0/I/1 (ver invite_code_alphabet).';
comment on column public.groups.timezone is 'Zona horaria IANA. El día del grupo corta a las 00:00 de esta zona.';

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------

create table public.group_members (
  group_id    uuid not null references public.groups (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'member',
  nickname    text null,
  joined_at   timestamptz not null default now(),

  primary key (group_id, profile_id),
  constraint group_members_role_valid check (role in ('owner', 'member')),
  constraint group_members_nickname_len check (
    nickname is null or char_length(btrim(nickname)) between 1 and 40
  )
);

comment on table public.group_members is 'Pertenencia a un grupo. Alta solo por create_group (owner) o join_group (member).';
comment on column public.group_members.nickname is 'Apodo visible solo dentro de este grupo. Null = usa display_name.';

-- "mis grupos": la PK arranca por group_id, así que hace falta este índice.
create index group_members_profile_id_idx on public.group_members (profile_id);

-- ---------------------------------------------------------------------------
-- seasons
-- ---------------------------------------------------------------------------

create table public.seasons (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups (id) on delete cascade,
  number             int not null,
  starts_on          date not null,
  ends_on            date null,
  winner_profile_id  uuid null references public.profiles (id) on delete set null,
  closed_at          timestamptz null,

  constraint seasons_group_number_unique unique (group_id, number),
  constraint seasons_number_positive check (number >= 1),
  constraint seasons_dates_ordered check (ends_on is null or ends_on >= starts_on),
  constraint seasons_winner_requires_close check (winner_profile_id is null or closed_at is not null)
);

comment on table public.seasons is 'Temporada de 30 días por grupo (ends_on = starts_on + 29). Se abre y se cierra de forma perezosa desde el servidor.';
comment on column public.seasons.closed_at is 'Marca de cierre idempotente. Null = temporada en curso. El campeón puede quedar null si nadie jugó.';

-- ---------------------------------------------------------------------------
-- rounds
-- ---------------------------------------------------------------------------

create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  season_id   uuid not null references public.seasons (id) on delete cascade,
  play_date   date not null,
  game_id     text not null,
  seed        text not null,
  created_at  timestamptz not null default now(),

  constraint rounds_group_date_unique unique (group_id, play_date),
  constraint rounds_game_id_format check (game_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  constraint rounds_seed_not_empty check (char_length(seed) between 1 and 128)
);

comment on table public.rounds is 'Una ronda = un grupo, un día. La crea el servidor con INSERT ... ON CONFLICT DO NOTHING.';
comment on column public.rounds.game_id is 'Slug del registry de juegos (src/games/index.ts). Queda persistido: los días pasados no cambian si cambia el registry.';

-- historial y tabla de la temporada
create index rounds_season_id_play_date_idx on public.rounds (season_id, play_date);

-- ---------------------------------------------------------------------------
-- attempts
-- ---------------------------------------------------------------------------

create table public.attempts (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.rounds (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  attempt_number  smallint not null,
  status          text not null default 'in_progress',
  started_at      timestamptz not null default now(),
  finished_at     timestamptz null,
  score           int null,

  constraint attempts_round_profile_number_unique unique (round_id, profile_id, attempt_number),
  constraint attempts_number_positive check (attempt_number >= 1),
  constraint attempts_status_valid check (status in ('in_progress', 'completed', 'abandoned')),
  -- completed exige puntaje y hora de fin; cualquier otro estado no tiene puntaje
  constraint attempts_completed_has_score check (
    status <> 'completed' or (score is not null and finished_at is not null)
  ),
  constraint attempts_only_completed_has_score check (
    status = 'completed' or score is null
  ),
  constraint attempts_finished_after_start check (
    finished_at is null or finished_at >= started_at
  )
);

comment on table public.attempts is 'Intento de un jugador en una ronda. Solo escribe el servidor (/start y /finish); el cliente no tiene políticas de escritura.';
comment on column public.attempts.started_at is 'Se fija al tocar "jugar", antes de la cuenta regresiva. El intento se consume acá.';

-- ranking de una ronda: solo intentos completados, con puntaje
create index attempts_round_completed_idx
  on public.attempts (round_id, profile_id, score)
  where status = 'completed';

-- estadísticas del perfil y "intentos que te quedan"
create index attempts_profile_round_idx on public.attempts (profile_id, round_id);

-- intentos in_progress que hay que pasar a abandoned después de 5 minutos
create index attempts_in_progress_idx
  on public.attempts (started_at)
  where status = 'in_progress';

-- ---------------------------------------------------------------------------
-- Perfil automático al crearse el usuario (anónimo o no)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime: el ranking del día escucha cambios en attempts. Realtime respeta
-- RLS, así que un usuario recibe solo las filas que podría leer con SELECT.
-- replica identity full hace falta para que el filtrado por RLS tenga la fila
-- completa también en UPDATE y DELETE.
-- ---------------------------------------------------------------------------

alter table public.attempts replica identity full;
alter publication supabase_realtime add table public.attempts;
