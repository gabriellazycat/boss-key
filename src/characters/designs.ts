import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Face2D, type FaceSpec } from './Face2D';
import { decodeLive } from '../core/liveTexture';
import { Character, faceDecal, mat, paintMat, part, solid, type Band, type Jiggle, type LimbInfo } from './rig';

export type Role = 'x9' | 'voce' | 'bia' | 'caio' | 'chefe' | 'dono';

export const ROLES: { id: Role; label: string; job: string }[] = [
  { id: 'x9', label: 'X9', job: 'dedo-duro' },
  { id: 'voce', label: 'Você', job: 'estagiário' },
  { id: 'bia', label: 'Bia', job: 'marketing' },
  { id: 'caio', label: 'Caio', job: 'TI' },
  { id: 'chefe', label: 'Chefe', job: 'gerente' },
  { id: 'dono', label: 'Dono', job: 'sexta-feira' },
];

/** Identidade de cor do elenco (a mesma do jogo). */
const ID: Record<Role, { c: string; tie: string; shirt: string; pants: string }> = {
  voce: { c: '#ff8a3d', tie: '#2F5FA8', shirt: '#dfeaff', pants: '#2f3a5a' },
  bia: { c: '#ff7eb6', tie: '#7A5BC0', shirt: '#fff3d9', pants: '#4a3a6a' },
  caio: { c: '#4da3ff', tie: '#E6C43A', shirt: '#f2f2ee', pants: '#3a3f4a' },
  x9: { c: '#9be36a', tie: '#ffd23f', shirt: '#fffbe8', pants: '#5a5240' },
  chefe: { c: '#6e1a30', tie: '#d4283c', shirt: '#f4f2ec', pants: '#262a3c' },
  dono: { c: '#24242e', tie: '#D4AF37', shirt: '#f4f2ec', pants: '#0e0e14' },
};
const SUIT: Partial<Record<Role, string>> = { chefe: '#2b2f45', dono: '#121218' };
const SCALE: Record<Role, number> = { x9: 0.84, voce: 1, bia: 1, caio: 1, chefe: 1.3, dono: 1.48 };
const isBoss = (r: Role) => r === 'chefe' || r === 'dono';

// ------------------------------------------------------------------ peças comuns

function tie(color: string, s = 1) {
  const g = new THREE.Group();
  const m = mat(color, 0.2);
  const knot = part(new THREE.SphereGeometry(0.034 * s, 14, 10), m, color, 0.005);
  knot.scale.set(1.15, 0.9, 0.7);
  const sh = new THREE.Shape();
  sh.moveTo(-0.026 * s, 0);
  sh.lineTo(0.026 * s, 0);
  sh.lineTo(0.052 * s, -0.17 * s);
  sh.lineTo(0, -0.235 * s);
  sh.lineTo(-0.052 * s, -0.17 * s);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3 });
  const blade = part(geo, m, color, 0.004);
  blade.position.set(0, -0.022 * s, -0.012);
  g.add(knot, blade);
  return g;
}

function collar(color = '#fbfaf5', s = 1) {
  const g = new THREE.Group();
  const m = mat(color, 0.2);
  for (const side of [-1, 1]) {
    const c = part(new THREE.ConeGeometry(0.045 * s, 0.09 * s, 3), m, color, 0.004);
    c.position.set(side * 0.045 * s, 0.005, 0);
    c.rotation.set(0.35, 0, side * 2.25);
    g.add(c);
  }
  return g;
}

const badgeTex = new Map<string, THREE.Texture>();
/** Crachá: cartão com foto e nome. */
function badge(color: string) {
  let t = badgeTex.get(color);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fbfaf5';
    g.fillRect(0, 0, 96, 128);
    g.fillStyle = '#2F5FA8';
    g.fillRect(0, 0, 96, 30);
    g.fillStyle = '#ffffff';
    g.font = '700 20px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText('BK', 48, 23);
    g.fillStyle = color;
    g.beginPath();
    g.arc(48, 62, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9ccd6';
    g.fillRect(18, 92, 60, 8);
    g.fillRect(26, 106, 44, 6);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    badgeTex.set(color, t);
  }
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.096, 0.006), [
    mat('#e9e6dc'), mat('#e9e6dc'), mat('#e9e6dc'), mat('#e9e6dc'),
    new THREE.MeshToonMaterial({ map: t }), mat('#e9e6dc'),
  ]);
  card.castShadow = true;
  card.position.y = -0.06;
  const clip = solid(new THREE.BoxGeometry(0.022, 0.03, 0.01), '#9aa3b8', 0);
  clip.position.y = -0.006;
  g.add(card, clip);
  return g;
}

function tuft(color: string, s = 1) {
  const g = new THREE.Group();
  const m = mat(color);
  for (let i = 0; i < 3; i++) {
    const leaf = part(new THREE.ConeGeometry(0.045 * s, 0.17 * s, 10), m, color, 0.008);
    leaf.position.set((i - 1) * 0.05 * s, 0.06 * s, 0.02);
    leaf.rotation.set(0.25, 0, (i - 1) * -0.5);
    g.add(leaf);
  }
  return g;
}

function bun(color: string, band: string, s = 1) {
  const g = new THREE.Group();
  const b = solid(new THREE.SphereGeometry(0.11 * s, 20, 14), color);
  b.position.set(0, 0.08 * s, -0.05 * s);
  const r = solid(new THREE.TorusGeometry(0.075 * s, 0.022 * s, 8, 20), band);
  r.rotation.x = Math.PI / 2 + 0.35;
  r.position.set(0, 0.0, -0.04 * s);
  g.add(b, r);
  return g;
}

function bow(color: string, s = 1) {
  const g = new THREE.Group();
  const m = mat(color);
  for (const sd of [-1, 1]) {
    const lobe = part(new THREE.SphereGeometry(0.075 * s, 16, 12), m, color, 0.008);
    lobe.scale.set(1.25, 0.8, 0.55);
    lobe.position.set(sd * 0.08 * s, 0, 0);
    lobe.rotation.z = sd * 0.25;
    g.add(lobe);
  }
  const knot = part(new THREE.SphereGeometry(0.038 * s, 12, 10), m, color, 0.008);
  g.add(knot);
  return g;
}

/** Boné virado pra trás. */
function cap(color: string, r: number) {
  const g = new THREE.Group();
  const m = mat(color);
  const dome = part(new THREE.SphereGeometry(r * 1.04, 28, 14, 0, Math.PI * 2, 0, 1.1), m, color, 0.009);
  const bill = part(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.02, 24, 1, false, -Math.PI / 2, Math.PI), m, color, 0.006);
  bill.position.set(0, r * 0.47, -r * 0.82);
  bill.rotation.set(-0.2, Math.PI, 0);
  const btn = solid(new THREE.SphereGeometry(0.022, 10, 8), color);
  btn.position.y = r * 1.03;
  g.add(dome, bill, btn);
  return g;
}

/** Boné de hélice do X9 (identidade do personagem no jogo). */
function propCap(ch: Character, r: number) {
  const g = new THREE.Group();
  const capA = part(new THREE.SphereGeometry(r * 1.03, 24, 12, 0, Math.PI * 2, 0, 1.0), mat('#ff4d6d'), '#ff4d6d', 0.008);
  const capB = part(new THREE.SphereGeometry(r * 1.035, 24, 12, 0, Math.PI / 2, 0, 1.0), mat('#4da3ff'), '#4da3ff', 0);
  const capC = capB.clone();
  capC.rotation.y = Math.PI;
  const stem = solid(new THREE.CylinderGeometry(0.012, 0.012, 0.09), '#444650', 0);
  stem.position.y = r * 1.03 + 0.04;
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = solid(new THREE.BoxGeometry(0.19, 0.012, 0.05), '#ffd23f', 0.005);
    b.position.x = 0.095;
    const h = new THREE.Group();
    h.rotation.y = (i / 3) * Math.PI * 2;
    h.add(b);
    blades.add(h);
  }
  blades.position.y = r * 1.03 + 0.085;
  g.add(capA, capB, capC, stem, blades);
  ch.tickers.push((dt) => (blades.rotation.y += dt * 14));
  return g;
}

function topHat(s = 1) {
  const g = new THREE.Group();
  const m = mat('#121218', 0.35);
  const brim = part(new THREE.CylinderGeometry(0.27 * s, 0.27 * s, 0.022 * s, 32), m, '#121218', 0.008);
  const top = part(new THREE.CylinderGeometry(0.17 * s, 0.18 * s, 0.3 * s, 32), m, '#121218', 0.008);
  top.position.y = 0.16 * s;
  const band = solid(new THREE.CylinderGeometry(0.182 * s, 0.182 * s, 0.05 * s, 32), '#D4AF37', 0, 0.5);
  band.position.y = 0.045 * s;
  g.add(brim, top, band);
  g.rotation.z = 0.12;
  return g;
}

