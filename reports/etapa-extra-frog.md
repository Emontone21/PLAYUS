# Reporte: etapa extra (rediseño "Frog")
Estado: parcial
Fecha: 2026-09-27

## Qué hice

La app cambió de nombre y de identidad visual sin tocar nada del servidor: ni el esquema, ni las políticas RLS, ni los endpoints, ni la lógica de rondas, ni el contrato de juegos. Se llama `frog` (siempre en minúscula) en el manifest, el título, los metadatos, la interfaz, el mensaje para invitar, la notificación push de respaldo y el README. Los nombres internos (cookies, claves de `localStorage`, nombres de caché del service worker, el repo y el proyecto de Vercel) conservan `playus` a propósito (decisión 96).

El estado es parcial por una sola razón: el último criterio de "listo cuando" pide ver el ícono nuevo en la app instalada en un Android y un iPhone reales, y eso solo se puede hacer con un teléfono en la mano después de publicar. Todo lo demás está hecho y verificado.

**Tokens y tipografía.** La paleta anterior (índigo) se reemplazó entera por el estanque de noche, como variables CSS en `:root` y como colores de Tailwind en `@theme inline` (`bg-rana`, `text-luciernaga`, etc.). Bricolage Grotesque salió; entran Fredoka 600/700 (títulos, nombres, números, botones y la marca; con tracking de -1px desde 40px vía la clase `.display-lg`) e Instrument Sans 400/500/600 (párrafos, etiquetas y ayudas), las dos por `next/font/google`. Como Instrument no se carga en 700, `font-bold` de Tailwind quedó remapeado a 600 para no sintetizar negritas. Cifras tabulares en todo el `body`.

**Lenguaje visual.** El sistema de clases de `globals.css` se reescribió: tarjetas con contorno de 3px, sombra dura `5px 6px 0` y esquinas desparejas en cuatro variantes (`.card`, `.card-b`, `.card-c`, `.card-d`, cada una con la esquina chica en otro lugar); botón principal de 64px, ancho completo, Fredoka 700 26px, radio `20px 20px 20px 8px`, sombra `0 6px 0`, que baja 4px y achica la sombra al presionar; botones secundarios, inputs y chips con el mismo contorno; estados vacíos con borde punteado `3px dashed #2A5C4B` y sin fondo; burbujas de número (`50% 50% 50% 14%`); globo de diálogo (`#F7FFF2`, radio `14px 14px 4px 14px`, rotado -4°). Nenúfares decorativos (círculo al que le falta una cuña, con el path del documento) en `--decoracion`, detrás del contenido, recortados contra el borde y con `aria-hidden`: dos en las pantallas con pestañas, uno o dos en las de entrada. La barra inferior tiene fondo `--barra`, borde superior de 3px, pestaña activa en `--rana` Fredoka 700 con el mini nenúfar de 26×12 arriba. El ranking y la lista de integrantes siguen siendo filas con divisor de 2px en `--superficie-2`; tu fila lleva borde izquierdo de 6px en `--agua`, fondo `#143D32` y radio `0 14px 14px 0`; el primer puesto va en `--luciernaga`; los puntos ganados van en un chip (`--superficie-2`, texto `--rana`). Los avatares de personas quedaron iguales, con un anillo de 2,5px reales en `--contorno` (el grosor se calcula según el tamaño para que sean 2,5px a cualquier escala).

**La rana mascota.** `src/components/frog/frog-grid.ts` calcula la grilla de 15×15 sin React: mapa base de 12×8 con su esquina en la fila 4, columna 1; `put(fila, columna, texto)` con coordenadas relativas al mapa (las negativas quedan arriba) y `.` que borra; las siete poses (`feliz`, `risa`, `lengua`, `guino`, `sorpresa`, `dormida`, `corona`) aplicadas exactamente como las describe el documento; el borde de sticker (transparente con vecina ocupada en 8 direcciones → `O`) y la sombra (transparente con arriba, izquierda o arriba-izquierda ocupada → `X`); y los colores según el color del cuerpo (`H` y `N` más claro y más oscuro para cada uno de los tres verdes). `Frog.tsx` la dibuja en un `<svg viewBox="0 0 15 15" shape-rendering="crispEdges">` con un `<path>` por color (`M{c} {r}h1v1h-1z` por celda), memoizado por pose y parpadeo, con `aria-hidden`. Parpadea cada 3,4 a 4,6 s durante 160 ms con un desfase inicial distinto por instancia (no en `risa`, `guino` ni `dormida`), y salta un píxel de la grilla con `steps(1, end)` durante la mitad de un ciclo de 1,4 s (no en `dormida`). Con `prefers-reduced-motion` (leído por `matchMedia` y por CSS) queda quieta y con los ojos abiertos; `dormida` va con opacidad 0,85. Las doce ubicaciones de la tabla de la sección 7 están puestas con sus poses, tamaños, colores e inclinaciones: la marca (40, quieta) arriba de cada pantalla; las tres ranas agrupadas en la invitación; `lengua` 120 asomada sobre la tarjeta del juego con el globo "¡te toca, dale!"; `dormida` 44 en la fila de quien no jugó en "los demás" y 42 con "todavía no" en el ranking; `sorpresa` 80 asomada a la izquierda del banner rosa de "te pasaron"; `guino` 86 arriba a la derecha del pedido de avisos; `dormida` 96 a la izquierda de la temporada vacía; `risa` 100 asomada sobre el bloque de invitar; `feliz` 72 junto al nombre en Perfil; `risa` 62 al lado de "donde mejor te va"; y `corona` 22 en lugar de la corona anterior, al lado del nombre del campeón (el componente `Crown` ahora envuelve la rana en un `role="img"` con el título, así el significado no se pierde).

