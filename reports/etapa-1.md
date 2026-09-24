# Reporte: etapa 1 (esquema, RLS y tests de políticas)
Estado: completa
Fecha: 2026-09-24

## Qué hice

Armé la capa de base de datos completa del proyecto sobre Supabase: las seis tablas del brief (`profiles`, `groups`, `group_members`, `seasons`, `rounds`, `attempts`) con sus restricciones, los índices para las consultas de ranking e historial, un trigger que crea el perfil apenas se crea el usuario en `auth.users` (sirve para las sesiones anónimas de la etapa 2), las políticas de Row Level Security, tres funciones RPC para el cliente y un seed con un grupo de prueba. Todo va en tres migraciones versionadas en `supabase/migrations/`, en orden: esquema, RLS, RPC.

Las reglas de acceso quedaron así. Un usuario sin sesión (rol `anon`) no puede leer ni escribir nada. Un usuario con sesión (la sesión anónima de Supabase llega como rol `authenticated`) lee solo las filas de los grupos a los que pertenece: grupos, integrantes, temporadas, rondas e intentos. Los intentos tienen una regla extra: los de la ronda de hoy solo se ven los propios hasta que el usuario tiene un intento `completed` en esa ronda; recién ahí ve los de los demás. Las rondas pasadas se ven completas dentro del grupo. Un intento `in_progress` o `abandoned` no destapa nada, y haber jugado ayer tampoco destapa hoy. "Hoy" se calcula en la zona horaria del grupo, no en UTC.

Del lado de las escrituras: `attempts`, `rounds` y `seasons` no tienen ninguna política de escritura para el cliente y además se les revocaron los privilegios de INSERT, UPDATE y DELETE al rol `authenticated`. Solo el servidor, con la clave `service_role` (que saltea RLS), va a escribirlas en los endpoints `/start` y `/finish` de la etapa 5. Los grupos y las membresías tampoco se insertan directo: se crean con las RPC `create_group(nombre, zona_horaria)` (crea el grupo y al owner en una transacción, generando el código de 6 caracteres) y `join_group(código)` (agrega al usuario como member; tolera minúsculas y espacios, y da el mismo error para código inválido e inexistente). Las únicas columnas editables desde el cliente son `name`, `timezone` y `max_attempts` del grupo (solo el owner, por RLS) y `nickname` de la propia membresía; esto está fijado con permisos por columna, además de las políticas, para que el código de invitación, el creador y el rol no se puedan tocar ni por error.

Para que las políticas no se llamen a sí mismas en bucle (la política de `group_members` necesita consultar `group_members`), hay cinco funciones `security definer` con `search_path` vacío: `is_member`, `is_owner`, `shares_group_with`, `group_today` y `can_view_round_scores`. Todas responden preguntas sobre el propio usuario, nunca sobre terceros, así que no filtran información aunque el cliente las invoque directo.

Como la política de intentos oculta filas enteras, la pantalla Hoy no podría mostrar "ya jugaron Nico y Flor" con los puntajes tapados. Para eso agregué la RPC `round_participants(round_id)`, que devuelve solo `(profile_id, cantidad_de_intentos_completados)` de una ronda, únicamente a miembros del grupo, y por construcción no tiene columna de puntaje.

La tabla `attempts` quedó agregada a la publicación de Realtime con `replica identity full`, para que en la etapa 5 el ranking del día escuche cambios respetando RLS.

Los tests son cinco archivos pgTAP con 154 aserciones en total. Los corrí contra un Postgres 16 local, porque este entorno no tiene daemon de Docker y `supabase test db` no arranca sin él. Para eso escribí un script que reproduce lo mínimo del entorno de Supabase (roles, `auth.uid()`, tabla `auth.users`, privilegios por defecto, esquema `extensions`) y corre los mismos archivos con `pg_prove`. En una máquina con Docker, el camino oficial es `npx supabase db reset && npx supabase test db` con los mismos archivos.

## Archivos

