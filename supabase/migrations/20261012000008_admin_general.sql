-- Panel de admin: administración general (decisiones 278 a 283)
--
--   groups.is_test          marca "de prueba": lo que se puede limpiar sin miedo.
--   game_settings           qué juegos están en la rotación (el mazo solo reparte
--                           los habilitados). RLS sin políticas: solo service_role.
--   admin_actions           se amplía: más acciones, group_id opcional (y se
--                           conserva el registro si el grupo se borra), target
--                           (sobre qué fue) y details (qué se borró y cuántas
--                           filas de cada tabla).
--   admin_*()               cada acción es una función security definer que solo
--                           puede ejecutar service_role, en una sola transacción:
--                           o se hace entera o no se hace nada. Con p_dry_run la
--                           función calcula la vista previa (los mismos conteos
--                           que después va a borrar) sin tocar nada.
--
-- Los admins se reconocen por email (ADMIN_EMAILS): el servidor pasa la lista
-- y acá nunca se borra a un usuario de esa lista.

-- ---------------------------------------------------------------------------
-- groups.is_test
-- ---------------------------------------------------------------------------

alter table public.groups add column is_test boolean not null default false;
comment on column public.groups.is_test is 'Grupo de prueba: el panel de admin lo puede limpiar junto con sus usuarios. Solo lo cambia el admin.';

-- ---------------------------------------------------------------------------
-- game_settings
-- ---------------------------------------------------------------------------

create table public.game_settings (
  game_id     text primary key,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),

  constraint game_settings_game_id_format check (game_id ~ '^[a-z0-9][a-z0-9-]{0,39}$')
);

comment on table public.game_settings is 'Qué juegos del registro están en la rotación. Sin fila = habilitado. RLS sin políticas: solo service_role.';

alter table public.game_settings enable row level security;
revoke all on table public.game_settings from public, anon, authenticated;
grant all on table public.game_settings to service_role;

-- ---------------------------------------------------------------------------
-- admin_actions: más acciones, group_id opcional, target y details
-- ---------------------------------------------------------------------------

alter table public.admin_actions drop constraint admin_actions_action_valid;
alter table public.admin_actions add constraint admin_actions_action_valid check (action in (
  'set_game', 'reset_to_deck', 'delete_group', 'delete_user', 'cleanup_test', 'delete_orphans',
  'remove_member', 'change_owner', 'reset_season', 'toggle_game', 'push_test', 'push_announce'
));

alter table public.admin_actions alter column group_id drop not null;
alter table public.admin_actions alter column play_date drop not null;
alter table public.admin_actions alter column to_game_id drop not null;
-- si el grupo se borra, el registro queda (con el nombre en target)
alter table public.admin_actions drop constraint admin_actions_group_id_fkey;
alter table public.admin_actions add constraint admin_actions_group_id_fkey
  foreign key (group_id) references public.groups (id) on delete set null;

alter table public.admin_actions add column target text null;
alter table public.admin_actions add column details jsonb not null default '{}'::jsonb;
comment on column public.admin_actions.target is 'Sobre qué fue: el nombre del grupo o del usuario, o el id del juego.';
comment on column public.admin_actions.details is 'El detalle: qué se borró y cuántas filas de cada tabla, a quién fue el aviso, etc.';

alter table public.admin_actions add constraint admin_actions_details_is_object check (jsonb_typeof(details) = 'object');
alter table public.admin_actions add constraint admin_actions_game_fields check (
  action not in ('set_game', 'reset_to_deck') or (group_id is not null and play_date is not null and to_game_id is not null)
);

