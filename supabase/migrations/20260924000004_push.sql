-- Etapa 6 · Web Push
--
--   push_subscriptions  una fila por navegador suscripto, propiedad del perfil
--   group_reminders     qué grupo ya recibió el recordatorio de qué día
--   groups.reminder_time hora local del grupo para el recordatorio (null = sin)
--   pg_cron + pg_net    (solo si están disponibles) llaman al endpoint cada
--                       15 minutos; el endpoint decide qué grupos están en hora

-- ---------------------------------------------------------------------------
-- hora del recordatorio por grupo (la edita el owner; RLS ya lo limita)
-- ---------------------------------------------------------------------------

alter table public.groups
  add column reminder_time time null default '20:00';

comment on column public.groups.reminder_time is 'Hora local del grupo del recordatorio diario. Null = sin recordatorio.';

grant update (reminder_time) on table public.groups to authenticated;

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  user_agent    text null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://'),
  constraint push_subscriptions_keys_len check (char_length(p256dh) between 60 and 200 and char_length(auth) between 16 and 64)
);

comment on table public.push_subscriptions is 'Suscripciones Web Push. Cada navegador guarda la suya; el servidor las usa para mandar y borra las vencidas (404/410).';

create index push_subscriptions_profile_id_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

create policy "push_subscriptions: leer las propias"
  on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "push_subscriptions: crear la propia"
  on public.push_subscriptions for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy "push_subscriptions: editar la propia"
  on public.push_subscriptions for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "push_subscriptions: borrar la propia"
  on public.push_subscriptions for delete to authenticated
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- group_reminders: idempotencia del recordatorio diario (solo servidor)
-- ---------------------------------------------------------------------------

create table public.group_reminders (
  group_id    uuid not null references public.groups (id) on delete cascade,
  play_date   date not null,
  sent_at     timestamptz not null default now(),
  sent_count  int not null default 0,
  primary key (group_id, play_date)
);

alter table public.group_reminders enable row level security;
revoke all on table public.group_reminders from anon, authenticated;
grant all on table public.group_reminders to service_role;

-- ---------------------------------------------------------------------------
-- cron: cada 15 minutos, pg_net llama al endpoint de recordatorios.
-- Solo si pg_cron y pg_net están disponibles (en Supabase sí; en un Postgres
-- común no, y la migración igual pasa). La URL y el secreto se configuran una
-- vez, sin tocar el código:
--   alter database postgres set app.settings.reminder_url = 'https://<app>/api/push/reminders';
--   alter database postgres set app.settings.cron_secret = '<CRON_SECRET>';
-- ---------------------------------------------------------------------------

create or replace function public.call_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := current_setting('app.settings.reminder_url', true);
  v_secret text := current_setting('app.settings.cron_secret', true);
begin
  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    raise notice 'call_reminders: faltan app.settings.reminder_url o app.settings.cron_secret';
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

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'playus-reminders';
    perform cron.schedule('playus-reminders', '*/15 * * * *', 'select public.call_reminders()');
  else
    raise notice 'pg_cron no disponible: el recordatorio diario necesita otro scheduler (ver README)';
  end if;
end
$$;
