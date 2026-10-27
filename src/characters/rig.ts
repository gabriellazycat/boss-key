import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { Face2D, type Expr } from './Face2D';

export type Action = 'idle' | 'walk' | 'jump' | 'sit';

// ------------------------------------------------------------------ materiais

let gradientMap: THREE.DataTexture | null = null;
/** Rampa de 4 tons suaves para o shading "toon" dos personagens. */
function toonRamp() {
  if (gradientMap) return gradientMap;
  const tones = [90, 160, 215, 255];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((t, i) => data.set([t, t, t, 255], i * 4));
  gradientMap = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.LinearFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

/** Material toon com rim light (contorno de luz) injetado no shader. */
export function toonMat(color: string, rim = '#fff3dd', rimStrength = 0.55) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
  m.userData.rim = { value: new THREE.Color(rim).multiplyScalar(rimStrength) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = m.userData.rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
         totalEmissiveRadiance += uRim * rimF;`,
      );
  };
  return m;
}

/** Toon com rim (o mesmo do jogo). */
export function mat(color: string, rim = 0.3) {
  return toonMat(color, '#fff3dd', rim);
}

export interface Band {
  /** Abaixo desta altura (espaço local da malha) a cor muda. */
  y: number;
  color: string;
  /** Decote em V na frente: profundidade e meia-largura. */
  v?: number;
  vw?: number;
}

/**
 * Toon com faixas de cor recortadas no shader (pele/camisa/calça, paletó com camisa em V).
 * As bordas saem nítidas e anti-serrilhadas, sem precisar de textura.
 */
export function paintMat(base: string, bands: Band[], rim = 0.3) {
  const m = mat(base, rim);
  const prev = m.onBeforeCompile;
  const B = [0, 1, 2].map((i) => bands[i] ?? { y: -999, color: base });
  const u = {
    uBY: { value: new THREE.Vector3(...B.map((b) => b.y)) },
    uBV: { value: new THREE.Vector3(...B.map((b) => b.v ?? 0)) },
    uBW: { value: new THREE.Vector3(...B.map((b) => b.vw ?? 1)) },
    uBC0: { value: new THREE.Color(B[0].color) },
    uBC1: { value: new THREE.Color(B[1].color) },
    uBC2: { value: new THREE.Color(B[2].color) },
  };
  m.userData.bands = [u.uBC0.value, u.uBC1.value, u.uBC2.value];
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalP;\nuniform vec3 uBY, uBV, uBW, uBC0, uBC1, uBC2;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 bc[3]; bc[0] = uBC0; bc[1] = uBC1; bc[2] = uBC2;
           for (int i = 0; i < 3; i++) {
             float vee = uBV[i] * max(0.0, 1.0 - abs(vLocalP.x) / uBW[i]) * smoothstep(-0.02, 0.06, vLocalP.z);
             float e = vLocalP.y - (uBY[i] - vee);
             float fw = max(fwidth(e), 1e-4);
             float a = 1.0 - smoothstep(-fw, fw, e);
             diffuseColor.rgb = mix(diffuseColor.rgb, bc[i], a);
           }
         }`,
      );
  };
  return m;
}

const outlineMats = new Map<string, THREE.MeshBasicMaterial>();
/** Contorno por casca invertida extrudada pela normal (funciona em qualquer forma suave). */
export function outlineMat(color: string, w = 0.011) {
  const key = `${color}|${w}`;
  let m = outlineMats.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const uW = { value: w };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOW = uW;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOW;')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uOW;');
  };
  outlineMats.set(key, m);
  return m;
}

/** Cor do contorno: o próprio tom, bem escuro (como no jogo). */
export function inkOf(color: string, k = 0.3) {
  return `#${new THREE.Color(color).multiplyScalar(k).getHexString()}`;
}

/** Malha com sombra e contorno. */
export function part(geo: THREE.BufferGeometry, m: THREE.Material, color?: string, w = 0.011) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  if (color !== undefined && w > 0) {
    const o = new THREE.Mesh(geo, outlineMat(inkOf(color), w));
    o.userData.outline = true;
    mesh.add(o);
  }
  return mesh;
}