- creados: `supabase/config.toml`: configuración del stack local de Supabase, con inicio de sesión anónimo habilitado.
- creados: `supabase/migrations/20260924000001_schema.sql`: extensión pgcrypto, funciones puras (validación de zona horaria, alfabeto y generador del código de invitación), las seis tablas con checks e índices, trigger `on_auth_user_created` que crea el perfil, publicación realtime de `attempts`.
- creados: `supabase/migrations/20260924000002_rls.sql`: helpers `security definer`, revocación de privilegios a `anon` y `authenticated`, permisos por columna, activación de RLS y políticas de las seis tablas.
- creados: `supabase/migrations/20260924000003_rpc.sql`: `create_group`, `join_group`, `round_participants` y sus permisos.
- creados: `supabase/seed.sql`: grupo "los del barrio" (código `JUEGA7`, zona America/Montevideo) con Vale (owner), Nico, Flor y Tomi; temporada 1 que arrancó hace 6 días; 7 rondas alternando `tap-race` y `reflejo` con puntajes verosímiles; en la de hoy solo jugaron Nico y Flor; Tomi faltó un día; un intento abandonado de Vale.
- creados: `supabase/tests/01_schema.sql`: estructura, claves, RLS activo, índices, `security definer`, privilegios de tabla/columna/función, trigger de perfil, checks de código de invitación, zona horaria, role, status y unicidad de temporadas.
- creados: `supabase/tests/02_rls_isolation.sql`: un usuario del grupo A no lee grupo, integrantes, temporada, rondas, intentos ni perfiles del grupo B, y viceversa; el owner renombra su grupo, un member no; cada uno edita solo su apodo; nadie cambia el código ni se autoasciende.
- creados: `supabase/tests/03_no_client_writes.sql`: ningún INSERT, UPDATE ni DELETE sobre `attempts`, `rounds`, `seasons`, `groups` ni `group_members` desde el cliente, ni sobre filas propias; control positivo de edición del perfil propio; sesión sin `sub` no ve nada; `anon` no tiene privilegios.
- creados: `supabase/tests/04_today_scores_hidden.sql`: puntajes de hoy ocultos sin intento completado; `in_progress` y `abandoned` no destapan; después de completar se ven todos; las rondas pasadas se ven; una ronda futura no; jugar ayer no destapa hoy; `round_participants` muestra quién jugó sin puntajes.
- creados: `supabase/tests/05_join_group.sql`: `create_group` valida nombre y zona horaria, recorta espacios, genera código válido y deja al creador como owner; `join_group` con código válido, repetido, en minúscula y con espacios; con código inexistente, corto, con caracteres prohibidos, null y vacío falla y el usuario sigue sin ver nada.
- creados: `scripts/db-test-local.sh`: crea una base efímera, aplica shim, migraciones, seed y corre `pg_prove` sin Docker.
- creados: `scripts/supabase-shim.sql`: lo mínimo del entorno de Supabase para un Postgres común. No se aplica nunca a un proyecto real.
- creados: `DECISIONS.md`: las nueve decisiones del plan más trece de esta etapa.
- creados: `README.md`: cómo levantar el proyecto con Docker y cómo correr los tests sin Docker.
- creados: `.env.example`: variables de Supabase, `DEV_FAKE_TODAY` y las de Web Push (comentadas hasta la etapa 6).
- creados: `.gitignore`: node_modules, build de Next, archivos de entorno.
- creados: `reports/etapa-1.md`: este reporte.
- modificados: ninguno (repo nuevo).

## Decisiones nuevas

10. Grupos y membresías se escriben solo por RPC (`create_group`, `join_group`). Crear un grupo son dos escrituras que van juntas, y un no-miembro no puede leer `groups` para encontrar el código.
11. Edición por columnas con `grant update (columna)`: el cliente solo puede modificar `groups(name, timezone, max_attempts)` y `group_members(nickname)`. El código, el creador y el rol quedan blindados aunque una política se relaje por error.
12. `rounds` y `seasons` son solo lectura desde el cliente, igual que `attempts`. Los privilegios de escritura están revocados.
13. `anon` (sin sesión) no lee nada. La app siempre abre sesión anónima, que llega como `authenticated`.
14. `seasons.closed_at`, columna extra: el campeón puede quedar null si nadie jugó, y hacía falta una marca de cierre idempotente para el cierre perezoso.
15. `round_participants(round_id)`: para mostrar quién ya jugó hoy sin exponer puntajes, cosa que la política de `attempts` no permite.
16. El perfil se crea por trigger en `auth.users`, con `display_name` vacío hasta que el usuario completa la pantalla de nombre y avatar.
17. Alfabeto del código: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 símbolos). `join_group` normaliza mayúsculas y espacios; código inválido e inexistente dan el mismo error.
18. La zona horaria del grupo se valida en la base con un check, porque un nombre inválido rompería el cálculo del "hoy" en las políticas.
19. `attempts` en la publicación `supabase_realtime` con `replica identity full`.
20. Helpers de RLS `security definer` con `search_path = ''`, todos sobre el propio usuario.
21. Verificación sin Docker con `scripts/db-test-local.sh` y un shim del entorno de Supabase. Los tests son los mismos que corre `supabase test db`.
22. Las rondas del seed no siguen el algoritmo del mazo (llega en la etapa 5); alternan los dos juegos a mano.

