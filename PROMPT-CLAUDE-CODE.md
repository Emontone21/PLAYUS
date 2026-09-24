# Brief: app de minijuegos diarios en grupo (PWA)

Construí una PWA donde un grupo de amigos juega **un minijuego distinto cada día** y compite por el ranking del grupo. Todos los integrantes juegan exactamente el mismo juego, con la misma configuración, ese día.

**Alcance de esta fase: todo menos los juegos reales.** Vas a construir la app completa (auth, grupos, perfiles, rotación diaria, rankings, temporadas, PWA) y dos juegos de relleno deliberadamente triviales cuyo único propósito es demostrar que el contrato de juegos funciona. Los juegos de verdad llegan después. No inviertas tiempo en los juegos de relleno.

Antes de escribir código, leé este documento entero y armá un plan. Si algo queda ambiguo, elegí la opción más simple, seguí adelante y anotá la decisión en `DECISIONS.md`. No me hagas preguntas para arrancar.

---

## 1. Stack

- **Next.js 15** (App Router) + TypeScript estricto
- **Supabase**: Postgres, Auth, Row Level Security, Realtime
- **Tailwind CSS**
- **Serwist** para el service worker (no uses `next-pwa`, está sin mantenimiento)
- Deploy pensado para **Vercel**

Mobile first, siempre. Esta app se usa parada en el ómnibus con una mano. El escritorio es un caso secundario: centrá el contenido en una columna de máximo 480px y listo.

Zona horaria por defecto: `America/Montevideo`, configurable por grupo.

---

## 2. El contrato de juegos (la parte crítica)

Esta es la decisión de diseño más importante del proyecto. Un juego nuevo tiene que poder agregarse creando **un solo archivo** en `src/games/` y registrándolo en un índice. Nada más del sistema se toca.

```ts
// src/games/types.ts

export type ScoringDirection = 'high' | 'low'

export interface GameModule {
  /** slug estable, nunca cambia: queda guardado en la base */
  id: string
  name: string
  /** una línea, se muestra en la pantalla previa */
  tagline: string
  /** 2 o 3 instrucciones cortas */
  howTo: string[]
  /** duración fija de la partida en ms */
  durationMs: number
  /** 'high' = gana el puntaje más alto; 'low' = gana el más bajo (ej. tiempo de reacción) */
  scoring: ScoringDirection
  /** cota de plausibilidad para validación en servidor */
  maxPlausibleScore: number
  Component: React.ComponentType<GameProps>
}

export interface GameProps {
  /** determinístico: todos los del grupo reciben la misma semilla ese día */
  seed: string
  /** el juego avisa que terminó de cargar; recién ahí arranca el cronómetro */
  onReady: () => void
  /** el juego terminó por su cuenta (antes del límite de tiempo) */
  onFinish: (result: GameResult) => void
}

export interface GameResult {
  score: number
  /** traza mínima para validar en el servidor; el shape lo define cada juego */
  events: unknown[]
}
```

Reglas que el contrato tiene que respetar:

- **La semilla manda.** Todo lo aleatorio de un juego sale de `seed` vía un PRNG determinístico (implementá `mulberry32` o similar, no uses `Math.random()` dentro de un juego). Dos jugadores del mismo grupo el mismo día tienen que ver exactamente el mismo tablero.
- **El juego no sabe nada del resto de la app.** No conoce grupos, ni usuarios, ni rankings, ni la base de datos. Recibe `seed`, devuelve `score`. Nada más.
- **El cronómetro es del sistema, no del juego.** El contenedor muestra el tiempo restante y corta la partida cuando se acaba. El juego puede terminar antes llamando a `onFinish`.
- **El contenedor maneja** la pantalla previa (instrucciones + botón de empezar), el cronómetro, el corte por tiempo, el envío del puntaje y la pantalla de resultado.

Escribí `src/games/README.md` explicando cómo agregar un juego nuevo, con el archivo de relleno como ejemplo comentado.

### Juegos de relleno (temporales)

Dos, mínimos, feos, sin pulir:

