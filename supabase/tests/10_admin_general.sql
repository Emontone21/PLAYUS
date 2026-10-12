-- Administración general del panel (migración 8): game_settings y
-- admin_actions no se leen ni se escriben desde un cliente; las funciones
-- admin_* solo las ejecuta service_role; borrar un grupo se lleva todo lo suyo
-- y nada de otros grupos, nunca al admin; y si algo falla a mitad de camino,
-- no queda nada a medias.
begin;
select plan(24);

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

-- tres anónimos y la admin (con email confirmado)
insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{"display_name":"Uno"}', true, now(), now()),
  ('a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{"display_name":"Dos"}', true, now(), now()),
  ('a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '{"display_name":"Tres"}', true, now(), now());
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'admin@frog.test', now(), '{"display_name":"Admin"}', false, now(), now());

-- grupo A (Uno dueño, Dos y la admin integrantes) y grupo B (Dos dueño, Tres integrante)
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select (public.create_group('grupo a')).id as ga \gset
select pg_temp.logout();
select invite_code as code_a from public.groups where id = :'ga' \gset
select pg_temp.login('a0000000-0000-4000-8000-000000000002');
select public.join_group(:'code_a');
select (public.create_group('grupo b')).id as gb \gset
select pg_temp.logout();
select invite_code as code_b from public.groups where id = :'gb' \gset
select pg_temp.login('a0000000-0000-4000-8000-000000000003');
select public.join_group(:'code_b');
select pg_temp.logout();
insert into public.group_members (group_id, profile_id, role) values (:'ga', 'a0000000-0000-4000-8000-00000000000a', 'member');

insert into public.seasons (id, group_id, number, starts_on, ends_on) values
  ('a0000000-0000-4000-8000-0000000000b1', :'ga', 1, current_date, current_date + 29),
  ('a0000000-0000-4000-8000-0000000000b2', :'gb', 1, current_date, current_date + 29);
insert into public.rounds (id, group_id, season_id, play_date, game_id, seed) values
  ('a0000000-0000-4000-8000-0000000000c1', :'ga', 'a0000000-0000-4000-8000-0000000000b1', current_date, 'la-mayo', 's1'),
  ('a0000000-0000-4000-8000-0000000000c2', :'gb', 'a0000000-0000-4000-8000-0000000000b2', current_date, 'la-mayo', 's2');
insert into public.attempts (round_id, profile_id, attempt_number, status, score, finished_at) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-000000000001', 1, 'completed', 5, now()),
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-000000000002', 1, 'completed', 7, now()),
  ('a0000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-000000000003', 1, 'completed', 9, now());
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('a0000000-0000-4000-8000-000000000001', 'https://push.test/uno', repeat('p', 80), repeat('a', 20));

-- esquema ------------------------------------------------------------------------

select has_column('public', 'groups', 'is_test', 'groups.is_test existe');
select has_table('public', 'game_settings', 'existe game_settings');
select is((select relrowsecurity from pg_class where oid = 'public.game_settings'::regclass), true, 'RLS en game_settings');
select table_privs_are('public', 'game_settings', 'authenticated', '{}'::text[], 'authenticated no tiene privilegios sobre game_settings');
select table_privs_are('public', 'game_settings', 'anon', '{}'::text[], 'anon no tiene privilegios sobre game_settings');
select table_privs_are('public', 'admin_actions', 'authenticated', '{}'::text[], 'authenticated no tiene privilegios sobre admin_actions');
select column_privs_are('public', 'groups', 'is_test', 'authenticated', array['SELECT'], 'is_test no se edita desde el cliente');
select has_column('public', 'admin_actions', 'details', 'admin_actions.details existe');