## Desvíos del plan o del brief

- `seasons` tiene una columna `closed_at` que el brief no lista (decisión 14).
- `groups` y `group_members` no aceptan INSERT directo del cliente; el brief no lo prohibía, pero el plan pedía `join_group` como RPC y extendí el criterio a la creación (decisión 10).
- El criterio "listo cuando" pedía `supabase test db` completo y ver las tablas en Studio. Acá no hay Docker, así que corrí el equivalente con Postgres 16 + pgTAP + `pg_prove` (mismos archivos de test, 154 aserciones en verde) y verifiqué el seed con consultas SQL en lugar de Studio. `supabase test db` y Studio quedan pendientes de correrse en una máquina con Docker.

## Tests

Sin Docker (lo que corrí acá):

```
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres scripts/db-test-local.sh
```

Resultado: 5 archivos, 154 aserciones, 154 pasan, 0 fallan.

```
supabase/tests/01_schema.sql ............... ok   (52)
supabase/tests/02_rls_isolation.sql ........ ok   (33)
supabase/tests/03_no_client_writes.sql ..... ok   (24)
supabase/tests/04_today_scores_hidden.sql .. ok   (21)
supabase/tests/05_join_group.sql ........... ok   (24)
All tests successful.
Result: PASS
```

Con Docker (camino oficial, no corrido acá):

```
npx supabase start
npx supabase db reset
npx supabase test db
```

## Cómo verificarlo en el navegador

En esta etapa no hay pantallas de la app; la verificación es en Supabase Studio.

1. Con Docker andando: `npx supabase start`, después `npx supabase db reset`.
2. Abrir `http://127.0.0.1:54323` (Studio) → Table Editor. Tienen que aparecer las seis tablas del esquema `public`.
3. En `groups`: una fila "los del barrio" con `invite_code = JUEGA7`.
4. En `group_members`: cuatro filas (Vale owner, Nico, Flor y Tomi members; Nico y Tomi con apodo).
5. En `rounds`: siete filas, una por día desde hace 6 días hasta hoy, alternando `tap-race` y `reflejo`.
6. En `attempts`: unos 49 intentos; filtrar por la ronda de hoy muestra solo dos (Nico y Flor).
7. `npx supabase test db` tiene que terminar en `Result: PASS` con 154 tests.
8. Para probar las políticas a mano en el SQL Editor de Studio:

```sql
set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
-- Vale no jugó hoy: ve solo sus intentos de días anteriores y ninguno de hoy
select play_date, count(*) from attempts a join rounds r on r.id = a.round_id group by 1 order by 1;
reset role;
```

## Problemas y deuda

- `supabase test db` y Studio no se corrieron en este entorno por falta de Docker. El shim reproduce el entorno de Supabase con fidelidad razonable (mismas definiciones de `auth.uid()`, mismos roles y privilegios por defecto), pero la primera corrida real con el CLI puede destapar alguna diferencia menor, por ejemplo en los permisos sobre `auth.users` o en el nombre del esquema de pgTAP.
- `config.toml` fija Postgres 17 (default del CLI); los tests locales corrieron en Postgres 16. No usé nada específico de versión.
- El seed inserta usuarios anónimos directo en `auth.users` con las columnas mínimas. Es el patrón habitual, pero esos usuarios no pueden iniciar sesión (no hay forma de volver a una sesión anónima), así que sirven solo como datos.
- Los tests crean funciones temporales `pg_temp.login/logout/affected` repetidas en cada archivo. Podrían ir a un helper compartido, pero `pg_prove` corre cada archivo aislado y así cada uno se lee solo.
- El aviso `wal_level is insufficient to publish logical changes` del script local es del Postgres común (sin `wal_level = logical`); en Supabase no aparece.
- Sin `updated_at` en ninguna tabla. Si hace falta para caché o auditoría, es una migración chica.

## Preguntas

ninguna

## Siguiente paso propuesto

Etapa 2: scaffold de Next.js 15 con TypeScript estricto y Tailwind, `@supabase/ssr` con middleware de sesión, la ruta `/g/[code]` que abre sesión anónima y muestra la pantalla de nombre + avatar provisorio, `join_group` y `create_group` desde el cliente, y el botón de invitar con Web Share API y copia al portapapeles. Criterio: una ventana normal crea el grupo y una de incógnito entra por el link en menos de 15 segundos, y ambas ven la lista de integrantes.
