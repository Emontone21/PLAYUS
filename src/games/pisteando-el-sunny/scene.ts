// El renderer 3D low-poly de "pisteando el sunny", con three. Este archivo es
// el único de la app que importa three, y el juego lo carga con import()
// dinámico: three no entra en el bundle de ninguna otra ruta (decisión 190).
//
// La simulación sigue siendo 2D (rules.ts): acá se lee su estado, interpolado
// entre ticks, y nunca se escribe. Mundo: x → X, y (pantalla, hacia abajo) →
// Z, así la ruta avanza hacia -Z; Y es la altura. Una unidad de simulación es
// una unidad de escena (4 por metro).

import * as THREE from "three";
import { CAR_HIT_R, FALL_MARGIN, OBSTACLE_KINDS, SUB, slipOf, type Course, type SimState } from "./rules";
import { cosA, sinA, TRIG_SCALE, ANGLES } from "./trig";
import { carPos, FALL_TICKS, SMOKE_LIFE, type Visuals } from "./visuals";

export const SKY_TOP = "#5FA8E6";
export const SKY_BOTTOM = "#C9E6FB";
export const SLATE = 0x4c5566;
export const SLATE_SIDE = 0x2f3644;
export const CAR_RED = 0xd62b2b;

/** el degradé del cielo va en CSS detrás del canvas transparente */
export const SKY_CSS = `linear-gradient(180deg, ${SKY_TOP} 0%, ${SKY_BOTTOM} 100%)`;

const RAD = (2 * Math.PI) / ANGLES;
/** grosor de la losa */
const SLAB = 6;

function toScene(x: number, y: number): [number, number] {
  return [x / SUB, y / SUB];
}

// ---------------------------------------------------------------------------
// la losa
// ---------------------------------------------------------------------------

/** un cuadrilátero (dos triángulos) con normal por cara */
function quad(out: number[], a: number[], b: number[], c: number[], d: number[]) {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

export function buildRoad(course: Course): THREE.Group {
  const top: number[] = [];
  const side: number[] = [];
  const lines: number[] = [];
  const dashes: number[] = [];
  const n = course.n;
  for (let i = 0; i < n; i++) {
    const [lx0, lz0] = toScene(course.lx[i]!, course.ly[i]!);
    const [rx0, rz0] = toScene(course.rx[i]!, course.ry[i]!);
    const [lx1, lz1] = toScene(course.lx[i + 1]!, course.ly[i + 1]!);
    const [rx1, rz1] = toScene(course.rx[i + 1]!, course.ry[i + 1]!);
    // la cara de arriba: el orden deja la normal hacia +Y (izquierda, derecha, y después adelante)
    quad(top, [lx0, 0, lz0], [rx0, 0, rz0], [rx1, 0, rz1], [lx1, 0, lz1]);
    // los costados, hasta -SLAB
    quad(side, [lx0, 0, lz0], [lx0, -SLAB, lz0], [lx1, -SLAB, lz1], [lx1, 0, lz1]);
    quad(side, [rx1, 0, rz1], [rx1, -SLAB, rz1], [rx0, -SLAB, rz0], [rx0, 0, rz0]);
    // líneas blancas en los bordes: una franja de 1 unidad hacia adentro
    const h = course.hs[i]!;
    const nx = cosA(h) / TRIG_SCALE;
    const nz = sinA(h) / TRIG_SCALE;
    quad(lines, [lx0, 0.06, lz0], [lx1, 0.06, lz1], [lx1 + nx, 0.06, lz1 + nz], [lx0 + nx, 0.06, lz0 + nz]);
    quad(lines, [rx0 - nx, 0.06, rz0 - nz], [rx1 - nx, 0.06, rz1 - nz], [rx1, 0.06, rz1], [rx0, 0.06, rz0]);
    // la línea amarilla discontinua al medio: 4 unidades sí, 4 no
    const dx = sinA(h) / TRIG_SCALE;
    const dz = -cosA(h) / TRIG_SCALE;
    const [ax, az] = toScene(course.vx[i]!, course.vy[i]!);
    const len = course.len[i]! / SUB;
    for (let s = 2; s + 4 < len; s += 8) {
      const x0 = ax + dx * s;
      const z0 = az + dz * s;
      const x1 = ax + dx * (s + 4);
      const z1 = az + dz * (s + 4);
      quad(dashes, [x0 - nx * 0.5, 0.06, z0 - nz * 0.5], [x1 - nx * 0.5, 0.06, z1 - nz * 0.5], [x1 + nx * 0.5, 0.06, z1 + nz * 0.5], [x0 + nx * 0.5, 0.06, z0 + nz * 0.5]);
    }
  }
  // la tapa del arranque
  {
    const [lx, lz] = toScene(course.lx[0]!, course.ly[0]!);
    const [rx, rz] = toScene(course.rx[0]!, course.ry[0]!);
    quad(side, [rx, 0, rz], [rx, -SLAB, rz], [lx, -SLAB, lz], [lx, 0, lz]);
  }
  const group = new THREE.Group();
  const mesh = (pos: number[], material: THREE.Material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  };
  group.add(mesh(top, new THREE.MeshLambertMaterial({ color: SLATE, side: THREE.DoubleSide })));
  group.add(mesh(side, new THREE.MeshLambertMaterial({ color: SLATE_SIDE, side: THREE.DoubleSide })));
  group.add(mesh(lines, new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide })));
  group.add(mesh(dashes, new THREE.MeshBasicMaterial({ color: 0xf2c94c, side: THREE.DoubleSide })));
  group.add(buildSigns(course));
  return group;
}

