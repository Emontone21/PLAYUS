-- Los puntajes de los demás en la ronda de hoy quedan ocultos hasta tener un
-- intento completed en esa ronda. Un intento in_progress o abandoned no
-- alcanza. Las rondas pasadas se ven completas dentro del grupo.
begin;
select plan(21);

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

-- u1 (owner), u2, u3, u4 en el mismo grupo -------------------------------------

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('40000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{"display_name":"u1"}', true, now(), now()),
  ('40000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{"display_name":"u2"}', true, now(), now()),
  ('40000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '{"display_name":"u3"}', true, now(), now()),
  ('40000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', '{"display_name":"u4"}', true, now(), now());

select pg_temp.login('40000000-0000-4000-8000-000000000001');
select (public.create_group('grupo hoy')).id as g \gset
select pg_temp.logout();
select invite_code as code from public.groups where id = :'g' \gset

select pg_temp.login('40000000-0000-4000-8000-000000000002');
select public.join_group(:'code');
select pg_temp.logout();
select pg_temp.login('40000000-0000-4000-8000-000000000003');
select public.join_group(:'code');
select pg_temp.logout();
select pg_temp.login('40000000-0000-4000-8000-000000000004');
select public.join_group(:'code');
select pg_temp.logout();

-- temporada, ronda de ayer (todos jugaron) y ronda de hoy (u2 y u3 jugaron) ---

insert into public.seasons (id, group_id, number, starts_on, ends_on)
values ('40000000-0000-4000-8000-0000000000b1', :'g', 1, current_date - 1, current_date + 28);

insert into public.rounds (id, group_id, season_id, play_date, game_id, seed) values
  ('40000000-0000-4000-8000-0000000000c0', :'g', '40000000-0000-4000-8000-0000000000b1', public.group_today(:'g') - 1, 'reflejo', 'ayer'),
  ('40000000-0000-4000-8000-0000000000c1', :'g', '40000000-0000-4000-8000-0000000000b1', public.group_today(:'g'),     'tap-race', 'hoy');

insert into public.attempts (round_id, profile_id, attempt_number, status, finished_at, score) values
  ('40000000-0000-4000-8000-0000000000c0', '40000000-0000-4000-8000-000000000001', 1, 'completed', now(), 300),
  ('40000000-0000-4000-8000-0000000000c0', '40000000-0000-4000-8000-000000000002', 1, 'completed', now(), 250),
  ('40000000-0000-4000-8000-0000000000c0', '40000000-0000-4000-8000-000000000003', 1, 'completed', now(), 280),
  ('40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-000000000002', 1, 'completed', now(), 80),
  ('40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-000000000003', 1, 'completed', now(), 90),
  ('40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-000000000003', 2, 'completed', now(), 95);

-- u1 todavía no jugó hoy -------------------------------------------------------

select pg_temp.login('40000000-0000-4000-8000-000000000001');

select is(public.can_view_round_scores('40000000-0000-4000-8000-0000000000c0'), true,  'ayer: se puede ver');
select is(public.can_view_round_scores('40000000-0000-4000-8000-0000000000c1'), false, 'hoy sin jugar: no se puede ver');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c0'), 3::bigint, 'ayer: ve los 3 puntajes');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1'), 0::bigint, 'hoy sin jugar: no ve ningún puntaje ajeno');

select results_eq(
  $$ select profile_id, completed_attempts from public.round_participants('40000000-0000-4000-8000-0000000000c1') order by completed_attempts $$,
  $$ values ('40000000-0000-4000-8000-000000000002'::uuid, 1), ('40000000-0000-4000-8000-000000000003'::uuid, 2) $$,
  'hoy sin jugar: round_participants dice quién jugó y cuántas veces, sin puntajes'
);

select pg_temp.logout();

-- u1 arranca un intento (in_progress): sigue sin ver ---------------------------

insert into public.attempts (id, round_id, profile_id, attempt_number, status)
values ('40000000-0000-4000-8000-0000000000d1', '40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-000000000001', 1, 'in_progress');

select pg_temp.login('40000000-0000-4000-8000-000000000001');
select is(public.can_view_round_scores('40000000-0000-4000-8000-0000000000c1'), false, 'con un intento in_progress: todavía no');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1'), 1::bigint, 've solo su propio intento en curso');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1' and profile_id <> '40000000-0000-4000-8000-000000000001'), 0::bigint, 'ningún intento ajeno');
select pg_temp.logout();

