# Reporte: etapa 3 (avatar y perfiles)
Estado: completa
Fecha: 2026-09-24

## Qué hice

Reemplacé el avatar provisorio de la etapa 2 (un círculo de color con iniciales) por el avatar por piezas del brief, y armé la pestaña Perfil completa salvo los números, que quedan preparados y vacíos hasta la etapa 5.

El avatar se dibuja como SVG desde el `jsonb` de `profiles.avatar`, con la forma que definía el brief: `{ base, skin, hair, hairColor, eyes, mouth, accessory, bg }`. Hay 6 caras, 8 pelos (incluido "sin pelo"), 6 ojos, 6 bocas, 6 extras más "sin extra", y 8 colores para piel, pelo y fondo. Todas las piezas son componentes de React en un solo archivo (`src/avatar/pieces.tsx`), en un lienzo de 100×100 con la cabeza centrada, y se apilan en orden: fondo, cara, ojos, boca, pelo, extra. Los ids numéricos son la posición en cada lista (desde 1) y quedan persistidos, así que las piezas nuevas se agregan al final y nunca se reordenan.

La validación es con zod, en dos niveles. Un esquema estricto rechaza cualquier avatar mal armado antes de guardarlo. Un esquema tolerante, con un default por campo, se usa para leer: un perfil de la etapa 2 (que solo tenía `bg`) o cualquier dato viejo o incompleto se sigue dibujando sin romper la lista de integrantes.

El editor tiene la vista previa grande arriba, un botón "al azar", una fila de chips con las ocho categorías (cara, piel, pelo, color de pelo, ojos, boca, extra, fondo) y una grilla de miniaturas de a cuatro por fila. En las categorías de forma cada miniatura muestra el avatar actual con esa opción aplicada, así se ve cómo queda antes de tocar; en las de color son círculos de color. La opción elegida lleva un anillo claro. El mismo editor se usa en la pantalla de alta (link de invitación y crear grupo), que ahora arranca con un avatar al azar para que dé ganas de tocar, y en la pantalla nueva `/perfil/editar`, donde también se cambia el nombre visible y se guarda con "guardar cambios".

La pestaña Perfil muestra el avatar grande y el nombre, el link a editar, la sección "tus números" (rondas jugadas, victorias, mejor racha, temporadas ganadas y el juego donde mejor te va, todos con "—" y el texto "se llenan con tu primera partida. no hay apuro."), un campo de apodo por cada grupo al que pertenecés (guarda al salir del campo o con Enter sobre la única columna de la membresía que el cliente puede tocar, y muestra "guardado"), y en ajustes un desplegable escondido "¿cambiás de teléfono? vinculá un email" con un campo de email y el botón "vincular", que llama a `supabase.auth.updateUser({ email })`. Eso convierte la cuenta anónima en una con email sin perder nada: Supabase manda un magic link y deja el email pendiente hasta confirmarlo; la interfaz lo explica y no bloquea nada. Las notificaciones quedan anunciadas para la etapa 6.

La lista de integrantes de la pestaña Grupo ya muestra el avatar por piezas y el apodo si hay. El renderizador escribe el JSON normalizado del avatar en un atributo `data-avatar` del SVG; con eso el test E2E comprueba que el avatar guardado desde un navegador es exactamente el que ve el otro.

Para verificarlo usé el mismo emulador local de la etapa 2 (sin Docker acá), al que le agregué la actualización de email del usuario. El test de Playwright nuevo arma un avatar en el alta (rulos, fondo agua), lo revisa en Perfil, lo edita (nombre, ojos grandes, gorra), pone un apodo, vincula un email, y desde un segundo navegador entra al grupo por el link y comprueba que la fila del primero muestra el apodo y un avatar idéntico al guardado. También revisé las pantallas en capturas y corregí un detalle que apareció ahí: la gorra y la vincha desaparecían sobre un fondo del mismo color, así que ahora llevan contorno oscuro.

## Archivos