function antenna(ch: Character, color: string) {
  const g = new THREE.Group();
  const stick = solid(new THREE.CylinderGeometry(0.01, 0.012, 0.16), '#3b3f4a', 0);
  stick.position.y = 0.08;
  const bulbM = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), bulbM);
  bulb.position.y = 0.17;
  g.add(stick, bulb);
  ch.tickers.push((_, t) => (bulbM.emissiveIntensity = 0.6 + Math.max(0, Math.sin(t * 3)) * 2.2));
  return g;
}

function siren(ch: Character) {
  const g = new THREE.Group();
  const base = solid(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 20), '#2a2f3a', 0.006);
  const red = new THREE.MeshStandardMaterial({ color: '#ff3048', emissive: '#ff3048', emissiveIntensity: 1 });
  const blue = new THREE.MeshStandardMaterial({ color: '#3a7bff', emissive: '#3a7bff', emissiveIntensity: 1 });
  const a = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10, 0, Math.PI, 0, Math.PI / 2), red);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10, Math.PI, Math.PI, 0, Math.PI / 2), blue);
  a.position.y = b.position.y = 0.015;
  g.add(base, a, b);
  ch.tickers.push((_, t) => {
    const k = Math.sin(t * 9);
    red.emissiveIntensity = 0.4 + Math.max(0, k) * 3;
    blue.emissiveIntensity = 0.4 + Math.max(0, -k) * 3;
    g.rotation.y = t * 4;
  });
  return g;
}

/** Braço de "luva": manga + antebraço + mão redonda, pendurado em -Y. */
function mittenArm(pivot: THREE.Group, o: { sleeve: string; skin: string; r: number; len: number; hand: number; sleeveR?: number; glove?: boolean }): LimbInfo {
  if (o.sleeveR) {
    const sl = solid(new THREE.SphereGeometry(o.sleeveR, 18, 14), o.sleeve);
    pivot.add(sl);
  }
  const arm = solid(new THREE.CapsuleGeometry(o.r, o.len, 6, 14), o.sleeveR ? o.skin : o.sleeve);
  arm.position.y = -o.len / 2 - o.r * 0.4;
  const hand = solid(new THREE.SphereGeometry(o.hand, 18, 14), o.glove ? '#fbfaf5' : o.skin);
  hand.position.y = -o.len - o.r * 0.6 - o.hand * 0.55;
  hand.scale.set(1, 1.05, 0.9);
  pivot.add(arm, hand);
  if (o.glove) {
    const cuff = solid(new THREE.TorusGeometry(o.hand * 0.78, o.hand * 0.28, 8, 18), '#fbfaf5');
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = hand.position.y + o.hand * 0.75;
    pivot.add(cuff);
  }
  return { reach: -hand.position.y, hand: o.hand * 1.05, r: o.r };
}

/**
 * Pendura peças num pivô (a base da orelha, o nó da gravata...) para que balancem com mola.
 * As posições das peças continuam no espaço de `parent`.
 */
function hinge(ch: Character, parent: THREE.Object3D, at: THREE.Vector3, parts: THREE.Object3D[], side = 1, amp = 1): Jiggle {
  const pv = new THREE.Group();
  pv.position.copy(at);
  for (const o of parts) {
    o.position.sub(at);
    pv.add(o);
  }
  parent.add(pv);
  return ch.addJiggle(pv, side, amp);
}

/** Aproxima-se de `to` com suavidade (independente do fps). */
const ease = (from: number, to: number, k: number, dt: number) => from + (to - from) * Math.min(1, dt * k);

function stubLeg(pivot: THREE.Group, o: { color: string; shoe: string; r: number; len: number; foot: number }) {
  const leg = solid(new THREE.CapsuleGeometry(o.r, o.len, 6, 14), o.color);
  leg.position.y = -o.len / 2 - o.r * 0.3;
  const shoe = solid(new THREE.SphereGeometry(o.foot, 18, 12), o.shoe);
  shoe.scale.set(1, 0.62, 1.35);
  shoe.position.set(0, -o.len - o.r * 0.55, o.foot * 0.35);
  pivot.add(leg, shoe);
}

/** Faixas de roupa: camisa, ou paletó com camisa em V. */
function outfit(role: Role, cut: number, vee: number, vw: number, low: number): Band[] {
  const id = ID[role];
  const suit = SUIT[role];
  if (suit)
    return [
      { y: cut, color: id.shirt, v: vee * 0.4, vw },
      { y: cut + 0.02, color: suit, v: vee * 3.2, vw: vw * 1.2 },
      { y: low, color: id.pants },
    ];
  return [
    { y: cut, color: id.shirt, v: vee, vw },
    { y: low, color: id.pants },
  ];
}

// ------------------------------------------------------------------ 1. FEIJÃO (PEAK)

function feijao(role: Role): Character {
  const id = ID[role];
  const skin = role === 'dono' ? '#3a3a48' : id.c;
  const ch = new Character(role, SCALE[role]);
  const R = 0.33;
  const L = 0.44;
  const hip = 0.2;
  ch.top = hip + 0.5 + L / 2 + R;
  ch.yawOnly = true;
  ch.wobble = 0;
  ch.clutchArm = new THREE.Vector3(0.8, 0.75, 0.45);
  for (const side of [-1, 1])
    ch.addLeg(side, new THREE.Vector3(side * 0.13, hip, 0), (p) => stubLeg(p, { color: SUIT[role] ? id.pants : id.pants, shoe: '#2a2433', r: 0.075, len: 0.09, foot: 0.095 }));
  ch.torso.position.y = hip;
  const body = part(new THREE.CapsuleGeometry(R, L, 12, 36), paintMat(skin, outfit(role, 0.0, 0.07, 0.12, -0.36)), skin, 0.012);
  body.position.y = 0.5;
  ch.torso.add(body);
  // rosto: adesivo no corpo, gira em volta do eixo do feijão quando olha
  const face = new Face2D({
    style: 'peak', skin, eyeGap: 80, eyeY: -16, eyeW: 56, eyeH: 84, mouthY: 84, mouthW: 72,
    brow: role === 'chefe' ? '#1b1424' : role === 'dono' ? '#e9e6e0' : '#2a1d24', browT: isBoss(role) ? 18 : 13, browW: 52,
    mean: isBoss(role) ? 1 : 0, mustache: role === 'chefe' ? '#2a1d24' : role === 'dono' ? '#e9e6e0' : null,
    monocle: role === 'dono', lashes: role === 'bia', ink: role === 'dono' ? '#ffd76b' : undefined,
    blush: role === 'dono' ? '#b07090' : undefined,
  });
  ch.faces.push(face);
  ch.head.add(faceDecal(body, face, new THREE.Vector3(0, 0.5 + 0.22, R), 0.54, 0.54, 0.34));
  // gola + gravata + crachá
  const t = tie(id.tie);
  t.position.set(0, 0.48, R + 0.012);
  const c = collar();
  c.position.set(0, 0.5, R - 0.004);
  ch.torso.add(t, c);
  if (!isBoss(role)) {
    const b = badge(id.c);
    b.position.set(0.17, 0.4, Math.sqrt(R * R - 0.17 * 0.17) + 0.004);
    b.rotation.y = 0.56;
    ch.torso.add(b);
  }
  for (const side of [-1, 1])
    ch.addArm(side, new THREE.Vector3(side * 0.31, 0.42, 0), (p) =>
      mittenArm(p, { sleeve: SUIT[role] ?? id.shirt, skin, r: 0.056, len: 0.16, hand: 0.072, sleeveR: 0.08 }),
    );
  // topo da cabeça
  const topY = 0.5 + L / 2;
  const acc = new THREE.Group();
  acc.position.y = topY + R * 0.82;
  if (role === 'voce') acc.add(tuft(skin));
  if (role === 'bia') acc.add(bun('#5a3424', '#ffd23f'));
  if (role === 'caio') {
    const k = cap('#e5484d', R);
    k.position.y = -R * 0.82;
    acc.add(k);
  }
  if (role === 'x9') {
    const k = propCap(ch, R);
    k.position.y = -R * 0.82;
    acc.add(k);
  }
  if (role === 'chefe') {
    const hair = mat('#2a1d24');
    for (let i = 0; i < 3; i++) {
      const strand = part(new THREE.TorusGeometry(R * 0.9, 0.016, 6, 20, 1.5), hair, '#2a1d24', 0);
      strand.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.75, 'ZYX');
      strand.position.set(-0.05 + i * 0.05, -R * 0.82 - 0.02, -0.03);
      acc.add(strand);
    }
  }
  if (role === 'dono') {
    const h = topHat();
    h.position.y = 0.0;
    acc.add(h);
  }
  ch.head.add(acc);
  return ch;
}

