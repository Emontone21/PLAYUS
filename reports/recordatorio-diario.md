# Reporte: el texto del recordatorio diario
Estado: completo
Fecha: 2026-10-01

## Qué hice

Cambié el texto de la notificación que llega a la hora del grupo a quien todavía no jugó. El aviso de "te pasaron" no se tocó.

- **Título:** "frog". **Cuerpo:** uno de cuatro mensajes, copiados tal cual (sin corregir ortografía ni puntuación): "Bro que masa no has jugado hoy", "Vas a jugar bro o sos un sopa barbaro?", "Pari es hora de jugar dale" y "Juga Frog Juga Sabor". Viven en una sola lista, `REMINDER_MESSAGES` en `src/lib/reminders.ts`; para sumar o cambiar mensajes se toca solo ahí.
- **Variación:** el índice es (número de día de la fecha local del grupo + un hash corto del `profile_id`) módulo la cantidad de mensajes. Cada persona recibe un mensaje distinto cada día, recorre los cuatro en cuatro días seguidos y vuelve a empezar al quinto; dos personas del grupo no van en fase.
- **La condición no cambia:** solo se manda a quien activó los avisos y todavía no completó una partida ese día. El endpoint agrupa a los pendientes por mensaje y manda cada grupo (decisión 206).

## Archivos

- modificados: `src/lib/reminders.ts` (la lista, `reminderMessageIndex`, `reminderBodyFor`, `pendingProfiles`), `src/app/api/push/reminders/route.ts` (título y cuerpo nuevos), `src/lib/reminders.test.ts` y `src/lib/push.test.ts` (tests), `DECISIONS.md` (206).

## Tests

- `src/lib/reminders.test.ts`: los cuatro mensajes tal cual con el título "frog"; dos días seguidos la misma persona recibe mensajes distintos; en cuatro días seguidos recibe los cuatro (y al quinto vuelve a empezar); dos personas no van en fase; quien ya jugó no recibe nada.
- `src/lib/push.test.ts` (contra la base local, con el envío real interceptado): el endpoint manda a quien no jugó, una sola vez por día, y **la notificación de prueba sale con el título "frog" y uno de los cuatro textos nuevos** (el test lo comprueba y lo imprime; en esta corrida salió: "frog" / "Juga Frog Juga Sabor").
- `npm test`: 223 de 223. (El test de intentos contra la base local falló al principio porque el mazo del grupo de prueba ahora cae en "colgado del 121" y el resultado de ejemplo era más largo que el intento de prueba; se acortaron los de colgado y del sunny.) `npm run build`, `typecheck` y `lint`: limpios.

## Publicación

Publicado en https://playus-lake.vercel.app. El recordatorio sale desde el cron a la hora de cada grupo; desde esta sesión no hay cómo recibir uno en un teléfono, así que la confirmación es la del test de integración de arriba, que ejercita el endpoint real contra un receptor local.

## Cómo verificarlo

1. Con los avisos activados en el teléfono y sin haber jugado, esperar la hora del recordatorio del grupo: llega "frog" con uno de los cuatro textos. Al día siguiente, otro.
2. En local: `npx vitest run src/lib/push.test.ts` imprime el texto que salió en la notificación de prueba.

## Problemas y deuda

- No hay forma de ver una notificación real desde esta sesión (hace falta un teléfono con los avisos activados y la hora del grupo); la confirmación es la del test de integración, que ejercita el endpoint de verdad contra un receptor local.
