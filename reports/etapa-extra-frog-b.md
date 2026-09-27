# Reporte: etapa extra (rediseño "Frog"), segunda ejecución: invite_preview, ajustes y publicación
Estado: parcial
Fecha: 2026-09-27

## Qué hice

Cerré lo que quedó pendiente del reporte anterior (`reports/etapa-extra-frog.md`) y publiqué todo junto. La app nueva está en **https://playus-lake.vercel.app**: el rediseño Frog, las ocho correcciones de la prueba en teléfonos y lo de esta ejecución. El estado sigue siendo parcial por lo mismo de siempre: falta verlo en un Android y un iPhone reales (el ícono instalado, las notificaciones y las pantallas con las ranas asomadas). Al final hay una lista corta de qué probar.

**`invite_preview`.** Migración nueva (la 6) con una RPC `security definer` `invite_preview(p_code text)` que devuelve `{ total, members: [{ name, avatar }] }`: `total` es cuántos integrantes tiene el grupo y `members` son hasta 5, por orden de ingreso, con `name` igual al apodo en el grupo (sin espacios de más) o el `display_name`, y el avatar como objeto. Nada de ids ni fechas. El código se normaliza (mayúsculas, sin espacios). Un código inexistente, uno con formato inválido o `null` devuelven `{ total: 0, members: [] }`, igual que un grupo vacío, sin un error distinto. Solo `authenticated` puede ejecutarla; `anon` no (la invitación abre la sesión anónima antes de llamarla, así que alcanza). Los 16 tests pgTAP de `08_invite_preview.sql` comprueban los privilegios, que es `security definer`, que un no-miembro sigue sin poder leer el grupo directo pero sí la vista previa, que la respuesta tiene exactamente las claves `total` y `members` y cada integrante exactamente `name` y `avatar`, el apodo, la normalización del código, los tres casos vacíos y el corte en 5 con 7 integrantes.

**Avatares apilados en la invitación.** Debajo del código, los avatares de los primeros integrantes superpuestos (hasta 5, con el anillo de contorno) y el texto: "{A} ya está adentro", "{A} y {B} ya están adentro" o "{A}, {B} y N más ya están adentro". Con un código inexistente no aparece nada (y el error sigue saliendo recién al intentar entrar, como antes). La llamada a la RPC corre en paralelo con el resto del arranque de la pantalla: no la demora.

**Tarjeta del juego de hoy en anchos chicos.** La rana asomada y su globo escalan al 80% desde la esquina superior derecha cuando el ancho es menor a 360px, así quedan por encima del título; el bloque del título reserva lugar a la derecha (`pr-20`, y `pr-32` desde 360px) y el nombre del juego tiene tamaño `clamp(40px, 15vw, 58px)`. Lo medí con Playwright a 320, 360 y 412px: las cajas del título, la rana y el globo no se cruzan en ninguno, y no hay scroll horizontal.

**`sharp` en `devDependencies`**, en la misma versión que ya estaba instalada como dependencia transitiva de Next (`^0.35.4`).

**Publicación.** Apliqué la migración 6 al proyecto de Supabase en la nube (`npx supabase db push`: solo esa, sin seed) y verifiqué en la base real que `anon` no puede ejecutarla y `authenticated` sí. Después `npx vercel deploy --prod`. Contra la URL publicada comprobé: manifest `frog`/`frog`/`#0E2620`, `<title>frog</title>`, los íconos nuevos y `sw.js` responden 200; y un recorrido real con dos navegadores: crear grupo, abrir el link (dice "Prueba Frog A ya está adentro"), entrar, ver la tarjeta con la rana y el globo, jugar, ver el puntaje tapado desde el otro lado, el segundo jugador apareció en el ranking del primero a los **334 ms** sin recargar, y el banner "Prueba Frog B te pasó por 587 ms. mañana te la cobrás." con la rana sorprendida. Esa prueba dejó un grupo "prueba frog" con dos usuarios de prueba en la base de producción; no los borré.

## Archivos

- creados: `supabase/migrations/20260927000006_invite_preview.sql`: la RPC `invite_preview` y sus privilegios.
- creados: `supabase/tests/08_invite_preview.sql`: 16 aserciones.
- creados: `reports/etapa-extra-frog-b.md`: este reporte.
- modificados: `src/app/g/[code]/join-flow.tsx`: llama a `invite_preview` y muestra los avatares apilados con el texto.
- modificados: `src/lib/supabase/types.ts`: tipo de la RPC.
- modificados: `src/app/(app)/hoy/page.tsx`: escala de la rana por debajo de 360px, lugar reservado y tamaño fluido del título.
- modificados: `package.json`, `package-lock.json`: `sharp` en `devDependencies`.
- modificados: `DECISIONS.md`: decisiones 100 a 102.