-- admin_set_today_game ahora también guarda el nombre del grupo en target
create or replace function public.admin_set_today_game(
  p_group_id    uuid,
  p_season_id   uuid,
  p_play_date   date,
  p_game_id     text,
  p_seed        text,
  p_admin_email text,
  p_action      text
)
returns table (o_round_id uuid, o_from_game_id text, o_deleted int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_round   public.rounds;
  v_deleted int := 0;
  v_from    text := null;
  v_name    text;
begin
  select g.name into v_name from public.groups g where g.id = p_group_id;

  select * into v_round
  from public.rounds r
  where r.group_id = p_group_id and r.play_date = p_play_date
  for update;

  if found then
    v_from := v_round.game_id;
    delete from public.attempts a where a.round_id = v_round.id;
    get diagnostics v_deleted = row_count;
    update public.rounds r set game_id = p_game_id, seed = p_seed where r.id = v_round.id;
  else
    insert into public.rounds (group_id, season_id, play_date, game_id, seed)
    values (p_group_id, p_season_id, p_play_date, p_game_id, p_seed)
    returning * into v_round;
  end if;

  insert into public.admin_actions (admin_email, action, group_id, play_date, from_game_id, to_game_id, deleted_attempts, target, details)
  values (p_admin_email, p_action, p_group_id, p_play_date, v_from, p_game_id, v_deleted, v_name,
          jsonb_build_object('from_game_id', v_from, 'to_game_id', p_game_id, 'play_date', p_play_date, 'attempts', v_deleted));

  return query select v_round.id, v_from, v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

-- ¿Este perfil es de un admin? (su email de auth está en la lista)
create or replace function public.admin_is_protected(p_profile_id uuid, p_admin_emails text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_profile_id and lower(u.email) = any (p_admin_emails)
  );
$$;

-- Antes de borrar usuarios: los grupos que crearon pasan a tener como
-- created_by a su dueño actual (la FK es on delete restrict).
create or replace function public.admin_reassign_created_by(p_profile_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.groups g
  set created_by = (
    select gm.profile_id from public.group_members gm
    where gm.group_id = g.id and gm.role = 'owner' and not (gm.profile_id = any (p_profile_ids))
    order by gm.joined_at limit 1
  )
  where g.created_by = any (p_profile_ids);
end;
$$;

-- Borra usuarios de auth (cascada a profiles, group_members, attempts y
-- push_subscriptions) y, por si alguno no tenía fila en auth, sus perfiles.
create or replace function public.admin_delete_users(p_profile_ids uuid[])
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n int := 0;
begin
  if p_profile_ids is null or array_length(p_profile_ids, 1) is null then
    return 0;
  end if;
  perform public.admin_reassign_created_by(p_profile_ids);
  delete from auth.users u where u.id = any (p_profile_ids);
  delete from public.profiles p where p.id = any (p_profile_ids);
  select count(*) into v_n from unnest(p_profile_ids);
  return v_n;
end;
$$;

-- el registro, para las acciones que no son una función entera (push)
create or replace function public.admin_log(
  p_admin_email text,
  p_action      text,
  p_group_id    uuid,
  p_target      text,
  p_details     jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, p_action, p_group_id, p_target, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- lecturas del panel
-- ---------------------------------------------------------------------------

-- por grupo: temporada actual (la última no cerrada) y última actividad
create or replace function public.admin_groups_extra()
returns table (
  group_id        uuid,
  season_number   int,
  season_starts   date,
  season_ends     date,
  last_activity   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    s.number,
    s.starts_on,
    s.ends_on,
    greatest(
      g.created_at,
      (select max(a.started_at) from public.attempts a join public.rounds r on r.id = a.round_id where r.group_id = g.id),
      (select max(gm.joined_at) from public.group_members gm where gm.group_id = g.id)
    )
  from public.groups g
  left join lateral (
    select * from public.seasons x where x.group_id = g.id and x.closed_at is null order by x.number desc limit 1
  ) s on true;
$$;

-- el detalle de un grupo: integrantes (con si tienen email y cuántas partidas
-- completaron en la temporada actual) y temporadas
create or replace function public.admin_group_detail(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season  public.seasons;
  v_members jsonb;
  v_seasons jsonb;
begin
  select * into v_season from public.seasons s where s.group_id = p_group_id and s.closed_at is null order by s.number desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'profile_id', gm.profile_id,
      'display_name', p.display_name,
      'nickname', gm.nickname,
      'avatar', p.avatar,
      'role', gm.role,
      'joined_at', gm.joined_at,
      'has_email', (u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)),
      'played', (
        select count(*) from public.attempts a join public.rounds r on r.id = a.round_id
        where a.profile_id = gm.profile_id and a.status = 'completed' and v_season.id is not null and r.season_id = v_season.id
      )
    ) order by (gm.role = 'owner') desc, gm.joined_at), '[]'::jsonb)
  into v_members
  from public.group_members gm
  join public.profiles p on p.id = gm.profile_id
  left join auth.users u on u.id = gm.profile_id
  where gm.group_id = p_group_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'number', s.number, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'closed_at', s.closed_at,
      'winner_profile_id', s.winner_profile_id,
      'rounds', (select count(*) from public.rounds r where r.season_id = s.id),
      'attempts', (select count(*) from public.attempts a join public.rounds r on r.id = a.round_id where r.season_id = s.id)
    ) order by s.number desc), '[]'::jsonb)
  into v_seasons
  from public.seasons s where s.group_id = p_group_id;

  return jsonb_build_object('members', v_members, 'seasons', v_seasons, 'current_season', case when v_season.id is null then null else to_jsonb(v_season) end);
