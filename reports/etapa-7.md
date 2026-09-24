# Reporte: etapa 7 (pasada de diseño)
Estado: parcial
Fecha: 2026-09-24

## Qué hice

La pasada de diseño sobre todas las pantallas, siguiendo la dirección visual del brief: pizarrón de campeonato de barrio, contundente, saturado y plano. El estado es parcial por una sola razón: el criterio de la etapa pide que todas las pantallas pasen la revisión visual en un teléfono real, y acá solo pude revisarlas en capturas de un Pixel 7 emulado (viewport, fuentes y tamaños reales, pero no una pantalla física en la mano). Con esta etapa, las siete del brief están construidas; quedan pendientes de verificación en teléfonos reales la instalación y los push de la etapa 6 y la revisión visual de esta.

Tipografía. Bricolage Grotesque (700 y 800) e Instrument Sans (400, 600 y 700) entran por `next/font/google`, se sirven desde el propio dominio y no dependen de Google en tiempo de ejecución. Una clase `.display` (Bricolage 800, tracking cerrado, interlínea 0.95) va en puntajes, nombres y títulos; el resto es Instrument Sans. Cifras tabulares en todo (`font-variant-numeric` en el body). Dos familias, no más.

Sistema de clases. Las cadenas de clases repetidas (había 45 apariciones de `rounded-md` con variantes de botón, input y nota) se reemplazaron por un sistema chico en `globals.css` con `@apply`: `btn-primary`, `btn-primary-sm`, `btn-secondary`, `btn-secondary-sm`, `btn-quiet`, `input`, `input-sm`, `note`, `note-alert`, `note-ok`, `panel`, `chip`, `eyebrow`, `display`, `display-bold`. Con eso, los radios dejaron de ser todos iguales: el CTA principal es la única forma muy redondeada, los botones secundarios e inputs tienen un radio chico, los chips son redondos, y los bloques de texto (notas, avisos, paneles) son planos, sin radio.

Ranking. Pila de filas con línea divisoria, no tarjetas. Tu fila va con el borde izquierdo grueso en agua. El puntaje es el número grande de la fila (display 4xl), con la unidad chica al lado y los puntos que suma (+10) más chicos aún; en la pantalla de resultado ocupa 7rem. Los puestos se distinguen por peso y color: el 1º en oro y más pesado, 2º y 3º en tinta, el resto en tinta suave. Sin medallas ni emojis; la única marca es la corona del campeón, que pide el brief.

Movimiento. Un solo momento coreografiado: al volver de una partida, la URL trae `?reveal=1` y `RankingReveal` muestra el ranking como estaba (tu fila en el puesto que tenías antes de jugar, guardado en `sessionStorage` al entrar a la partida, o abajo de todo si es tu primera), espera 700 ms, mide dónde está cada fila, cambia al orden real y anima el desplazamiento con FLIP (600 ms, curva suave). Con `prefers-reduced-motion` no hay animación: se muestra el orden final directo, y además un `@media` global anula cualquier transición. Después del reveal, las filas que llegan por el refresco en vivo se toman tal cual (esto lo destapó la suite E2E: la primera versión no sincronizaba el estado con las filas nuevas y el ranking en vivo dejaba de actualizarse; está corregido y cubierto).

Copia. Revisada pantalla por pantalla: voseo y minúscula tipo oración en todo, los botones dicen qué hacen ("jugar", "invitar", "guardar cambios", "activar avisos"), y los estados vacíos son invitaciones ("todavía nadie jugó hoy. sé quien abre el ranking.", "un grupo de uno no tiene ranking. mandale el link a alguien y se arma.", "la tabla arranca cuando cierre el primer día jugado."). De la lista de evitá: sin fondo crema ni serif; sin eyebrows en mayúsculas (las etiquetas de sección son minúscula en tinta suave); sin flechitas en los botones ni en los links de volver ("volver", "volver al perfil"); sin metadatos unidos con puntos medios (ahora son frases: "los del barrio, jue 24 set", "tu mejor: 286 ms. te quedan 2 intentos."; el "N×1º" de la tabla pasó a "1 victoria" / "2 victorias"; el rango de la temporada es "del jue 24 set al vie 23 oct"); y radios distintos según la pieza.

