# Reporte: etapa 2 (auth anónima, grupos e invitaciones)
Estado: completa
Fecha: 2026-09-24

## Qué hice

Levanté la app de Next.js 15 (App Router, TypeScript estricto, Tailwind 4) sobre el esquema de la etapa 1 y construí el flujo de entrada completo: una persona abre un link, tiene sesión anónima sin hacer nada, pone su nombre, elige un color de avatar provisorio y queda adentro del grupo viendo la lista de integrantes. También la creación de grupo, el botón de invitar (Web Share API cuando existe, copiar al portapapeles como respaldo, y el código de 6 caracteres siempre visible para dictarlo) y el esqueleto de las tres pestañas con barra inferior.

Cómo está armado. La sesión vive en cookies con `@supabase/ssr`: hay un cliente de navegador, un cliente de servidor y un middleware que refresca el token en cada petición. Las dos pantallas que abren sesión (`/g/[code]` y `/crear`) son componentes de cliente, porque `signInAnonymously` tiene que escribir cookies y un Server Component no puede. El resto (landing, pestañas Hoy, Grupo y Perfil) son Server Components que leen con el cliente de servidor, con RLS filtrando del lado de la base. El flujo del link es: abrir sesión anónima si no hay → leer el perfil propio (lo creó el trigger de la etapa 1) → si no tiene nombre, mostrar la pantalla de nombre + avatar y guardarlo con un `upsert` sobre `profiles` → llamar a la RPC `join_group(código)` → guardar el grupo elegido en una cookie → ir a la pestaña Grupo. Si el perfil ya tiene nombre (alguien que ya usó la app y abre otro link) se saltea la pantalla y entra directo. Crear grupo es igual, pero termina en `create_group(nombre, zona horaria del navegador)`.

La pestaña Grupo muestra el nombre del grupo, un selector si el usuario está en más de un grupo, la lista de integrantes (avatar, apodo o nombre, quién creó el grupo, tu propia fila marcada con el borde izquierdo en agua), el botón de invitar y el código. Los estados vacíos están escritos como invitaciones a hacer algo: "por ahora sos vos" y "un grupo de uno no tiene ranking. mandale el link a alguien y se arma". La tabla de la temporada aparece como espacio vacío con texto; se llena en la etapa 5. Hoy y Perfil son placeholders que dicen en qué etapa llegan; Perfil ya muestra el nombre y el avatar guardados. Sin sesión o sin grupos, las pestañas mandan a la landing; con grupos, la landing manda a Hoy.

Sobre la verificación en el navegador: este entorno no tiene Docker, así que `supabase start` no anda, y el proxy bloquea GitHub, así que tampoco pude bajar los binarios de PostgREST y de Auth. Para poder probar el flujo de verdad escribí un emulador chico (`scripts/mini-supabase`) que responde los endpoints de Auth que usa la app (registro anónimo, usuario, refresh de token) y los de REST (tablas con filtros básicos y RPC) sobre el Postgres local, ejecutando cada petición con el rol y los claims del JWT, así RLS, `auth.uid()` y las RPC corren igual que en Supabase. Con eso levanté Next y corrí un test de Playwright que reproduce el criterio de la etapa con dos contextos de navegador independientes: uno crea el grupo, el otro entra por el link y pone su nombre, y los dos ven la lista con los dos integrantes. Entrar por el link tardó entre 3 y 7 segundos según la corrida, por debajo de los 15. También saqué capturas de las pantallas para revisarlas visualmente.

## Archivos

