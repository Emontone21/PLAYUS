-- invite_preview: un no-miembro ve cuántos son y hasta 5 {name, avatar}, nada
-- más; un código inválido devuelve lo mismo que un grupo vacío.
begin;
select plan(16);

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

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at)
select ('80000000-0000-4000-8000-00000000000' || i)::uuid, 'authenticated', 'authenticated',
       json_build_object('display_name', 'persona ' || i)::jsonb, true, now(), now()
  from generate_series(1, 9) as i;

-- la 1 crea, la 2 entra y se pone apodo; la 9 es una curiosa que no entra ----

select pg_temp.login('80000000-0000-4000-8000-000000000001');
select (public.create_group('los del estanque')).id as g \gset
select pg_temp.logout();
select invite_code as code from public.groups where id = :'g' \gset

select pg_temp.login('80000000-0000-4000-8000-000000000002');
select public.join_group(:'code');
update public.group_members set nickname = '  la Vale  ' where group_id = :'g';
select pg_temp.logout();

-- privilegios -------------------------------------------------------------------

select is(has_function_privilege('anon', 'public.invite_preview(text)', 'execute'), false, 'anon no ejecuta invite_preview');
select is(has_function_privilege('authenticated', 'public.invite_preview(text)', 'execute'), true, 'authenticated sí ejecuta invite_preview');
select is_definer('public', 'invite_preview', array['text'], 'invite_preview es security definer');

-- como no-miembro ---------------------------------------------------------------

select pg_temp.login('80000000-0000-4000-8000-000000000009');

select is((select count(*) from public.groups where id = :'g'), 0::bigint, 'la curiosa no lee el grupo directo');
select is((public.invite_preview(:'code')) ->> 'total', '2', 'total: 2 integrantes');
select is(jsonb_array_length((public.invite_preview(:'code')) -> 'members'), 2, 'members trae a los 2');
select is((public.invite_preview(:'code')) -> 'members' -> 0 ->> 'name', 'persona 1', 'la primera es quien creó, con su display_name');
select is((public.invite_preview(:'code')) -> 'members' -> 1 ->> 'name', 'la Vale', 'la segunda usa su apodo en el grupo, sin espacios de más');
select is(
  (select array_agg(k order by k) from jsonb_object_keys((public.invite_preview(:'code'))) k),
  array['members', 'total'],
  'la respuesta solo tiene total y members'
);
select is(
  (select array_agg(distinct k order by k) from jsonb_array_elements((public.invite_preview(:'code')) -> 'members') m, jsonb_object_keys(m) k),
  array['avatar', 'name'],
  'cada integrante solo expone name y avatar: sin ids ni fechas'
);
select is(jsonb_typeof((public.invite_preview(:'code')) -> 'members' -> 0 -> 'avatar'), 'object', 'el avatar viene como objeto');
select is((public.invite_preview('  ' || lower(:'code') || ' ')) ->> 'total', '2', 'el código se normaliza (minúsculas y espacios)');

-- código inválido o inexistente: igual que un grupo vacío --------------------

select is(public.invite_preview('ZZZZZZ'), '{"total": 0, "members": []}'::jsonb, 'código inexistente: total 0 y members vacío');
select is(public.invite_preview('nope'), '{"total": 0, "members": []}'::jsonb, 'código con formato inválido: lo mismo');
select is(public.invite_preview(null), '{"total": 0, "members": []}'::jsonb, 'null: lo mismo');

select pg_temp.logout();

-- con más de cinco integrantes, members se corta en 5 y total dice la verdad ----

select pg_temp.login('80000000-0000-4000-8000-000000000003'); select public.join_group(:'code'); select pg_temp.logout();
select pg_temp.login('80000000-0000-4000-8000-000000000004'); select public.join_group(:'code'); select pg_temp.logout();
select pg_temp.login('80000000-0000-4000-8000-000000000005'); select public.join_group(:'code'); select pg_temp.logout();
select pg_temp.login('80000000-0000-4000-8000-000000000006'); select public.join_group(:'code'); select pg_temp.logout();
select pg_temp.login('80000000-0000-4000-8000-000000000007'); select public.join_group(:'code'); select pg_temp.logout();

select pg_temp.login('80000000-0000-4000-8000-000000000009');
select is(
  ((public.invite_preview(:'code')) ->> 'total', jsonb_array_length((public.invite_preview(:'code')) -> 'members')),
  ('7'::text, 5::int),
  'con 7 integrantes: total 7, members 5'
);
select pg_temp.logout();

select * from finish();
rollback;