/** los carteles de metros cada 100 m, pintados en la losa */
function buildSigns(course: Course): THREE.Group {
  const g = new THREE.Group();
  const total = Math.floor(course.cum[course.n]! / (4 * SUB));
  for (let m = 100; m < total; m += 100) {
    const dist = m * 4 * SUB;
    let i = 0;
    while (i + 1 < course.n && course.cum[i + 1]! <= dist) i++;
    const rel = dist - course.cum[i]!;
    const h = course.hs[i]!;
    const x = (course.vx[i]! + Math.floor((rel * sinA(h)) / TRIG_SCALE)) / SUB;
    const z = (course.vy[i]! - Math.floor((rel * cosA(h)) / TRIG_SCALE)) / SUB;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#D8D8DC";
    ctx.font = "bold 44px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${m}`, 64, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = Math.min(course.hws[i]! / SUB, 14);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, w * 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = -h * RAD;
    plane.position.set(x, 0.07, z);
    g.add(plane);
  }
  return g;
}

// ---------------------------------------------------------------------------
// el sunny: sedán de tres volúmenes, rojo, sin logos
// ---------------------------------------------------------------------------

export interface CarModel {
  group: THREE.Group;
  /** la carrocería sola, para inclinarla al derrapar */
  body: THREE.Group;
  wheels: THREE.Mesh[];
}

export function buildCar(): CarModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: CAR_RED });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
  const glass = new THREE.MeshLambertMaterial({ color: 0x24303d });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xb8bcc4 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    return mesh;
  };
  // el volumen bajo: capó, puertas y baúl
  body.add(box(8.6, 3, 15.6, red, 0, 3.2, 0));
  // el baúl marcado: un escalón atrás
  body.add(box(8, 0.7, 3.6, red, 0, 4.95, 5.6));
  // la cabina, un poco hacia atrás, con los vidrios
  body.add(box(7.2, 2.7, 6.8, red, 0, 6.0, 0.6));
  body.add(box(7.3, 1.7, 5.2, glass, 0, 6.3, 0.6));
  // parabrisas y luneta (vidrio que asoma)
  body.add(box(6.6, 1.5, 0.5, glass, 0, 6.1, -2.95));
  body.add(box(6.6, 1.5, 0.5, glass, 0, 6.1, 4.15));
  // paragolpes
  body.add(box(9, 1.1, 0.9, dark, 0, 2.2, -7.9));
  body.add(box(9, 1.1, 0.9, dark, 0, 2.2, 7.9));
  // faros y luces
  const lamp = new THREE.MeshLambertMaterial({ color: 0xfff1b0, emissive: 0xffe58a, emissiveIntensity: 0.6 });
  const tail = new THREE.MeshLambertMaterial({ color: 0xff3b3b, emissive: 0xc41f1f, emissiveIntensity: 0.5 });
  body.add(box(1.8, 0.9, 0.4, lamp, -2.9, 3.4, -7.95));
  body.add(box(1.8, 0.9, 0.4, lamp, 2.9, 3.4, -7.95));
  body.add(box(2.2, 0.8, 0.4, tail, -2.8, 3.6, 7.95));
  body.add(box(2.2, 0.8, 0.4, tail, 2.8, 3.6, 7.95));
  // la parrilla, sin logo
  body.add(box(3.2, 0.7, 0.3, chrome, 0, 3.4, -7.95));
  group.add(body);
  // ruedas gorditas
  const wheels: THREE.Mesh[] = [];
  const tire = new THREE.MeshLambertMaterial({ color: 0x1b1b1f });
  const rim = new THREE.MeshLambertMaterial({ color: 0xc9ccd2 });
  for (const [x, z] of [
    [-4.5, -5],
    [4.5, -5],
    [-4.5, 5],
    [4.5, 5],
  ] as const) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 1.6, 10), tire);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 1.9, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.7, 8), rim);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);
    group.add(w);
    wheels.push(w);
  }
  return { group, body, wheels };
}