**Pantallas y textos.** Hoy antes de jugar es una tarjeta con "el juego de hoy" en `--rana`, el nombre en Fredoka 700 58px, la tagline y el `howTo` con burbujas; abajo el botón "jugar" y "te quedan N intentos. el intento cuenta al empezar: si cerrás o recargás a mitad de partida, lo perdés."; la sección "los demás" lleva "se destapa cuando juegues" a la derecha del título y lista a todos los integrantes: el puntaje de quien ya jugó va tapado con una píldora `--superficie-2` con una ola en `--agua` (`aria-label="puntaje tapado"`), quien no jugó lleva la rana dormida. En el ranking, cuando alguien te pasó hoy aparece el banner "{nombre} te pasó por {diferencia} {unidad}. mañana te la cobrás." (la unidad sale del juego: "ms" en reflejo), y los que faltan jugar van al final con "todavía no". Grupo: la temporada vacía dice "la tabla se despierta a medianoche, cuando cierre el primer día jugado. lo de hoy ya suma."; "días anteriores" vacío conserva su texto con un nenúfar chico a la izquierda; la ayuda del recordatorio dice "hora de Montevideo" (la ciudad sale de la zona horaria del grupo: el último tramo del nombre IANA, con espacios en lugar de guiones bajos). Perfil: "victorias" en `--luciernaga`, "mejor racha" en `--lengua`, y "vinculá un email" dentro de un `<details>` con borde punteado que al abrirse dice "te mandamos un link y listo. sin contraseña. es solo para no perder tus puntos si cambiás de teléfono.". La landing tiene el subtítulo nuevo. La pantalla sin señal lleva la rana dormida. La pantalla previa del juego y la de resultado usan las clases nuevas (burbujas, `display-lg` para el puntaje).

**Íconos y PWA.** `scripts/frog-icons.ts` genera desde la misma grilla (sin borde de sticker, sobre `#0E2620`, escalada con vecino más cercano, con un canvas de celdas elegido para que el factor sea entero) los íconos de 192 y 512 (la rana ocupa 12 de 16 celdas), los maskable de 192 y 512 (12 de 24 celdas, dentro de la zona segura), el `apple-touch-icon` de 180 y `src/app/icon.png` de 64, que Next sirve como favicon. Usa `sharp`, que ya viene con Next. `theme_color` y `background_color` son `#0E2620`. Las tres capturas del manifest se regeneraron con la interfaz nueva (Pixel 7, 1082×2202).

**Verificación.** Además de los tests, hice una pasada con Playwright sobre un Pixel 7 emulado que recorre todas las pantallas (landing, crear, invitación, confirmación de otro grupo, Hoy antes y después de jugar con tres integrantes, "los demás" con uno que jugó y otro que no, el banner de "te pasaron", la pantalla previa, el resultado, Grupo, Perfil y sin señal) y revisé cada captura. Con `reducedMotion: "reduce"`, ninguna rana tiene animación y los ojos quedan abiertos; con movimiento, las ranas animadas tienen `frog-hop` y la de la marca no. A 360px, "Valentina" y "Nicolás" entran completos en el ranking. El contraste de los 20 pares de texto y fondo que usa la interfaz se calculó con la fórmula WCAG: el más bajo es `--tinta-suave` sobre `--superficie-2` con 5,33:1, y `--tinta-suave` sobre `--superficie` da 6,66:1; todos superan 4,5:1. No quedó ningún "playus" visible: `grep` solo encuentra nombres internos.

## Archivos