-- un integrante (authenticated) ----------------------------------------------------

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.game_settings $$, '42501', null, 'un integrante no lee game_settings');
select throws_ok($$ insert into public.game_settings (game_id, enabled) values ('la-mayo', false) $$, '42501', null, 'un integrante no escribe game_settings');
select throws_ok($$ select * from public.admin_actions $$, '42501', null, 'un integrante no lee admin_actions');
select throws_ok(
  format($$ select public.admin_delete_group(%L, true, array['admin@frog.test'], 'x@y.z', true) $$, :'ga'),
  '42501', null, 'un integrante no ejecuta admin_delete_group'
);
select throws_ok($$ select public.admin_cleanup_test(array['admin@frog.test'], 'x@y.z', true) $$, '42501', null, 'un integrante no ejecuta admin_cleanup_test');
select throws_ok($$ select public.admin_toggle_game('la-mayo', false, array['la-mayo', 'servila-justa'], 'x@y.z') $$, '42501', null, 'un integrante no ejecuta admin_toggle_game');
select pg_temp.logout();

-- anon -------------------------------------------------------------------------------

select set_config('role', 'anon', true);
select throws_ok($$ select * from public.game_settings $$, '42501', null, 'anon no lee game_settings');
select throws_ok($$ select public.admin_users_overview() $$, '42501', null, 'anon no ejecuta admin_users_overview');
select set_config('role', 'none', true);

-- el servidor (service_role) --------------------------------------------------------------

select set_config('role', 'service_role', true);

-- la vista previa cuenta sin tocar nada
select is(
  (select (public.admin_delete_group(:'ga', true, array['admin@frog.test'], 'admin@frog.test', true)) - 'group' - 'orphans'),
  '{"members": 3, "seasons": 1, "rounds": 1, "attempts": 2, "delete_orphans": true, "deleted_users": 0}'::jsonb,
  'la vista previa de borrar el grupo a cuenta 3 integrantes, 1 temporada, 1 ronda y 2 intentos'
);
select is((select count(*)::int from public.groups where id = :'ga'), 1, 'con la vista previa el grupo sigue');

-- si falla a mitad de camino (el registro exige el email), no queda nada a medias
select throws_ok(
  format($$ select public.admin_delete_group(%L, true, array['admin@frog.test'], null, false) $$, :'ga'),
  '23502', null, 'sin email de admin, el registro falla'
);
select is((select count(*)::int from public.groups where id = :'ga'), 1, 'y el grupo sigue entero: el borrado se deshizo');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'), 1, 'y Uno sigue existiendo');

-- borrar de verdad: todo lo del grupo a, Uno (que queda sin grupo), nunca la admin, nada del grupo b
select is(
  (select ((public.admin_delete_group(:'ga', true, array['admin@frog.test'], 'admin@frog.test', false)) ->> 'deleted_users')::int),
  1,
  'borrar el grupo a borra a 1 usuario que quedó sin grupo'
);
-- (auth.users se mira como postgres: service_role no lo lee en esta sesión)
select set_config('role', 'none', true);
select results_eq(
  $$ select
       (select count(*)::int from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
       (select count(*)::int from auth.users where id = 'a0000000-0000-4000-8000-000000000001'),
       (select count(*)::int from public.push_subscriptions where profile_id = 'a0000000-0000-4000-8000-000000000001'),
       (select count(*)::int from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
       (select count(*)::int from public.profiles where id = 'a0000000-0000-4000-8000-000000000002'),
       (select count(*)::int from public.attempts where round_id = 'a0000000-0000-4000-8000-0000000000c2') $$,
  $$ values (0, 0, 0, 1, 1, 1) $$,
  'Uno se fue con su usuario y su suscripción; la admin y Dos siguen; el grupo b conserva su intento'
);
select results_eq(
  $$ select action, group_id, target, (details ->> 'attempts')::int, (details ->> 'deleted_users')::int from public.admin_actions order by created_at desc limit 1 $$,
  $$ values ('delete_group'::text, null::uuid, 'grupo a'::text, 2, 1) $$,
  'queda registro con el nombre del grupo y los conteos'
);

select * from finish();
rollback;
