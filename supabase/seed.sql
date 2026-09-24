-- Seed de desarrollo: un grupo de prueba con 4 integrantes falsos y puntajes.
--
-- Se aplica con `supabase db reset` (ver config.toml → [db.seed]).
-- Los integrantes son usuarios anónimos falsos insertados directo en auth.users;
-- el trigger on_auth_user_created les crea el perfil. Nadie puede iniciar
-- sesión con ellos: sirven para ver la app con datos y para los tests.
--
-- Contenido:
--   * grupo "los del barrio", código JUEGA7, zona America/Montevideo
--   * temporada 1 que arrancó hace 6 días
--   * 7 rondas: 6 pasadas cerradas + la de hoy, alternando tap-race y reflejo
--   * intentos completados con puntajes verosímiles; en la ronda de hoy solo
--     jugaron Nico y Flor, para ver el estado "puntajes tapados"
--
-- Las rondas del seed NO siguen el algoritmo del mazo (etapa 5): son datos
-- para mirar, no el resultado de ensureRound().

do $$
declare
  -- ids fijos, así los tests y las notas pueden referirse a ellos
  c_vale  constant uuid := '00000000-0000-4000-8000-000000000001';
  c_nico  constant uuid := '00000000-0000-4000-8000-000000000002';
  c_flor  constant uuid := '00000000-0000-4000-8000-000000000003';
  c_tomi  constant uuid := '00000000-0000-4000-8000-000000000004';
  c_group constant uuid := '00000000-0000-4000-8000-0000000000a1';
  c_season constant uuid := '00000000-0000-4000-8000-0000000000b1';
  c_tz    constant text := 'America/Montevideo';

  v_today date := (now() at time zone c_tz)::date;
  v_day   int;
  v_date  date;
  v_round uuid;
  v_game  text;
  v_seed  text;
  v_start timestamptz;
  v_player record;
  v_n     int;
  v_score int;