- creados: `src/avatar/palette.ts`: 8 colores de piel, 8 de pelo, 8 de fondo y los colores fijos de las piezas.
- creados: `src/avatar/schema.ts`: esquema zod estricto (`avatarSchema`), lectura tolerante (`parseAvatar`), avatar por defecto, `randomAvatar` y `avatarFromProfile` (al azar si el perfil todavía no tiene avatar).
- creados: `src/avatar/pieces.tsx`: las piezas SVG: 6 caras, 8 pelos, 6 ojos, 6 bocas, 6 extras, cada una con su nombre en español para el editor y los tests.
- creados: `src/avatar/avatar-svg.tsx`: dibuja el avatar completo (sirve en servidor y cliente) y escribe `data-avatar`.
- creados: `src/avatar/editor.tsx`: editor con vista previa, "al azar", chips de categorías y grilla de miniaturas.
- creados: `src/components/profile-stats.tsx`: estadísticas del perfil con datos en null y el texto de invitación.
- creados: `src/app/(app)/perfil/editar/page.tsx` y `profile-editor.tsx`: edición de nombre visible y avatar, con validación estricta antes de guardar.
- creados: `src/app/(app)/perfil/nicknames.tsx`: apodo por grupo, guardado al salir del campo o con Enter.
- creados: `src/app/(app)/perfil/link-email.tsx`: vincular email, escondido en un desplegable, con estados enviado / pendiente / vinculado / error.
- creados: `e2e/perfil.spec.ts`: el criterio de la etapa más apodo, email y estadísticas vacías; y un chequeo de que un avatar nuevo siempre tiene las ocho claves.
- creados: `reports/etapa-3.md`: este reporte.
- modificados: `src/components/avatar.tsx`: ahora envuelve al renderizador por piezas (misma API que antes).
- modificados: `src/components/onboarding-form.tsx`: usa el editor completo en vez de la grilla de colores.
- modificados: `src/app/g/[code]/join-flow.tsx` y `src/app/crear/create-flow.tsx`: arrancan con avatar al azar si el perfil no tiene uno.
- modificados: `src/app/(app)/perfil/page.tsx`: de placeholder a la pestaña completa.
- modificados: `src/app/(app)/grupo/page.tsx`: importa `parseAvatar` del módulo nuevo.
- modificados: `scripts/mini-supabase/server.mjs`: `PUT /auth/v1/user` acepta `email` (lo guarda directo, sin confirmación).
- modificados: `e2e/invitacion.spec.ts`: elige el fondo desde la categoría "fondo" del editor.
- modificados: `package.json`, `package-lock.json`: dependencia `zod`.
- modificados: `README.md`, `DECISIONS.md` (decisiones 33 a 41).
- eliminados: `src/lib/avatar.ts` (el avatar provisorio de la etapa 2).

## Decisiones nuevas

33. Ids de piezas 1-based y estables: se agregan al final, nunca se reordenan, porque quedan persistidos.
34. Dos esquemas zod: estricto para guardar, tolerante (con default por campo) para leer, así los perfiles viejos se siguen dibujando.
35. Las cuentas nuevas arrancan con un avatar al azar y hay botón "al azar".
36. Las miniaturas del editor muestran cada opción aplicada al avatar actual, no la pieza suelta.
37. Los extras de color fijo (gorra, vincha) llevan contorno oscuro para no desaparecer sobre un fondo igual.
38. El apodo se edita en Perfil, un campo por grupo, guardando al salir del campo o con Enter.
39. Vincular email con `updateUser({ email })` escondido en un desplegable; magic link de confirmación, sin contraseña, sin bloquear nada. El emulador local lo guarda directo.
40. Las estadísticas son un componente que recibe un objeto con nulls; la etapa 5 solo calcula el objeto.
41. El SVG lleva `data-avatar` con el JSON normalizado, para comparar entre navegadores en los tests.

## Desvíos del plan o del brief

- El brief pedía "6 a 8 opciones por categoría". Cumplido en todas menos en extras, donde hay 6 más "sin extra".
- La verificación fue con dos contextos de Playwright contra el emulador local, no contra Supabase real (sin Docker acá). En particular, la vinculación de email real (magic link, `new_email` pendiente) no se pudo probar de punta a punta: el emulador guarda el email directo.
- El apodo por grupo quedó en Perfil (todos los grupos juntos) y no en la pestaña Grupo. El brief lo listaba entre lo editable del perfil, así que lo tomé literal.

## Tests

Etapa 1 (sin cambios en la base):

```
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres scripts/db-test-local.sh
→ 5 archivos, 154 aserciones, 154 pasan, 0 fallan
```