// ------------------------------------------------------------------ 2. SEMIBÔ (R.E.P.O.)

function semibo(role: Role): Character {
  const id = ID[role];
  const col = role === 'dono' ? '#d9ae4a' : role === 'chefe' ? '#8a2a3e' : id.c;
  const metal = '#3b3f4a';
  const ch = new Character(role, SCALE[role] * 1.08);
  ch.wobble = 2.4;
  const hip = 0.3;
  for (const side of [-1, 1])
    ch.addLeg(side, new THREE.Vector3(side * 0.085, hip, 0), (p) => {
      const leg = solid(new THREE.CylinderGeometry(0.024, 0.026, 0.24, 10), metal, 0.006);
      leg.position.y = -0.13;
      const knee = solid(new THREE.SphereGeometry(0.034, 12, 10), metal, 0.006);
      knee.position.y = -0.12;
      const foot = solid(new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), col);
      foot.scale.set(1, 0.8, 1.35);
      foot.position.set(0, -0.29, 0.03);
      p.add(leg, knee, foot);
    });
  ch.torso.position.y = hip;
  const prof = [
    [0, 0], [0.15, 0], [0.19, 0.03], [0.205, 0.1], [0.195, 0.2], [0.165, 0.29], [0.11, 0.345], [0.05, 0.37], [0, 0.372],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const suit = SUIT[role];
  const bodyM = suit ? paintMat(suit, [{ y: 0.37, color: '#f4f2ec', v: 0.0, vw: 1 }, { y: 0.37, color: suit, v: 0.16, vw: 0.09 }]) : mat(col);
  const body = part(new THREE.LatheGeometry(prof, 40), bodyM, suit ?? col, 0.011);
  ch.torso.add(body);
  const belt = solid(new THREE.TorusGeometry(0.19, 0.018, 8, 40), metal, 0.005);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.05;
  ch.torso.add(belt);
  const t = tie(id.tie, 0.85);
  t.position.set(0, 0.31, 0.172);
  t.rotation.x = -0.14;
  const c = collar('#fbfaf5', 0.9);
  c.position.set(0, 0.32, 0.135);
  c.rotation.x = 0.4;
  ch.torso.add(t, c);
  if (!isBoss(role)) {
    const b = badge(id.c);
    b.position.set(0.12, 0.24, 0.165);
    b.rotation.set(-0.25, 0.55, 0);
    b.scale.setScalar(0.85);
    ch.torso.add(b);
  }
  for (const side of [-1, 1])
    ch.addArm(side, new THREE.Vector3(side * 0.205, 0.27, 0), (p) => {
      const j = solid(new THREE.SphereGeometry(0.05, 16, 12), col);
      const arm = solid(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), metal, 0.005);
      arm.position.y = -0.11;
      const hand = solid(new THREE.SphereGeometry(0.05, 16, 12), col);
      hand.position.y = -0.23;
      p.add(j, arm, hand);
    });
  // pescoço de mola
  ch.neck.position.set(0, 0.36, 0);
  const neck = solid(new THREE.CylinderGeometry(0.028, 0.028, 0.13, 10), metal, 0.005);
  neck.position.y = 0.065;
  ch.neck.add(neck);
  for (let i = 0; i < 3; i++) {
    const coil = solid(new THREE.TorusGeometry(0.036, 0.009, 6, 16), '#5a6070', 0);
    coil.rotation.x = Math.PI / 2;
    coil.position.y = 0.03 + i * 0.035;
    ch.neck.add(coil);
  }
  // cabeça: bala com olhos saltados (o rosto 2D é projetado em cima)
  const hg = new THREE.Group();
  hg.position.y = 0.33;
  ch.head.add(hg);
  const HR = 0.27;
  const eyeX = 0.122;
  const parts = [new THREE.SphereGeometry(HR, 48, 32).scale(1.15, 0.9, 1)];
  for (const s of [-1, 1]) parts.push(new THREE.SphereGeometry(0.105, 32, 20).scale(1, 1.08, 0.5).translate(s * eyeX, 0.02, 0.232));
  const headGeo = mergeGeometries(parts)!;
  const head = part(headGeo, mat(col, 0.35), col, 0.012);
  hg.add(head);
  const socket = solid(new THREE.TorusGeometry(0.07, 0.022, 8, 20), metal, 0.005);
  socket.rotation.x = Math.PI / 2;
  socket.position.y = -HR * 0.86;
  hg.add(socket);
  const px = 512 / 0.56;
  const face = new Face2D({
    style: 'repo', skin: col, lid: `#${new THREE.Color(col).multiplyScalar(0.72).getHexString()}`,
    eyeGap: eyeX * px, eyeY: 0, eyeW: 0.105 * 2 * px * 0.9, eyeH: 0.113 * 2 * px * 0.9,
    mean: isBoss(role) ? 1 : 0, monocle: role === 'dono',
  });
  ch.faces.push(face);
  hg.add(faceDecal(head, face, new THREE.Vector3(0, 0.02, 0.32), 0.56, 0.56, 0.3));
  ch.top = hip + 0.36 + 0.33 + HR * 0.9;
  // enfeites
  const topY = HR * 0.9;
  const acc = new THREE.Group();
  acc.position.y = topY - 0.02;
  if (role === 'voce') acc.add(antenna(ch, '#ffb35c'));
  if (role === 'bia') {
    const b = bow('#ff4f9a');
    b.position.set(0.12, 0.0, 0.0);
    b.rotation.z = -0.35;
    acc.add(b);
  }
  if (role === 'caio') {
    const k = cap('#ffd23f', HR * 0.95);
    k.position.y = -topY * 0.88;
    acc.add(k);
  }
  if (role === 'x9') acc.add(siren(ch));
  if (role === 'chefe') {
    // bigodão de lata
    const st = part(new THREE.CapsuleGeometry(0.03, 0.2, 4, 10), mat('#1d1820'), '#1d1820', 0.006);
    st.rotation.z = Math.PI / 2;
    st.position.set(0, -0.11 - topY + 0.02, 0.24);
    acc.add(st);
    const plate = solid(new THREE.BoxGeometry(0.42, 0.035, 0.05), '#4a1626', 0.006);
    plate.position.set(0, 0.13 - topY + 0.02, 0.215);
    plate.rotation.x = -0.35;
    acc.add(plate);
  }
  if (role === 'dono') {
    const h = topHat(0.95);
    h.position.y = -0.02;
    acc.add(h);
  }
  hg.add(acc);
  return ch;
}

// ------------------------------------------------------------------ 3. TELINHA (monitor CRT)

const SCREEN: Record<Role, { shell: string; glow: string; bg: string }> = {
  voce: { shell: '#f6c08c', glow: '#ffb35c', bg: '#1d1006' },
  bia: { shell: '#f5b7d3', glow: '#ff9ad5', bg: '#1d0a17' },
  caio: { shell: '#a9d0ff', glow: '#62f3ff', bg: '#071820' },
  x9: { shell: '#c6ecab', glow: '#8dff7a', bg: '#08180a' },
  chefe: { shell: '#3a3f4c', glow: '#ff5a5a', bg: '#1f080b' },
  dono: { shell: '#d9b25a', glow: '#ffd76b', bg: '#120d03' },
};

let glossTex: THREE.Texture | null = null;
function gloss() {
  if (glossTex) return glossTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.0)');
  gr.addColorStop(0.28, 'rgba(255,255,255,0.0)');
  gr.addColorStop(0.36, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.46, 'rgba(255,255,255,0.0)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glossTex = new THREE.CanvasTexture(c);
  return glossTex;
}

/** Tela levemente abaulada (CRT). */
function screenGeo(w: number, h: number, bulge: number) {
  const geo = new THREE.PlaneGeometry(w, h, 24, 18);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const y = p.getY(i) / (h / 2);
    p.setZ(i, bulge * (1 - x * x * 0.5 - y * y * 0.5));
  }
  geo.computeVertexNormals();
  return geo;
}