-- el intento se abandona: sigue sin ver -----------------------------------------

update public.attempts set status = 'abandoned' where id = '40000000-0000-4000-8000-0000000000d1';

select pg_temp.login('40000000-0000-4000-8000-000000000001');
select is(public.can_view_round_scores('40000000-0000-4000-8000-0000000000c1'), false, 'con un intento abandoned: todavía no');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1' and profile_id <> '40000000-0000-4000-8000-000000000001'), 0::bigint, 'abandonar no destapa nada');
select pg_temp.logout();

-- u1 completa un intento: ahora ve todo ------------------------------------------

insert into public.attempts (round_id, profile_id, attempt_number, status, finished_at, score)
values ('40000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-000000000001', 2, 'completed', now(), 70);

select pg_temp.login('40000000-0000-4000-8000-000000000001');
select is(public.can_view_round_scores('40000000-0000-4000-8000-0000000000c1'), true, 'con un intento completed: sí');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1'), 5::bigint, 've los 5 intentos de hoy (3 ajenos + 2 propios)');
select results_eq(
  $$ select profile_id, score from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1' and status = 'completed' order by score desc $$,
  $$ values ('40000000-0000-4000-8000-000000000003'::uuid, 95), ('40000000-0000-4000-8000-000000000003'::uuid, 90), ('40000000-0000-4000-8000-000000000002'::uuid, 80), ('40000000-0000-4000-8000-000000000001'::uuid, 70) $$,
  'los puntajes ajenos de hoy se leen completos'
);
select pg_temp.logout();

-- u2 ya había jugado: ve todo desde el principio -------------------------------

select pg_temp.login('40000000-0000-4000-8000-000000000002');
select is(public.can_view_round_scores('40000000-0000-4000-8000-0000000000c1'), true, 'u2 completó: ve');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1'), 5::bigint, 'u2 ve los 5 intentos de hoy');
select pg_temp.logout();

-- u4 nunca jugó: ayer sí, hoy no ---------------------------------------------------

select pg_temp.login('40000000-0000-4000-8000-000000000004');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c0'), 3::bigint, 'u4 ve la ronda de ayer completa');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1'), 0::bigint, 'u4 no ve nada de hoy');
select is((select count(*) from public.round_participants('40000000-0000-4000-8000-0000000000c1')), 3::bigint, 'u4 sí ve que 3 personas jugaron hoy');
select pg_temp.logout();

-- un intento completed en OTRA ronda no destapa la de hoy --------------------------

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('40000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', '{"display_name":"u5"}', true, now(), now());
select pg_temp.login('40000000-0000-4000-8000-000000000005');
select public.join_group(:'code');
select pg_temp.logout();

insert into public.attempts (round_id, profile_id, attempt_number, status, finished_at, score)
values ('40000000-0000-4000-8000-0000000000c0', '40000000-0000-4000-8000-000000000005', 1, 'completed', now(), 310);

select pg_temp.login('40000000-0000-4000-8000-000000000005');
select is(public.can_view_round_scores('40000000-0000-4000-8000-0000000000c1'), false, 'haber jugado ayer no destapa hoy');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c1'), 0::bigint, 'u5 no ve nada de hoy');
select pg_temp.logout();

-- la zona horaria del grupo define el "hoy" --------------------------------------
-- Con una zona 12 horas corrida, group_today puede diferir de current_date.
-- Lo que importa: una ronda con fecha futura según el grupo tampoco se ve.

insert into public.rounds (id, group_id, season_id, play_date, game_id, seed)
values ('40000000-0000-4000-8000-0000000000c2', :'g', '40000000-0000-4000-8000-0000000000b1', public.group_today(:'g') + 1, 'reflejo', 'mañana');
insert into public.attempts (round_id, profile_id, attempt_number, status, finished_at, score)
values ('40000000-0000-4000-8000-0000000000c2', '40000000-0000-4000-8000-000000000002', 1, 'completed', now(), 1);

select pg_temp.login('40000000-0000-4000-8000-000000000001');
select is((select count(*) from public.attempts where round_id = '40000000-0000-4000-8000-0000000000c2'), 0::bigint, 'una ronda futura tampoco se ve');
select pg_temp.logout();

select * from finish();
rollback;
