-- Estructura, restricciones, índices, privilegios y trigger de perfil.
begin;
select plan(52);

-- tablas y claves ------------------------------------------------------------

select has_table('public', 'profiles',      'existe profiles');
select has_table('public', 'groups',        'existe groups');
select has_table('public', 'group_members', 'existe group_members');
select has_table('public', 'seasons',       'existe seasons');
select has_table('public', 'rounds',        'existe rounds');
select has_table('public', 'attempts',      'existe attempts');

select col_is_pk('public', 'profiles', 'id', 'profiles.id es pk');
select col_is_pk('public', 'group_members', array['group_id', 'profile_id'], 'group_members pk compuesta');
select col_is_unique('public', 'groups', 'invite_code', 'groups.invite_code es único');
select col_is_unique('public', 'seasons', array['group_id', 'number'], 'unique(group_id, number) en seasons');
select col_is_unique('public', 'rounds', array['group_id', 'play_date'], 'unique(group_id, play_date) en rounds');
select col_is_unique('public', 'attempts', array['round_id', 'profile_id', 'attempt_number'], 'unique(round_id, profile_id, attempt_number) en attempts');

-- RLS activo en todas ----------------------------------------------------------

select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),      true, 'RLS en profiles');
select is((select relrowsecurity from pg_class where oid = 'public.groups'::regclass),        true, 'RLS en groups');
select is((select relrowsecurity from pg_class where oid = 'public.group_members'::regclass), true, 'RLS en group_members');
select is((select relrowsecurity from pg_class where oid = 'public.seasons'::regclass),       true, 'RLS en seasons');
select is((select relrowsecurity from pg_class where oid = 'public.rounds'::regclass),        true, 'RLS en rounds');
select is((select relrowsecurity from pg_class where oid = 'public.attempts'::regclass),      true, 'RLS en attempts');

-- índices para ranking e historial --------------------------------------------

select has_index('public', 'attempts', 'attempts_round_completed_idx', 'índice de ranking por ronda');
select has_index('public', 'attempts', 'attempts_profile_round_idx', 'índice de intentos por perfil');
select has_index('public', 'attempts', 'attempts_in_progress_idx', 'índice de intentos in_progress');
select has_index('public', 'rounds', 'rounds_season_id_play_date_idx', 'índice de rondas por temporada');
select has_index('public', 'group_members', 'group_members_profile_id_idx', 'índice de grupos por perfil');

-- helpers son security definer -----------------------------------------------

select is_definer('public', 'is_member', array['uuid'], 'is_member es security definer');
select is_definer('public', 'is_owner', array['uuid'], 'is_owner es security definer');
select is_definer('public', 'can_view_round_scores', array['uuid'], 'can_view_round_scores es security definer');
select is_definer('public', 'join_group', array['text'], 'join_group es security definer');
select is_definer('public', 'create_group', array['text', 'text'], 'create_group es security definer');

-- privilegios: anon nada, authenticated solo lo mínimo -------------------------

select table_privs_are('public', 'attempts', 'anon', '{}'::text[], 'anon no tiene privilegios sobre attempts');
select table_privs_are('public', 'groups', 'anon', '{}'::text[], 'anon no tiene privilegios sobre groups');
select table_privs_are('public', 'attempts', 'authenticated', array['SELECT'], 'authenticated solo lee attempts');
select table_privs_are('public', 'rounds', 'authenticated', array['SELECT'], 'authenticated solo lee rounds');
select table_privs_are('public', 'seasons', 'authenticated', array['SELECT'], 'authenticated solo lee seasons');
select column_privs_are('public', 'groups', 'invite_code', 'authenticated', array['SELECT'], 'invite_code no se edita desde el cliente');
select column_privs_are('public', 'groups', 'name', 'authenticated', array['SELECT', 'UPDATE'], 'name sí se edita (RLS decide quién)');
select column_privs_are('public', 'group_members', 'role', 'authenticated', array['SELECT'], 'role no se edita desde el cliente');
select column_privs_are('public', 'group_members', 'nickname', 'authenticated', array['SELECT', 'UPDATE'], 'nickname sí se edita');
select function_privs_are('public', 'join_group', array['text'], 'anon', '{}'::text[], 'anon no puede llamar join_group');
select function_privs_are('public', 'join_group', array['text'], 'authenticated', array['EXECUTE'], 'authenticated puede llamar join_group');

-- trigger: crear usuario crea perfil -------------------------------------------

insert into auth.users (id, aud, role, raw_user_meta_data, is_anonymous, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{"display_name":"Prueba"}', true, now(), now());

select is(
  (select display_name from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'Prueba',
  'el trigger crea el perfil con el nombre de los metadatos'
);

-- código de invitación --------------------------------------------------------

select ok(
  (select bool_and(public.generate_invite_code() ~ ('^[' || public.invite_code_alphabet() || ']{6}$')) from generate_series(1, 200)),
  'generate_invite_code respeta el alfabeto en 200 muestras'
);

select throws_ok(
  $$ insert into public.groups (name, invite_code, created_by) values ('x', 'ABC01O', '10000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'invite_code con 0 y O se rechaza'
);
select throws_ok(
  $$ insert into public.groups (name, invite_code, created_by) values ('x', 'abcdef', '10000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'invite_code en minúscula se rechaza'
);
select throws_ok(
  $$ insert into public.groups (name, invite_code, created_by) values ('x', 'ABCDE', '10000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'invite_code de 5 caracteres se rechaza'
);
select throws_ok(
  $$ insert into public.groups (name, invite_code, created_by, timezone) values ('x', 'ABCDEF', '10000000-0000-4000-8000-000000000001', 'Marte/Central') $$,
  '23514', null, 'zona horaria inexistente se rechaza'
);
select lives_ok(
  $$ insert into public.groups (id, name, invite_code, created_by) values ('10000000-0000-4000-8000-0000000000a1', 'grupo válido', 'ABCDEF', '10000000-0000-4000-8000-000000000001') $$,
  'invite_code válido se acepta'
);

-- checks de role y status -----------------------------------------------------

select throws_ok(
  $$ insert into public.group_members (group_id, profile_id, role) values ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'admin') $$,
  '23514', null, 'role fuera de owner/member se rechaza'
);

insert into public.seasons (id, group_id, number, starts_on, ends_on)
values ('10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000a1', 1, current_date, current_date + 29);

select throws_ok(
  $$ insert into public.seasons (group_id, number, starts_on) values ('10000000-0000-4000-8000-0000000000a1', 1, current_date) $$,
  '23505', null, 'dos temporadas con el mismo número en el grupo se rechaza'
);

insert into public.rounds (id, group_id, season_id, play_date, game_id, seed)
values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000b1', current_date, 'tap-race', 'semilla');

select throws_ok(
  $$ insert into public.attempts (round_id, profile_id, attempt_number, status) values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000001', 1, 'done') $$,
  '23514', null, 'status fuera de in_progress/completed/abandoned se rechaza'
);
select throws_ok(
  $$ insert into public.attempts (round_id, profile_id, attempt_number, status) values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000001', 1, 'completed') $$,
  '23514', null, 'completed sin puntaje se rechaza'
);
select throws_ok(
  $$ insert into public.attempts (round_id, profile_id, attempt_number, status, score) values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000001', 1, 'in_progress', 10) $$,
  '23514', null, 'in_progress con puntaje se rechaza'
);
select lives_ok(
  $$ insert into public.attempts (round_id, profile_id, attempt_number, status, finished_at, score) values ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000001', 1, 'completed', now(), 10) $$,
  'completed con puntaje y fin se acepta'
);

select * from finish();
rollback;
