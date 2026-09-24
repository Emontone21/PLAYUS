# Plan de implementación: app de minijuegos diarios en grupo

Este plan complementa el brief (`PROMPT-CLAUDE-CODE.md`). Leé los dos antes de empezar. Si algo de este plan contradice al brief, **este plan manda**: son ajustes hechos después de revisar el brief.

Trabajá **una etapa por vez**. Al terminar cada etapa, pará y entregá el reporte descripto al final de este documento. No avances a la siguiente etapa sin confirmación.

---

## Decisiones previas (van a `DECISIONS.md` desde el primer commit)

1. **Ventana de tiempo vs. terminar antes.** El brief rechaza partidas de menos de `durationMs - 2s`, pero `reflejo` termina antes por diseño.
   - Agregá `minDurationMs?: number` opcional a `GameModule`. Si falta, vale `durationMs - 2000`.
   - El límite superior se mantiene en `durationMs + 10s`.
   - `started_at` se fija cuando el usuario toca "jugar", antes de la cuenta regresiva de 3. El margen de +10s absorbe la cuenta y la carga.

2. **Cota inferior para juegos `low`.** `maxPlausibleScore` no frena un tiempo de reacción de 5 ms.
   - Agregá `minPlausibleScore?: number` opcional a `GameModule`. Para `reflejo`, 100.
   - `/finish` rechaza si el puntaje queda fuera de `[minPlausibleScore, maxPlausibleScore]`.

3. **Puntajes tapados en la base, no solo en la interfaz.** Una política RLS permite leer los puntajes de otros en la ronda de hoy solo si el usuario ya tiene un attempt `completed` en esa ronda. Las rondas pasadas son visibles para todo el grupo. Realtime respeta RLS, así que el ranking en vivo no filtra nada.

4. **Sin escritura de `attempts` desde el cliente.** No hay políticas de INSERT ni UPDATE para clientes en `attempts`. Solo escriben los endpoints `/start` y `/finish` desde el servidor. Es más estricto que el brief y lo sigue cumpliendo.

5. **Semilla del rebarajado.** Cada vuelta del mazo usa `hash(group_id + season.number + vuelta)`. Si la primera carta de una vuelta coincide con la última de la anterior, intercambiala con la segunda, para que el mismo juego no salga dos días seguidos.

6. **Registry cambiante.** El mazo se calcula con los ids del registry ordenados alfabéticamente. Un juego nuevo solo afecta los días futuros. Los días pasados no cambian porque `rounds.game_id` queda persistido.

7. **Único cron del proyecto: el recordatorio push.** Las rondas y las temporadas se crean de forma perezosa, sin cron.
   - El recordatorio diario a una hora elegida por grupo necesita un scheduler que corra cada 15 minutos.
   - Usá `pg_cron` + `pg_net` en Supabase, llamando a un endpoint protegido con un secreto.
   - Verificá antes si el cron de Vercel alcanza en el plan que se va a usar.

8. **Contrato de un solo archivo vs. route handlers.** `/finish` tiene que importar el módulo del juego para leer sus límites. Probalo apenas empiece la etapa 4. Si Next se queja por los hooks en el entorno del servidor, los juegos usan `import * as React from 'react'` y `React.useState`, en lugar de importar los hooks por nombre. El contrato de un solo archivo no se rompe.

9. **Menores.**
   - `reflejo` redondea el promedio a entero.
   - En Hoy, cuando la ronda de ayer ya cerró, se muestra arriba quién la ganó.
   - Iniciar un intento nuevo pasa a `abandoned` cualquier intento propio `in_progress` de esa ronda.
   - Una temporada dura 30 días: `ends_on = starts_on + 29`.
   - El cierre de temporada es perezoso: lo dispara la primera ronda con `play_date > ends_on`.

---

## Etapa 1: esquema, RLS y tests de políticas

- Migraciones en `supabase/migrations/` con todas las tablas del brief.
- Restricciones:
  - check con regex para `invite_code` (6 caracteres, sin O/0/I/1/l);
  - checks para `role` y `status`;
  - `unique(group_id, number)` en `seasons`;
  - índices para las consultas de ranking.