/** Atalho: parte de cor única com contorno do próprio tom. */
export function solid(geo: THREE.BufferGeometry, color: string, w = 0.011, rim = 0.3) {
  return part(geo, mat(color, rim), color, w);
}

/**
 * Decalque do rosto: projeta um retângulo de frente sobre a malha-alvo (que deve estar com o
 * transform final relativo ao pai). A malha retornada vai no mesmo pai, sem transform.
 */
export function faceDecal(target: THREE.Mesh, face: Face2D, center: THREE.Vector3, w: number, h: number, depth: number) {
  target.updateMatrix();
  target.matrixWorld.copy(target.matrix);
  const geo = new DecalGeometry(target, center, new THREE.Euler(), new THREE.Vector3(w, h, depth));
  const m = toonMat('#ffffff', '#000000', 0);
  m.map = face.tex;
  m.transparent = true;
  m.depthWrite = false;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -4;
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = 2;
  return mesh;
}

// ------------------------------------------------------------------ emotes (balões 2D)

const EMOTE: Partial<Record<Expr, { txt: string; bg: string; fg: string }>> = {
  alert: { txt: '!', bg: '#ffd23f', fg: '#2a1d24' },
  clutch: { txt: '!!', bg: '#ff4d6d', fg: '#ffffff' },
  caught: { txt: '#@!', bg: '#2a1d24', fg: '#ff5a6e' },
  bored: { txt: '…', bg: '#ffffff', fg: '#6b7088' },
  happy: { txt: '♪', bg: '#7cf0b0', fg: '#1d4a35' },
  sleep: { txt: 'zZ', bg: '#c9d6ff', fg: '#2a2f6a' },
};