Verificación. Capturas de todas las pantallas en un Pixel 7 emulado (landing, alta con el editor de avatar, Hoy sin jugar, pantalla previa de la partida, resultado, ranking, Grupo con tabla e historial, Perfil, y el reveal antes y después de la animación). La suite E2E completa pasa (8 pruebas contra dev; la de PWA se saltea en dev), más vitest (37), pgTAP (171), typecheck, lint y build con las fuentes.

## Archivos

- creados: `src/components/ranking-reveal.tsx`: la animación FLIP del ranking al revelar el puntaje, con `prefers-reduced-motion` y sincronización con el refresco en vivo.
- creados: `reports/etapa-7.md`: este reporte.
- modificados: `src/app/globals.css`: variables de fuentes, tokens, sistema de clases, `@media (prefers-reduced-motion)`.
- modificados: `src/app/layout.tsx`: Bricolage Grotesque e Instrument Sans vía `next/font/google`.
- modificados: `src/lib/time.ts`: `formatShortDate` sin la coma de Intl ("jue 24 set").
- modificados: `src/app/(app)/hoy/page.tsx`: usa `RankingReveal`, lee `?reveal=1`, copia sin puntos medios.
- modificados: `src/app/(app)/hoy/jugar/page.tsx` y `play.tsx`: guardan el puesto previo y vuelven con `?reveal=1`.
- modificados: `src/app/(app)/grupo/page.tsx`: "N victorias", rango de fechas en prosa, historial en frases.
- modificados: `src/components/ranking.tsx`: puntaje en display, detalle sin ancho fijo, fondo en las filas (para el FLIP).
- modificados (clases del sistema, display y copia): `src/app/page.tsx`, `src/app/crear/create-flow.tsx`, `src/app/g/[code]/join-flow.tsx`, `src/app/~offline/page.tsx`, `src/app/(app)/grupo/group-switcher.tsx`, `reminder-time.tsx`, `integrante/[id]/page.tsx`, `src/app/(app)/perfil/page.tsx`, `nicknames.tsx`, `link-email.tsx`, `editar/profile-editor.tsx`, `src/avatar/editor.tsx`, `src/components/avatar.tsx` (sin cambios de API), `code-form.tsx`, `install-card.tsx`, `invite-button.tsx`, `onboarding-form.tsx`, `profile-stats.tsx`, `push-card.tsx`, `tab-bar.tsx`, `src/games/container.tsx`, `src/games/tap-race.tsx`, `src/app/dev/juego/[id]/page.tsx`.
- modificados: `README.md` (sección de diseño, estado) y `DECISIONS.md` (decisiones 75 a 81).

## Decisiones nuevas

75. Fuentes con `next/font/google`, servidas desde el propio dominio; `.display` para puntajes, nombres y títulos. Dos familias.
76. Un sistema de clases chico en `globals.css` con `@apply`, en lugar de cadenas repetidas en 45 lugares.
77. Radios distintos según la pieza: CTA muy redondeado, secundarios e inputs con radio chico, chips redondos, bloques de texto planos.
78. Sin puntos medios ni flechas; metadatos como frases; etiquetas de sección en minúscula.
79. La animación FLIP vive en `RankingReveal`, disparada por `?reveal=1`, con el puesto previo en `sessionStorage`, `prefers-reduced-motion` respetado, y sincronizada con el refresco en vivo.
80. El puntaje es el héroe: 7rem en el resultado, display 4xl en las filas; puestos por peso y color; la corona es la única marca.
81. La revisión en un teléfono real queda pendiente; acá se revisó en capturas de un Pixel 7 emulado.