- creados: `src/components/frog/frog-grid.ts`: la grilla de la rana (mapa base, poses, sticker, colores, paths) sin React.
- creados: `src/components/frog/Frog.tsx`: el componente; parpadeo, saltito y `prefers-reduced-motion`.
- creados: `src/components/frog/frog-grid.test.ts`: 6 tests (15×15 sin salirse, `sticker=false` sin `O` ni `X`, borde y sombra, poses, parpadeo, colores).
- creados: `src/components/brand.tsx`: la marca (rana quieta de 40 + "frog" en Fredoka 700 28px `--rana`).
- creados: `src/components/lily.tsx`: nenúfar grande decorativo, nenúfar chico en línea y el mini nenúfar de la pestaña activa.
- creados: `scripts/frog-icons.ts`: genera los íconos desde la rana en pixel art.
- creados: `src/app/icon.png`: favicon.
- creados: `reports/etapa-extra-frog.md`: este reporte.
- modificados: `src/app/globals.css`: tokens nuevos, fuentes, todo el sistema de clases, animación del saltito, reducir movimiento.
- modificados: `src/app/layout.tsx`: Fredoka e Instrument Sans, título y metadatos `frog`, `themeColor`.
- modificados: `src/app/manifest.ts`: nombre, descripción, colores y tamaño de las capturas.
- modificados: `src/components/tab-bar.tsx`, `crown.tsx`, `ranking.tsx` (filas pendientes, chip de puntos, primer puesto, tu fila), `profile-stats.tsx` (colores y rana), `push-card.tsx` (rana y tarjeta), `install-card.tsx` (texto y colores), `invite-button.tsx` (texto del mensaje), `avatar/avatar-svg.tsx` (anillo de 2,5px), `avatar/editor.tsx` (chips y selección).
- modificados: `src/app/(app)/layout.tsx` (marca y nenúfares), `hoy/page.tsx`, `grupo/page.tsx`, `grupo/reminder-time.tsx` (ciudad), `grupo/integrante/[id]/page.tsx`, `perfil/page.tsx`, `perfil/link-email.tsx`, `g/[code]/join-flow.tsx`, `crear/create-flow.tsx`, `page.tsx` (landing), `~offline/page.tsx`, `dev/hoy/page.tsx`, `dev/juego/page.tsx`.
- modificados: `src/games/container.tsx` (pantalla previa y resultado) y `src/games/reflejo.tsx` (clase del mensaje).
- modificados: `src/lib/today.ts`: lee `finished_at` y calcula `overtaker`. `src/lib/time.ts`: `cityFromTimezone`.
- modificados: `src/app/sw.ts`: el título de la notificación de respaldo dice `frog`.
- modificados: `public/icons/*.png`, `public/screenshots/*.png`: regenerados.
- modificados: `e2e/invitacion.spec.ts`: el título de la landing pasó de "playus" a "frog". `tsconfig.json`: excluye `scripts/`. `README.md`, `DECISIONS.md`.

## Decisiones nuevas

- **94. Cambio de dirección visual: Frog.** Los cuatro cambios respecto del brief: paleta (índigo → estanque de noche), tipografía (Bricolage → Fredoka), estilo (plano con contornos gruesos y sombras duras, caricatura) y movimiento (además del FLIP, parpadeo y saltito de la rana y el hundimiento de los botones; todo lo decorativo se apaga con `prefers-reduced-motion`).
- **95. La rana es pixel art calculado desde un mapa de letras**, sin React, para testearla y para generar los íconos con el mismo dibujo. Es decorativa (`aria-hidden`); donde significa algo (la corona) el significado va en el contenedor.
- **96. Los nombres internos siguen siendo `playus`**: renombrar cookies cerraría la sesión de todos y no aporta nada visible.
- **97. "te pasó por X" se calcula con `finished_at`**, una columna más en la misma consulta que Hoy ya hacía. Ningún endpoint ni política cambió.
- **98. Quien no jugó aparece con la rana dormida** en "los demás" y al final del ranking con "todavía no".
- **99. Los avatares de "{A} y {B} ya están adentro" en la invitación quedan afuera**: exigen una RPC nueva, y esta etapa prohíbe tocar la base.

## Desvíos del plan o del brief

- **Sección 8, "Entrada": los avatares apilados de los integrantes no están.** Quien abre el link todavía no es integrante y RLS no le deja leer los integrantes ni sus avatares. Hacerlo bien es una RPC `security definer` que devuelva nombres y avatares a partir del código (una migración chica), y esta etapa dice no tocar la base. Ver Preguntas.
- **Sección 8, banner "te pasó por X".** Para saber si alguien te pasó *después* de tu mejor partida hizo falta leer `finished_at` en la consulta de `attempts` que Hoy ya hacía. Es una lectura más, no un cambio de lógica ni de endpoint (decisión 97).
- **La landing no lleva la marca chica de 40px** sino la rana grande (120) con "frog" a 64px como cabecera: es la única pantalla sin nada más arriba y la marca chica quedaba perdida. Las demás pantallas llevan la marca de 40 como pide la tabla.
- **Instrument Sans `font-bold` = 600.** El documento pide cargar 400/500/600; para que ninguna negrita salga sintetizada, `--font-weight-bold` de Tailwind se remapeó a 600.
- **El E2E de invitación cambió una aserción:** el título de la landing ahora es "frog".