function postIt() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffe35a';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#3a4a9a';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(10, 20);
  g.bezierCurveTo(20, 12, 30, 26, 40, 16);
  g.moveTo(10, 34);
  g.lineTo(48, 34);
  g.moveTo(10, 46);
  g.lineTo(36, 46);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshToonMaterial({ map: t, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

function telinha(role: Role, id = ID[role], sc = SCREEN[role]): Character {
  const ch = new Character(role, SCALE[role]);
  ch.wobble = 1.3;
  ch.pitchLift = 0.24;
  ch.droopK = 0.85;
  const hip = 0.24;
  for (const side of [-1, 1])
    ch.addLeg(side, new THREE.Vector3(side * 0.1, hip, 0), (p) => stubLeg(p, { color: id.pants, shoe: '#2a2433', r: 0.065, len: 0.11, foot: 0.085 }));
  ch.torso.position.y = hip;
  const suit = SUIT[role];
  const bodyGeo = new RoundedBoxGeometry(0.38, 0.34, 0.26, 4, 0.08);
  const bodyBands: Band[] = suit
    ? [{ y: 0.17, color: suit, v: 0.24, vw: 0.08 }, { y: -0.13, color: id.pants }]
    : [{ y: -0.13, color: id.pants }];
  const body = part(bodyGeo, paintMat(suit ? id.shirt : id.c, bodyBands), suit ?? id.c, 0.011);
  body.position.y = 0.17;
  ch.torso.add(body);
  const t = tie(id.tie);
  t.position.set(0, 0.32, 0.136);
  hinge(ch, ch.torso, t.position.clone(), [t], 1, 0.55);
  const c = collar();
  c.position.set(0, 0.335, 0.125);
  ch.torso.add(c);
  ch.addCollider(ch.torso, new THREE.Vector3(0, 0.17, 0), new THREE.Vector3(0.19, 0.17, 0.13), true);
  if (!isBoss(role)) {
    const b = badge(sc.glow);
    b.position.set(-0.11, 0.25, 0.134);
    ch.torso.add(b);
  }
  for (const side of [-1, 1])
    ch.addArm(side, new THREE.Vector3(side * 0.215, 0.27, 0), (p) =>
      mittenArm(p, { sleeve: suit ?? id.c, skin: '#fbfaf5', r: 0.052, len: 0.13, hand: 0.072, glove: true }),
    );
  // pânico: agarra o monitor pelos lados (a colisão segura a mão na lateral da caixa)
  ch.clutchArm = new THREE.Vector3(0.05, 1, 0.3);
  // pescoço = pé do monitor
  ch.neck.position.set(0, 0.34, 0);
  const stand = solid(new THREE.CylinderGeometry(0.035, 0.05, 0.08, 14), '#4a4f5c', 0.006);
  stand.position.y = 0.035;
  ch.neck.add(stand);
  const hg = new THREE.Group();
  ch.head.add(hg);
  const wide = role === 'chefe';
  const W = wide ? 0.82 : role === 'dono' ? 0.56 : 0.52;
  const H = wide ? 0.48 : role === 'dono' ? 0.46 : 0.42;
  const D = wide ? 0.07 : 0.32;
  hg.position.y = 0.06 + H / 2;
  const shell = part(new RoundedBoxGeometry(W, H, D, 4, wide ? 0.025 : 0.07), mat(sc.shell, 0.35), sc.shell, 0.012);
  hg.add(shell);
  ch.addCollider(hg, new THREE.Vector3(), new THREE.Vector3(W / 2, H / 2, Math.max(D, 0.12) / 2), true);
  if (!wide) ch.addCollider(hg, new THREE.Vector3(0, 0, -D / 2 - 0.06), new THREE.Vector3(W * 0.35, H * 0.36, 0.1), true);
  if (!wide) {
    const back = part(new RoundedBoxGeometry(W * 0.7, H * 0.72, 0.2, 4, 0.06), mat(sc.shell, 0.35), sc.shell, 0.011);
    back.position.z = -D / 2 - 0.06;
    hg.add(back);
  } else {
    const back = solid(new THREE.BoxGeometry(0.2, 0.16, 0.06), '#2c303a', 0.006);
    back.position.z = -0.05;
    hg.add(back);
  }
  const sw = W - (wide ? 0.05 : 0.11);
  const sh = H - (wide ? 0.05 : 0.1);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(sw + 0.03, sh + 0.03, 0.02, 3, 0.012), mat('#1d2027', 0.2));
  bezel.position.z = D / 2 - 0.004;
  hg.add(bezel);
  const face = new Face2D({
    style: 'screen', skin: sc.shell, w: 512, h: Math.round((512 * sh) / sw), glow: sc.glow, screen: sc.bg,
    eyeGap: 0, eyeY: 0, eyeW: 0, eyeH: 0, mean: isBoss(role) ? 1 : 0,
  });
  ch.faces.push(face);
  const scrM = decodeLive(new THREE.MeshBasicMaterial({ map: face.tex, toneMapped: false }));
  scrM.color.setScalar(1.5);
  const scr = new THREE.Mesh(screenGeo(sw, sh, wide ? 0.004 : 0.018), scrM);
  scr.position.z = D / 2 + 0.008;
  hg.add(scr);
  const gl = new THREE.Mesh(screenGeo(sw, sh, wide ? 0.005 : 0.019), new THREE.MeshBasicMaterial({ map: gloss(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  gl.position.z = D / 2 + 0.009;
  hg.add(gl);
  // troca de canal: a imagem colapsa numa linha e volta com um clarão; dormindo, a tela escurece
  let shown = ch.expr;
  let u = 1;
  let bright = 1.5;
  ch.tickers.push((dt) => {
    if (ch.expr !== shown) {
      shown = ch.expr;
      u = 0;
    }
    u = Math.min(1, u + dt / 0.26);
    const sy = u < 0.35 ? 1 - 0.96 * (u / 0.35) : 0.04 + 0.96 * Math.pow((u - 0.35) / 0.65, 0.6);
    const sx = u < 0.35 ? 1 + 0.06 * (u / 0.35) : 1.06 - 0.06 * ((u - 0.35) / 0.65);
    scr.scale.set(sx, sy, 1);
    bright = ease(bright, ch.expr === 'sleep' ? 0.6 : 1.5, 4, dt);
    scrM.color.setScalar(bright + Math.max(0, 1 - Math.abs(u - 0.35) / 0.2) * 2.5);
  });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshBasicMaterial({ color: '#7dff8a', toneMapped: false }));
  led.position.set(W / 2 - 0.05, -H / 2 + 0.028, D / 2 + 0.003);
  hg.add(led);
  ch.top = hip + 0.34 + 0.06 + H;
  ch.headAnchor.position.y = hg.position.y;
  ch.headR = Math.max(W, H) / 2;
  ch.butt = hip;
  const topY = H / 2;
  if (role === 'voce') {
    // post-it preso pela borda de cima: balança e levanta com o vento do passo
    const p = postIt();
    p.position.set(W / 2 - 0.02, H / 2 - 0.06, D / 2 + 0.012);
    p.rotation.z = -0.25;
    const j = hinge(ch, hg, new THREE.Vector3(W / 2 - 0.008, H / 2 - 0.012, D / 2 + 0.012), [p], 1, 1.6);
    ch.tickers.push((_, tt) => (j.pose.x = -0.08 + Math.sin(tt * 3.3) * 0.05 + (ch.action === 'walk' ? -0.25 : 0)));
  }
  if (role === 'bia') {
    const b = bow('#ff4f9a');
    b.position.set(-W / 2 + 0.1, topY + 0.03, 0.04);
    b.rotation.z = 0.35;
    hinge(ch, hg, new THREE.Vector3(-W / 2 + 0.1, topY, 0.04), [b], -1, 0.7);
  }
  if (role === 'caio') {
    // antena de TV "orelha de coelho"
    for (const s of [-1, 1]) {
      const rod = solid(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 6), '#9aa3b8', 0);
      rod.position.set(s * 0.07, topY + 0.13, -0.02);
      rod.rotation.z = -s * 0.5;
      const tip = solid(new THREE.SphereGeometry(0.018, 10, 8), '#e5484d', 0.004);
      tip.position.set(s * 0.145, topY + 0.265, -0.02);
      // cada vareta balança sozinha; no alerta, abrem
      const j = hinge(ch, hg, new THREE.Vector3(0, topY, -0.02), [rod, tip], s, 1.5);
      ch.tickers.push((dt) => (j.pose.z = ease(j.pose.z, ch.expr === 'alert' || ch.expr === 'clutch' ? -s * 0.3 : ch.expr === 'sleep' || ch.expr === 'bored' ? s * 0.25 : 0, 8, dt)));
    }
    const base = solid(new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#4a4f5c', 0.006);
    base.position.set(0, topY - 0.005, -0.02);
    hg.add(base);
  }
  if (role === 'x9') {
    const cam = solid(new THREE.SphereGeometry(0.06, 18, 14), '#2a2f3a', 0.008);
    cam.position.set(0, topY + 0.055, 0.02);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: '#4ab0ff', toneMapped: false }));
    lens.position.set(0, topY + 0.055, 0.081);
    const recM = new THREE.MeshBasicMaterial({ color: '#ff3048', toneMapped: false });
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), recM);
    rec.position.set(0.04, topY + 0.09, 0.05);
    hinge(ch, hg, new THREE.Vector3(0, topY, 0.02), [cam, lens, rec], 1, 0.5);
    ch.tickers.push((_, t) => (rec.visible = Math.sin(t * 5) > 0));
  }
  if (role === 'dono') {
    const h = topHat(1.05);
    h.position.y = topY + 0.005;
    hinge(ch, hg, h.position.clone(), [h], 1, 0.6);
    // monóculo 3D na frente do olho direito da tela
    const ring = solid(new THREE.TorusGeometry(0.058, 0.009, 8, 28), '#e8b93a', 0, 0.5);
    ring.position.set((12 / 64) * sw, (5 / 64) * sw, D / 2 + 0.04);
    hg.add(ring);
  }
  if (role === 'chefe') {
    // gravata-borboleta? não: o chefe é a tela larga com o pé de metal
    const arm = solid(new THREE.BoxGeometry(0.06, 0.14, 0.04), '#4a4f5c', 0.006);
    arm.position.set(0, -H / 2 + 0.02, -0.05);
    hg.add(arm);
  }
  return ch;
}