end;
$$;

-- todos los usuarios con su email (solo si está vinculado y confirmado; nunca
-- tokens ni nada de la sesión), sus grupos y su última partida
create or replace function public.admin_users_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'avatar', p.avatar,
    'email', case when u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false) then u.email else null end,
    'created_at', p.created_at,
    'last_played', (select max(a.finished_at) from public.attempts a where a.profile_id = p.id and a.status = 'completed'),
    'push', (select count(*) from public.push_subscriptions s where s.profile_id = p.id),
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', gm.role, 'is_test', g.is_test) order by g.name), '[]'::jsonb)
      from public.group_members gm join public.groups g on g.id = gm.group_id where gm.profile_id = p.id
    )
  ) order by p.created_at desc), '[]'::jsonb)
  from public.profiles p
  left join auth.users u on u.id = p.id;
$$;

-- ---------------------------------------------------------------------------
-- borrar un grupo
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_group(
  p_group_id       uuid,
  p_delete_orphans boolean,
  p_admin_emails   text[],
  p_admin_email    text,
  p_dry_run        boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group      public.groups;
  v_members    int;
  v_seasons    int;
  v_rounds     int;
  v_attempts   int;
  v_orphan_ids uuid[];
  v_orphans    jsonb;
  v_deleted    int := 0;
  v_result     jsonb;
begin
  select * into v_group from public.groups g where g.id = p_group_id for update;
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_members from public.group_members gm where gm.group_id = p_group_id;
  select count(*) into v_seasons from public.seasons s where s.group_id = p_group_id;
  select count(*) into v_rounds from public.rounds r where r.group_id = p_group_id;
  select count(*) into v_attempts from public.attempts a join public.rounds r on r.id = a.round_id where r.group_id = p_group_id;

  -- quiénes quedarían sin ningún grupo, salvo los admins
  select coalesce(array_agg(x.profile_id), '{}'::uuid[]),
         coalesce(jsonb_agg(jsonb_build_object('id', x.profile_id, 'name', x.display_name) order by x.display_name), '[]'::jsonb)
  into v_orphan_ids, v_orphans
  from (
    select gm.profile_id, p.display_name
    from public.group_members gm
    join public.profiles p on p.id = gm.profile_id
    where gm.group_id = p_group_id
      and not exists (select 1 from public.group_members o where o.profile_id = gm.profile_id and o.group_id <> p_group_id)
      and not public.admin_is_protected(gm.profile_id, p_admin_emails)
  ) x;

  v_result := jsonb_build_object(
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name, 'is_test', v_group.is_test),
    'members', v_members, 'seasons', v_seasons, 'rounds', v_rounds, 'attempts', v_attempts,
    'orphans', v_orphans, 'delete_orphans', p_delete_orphans, 'deleted_users', 0
  );
  if p_dry_run then
    return v_result;
  end if;

  delete from public.groups g where g.id = p_group_id;
  if p_delete_orphans then
    v_deleted := public.admin_delete_users(v_orphan_ids);
  end if;
  v_result := v_result || jsonb_build_object('deleted_users', v_deleted);

  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'delete_group', null, v_group.name, v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- borrar un usuario
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_user(
  p_profile_id   uuid,
  p_admin_emails text[],
  p_admin_email  text,
  p_dry_run      boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile   public.profiles;
  v_email     text;
  v_groups    jsonb;
  v_owner_of  jsonb;
  v_members   int;
  v_attempts  int;
  v_push      int;
  v_result    jsonb;
begin
  select * into v_profile from public.profiles p where p.id = p_profile_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if public.admin_is_protected(p_profile_id, p_admin_emails) then
    raise exception 'admin_protected' using errcode = 'P0001';
  end if;

  select case when u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false) then u.email else null end
  into v_email from auth.users u where u.id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', gm.role, 'is_test', g.is_test) order by g.name), '[]'::jsonb), count(*)
  into v_groups, v_members
  from public.group_members gm join public.groups g on g.id = gm.group_id where gm.profile_id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name), '[]'::jsonb)
  into v_owner_of
  from public.group_members gm join public.groups g on g.id = gm.group_id where gm.profile_id = p_profile_id and gm.role = 'owner';

  select count(*) into v_attempts from public.attempts a where a.profile_id = p_profile_id;
  select count(*) into v_push from public.push_subscriptions s where s.profile_id = p_profile_id;

  v_result := jsonb_build_object(
    'user', jsonb_build_object('id', v_profile.id, 'name', v_profile.display_name, 'email', v_email),
    'groups', v_groups, 'owner_of', v_owner_of,
    'memberships', v_members, 'attempts', v_attempts, 'push', v_push
  );
  if p_dry_run then
    return v_result;
  end if;
  if jsonb_array_length(v_owner_of) > 0 then
    raise exception 'is_owner' using errcode = 'P0001';
  end if;

  perform public.admin_delete_users(array[p_profile_id]);

  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'delete_user', null, v_profile.display_name, v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- limpiar los datos de prueba: todos los grupos marcados y, después, los
