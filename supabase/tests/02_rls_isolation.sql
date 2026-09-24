-- Un usuario del grupo A no lee grupo, integrantes, temporadas, rondas ni
-- puntajes del grupo B. Y dentro del grupo, solo el owner edita el grupo y
-- cada uno edita solo su apodo.
begin;
select plan(33);

-- helpers de sesión: simulan el JWT que PostgREST pone en request.jwt.claims
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

-- ejecuta una escritura como el rol actual y devuelve cuántas filas tocó
create function pg_temp.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- usuarios: a1 y a2 en el grupo A, b1 en el grupo B --------------------------

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('20000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', '{"display_name":"A uno"}', true, now(), now()),
  ('20000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', '{"display_name":"A dos"}', true, now(), now()),
  ('20000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', '{"display_name":"B uno"}', true, now(), now());

select pg_temp.login('20000000-0000-4000-8000-0000000000a1');
select (public.create_group('grupo A')).id as ga \gset
select pg_temp.logout();
select invite_code as code_a from public.groups where id = :'ga' \gset

select pg_temp.login('20000000-0000-4000-8000-0000000000b1');
select (public.create_group('grupo B')).id as gb \gset
select pg_temp.logout();

select pg_temp.login('20000000-0000-4000-8000-0000000000a2');
select (public.join_group(:'code_a')).id as ga_joined \gset
select pg_temp.logout();

select is(:'ga_joined'::uuid, :'ga'::uuid, 'a2 se unió al grupo A');

-- datos de juego en los dos grupos (como servidor), en una ronda de ayer -------

insert into public.seasons (id, group_id, number, starts_on, ends_on) values
  ('20000000-0000-4000-8000-0000000000b0', :'ga', 1, current_date - 1, current_date + 28),
  ('20000000-0000-4000-8000-0000000000b9', :'gb', 1, current_date - 1, current_date + 28);

insert into public.rounds (id, group_id, season_id, play_date, game_id, seed) values
  ('20000000-0000-4000-8000-0000000000c0', :'ga', '20000000-0000-4000-8000-0000000000b0', public.group_today(:'ga') - 1, 'tap-race', 'sa'),
  ('20000000-0000-4000-8000-0000000000c9', :'gb', '20000000-0000-4000-8000-0000000000b9', public.group_today(:'gb') - 1, 'tap-race', 'sb');

insert into public.attempts (round_id, profile_id, attempt_number, status, finished_at, score) values
  ('20000000-0000-4000-8000-0000000000c0', '20000000-0000-4000-8000-0000000000a1', 1, 'completed', now(), 50),
  ('20000000-0000-4000-8000-0000000000c0', '20000000-0000-4000-8000-0000000000a2', 1, 'completed', now(), 60),
  ('20000000-0000-4000-8000-0000000000c9', '20000000-0000-4000-8000-0000000000b1', 1, 'completed', now(), 70);

-- a1 mira: ve A, no ve B --------------------------------------------------------

select pg_temp.login('20000000-0000-4000-8000-0000000000a1');

select is(public.is_member(:'ga'), true,  'a1 es miembro de A');
select is(public.is_member(:'gb'), false, 'a1 no es miembro de B');

select isnt_empty(format('select 1 from public.groups where id = %L', :'ga'), 'a1 lee el grupo A');
select is_empty(format('select 1 from public.groups where id = %L', :'gb'), 'a1 no lee el grupo B');
select is((select count(*) from public.groups), 1::bigint, 'a1 ve exactamente un grupo');

select is((select count(*) from public.group_members where group_id = :'ga'), 2::bigint, 'a1 ve los 2 integrantes de A');
select is_empty(format('select 1 from public.group_members where group_id = %L', :'gb'), 'a1 no ve integrantes de B');

select isnt_empty(format('select 1 from public.seasons where group_id = %L', :'ga'), 'a1 lee la temporada de A');
select is_empty(format('select 1 from public.seasons where group_id = %L', :'gb'), 'a1 no lee la temporada de B');

select isnt_empty(format('select 1 from public.rounds where group_id = %L', :'ga'), 'a1 lee las rondas de A');
select is_empty(format('select 1 from public.rounds where group_id = %L', :'gb'), 'a1 no lee las rondas de B');