Chequeos estáticos y build:

```
npm run typecheck   → sin errores
npm run lint        → sin errores
npm run build       → compila; se suma la ruta /perfil/editar
```

E2E (con `scripts/dev-local.sh`, `npm run dev:local-stack` y `npm run dev` levantados):

```
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e

✓ armar el avatar, editarlo y verlo igual desde otro navegador (10.9 s)
✓ un perfil de la etapa 2 (solo fondo) se sigue dibujando (1.1 s)
✓ crear un grupo, invitar por link y ver la lista en los dos lados (11.4 s)
✓ un código inexistente avisa y deja probar otro (1.2 s)
✓ sin sesión ni grupo, las pestañas mandan a la landing (0.8 s)
5 passed
```

## Cómo verificarlo en el navegador

1. Levantar la app (con Docker: `npx supabase start`, `npx supabase db reset`, `npm run dev`; sin Docker: sección "Sin Docker" del README).
2. Ventana normal: `http://localhost:3000/crear`. Poner un nombre. Abajo aparece el editor con un avatar al azar: tocar "pelo" y elegir rulos, tocar "fondo" y elegir el agua. Se ve el cambio arriba en vivo. "seguir", nombre del grupo, "crear grupo".
3. Pestaña "perfil": el avatar grande y el nombre, "tus números" con guiones, el campo de apodo del grupo, y abajo el desplegable del email.
4. Tocar "editar nombre y avatar": cambiar el nombre, elegir "ojos" → grandes y "extra" → gorra, "guardar cambios". Vuelve al perfil con el avatar nuevo.
5. En el campo "en <grupo>" escribir un apodo y apretar Enter: aparece "guardado".
6. Abrir el desplegable "¿cambiás de teléfono? vinculá un email", escribir un email y "vincular": aparece "te mandamos un link a …". Con Supabase real llega un magic link (en local, en Inbucket/Mailpit, `http://127.0.0.1:54324`).
7. Ventana de incógnito: abrir el link de invitación (pestaña "grupo" de la primera ventana, "copiar link"), poner un nombre, elegir cualquier avatar, "entrar al grupo". En la lista de integrantes, la fila del primero muestra el apodo y el mismo avatar (rulos, fondo agua, ojos grandes, gorra) que se ve en su perfil.
8. Volver a la ventana normal, pestaña "grupo": los dos integrantes, cada uno con su avatar.

## Problemas y deuda

- La vinculación de email no está probada contra GoTrue real: con "Secure email change" activado, `updateUser({ email })` en una cuenta anónima manda un link de confirmación y el email queda en `new_email`. La interfaz contempla ese estado, pero hay que verlo funcionar con Docker.
- Las piezas son geométricas y simples. Cumplen "flat, saturado, sin degradados" y dan ganas de tocar, pero una ilustradora las mejoraría; el formato (un componente por pieza, ids estables) permite reemplazarlas sin migrar datos.
- No hay tests unitarios del esquema zod (`parseAvatar` con datos viejos, rangos). Vitest entra en la etapa 5; ahí agrego estos casos.
- El editor renderiza hasta 9 SVG por categoría más la vista previa. En teléfonos viejos podría notarse al cambiar de categoría; no lo medí.
- Las estadísticas del perfil son solo las propias. El brief dice "el perfil de un integrante muestra su historial": la vista del perfil de otro integrante (desde la lista del grupo) no existe todavía; la agrego en la etapa 5 junto con los datos, para no armar dos veces la misma pantalla vacía.

## Preguntas

ninguna

## Siguiente paso propuesto

Etapa 4: `src/games/types.ts` con el contrato del brief más `validate?`, `minPlausibleScore?` y `minDurationMs?`; `src/lib/rng.ts` con hash de string a 32 bits y `mulberry32`; el contenedor como máquina de estados (instrucciones → cuenta regresiva de 3 → partida con cronómetro del sistema → envío → resultado); `tap-race` y `reflejo` marcados como temporales; el registry en `src/games/index.ts`; la ruta de desarrollo `/dev/juego/[id]?seed=…`; `src/games/README.md`; y resolver la decisión 8 (importar el módulo del juego desde el servidor). Criterio: la misma semilla produce las mismas esperas en `reflejo` en dos navegadores, y ambos juegos terminan y muestran el resultado.