/** los obstáculos: conos naranjas y barriles, low-poly, sombreado plano */
export function buildObstacles(course: Course): { group: THREE.Group; hitboxes: THREE.Group } {
  const group = new THREE.Group();
  const hitboxes = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: 0xff7a1a, flatShading: true });
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4, flatShading: true });
  const drum = new THREE.MeshLambertMaterial({ color: 0x2f6fd6, flatShading: true });
  const band = new THREE.MeshLambertMaterial({ color: 0xe8e2c8, flatShading: true });
  const base = new THREE.MeshLambertMaterial({ color: 0x2a2f3a, flatShading: true });
  const ring = new THREE.LineBasicMaterial({ color: 0xff6f91 });
  const coneGeo = new THREE.ConeGeometry(OBSTACLE_KINDS[0].drawR, 5.5, 8);
  const coneBase = new THREE.BoxGeometry(OBSTACLE_KINDS[0].drawR * 2.2, 0.5, OBSTACLE_KINDS[0].drawR * 2.2);
  const coneStripe = new THREE.CylinderGeometry(OBSTACLE_KINDS[0].drawR * 0.62, OBSTACLE_KINDS[0].drawR * 0.78, 0.9, 8);
  const drumGeo = new THREE.CylinderGeometry(OBSTACLE_KINDS[1].drawR, OBSTACLE_KINDS[1].drawR, 6.4, 10);
  const drumBand = new THREE.CylinderGeometry(OBSTACLE_KINDS[1].drawR + 0.12, OBSTACLE_KINDS[1].drawR + 0.12, 0.7, 10);
  for (const o of course.obstacles) {
    const [x, z] = toScene(o.x, o.y);
    if (o.kind === 0) {
      const c = new THREE.Mesh(coneGeo, orange);
      c.position.set(x, 2.75, z);
      const b = new THREE.Mesh(coneBase, base);
      b.position.set(x, 0.25, z);
      const st = new THREE.Mesh(coneStripe, white);
      st.position.set(x, 3.3, z);
      group.add(c, b, st);
    } else {
      const d = new THREE.Mesh(drumGeo, drum);
      d.position.set(x, 3.2, z);
      const b1 = new THREE.Mesh(drumBand, band);
      b1.position.set(x, 1.6, z);
      const b2 = new THREE.Mesh(drumBand, band);
      b2.position.set(x, 4.8, z);
      group.add(d, b1, b2);
    }
    // la caja de choque: el círculo del obstáculo más el radio del auto, y el del obstáculo solo
    const r = (o.hitR + CAR_HIT_R * SUB) / SUB;
    for (const rr of [r, o.hitR / SUB]) {
      const pts: number[] = [];
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        pts.push(x + Math.cos(a) * rr, 0.5, z + Math.sin(a) * rr);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      hitboxes.add(new THREE.Line(g, ring));
    }
  }
  hitboxes.visible = false;
  return { group, hitboxes };
}

/** un pedazo de losa suelto, para la previa y el visor */
export function buildSlabPiece(w = 44, d = 64): THREE.Group {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, SLAB, d), new THREE.MeshLambertMaterial({ color: SLATE }));
  slab.position.y = -SLAB / 2;
  g.add(slab);
  const line = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  for (const x of [-w / 2 + 0.5, w / 2 - 0.5]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, d), line);
    l.position.set(x, 0.06, 0);
    g.add(l);
  }
  const dash = new THREE.MeshBasicMaterial({ color: 0xf2c94c });
  for (let z = -d / 2 + 2; z + 4 < d / 2; z += 8) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 4), dash);
    m.position.set(0, 0.06, z + 2);
    g.add(m);
  }
  return g;
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xdbeeff, 0x6b6f7a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-60, 120, 40);
  scene.add(sun);
}

function makeRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);
  return renderer;
}