-- usuarios que quedaron sin ningún grupo (salvo los admins)
-- ---------------------------------------------------------------------------

create or replace function public.admin_cleanup_test(
  p_admin_emails text[],
  p_admin_email  text,
  p_dry_run      boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group_ids uuid[];
  v_groups    jsonb;
  v_members   int;
  v_seasons   int;
  v_rounds    int;
  v_attempts  int;
  v_user_ids  uuid[];
  v_users     jsonb;
  v_deleted   int := 0;
  v_result    jsonb;
begin
  select coalesce(array_agg(g.id), '{}'::uuid[]),
         coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'members', (select count(*) from public.group_members gm where gm.group_id = g.id)) order by g.name), '[]'::jsonb)
  into v_group_ids, v_groups
  from public.groups g where g.is_test;

  select count(*) into v_members from public.group_members gm where gm.group_id = any (v_group_ids);
  select count(*) into v_seasons from public.seasons s where s.group_id = any (v_group_ids);
  select count(*) into v_rounds from public.rounds r where r.group_id = any (v_group_ids);
  select count(*) into v_attempts from public.attempts a join public.rounds r on r.id = a.round_id where r.group_id = any (v_group_ids);

  -- quiénes quedarían sin ningún grupo: solo están en grupos de prueba
  select coalesce(array_agg(x.id), '{}'::uuid[]),
         coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.display_name) order by x.display_name), '[]'::jsonb)
  into v_user_ids, v_users
  from (
    select distinct p.id, p.display_name
    from public.profiles p
    join public.group_members gm on gm.profile_id = p.id and gm.group_id = any (v_group_ids)
    where not exists (
      select 1 from public.group_members o join public.groups og on og.id = o.group_id
      where o.profile_id = p.id and not og.is_test
    )
    and not public.admin_is_protected(p.id, p_admin_emails)
  ) x;

  v_result := jsonb_build_object(
    'groups', v_groups, 'users', v_users,
    'members', v_members, 'seasons', v_seasons, 'rounds', v_rounds, 'attempts', v_attempts,
    'deleted_groups', 0, 'deleted_users', 0
  );
  if p_dry_run then
    return v_result;
  end if;

  delete from public.groups g where g.id = any (v_group_ids);
  v_deleted := public.admin_delete_users(v_user_ids);
  v_result := v_result || jsonb_build_object('deleted_groups', coalesce(array_length(v_group_ids, 1), 0), 'deleted_users', v_deleted);

  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'cleanup_test', null, format('%s grupos de prueba', coalesce(array_length(v_group_ids, 1), 0)), v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- borrar a todos los usuarios sin grupo (salvo los admins)
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_orphans(
  p_admin_emails text[],
  p_admin_email  text,
  p_dry_run      boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_ids uuid[];
  v_users    jsonb;
  v_attempts int;
  v_push     int;
  v_deleted  int := 0;
  v_result   jsonb;
begin
  select coalesce(array_agg(p.id), '{}'::uuid[]),
         coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name) order by p.display_name), '[]'::jsonb)
  into v_user_ids, v_users
  from public.profiles p
  where not exists (select 1 from public.group_members gm where gm.profile_id = p.id)
    and not public.admin_is_protected(p.id, p_admin_emails);

  select count(*) into v_attempts from public.attempts a where a.profile_id = any (v_user_ids);
  select count(*) into v_push from public.push_subscriptions s where s.profile_id = any (v_user_ids);

  v_result := jsonb_build_object('users', v_users, 'attempts', v_attempts, 'push', v_push, 'deleted_users', 0);
  if p_dry_run then
    return v_result;
  end if;

  v_deleted := public.admin_delete_users(v_user_ids);
  v_result := v_result || jsonb_build_object('deleted_users', v_deleted);

  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'delete_orphans', null, format('%s usuarios sin grupo', v_deleted), v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- sacar a un integrante: su membresía y sus intentos de la temporada actual