// ------------------------------------------------------------------ 4. BICHOS

interface SpeciesDef {
  name: string;
  fur: string;
  head: [number, number, number];
  /** Cabeça de "pão de forma" (capivara) em vez de esfera. */
  loaf?: boolean;
  face: Partial<FaceSpec>;
  /** Quanto as orelhas reagem às expressões. */
  earK?: number;
  /**
   * Monta orelhas etc. em hg; formas que recebem o rosto vão em extra (com cor própria ou a do pelo).
   * `ear` pendura as peças de uma orelha num pivô na base dela (mola + pose por expressão).
   */
  build: (hg: THREE.Group, extra: Extra[], ch: Character, ear: EarFn) => void;
}
type EarFn = (side: number, base: THREE.Vector3, parts: THREE.Object3D[], amp?: number) => void;
interface Extra {
  geo: THREE.BufferGeometry;
  color?: string;
}

const SPECIES: Record<Role, SpeciesDef> = {
  voce: {
    name: 'Capivara',
    fur: '#a8784e',
    head: [1, 1, 1],
    loaf: true,
    face: { eyeGap: 104, eyeY: -74, eyeW: 40, eyeH: 44, nose: 'capy', noseY: 40, mouthY: 102, mouthW: 44, chill: 0.3, brow: null },
    earK: 0.7,
    build: (hg, extra, ch, earFn) => {
      extra.push({ geo: new RoundedBoxGeometry(0.4, 0.27, 0.22, 5, 0.1).translate(0, -0.09, 0.17), color: '#8f6342' });
      for (const s of [-1, 1]) {
        const ear = solid(new THREE.SphereGeometry(0.045, 14, 10), '#6e4a2f');
        ear.scale.set(1, 0.9, 0.55);
        ear.position.set(s * 0.17, 0.25, -0.06);
        earFn(s, new THREE.Vector3(s * 0.15, 0.22, -0.06), [ear], 0.9);
      }
      // a tangerina na cabeça
      const tg = solid(new THREE.SphereGeometry(0.07, 20, 14), '#ff9a2e');
      tg.scale.set(1, 0.85, 1);
      tg.position.set(0.02, 0.32, -0.04);
      const leaf = solid(new THREE.SphereGeometry(0.03, 10, 8), '#3fbf5f');
      leaf.scale.set(1.5, 0.35, 0.8);
      leaf.position.set(0.04, 0.38, -0.04);
      leaf.rotation.z = 0.4;
      // a tangerina se equilibra: balança com mola sobre a cabeça
      hinge(ch, hg, new THREE.Vector3(0.02, 0.265, -0.04), [tg, leaf], 1, 1.3);
    },
  },
  bia: {
    name: 'Gata',
    fur: '#f3cfa2',
    head: [1.08, 0.95, 1],
    face: { eyeGap: 78, eyeY: -12, eyeW: 52, eyeH: 64, nose: 'cat', noseY: 44, whiskers: true, mouthY: 64, mouthW: 56, lashes: true, brow: null },
    build: (hg, _extra, _ch, earFn) => {
      for (const s of [-1, 1]) {
        const ear = solid(new THREE.ConeGeometry(0.085, 0.17, 16), '#f3cfa2');
        ear.scale.set(1, 1, 0.5);
        ear.position.set(s * 0.15, 0.25, -0.01);
        ear.rotation.z = -s * 0.35;
        const inner = solid(new THREE.ConeGeometry(0.05, 0.1, 16), '#ff9fb6', 0);
        inner.scale.set(1, 1, 0.3);
        inner.position.set(s * 0.148, 0.235, 0.025);
        inner.rotation.z = -s * 0.35;
        earFn(s, new THREE.Vector3(s * 0.12, 0.17, -0.01), [ear, inner]);
      }
      // mancha laranja numa orelha
      const patch = solid(new THREE.SphereGeometry(0.1, 16, 12), '#e08a3a', 0);
      patch.scale.set(1, 0.7, 0.5);
      patch.position.set(-0.13, 0.15, 0.16);
      patch.visible = false;
      hg.add(patch);
    },
  },
  caio: {
    name: 'Sapo',
    fur: '#7fcf6b',
    head: [1.25, 0.78, 1],
    face: { eyeGap: 132, eyeY: -122, eyeW: 64, eyeH: 74, nose: 'frog', noseY: 6, mouthY: 52, mouthW: 150, brow: null },
    build: (_hg, extra) => {
      for (const s of [-1, 1]) extra.push({ geo: new THREE.SphereGeometry(0.1, 24, 18).translate(s * 0.14, 0.17, 0.08) });
    },
  },
  x9: {
    name: 'Rato',
    fur: '#b9b6c8',
    head: [1, 0.95, 1.02],
    face: { eyeGap: 70, eyeY: -40, eyeW: 40, eyeH: 50, nose: 'mouse', noseY: 52, whiskers: true, mouthY: 92, mouthW: 44, teeth: 'buck', brow: null },
    earK: 0.8,
    build: (hg, extra, ch, earFn) => {
      extra.push({ geo: new THREE.SphereGeometry(0.11, 24, 16).scale(1, 0.85, 1.25).translate(0, -0.06, 0.2) });
      for (const s of [-1, 1]) {
        const ear = solid(new THREE.CylinderGeometry(0.115, 0.115, 0.022, 28), '#b9b6c8');
        ear.rotation.x = Math.PI / 2;
        ear.position.set(s * 0.19, 0.2, -0.04);
        const inner = solid(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 24), '#ffa3b8', 0);
        inner.rotation.x = Math.PI / 2;
        inner.position.set(s * 0.19, 0.2, -0.026);
        earFn(s, new THREE.Vector3(s * 0.11, 0.13, -0.04), [ear, inner]);
      }
      const k = propCap(ch, 0.25);
      k.scale.setScalar(0.8);
      k.position.y = 0.04;
      hg.add(k);
    },
  },
  chefe: {
    name: 'Buldogue',
    fur: '#c8955f',
    head: [1.28, 0.92, 1.02],
    face: { eyeGap: 100, eyeY: -50, eyeW: 34, eyeH: 38, nose: 'dog', noseY: 14, mouthY: 96, mouthW: 128, teeth: 'under', brow: '#4a2e1c', browT: 24, browW: 66 },
    earK: 0.5,
    build: (_hg, extra, _ch, earFn) => {
      extra.push({ geo: new THREE.SphereGeometry(0.17, 32, 20).scale(1.38, 0.8, 0.82).translate(0, -0.08, 0.16), color: '#f1e3cf' });
      for (const s of [-1, 1]) {
        const ear = solid(new THREE.SphereGeometry(0.08, 14, 10), '#6a4428');
        ear.scale.set(0.45, 1, 0.9);
        ear.position.set(s * 0.29, 0.13, -0.02);
        ear.rotation.z = s * 0.6;
        // orelha caída: pivô no topo, balança bastante
        earFn(s, new THREE.Vector3(s * 0.25, 0.2, -0.02), [ear], 2.2);
      }
    },
  },
  dono: {
    name: 'Tubarão',
    fur: '#6f90ab',
    head: [1.08, 0.95, 1.2],
    face: { eyeGap: 118, eyeY: -62, eyeW: 34, eyeH: 38, nose: 'shark', mouthY: 40, mouthW: 170, brow: '#2a3a4a', browT: 16, browW: 46, monocle: true },
    build: (hg, _extra, ch) => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.1, 0);
      sh.quadraticCurveTo(-0.02, 0.06, 0.06, 0.2);
      sh.quadraticCurveTo(0.05, 0.08, 0.1, 0);
      sh.closePath();
      const fin = part(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 3 }), mat('#6f90ab'), '#6f90ab', 0.008);
      fin.rotation.y = Math.PI / 2;
      fin.position.set(-0.015, 0.2, 0.0);
      hinge(ch, hg, new THREE.Vector3(0, 0.2, 0), [fin], 1, 0.6);
      for (const s of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const gill = solid(new THREE.BoxGeometry(0.008, 0.07, 0.012), '#3d566b', 0);
          gill.position.set(s * 0.27, -0.03, -0.05 - i * 0.04);
          gill.rotation.y = s * 0.3;
          hg.add(gill);
        }
    },
  },
};