1. **`tap-race`** — tocar la pantalla la mayor cantidad de veces en 15 segundos. `scoring: 'high'`.
2. **`reflejo`** — la pantalla cambia de color tras una espera aleatoria (derivada de la semilla), medís el tiempo de reacción en ms sobre 5 rondas y devolvés el promedio. `scoring: 'low'`.

Existen para probar que la rotación diaria, ambas direcciones de puntaje y la validación funcionan. Dejalos claramente marcados como temporales.

---

## 3. Modelo de datos

Postgres en Supabase. Escribí las migraciones en `supabase/migrations/`.

```
profiles
  id            uuid pk  → auth.users.id
  display_name  text
  avatar        jsonb     -- ver sección de perfiles
  created_at    timestamptz

groups
  id           uuid pk
  name         text
  invite_code  text unique       -- 6 caracteres, alfabeto sin ambigüedades (sin O/0/I/1/l)
  created_by   uuid → profiles
  timezone     text default 'America/Montevideo'
  max_attempts smallint default 3
  created_at   timestamptz

group_members
  group_id    uuid → groups
  profile_id  uuid → profiles
  role        text  -- 'owner' | 'member'
  nickname    text null    -- apodo solo dentro de este grupo
  joined_at   timestamptz
  primary key (group_id, profile_id)

seasons
  id         uuid pk
  group_id   uuid → groups
  number     int
  starts_on  date
  ends_on    date null
  winner_profile_id uuid null → profiles

rounds                         -- una ronda = un grupo, un día
  id         uuid pk
  group_id   uuid → groups
  season_id  uuid → seasons
  play_date  date
  game_id    text              -- slug del registry
  seed       text
  unique (group_id, play_date)

attempts
  id             uuid pk
  round_id       uuid → rounds
  profile_id     uuid → profiles
  attempt_number smallint
  status         text  -- 'in_progress' | 'completed' | 'abandoned'
  started_at     timestamptz
  finished_at    timestamptz null
  score          int null
  unique (round_id, profile_id, attempt_number)
```

**RLS obligatorio en todas las tablas.** Un usuario solo puede leer filas de grupos a los que pertenece. Un usuario solo puede escribir sus propios `attempts`. Escribí tests de las políticas: probá explícitamente que un usuario del grupo A no puede leer las rondas ni los puntajes del grupo B.

---

## 4. Rotación diaria

- Cada grupo tiene **una ronda por día**, creada de forma perezosa: la primera persona que abre la app ese día dispara la creación vía un `INSERT ... ON CONFLICT DO NOTHING` sobre `unique(group_id, play_date)`. Sin cron jobs, sin condiciones de carrera.
- El juego del día sale de un **mazo barajado por temporada**, no de una elección al azar día a día: barajá el registry completo con semilla `hash(group_id + season.number)`, repartí uno por día, volvé a barajar cuando se agota. Así ningún juego se repite hasta que pasaron todos.
- La semilla de la ronda es `hash(group_id + play_date + game_id)`.
- El día corta a las 00:00 en la zona horaria del grupo, no en UTC.
- **No se puede jugar una ronda pasada.** Si ayer no jugaste, perdiste. Esto es deliberado.

### Puntos y temporadas

Por ronda, se ordena a los jugadores por su mejor puntaje (respetando `scoring`) y se reparte: 10 / 7 / 5 / 3, y 1 punto para el resto de los que jugaron. Cero para el que no jugó. Empate: mismo puntaje, y se saltea el lugar siguiente.

Una temporada dura 30 días. Al cerrar, el que tiene más puntos queda marcado como campeón y aparece con una corona al lado del nombre durante la temporada siguiente. Arranca una temporada nueva automáticamente.

---

## 5. Antitrampas

Este es el defecto conocido de las apps de este tipo y hay que resolverlo desde el día uno: si el intento se cuenta al terminar, cerrás la app en medio de una mala partida y tenés intentos infinitos.

**El intento se consume al empezar, no al terminar.**

```
POST /api/rounds/:roundId/start
  → el servidor verifica que quedan intentos disponibles
  → crea attempts con status 'in_progress' y started_at = now()
  → devuelve { attemptId, seed, gameId, durationMs }

POST /api/attempts/:attemptId/finish
  body: { score, events }
  → rechaza si el attempt no existe, no es tuyo, o ya está finalizado
  → rechaza si (now - started_at) queda fuera de [durationMs - 2s, durationMs + 10s]
  → rechaza si score > maxPlausibleScore del juego
  → si pasa: status 'completed', guarda score
```