-- ---------------------------------------------------------------------------

create or replace function public.admin_remove_member(
  p_group_id    uuid,
  p_profile_id  uuid,
  p_admin_email text,
  p_dry_run     boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group    public.groups;
  v_member   public.group_members;
  v_name     text;
  v_season   public.seasons;
  v_attempts int := 0;
  v_result   jsonb;
begin
  select * into v_group from public.groups g where g.id = p_group_id for update;
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  select * into v_member from public.group_members gm where gm.group_id = p_group_id and gm.profile_id = p_profile_id for update;
  if not found then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if v_member.role = 'owner' then
    raise exception 'is_owner' using errcode = 'P0001';
  end if;
  select coalesce(nullif(btrim(v_member.nickname), ''), p.display_name) into v_name from public.profiles p where p.id = p_profile_id;

  select * into v_season from public.seasons s where s.group_id = p_group_id and s.closed_at is null order by s.number desc limit 1;
  if v_season.id is not null then
    select count(*) into v_attempts
    from public.attempts a join public.rounds r on r.id = a.round_id
    where r.season_id = v_season.id and a.profile_id = p_profile_id;
  end if;

  v_result := jsonb_build_object(
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name, 'is_test', v_group.is_test),
    'member', jsonb_build_object('id', p_profile_id, 'name', v_name, 'role', v_member.role),
    'season_number', v_season.number, 'attempts', v_attempts
  );
  if p_dry_run then
    return v_result;
  end if;

  if v_season.id is not null then
    delete from public.attempts a
    using public.rounds r
    where r.id = a.round_id and r.season_id = v_season.id and a.profile_id = p_profile_id;
  end if;
  delete from public.group_members gm where gm.group_id = p_group_id and gm.profile_id = p_profile_id;

  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'remove_member', p_group_id, v_group.name, v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- cambiar el dueño: los roles se intercambian
-- ---------------------------------------------------------------------------

create or replace function public.admin_change_owner(
  p_group_id    uuid,
  p_profile_id  uuid,
  p_admin_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group  public.groups;
  v_target public.group_members;
  v_from   uuid;
  v_from_n text;
  v_to_n   text;
  v_result jsonb;
begin
  select * into v_group from public.groups g where g.id = p_group_id for update;
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  select * into v_target from public.group_members gm where gm.group_id = p_group_id and gm.profile_id = p_profile_id for update;
  if not found then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if v_target.role = 'owner' then
    raise exception 'already_owner' using errcode = 'P0001';
  end if;

  select gm.profile_id into v_from from public.group_members gm where gm.group_id = p_group_id and gm.role = 'owner' order by gm.joined_at limit 1;
  update public.group_members gm set role = 'member' where gm.group_id = p_group_id and gm.role = 'owner';
  update public.group_members gm set role = 'owner' where gm.group_id = p_group_id and gm.profile_id = p_profile_id;

  select coalesce(nullif(btrim(gm.nickname), ''), p.display_name) into v_from_n from public.group_members gm join public.profiles p on p.id = gm.profile_id where gm.group_id = p_group_id and gm.profile_id = v_from;
  select coalesce(nullif(btrim(gm.nickname), ''), p.display_name) into v_to_n from public.group_members gm join public.profiles p on p.id = gm.profile_id where gm.group_id = p_group_id and gm.profile_id = p_profile_id;

  v_result := jsonb_build_object(
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name, 'is_test', v_group.is_test),
    'from', jsonb_build_object('id', v_from, 'name', v_from_n),
    'to', jsonb_build_object('id', p_profile_id, 'name', v_to_n)
  );
  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'change_owner', p_group_id, v_group.name, v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- reiniciar la temporada actual: sus rondas e intentos se borran y vuelve a