## Decisiones nuevas

- **100. `invite_preview(code)`**: lo mínimo para que la invitación diga quiénes están adentro; código inválido = grupo vacío; solo `authenticated`. Reemplaza a la 99.
- **101. La rana asomada sobre la tarjeta del juego se achica un 20% por debajo de 360px**, con lugar reservado y título fluido; verificado a 320, 360 y 412px.
- **102. `sharp` pasa a `devDependencies`.**

## Desvíos del plan o del brief

- La unificación del cálculo de "te pasaron" (el push en `src/lib/overtake.ts` y el banner de Hoy con `finished_at`) queda anotada como deuda, como pediste; no la toqué.
- Ninguno más.

## Tests

- `npx supabase test db`: **192 de 192** (176 anteriores más 16 de `invite_preview`).
- `npm test` (vitest): **45 de 45**.
- `npm run e2e` contra `npm run dev` y Supabase local: **9 de 9** (más `pwa.spec.ts` salteada a propósito en dev).
- `npm run build`: sin errores. `npm run typecheck` y `npm run lint`: sin errores.
- Producción: manifest, título, íconos y `sw.js` correctos; recorrido completo con dos navegadores (arriba); Realtime en 334 ms.

## Cómo verificarlo en el navegador

1. Abrir https://playus-lake.vercel.app en una ventana normal: la marca dice `frog`, el título de la pestaña también, y el favicon es la rana.
2. Crear un grupo. Copiar el link de la pestaña Grupo y abrirlo en una ventana de incógnito: debajo del código aparece tu avatar con "{tu nombre} ya está adentro". Entrar. Abrir el mismo link en una tercera ventana: "{A} y {B} ya están adentro". Con un tercero adentro y una cuarta ventana: "{A}, {B} y 1 más ya están adentro".
3. En Hoy, achicar la ventana a 320px de ancho (DevTools → dispositivo personalizado): la rana con el globo queda arriba de la tarjeta sin tapar el nombre del juego.
4. Jugar con dos ventanas y comprobar el ranking en vivo y el banner rosa de "te pasó".

## Qué probar en los teléfonos

**Android (Chrome):**
1. Abrir https://playus-lake.vercel.app, crear un grupo o entrar por un link. En la invitación, mirar los avatares apilados y el texto de quiénes están adentro.
2. Hoy: la tarjeta del juego con la rana y el globo "¡te toca, dale!"; que el nombre del juego no quede tapado.
3. Jugar. Después: "activar avisos" y "instalar la app". Abrir desde el ícono: tiene que ser la rana en pixel art sobre fondo verde oscuro, a pantalla completa y con la barra de estado del color del fondo.
4. Que otra persona te pase: llega la notificación y en Hoy aparece el banner rosa con la rana sorprendida.
5. Activar "Quitar animaciones" en Accesibilidad: las ranas dejan de saltar y parpadear.

**iPhone (Safari, iOS 16.4 o más nuevo):**
1. Abrir el link, entrar y jugar. Compartir → "Agregar a inicio": el ícono tiene que ser la rana (sin esquinas raras: iOS redondea solo).
2. Abrir desde el ícono y recién ahí "activar avisos".
3. Mirar Hoy, el ranking, Grupo y Perfil: que las ranas asomadas no tapen texto, que la barra inferior no quede debajo de la línea de inicio, y que nada se corte a los lados.
4. Con "Reducir movimiento" activado en Accesibilidad, nada se mueve salvo los botones al presionar.

**En los dos:** el recordatorio diario (poner la hora unos minutos adelante en Grupo y esperar hasta 15 minutos sin jugar) y "sin señal" (modo avión y abrir la app instalada: la rana dormida y el botón "probar de nuevo").

## Problemas y deuda

- **Sin verificar en teléfonos reales** (ícono instalado, notificaciones, pantallas con ranas asomadas).
- **Dos cálculos de "te pasaron"** (`overtake.ts` para el push y `finished_at` para el banner). Coinciden hoy; unificarlos queda para después, como pediste.
- El grupo "prueba frog" (y "prueba deploy", de la tarea 2) siguen en la base de producción con usuarios de prueba.
- Vercel sigue sin estar conectado a GitHub: cada publicación es un `npx vercel deploy --prod` a mano desde la carpeta.

## Preguntas

- Sigue pendiente la decisión sobre **los tiempos del verde en reflejo** (A: varían por intento; B: quedan como están; C: distintos por jugador).

## Siguiente paso propuesto

Probar en los dos teléfonos con la lista de arriba, y con los resultados cerrar el estado de esta etapa y de las etapas 6 y 7 (cambiar `Estado: parcial` por `completa` y anotar fecha y dispositivos).