begin
  -- usuarios anónimos falsos --------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, raw_app_meta_data, raw_user_meta_data,
    is_anonymous, created_at, updated_at
  )
  values
    ('00000000-0000-0000-0000-000000000000', c_vale, 'authenticated', 'authenticated',
      '{"provider":"anonymous","providers":["anonymous"]}', '{"display_name":"Vale"}',
      true, now() - interval '7 days', now() - interval '7 days'),
    ('00000000-0000-0000-0000-000000000000', c_nico, 'authenticated', 'authenticated',
      '{"provider":"anonymous","providers":["anonymous"]}', '{"display_name":"Nico"}',
      true, now() - interval '7 days', now() - interval '7 days'),
    ('00000000-0000-0000-0000-000000000000', c_flor, 'authenticated', 'authenticated',
      '{"provider":"anonymous","providers":["anonymous"]}', '{"display_name":"Flor"}',
      true, now() - interval '6 days', now() - interval '6 days'),
    ('00000000-0000-0000-0000-000000000000', c_tomi, 'authenticated', 'authenticated',
      '{"provider":"anonymous","providers":["anonymous"]}', '{"display_name":"Tomi"}',
      true, now() - interval '6 days', now() - interval '6 days')
  on conflict (id) do nothing;

  -- el trigger ya creó los perfiles; les damos avatar
  update public.profiles set avatar = '{"base":1,"skin":"#C98A5E","hair":3,"hairColor":"#2B1D14","eyes":2,"mouth":1,"accessory":null,"bg":"#FFC94A"}' where id = c_vale;
  update public.profiles set avatar = '{"base":2,"skin":"#F1C27D","hair":7,"hairColor":"#5A3825","eyes":4,"mouth":3,"accessory":2,"bg":"#5BC0BE"}' where id = c_nico;
  update public.profiles set avatar = '{"base":3,"skin":"#8D5524","hair":1,"hairColor":"#000000","eyes":1,"mouth":4,"accessory":null,"bg":"#FF5C8A"}' where id = c_flor;
  update public.profiles set avatar = '{"base":1,"skin":"#E0AC69","hair":5,"hairColor":"#B55239","eyes":3,"mouth":2,"accessory":1,"bg":"#26244A"}' where id = c_tomi;

  -- grupo e integrantes -------------------------------------------------------
  insert into public.groups (id, name, invite_code, created_by, timezone, max_attempts, created_at)
  values (c_group, 'los del barrio', 'JUEGA7', c_vale, c_tz, 3, now() - interval '7 days')
  on conflict (id) do nothing;

  insert into public.group_members (group_id, profile_id, role, nickname, joined_at)
  values
    (c_group, c_vale, 'owner',  null,      now() - interval '7 days'),
    (c_group, c_nico, 'member', 'Nicolás', now() - interval '7 days'),
    (c_group, c_flor, 'member', null,      now() - interval '6 days'),
    (c_group, c_tomi, 'member', 'el Tomi', now() - interval '6 days')
  on conflict do nothing;

  -- temporada 1: arrancó hace 6 días, dura 30 ----------------------------------
  insert into public.seasons (id, group_id, number, starts_on, ends_on)
  values (c_season, c_group, 1, v_today - 6, v_today - 6 + 29)
  on conflict (group_id, number) do nothing;

  -- rondas: hoy-6 .. hoy, alternando juegos ------------------------------------
  for v_day in 0..6 loop
    v_date := v_today - 6 + v_day;
    v_game := case when v_day % 2 = 0 then 'tap-race' else 'reflejo' end;
    -- semilla de fantasía (en la app sale de hash(group_id + play_date + game_id))
    v_seed := encode(extensions.digest(c_group::text || v_date::text || v_game, 'sha256'), 'hex');

    v_round := null;
    insert into public.rounds (group_id, season_id, play_date, game_id, seed, created_at)
    values (c_group, c_season, v_date, v_game, v_seed, (v_date::timestamp + time '09:00') at time zone c_tz)
    on conflict (group_id, play_date) do nothing
    returning id into v_round;

    if v_round is null then
      continue;
    end if;

    -- quién jugó: en la ronda de hoy solo Nico y Flor
    for v_player in
      select * from (values
        (c_vale, 1), (c_nico, 2), (c_flor, 3), (c_tomi, 4)
      ) as p(id, ord)
    loop
      if v_day = 6 and v_player.id in (c_vale, c_tomi) then
        continue;
      end if;
      -- Tomi faltó el segundo día: "si ayer no jugaste, perdiste"
      if v_day = 1 and v_player.id = c_tomi then
        continue;
      end if;

      -- cantidad de intentos por persona y día: 1 a 3, determinístico
      v_n := 1 + ((v_day * 7 + v_player.ord * 3) % 3);

      for i in 1..v_n loop
        v_start := (v_date::timestamp + time '20:00') at time zone c_tz
                   + make_interval(mins => v_player.ord * 5 + i * 2);

        if v_game = 'tap-race' then
          -- toques en 15 s: entre 45 y 95
          v_score := 45 + ((v_day * 13 + v_player.ord * 17 + i * 11) % 51);
          insert into public.attempts (round_id, profile_id, attempt_number, status, started_at, finished_at, score)
          values (v_round, v_player.id, i, 'completed', v_start, v_start + interval '17 seconds', v_score);
        else
          -- reacción promedio en ms: entre 190 y 420
          v_score := 190 + ((v_day * 29 + v_player.ord * 37 + i * 23) % 231);
          insert into public.attempts (round_id, profile_id, attempt_number, status, started_at, finished_at, score)
          values (v_round, v_player.id, i, 'completed', v_start, v_start + interval '12 seconds', v_score);
        end if;
      end loop;
    end loop;
  end loop;

  -- un intento abandonado de Vale hace 3 días, para ver el estado en Studio
  insert into public.attempts (round_id, profile_id, attempt_number, status, started_at)
  select r.id, c_vale, 9, 'abandoned', (r.play_date::timestamp + time '23:10') at time zone c_tz
  from public.rounds r
  where r.group_id = c_group and r.play_date = v_today - 3
  on conflict do nothing;
end
$$;
