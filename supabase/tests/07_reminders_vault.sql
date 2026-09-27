-- El recordatorio lee la URL y el secreto de Vault (migración 5), y nadie
-- desde el cliente puede dispararlo.
begin;
select plan(5);

select is_definer('public', 'call_reminders', array[]::text[], 'call_reminders sigue siendo security definer');
select is(has_function_privilege('anon', 'public.call_reminders()', 'execute'), false, 'anon no ejecuta call_reminders');
select is(has_function_privilege('authenticated', 'public.call_reminders()', 'execute'), false, 'authenticated no ejecuta call_reminders');
select ok(
  pg_get_functiondef('public.call_reminders()'::regprocedure) like '%vault.decrypted_secrets%',
  'call_reminders lee los secretos de Vault'
);
-- sin secretos configurados no llama a nada ni falla
select lives_ok($$ select public.call_reminders() $$, 'sin secretos, call_reminders no falla');

select * from finish();
rollback;