## Desvíos del plan o del brief

- El criterio de la etapa (revisión visual en un teléfono real) no se pudo cumplir desde este entorno; de ahí el estado parcial.
- Las fuentes se descargan en el build; un entorno de build sin salida a Google Fonts fallaría. Si pasa, el plan B es `next/font/local` con los archivos en el repo (no hizo falta: acá bajaron bien).

## Tests

```
npm run typecheck   → sin errores
npm run lint        → sin errores
npm run build       → compila (fuentes descargadas por next/font, sw.js generado)
npm test            → 7 archivos, 37 tests, 37 pasan (con el emulador levantado)
scripts/db-test-local.sh → 6 archivos, 171 aserciones pgTAP, todas pasan
npm run e2e (dev)   → 8 pasan, 1 salteada (la de PWA, que corre solo contra un build)
```

## Cómo verificarlo en el navegador

1. Levantar la app (README) y abrirla en un teléfono de verdad (o en Chrome con el modo dispositivo). Con `npm run build && npm run start` se ven las fuentes y el service worker como en producción.
2. Landing: título en Bricolage pesado, CTA amarillo muy redondeado, input de código con radio chico.
3. Alta: el editor de avatar con chips redondos y miniaturas; el botón "seguir".
4. Hoy sin jugar: "el juego de hoy" en oro como etiqueta, el nombre del juego enorme, pasos numerados en oro, "jugar", "te quedan 3 intentos", y el estado vacío como invitación.
5. Jugar: pantalla previa, cuenta regresiva en oro gigante, partida con el cronómetro en display, resultado con el puntaje a 7rem.
6. Al tocar "listo": el ranking aparece con tu fila donde estaba (o abajo) y en menos de un segundo se desliza a su lugar. Con "reducir movimiento" activado en el sistema, aparece directo en su lugar.
7. Ranking: filas con línea divisoria, tu fila con el borde izquierdo en agua, el 1º en oro, puntaje grande con "+10" chico al lado. Nada de tarjetas ni medallas.
8. Grupo: tabla con "pts" y "1 victoria", "del jue 24 set al vie 23 oct", historial en frases; Perfil: números en display, notas planas.
9. Buscar en toda la app: ninguna mayúscula de eyebrow, ninguna flecha en botones, ningún punto medio, ningún degradado ni sombra.

## Problemas y deuda

- Revisión en teléfono real pendiente (ver arriba). En particular conviene mirar en un iPhone la altura de la barra inferior con el `safe-area-inset` y el tamaño del CTA.
- Los juegos de relleno siguen feos a propósito; solo recibieron las clases del sistema en el contenedor. Los juegos reales van a necesitar su propia pasada.
- La pantalla de desarrollo `/dev/juego` y `/dev/hoy` quedaron fuera de la pasada (no las ve nadie más que quien desarrolla).
- `RankingReveal` anima solo `translateY`; si el ranking cambia de largo durante el reveal (alguien termina justo en ese segundo), la fila nueva aparece sin animación. Es un caso raro y el resultado es correcto.
- El "1 Issue" que muestra el badge de Next en desarrollo en alguna captura es la herramienta de desarrollo; no hay errores de consola en las pantallas (verificado con Playwright en la landing).

## Preguntas

- ¿Podés hacer la revisión visual en un Android y un iPhone reales (y de paso la instalación y los push de la etapa 6)? Con eso, las etapas 6 y 7 pasan a completas y el proyecto queda cerrado según el brief.

## Siguiente paso propuesto

No hay etapa 8 en el plan. Lo que sigue depende de la verificación en teléfonos: si aparece algo, se ajusta; si no, el siguiente trabajo es el primer juego real (un archivo en `src/games/` y una línea en el índice, según `src/games/README.md`) y la primera corrida contra Supabase real con Docker, que sigue pendiente desde la etapa 2.
