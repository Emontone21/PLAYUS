# Reporte: semilla por intento (b): pepper del servidor y cierre de reflejo
Estado: completa
Fecha: 2026-09-27

## Qué hice

**Pepper.** La semilla de cada intento pasa a ser `hash(round.seed + ':' + attempt_number + ':' + SEED_PEPPER)`. `attemptSeed` (en `src/lib/deck.ts`) recibe el pepper como tercer parámetro y sigue siendo pura; `seedPepper()` (en `src/lib/seed-pepper.ts`, nuevo) lo lee de `process.env.SEED_PEPPER`: en producción, si falta o está vacío, lanza `SeedPepperMissingError`; en desarrollo y tests devuelve un fijo (`dev-pepper`). `/start` lo lee **antes** de tocar la base, así que sin pepper en producción responde `500 seed_pepper_missing` con el mensaje "falta SEED_PEPPER en el servidor: las partidas no pueden empezar hasta configurarla." y no consume ningún intento; `/finish` lo usa para llamar a `validate` con la misma semilla que recibió el juego. Cierra la salvedad del reporte anterior: la semilla de la ronda es legible por los integrantes vía RLS y el hash es público, y ahora eso no alcanza para calcular la del próximo intento.

**Dónde está el secreto.** En `.env.example` con la explicación (para qué es, cómo generarlo, que es obligatorio en producción y en los preview, y que no se cambia nunca salvo filtración, y si hay que hacerlo, justo después de medianoche); en el `.env.local` de esta máquina (generado hoy, 32 bytes al azar en base64url); y en Vercel como variable sensible en **producción y preview**, con el mismo valor. El valor no aparece en ningún reporte ni en el repo.

**Tests.** `deck.test.ts`: con distinto pepper, la misma ronda e intento dan otra semilla; y `seedPepper()` devuelve el fijo en `test` y `development` (incluso con la variable en blanco), devuelve la variable en producción, y lanza en producción sin ella o con ella vacía. `attempts.test.ts` (contra la base local): con `NODE_ENV=production` y `SEED_PEPPER` vacío, `startAttempt` rechaza con `seed_pepper_missing` y status 500 y **no** consume el intento (el contador sigue en 0); al restaurar el entorno, la misma llamada anda y la semilla coincide con `attemptSeed(round.seed, 1, seedPepper())`. Los tests anteriores de la semilla por intento pasaron a usar el pepper. El E2E `semilla.spec.ts` no cambió y sigue pasando.

**Reflejo, cerrado.** Anotado en `DECISIONS.md` (106) como opción B: los tiempos del verde quedan como están; con la semilla por intento, el segundo intento ya no repite el primero. Sale de las preguntas pendientes.

**Publicación.** `npm run build` y `npx vercel deploy --prod`. En **https://playus-lake.vercel.app**, con dos jugadores reales: `/start` respondió 200, los dos recibieron la misma semilla en el intento 1 y el primero otra en el intento 2, y ninguna aparecía en la página antes de tocar "jugar". Como la semilla ahora lleva el pepper, los valores son distintos de los del reporte anterior para la misma ronda (era lo esperado). El grupo que creé para verificarlo ("prueba pepper", 2 usuarios) lo borré en la misma corrida; quedan tus grupos "Sape", "Prueba Claude" y "Prueba Claude 2" con sus 5 usuarios. No hubo migraciones: la base no cambió.

## Archivos

- creados: `src/lib/seed-pepper.ts`: lectura del pepper, error claro en producción, fijo en desarrollo.
- creados: `reports/semilla-por-intento-b.md`: este reporte.
- modificados: `src/lib/deck.ts`: `attemptSeed(roundSeed, attemptNumber, pepper)`.
- modificados: `src/lib/attempts.ts`: `/start` lee el pepper antes de consumir y falla con `seed_pepper_missing`; `/finish` valida con él.
- modificados: `src/lib/deck.test.ts`, `src/lib/attempts.test.ts`: los tests del pepper.
- modificados: `.env.example`: `SEED_PEPPER` con la explicación. (`.env.local`, fuera del repo: el valor.)
- modificados: `README.md` y `src/games/README.md`: mención del secreto en la semilla.
- modificados: `DECISIONS.md`: decisiones 105 y 106.

## Decisiones nuevas

- **105. Un secreto del servidor (`SEED_PEPPER`) entra en la semilla de cada intento.** Obligatorio en producción y preview (sin él, `/start` falla claro y no consume el intento); fijo en desarrollo y tests. **No se cambia nunca salvo que se filtre**: cambiarlo a mitad de un día les da tableros distintos a los que juegan antes y después, y `validate` rechazaría las partidas en curso; si hay que cambiarlo, justo después de medianoche.
- **106. Reflejo queda como está (opción B).** Cerrado.

## Desvíos del plan o del brief

- Ninguno.

## Tests

- `npm test` (vitest): **49 de 49** (47 anteriores más 2 del pepper).
- `npm run e2e` contra `npm run dev` y Supabase local: **10 de 10** (`pwa.spec.ts` salteada a propósito en dev).
- `npx supabase test db`: **192 de 192** (sin cambios en la base).
- `npm run build`, `npm run typecheck`, `npm run lint`: sin errores.
- Producción: `/start` 200 con el pepper configurado; misma semilla entre jugadores, distinta entre intentos, ausente del HTML previo.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, dos ventanas en el mismo grupo, Hoy → "jugar" con DevTools → Network: `POST /api/rounds/…/start` responde 200 con `seed` y `attemptNumber: 1`, la misma `seed` en las dos.
2. Recargar una a mitad de partida y tocar "jugar": `attemptNumber: 2` y otra `seed`.
3. Para ver el error claro sin pepper: en Vercel, quitar `SEED_PEPPER` de producción y redesplegar (no lo hagas en serio; alcanza con el test de vitest, que lo simula): `/start` respondería `500 {"error":"seed_pepper_missing", …}` y "jugar" mostraría el mensaje en pantalla sin gastar intentos.

## Problemas y deuda

- **El pepper es un secreto más que cuidar.** Está en Vercel y en el `.env.local` de esta PC; conviene guardarlo en el mismo gestor de contraseñas que las claves VAPID. Si se pierde, se puede generar otro (las semillas no se guardan), pero solo justo después de medianoche.
- La unificación del cálculo de "te pasaron" sigue anotada como deuda.
- Sin verificar en teléfonos reales (sigue pendiente de la etapa Frog).
- Vercel sigue sin estar conectado a GitHub: cada publicación es un `npx vercel deploy --prod` a mano.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar en los dos teléfonos (lista del reporte de la etapa Frog) y después el primer juego real siguiendo `src/games/README.md`, que ya tiene las pautas y el contrato con la semilla por intento.