Un intento que queda `in_progress` más de 5 minutos se marca `abandoned` y **no se devuelve**. Recargar la página en medio de una partida cuesta el intento. Que el mensaje en la interfaz lo diga con todas las letras antes de la primera partida, para que nadie se sienta estafado.

El puntaje nunca se calcula en el cliente y se cree a ciegas: el servidor siempre revalida contra la cota del juego. Cuando los juegos reales entren, cada uno va a poder aportar su propio validador sobre `events`; dejá el punto de extensión preparado (`validate?: (result: GameResult, seed: string) => boolean` opcional en `GameModule`).

---

## 6. Autenticación e invitaciones

Cero fricción. El objetivo es que un amigo toque un link y esté adentro en menos de 15 segundos, sin contraseña, sin email, sin pantalla de registro.

1. Alguien abre `/g/ABC123` (link de invitación con el código del grupo).
2. Sesión anónima de Supabase, automática, sin que el usuario haga nada.
3. Una sola pantalla: nombre + armado de avatar.
4. Adentro.

Vinculación de email **opcional**, vía magic link, solo para no perder la cuenta al cambiar de teléfono. Que esté escondida en el perfil y que nunca bloquee nada. Nada de contraseñas, nunca.

El código de invitación se comparte como link y como código de 6 caracteres para dictar por voz. El botón de invitar usa la Web Share API cuando está disponible, con copiar al portapapeles como respaldo.

---

## 7. Perfiles

El avatar se construye con piezas, no se sube una foto: se renderiza como SVG desde el `jsonb`, sin almacenamiento de archivos, sin moderación, sin costo.

```json
{ "base": 3, "skin": "#C98A5E", "hair": 7, "hairColor": "#2B1D14",
  "eyes": 2, "mouth": 4, "accessory": null, "bg": "#FFC94A" }
```

Armá 6–8 opciones por categoría, todas como componentes SVG en el repo. El editor es una grilla de miniaturas, con vista previa en vivo arriba. Que se sienta rápido y que dé ganas de tocar.

Editable: nombre visible, avatar, apodo por grupo. El perfil de un integrante muestra su historial: rondas jugadas, victorias, mejor racha, temporadas ganadas, juego en el que mejor le va.

---

## 8. Pantallas

Tres pestañas en una barra inferior. Nada más.

**Hoy** — la pantalla principal, la que se abre por defecto.
- Si todavía no jugaste: el juego del día ocupa la parte de arriba de la pantalla, grande, con su nombre, las instrucciones y un botón de empezar. Los puntajes de los demás están tapados hasta que juegues (importante: si ves que alguien ya sacó 900, ni lo intentás).
- Si ya jugaste: el ranking del día, en vivo, con los intentos que te quedan.
- Después de cerrar: quién ganó el día.

**Grupo** — tabla de posiciones de la temporada, historial de días anteriores, lista de integrantes, botón de invitar. Si estás en varios grupos, un selector arriba.

**Perfil** — tu avatar, tus estadísticas, ajustes, notificaciones, vincular email.

Flujo de partida: instrucciones → cuenta regresiva de 3 → juego con cronómetro → resultado → ranking actualizado.

**Estados vacíos**: grupo recién creado con un solo integrante, ronda sin jugadores todavía, temporada sin historial. Escribilos como invitaciones a hacer algo, no como avisos de que no hay nada.

---

## 9. PWA

- `manifest.json` completo: `display: standalone`, `orientation: portrait`, íconos 192/512 más maskable, theme color, screenshots.
- Service worker con Serwist: cachea el esqueleto de la app y los assets. Los datos siempre van a la red; **nunca sirvas puntajes desde caché**. Pantalla de sin conexión decente.
- **Instalación**: capturá `beforeinstallprompt` en Android/Chrome y mostrá un botón propio. En iOS ese evento no existe, así que detectá Safari en iOS y mostrá instrucciones ilustradas de Compartir → Agregar a inicio. Esto no es opcional: en iPhone, sin instalar, no hay notificaciones.
- **Web Push** con VAPID: un recordatorio diario a una hora que elige cada grupo, más un aviso cuando alguien te pasa en el ranking. Pedí el permiso después de la primera partida, nunca al entrar.