function bichos(role: Role, id = ID[role]): Character {
  const sp = SPECIES[role];
  const ch = new Character(role, SCALE[role]);
  ch.wobble = 1.1;
  ch.pitchLift = 0.3;
  ch.droopK = 0.85;
  const hip = 0.17;
  const fur = sp.fur;
  const furDark = `#${new THREE.Color(fur).multiplyScalar(0.78).getHexString()}`;
  for (const side of [-1, 1])
    ch.addLeg(side, new THREE.Vector3(side * 0.12, hip, 0), (p) => stubLeg(p, { color: SUIT[role] ? id.pants : fur, shoe: furDark, r: 0.075, len: 0.05, foot: 0.088 }));
  ch.torso.position.y = hip;
  const prof = [[0, -0.02], [0.19, -0.02], [0.25, 0.06], [0.265, 0.17], [0.24, 0.29], [0.18, 0.38], [0.1, 0.43], [0, 0.445]].map(([x, y]) => new THREE.Vector2(x, y));
  const suit = SUIT[role];
  const bodyM = suit
    ? paintMat(suit, [{ y: 0.5, color: id.shirt, v: 0, vw: 1 }, { y: 0.5, color: suit, v: 0.3, vw: 0.1 }, { y: 0.04, color: id.pants }])
    : paintMat(id.c, [{ y: 0.03, color: id.pants }]);
  const body = part(new THREE.LatheGeometry(prof, 40), bodyM, suit ?? id.c, 0.011);
  ch.torso.add(body);
  ch.addCollider(ch.torso, new THREE.Vector3(0, 0.19, 0), new THREE.Vector3(0.235, 0.23, 0.24));
  const t = tie(id.tie, 0.9);
  t.position.set(0, 0.375, 0.222);
  t.rotation.x = -0.27;
  hinge(ch, ch.torso, t.position.clone(), [t], 1, 0.5);
  const c = collar();
  c.position.set(0, 0.395, 0.16);
  c.rotation.x = 0.2;
  ch.torso.add(c);
  if (!isBoss(role)) {
    const b = badge(id.c);
    b.position.set(0.15, 0.3, 0.2);
    b.rotation.set(-0.2, 0.6, 0);
    b.scale.setScalar(0.9);
    ch.torso.add(b);
  }
  for (const side of [-1, 1])
    ch.addArm(side, new THREE.Vector3(side * 0.24, 0.31, 0), (p) =>
      mittenArm(p, { sleeve: suit ?? id.c, skin: fur, r: 0.058, len: 0.11, hand: 0.068, sleeveR: 0.075 }),
    );
  // rabo
  if (role === 'bia' || role === 'x9') {
    const pts = role === 'bia'
      ? [[0, 0.08, -0.22], [0.05, 0.05, -0.34], [0.12, 0.16, -0.4], [0.1, 0.32, -0.38], [0.04, 0.38, -0.32]]
      : [[0, 0.06, -0.22], [0.08, 0.0, -0.36], [0.2, 0.02, -0.42], [0.3, 0.1, -0.4]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const tail = solid(new THREE.TubeGeometry(curve, 24, role === 'bia' ? 0.034 : 0.016, 8), role === 'bia' ? fur : '#ffa3b8', 0.006);
    // rabo: abana rápido no feliz, arrepia no susto, cai no tédio
    const [x0, y0, z0] = pts[0];
    const j = hinge(ch, ch.torso, new THREE.Vector3(x0, y0, z0), [tail], 1, 1.2);
    ch.tickers.push((dt, tt) => {
      const e = ch.expr;
      const wag = e === 'happy' ? Math.sin(tt * 16) * 0.55 : e === 'clutch' ? Math.sin(tt * 40) * 0.08 : Math.sin(tt * 2.2) * 0.16;
      j.pose.y = wag;
      j.pose.x = ease(j.pose.x, e === 'alert' || e === 'clutch' ? -0.35 : e === 'bored' || e === 'sleep' || e === 'caught' ? 0.35 : 0, 6, dt);
    });
  }
  ch.neck.position.set(0, 0.42, 0);
  const hg = new THREE.Group();
  hg.position.y = 0.22;
  ch.head.add(hg);
  const extra: Extra[] = [];
  const ears: { j: Jiggle; side: number }[] = [];
  sp.build(hg, extra, ch, (side, base, parts, amp = 1) => ears.push({ j: hinge(ch, hg, base, parts, side, amp), side }));
  // orelhas: em pé no alerta, para trás no pânico, caídas no tédio/pego, abanando no feliz,
  // e de vez em quando uma delas dá uma tremida
  const ek = sp.earK ?? 1;
  let twitch = 0;
  let twitchSide = 1;
  let nextTwitch = 1 + Math.random() * 3;
  ch.tickers.push((dt, tt) => {
    const e = ch.expr;
    nextTwitch -= dt;
    if (nextTwitch < 0) {
      twitch = 1;
      twitchSide = Math.random() < 0.5 ? -1 : 1;
      nextTwitch = 1.5 + Math.random() * 4;
    }
    twitch = Math.max(0, twitch - dt * 5);
    const out = { normal: 0, alert: -0.12, clutch: 0.35, caught: 0.6, bored: 0.35, happy: 0, talk: 0, sleep: 0.5 }[e];
    const back = { normal: 0, alert: 0.12, clutch: -0.5, caught: 0.15, bored: 0.1, happy: 0, talk: 0, sleep: 0.15 }[e];
    for (const { j, side } of ears) {
      const wig = e === 'happy' ? Math.sin(tt * 13 + side) * 0.22 : 0;
      const tw = side === twitchSide ? Math.sin(twitch * Math.PI * 3) * twitch : 0;
      j.pose.z = ease(j.pose.z, (-side * out + side * wig) * ek, 10, dt) - side * tw * 0.07;
      j.pose.x = ease(j.pose.x, back * ek, 10, dt) + tw * 0.14;
    }
  });
  const skull = sp.loaf ? new RoundedBoxGeometry(0.5, 0.5, 0.46, 6, 0.2) : new THREE.SphereGeometry(0.27, 48, 32).scale(...sp.head);
  const furOnly = [skull, ...extra.filter((e) => !e.color).map((e) => e.geo)];
  const headM = role === 'dono' ? paintMat(fur, [{ y: -0.06, color: '#eef3f6', v: -0.09, vw: 0.32 }], 0.2) : mat(fur, 0.15);
  const head = part(furOnly.length > 1 ? mergeGeometries(furOnly)! : skull, headM, fur, 0.012);
  hg.add(head);
  // volumes da cabeça para os braços (crânio + cada focinho/olho saltado)
  if (sp.loaf) ch.addCollider(hg, new THREE.Vector3(), new THREE.Vector3(0.25, 0.25, 0.23), true);
  else ch.addCollider(hg, new THREE.Vector3(), new THREE.Vector3(0.27 * sp.head[0], 0.27 * sp.head[1], 0.27 * sp.head[2]));
  for (const e of extra) {
    e.geo.computeBoundingSphere();
    const bs = e.geo.boundingSphere!;
    ch.addCollider(hg, bs.center.clone(), new THREE.Vector3(bs.radius, bs.radius, bs.radius).multiplyScalar(0.9));
  }
  for (const e of extra) if (e.color) hg.add(part(e.geo, mat(e.color, 0.15), e.color, 0.01));
  // o rosto é projetado na união de tudo (crânio + focinhos), mas desenhado por cima
  const target = new THREE.Mesh(mergeGeometries([skull, ...extra.map((e) => e.geo)])!);
  const face = new Face2D({
    style: 'critter', skin: fur, mean: isBoss(role) ? 1 : 0, eyeGap: 80, eyeY: -30, eyeW: 44, eyeH: 54, mouthY: 80, mouthW: 56,
    ...sp.face,
  } as FaceSpec);
  ch.faces.push(face);
  const fy = role === 'caio' ? 0.06 : 0;
  hg.add(faceDecal(target, face, new THREE.Vector3(0, fy, 0.34), 0.56, 0.56, 0.36));
  ch.top = hip + 0.42 + 0.22 + 0.27 * sp.head[1];
  ch.headAnchor.position.y = 0.22;
  ch.headR = 0.27 * Math.max(sp.head[0], sp.head[1]);
  ch.butt = hip - 0.02;
  if (role === 'dono') {
    const h = topHat(0.9);
    h.position.set(0.06, 0.2, -0.04);
    h.rotation.z = -0.2;
    hinge(ch, hg, h.position.clone(), [h], 1, 0.6);
  }
  return ch;
}

// ------------------------------------------------------------------ 5. MASSINHA (gente de massinha)

const PEOPLE5: Record<Role, { skin: string; hair: string; iris: string }> = {
  voce: { skin: '#f2c29b', hair: '#c4552a', iris: '#5a7a3a' },
  bia: { skin: '#8d5a3b', hair: '#1d1418', iris: '#4a2a1a' },
  caio: { skin: '#c98d5f', hair: '#2b1a12', iris: '#3a2a1a' },
  x9: { skin: '#f4d6bd', hair: '#b08a4a', iris: '#3a6a9a' },
  chefe: { skin: '#e8b48e', hair: '#5b4033', iris: '#2a2030' },
  dono: { skin: '#f1cfb0', hair: '#ebe8e2', iris: '#2a3a5a' },
};

function hairCap(color: string, r: number, theta = 1.25, tilt = -0.3) {
  const m = part(new THREE.SphereGeometry(r * 1.06, 32, 18, 0, Math.PI * 2, 0, theta), mat(color, 0.25), color, 0.01);
  m.rotation.x = tilt;
  return m;
}

function massinha(role: Role): Character {
  const id = ID[role];
  const pp = PEOPLE5[role];
  const ch = new Character(role, SCALE[role]);
  ch.wobble = 0.9;
  const hip = 0.25;
  const suit = SUIT[role];
  for (const side of [-1, 1])
    ch.addLeg(side, new THREE.Vector3(side * 0.1, hip, 0), (p) => stubLeg(p, { color: id.pants, shoe: '#2a2433', r: 0.072, len: 0.13, foot: 0.088 }));
  ch.torso.position.y = hip;
  const prof = [[0, -0.02], [0.17, -0.02], [0.215, 0.05], [0.23, 0.17], [0.215, 0.3], [0.17, 0.38], [0.09, 0.42], [0, 0.43]].map(([x, y]) => new THREE.Vector2(x, y));
  const bodyM = suit
    ? paintMat(suit, [{ y: 0.5, color: id.shirt, v: 0, vw: 1 }, { y: 0.5, color: suit, v: 0.3, vw: 0.1 }, { y: 0.02, color: id.pants }])
    : paintMat(id.c, [{ y: 0.02, color: id.pants }]);
  const body = part(new THREE.LatheGeometry(prof, 40), bodyM, suit ?? id.c, 0.011);
  ch.torso.add(body);
  if (suit) {
    const t = tie(id.tie, 0.95);
    t.position.set(0, 0.37, 0.2);
    t.rotation.x = -0.22;
    const c = collar();
    c.position.set(0, 0.388, 0.165);
    c.rotation.x = 0.2;
    ch.torso.add(t, c);
  } else {
    // camiseta polo: golinha + crachá na cordinha
    const c = collar('#fbfaf5', 0.9);
    c.position.set(0, 0.39, 0.1);
    c.rotation.x = 0.55;
    ch.torso.add(c);
    const b = badge(id.c);
    b.position.set(0.12, 0.27, 0.19);
    b.rotation.set(-0.2, 0.5, 0);
    ch.torso.add(b);
  }
  for (const side of [-1, 1])
    ch.addArm(side, new THREE.Vector3(side * 0.215, 0.31, 0), (p) =>
      mittenArm(p, { sleeve: suit ?? id.c, skin: pp.skin, r: 0.055, len: 0.14, hand: 0.064, sleeveR: 0.072 }),
    );
  ch.neck.position.set(0, 0.4, 0);
  const neck = solid(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 16), pp.skin, 0);
  neck.position.y = 0.03;
  ch.neck.add(neck);
  const hg = new THREE.Group();
  hg.position.y = 0.26;
  ch.head.add(hg);
  const HR = 0.24;
  const head = part(new THREE.SphereGeometry(HR, 48, 32).scale(1, 1.04, 0.96), mat(pp.skin, 0.35), pp.skin, 0.011);
  hg.add(head);
  const nose = solid(new THREE.SphereGeometry(0.038, 16, 12), `#${new THREE.Color(pp.skin).multiplyScalar(0.9).getHexString()}`, 0.006);
  nose.scale.set(1.15, 0.9, 1);
  nose.position.set(0, -0.025, HR * 0.96);
  hg.add(nose);
  for (const s of [-1, 1]) {
    const ear = solid(new THREE.SphereGeometry(0.05, 14, 10), pp.skin, 0.006);
    ear.scale.set(0.55, 1, 0.9);
    ear.position.set(s * HR * 0.98, -0.01, 0);
    hg.add(ear);
  }
  const face = new Face2D({
    style: 'dough', skin: pp.skin, eyeGap: 78, eyeY: -20, eyeW: 72, eyeH: 82, mouthY: 112, mouthW: 70,
    brow: pp.hair === '#ebe8e2' ? '#cfcac0' : pp.hair, browT: isBoss(role) ? 19 : 14, browW: 52, iris: pp.iris,
    mean: isBoss(role) ? 1 : 0, lashes: role === 'bia', freckles: role === 'voce',
    mustache: role === 'chefe' ? '#4a2e22' : role === 'dono' ? '#ebe8e2' : null, monocle: role === 'dono',
    blush: '#ff6f7d',
  });
  ch.faces.push(face);
  hg.add(faceDecal(head, face, new THREE.Vector3(0, 0.0, 0.3), 0.46, 0.46, 0.3));
  ch.top = hip + 0.4 + 0.26 + HR * 1.04;
  // cabelos
  if (role === 'voce') {
    hg.add(hairCap(pp.hair, HR, 1.15, -0.45));
    for (let i = 0; i < 4; i++) {
      const sp = solid(new THREE.ConeGeometry(0.05, 0.14, 10), pp.hair, 0.008);
      sp.position.set(-0.07 + i * 0.05, HR * 0.95, 0.06 - Math.abs(i - 1.5) * 0.02);
      sp.rotation.set(0.5, 0, (i - 1.5) * -0.35);
      hg.add(sp);
    }
  }
  if (role === 'bia') {
    hg.add(hairCap(pp.hair, HR, 1.3, -0.35));
    const b = bun(pp.hair, '#9b7bff', 1);
    b.position.set(0, HR * 0.95, -0.02);
    hg.add(b);
  }
  if (role === 'caio') {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;
      const th = Math.acos(1 - (i + 0.5) / n) * 1.25;
      if (th > 1.35) continue;
      const curl = solid(new THREE.SphereGeometry(0.075 + (i % 3) * 0.01, 14, 10), pp.hair, 0.008);
      curl.position.set(Math.sin(th) * Math.cos(a) * HR * 1.02, Math.cos(th) * HR * 1.06 + 0.02, Math.sin(th) * Math.sin(a) * HR * 1.02 - 0.03);
      if (curl.position.z > 0.12 && curl.position.y < HR * 0.7) continue;
      hg.add(curl);
    }
  }
  if (role === 'x9') {
    const capH = hairCap(pp.hair, HR, 1.2, -0.25);
    capH.rotation.z = 0.12;
    hg.add(capH);
    const swoop = solid(new THREE.SphereGeometry(0.1, 16, 12), pp.hair, 0.008);
    swoop.scale.set(1.5, 0.55, 0.9);
    swoop.position.set(-0.07, HR * 0.8, 0.1);
    swoop.rotation.z = 0.35;
    hg.add(swoop);
    const gm = mat('#2a2238');
    for (const s of [-1, 1]) {
      const ring = part(new THREE.TorusGeometry(0.052, 0.009, 8, 28), gm, '#2a2238', 0);
      ring.position.set(s * 0.058, 0.024, HR * 0.98 + 0.012);
      ring.rotation.y = s * 0.12;
      hg.add(ring);
    }
    const bridge = part(new THREE.BoxGeometry(0.03, 0.008, 0.008), gm, '#2a2238', 0);
    bridge.position.set(0, 0.03, HR * 1.0 + 0.012);
    hg.add(bridge);
  }
  if (role === 'chefe' || role === 'dono') {
    const shoe = part(new THREE.TorusGeometry(HR * 0.98, 0.05, 10, 32, Math.PI * 1.25), mat(pp.hair, 0.25), pp.hair, 0.008);
    shoe.rotation.set(Math.PI / 2, 0, Math.PI * 0.875);
    shoe.position.y = 0.06;
    hg.add(shoe);
    if (role === 'chefe') {
      for (let i = 0; i < 3; i++) {
        const strand = part(new THREE.TorusGeometry(HR * 0.98, 0.012, 6, 20, 1.5), mat(pp.hair), pp.hair, 0);
        strand.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.75, 'ZYX');
        strand.position.set(-0.04 + i * 0.04, 0.02, -0.02);
        hg.add(strand);
      }
    } else {
      const h = topHat(0.92);
      h.position.y = HR * 0.88;
      hg.add(h);
    }
  }
  return ch;
}