function emoteTexture(e: Expr) {
  const d = EMOTE[e];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  if (!d) return new THREE.CanvasTexture(c);
  g.translate(128, 120);
  // balão com rabinho
  g.fillStyle = d.bg;
  g.strokeStyle = '#1b1424';
  g.lineWidth = 12;
  g.lineJoin = 'round';
  g.beginPath();
  const r = 78;
  g.moveTo(-12, r - 6);
  g.lineTo(0, r + 34);
  g.lineTo(16, r - 8);
  g.arc(0, 0, r, Math.PI * 0.42, Math.PI * 0.42 + Math.PI * 1.9);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = d.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = d.txt.length > 2 ? 64 : d.txt.length > 1 ? 86 : 112;
  g.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
  g.fillText(d.txt, 0, e === 'bored' ? -14 : 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ o boneco

interface Limb {
  pivot: THREE.Group;
  side: number;
  /** Para colisão: distância ombro→mão e raios da mão e do braço. */
  info?: LimbInfo;
}

export interface LimbInfo {
  reach: number;
  hand: number;
  r: number;
}

/** Volume que os braços não atravessam (elipsoide ou caixa, no espaço de `space`). */
interface Collider {
  space: THREE.Object3D;
  c: THREE.Vector3;
  h: THREE.Vector3;
  box: boolean;
  toLocal: THREE.Matrix4;
  toTorso: THREE.Matrix4;
}

/** Peça solta com mola (orelha, rabo, gravata, antena): balança com o movimento e aceita uma pose. */
export interface Jiggle {
  obj: THREE.Object3D;
  base: THREE.Euler;
  side: number;
  amp: number;
  /** Rotação extra (x, y, z) definida pelo estilo, somada à base. */
  pose: THREE.Vector3;
  x: number;
  vx: number;
  z: number;
  vz: number;
}

/** Empurra `p` (espaço local do volume) para fora do volume inflado por `rad`. */
function pushOut(col: Collider, p: THREE.Vector3, rad: number) {
  const hx = col.h.x + rad, hy = col.h.y + rad, hz = col.h.z + rad;
  const dx = p.x - col.c.x, dy = p.y - col.c.y, dz = p.z - col.c.z;
  if (col.box) {
    const px = hx - Math.abs(dx), py = hy - Math.abs(dy), pz = hz - Math.abs(dz);
    if (px <= 0 || py <= 0 || pz <= 0) return false;
    if (px < py && px < pz) p.x = col.c.x + Math.sign(dx || 1) * hx;
    else if (py < pz) p.y = col.c.y + Math.sign(dy || 1) * hy;
    else p.z = col.c.z + Math.sign(dz || 1) * hz;
    return true;
  }
  const qx = dx / hx, qy = dy / hy, qz = dz / hz;
  const d = Math.hypot(qx, qy, qz);
  if (d >= 1) return false;
  if (d < 1e-5) p.z = col.c.z + hz;
  else p.set(col.c.x + (qx / d) * hx, col.c.y + (qy / d) * hy, col.c.z + (qz / d) * hz);
  return true;
}

/** Direções do braço (lado +x) por expressão, no espaço do tronco. */
const ARM: Record<Expr, THREE.Vector3> = {
  normal: new THREE.Vector3(0.22, -1, 0.02),
  alert: new THREE.Vector3(0.95, 0.45, 0.5),
  clutch: new THREE.Vector3(-0.5, 0.85, 0.9),
  caught: new THREE.Vector3(0.28, -1, -0.12),
  bored: new THREE.Vector3(0.06, -1, 0.04),
  happy: new THREE.Vector3(0.6, 1, 0.12),
  talk: new THREE.Vector3(0.25, -1, 0.1),
  sleep: new THREE.Vector3(0.12, -1, 0.06),
};
const DOWN = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _mi = new THREE.Matrix4();

/**
 * Rig procedural comum aos cinco estilos: tronco, pescoço/cabeça com mola, braços e pernas com poses
 * por expressão, andar, pulo, squash & stretch e balão de emote.
 */
export class Character {
  readonly root = new THREE.Group();
  readonly lift = new THREE.Group();
  readonly squash = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly arms: Limb[] = [];
  readonly legs: Limb[] = [];
  readonly faces: Face2D[] = [];
  /** Partes que giram junto com o olhar mas ficam fora da cabeça (ex.: rosto do feijão). */
  readonly spin: THREE.Group[] = [];
  expr: Expr = 'normal';
  action: Action = 'idle';
  /** Altura do topo da cabeça (para balão, enquadramento e plaquinha). */
  top = 1.3;
  /** Quanto a cabeça chacoalha (semibô: muito). */
  wobble = 1;
  /** Só gira a cabeça no eixo Y (feijão: o rosto é adesivo no corpo). */
  yawOnly = false;
  /** Pose de "mão no rosto" própria (proporções variam). */
  clutchArm: THREE.Vector3 | null = null;
  /** Atualizações extras do estilo (hélice, LED, sirene). */
  readonly tickers: ((dt: number, t: number) => void)[] = [];
  /** Volumes que os braços contornam (corpo, cabeça, focinho). */
  readonly colliders: Collider[] = [];
  readonly jiggles: Jiggle[] = [];
  /** Quanto o pescoço sobe por radiano de cabeça tombada pra frente (a cabeça não engole a gola). */
  pitchLift = 0;
  /** Quanto da cabeça caída por expressão vale neste estilo. */
  droopK = 1;
  /** Centro da cabeça (para chapéus, fones, coroa e textos acima dela) e seu raio aproximado. */
  readonly headAnchor = new THREE.Group();
  headR = 0.27;
  /** Altura do "assento" (fundo do corpo) em pé, para sentar na cadeira. */
  butt = 0.15;
  /** Cadência do passo (1 = normal). */
  walkRate = 1;
  /** Quais expressões mostram balão (null = todas). */
  emotes: Expr[] | null = null;
  /** Alvo do olhar em coordenadas de mundo. */
  readonly lookAt = new THREE.Vector3(0, 1.2, 5);
  private t = Math.random() * 10;
  private phase = 0;
  private walkAmt = 0;
  private sq = 0;
  private sqV = 0;
  private headRx = 0;
  private headRxV = 0;
  private headRz = 0;
  private headRzV = 0;
  private jumpT = 0;
  private lastLift = 0;
  private liftV = 0;
  private emote: THREE.Sprite;
  private emoteK = 0;
  private emoteV = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private neckY: number | null = null;
  private prevYaw = 0;

  constructor(readonly name: string, readonly scale = 1) {
    this.root.add(this.lift);
    this.lift.add(this.squash);
    this.squash.add(this.torso);
    this.torso.add(this.neck);
    this.neck.add(this.head);
    this.head.add(this.headAnchor);
    this.root.scale.setScalar(scale);
    this.emote = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    this.emote.renderOrder = 10;
    this.emote.visible = false;
    this.root.add(this.emote);
    // sombra de contato (bolha)
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.004;
    sh.renderOrder = 1;
    this.root.add(sh);
  }

  addArm(side: number, shoulder: THREE.Vector3, build: (pivot: THREE.Group) => LimbInfo | void) {
    const pivot = new THREE.Group();
    pivot.position.copy(shoulder);
    const info = build(pivot) ?? undefined;
    this.torso.add(pivot);
    this.arms.push({ pivot, side, info });
  }

  /** Volume no espaço de `space` (o tronco ou algo dentro da cabeça) que os braços contornam. */
  addCollider(space: THREE.Object3D, center: THREE.Vector3, half: THREE.Vector3, box = false) {
    this.colliders.push({ space, c: center, h: half, box, toLocal: new THREE.Matrix4(), toTorso: new THREE.Matrix4() });
  }

  addJiggle(obj: THREE.Object3D, side = 1, amp = 1): Jiggle {
    const j = { obj, base: obj.rotation.clone(), side, amp, pose: new THREE.Vector3(), x: 0, vx: 0, z: 0, vz: 0 };
    this.jiggles.push(j);
    return j;
  }

  /** Mantém o braço fora dos volumes: testa cotovelo e mão e gira o braço até sair. */
  private solveArm(a: Limb) {
    const info = a.info;
    if (!info) return;
    const dir = _d.set(0, -1, 0).applyQuaternion(a.pivot.quaternion);
    let moved = false;
    for (let it = 0; it < 3; it++) {
      let hit = false;
      for (const k of [0.55, 1]) {
        const rad = k === 1 ? info.hand : info.r;
        _p.copy(dir).multiplyScalar(info.reach * k).add(a.pivot.position);
        for (const col of this.colliders) {
          _l.copy(_p).applyMatrix4(col.toLocal);
          if (!pushOut(col, _l, rad)) continue;
          _p.copy(_l).applyMatrix4(col.toTorso);
          dir.copy(_p).sub(a.pivot.position).normalize();
          hit = moved = true;
        }
      }
      if (!hit) break;
    }
    if (moved) a.pivot.quaternion.setFromUnitVectors(DOWN, dir);
  }

  addLeg(side: number, hip: THREE.Vector3, build: (pivot: THREE.Group) => void) {
    const pivot = new THREE.Group();
    pivot.position.copy(hip);
    build(pivot);
    this.squash.add(pivot);
    this.legs.push({ pivot, side });
  }

  setExpr(e: Expr) {
    if (e === this.expr) return;
    this.expr = e;
    for (const f of this.faces) f.set(e);
    const kick: Partial<Record<Expr, number>> = { alert: 0.9, clutch: 0.6, caught: 1.1, happy: 0.7, talk: 0.25, bored: -0.25 };
    this.sqV += kick[e] ?? 0.2;
    this.headRxV += e === 'alert' ? -6 : e === 'caught' ? 8 : 3;
    const old = this.emote.material.map;
    this.emote.material.map = emoteTexture(e);
    this.emote.material.needsUpdate = true;
    old?.dispose();
    this.emote.visible = !!EMOTE[e] && (!this.emotes || this.emotes.includes(e));
    this.emoteK = 0;
    this.emoteV = 0;
  }

  impulse(a: number) {
    this.sqV += a;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const e = this.expr;
    const walking = this.action === 'walk';
    const sitting = this.action === 'sit';
    this.walkAmt += ((walking ? 1 : 0) - this.walkAmt) * Math.min(1, dt * 6);
    const w = this.walkAmt;
    this.phase += dt * 9.5 * (0.3 + w * 0.7) * this.walkRate;
    const ph = this.phase;

    // altura: andar quica, feliz saltita, pulo periódico
    let y = Math.abs(Math.sin(ph)) * 0.045 * w;
    if (e === 'happy') y += Math.abs(Math.sin(t * 7.5)) * 0.07;
    if (this.action === 'jump') {
      const prevJ = this.jumpT;
      this.jumpT = (this.jumpT + dt) % 1.5;
      const air = 0.62;
      const k = this.jumpT - 0.25;
      if (k > 0 && k < air) y += 4 * 0.5 * (k / air) * (1 - k / air);
      if (prevJ < 0.25 && this.jumpT >= 0.25) this.sqV += 2.6;
      if (prevJ < 0.25 + air && this.jumpT >= 0.25 + air) this.sqV -= 3.2;
      if (prevJ < 0.1 && this.jumpT >= 0.1) this.sqV -= 1.2;
    } else this.jumpT = 0;
    this.lift.position.y = y;
    const vy = (y - this.lastLift) / Math.max(dt, 1e-3);
    const ay = (vy - this.liftV) / Math.max(dt, 1e-3);
    this.lastLift = y;
    this.liftV = vy;

    // squash & stretch (mola)
    this.sqV += (-170 * this.sq - 10 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    let s = THREE.MathUtils.clamp(this.sq, -0.35, 0.45);
    s += Math.sin(t * (e === 'sleep' ? 1.6 : 2.4)) * (e === 'sleep' ? 0.025 : 0.012);
    if (e === 'clutch') s -= 0.06;
    this.squash.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    this.squash.position.x = e === 'clutch' ? Math.sin(t * 70) * 0.006 : 0;

    // tronco: inclina pra frente andando, cai no "pego", relaxa no tédio
    const lean = { normal: 0, alert: -0.14, clutch: 0.08, caught: 0.32, bored: 0.12, happy: -0.05, talk: 0.02, sleep: 0.14 }[e];
    this.torso.rotation.x += (lean + w * 0.07 + (sitting ? -0.06 : 0) - this.torso.rotation.x) * Math.min(1, dt * 8);
    this.torso.rotation.z = Math.sin(ph) * 0.035 * w + (e === 'bored' ? 0.05 : 0);
    this.torso.rotation.y = Math.sin(ph) * 0.06 * w;

    // olhar: cabeça segue parte do caminho, os olhos o resto
    this.torso.updateWorldMatrix(true, false);
    _v.copy(this.lookAt);
    this.neck.parent!.worldToLocal(_v);
    _v.sub(this.neck.position);
    const yaw = Math.atan2(_v.x, _v.z);
    const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    const busy = e === 'sleep' || e === 'caught';
    this.lookYaw += ((busy ? 0 : THREE.MathUtils.clamp(yaw, -0.9, 0.9)) - this.lookYaw) * Math.min(1, dt * 5);
    this.lookPitch += ((busy ? 0 : THREE.MathUtils.clamp(pitch, -0.5, 0.5)) - this.lookPitch) * Math.min(1, dt * 5);
    const droop = { normal: 0, alert: -0.12, clutch: 0, caught: 0.35, bored: 0.2, happy: -0.1, talk: Math.sin(t * 5) * 0.05, sleep: 0.38 }[e];
    const nodPitch = this.yawOnly ? 0 : -this.lookPitch * 0.55 + droop * this.droopK;
    this.neck.rotation.set(nodPitch, this.lookYaw * 0.6, (e === 'bored' ? 0.2 : e === 'sleep' ? 0.15 : 0) * this.droopK, 'YXZ');
    if (this.neckY === null) this.neckY = this.neck.position.y;
    this.neck.position.y = this.neckY + this.pitchLift * Math.max(0, Math.sin(nodPitch + this.headRx));
    for (const sp of this.spin) sp.rotation.y = this.lookYaw * 0.45;
    for (const f of this.faces) {
      f.lookX = THREE.MathUtils.clamp((this.lookYaw * (this.yawOnly ? 0.55 : 0.4)) / 0.5, -1, 1);
      f.lookY = THREE.MathUtils.clamp((-this.lookPitch * 0.8) / 0.4, -1, 1);
      f.update(dt);
    }

    // cabeça com mola: reage à aceleração vertical e ao balanço do passo
    const wob = this.wobble;
    const ax = THREE.MathUtils.clamp(-ay * 0.0016, -0.3, 0.3) * wob;
    this.headRxV += (-(this.headRx - ax) * 120 - this.headRxV * 9) * dt;
    this.headRx += this.headRxV * dt;
    const zt = Math.sin(ph + 0.6) * 0.05 * w * wob;
    this.headRzV += (-(this.headRz - zt) * 120 - this.headRzV * 9) * dt;
    this.headRz += this.headRzV * dt;
    this.head.rotation.set(THREE.MathUtils.clamp(this.headRx, -0.4, 0.4), 0, this.headRz);

    // peças soltas: atrasam em relação à cabeça, ao giro do olhar e ao quique
    const yawV = (this.lookYaw - this.prevYaw) / Math.max(dt, 1e-3);
    this.prevYaw = this.lookYaw;
    const dx = -this.headRxV * 0.05 + THREE.MathUtils.clamp(ay * 0.0012, -0.6, 0.6) + Math.sin(ph * 2) * 0.06 * w;
    const dz = -this.headRzV * 0.05 - yawV * 0.06 + Math.sin(ph) * 0.12 * w;
    for (const j of this.jiggles) {
      j.vx += ((dx - j.x) * 160 - j.vx * 7) * dt;
      j.x += j.vx * dt;
      j.vz += ((dz - j.z) * 160 - j.vz * 7) * dt;
      j.z += j.vz * dt;
      const x = THREE.MathUtils.clamp(j.x, -0.8, 0.8) * j.amp;
      const z = THREE.MathUtils.clamp(j.z, -0.8, 0.8) * j.amp;
      j.obj.rotation.set(j.base.x + j.pose.x + x, j.base.y + j.pose.y, j.base.z + j.pose.z + z * j.side);
    }

    // braços (contornando corpo e cabeça)
    if (this.colliders.length) {
      this.torso.updateWorldMatrix(true, true);
      _mi.copy(this.torso.matrixWorld).invert();
      for (const col of this.colliders) {
        col.toTorso.multiplyMatrices(_mi, col.space.matrixWorld);
        col.toLocal.copy(col.toTorso).invert();
      }
    }
    for (const a of this.arms) {
      let d: THREE.Vector3 = ARM[e];
      if (e === 'clutch' && this.clutchArm) d = this.clutchArm;
      _v.set(d.x * a.side, d.y, d.z);
      if (e === 'talk' && a.side > 0) _v.set(0.4, -0.15 + Math.sin(t * 4) * 0.25, 0.95);
      if (e === 'happy') _v.x += Math.sin(t * 9 + a.side) * 0.25 * a.side;
      // sentado e tranquilo: mãos no teclado, batucando
      if (sitting && (e === 'normal' || e === 'talk')) _v.set(0.16 * a.side, -0.42 + Math.max(0, Math.sin(t * 13 + a.side * 1.7)) * 0.12, 1);
      _v.normalize();
      _q.setFromUnitVectors(DOWN, _v);
      const swing = Math.sin(ph) * 0.65 * w * -a.side + (e === 'normal' ? Math.sin(t * 1.7 + a.side) * 0.04 : 0);
      _q2.setFromEuler(_e.set(swing, 0, 0));
      _q.premultiply(_q2);
      a.pivot.quaternion.slerp(_q, Math.min(1, dt * 12));
      if (this.colliders.length) this.solveArm(a);
    }
    // pernas
    for (const l of this.legs) {
      const swing = sitting ? -1.45 + Math.sin(t * 2 + l.side) * 0.05 : Math.sin(ph) * 0.6 * w * l.side;
      l.pivot.rotation.x += (swing - l.pivot.rotation.x) * Math.min(1, dt * 20);
    }

    // balão
    if (this.emote.visible) {
      this.emoteV += ((1 - this.emoteK) * 260 - this.emoteV * 13) * dt;
      this.emoteK += this.emoteV * dt;
      const k = Math.max(0, this.emoteK);
      this.emote.scale.setScalar(0.42 * k);
      this.emote.position.set(0.28, this.top + 0.22 + Math.sin(t * 3) * 0.03 + y, 0);
    }
    for (const fn of this.tickers) fn(dt, t);
  }
}

let blob: THREE.Texture | null = null;
function blobTex() {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(25,30,55,0.42)');
  gr.addColorStop(0.55, 'rgba(25,30,55,0.18)');
  gr.addColorStop(1, 'rgba(25,30,55,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  blob = new THREE.CanvasTexture(c);
  return blob;
}