- `is_member(group_id)` como `security definer`, para evitar que las políticas sobre `group_members` se llamen a sí mismas en bucle.
- RPC `join_group(code)`: un no-miembro nunca lee `groups` directo, pero puede unirse con el código.
- Tests pgTAP (`supabase test db`) que prueban que:
  - un usuario del grupo A no lee las rondas, los integrantes ni los puntajes del grupo B;
  - nadie inserta ni modifica `attempts` desde el cliente;
  - los puntajes de hoy quedan ocultos hasta tener un attempt `completed`;
  - `join_group` funciona con código válido y falla con código inválido.
- Seed: un grupo de prueba con 4 integrantes falsos y puntajes.
- **Listo cuando:** `supabase test db` pasa completo y las tablas y el seed se ven en Studio.

## Etapa 2: auth anónima, grupos e invitaciones

- `@supabase/ssr` con middleware de sesión.
- Flujo de invitación:
  - `/g/[code]` inicia una sesión anónima automática (`signInAnonymously`);
  - una sola pantalla con nombre y un avatar provisorio;
  - `join_group` y adentro.
- Creación de grupo.
- Botón de invitar: Web Share API cuando está disponible, copiar al portapapeles como respaldo, y el código de 6 caracteres visible para dictar.
- **Listo cuando:** una ventana normal crea el grupo, una ventana de incógnito entra por el link en menos de 15 segundos, y ambas ven la lista de integrantes.

## Etapa 3: avatar y perfiles

- De 6 a 8 piezas SVG por categoría, como componentes en el repo.
- El `jsonb` del avatar se valida con zod.
- Editor: grilla de miniaturas con vista previa en vivo arriba.
- Editables: nombre visible, avatar y apodo por grupo.
- Vincular email con `supabase.auth.updateUser({ email })`, que convierte la cuenta anónima sin perder datos. Escondido en el perfil y sin bloquear nada.
- Las estadísticas del perfil quedan armadas pero vacías. Se llenan en la etapa 5.
- **Listo cuando:** el avatar se edita, se guarda y se ve igual en la lista de integrantes desde el otro navegador.

## Etapa 4: contrato de juegos, contenedor y juegos de relleno

- `src/games/types.ts` con el contrato del brief, más `validate?`, `minPlausibleScore?` y `minDurationMs?`.
- `src/lib/rng.ts`: una función de hash de string a número de 32 bits, más `mulberry32`.
- El contenedor como máquina de estados: instrucciones → cuenta regresiva de 3 → partida → envío → resultado.
  - El cronómetro arranca con `onReady`.
  - El corte por tiempo lo maneja el sistema.
- `tap-race` y `reflejo`, feos y marcados `// TEMPORAL`.
- `src/games/index.ts` con el registry.
- Ruta solo de desarrollo `/dev/juego/[id]?seed=…` para probar juegos sin servidor.
- `src/games/README.md` con `tap-race` como ejemplo comentado.
- Resolver acá la decisión 8.
- **Listo cuando:** la misma semilla produce las mismas esperas en `reflejo` en dos navegadores, y ambos juegos terminan y muestran el resultado.

## Etapa 5: rondas, intentos, puntos y temporadas

- `ensureRound(group)`:
  - crea la temporada si falta y cierra la anterior si corresponde (campeón);
  - calcula el mazo y la semilla;
  - hace `INSERT … ON CONFLICT DO NOTHING` y lee el resultado.
- `POST /api/rounds/:roundId/start` y `POST /api/attempts/:attemptId/finish` con todas las validaciones del brief y de las decisiones 1 y 2.
- Los intentos se marcan `abandoned` de forma perezosa después de 5 minutos, al leer o al iniciar.
- El aviso de que recargar cuesta el intento aparece antes de la primera partida.
- Puntos en `src/lib/scoring.ts` como función pura:
  - 10/7/5/3 y 1 punto para el resto de los que jugaron;
  - empate: mismo puntaje, y se saltea el lugar siguiente.