// ------------------------------------------------------------------ catálogo

// ------------------------------------------------------------------ uso no jogo

/** No jogo todo mundo é Telinha (os bichos ficaram só no lab de personagens). */
export type Species = 'telinha';

/** Acessórios que o jogador pode escolher (câmera, tela larga e cartola são do X9, do chefe e do dono). */
export type Variant = 'voce' | 'bia' | 'caio';

export const PLAYABLE: { id: Variant; name: string; blurb: string }[] = [
  { id: 'voce', name: 'Post-it', blurb: 'Um lembrete colado na tela que balança a cada passo.' },
  { id: 'bia', name: 'Laço', blurb: 'Laço de fita no canto do monitor.' },
  { id: 'caio', name: 'Antena', blurb: 'Orelha de coelho que abre a cada susto.' },
];

export interface Look {
  species: Species;
  /** Cor do monitor. */
  color: string;
  tie: string;
  /** Acessório da Telinha: post-it, laço, antena... (e o visual fixo de X9, chefe e dono). */
  variant?: Role;
}

/** Tela da Telinha a partir da cor escolhida: carcaça clara, brilho saturado e fundo escuro do mesmo tom. */
function screenFor(color: string) {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const hex = (h: number, s: number, l: number) => `#${new THREE.Color().setHSL(h, s, l).getHexString()}`;
  return { shell: hex(hsl.h, hsl.s * 0.75, 0.74), glow: hex(hsl.h, Math.min(1, hsl.s + 0.15), 0.66), bg: hex(hsl.h, 0.5, 0.06) };
}