select is((select count(*) from public.attempts where round_id = '20000000-0000-4000-8000-0000000000c0'), 2::bigint, 'a1 lee los 2 puntajes de la ronda pasada de A');
select is_empty($$ select 1 from public.attempts where round_id = '20000000-0000-4000-8000-0000000000c9' $$, 'a1 no lee los puntajes de B');
select is_empty($$ select 1 from public.attempts where profile_id = '20000000-0000-4000-8000-0000000000b1' $$, 'a1 no lee ningún intento de b1');

select is_empty($$ select 1 from public.round_participants('20000000-0000-4000-8000-0000000000c9') $$, 'round_participants de una ronda de B devuelve vacío');
select is((select count(*) from public.round_participants('20000000-0000-4000-8000-0000000000c0')), 2::bigint, 'round_participants de A devuelve a los 2 que jugaron');

select isnt_empty($$ select 1 from public.profiles where id = '20000000-0000-4000-8000-0000000000a2' $$, 'a1 lee el perfil de a2 (comparten grupo)');
select is_empty($$ select 1 from public.profiles where id = '20000000-0000-4000-8000-0000000000b1' $$, 'a1 no lee el perfil de b1');

-- el owner edita el grupo; nadie edita el código -------------------------------

select is(
  pg_temp.affected(format($q$update public.groups set name = 'grupo A renombrado' where id = %L$q$, :'ga')),
  1::bigint, 'el owner renombra su grupo'
);
select throws_ok(
  format('update public.groups set invite_code = %L where id = %L', 'ZZZZZZ', :'ga'),
  '42501', null, 'ni el owner puede cambiar invite_code'
);
select is(
  pg_temp.affected(format($q$update public.groups set name = 'hackeado' where id = %L$q$, :'gb')),
  0::bigint, 'a1 no puede renombrar el grupo B'
);
select throws_ok(
  format('delete from public.group_members where group_id = %L', :'ga'),
  '42501', null, 'no se borran integrantes desde el cliente'
);

select pg_temp.logout();

-- a2 (member) edita solo su apodo -----------------------------------------------

select pg_temp.login('20000000-0000-4000-8000-0000000000a2');

select is(
  pg_temp.affected(format($q$update public.groups set name = 'lo cambió a2' where id = %L$q$, :'ga')),
  0::bigint, 'un member no renombra el grupo'
);
select is(
  pg_temp.affected(format($q$update public.group_members set nickname = 'a2 apodo' where group_id = %L and profile_id = '20000000-0000-4000-8000-0000000000a2'$q$, :'ga')),
  1::bigint, 'a2 cambia su propio apodo'
);
select is(
  pg_temp.affected(format($q$update public.group_members set nickname = 'pisado' where group_id = %L and profile_id = '20000000-0000-4000-8000-0000000000a1'$q$, :'ga')),
  0::bigint, 'a2 no cambia el apodo de a1'
);
select throws_ok(
  format('update public.group_members set role = %L where group_id = %L and profile_id = %L', 'owner', :'ga', '20000000-0000-4000-8000-0000000000a2'),
  '42501', null, 'a2 no se autoasciende a owner'
);

select pg_temp.logout();

-- b1 mira: ve B, no ve A --------------------------------------------------------

select pg_temp.login('20000000-0000-4000-8000-0000000000b1');

select is_empty(format('select 1 from public.groups where id = %L', :'ga'), 'b1 no lee el grupo A');
select is_empty(format('select 1 from public.rounds where group_id = %L', :'ga'), 'b1 no lee las rondas de A');
select is_empty($$ select 1 from public.attempts where round_id = '20000000-0000-4000-8000-0000000000c0' $$, 'b1 no lee los puntajes de A');
select is((select count(*) from public.attempts), 1::bigint, 'b1 ve solo su propio intento');
select is_empty($$ select 1 from public.profiles where id = '20000000-0000-4000-8000-0000000000a1' $$, 'b1 no lee el perfil de a1');
select is(
  pg_temp.affected(format($q$update public.groups set name = 'hackeado' where id = %L$q$, :'ga')),
  0::bigint, 'b1 no puede renombrar el grupo A'
);

select pg_temp.logout();

select * from finish();
rollback;
