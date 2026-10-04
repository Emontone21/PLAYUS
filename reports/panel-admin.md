# Panel de administración

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-04. Cambio de rumbo respecto del brief ("no construir panel de administración"), pedido por el dueño: decisiones 236 a 238.

## Qué hay

- `/admin`: todos los grupos con integrantes, el día de hoy en su zona horaria, el juego de hoy (o "todavía no se creó"), los intentos de hoy y de cuántas personas, y un selector con todo el registro más "el que toca en el mazo". Sin intentos, una confirmación simple; con intentos, el aviso con todas las letras y un segundo toque en "borrar y cambiar" (en `--lengua`). Debajo, los últimos 20 cambios.
- La acción corre en el servidor con la clave de servicio, en una transacción (`admin_set_today_game`, migración 7): crea la ronda si falta, o borra todos los intentos (también `in_progress`), cambia el juego y recalcula la semilla con la fórmula de siempre; y deja registro en `admin_actions`. El mazo no se reacomoda.
- Los integrantes: Hoy escucha la fila de la ronda por Realtime (`rounds` entra en la publicación, con RLS de integrantes) y muestra "cambió el juego de hoy" con el juego nuevo y los 3 intentos, sin recargar. Quien estaba jugando recibe en `/finish` un 410 `attempt_deleted` y ve "el juego de hoy cambió mientras jugabas. tenés tus 3 intentos de nuevo." con el botón para volver.
- `/admin/jugar`: la lista del registro (nombre, id, orientación, rotación) con link a su herramienta; semilla al azar editable, intento simulado, y el juego en el contenedor real. Al terminar, `POST /api/admin/validate` corre lo mismo que `/finish` (duración, cotas, `validate`) sin escribir nada, y el panel muestra el puntaje, "validado" o el motivo, el recalculado si el juego lo sabe (`recomputeScore?`, nuevo y opcional en el contrato), la duración y el tamaño de la traza.
- `/dev/juego/*` en producción: solo para el admin; para cualquier otro, 404. `/dev/hoy` sigue siendo 404 para todos.
- Permisos: `ADMIN_EMAILS` + sesión con email vinculado y confirmado. Siempre en el servidor: páginas 404, endpoints 403. La clave de servicio no sale del servidor y ninguna política RLS se relaja; `admin_actions` no tiene políticas para clientes.

## Instrucciones para el dueño

1. En la app, Perfil → "¿cambiás de teléfono? vinculá un email", y abrir el link que llega.
2. Poner ese email en `ADMIN_EMAILS` en Vercel (Production y Preview): `npx vercel env add ADMIN_EMAILS production` y lo mismo con `preview`. Varios emails van separados por coma.
3. Volver a publicar: `npx vercel deploy --prod --yes`.
4. Entrar a Perfil: al final aparece "panel de admin".

**Pendiente del dueño:** `ADMIN_EMAILS` no está cargada en Vercel (no sé con qué email va a entrar), así que hoy en producción nadie es admin: `/admin` es 404 para todos. Al cargarla y volver a publicar, queda activo. Está documentado en `README.md` y `.env.example`.

## Comprobaciones

- pgTAP (`supabase/tests/09_admin.sql`, 14 pruebas): un integrante y anon no leen ni escriben `admin_actions` ni ejecutan la función; como service_role cambia la ronda, borra los 3 intentos en los tres estados, deja registro con la cantidad, crea la ronda de un día sin ronda, y con un juego inválido la transacción se deshace entera (el intento sigue, sin registro).
- vitest (`src/lib/admin.test.ts`, contra la base local): quién es admin (lista, confirmado, anónimo, otro email, lista vacía); cambio sin intentos (juego, semilla y registro); con intentos en cualquier estado (borrados en la transacción, registro con la cantidad, `/finish` del borrado da 410 `attempt_deleted`, y el integrante vuelve a tener 3 intentos); falla a mitad de camino sin dejar nada a medias; "el que toca en el mazo"; un grupo en Pacific/Kiritimati usa su propio hoy y la ronda se crea dentro de su temporada; validar no escribe nada (cuenta `attempts` y `rounds` antes y después) y rechaza un id de juego que no existe. Suite completa en verde; `eslint`, `tsc` y `next build` limpios.
- E2E local (`e2e/admin.spec.ts`): sin sesión y con sesión anónima, `/admin` y `/admin/jugar` 404 y `/api/admin/*` 403; el admin entra, ve su email, las herramientas de un juego y un 400 por juego inexistente; cambia el juego de un grupo con intentos (aviso, el botón que borra aparece recién tras el primer toque, registro) y la integrante en Hoy ve "cambió el juego de hoy", el juego nuevo y "te quedan 3 intentos" sin recargar, por Realtime; después "el que toca en el mazo" con confirmación simple; quien estaba jugando ve el aviso específico y vuelve a Hoy con 3 intentos; el admin juega clase con el bro en `/admin/jugar` y ve "validado" con el recalculado igual al puntaje.
- Producción (deploy `playus-f6rm0a2zh`): la migración 7 aplicada con `npx supabase db push --linked` y verificada en la base real (`admin_actions` con RLS activado y 0 políticas, sin `select` para `authenticated`; la función ejecutable por `service_role` y no por `authenticated`; `rounds` en la publicación de Realtime). Sin sesión: `/admin`, `/admin/jugar`, `/dev/juego`, `/dev/juego/la-mayo` y `/dev/hoy` responden 404; `POST /api/admin/validate` y `/api/admin/set-game`, 403. El E2E de permisos (sin sesión y con sesión anónima) y la ronda real de clase con el bro pasan contra el sitio. Los flujos del admin no se pueden correr contra producción sin el magic link del dueño.

## Capturas

- `reports/admin/grupos.png`: la lista de grupos.
- `reports/admin/confirmacion.png`: la confirmación de borrado con "borrar y cambiar".
- `reports/admin/prueba-validada.png`: el resultado de una prueba validada en `/admin/jugar`.
- `reports/admin/hoy-integrante.png`: la pantalla Hoy de una integrante después del cambio, con el aviso.