/** Monta um personagem do jogo pela aparência. */
export function makeCharacter(look: Look): Character {
  const role = look.variant ?? 'voce';
  const boss = isBoss(role);
  const id = { ...ID[role], c: look.color, tie: look.tie };
  return telinha(role, id, boss ? SCREEN[role] : screenFor(look.color));
}

/** Cores das mãos em 1ª pessoa: manga na cor do monitor + luva branca. */
export function pawColors(look: Look) {
  return { sleeve: look.color, hand: '#fbfaf5' };
}

export interface Concept {
  id: string;
  n: number;
  name: string;
  ref: string;
  pitch: string;
  face: string;
  good: string[];
  watch: string[];
  port: string;
  accent: string;
  build: (r: Role) => Character;
}

export const CONCEPTS: Concept[] = [
  {
    id: 'feijao', n: 1, name: 'Feijão', ref: 'PEAK', accent: '#ff8a3d',
    pitch: 'Corpo de feijão, braço e perna curtinhos e roupa de escritório. O rosto é um adesivo 2D colado no corpo que gira em volta dele quando o personagem olha.',
    face: 'Olho oval preto com brilho. No susto ele vira olho branco com pupila pequena. Boca de traço que abre, careta de dente e bigode 2D.',
    good: ['A silhueta mais limpa e fácil de ler de longe', 'Ótimo para física e ragdoll (PEAK puro)', 'Muda pouco do jogo atual'],
    watch: ['Sem pescoço: a cabeça não inclina', 'Corre o risco de ficar genérico, tipo Fall Guys'],
    port: 'Baixo: dá para trocar a Ball sem mexer no resto',
    build: feijao,
  },
  {
    id: 'semibo', n: 2, name: 'Semibô', ref: 'R.E.P.O.', accent: '#4da3ff',
    pitch: 'Robozinhos de cabeça grande sobre um pescoço de mola. A cabeça chacoalha a cada passo. Não têm boca: toda a atuação está nas pálpebras.',
    face: 'Olhão branco pintado sobre olhos saltados. Pálpebras de metal inclinam para bravo, preocupado ou ^^. Quando é pego, o olho vira espiral.',
    good: ['O mais engraçado em movimento (a cabeça balança)', 'Lê muito bem em primeira pessoa', 'Combina com o Fantasma e com o tom de "seguro"'],
    watch: ['Sem boca, falar depende de balão e gesto', 'Fica parecido demais com R.E.P.O.'],
    port: 'Médio: precisa de pescoço com mola e balões',
    build: semibo,
  },
  {
    id: 'telinha', n: 3, name: 'Telinha', ref: 'R.E.P.O. + escritório', accent: '#62f3ff',
    pitch: 'A cabeça é um monitor CRT colorido e o rosto é o que aparece na tela, em pixel com brilho. O chefe é uma tela widescreen e o X9 tem uma webcam na cabeça.',
    face: 'Rosto em pixel com scanline e brilho. ^^ quando está feliz, > < no pânico, carregando… no tédio e tela azul quando é pego pelo chefe.',
    good: ['O conceito mais "da casa": o tema é o PC', 'A tela azul de "pego" já é piada pronta', 'Brilha bem com o bloom do jogo'],
    watch: ['Rosto de pixel tem menos sutileza', 'A caixa quadrada se lê pior de costas'],
    port: 'Médio: a tela usa o mesmo canvas do PC do jogo',
    build: telinha,
  },
  {
    id: 'bichos', n: 4, name: 'Bichos', ref: 'PEAK + Aggretsuko', accent: '#7fcf6b',
    pitch: 'Fauna corporativa: a capivara estagiária (com a tangerina na cabeça), a gata do marketing e o sapo do TI. O X9 é um rato, o chefe é um buldogue e o dono é um tubarão.',
    face: 'Olho de bicho brilhante com dois reflexos. Cada espécie tem focinho e boca próprios: "w" de gato, dente de rato, sorriso de tubarão e caninos de buldogue.',
    good: ['O mais carismático e com mais cara de merch', 'O tipo de cada um se entende sem texto (rato = X9)', 'Capivara é a cara do Brasil'],
    watch: ['Dá mais trabalho por espécie (orelhas, focinho, rabo)', 'Cada skin nova é um bicho novo'],
    port: 'Médio-alto: um modelo por espécie',
    build: bichos,
  },
  {
    id: 'massinha', n: 5, name: 'Massinha', ref: 'Wobbly Life / Gang Beasts', accent: '#ff7eb6',
    pitch: 'Gente de massinha: cabeçona redonda, nariz de bolinha, cabelo em gomos e roupa de firma. É o mais "humano" e o que mais parece o colega de verdade.',
    face: 'Olho branco com íris e pálpebra cor da pele, sobrancelha da cor do cabelo e boca simples. O bigode 2D anima junto com a fala.',
    good: ['Faz o jogador se identificar com o colega', 'O cabelo vira skin barata (só esferas)', 'Funciona com qualquer tom de pele'],
    watch: ['O menos "diferentão" dos cinco', 'Pede mais cuidado de modelagem para não parecer amador'],
    port: 'Médio: cabeça e cabelo como peças',
    build: massinha,
  },
];

