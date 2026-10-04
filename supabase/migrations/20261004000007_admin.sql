-- Panel de administración (decisión 236)
--
--   admin_actions           registro de cada cambio del juego de hoy.
--   admin_set_today_game()  cambia (o crea) la ronda de hoy de un grupo,
--                           borra los intentos y deja registro, todo en una
--                           transacción: si algo falla, no queda nada a medias.
--   rounds en Realtime      la pantalla Hoy se entera del cambio sin recargar
--                           (Realtime respeta RLS: solo los integrantes).
--
-- Nada de esto tiene políticas para clientes: solo el servidor, con la clave
-- de servicio y después de comprobar que quien pide es el admin.

create table public.admin_actions (
  id                uuid primary key default gen_random_uuid(),
  admin_email       text not null,
  action            text not null,
  group_id          uuid not null references public.groups (id) on delete cascade,
  play_date         date not null,
  from_game_id      text null,
  to_game_id        text not null,
  deleted_attempts  int not null default 0,
  created_at        timestamptz not null default now(),

  constraint admin_actions_action_valid check (action in ('set_game', 'reset_to_deck')),
  constraint admin_actions_deleted_nonnegative check (deleted_attempts >= 0)
);

comment on table public.admin_actions is 'Cambios hechos desde el panel de admin. RLS sin políticas: solo service_role lee y escribe.';

create index admin_actions_created_at_idx on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;
revoke all on table public.admin_actions from public, anon, authenticated;
grant all on table public.admin_actions to service_role;

-- ---------------------------------------------------------------------------
-- admin_set_today_game
--
-- El servidor ya calculó la fecha de hoy del grupo (en su zona horaria), el
-- juego elegido (o el que toca en el mazo) y la semilla con la fórmula de
-- siempre; acá solo se aplica, en una transacción. Devuelve la ronda, el juego
-- que había y cuántos intentos se borraron.
-- ---------------------------------------------------------------------------

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
begin
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

  insert into public.admin_actions (admin_email, action, group_id, play_date, from_game_id, to_game_id, deleted_attempts)
  values (p_admin_email, p_action, p_group_id, p_play_date, v_from, p_game_id, v_deleted);

  return query select v_round.id, v_from, v_deleted;
end;
$$;

revoke execute on function public.admin_set_today_game(uuid, uuid, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_today_game(uuid, uuid, date, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Realtime para rounds (igual que attempts en la migración 1)
-- ---------------------------------------------------------------------------

alter table public.rounds replica identity full;
alter publication supabase_realtime add table public.rounds;
