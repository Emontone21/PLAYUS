-- Verificación contra Supabase real · la URL y el secreto del recordatorio, en Vault
--
-- La migración 4 leía la URL del endpoint y el CRON_SECRET de
-- app.settings.reminder_url y app.settings.cron_secret, a configurar con
-- `alter database postgres set ...`. En Supabase el rol postgres no es
-- superusuario y ese alter falla ("permission denied to set parameter"), así
-- que el job de pg_cron nunca tenía a dónde llamar (decisión 84).
--
-- Ahora se leen de Supabase Vault (cifrados en reposo), que es lo que Supabase
-- recomienda para pg_cron + pg_net. Se configuran una vez en el SQL Editor:
--   select vault.create_secret('https://<app>/api/push/reminders', 'playus_reminder_url');
--   select vault.create_secret('<CRON_SECRET>', 'playus_cron_secret');
-- y se cambian con vault.update_secret(id, nuevo_valor).
--
-- app.settings.* queda como respaldo para un Postgres propio donde sí se pueda
-- hacer el alter. Sin Vault (Postgres común) la función igual se crea.

create or replace function public.call_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    execute $q$
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'playus_reminder_url' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'playus_cron_secret' limit 1)
    $q$ into v_url, v_secret;
  exception
    when undefined_table or invalid_schema_name then
      null;
  end;

  v_url := coalesce(nullif(v_url, ''), current_setting('app.settings.reminder_url', true));
  v_secret := coalesce(nullif(v_secret, ''), current_setting('app.settings.cron_secret', true));

  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    raise notice 'call_reminders: faltan los secretos playus_reminder_url y playus_cron_secret en Vault';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.call_reminders() from public, anon, authenticated;
