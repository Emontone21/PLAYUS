// El motor de física de "la torre": Rapier 2D en su versión determinística
// (WASM, paquete "compat", que trae el binario adentro en base64 y carga igual
// en Node y en el navegador). Se carga con import() dinámico solo en este
// juego. Acá vive lo que habla con el motor: el mundo con la base, los
// cuerpos de los cuatro objetos con sus formas compuestas, y la lectura del
// estado. El renderer solo lee lo que sale de acá; las reglas (rules.ts)
// deciden cuándo se agrega un cuerpo.
//
// Unidades: el mundo está en píxeles de arte (1 px = 1 cm), con la gravedad
// en px/s² y `lengthUnit` del tamaño típico de un objeto, que es como Rapier
// escala sus tolerancias y los umbrales de sueño.

import type RapierNs from "@dimforge/rapier2d-deterministic-compat";
import { SPECS, type Kind, type Piece } from "./objects";

export type Rapier = typeof RapierNs;
export type World = RapierNs.World;
export type RigidBody = RapierNs.RigidBody;

/** 981 cm/s² */
export const GRAVITY = -981;
export const TIMESTEP = 1 / 60;
/** el tamaño típico de un objeto, para las tolerancias del motor */
export const LENGTH_UNIT = 12;
/** amortiguación lineal y angular: las torres se asientan en vez de bambolearse (calibración, decisión 208) */
export const LIN_DAMPING = 0.5;
export const ANG_DAMPING = 2;
/** iteraciones del solver: el doble del default, para que las pilas altas no tiemblen */
export const SOLVER_ITERATIONS = 8;
/** rigidez de los contactos (Hz): con el default (30) una pila de doce vapos se hunde 5 px; con 120, medio px */
export const CONTACT_HZ = 120;
/** la base: una tabla de 60 px de ancho y 6 de espesor, con la cara de arriba en y = 0 */
export const BASE_W = 60;
export const BASE_THICK = 6;
export const BASE_FRICTION = 0.8;
/** un cuerpo cuyo centro baja de acá se cayó de la base */
export const FALL_Y = -14;

let loading: Promise<Rapier> | null = null;
/** carga el motor una sola vez (WASM); hay que esperarla antes de simular */
export function loadRapier(): Promise<Rapier> {
  if (!loading) {
    loading = import("@dimforge/rapier2d-deterministic-compat").then(async (mod) => {
      const R = ((mod as { default?: unknown }).default ?? mod) as Rapier;
      await R.init();
      return R;
    });
  }
  return loading;
}

export interface BodyRef {
  kind: Kind;
  body: RigidBody;
  /** la posición y el ángulo del paso anterior, para interpolar al dibujar */
  prevX: number;
  prevY: number;
  prevAngle: number;
}

export interface BodyState {
  kind: Kind;
  /** centro en píxeles, y hacia arriba */
  x: number;
  y: number;
  /** radianes, antihorario */
  angle: number;
  sleeping: boolean;
  /** el punto más alto del cuerpo (px) */
  top: number;
}

export function createWorld(R: Rapier): World {
  const world = new R.World({ x: 0, y: GRAVITY });
  world.timestep = TIMESTEP;
  world.integrationParameters.lengthUnit = LENGTH_UNIT;
  world.integrationParameters.numSolverIterations = SOLVER_ITERATIONS;
  world.integrationParameters.contact_natural_frequency = CONTACT_HZ;
  // la base: un cuerpo fijo
  const base = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -BASE_THICK / 2));
  world.createCollider(R.ColliderDesc.cuboid(BASE_W / 2, BASE_THICK / 2).setFriction(BASE_FRICTION).setRestitution(0), base);
  return world;
}

/** los vértices de una pieza, respecto del centro del objeto */
export function pieceVertices(p: Piece): [number, number][] {
  if (p.type === "box") {
    const hw = p.w / 2;
    const hh = p.h / 2;
    return [
      [p.cx - hw, p.cy - hh],
      [p.cx + hw, p.cy - hh],
      [p.cx + hw, p.cy + hh],
      [p.cx - hw, p.cy + hh],
    ];
  }
  return p.points.map(([x, y]) => [x, y]);
}