function disposeAll(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// la escena de la partida
// ---------------------------------------------------------------------------

export interface RenderOptions {
  reduced: boolean;
  overlay: boolean;
  /** las cajas de choque de los obstáculos (solo desarrollo) */
  hitboxes?: boolean;
}

export interface GameScene {
  render(state: SimState, alpha: number, vis: Visuals, opts: RenderOptions): void;
  resize(): void;
  dispose(): void;
  readonly canvas: HTMLCanvasElement;
}

/** cámara fija en diagonal: atrás, a la derecha y arriba del auto, mirando adelante */
const CAM_OFFSET = new THREE.Vector3(28, 60, 66);
const LOOK_OFFSET = new THREE.Vector3(0, 0, -26);

export function createGameScene(container: HTMLElement, course: Course): GameScene {
  const renderer = makeRenderer(container);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(SKY_BOTTOM), 380, 820);
  const camera = new THREE.PerspectiveCamera(48, 1, 2, 1600);
  addLights(scene);
  const road = buildRoad(course);
  scene.add(road);
  const obstacles = buildObstacles(course);
  scene.add(obstacles.group, obstacles.hitboxes);
  const car = buildCar();
  scene.add(car.group);

  // marcas de goma: una cinta por rueda, de a cuadriláteros, con un buffer fijo
  const MAX_SEG = 800;
  const markGeo = new THREE.BufferGeometry();
  const markPos = new Float32Array(MAX_SEG * 6 * 3);
  markGeo.setAttribute("position", new THREE.BufferAttribute(markPos, 3));
  markGeo.setDrawRange(0, 0);
  const marks = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0x1a1a1e, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  // la geometría cambia lejos del origen: sin recorte por frustum (si no, three la cree fuera de cámara)
  marks.frustumCulled = false;
  scene.add(marks);
  let markCount = 0;
  let marksSeen = 0;
  const lastOf: ({ x: number; z: number } | null)[] = [null, null];

  // humo: bolitas low-poly instanciadas
  const SMOKE_N = 90;
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.55, depthWrite: false }), SMOKE_N);
  smoke.count = 0;
  smoke.frustumCulled = false;
  scene.add(smoke);
  const tmp = new THREE.Object3D();

  // depuración: el eje, el límite de caída y los vectores
  const overlay = new THREE.Group();
  {
    const axis: number[] = [];
    const left: number[] = [];
    const right: number[] = [];
    for (let j = 0; j <= course.n; j++) {
      const [x, z] = toScene(course.vx[j]!, course.vy[j]!);
      axis.push(x, 0.4, z);
      const [lx, lz] = toScene(course.mlx[j]!, course.mly[j]!);
      const [rx, rz] = toScene(course.mrx[j]!, course.mry[j]!);
      left.push(lx, 0.4, lz);
      right.push(rx, 0.4, rz);
    }
    const line = (pts: number[], color: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    };
    overlay.add(line(axis, 0x8edc66), line(left, 0xff6f91), line(right, 0xff6f91));
  }
  const vecGeo = (color: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
  };
  const headingLine = vecGeo(0x6fd3e0);
  const moveLine = vecGeo(0xff4fd8);
  headingLine.frustumCulled = false;
  moveLine.frustumCulled = false;
  overlay.add(headingLine, moveLine);
  overlay.visible = false;
  scene.add(overlay);

  const camAnchor = new THREE.Vector3();
  let camInit = false;
  let fallSpin = 0;

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const setVec = (line: THREE.Line, x: number, z: number, angle: number, len: number) => {
    const p = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    p.setXYZ(0, x, 4, z);
    p.setXYZ(1, x + (sinA(angle) / TRIG_SCALE) * len, 4, z - (cosA(angle) / TRIG_SCALE) * len);
    p.needsUpdate = true;
  };

  const render = (state: SimState, alpha: number, vis: Visuals, opts: RenderOptions) => {
    const a = state.end ? 1 : alpha;
    const pos = carPos(state, a);
    let cx = pos.x;
    let cz = pos.y;
    const falling = state.end?.reason === "caida" || state.end?.reason === "choque";
    const crashed = state.end?.reason === "choque";
    if (falling) {
      cx = vis.fallX / SUB;
      cz = vis.fallY / SUB;
    }
    // el auto
    const heading = falling ? vis.fallH : state.prevH + ((((state.h - state.prevH + 512) % 1024) + 1024) % 1024 - 512) * a;
    car.group.position.set(cx, falling ? -0.5 * 0.12 * vis.fallT * vis.fallT : 0, cz);
    car.group.rotation.set(0, -heading * RAD, 0);
    if (falling) {
      fallSpin += crashed ? 0.16 : 0.11;
      // el choque rebota: primero salta y gira sobre sí mismo, después cae
      car.group.rotation.x = fallSpin * (crashed ? 0.5 : 0.9);
      car.group.rotation.z = fallSpin * (crashed ? 1.1 : 0.6);
      if (crashed) car.group.position.y += Math.max(0, 6 - 0.35 * vis.fallT);
      car.group.visible = vis.fallT < FALL_TICKS;
    } else {
      fallSpin = 0;
      car.group.visible = true;
    }
    const slip = slipOf(state);
    car.body.rotation.z = opts.reduced || falling ? 0 : -slip * RAD * 0.35;
    car.body.rotation.x = opts.reduced || falling ? 0 : -0.02;
    const spin = ((state.v / SUB) * 0.5 * a) % (Math.PI * 2);
    for (const w of car.wheels) w.rotation.x = falling ? w.rotation.x : w.rotation.x + spin * 0.02;

    // marcas nuevas
    while (marksSeen < vis.marks.length && markCount < MAX_SEG) {
      const mk = vis.marks[marksSeen++]!;
      const [x, z] = toScene(mk.x, mk.y);
      const last = lastOf[mk.wheel];
      if (mk.start || !last) {
        lastOf[mk.wheel] = { x, z };
        continue;
      }
      const dx = x - last.x;
      const dz = z - last.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * 0.6;
      const nz = (dx / len) * 0.6;
      const o = markCount * 18;
      const y = 0.09;
      const v = [last.x - nx, y, last.z - nz, x - nx, y, z - nz, x + nx, y, z + nz, last.x - nx, y, last.z - nz, x + nx, y, z + nz, last.x + nx, y, last.z + nz];
      markPos.set(v, o);
      markCount++;
      lastOf[mk.wheel] = { x, z };
    }
    if (vis.marks.length < marksSeen) {
      // la lista se recortó: seguimos desde el final
      marksSeen = vis.marks.length;
    }
    (markGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    markGeo.setDrawRange(0, markCount * 6);

    // humo
    let k = 0;
    if (!opts.reduced) {
      for (const p of vis.smoke) {
        if (k >= SMOKE_N) break;
        const f = p.age / SMOKE_LIFE;
        tmp.position.set(p.x / SUB, 2.2 + f * 5, p.y / SUB);
        const s = 1.2 + f * 3.2;
        tmp.scale.set(s, s, s);
        tmp.rotation.set(f * 2, f * 3, 0);
        tmp.updateMatrix();
        smoke.setMatrixAt(k++, tmp.matrix);
      }
    }
    smoke.count = k;
    smoke.instanceMatrix.needsUpdate = true;

    // la cámara sigue al auto (con suavizado, salvo con prefers-reduced-motion) y no rota
    const target = new THREE.Vector3(pos.x, 0, pos.y);
    if (!camInit || opts.reduced) {
      camAnchor.copy(target);
      camInit = true;
    } else {
      camAnchor.lerp(target, 0.22);
    }
    camera.position.copy(camAnchor).add(CAM_OFFSET);
    camera.lookAt(camAnchor.clone().add(LOOK_OFFSET));

    overlay.visible = opts.overlay;
    obstacles.hitboxes.visible = !!opts.hitboxes;
    if (opts.overlay) {
      setVec(headingLine, pos.x, pos.y, state.h, 26);
      setVec(moveLine, pos.x, pos.y, state.m, 20);
    }
    renderer.render(scene, camera);
  };

  return {
    render,
    resize,
    canvas: renderer.domElement,
    dispose() {
      disposeAll(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// la previa (el sunny girando despacio sobre un pedazo de losa) y el visor
// ---------------------------------------------------------------------------

export interface Spinner {
  dispose(): void;
}

export function createPreview(container: HTMLElement, reduced: boolean): Spinner {
  const renderer = makeRenderer(container);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 500);
  addLights(scene);
  scene.add(buildSlabPiece(36, 52));
  const car = buildCar();
  car.group.rotation.y = 0.6;
  car.body.rotation.z = -0.12;
  scene.add(car.group);
  camera.position.set(34, 30, 40);
  camera.lookAt(0, 2, 0);
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) car.group.rotation.y += dt * 0.45;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  if (reduced) renderer.render(scene, camera);
  else raf = requestAnimationFrame(frame);
  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeAll(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** el visor del modelo con cámara libre (solo desarrollo) */
export async function createViewer(container: HTMLElement): Promise<Spinner> {
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
  const renderer = makeRenderer(container);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 500);
  addLights(scene);
  scene.add(buildSlabPiece(40, 60));
  const car = buildCar();
  scene.add(car.group);
  camera.position.set(30, 24, 36);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 3, 0);
  controls.update();
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  let raf = 0;
  const frame = () => {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeAll(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export { FALL_MARGIN };
