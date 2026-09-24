-- Nadie inserta, modifica ni borra attempts, rounds ni seasons desde el
-- cliente, ni siquiera sobre sus propias filas. Groups y group_members
-- tampoco se insertan directo (solo por RPC). anon no lee nada.
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

create function pg_temp.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- un usuario, owner de un grupo, con una ronda de hoy y un intento propio ------

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{"display_name":"Uno"}', true, now(), now());

select pg_temp.login('30000000-0000-4000-8000-000000000001');
select (public.create_group('grupo escrituras')).id as g \gset
select pg_temp.logout();

insert into public.seasons (id, group_id, number, starts_on, ends_on)
values ('30000000-0000-4000-8000-0000000000b1', :'g', 1, current_date, current_date + 29);

insert into public.rounds (id, group_id, season_id, play_date, game_id, seed)
values ('30000000-0000-4000-8000-0000000000c1', :'g', '30000000-0000-4000-8000-0000000000b1', public.group_today(:'g'), 'tap-race', 's');

insert into public.attempts (id, round_id, profile_id, attempt_number, status)
values ('30000000-0000-4000-8000-0000000000d1', '30000000-0000-4000-8000-0000000000c1', '30000000-0000-4000-8000-000000000001', 1, 'in_progress');

-- authenticated: attempts ------------------------------------------------------

select pg_temp.login('30000000-0000-4000-8000-000000000001');

select isnt_empty($$ select 1 from public.attempts where id = '30000000-0000-4000-8000-0000000000d1' $$, 'control: el usuario lee su propio intento');

select throws_ok(
  $$ insert into public.attempts (round_id, profile_id, attempt_number) values ('30000000-0000-4000-8000-0000000000c1', '30000000-0000-4000-8000-000000000001', 2) $$,
  '42501', null, 'no inserta un intento propio'
);
select throws_ok(
  $$ update public.attempts set status = 'completed', score = 999, finished_at = now() where id = '30000000-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'no completa su propio intento con un puntaje inventado'
);
select throws_ok(
  $$ update public.attempts set status = 'abandoned' where id = '30000000-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'no cambia el estado de su intento'
);
select throws_ok(
  $$ delete from public.attempts where id = '30000000-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'no borra su intento (recargar cuesta el intento)'
);

-- authenticated: rounds y seasons ---------------------------------------------

select throws_ok(
  format($q$ insert into public.rounds (group_id, season_id, play_date, game_id, seed) values (%L, '30000000-0000-4000-8000-0000000000b1', current_date + 1, 'reflejo', 's') $q$, :'g'),
  '42501', null, 'no crea rondas'
);
select throws_ok(
  $$ update public.rounds set game_id = 'reflejo' where id = '30000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'no cambia el juego de la ronda'
);
select throws_ok(
  $$ update public.rounds set seed = 'otra' where id = '30000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'no cambia la semilla de la ronda'
);
select throws_ok(
  $$ delete from public.rounds where id = '30000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'no borra rondas'
);
select throws_ok(
  format($q$ insert into public.seasons (group_id, number, starts_on) values (%L, 2, current_date) $q$, :'g'),
  '42501', null, 'no crea temporadas'
);
select throws_ok(
  $$ update public.seasons set winner_profile_id = '30000000-0000-4000-8000-000000000001', closed_at = now() where id = '30000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'no se autoproclama campeón'
);

-- authenticated: groups y group_members solo por RPC ---------------------------

select throws_ok(
  $$ insert into public.groups (name, invite_code, created_by) values ('directo', 'ABCDEF', '30000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'no crea grupos con insert directo'
);
select throws_ok(
  format($q$ insert into public.group_members (group_id, profile_id, role) values (%L, '30000000-0000-4000-8000-000000000001', 'owner') $q$, :'g'),
  '42501', null, 'no se agrega a un grupo con insert directo'
);
select throws_ok(
  format($q$ delete from public.groups where id = %L $q$, :'g'),
  '42501', null, 'no borra grupos'
);
select throws_ok(
  format($q$ update public.groups set created_by = '30000000-0000-4000-8000-000000000001' where id = %L $q$, :'g'),
  '42501', null, 'no cambia el creador del grupo'
);

-- control positivo: lo que sí puede escribir -----------------------------------

select is(
  pg_temp.affected($q$update public.profiles set display_name = 'Uno editado', avatar = '{"base":1}' where id = '30000000-0000-4000-8000-000000000001'$q$),
  1::bigint, 'control: edita su propio perfil'
);
select is(
  pg_temp.affected($q$update public.profiles set display_name = 'pisado' where id <> '30000000-0000-4000-8000-000000000001'$q$),
  0::bigint, 'no edita perfiles ajenos'
);

select pg_temp.logout();

-- sesión authenticated sin claims (auth.uid() null): no ve nada ----------------

select set_config('role', 'authenticated', true);

select is((select count(*) from public.groups), 0::bigint, 'sin sub en el JWT no se ve ningún grupo');
select is((select count(*) from public.attempts), 0::bigint, 'sin sub en el JWT no se ve ningún intento');
select throws_ok($$ select public.join_group('ABCDEF') $$, '42501', 'not_authenticated', 'join_group sin sesión falla');
select throws_ok($$ select public.create_group('x') $$, '42501', 'not_authenticated', 'create_group sin sesión falla');

select pg_temp.logout();

-- anon: sin privilegios ----------------------------------------------------------

select set_config('role', 'anon', true);

select throws_ok($$ select 1 from public.groups $$, '42501', null, 'anon no lee groups');
select throws_ok($$ select 1 from public.attempts $$, '42501', null, 'anon no lee attempts');
select throws_ok($$ select public.join_group('ABCDEF') $$, '42501', null, 'anon no puede llamar join_group');

select pg_temp.logout();

select * from finish();
rollback;