/** agrega un objeto como cuerpo dinámico en (x, y) px con rotación `rot` (de a 90°), sin velocidad */
export function addObject(R: Rapier, world: World, kind: Kind, x: number, y: number, rot: number): BodyRef {
  const spec = SPECS[kind];
  const angle = (rot * Math.PI) / 2;
  const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y).setRotation(angle).setCanSleep(true).setCcdEnabled(true).setLinearDamping(LIN_DAMPING).setAngularDamping(ANG_DAMPING);
  const body = world.createRigidBody(desc);
  for (const p of spec.pieces) {
    let cd: RapierNs.ColliderDesc;
    if (p.type === "box") {
      cd = R.ColliderDesc.cuboid(p.w / 2, p.h / 2).setTranslation(p.cx, p.cy);
    } else {
      const pts = new Float32Array(p.points.length * 2);
      p.points.forEach(([px, py], i) => {
        pts[i * 2] = px;
        pts[i * 2 + 1] = py;
      });
      const hull = R.ColliderDesc.convexHull(pts);
      if (!hull) throw new Error(`polígono inválido en ${kind}`);
      cd = hull;
    }
    cd.setDensity(spec.density).setFriction(spec.friction).setRestitution(0);
    world.createCollider(cd, body);
  }
  return { kind, body, prevX: x, prevY: y, prevAngle: angle };
}

/** el punto más alto de un objeto de tipo `kind` centrado en (x, y) y girado `angle` */
export function topOf(kind: Kind, x: number, y: number, angle: number): number {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let top = -Infinity;
  for (const p of SPECS[kind].pieces) {
    for (const [vx, vy] of pieceVertices(p)) {
      const wy = y + vx * s + vy * c;
      if (wy > top) top = wy;
    }
  }
  void x;
  return top;
}

/** el estado de un cuerpo, en píxeles */
export function stateOf(ref: BodyRef): BodyState {
  const t = ref.body.translation();
  const angle = ref.body.rotation();
  return { kind: ref.kind, x: t.x, y: t.y, angle, sleeping: ref.body.isSleeping(), top: topOf(ref.kind, t.x, t.y, angle) };
}

/** umbral de quietud: px/s y rad/s */
export const QUIET_LIN = 1.5;
export const QUIET_ANG = 0.08;

/** ¿este cuerpo está quieto? (dormido, o con velocidades por debajo del umbral) */
export function isQuiet(ref: BodyRef): boolean {
  if (ref.body.isSleeping()) return true;
  const v = ref.body.linvel();
  if (Math.abs(v.x) > QUIET_LIN || Math.abs(v.y) > QUIET_LIN) return false;
  return Math.abs(ref.body.angvel()) <= QUIET_ANG;
}

/** ¿todos los cuerpos están quietos? */
export function allQuiet(refs: readonly BodyRef[]): boolean {
  for (const r of refs) if (!isQuiet(r)) return false;
  return true;
}

/** el punto más alto de la torre (px desde la base), 0 si no hay nada */
export function towerTop(refs: readonly BodyRef[]): number {
  let top = 0;
  for (const r of refs) {
    const t = stateOf(r).top;
    if (t > top) top = t;
  }
  return top;
}

/** los vértices de cada pieza de un cuerpo, en el mundo (para la herramienta y el apuntado) */
export function worldPieces(ref: BodyRef): [number, number][][] {
  const t = ref.body.translation();
  const a = ref.body.rotation();
  const c = Math.cos(a);
  const s = Math.sin(a);
  return SPECS[ref.kind].pieces.map((p) => pieceVertices(p).map(([vx, vy]) => [t.x + vx * c - vy * s, t.y + vx * s + vy * c] as [number, number]));
}

/** guarda la posición actual como "anterior" (antes de dar el paso), para interpolar */
export function rememberPrev(refs: readonly BodyRef[]): void {
  for (const r of refs) {
    const t = r.body.translation();
    r.prevX = t.x;
    r.prevY = t.y;
    r.prevAngle = r.body.rotation();
  }
}

/** una foto bit a bit del mundo, para comparar Node con el navegador */
export function snapshot(refs: readonly BodyRef[]): string {
  return JSON.stringify(
    refs.map((r) => {
      const t = r.body.translation();
      const v = r.body.linvel();
      return [r.kind, t.x, t.y, r.body.rotation(), v.x, v.y, r.body.angvel(), r.body.isSleeping()];
    }),
  );
}
