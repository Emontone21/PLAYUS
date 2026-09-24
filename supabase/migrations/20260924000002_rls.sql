-- Etapa 1 · Row Level Security
--
-- Reglas:
--   * anon (sin sesión) no lee ni escribe nada. La app siempre abre una sesión
--     anónima de Supabase, que llega como rol authenticated.
--   * Un usuario lee solo filas de grupos a los que pertenece.
--   * Puntajes de la ronda de hoy: se ven los de los demás solo si el usuario
--     ya tiene un attempt completed en esa ronda. Las rondas pasadas se ven
--     completas dentro del grupo.
--   * attempts, rounds y seasons: cero escritura desde el cliente. Solo el
--     servidor (service_role, que saltea RLS) escribe.
--   * groups y group_members: alta solo por RPC (create_group / join_group).
--     Un owner edita name/timezone/max_attempts. Un miembro edita su nickname.

-- ---------------------------------------------------------------------------
-- Helpers security definer. Se usan dentro de las políticas para evitar que
-- la política de group_members se consulte a sí misma en bucle, y para
-- consultar rounds/attempts sin pasar por sus propias políticas.
-- Todas devuelven información sobre el propio usuario, nunca sobre terceros.
-- ---------------------------------------------------------------------------

create or replace function public.is_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id = auth.uid()
  );
$$;

create or replace function public.is_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id = auth.uid()
      and gm.role = 'owner'
  );
$$;

-- ¿El usuario comparte al menos un grupo con este perfil?
create or replace function public.shares_group_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = p_profile_id
  );
$$;

-- Fecha de "hoy" para un grupo, en su zona horaria.
create or replace function public.group_today(p_group_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone g.timezone)::date
  from public.groups g
  where g.id = p_group_id;
$$;

-- ¿Puede el usuario ver los puntajes de los demás en esta ronda?
-- Sí cuando es miembro del grupo y, además, la ronda ya pasó o el usuario
-- ya tiene un intento completado en ella.
create or replace function public.can_view_round_scores(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rounds r
    join public.groups g on g.id = r.group_id
    where r.id = p_round_id
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = r.group_id and gm.profile_id = auth.uid()
      )
      and (
        r.play_date < (now() at time zone g.timezone)::date
        or exists (
          select 1 from public.attempts a
          where a.round_id = r.id
            and a.profile_id = auth.uid()
            and a.status = 'completed'
        )
      )
  );
$$;

revoke execute on function
  public.is_member(uuid),
  public.is_owner(uuid),
  public.shares_group_with(uuid),
  public.group_today(uuid),
  public.can_view_round_scores(uuid)
from public, anon;

grant execute on function
  public.is_member(uuid),
  public.is_owner(uuid),
  public.shares_group_with(uuid),
  public.group_today(uuid),
  public.can_view_round_scores(uuid)
to authenticated, service_role;

-- Las funciones puras del esquema tampoco hacen falta para anon.
revoke execute on function
  public.is_valid_timezone(text),
  public.invite_code_alphabet(),
  public.generate_invite_code()
from public, anon;

grant execute on function
  public.is_valid_timezone(text),
  public.invite_code_alphabet()
to authenticated, service_role;

grant execute on function public.generate_invite_code() to service_role;

-- ---------------------------------------------------------------------------
-- Privilegios de tabla. Supabase otorga por defecto todo a anon y
-- authenticated; acá se pisa eso con lo mínimo. RLS decide después qué filas.
-- ---------------------------------------------------------------------------

revoke all on table
  public.profiles,
  public.groups,
  public.group_members,
  public.seasons,
  public.rounds,
  public.attempts
from anon, authenticated;

grant select on table
  public.profiles,
  public.groups,
  public.group_members,
  public.seasons,
  public.rounds,
  public.attempts
to authenticated;

-- El perfil propio se completa desde el cliente (nombre + avatar).
grant insert, update on table public.profiles to authenticated;

-- El owner ajusta el grupo, pero nunca el código ni el creador.
grant update (name, timezone, max_attempts) on table public.groups to authenticated;

-- El apodo por grupo es la única columna editable de la membresía.
grant update (nickname) on table public.group_members to authenticated;

-- service_role saltea RLS y es el único que escribe rondas, temporadas e intentos.
grant all on table
  public.profiles,
  public.groups,
  public.group_members,
  public.seasons,
  public.rounds,
  public.attempts
to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.seasons        enable row level security;
alter table public.rounds         enable row level security;
alter table public.attempts       enable row level security;

-- profiles ------------------------------------------------------------------

create policy "profiles: leer el propio y los de mis grupos"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create policy "profiles: crear el propio"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles: editar el propio"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- groups --------------------------------------------------------------------

create policy "groups: leer mis grupos"
  on public.groups
  for select
  to authenticated
  using (public.is_member(id));

create policy "groups: el owner edita"
  on public.groups
  for update
  to authenticated
  using (public.is_owner(id))
  with check (public.is_owner(id));

-- group_members -------------------------------------------------------------

create policy "group_members: leer integrantes de mis grupos"
  on public.group_members
  for select
  to authenticated
  using (public.is_member(group_id));

create policy "group_members: editar mi propia fila"
  on public.group_members
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- seasons -------------------------------------------------------------------

create policy "seasons: leer las de mis grupos"
  on public.seasons
  for select
  to authenticated
  using (public.is_member(group_id));

-- rounds --------------------------------------------------------------------

create policy "rounds: leer las de mis grupos"
  on public.rounds
  for select
  to authenticated
  using (public.is_member(group_id));

-- attempts ------------------------------------------------------------------
-- Los propios siempre. Los ajenos solo cuando can_view_round_scores lo permite
-- (ronda pasada del grupo, o ya completé un intento en la ronda de hoy).

create policy "attempts: los míos y los que ya puedo ver"
  on public.attempts
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or public.can_view_round_scores(round_id)
  );
