-- Web Push: cada uno ve y maneja solo sus suscripciones; group_reminders es
-- solo del servidor; reminder_time lo edita el owner.
begin;
select plan(17);

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

select has_table('public', 'push_subscriptions', 'existe push_subscriptions');
select has_table('public', 'group_reminders', 'existe group_reminders');
select has_column('public', 'groups', 'reminder_time', 'groups.reminder_time existe');
select is((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass), true, 'RLS en push_subscriptions');
select is((select relrowsecurity from pg_class where oid = 'public.group_reminders'::regclass), true, 'RLS en group_reminders');
select table_privs_are('public', 'group_reminders', 'authenticated', '{}'::text[], 'authenticated no toca group_reminders');
select table_privs_are('public', 'push_subscriptions', 'anon', '{}'::text[], 'anon no toca push_subscriptions');

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at) values
  ('60000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{"display_name":"p1"}', true, now(), now()),
  ('60000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{"display_name":"p2"}', true, now(), now());

select pg_temp.login('60000000-0000-4000-8000-000000000001');
select (public.create_group('grupo push')).id as g \gset

select lives_ok(
  $$ insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
     values ('60000000-0000-4000-8000-000000000001', 'https://push.example/p1', repeat('a', 87), repeat('b', 22)) $$,
  'p1 guarda su suscripción'
);
select throws_ok(
  $$ insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
     values ('60000000-0000-4000-8000-000000000002', 'https://push.example/x', repeat('a', 87), repeat('b', 22)) $$,
  '42501', null, 'p1 no puede guardar una suscripción a nombre de p2'
);
select throws_ok(
  $$ insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
     values ('60000000-0000-4000-8000-000000000001', 'http://inseguro.example/p1', repeat('a', 87), repeat('b', 22)) $$,
  '23514', null, 'el endpoint tiene que ser https'
);
select is(pg_temp.affected(format($q$update public.groups set reminder_time = '21:30' where id = %L$q$, :'g')), 1::bigint, 'el owner cambia la hora del recordatorio');
select is((select reminder_time from public.groups where id = :'g'), '21:30'::time, 'la hora quedó guardada');
select pg_temp.logout();

select pg_temp.login('60000000-0000-4000-8000-000000000002');
select is((select count(*) from public.push_subscriptions), 0::bigint, 'p2 no ve la suscripción de p1');
select is(pg_temp.affected($q$delete from public.push_subscriptions where endpoint = 'https://push.example/p1'$q$), 0::bigint, 'p2 no borra la suscripción de p1');
select throws_ok($$ select 1 from public.group_reminders $$, '42501', null, 'nadie lee group_reminders desde el cliente');
select pg_temp.logout();

select pg_temp.login('60000000-0000-4000-8000-000000000001');
select is(pg_temp.affected($q$delete from public.push_subscriptions where endpoint = 'https://push.example/p1'$q$), 1::bigint, 'p1 borra su propia suscripción');
select pg_temp.logout();

select is_definer('public', 'call_reminders', array[]::text[], 'call_reminders es security definer');

select * from finish();
rollback;