-- empezar desde hoy, con el mismo número; las cerradas no se tocan
-- ---------------------------------------------------------------------------

create or replace function public.admin_reset_season(
  p_group_id    uuid,
  p_today       date,
  p_admin_email text,
  p_dry_run     boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group    public.groups;
  v_season   public.seasons;
  v_rounds   int;
  v_attempts int;
  v_result   jsonb;
begin
  select * into v_group from public.groups g where g.id = p_group_id for update;
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  select * into v_season from public.seasons s where s.group_id = p_group_id and s.closed_at is null order by s.number desc limit 1 for update;
  if not found then
    raise exception 'no_season' using errcode = 'P0001';
  end if;

  select count(*) into v_rounds from public.rounds r where r.season_id = v_season.id;
  select count(*) into v_attempts from public.attempts a join public.rounds r on r.id = a.round_id where r.season_id = v_season.id;

  v_result := jsonb_build_object(
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name, 'is_test', v_group.is_test),
    'season_number', v_season.number, 'starts_on_before', v_season.starts_on, 'starts_on', p_today, 'ends_on', p_today + 29,
    'rounds', v_rounds, 'attempts', v_attempts
  );
  if p_dry_run then
    return v_result;
  end if;

  delete from public.rounds r where r.season_id = v_season.id;
  update public.seasons s set starts_on = p_today, ends_on = p_today + 29 where s.id = v_season.id;

  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'reset_season', p_group_id, v_group.name, v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- juegos en rotación: tiene que quedar al menos uno habilitado
-- ---------------------------------------------------------------------------

create or replace function public.admin_toggle_game(
  p_game_id     text,
  p_enabled     boolean,
  p_registry    text[],
  p_admin_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_left int;
begin
  insert into public.game_settings (game_id, enabled) values (p_game_id, p_enabled)
  on conflict (game_id) do update set enabled = excluded.enabled, updated_at = now();

  select count(*) into v_left
  from unnest(p_registry) g(id)
  where not exists (select 1 from public.game_settings s where s.game_id = g.id and not s.enabled);
  if v_left = 0 then
    raise exception 'last_game' using errcode = 'P0001';
  end if;

  insert into public.admin_actions (admin_email, action, group_id, target, details)
  values (p_admin_email, 'toggle_game', null, p_game_id, jsonb_build_object('game_id', p_game_id, 'enabled', p_enabled, 'enabled_count', v_left));
  return jsonb_build_object('game_id', p_game_id, 'enabled', p_enabled, 'enabled_count', v_left);
end;
$$;

-- ---------------------------------------------------------------------------
-- permisos: solo service_role
-- ---------------------------------------------------------------------------

revoke execute on function
  public.admin_is_protected(uuid, text[]),
  public.admin_reassign_created_by(uuid[]),
  public.admin_delete_users(uuid[]),
  public.admin_log(text, text, uuid, text, jsonb),
  public.admin_groups_extra(),
  public.admin_group_detail(uuid),
  public.admin_users_overview(),
  public.admin_delete_group(uuid, boolean, text[], text, boolean),
  public.admin_delete_user(uuid, text[], text, boolean),
  public.admin_cleanup_test(text[], text, boolean),
  public.admin_delete_orphans(text[], text, boolean),
  public.admin_remove_member(uuid, uuid, text, boolean),
  public.admin_change_owner(uuid, uuid, text),
  public.admin_reset_season(uuid, date, text, boolean),
  public.admin_toggle_game(text, boolean, text[], text)
from public, anon, authenticated;

grant execute on function
  public.admin_is_protected(uuid, text[]),
  public.admin_reassign_created_by(uuid[]),
  public.admin_delete_users(uuid[]),
  public.admin_log(text, text, uuid, text, jsonb),
  public.admin_groups_extra(),
  public.admin_group_detail(uuid),
  public.admin_users_overview(),
  public.admin_delete_group(uuid, boolean, text[], text, boolean),
  public.admin_delete_user(uuid, text[], text, boolean),
  public.admin_cleanup_test(text[], text, boolean),
  public.admin_delete_orphans(text[], text, boolean),
  public.admin_remove_member(uuid, uuid, text, boolean),
  public.admin_change_owner(uuid, uuid, text),
  public.admin_reset_season(uuid, date, text, boolean),
  public.admin_toggle_game(text, boolean, text[], text)
to service_role;
