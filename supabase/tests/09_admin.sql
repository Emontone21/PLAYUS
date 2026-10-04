-- Panel de admin: admin_actions no se lee ni se escribe desde un cliente (ni
-- siendo integrante), la función admin_set_today_game no la puede ejecutar
-- authenticated ni anon, y como service_role cambia la ronda, borra los
-- intentos y deja registro en una sola transacción (si algo falla, nada queda
-- a medias).
begin;
select plan(14);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{"display_name":"Uno"}', true, now(), now()),
  ('90000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{"display_name":"Dos"}', true, now(), now());

select pg_temp.login('90000000-0000-4000-8000-000000000001');
select (public.create_group('grupo admin')).id as g \gset
select pg_temp.logout();
select invite_code as code from public.groups where id = :'g' \gset
select pg_temp.login('90000000-0000-4000-8000-000000000002');
select public.join_group(:'code');
select pg_temp.logout();

insert into public.seasons (id, group_id, number, starts_on, ends_on)
values ('90000000-0000-4000-8000-0000000000b1', :'g', 1, current_date, current_date + 29);

insert into public.rounds (id, group_id, season_id, play_date, game_id, seed)
values ('90000000-0000-4000-8000-0000000000c1', :'g', '90000000-0000-4000-8000-0000000000b1', public.group_today(:'g'), 'la-mayo', 'semilla-vieja');

-- tres intentos en los tres estados, de dos personas
insert into public.attempts (round_id, profile_id, attempt_number, status, score, finished_at) values
  ('90000000-0000-4000-8000-0000000000c1', '90000000-0000-4000-8000-000000000001', 1, 'completed', 500, now()),
  ('90000000-0000-4000-8000-0000000000c1', '90000000-0000-4000-8000-000000000001', 2, 'in_progress', null, null),
  ('90000000-0000-4000-8000-0000000000c1', '90000000-0000-4000-8000-000000000002', 1, 'abandoned', null, null);

-- un integrante (authenticated) ------------------------------------------------

select pg_temp.login('90000000-0000-4000-8000-000000000001');

select throws_ok($$ select * from public.admin_actions $$, '42501', null, 'un integrante no lee admin_actions');
select throws_ok(
  $$ insert into public.admin_actions (admin_email, action, group_id, play_date, to_game_id) values ('x@y.z', 'set_game', '00000000-0000-4000-8000-000000000000', current_date, 'la-mayo') $$,
  '42501', null, 'un integrante no escribe admin_actions'
);
select throws_ok(
  format($$ select * from public.admin_set_today_game(%L, %L, current_date, 'la-mayo', 's', 'x@y.z', 'set_game') $$, :'g', '90000000-0000-4000-8000-0000000000b1'),
  '42501', null, 'un integrante no ejecuta admin_set_today_game'
);

select pg_temp.logout();

-- anon --------------------------------------------------------------------------

select set_config('role', 'anon', true);
select throws_ok($$ select * from public.admin_actions $$, '42501', null, 'anon no lee admin_actions');
select throws_ok(
  format($$ select * from public.admin_set_today_game(%L, %L, current_date, 'la-mayo', 's', 'x@y.z', 'set_game') $$, :'g', '90000000-0000-4000-8000-0000000000b1'),
  '42501', null, 'anon no ejecuta admin_set_today_game'
);
select set_config('role', 'none', true);

-- el servidor (service_role) ------------------------------------------------------

select set_config('role', 'service_role', true);

select results_eq(
  format($$ select o_from_game_id, o_deleted from public.admin_set_today_game(%L, %L, public.group_today(%L), 'servila-justa', 'semilla-nueva', 'admin@frog.test', 'set_game') $$, :'g', '90000000-0000-4000-8000-0000000000b1', :'g'),
  $$ values ('la-mayo'::text, 3) $$,
  'cambia la ronda de hoy: devuelve el juego anterior y los 3 intentos borrados'
);
select results_eq(
  $$ select game_id, seed from public.rounds where id = '90000000-0000-4000-8000-0000000000c1' $$,
  $$ values ('servila-justa'::text, 'semilla-nueva'::text) $$,
  'la ronda tiene el juego y la semilla nuevos'
);
select is_empty($$ select 1 from public.attempts where round_id = '90000000-0000-4000-8000-0000000000c1' $$, 'no queda ningún intento, en ningún estado');
select results_eq(
  $$ select action, from_game_id, to_game_id, deleted_attempts, admin_email from public.admin_actions order by created_at desc limit 1 $$,
  $$ values ('set_game'::text, 'la-mayo'::text, 'servila-justa'::text, 3, 'admin@frog.test'::text) $$,
  'queda registro con la cantidad borrada'
);

-- un día sin ronda: la crea ---------------------------------------------------------
select results_eq(
  format($$ select o_from_game_id, o_deleted from public.admin_set_today_game(%L, %L, public.group_today(%L) + 1, 'la-mayo', 'semilla-manana', 'admin@frog.test', 'reset_to_deck') $$, :'g', '90000000-0000-4000-8000-0000000000b1', :'g'),
  $$ values (null::text, 0) $$,
  'sin ronda: la crea, sin juego anterior ni intentos borrados'
);
select results_eq(
  format($$ select game_id from public.rounds where group_id = %L and play_date = public.group_today(%L) + 1 $$, :'g', :'g'),
  $$ values ('la-mayo'::text) $$,
  'la ronda nueva tiene el juego pedido'
);

-- si algo falla a mitad de camino, no queda nada a medias --------------------------
insert into public.attempts (round_id, profile_id, attempt_number, status)
values ('90000000-0000-4000-8000-0000000000c1', '90000000-0000-4000-8000-000000000002', 1, 'in_progress');
select throws_ok(
  format($$ select * from public.admin_set_today_game(%L, %L, public.group_today(%L), 'JUEGO INVÁLIDO', 's', 'admin@frog.test', 'set_game') $$, :'g', '90000000-0000-4000-8000-0000000000b1', :'g'),
  '23514', null, 'un juego con id inválido rompe la restricción de rounds'
);
select results_eq(
  $$ select count(*)::int from public.attempts where round_id = '90000000-0000-4000-8000-0000000000c1' $$,
  $$ values (1) $$,
  'el intento que había sigue ahí: el borrado se deshizo con la transacción'
);
select results_eq(
  $$ select count(*)::int from public.admin_actions where to_game_id = 'JUEGO INVÁLIDO' $$,
  $$ values (0) $$,
  'y no quedó registro del cambio fallido'
);

select set_config('role', 'none', true);

select * from finish();
rollback;
