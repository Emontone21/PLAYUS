# Decisiones

Cada decisión tomada por cuenta propia, con el porqué. Las primeras nueve vienen del plan (`PLAN.md`) y se fijaron antes de escribir código; las siguientes se agregaron durante las etapas.

## Del plan

1. **Ventana de tiempo vs. terminar antes.** `GameModule` tiene `minDurationMs?` opcional; si falta, vale `durationMs - 2000`. El límite superior es `durationMs + 10s`. `started_at` se fija al tocar "jugar", antes de la cuenta regresiva.

2. **Cota inferior para juegos `low`.** `GameModule` tiene `minPlausibleScore?` opcional (para `reflejo`, 100). `/finish` rechaza si el puntaje queda fuera de `[minPlausibleScore, maxPlausibleScore]`.

3. **Puntajes tapados en la base, no solo en la interfaz.** Una política RLS permite leer los puntajes de otros en la ronda de hoy solo si el usuario ya tiene un attempt `completed` en esa ronda. Las rondas pasadas son visibles para todo el grupo. Realtime respeta RLS.

4. **Sin escritura de `attempts` desde el cliente.** No hay políticas de INSERT ni UPDATE para clientes en `attempts`. Solo escriben `/start` y `/finish` desde el servidor.

5. **Semilla del rebarajado.** Cada vuelta del mazo usa `hash(group_id + season.number + vuelta)`. Si la primera carta de una vuelta coincide con la última de la anterior, se intercambia con la segunda.

6. **Registry cambiante.** El mazo se calcula con los ids del registry ordenados alfabéticamente. Un juego nuevo solo afecta los días futuros; `rounds.game_id` queda persistido.

7. **Único cron del proyecto: el recordatorio push.** Rondas y temporadas se crean de forma perezosa. El recordatorio usa `pg_cron` + `pg_net` cada 15 minutos contra un endpoint protegido con secreto (a confirmar en la etapa 6 si el cron de Vercel alcanza).

8. **Contrato de un solo archivo vs. route handlers.** Si Next se queja por los hooks al importar el módulo del juego desde `/finish`, los juegos usan `import * as React from 'react'`. Se resuelve en la etapa 4.

9. **Menores.** `reflejo` redondea el promedio a entero. En Hoy, con la ronda de ayer cerrada, se muestra arriba quién ganó. Iniciar un intento pasa a `abandoned` cualquier intento propio `in_progress` de esa ronda. Una temporada dura 30 días: `ends_on = starts_on + 29`. El cierre de temporada es perezoso.

## Etapa 1

10. **Grupos y membresías se escriben solo por RPC.** `groups` y `group_members` no tienen políticas de INSERT ni DELETE para el cliente. `create_group(p_name, p_timezone)` crea el grupo y al owner en una sola transacción; `join_group(p_code)` agrega al member. Motivo: crear un grupo son dos escrituras que tienen que ir juntas, y un no-miembro no puede leer `groups` para encontrar el código. Ambas son `security definer` y devuelven la fila del grupo, que el usuario ya puede leer porque acaba de quedar adentro.

11. **Edición por columnas con `grant update (columna)`.** Además de RLS, el rol `authenticated` solo tiene UPDATE sobre `groups(name, timezone, max_attempts)` y `group_members(nickname)`. Así `invite_code`, `created_by` y `role` no se pueden tocar aunque una política futura se relaje por error. La política decide quién (owner para el grupo, cada uno para su apodo); el grant decide qué.

12. **`rounds` y `seasons` son solo lectura desde el cliente.** Extiende la decisión 4: las crea y cierra el servidor con `service_role`. Los privilegios de INSERT/UPDATE/DELETE se revocaron para `authenticated`, además de no existir políticas.

13. **`anon` no lee nada.** Se revocaron todos los privilegios de `anon` sobre las seis tablas y las RPC. La app siempre abre una sesión anónima de Supabase (que llega como `authenticated`), así que el rol `anon` solo representa peticiones sin sesión, y esas no tienen nada que ver.

14. **`seasons.closed_at`.** Columna extra respecto del brief. `winner_profile_id` puede quedar null si nadie jugó, así que hacía falta una marca de cierre idempotente para el cierre perezoso. Check: hay ganador solo si hay cierre.

15. **`round_participants(round_id)`.** RPC `security definer` que devuelve `(profile_id, completed_attempts)` de una ronda, solo para miembros del grupo. Por construcción no expone puntajes. Sirve para que la pantalla Hoy muestre "ya jugaron Nico y Flor" con los puntajes tapados, cosa que la política de `attempts` (que oculta filas enteras) no permite.

16. **El perfil se crea por trigger en `auth.users`.** `handle_new_user` inserta la fila en `profiles` con `display_name` vacío (o el de `raw_user_meta_data.display_name`). El cliente después la completa con nombre y avatar; también tiene política de INSERT propia para que un `upsert` funcione.

17. **Alfabeto del código de invitación: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.** Mayúsculas sin I ni O, dígitos sin 0 ni 1, 32 símbolos. `join_group` normaliza con `upper(btrim(...))`, así el código dictado por voz o escrito en minúscula funciona. Un código con formato inválido y uno inexistente dan el mismo error (`invalid_invite_code`, SQLSTATE `P0002`), para no dar pistas.

18. **Zona horaria validada en la base.** `groups.timezone` tiene un check con `is_valid_timezone(text)`, que intenta `at time zone` y captura el error. Un nombre inválido rompería el cálculo del "hoy" del grupo en las políticas.

19. **`attempts` en la publicación `supabase_realtime` con `replica identity full`.** Necesario para que el ranking del día escuche cambios con RLS aplicado también en UPDATE.

20. **Helpers de RLS `security definer` con `search_path = ''`.** `is_member`, `is_owner`, `shares_group_with`, `group_today` y `can_view_round_scores` leen las tablas sin pasar por sus políticas (evita el bucle de `group_members` sobre sí misma). Todas responden preguntas sobre el propio usuario, nunca sobre terceros, así que no filtran información aunque el cliente las llame directo.

21. **Verificación sin Docker.** Este entorno no tiene daemon de Docker, así que `supabase test db` no se puede correr. `scripts/db-test-local.sh` reproduce lo mínimo del entorno de Supabase (roles, `auth.uid()`, `auth.users`, privilegios por defecto, `extensions`) con `scripts/supabase-shim.sql` sobre un Postgres 16 común y corre los mismos tests con `pg_prove`. En una máquina con Docker, `supabase db reset && supabase test db` es el camino oficial y los archivos son los mismos.

22. **Las rondas del seed no siguen el mazo.** El seed alterna `tap-race` y `reflejo` a mano. El algoritmo del mazo llega en la etapa 5 y no tendría sentido duplicarlo en SQL.