## Tests

- `npm test` (vitest): **45 de 45** (39 anteriores más 6 de la rana).
- `npm run e2e` contra `npm run dev` y Supabase local: **9 de 9** (más `pwa.spec.ts` salteada a propósito en dev).
- `E2E_PROD=1 E2E_BASE_URL=http://127.0.0.1:3001 npm run e2e -- e2e/pwa.spec.ts` contra `npm run build && npm run start`: **1 de 1**. El manifest responde `frog`/`frog`/`#0E2620`, los íconos nuevos se sirven y `<title>` es `frog`.
- `npm run typecheck` y `npm run lint`: sin errores.
- Contraste WCAG calculado sobre 20 pares: todos ≥ 4,5:1 (mínimo 5,33:1).

## Cómo verificarlo en el navegador

1. `npm run dev` con el stack local levantado. Abrir `http://localhost:3000`: la marca y el título dicen `frog`; en DevTools → Application → Manifest, `name` y `short_name` son `frog` y el ícono es la rana.
2. Crear un grupo, entrar con dos ventanas más por el link. En Hoy (antes de jugar): la tarjeta con la rana asomada y el globo, las burbujas de número, y en "los demás" la ola tapando el puntaje de quien jugó y la rana dormida en quien no.
3. Jugar con la primera ventana (mal) y con la segunda (mejor). Volver a la primera: banner rosa "{nombre} te pasó por N ms. mañana te la cobrás." con la rana sorprendida; el primer puesto en amarillo; "+10" en chip; la fila de quien no jugó al final con "todavía no".
4. Grupo: temporada y días vacíos con borde punteado y la rana dormida; la rana riéndose sobre "invitar a alguien"; "hora de Montevideo" en el recordatorio. Perfil: la rana junto al nombre, "victorias" en amarillo, "mejor racha" en rosa, el `<details>` punteado del email.
5. Activar "reducir movimiento" en el sistema (o en DevTools → Rendering → Emulate CSS `prefers-reduced-motion: reduce`): ninguna rana salta ni parpadea. Desactivarlo: saltan y parpadean; la de la marca no.
6. Para el ícono en el teléfono: publicar y agregar a la pantalla de inicio en Android y en iPhone.

## Problemas y deuda

- **Sin verificar en teléfonos reales**, incluido el ícono instalado. La pasada visual fue en un Pixel 7 emulado.
- **Las ranas asomadas usan posiciones absolutas** (tarjeta del juego, banner, avisos, invitar). Están revisadas a 412px y el ranking a 360px; en anchos menores a 360 la rana de la tarjeta del juego puede pisar el nombre del juego si es largo.
- **La rana con `animate` corre un `setTimeout` por instancia** para el parpadeo. En una lista larga de integrantes sin jugar son varias ranas dormidas, pero esas no parpadean ni saltan, así que no hay costo.
- **`scripts/frog-icons.ts` depende de `sharp`**, que llega como dependencia transitiva de Next; si Next dejara de traerlo habría que agregarlo a `devDependencies`.
- La notificación push de "te pasaron" (`src/lib/overtake.ts`) y el banner de Hoy calculan lo mismo por caminos distintos (el push en `/finish`, el banner con `finished_at`); coinciden hoy, pero son dos implementaciones.
- Este rediseño **no está publicado**: la app en `https://playus-lake.vercel.app` sigue con la interfaz anterior hasta el próximo `npx vercel deploy --prod`, y tampoco están publicadas las 8 correcciones de la prueba en teléfonos.

## Preguntas

- **Avatares en la invitación ("{A} y {B} ya están adentro"):** ¿autorizás una migración con una RPC `security definer` `invite_preview(code)` que devuelva nombre y avatar de hasta 5 integrantes? Sin eso no se puede.
- **Publicar:** ¿publico este rediseño junto con las correcciones anteriores?
- Sigue pendiente la decisión sobre **los tiempos del verde en reflejo** (opciones A, B o C del mensaje anterior).

## Siguiente paso propuesto

Publicar (rediseño más correcciones), probar en un Android y un iPhone el ícono, la instalación y las pantallas con las ranas asomadas, y con eso cerrar el estado de esta etapa y de las 6 y 7.
