-- create_group y join_group: un no-miembro nunca lee groups directo, pero se
-- une con el código. Código inválido o inexistente: mismo error.
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

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('50000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{"display_name":"creadora"}', true, now(), now()),
  ('50000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{"display_name":"invitado"}', true, now(), now()),
  ('50000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '{"display_name":"dictado"}', true, now(), now()),
  ('50000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', '{"display_name":"curioso"}', true, now(), now());

-- create_group --------------------------------------------------------------------

select pg_temp.login('50000000-0000-4000-8000-000000000001');

select throws_ok($$ select public.create_group('   ') $$, '22023', 'invalid_group_name', 'nombre vacío se rechaza');
select throws_ok($$ select public.create_group(repeat('a', 41)) $$, '22023', 'invalid_group_name', 'nombre de 41 caracteres se rechaza');
select throws_ok($$ select public.create_group('ok', 'Marte/Central') $$, '22023', 'invalid_timezone', 'zona horaria inválida se rechaza');

select (public.create_group('  los del barrio  ', 'America/Argentina/Buenos_Aires')).id as g \gset

select is((select name from public.groups where id = :'g'), 'los del barrio', 'el nombre se guarda sin espacios de más');
select is((select timezone from public.groups where id = :'g'), 'America/Argentina/Buenos_Aires', 'la zona horaria elegida se guarda');
select is((select created_by from public.groups where id = :'g'), '50000000-0000-4000-8000-000000000001'::uuid, 'created_by es quien llamó');
select matches((select invite_code from public.groups where id = :'g'), '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$', 'el código generado respeta el alfabeto');
select is((select role from public.group_members where group_id = :'g' and profile_id = '50000000-0000-4000-8000-000000000001'), 'owner', 'quien crea queda como owner');
select is((select count(*) from public.group_members where group_id = :'g'), 1::bigint, 'el grupo nuevo tiene un solo integrante');

select pg_temp.logout();
select invite_code as code from public.groups where id = :'g' \gset

-- join_group con código válido ---------------------------------------------------

select pg_temp.login('50000000-0000-4000-8000-000000000002');

select is_empty(format('select 1 from public.groups where id = %L', :'g'), 'antes de unirse no lee el grupo');
select is((select (public.join_group(:'code')).id), :'g'::uuid, 'join_group devuelve el grupo');
select isnt_empty(format('select 1 from public.groups where id = %L', :'g'), 'después de unirse lee el grupo');
select is((select role from public.group_members where group_id = :'g' and profile_id = '50000000-0000-4000-8000-000000000002'), 'member', 'entra como member');
select lives_ok(format('select public.join_group(%L)', :'code'), 'unirse dos veces no falla');
select is((select count(*) from public.group_members where group_id = :'g' and profile_id = '50000000-0000-4000-8000-000000000002'), 1::bigint, 'unirse dos veces no duplica la fila');

select pg_temp.logout();

-- el código dictado por voz: minúsculas y espacios se toleran ---------------------

select pg_temp.login('50000000-0000-4000-8000-000000000003');
select is((select (public.join_group('  ' || lower(:'code') || ' ')).id), :'g'::uuid, 'acepta minúsculas y espacios alrededor');
select pg_temp.logout();

select is((select count(*) from public.group_members where group_id = :'g'), 3::bigint, 'el grupo quedó con 3 integrantes');

-- join_group con código inválido --------------------------------------------------

select pg_temp.login('50000000-0000-4000-8000-000000000004');

select throws_ok($$ select public.join_group('ZZZZZZ') $$, 'P0002', 'invalid_invite_code', 'código inexistente falla');
select throws_ok($$ select public.join_group('ABC') $$, 'P0002', 'invalid_invite_code', 'código corto falla');
select throws_ok($$ select public.join_group('ABC01O') $$, 'P0002', 'invalid_invite_code', 'código con caracteres fuera del alfabeto falla');
select throws_ok($$ select public.join_group(null) $$, 'P0002', 'invalid_invite_code', 'código null falla');
select throws_ok($$ select public.join_group('') $$, 'P0002', 'invalid_invite_code', 'código vacío falla');
select is_empty('select 1 from public.groups', 'después de fallar sigue sin ver ningún grupo');
select is((select count(*) from public.group_members where profile_id = '50000000-0000-4000-8000-000000000004'), 0::bigint, 'después de fallar no es miembro de nada');

select pg_temp.logout();

select * from finish();
rollback;