---

## 10. Dirección visual

Partí de acá. Si tenés un argumento mejor, proponelo en `DECISIONS.md` antes de cambiarlo.

**Concepto**: pizarrón de campeonato de barrio. Contundente, saturado, plano. Sin degradados, sin sombras suaves, sin tarjetas redondeadas idénticas apiladas. El número del puntaje es el héroe de la pantalla y tiene que verse enorme.

**Paleta**

```
--fondo      #1B1A2E   índigo profundo
--superficie #26244A
--oro        #FFC94A   primer puesto, estado "te toca jugar"
--rosa       #FF5C8A   rachas, alertas, el que te pasó
--agua       #5BC0BE   confirmaciones, tu propia fila
--tinta      #F5F3FF   texto
```

**Tipografía**: Bricolage Grotesque 700/800 para puntajes, nombres y títulos, con tracking cerrado. Instrument Sans para el resto. Cifras tabulares en todo lo que sea número. Dos familias, no más.

**Estructura**: una columna. El ranking es una pila de filas con línea divisoria, no tarjetas. Tu propia fila va marcada con un borde izquierdo grueso en `--agua`. Los puestos se distinguen por peso tipográfico y color, no por medallas ni emojis.

**Movimiento**: un solo momento coreografiado, al revelar el puntaje: las filas del ranking se reordenan con una animación FLIP y la tuya se desplaza a su nuevo lugar. Nada más se anima. Respetá `prefers-reduced-motion`.

**Texto de la interfaz**: español rioplatense, voseo, en minúscula tipo oración. Directo y sin solemnidad. "Te quedan 2 intentos", no "Intentos restantes: 2". Los botones dicen qué hacen: "jugar", "invitar", "guardar cambios".

Evitá: fondo crema con serif de alto contraste y acento terracota; eyebrows en mayúsculas sobre cada título; flechitas → pegadas al texto de los botones; metadatos unidos con puntos medios; todo con el mismo `border-radius`.

---

## 11. Qué NO construir en esta fase

- Juegos reales (llegan después, de a uno)
- Monedas, tienda, compras, cualquier monetización
- Rankings globales o perfiles públicos: solo grupos privados
- Chat dentro de la app: para eso ya tienen WhatsApp
- Panel de administración
- Modo oscuro y claro: una sola paleta, la de arriba

---

## 12. Entregables

- Repo funcionando, con `README.md` que explique cómo levantarlo desde cero
- `.env.example` con todas las variables
- Migraciones de Supabase versionadas, más un seed con un grupo de prueba y 4 integrantes falsos con puntajes, para ver la app con datos
- `src/games/README.md`: cómo agregar un juego
- `DECISIONS.md`: cada decisión que tomaste por tu cuenta y por qué
- Tests: políticas RLS, cálculo de puntos con empates, consumo de intentos, rotación del mazo sin repetidos

**Listo cuando**: dos personas en dispositivos distintos pueden entrar por un link de invitación, armar su avatar, jugar el juego de relleno del día, ver el ranking actualizarse en vivo, y al día siguiente encontrar el otro juego automáticamente. Y cuando agregar un tercer juego sea crear un archivo en `src/games/` y sumar una línea al índice.

---

## Cómo trabajar

Andá por etapas y pará a mostrarme el resultado al final de cada una:

1. Esquema de base de datos, políticas RLS y tests de las políticas
2. Auth anónima, creación de grupo, invitación por link, incorporación de un integrante
3. Editor de avatar y perfiles
4. Contrato de juegos, contenedor de partida y los dos juegos de relleno
5. Rondas, intentos con la validación antitrampas, puntos, rankings, temporadas
6. Configuración PWA, instalación y notificaciones push
7. Pasada de diseño completa sobre todas las pantallas

No avances a la siguiente etapa hasta que la anterior corra de verdad en el navegador.