- creados: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`: scaffold de Next.js 15 con TypeScript estricto, Tailwind 4 y ESLint; scripts `dev`, `build`, `lint`, `typecheck`, `db:test`, `db:test:local`, `dev:local-stack`, `e2e`.
- creados: `src/app/globals.css`: tokens de la paleta del brief (`--fondo`, `--superficie`, `--oro`, `--rosa`, `--agua`, `--tinta`) como colores de Tailwind; cifras tabulares; una sola paleta.
- creados: `src/app/layout.tsx`: layout raíz, `lang="es"`, columna centrada de 480 px máximo, theme color.
- creados: `src/app/page.tsx` y `src/components/code-form.tsx`: landing con "crear un grupo" y "tengo un código" (normaliza el código y navega a `/g/CODIGO`); redirige a Hoy si ya hay grupos.
- creados: `src/app/g/[code]/page.tsx` y `join-flow.tsx`: link de invitación; sesión anónima automática, pantalla de nombre + avatar si falta, `join_group`, cookie del grupo y redirección; errores en texto claro con el formulario de código para reintentar.
- creados: `src/app/crear/page.tsx` y `create-flow.tsx`: creación de grupo; misma pantalla de nombre + avatar si falta, después el nombre del grupo, `create_group` con la zona horaria del navegador (cae a Montevideo si la base la rechaza).
- creados: `src/app/(app)/layout.tsx`: exige sesión y al menos un grupo; barra de pestañas.
- creados: `src/app/(app)/grupo/page.tsx` y `group-switcher.tsx`: pestaña Grupo con selector, integrantes, invitar y código.
- creados: `src/app/(app)/hoy/page.tsx` y `src/app/(app)/perfil/page.tsx`: placeholders de las etapas 5 y 3.
- creados: `src/components/avatar.tsx`, `src/lib/avatar.ts`: avatar provisorio (círculo de color con iniciales, SVG) y 8 colores; se guarda como `{"bg": "#…"}`.
- creados: `src/components/onboarding-form.tsx`: formulario de nombre + color con vista previa.
- creados: `src/components/invite-button.tsx`: Web Share API con respaldo de portapapeles, código visible y link completo.
- creados: `src/components/tab-bar.tsx`: barra inferior con hoy / grupo / perfil.
- creados: `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `env.ts`, `types.ts` y `src/middleware.ts`: clientes de Supabase, refresco de sesión y tipos de la base escritos a mano.
- creados: `src/lib/groups.ts`, `src/lib/groups-actions.ts`: grupos del usuario, grupo actual por cookie y acción de servidor para elegirlo.
- creados: `src/lib/session.ts`, `src/lib/errors.ts`: sesión anónima automática y traducción de errores de las RPC a texto de interfaz.
- creados: `e2e/invitacion.spec.ts` y `playwright.config.ts`: test E2E del criterio de la etapa (emulando un Pixel 7), más código inválido y redirecciones.
- creados: `scripts/mini-supabase/server.mjs`, `keys.mjs`: emulador de Auth + REST para desarrollar sin Docker y generador de claves.
- creados: `scripts/dev-local.sh`: arma la base `playus_dev` con shim, migraciones y seed.
- creados: `reports/etapa-2.md`: este reporte.
- modificados: `README.md`: estructura nueva, cómo levantar con Docker y sin Docker, cómo correr el E2E.
- modificados: `DECISIONS.md`: decisiones 23 a 32.
- modificados: `.gitignore`: Playwright y `next-env.d.ts`.

## Decisiones nuevas

23. Los flujos de invitación y creación son de cliente porque abrir la sesión anónima escribe cookies, cosa que un Server Component no puede hacer.
24. El grupo actual se guarda en la cookie `playus-group`; se fija al crear o unirse y desde el selector; si no apunta a un grupo propio, se usa el más viejo.
25. Avatar provisorio = un color de fondo más iniciales, guardado como `{"bg"}`, la misma clave que va a usar el avatar por piezas de la etapa 3.
26. La zona horaria del grupo es la del navegador de quien lo crea, con reintento a `America/Montevideo` si la base la rechaza.
27. Sin sesión o sin grupo, las pestañas mandan a la landing; con grupo, la landing manda a Hoy. `getMyGroups` devuelve vacío sin sesión en vez de consultar como `anon`, porque Next renderiza página y layout en paralelo.
28. Consultas planas, sin recursos embebidos de PostgREST: la lista de integrantes son dos consultas (membresías y perfiles).
29. `mini-supabase` como emulador de Auth + REST para desarrollar y correr E2E sin Docker; corre cada petición con `set local role` y `request.jwt.claims`, así RLS se ejercita de verdad. No cubre email, realtime ni storage, y no reemplaza a Supabase real.
30. Los tests de la etapa son de Playwright, con dos contextos de navegador, y miden que entrar por el link tarde menos de 15 segundos.
31. Tipos de la base escritos a mano; se regeneran con `supabase gen types` cuando haya Docker.
32. Fuentes del sistema hasta la etapa 7; la paleta ya está como tokens.

## Desvíos del plan o del brief

- El criterio pedía verificarlo en una ventana normal y una de incógnito. Lo verifiqué con dos contextos de Playwright (equivalentes a ventanas de incógnito independientes) contra el emulador local en lugar de Supabase real, porque acá no hay Docker ni acceso a los binarios. La primera corrida con `supabase start` en una máquina con Docker sigue pendiente y puede destapar diferencias menores (por ejemplo, la forma exacta de la respuesta de Auth).
- Agregué `scripts/mini-supabase`, `scripts/dev-local.sh` y un test E2E que el plan no pedía. Son herramientas para poder cumplir "que corra de verdad en el navegador" en este entorno.
- Las pestañas Hoy y Perfil existen como placeholders para que la barra inferior y las redirecciones funcionen; el brief las define para las etapas 3 y 5.