- Ranking del día en vivo con Realtime, tabla de la temporada, historial, corona del campeón y estadísticas del perfil.
- `DEV_FAKE_TODAY`, solo para desarrollo, para simular el día siguiente.
- Tests con vitest:
  - puntos con empates;
  - rotación del mazo sin repetidos, incluido el caso de la decisión 5;
  - consumo de intentos contra el Supabase local, incluido que recargar a mitad de partida cuesta el intento.
- **Listo cuando:** se cumple de punta a punta el criterio "listo cuando" del brief, usando `DEV_FAKE_TODAY` para el día siguiente.

## Etapa 6: PWA y notificaciones

- `manifest.json` completo:
  - `display: standalone` y `orientation: portrait`;
  - íconos de 192 y 512 más maskable;
  - theme color y screenshots.
- Serwist:
  - cachea el esqueleto de la app y los assets;
  - `/api/*` y el dominio de Supabase en `NetworkOnly`, para que ningún puntaje salga de caché;
  - pantalla de sin conexión.
- Instalación:
  - Android/Chrome: capturar `beforeinstallprompt` y mostrar un botón propio;
  - iOS/Safari: instrucciones ilustradas de Compartir → Agregar a inicio.
- Web Push:
  - migración nueva `push_subscriptions` con RLS;
  - VAPID con la librería `web-push`;
  - recordatorio diario según la decisión 7;
  - aviso de "te pasaron" disparado desde `/finish`, comparando el ranking antes y después;
  - el permiso se pide después de la primera partida.
- **Listo cuando:** en un deploy preview de Vercel (con HTTPS), la app se instala y recibe push en un Android y en un iPhone reales.

## Etapa 7: pasada de diseño

- Tokens de la paleta del brief.
- Bricolage Grotesque e Instrument Sans vía `next/font`, con cifras tabulares en todos los números.
- Ranking en filas con línea divisoria, tu fila con borde izquierdo grueso en `--agua`, y el puntaje enorme.
- Animación FLIP al revelar el puntaje, con `prefers-reduced-motion`.
- Textos de los estados vacíos y revisión de toda la copia: voseo y minúscula tipo oración.
- Chequear la lista de "evitá" del brief.
- **Listo cuando:** todas las pantallas pasan la revisión visual en un teléfono real.

---

## Reporte obligatorio al terminar cada ejecución

Cada vez que termines una etapa, o cortes a mitad de una, hacé dos cosas:

1. Guardá el reporte en `reports/etapa-N.md`. Si hay varias ejecuciones de la misma etapa, usá `reports/etapa-N-b.md`, `-c`, etc. No sobrescribas reportes anteriores.
2. Mostrá el mismo reporte completo como último mensaje, dentro de un solo bloque de código markdown, listo para copiar y pegar.

El reporte se va a pegar en otro chat que no ve el repo. Tiene que entenderse sin acceso al código: explicá, no resumas de más.

Usá exactamente esta estructura:

```markdown
# Reporte: etapa N (nombre de la etapa)
Estado: completa | parcial | bloqueada
Fecha:

## Qué hice
Descripción en prosa de lo implementado y cómo encaja con el resto.

## Archivos
- creados: ruta: para qué sirve
- modificados: ruta: qué cambió

## Decisiones nuevas
Cada decisión agregada a DECISIONS.md en esta ejecución, con el porqué.

## Desvíos del plan o del brief
Qué hice distinto de lo pedido y por qué. "ninguno" si no hubo.

## Tests
Comando para correrlos, cuántos pasan y cuántos fallan, y el detalle de cualquier falla.

## Cómo verificarlo en el navegador
Pasos concretos para comprobar el criterio "listo cuando" de la etapa.

## Problemas y deuda
Lo que quedó sin resolver, lo que funciona pero es frágil, y los TODO que dejé.

## Preguntas
Lo que necesito que se decida antes de seguir. "ninguna" si no hay.

## Siguiente paso propuesto
Qué haría en la próxima ejecución.
```
