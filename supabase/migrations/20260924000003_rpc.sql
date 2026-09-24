-- Etapa 1 · RPC para el cliente
--
--   create_group(p_name, p_timezone)  -> groups     crea el grupo y al owner
--   join_group(p_code)                -> groups     se une con el código
--   round_participants(p_round_id)    -> (profile_id, completed_attempts)
--
-- Las tres son security definer porque un no-miembro no puede leer groups
-- ni escribir group_members directo. Cada una valida auth.uid() y devuelve
-- solo lo que el usuario podría ver después de la operación.

-- ---------------------------------------------------------------------------
-- create_group
-- ---------------------------------------------------------------------------

create or replace function public.create_group(
  p_name text,
  p_timezone text default 'America/Montevideo'
)
returns public.groups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_group public.groups;
  v_code  text;
  v_try   int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;

  if not public.is_valid_timezone(p_timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  -- Reintenta ante una colisión de código (probabilidad ~1e-9 por intento).
  loop
    v_try := v_try + 1;
    v_code := public.generate_invite_code();
    begin
      insert into public.groups (name, invite_code, created_by, timezone)
      values (btrim(p_name), v_code, v_uid, p_timezone)
      returning * into v_group;
      exit;
    exception
      when unique_violation then
        if v_try >= 10 then
          raise exception 'could_not_generate_invite_code' using errcode = 'P0001';
        end if;
    end;
  end loop;

  insert into public.group_members (group_id, profile_id, role)
  values (v_group.id, v_uid, 'owner');

  return v_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_group
-- ---------------------------------------------------------------------------

create or replace function public.join_group(p_code text)
returns public.groups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_group public.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Mismo error para formato inválido y para código inexistente: no se
  -- distingue "no existe" de "mal escrito", para no dar pistas al azar.
  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'invalid_invite_code' using errcode = 'P0002';
  end if;

  select * into v_group
  from public.groups g
  where g.invite_code = v_code;

  if not found then
    raise exception 'invalid_invite_code' using errcode = 'P0002';
  end if;

  -- Volver a entrar con el mismo link no rompe nada.
  insert into public.group_members (group_id, profile_id, role)
  values (v_group.id, v_uid, 'member')
  on conflict (group_id, profile_id) do nothing;

  return v_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- round_participants
--
-- Para la pantalla Hoy antes de jugar: muestra quién ya jugó, sin puntajes.
-- Devuelve filas solo si el usuario es miembro del grupo de la ronda.
-- Por construcción no expone score ni tiempos.
-- ---------------------------------------------------------------------------

create or replace function public.round_participants(p_round_id uuid)
returns table (profile_id uuid, completed_attempts int)
language sql
stable
security definer
set search_path = ''
as $$
  select a.profile_id, count(*)::int as completed_attempts
  from public.attempts a
  join public.rounds r on r.id = a.round_id
  where a.round_id = p_round_id
    and a.status = 'completed'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = r.group_id and gm.profile_id = auth.uid()
    )
  group by a.profile_id;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_group(text, text),
  public.join_group(text),
  public.round_participants(uuid)
from public, anon;

grant execute on function
  public.create_group(text, text),
  public.join_group(text),
  public.round_participants(uuid)
to authenticated, service_role;