## Tests

Etapa 1 (sin cambios en la base, siguen pasando):

```
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres scripts/db-test-local.sh
→ 5 archivos, 154 aserciones, 154 pasan, 0 fallan
```

Etapa 2, chequeos estáticos y build:

```
npm run typecheck   → sin errores
npm run lint        → sin errores
npm run build       → compila; rutas /, /crear, /g/[code], /grupo, /hoy, /perfil y middleware
```

Etapa 2, E2E (con `scripts/dev-local.sh`, `npm run dev:local-stack` y `npm run dev` levantados):

```
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e

✓ crear un grupo, invitar por link y ver la lista en los dos lados (6.8 s)
✓ un código inexistente avisa y deja probar otro (0.9 s)
✓ sin sesión ni grupo, las pestañas mandan a la landing (0.7 s)
3 passed
```

El primer test crea el grupo desde un contexto, entra por el link desde otro contexto limpio (mide que tarde menos de 15 s: tardó entre 3 y 7 s según la corrida), comprueba que los dos ven a Vale y Nico, que recargar en el primero muestra a los dos, que la raíz redirige a Hoy con grupo, que volver a abrir el link con sesión no pide el nombre de nuevo, y que Perfil muestra el nombre guardado.

## Cómo verificarlo en el navegador

Con Docker (camino oficial):

1. `npm install`, `npx supabase start`, `npx supabase db reset`.
2. Copiar `.env.example` a `.env.local` y completar las tres variables con lo que imprime `npx supabase status`.
3. `npm run dev` y abrir `http://localhost:3000` en una ventana normal.
4. Tocar "crear un grupo", poner un nombre, elegir un color, "seguir", nombre del grupo, "crear grupo". Tiene que aparecer la pestaña Grupo con un solo integrante (vos) y el código de 6 caracteres.
5. Copiar el link (botón "copiar link" o el texto de abajo) y abrirlo en una ventana de incógnito. Cronometrar: sesión automática, poner nombre, "entrar al grupo". Tiene que aparecer la pestaña Grupo con los dos integrantes en menos de 15 segundos.
6. Volver a la ventana normal y recargar: los dos integrantes.
7. Probar `http://localhost:3000/g/ZZZZZZ` en otra ventana de incógnito: después del nombre, tiene que avisar "ese código no existe" y dejar escribir otro código.
8. En un teléfono Android real, el botón "invitar" abre la hoja de compartir del sistema; en escritorio copia el link.

Sin Docker: seguir la sección "Sin Docker" del README y correr `npm run e2e`, o hacer los mismos pasos a mano contra `npm run dev`.

## Problemas y deuda

- No se corrió contra Supabase real. El emulador imita la forma de las respuestas de GoTrue y PostgREST que usa supabase-js, pero es una imitación; la primera corrida con Docker es la prueba definitiva.
- El emulador no soporta recursos embebidos, vincular email (`updateUser({ email })`, etapa 3), Realtime (etapa 5) ni push. Cuando esas etapas lleguen, o se extiende el emulador o se prueban solo con Supabase real.
- `next/font` no está: el proxy de este entorno bloquea Google Fonts en build. Se resuelve en la etapa 7, donde el diseño lo pide.
- Con un código inválido, la persona pone su nombre antes de enterarse de que el código no sirve. No se puede verificar antes sin exponer `groups` a no-miembros; el perfil queda guardado y el segundo intento no vuelve a pedir el nombre.
- Playwright 1.63 espera un Chromium más nuevo que el preinstalado acá; por eso el config admite `PW_CHROMIUM_PATH`. En una máquina normal `npx playwright install chromium` alcanza.
- `npm audit` reporta vulnerabilidades en dependencias transitivas del scaffold; no las toqué en esta etapa.
- El texto del placeholder del código se corta con letras espaciadas; lo acorté a "código". La pasada de diseño de la etapa 7 revisa todo esto.

## Preguntas

ninguna

## Siguiente paso propuesto

Etapa 3: piezas SVG del avatar (6 a 8 por categoría) como componentes, validación del `jsonb` con zod, editor con grilla de miniaturas y vista previa en vivo, edición de nombre visible y apodo por grupo, vinculación opcional de email escondida en el perfil, y las estadísticas del perfil armadas pero vacías. Criterio: el avatar se edita, se guarda y se ve igual en la lista de integrantes desde el otro navegador.
