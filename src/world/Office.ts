import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  carpetTex, ceilingTex, posterTex, signTex, tileTex, wallTex, woodTex, ballDoodle, puddleTex, paintTex,
  loungeFloorTex, skylineTex, glowTex, neonTex, rugTex,
} from './textures';

/** Dimensões da planta (metros). Origem da planta no canto superior esquerdo; x → direita, z → para baixo. */
export const MAP = { w: 30, d: 27, ox: 15, oz: 13.5, wallH: 3 };

/** Converte coordenadas da planta para o mundo (centrado). */
export const W = (mx: number, mz: number, y = 0) => new THREE.Vector3(mx - MAP.ox, y, mz - MAP.oz);

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Bloqueia visão (paredes, colunas). */
  tall?: boolean;
}

export interface Desk {
  index: number;
  side: 'L' | 'R';
  seat: THREE.Vector3;
  seatYaw: number;
  checkPos: THREE.Vector3;
  standPos: THREE.Vector3;
  screenCenter: THREE.Vector3;
  screenNormal: THREE.Vector3;
  screen: THREE.Mesh;
  /** Objetos clicáveis para sentar (tela + moldura). */
  click: THREE.Object3D[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  chair: THREE.Group;
  bin: THREE.Vector3;
  light: THREE.PointLight;
  crumbs: THREE.Group;
  puddle: THREE.Mesh;
  nameplate: THREE.Mesh;
}

export interface Arcade {
  stand: THREE.Vector3;
  yaw: number;
  screenCenter: THREE.Vector3;
  screenNormal: THREE.Vector3;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  light: THREE.PointLight;
  click: THREE.Object3D[];
}

export interface RaceChair {
  group: THREE.Group;
  home: THREE.Vector3;
  homeYaw: number;
}

const PAL = {
  wall: '#f4e7d0',
  teal: '#3aa6a0',
  orange: '#ff8a3d',
  coral: '#ff6b6b',
  yellow: '#ffd23f',
  mint: '#9be3c4',
  lilac: '#b79cff',
};

const PAINT = paintTex();
const mat = (color: string, rough = 0.85, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map: PAINT, ...extra });

const M = {
  wall: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, map: wallTex() }),
  wallPlain: mat(PAL.wall, 0.92),
  wallDark: mat('#e3d2b6', 0.92),
  base: mat('#7a5a44', 0.7),
  partition: mat('#c8e3df', 0.85),
  partitionFrame: mat('#5c6f86', 0.5, 0.2),
  wood: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, map: woodTex('#d9a066') }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, map: woodTex('#8a5a36') }),
  metal: mat('#b8c2cc', 0.35, 0.6),
  dark: mat('#2a3042', 0.45),
  white: mat('#f7f4ee', 0.5),
  plant: mat('#4fb86a', 0.75),
  plant2: mat('#2f9a57', 0.75),
  plant3: mat('#7bd17a', 0.75),
  pot: mat('#e0784a', 0.7),
  pot2: mat('#f2efe6', 0.6),
  red: mat('#e5484d', 0.5),
  glass: new THREE.MeshStandardMaterial({ color: '#cfeaff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  panel: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff1d6', emissiveIntensity: 1.6, roughness: 1 }),
  lampGlow: new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf8a', emissiveIntensity: 2.6, roughness: 1 }),
  ceiling: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, map: ceilingTex(), emissive: '#d9c3a0', emissiveIntensity: 0.55 }),
  frame: mat('#f7f4ee', 0.55),
};

export const CHAIR_COLORS = ['#ff8a3d', '#4da3ff', '#ff6b9a', '#ffd23f', '#9b7bff', '#3ddc97'];

const box = (w: number, h: number, d: number, m: THREE.Material, r = 0.03) => {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const mesh = new THREE.Mesh(rr > 0.002 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export class Office {
  readonly root = new THREE.Group();
  readonly colliders: AABB[] = [];
  readonly desks: Desk[] = [];
  readonly arcades: Arcade[] = [];
  readonly raceChairs: RaceChair[] = [];
  /** Lixeiras/cestas onde a bolinha de papel conta ponto (borda, mundo). */
  readonly bins: { rim: THREE.Vector3; r: number; hoop: boolean }[] = [];
  readonly panels: THREE.Mesh[] = [];
  readonly hallLights: THREE.PointLight[] = [];
  readonly shafts: THREE.Mesh[] = [];
  hemi!: THREE.HemisphereLight;
  sun!: THREE.DirectionalLight;
  fill!: THREE.AmbientLight;
  door!: THREE.Group;
  doorOpen = 0;
  clockHour!: THREE.Group;
  clockMin!: THREE.Group;
  whiteboard!: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  tv!: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  printerLight!: THREE.Mesh;
  pizzaSlices: THREE.Mesh[] = [];
  pizzaGroup!: THREE.Group;
  secCam!: THREE.Group;
  breakerLight!: THREE.Mesh;
  coffeeCupProto!: THREE.Group;
  paperProto!: THREE.Mesh;
  reportProto!: THREE.Mesh;
  foosball!: { center: THREE.Vector3; stands: THREE.Vector3[]; rods: THREE.Group[]; ball: THREE.Mesh };
  couch!: { seat: THREE.Vector3; yaw: number; stand: THREE.Vector3 };
  dust!: THREE.Points;
  private dustBase!: Float32Array;
  lightLevel = 1;

  readonly P = {
    bossDesk: W(15, 1.6),
    bossDoor: W(15, 4.0),
    bossDoorOut: W(15, 5.2),
    tray: W(13.4, 4.7),
    coffee: W(8.2, 19.1),
    printer: W(18.6, 19.0),
    stamp: W(20.8, 19.1),
    breaker: W(0.6, 19.4),
    pizza: W(11, 18.0),
    meeting: W(15, 11.5),
    secCam: W(15, 4.6, 2.85),
    vending: W(10.5, 25.5),
    hoop: W(19.5, 26.6, 2.3),
    ring: [W(8, 7), W(22, 7), W(22, 16), W(8, 16), W(7.5, 22.8), W(22.5, 23.2)],
    lounge: [W(8.5, 22.6), W(16.5, 22.5), W(22.5, 23.2)],
  };

  constructor() {
    this.buildShell();
    this.buildExterior();
    this.buildLights();
    this.buildCubicles();
    this.buildBossRoom();
    this.buildCenter();
    this.buildKitchen();
    this.buildPrinter();
    this.buildLounge();
    this.buildDecor();
    this.buildProtos();
  }

  private add(o: THREE.Object3D, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    o.position.copy(W(x, z, y));
    parent.add(o);
    return o;
  }

  private col(x0: number, z0: number, x1: number, z1: number, tall = false) {
    const a = W(Math.min(x0, x1), Math.min(z0, z1));
    const b = W(Math.max(x0, x1), Math.max(z0, z1));
    this.colliders.push({ minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z, tall });
  }

  /** Parede alinhada a um eixo, com rodapé; `y0/h` permitem peitoris e vergas de janelas. */
  private wall(x0: number, z0: number, x1: number, z1: number, h = MAP.wallH, t = 0.2, y0 = 0, collide = true, m: THREE.Material = M.wall) {
    const w = Math.abs(x1 - x0) || t;
    const d = Math.abs(z1 - z0) || t;
    const mesh = box(w, h, d, m, 0);
    this.add(mesh, (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    if (y0 === 0) {
      const bb = box(w + 0.03, 0.12, d + 0.03, M.base, 0);
      this.add(bb, (x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    }
    if (collide && y0 === 0) this.col((x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - d / 2, (x0 + x1) / 2 + w / 2, (z0 + z1) / 2 + d / 2, h > 1.5);
  }

  /** Janela num trecho de parede: peitoril + verga + caixilhos (vão livre para o sol). */
  private windowWall(axis: 'x' | 'z', fixed: number, a0: number, a1: number, sill = 0.7, top = 2.6) {
    const mid = (a0 + a1) / 2;
    const len = a1 - a0;
    const [x0, z0, x1, z1] = axis === 'x' ? [a0, fixed, a1, fixed] : [fixed, a0, fixed, a1];
    this.wall(x0, z0, x1, z1, sill, 0.2, 0, true);
    this.wall(x0, z0, x1, z1, MAP.wallH - top, 0.2, top, false);
    const ledge = box(axis === 'x' ? len : 0.34, 0.05, axis === 'x' ? 0.34 : len, M.wood, 0.015);
    this.add(ledge, axis === 'x' ? mid : fixed, sill + 0.025, axis === 'x' ? fixed : mid);
    const n = Math.max(2, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const p = a0 + (len * i) / n;
      const post = box(0.07, top - sill, 0.1, M.frame, 0.01);
      if (axis === 'x') this.add(post, p, sill + (top - sill) / 2, fixed);
      else {
        post.rotation.y = Math.PI / 2;
        this.add(post, fixed, sill + (top - sill) / 2, p);
      }
    }
    const tr = box(axis === 'x' ? len : 0.1, 0.06, axis === 'x' ? 0.1 : len, M.frame, 0.01);
    this.add(tr, axis === 'x' ? mid : fixed, sill + (top - sill) * 0.62, axis === 'x' ? fixed : mid);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, top - sill), M.glass);
    glass.castShadow = false;
    if (axis === 'z') glass.rotation.y = Math.PI / 2;
    this.add(glass, axis === 'x' ? mid : fixed, (sill + top) / 2, axis === 'x' ? fixed : mid);
  }

  private floor(x0: number, z0: number, x1: number, z1: number, m: THREE.Material, y = 0) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.add(f, (x0 + x1) / 2, y, (z0 + z1) / 2);
    return f;
  }

  // ------------------------------------------------------------------ casca
  private buildShell() {
    this.floor(0, 4, 30, 20, new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 0.95 }));
    this.floor(0, 20, 30, 27, new THREE.MeshStandardMaterial({ map: loungeFloorTex(), roughness: 0.55 }));
    this.floor(10, 0, 20, 4, new THREE.MeshStandardMaterial({ map: woodTex('#9a5f37', [4, 2]), roughness: 0.5 }));
    const bath = new THREE.MeshStandardMaterial({ map: tileTex('#eaf6f6', '#cfe9e8', 8, [2, 2]), roughness: 0.3 });
    this.floor(0, 0, 4, 4, bath);
    this.floor(26, 0, 30, 4, bath);
    this.floor(4, 0, 10, 4, M.wallDark);
    this.floor(20, 0, 26, 4, M.wallDark);
    this.floor(6, 17, 14, 20, new THREE.MeshStandardMaterial({ map: tileTex('#fff4e2', '#f2c9a0', 8, [4, 1.5]), roughness: 0.4 }), 0.004);

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(MAP.w + 0.4, 0.1, MAP.d + 0.4), M.ceiling);
    ceil.castShadow = true;
    ceil.receiveShadow = true;
    this.add(ceil, MAP.w / 2, MAP.wallH + 0.05, MAP.d / 2);

    this.wall(0, 0, 30, 0);
    this.wall(0, 0, 0, 4.6);
    this.windowWall('z', 0, 4.6, 18.6, 1.75, 2.75);
    this.wall(0, 18.6, 0, 21.2);
    this.windowWall('z', 0, 21.2, 25.6, 0.7, 2.6);
    this.wall(0, 25.6, 0, 27);
    this.wall(30, 0, 30, 4.6);
    this.windowWall('z', 30, 4.6, 18.6, 1.75, 2.75);
    this.wall(30, 18.6, 30, 27);
    this.wall(0, 27, 3, 27);
    this.windowWall('x', 27, 3, 9);
    this.wall(9, 27, 12, 27);
    this.windowWall('x', 27, 12, 18);
    this.wall(18, 27, 21, 27);
    this.windowWall('x', 27, 21, 27);
    this.wall(27, 27, 30, 27);

    this.wall(0, 4, 1.4, 4);
    this.wall(2.6, 4, 10, 4);
    this.wall(10, 4, 11.2, 4);
    this.wall(12.8, 4, 14.2, 4);
    this.wall(15.8, 4, 17.2, 4);
    this.wall(18.8, 4, 20, 4);
    this.wall(20, 4, 27.4, 4);
    this.wall(28.6, 4, 30, 4);
    for (const wx of [12, 18]) {
      this.wall(wx - 0.8, 4, wx + 0.8, 4, 1.0);
      this.wall(wx - 0.8, 4, wx + 0.8, 4, 0.8, 0.2, 2.2, false);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), M.glass);
      this.add(glass, wx, 1.6, 4);
      const slatMat = mat('#fff6e6', 0.6);
      for (let i = 0; i < 9; i++) {
        const slat = box(1.56, 0.012, 0.08, slatMat, 0);
        slat.rotation.x = 0.9;
        this.add(slat, wx, 1.08 + i * 0.13, 4.06);
      }
      this.col(wx - 0.8, 3.9, wx + 0.8, 4.1, true);
    }
    this.wall(4, 0, 4, 4);
    this.wall(10, 0, 10, 4);
    this.wall(20, 0, 20, 4);
    this.wall(26, 0, 26, 4);

    this.door = new THREE.Group();
    const leaf = box(1.55, 2.3, 0.07, M.woodDark, 0.02);
    leaf.position.set(0.78, 1.15, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat('#ffd23f', 0.3, 0.8));
    knob.position.set(1.38, 1.05, 0.06);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.17), new THREE.MeshBasicMaterial({ map: signTex('CHEFE', '#ffd23f', '#3a2400', 256, 64) }));
    plate.position.set(0.78, 1.8, 0.04);
    this.door.add(leaf, knob, plate);
    this.add(this.door, 14.22, 0, 4);
    this.wall(14.2, 4, 15.8, 4, 0.7, 0.2, 2.3, false);
    for (const dx of [14.18, 15.82]) this.add(box(0.1, 2.32, 0.28, M.frame, 0.01), dx, 1.16, 4);

    for (const [bx, label, colr] of [[2, '♀', '#ff6b9a'], [28, '♂', '#4da3ff']] as const) {
      const d = box(1.15, 2.2, 0.06, mat(colr, 0.5), 0.02);
      this.add(d, bx, 1.1, 4.02);
      this.col(bx - 0.6, 3.9, bx + 0.6, 4.1, true);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: signTex(label, '#ffffff', colr, 128, 128) }));
      this.add(s, bx, 1.75, 4.06);
      this.wall(bx - 0.6, 4, bx + 0.6, 4, 0.8, 0.2, 2.2, false);
    }

    // meia-parede z = 20 (vãos: 2.6-5.6, 14-16.8, 22.4-25.4)
    const half = (x0: number, x1: number) => {
      const w = x1 - x0;
      this.add(box(w, 1.1, 0.2, M.wallPlain, 0.02), (x0 + x1) / 2, 0.55, 20);
      this.add(box(w + 0.06, 0.06, 0.32, M.wood, 0.02), (x0 + x1) / 2, 1.13, 20);
      this.col(x0, 19.9, x1, 20.1);
    };
    half(0, 2.6);
    half(5.6, 14);
    half(16.8, 22.4);
    half(25.4, 30);
  }

  // ------------------------------------------------------------------ exterior
  private buildExterior() {
    const sky = new THREE.MeshBasicMaterial({ map: skylineTex(), toneMapped: false, fog: false });
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(90, 22), sky);
    s1.rotation.y = Math.PI;
    this.add(s1, 15, 7, 52);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(90, 22), sky);
    s2.rotation.y = Math.PI / 2;
    this.add(s2, -26, 7, 13.5);
    const s3 = new THREE.Mesh(new THREE.PlaneGeometry(90, 22), sky);
    s3.rotation.y = -Math.PI / 2;
    this.add(s3, 56, 7, 13.5);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: '#86c46e', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.add(ground, 15, -0.6, 13.5);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(40, 4), mat('#d8d0c2', 0.9));
    walk.rotation.x = -Math.PI / 2;
    this.add(walk, 15, -0.55, 29.2);
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + Math.random() * 0.4, 1), i % 2 ? M.plant : M.plant2);
      b.castShadow = true;
      this.add(b, -1 + i * 2.1, -0.1, 31.5 + Math.random());
    }
  }

  // ------------------------------------------------------------------ luz
  private buildLights() {
    this.hemi = new THREE.HemisphereLight('#fff0dc', '#4f7f88', 1.25);
    this.root.add(this.hemi);
    this.fill = new THREE.AmbientLight('#ffe7c4', 0.2);
    this.root.add(this.fill);
    this.sun = new THREE.DirectionalLight('#ffd9a3', 4.2);
    this.sun.position.copy(W(-6, 34, 13));
    this.sun.target.position.copy(W(14, 14, 0));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const c = this.sun.shadow.camera;
    c.left = -26;
    c.right = 26;
    c.top = 24;
    c.bottom = -24;
    c.near = 1;
    c.far = 80;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.root.add(this.sun, this.sun.target);
    const geo = new RoundedBoxGeometry(1.3, 0.05, 0.65, 2, 0.02);
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 3; z++) {
        const p = new THREE.Mesh(geo, M.panel);
        this.add(p, 5 + x * 5, 2.97, 7 + z * 4.5);
        this.panels.push(p);
      }
    for (const [x, z] of [[7, 8.5], [23, 8.5], [7, 15], [23, 15], [15, 6.5], [15, 17.5]]) {
      const l = new THREE.PointLight('#ffdcae', 7, 11, 1.6);
      this.add(l, x, 2.6, z);
      this.hallLights.push(l);
    }
    this.buildShafts();
  }

  /** Feixes de luz falsos (aditivos) + poeira flutuando. */
  private buildShafts() {
    const shaftMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color('#ffcf8f') }, uStrength: { value: 0.16 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vUv;
        void main(){ float e = smoothstep(0.0,0.25,vUv.x)*smoothstep(1.0,0.75,vUv.x); float l = smoothstep(0.0,0.2,vUv.y)*mix(0.35,1.0,vUv.y);
          gl_FragColor = vec4(uColor * e * l * uStrength, 1.0); }`,
      side: THREE.DoubleSide,
    });
    const dir = new THREE.Vector3().subVectors(this.sun.target.position, this.sun.position).normalize();
    for (const [x0, x1] of [[3, 9], [12, 18], [21, 27]]) {
      const len = 4.4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, len), shaftMat);
      const start = W((x0 + x1) / 2, 27, 1.65);
      m.position.copy(start.clone().addScaledVector(dir, len / 2));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      m.userData.noAO = true;
      m.renderOrder = 5;
      this.root.add(m);
      this.shafts.push(m);
    }
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const p = W(2 + Math.random() * 26, 21 + Math.random() * 5.8, 0.3 + Math.random() * 2.5);
      pos.set([p.x, p.y, p.z], i * 3);
    }
    this.dustBase = pos.slice();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.035, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe2b0', opacity: 0.8 }),
    );
    this.root.add(this.dust);
  }

  setLights(on: number) {
    this.lightLevel = on;
    this.hemi.intensity = 0.15 + 1.1 * on;
    this.sun.intensity = 0.6 + 3.6 * on;
    this.fill.intensity = 0.03 + 0.17 * on;
    M.panel.emissiveIntensity = 0.03 + 1.6 * on;
    M.lampGlow.emissiveIntensity = 0.1 + 2.5 * on;
    M.ceiling.emissiveIntensity = 0.04 + 0.51 * on;
    for (const l of this.hallLights) l.intensity = 7 * on;
    for (const s of this.shafts) (s.material as THREE.ShaderMaterial).uniforms.uStrength.value = 0.05 + 0.11 * on;
    for (const d of this.desks) d.light.intensity = 0.5 + 3 * (1 - on);
  }

  // ------------------------------------------------------------------ peças
  makeChair(color: string, boss = false) {
    const g = new THREE.Group();
    const seatMat = mat(color, 0.7);
    const seat = box(0.56, 0.1, 0.56, seatMat, 0.05);
    seat.position.y = 0.48;
    const back = box(0.52, boss ? 0.95 : 0.62, 0.09, seatMat, 0.05);
    back.position.set(0, boss ? 1.0 : 0.85, -0.25);
    back.rotation.x = -0.1;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.38), M.metal);
    post.position.y = 0.27;
    g.add(seat, back, post);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = box(0.3, 0.035, 0.05, M.dark, 0.015);
      leg.position.set(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15);
      leg.rotation.y = -a;
      const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.dark);
      wheel.position.set(Math.cos(a) * 0.29, 0.04, Math.sin(a) * 0.29);
      g.add(leg, wheel);
    }
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  makePlant(s = 1, kind = 0) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.36 * s, 16), kind % 2 ? M.pot2 : M.pot);
    pot.position.y = 0.18 * s;
    pot.castShadow = true;
    pot.receiveShadow = true;
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.18 * s, 16), mat('#5a3a22', 1));
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.35 * s;
    g.add(pot, soil);
    if (kind === 2) {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * s, 0.35 * s, 6, 12), M.plant2);
      c.position.y = 0.6 * s;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * s, 0.14 * s, 6, 10), M.plant2);
      arm.position.set(0.12 * s, 0.62 * s, 0);
      arm.rotation.z = -0.9;
      c.castShadow = arm.castShadow = true;
      g.add(c, arm);
      return g;
    }
    const leafGeo = new THREE.SphereGeometry(0.17 * s, 10, 8);
    const n = kind === 1 ? 11 : 8;
    for (let i = 0; i < n; i++) {
      const leaf = new THREE.Mesh(leafGeo, [M.plant, M.plant2, M.plant3][i % 3]);
      const a = (i / n) * Math.PI * 2;
      const h = (0.5 + (i % 3) * 0.17) * s * (kind === 1 ? 1.5 : 1);
      leaf.scale.set(0.55, 1.45, 0.3);
      leaf.position.set(Math.cos(a) * 0.13 * s, h, Math.sin(a) * 0.13 * s);
      leaf.rotation.set(Math.sin(a) * 0.55, -a, Math.cos(a) * 0.55);
      leaf.castShadow = true;
      g.add(leaf);
    }
    return g;
  }

  private makeBin(x: number, z: number, color: string, parent: THREE.Object3D = this.root) {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.46, 20, 1, true), mat(color, 0.55, 0, { side: THREE.DoubleSide }));
    bin.castShadow = true;
    bin.receiveShadow = true;
    this.add(bin, x, 0.23, z, parent);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 6, 24), M.metal);
    rim.rotation.x = Math.PI / 2;
    this.add(rim, x, 0.46, z, parent);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.16, 18), M.dark);
    bottom.rotation.x = -Math.PI / 2;
    this.add(bottom, x, 0.02, z, parent);
    const p = W(x, z, 0.46);
    this.bins.push({ rim: p, r: 0.17, hoop: false });
    return p;
  }

  // ------------------------------------------------------------------ cubículos
  private buildCubicles() {
    const zs = [7, 11.5, 16];
    const plates = ['VOCÊ', 'Bia', 'Caio', 'Duda', 'Edu', 'Fê'];
    let idx = 0;
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const wallX = side === 'L' ? 0 : 30;
      for (const cz of zs) {
        const g = new THREE.Group();
        const deskX = wallX + sx * 0.5;
        this.add(box(0.95, 0.06, 1.95, M.wood, 0.025), deskX, 0.75, cz, g);
        this.add(box(0.8, 0.7, 0.46, mat(CHAIR_COLORS[idx], 0.6), 0.03), deskX, 0.36, cz + 0.66, g);
        for (let i = 0; i < 3; i++) this.add(box(0.025, 0.025, 0.2, M.white, 0.01), deskX + sx * 0.41, 0.6 - i * 0.2, cz + 0.66, g);
        this.add(box(0.8, 0.72, 0.05, M.white, 0.015), deskX, 0.36, cz - 0.92, g);
        this.col(Math.min(wallX, wallX + sx * 0.97), cz - 0.97, Math.max(wallX, wallX + sx * 0.97), cz + 0.97);
        const monX = wallX + sx * 0.32;
        this.add(box(0.08, 0.3, 0.08, M.dark, 0.02), monX - sx * 0.04, 0.92, cz, g);
        this.add(box(0.26, 0.025, 0.22, M.dark, 0.012), monX - sx * 0.04, 0.79, cz, g);
        const bezel = box(0.07, 0.68, 1.08, mat('#2c3348', 0.4), 0.03);
        this.add(bezel, monX, 1.14, cz, g);
        const canvas = document.createElement('canvas');
        canvas.width = idx === 0 ? 1024 : 256;
        canvas.height = idx === 0 ? 640 : 160;
        const ctx = canvas.getContext('2d')!;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.96, 0.6),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.86, 0.86, 0.86) }),
        );
        screen.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.add(screen, monX + sx * 0.037, 1.14, cz, g);
        for (let k = 0; k < 3; k++) {
          const pi = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), mat(['#ffe066', '#ff9ec7', '#9be3c4'][(k + idx) % 3], 0.9, 0, { side: THREE.DoubleSide }));
          pi.rotation.y = screen.rotation.y;
          pi.rotation.z = (Math.random() - 0.5) * 0.4;
          this.add(pi, monX + sx * 0.04, 1.4 - k * 0.09, cz + (k % 2 ? 0.5 : -0.5), g);
        }
        this.add(box(0.18, 0.025, 0.52, mat('#eef0f4', 0.5), 0.012), wallX + sx * 0.72, 0.79, cz, g);
        this.add(box(0.1, 0.035, 0.065, mat('#eef0f4', 0.5), 0.017), wallX + sx * 0.72, 0.795, cz - 0.42, g);
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 16), mat(CHAIR_COLORS[(idx + 2) % 6], 0.4));
        mug.castShadow = true;
        this.add(mug, wallX + sx * 0.45, 0.835, cz + 0.74, g);
        const frame = box(0.03, 0.17, 0.14, M.woodDark, 0.01);
        frame.rotation.z = sx * 0.2;
        this.add(frame, wallX + sx * 0.18, 0.865, cz - 0.74, g);
        for (let k = 0; k < 4; k++) {
          const paper = box(0.3, 0.012, 0.22, M.white, 0);
          paper.rotation.y = (Math.random() - 0.5) * 0.3;
          this.add(paper, wallX + sx * 0.55, 0.785 + k * 0.013, cz - 0.62, g);
        }
        if (idx % 2 === 0) this.add(this.makePlant(0.6, 2), wallX + sx * 0.25, 0.78, cz + 0.4, g);
        const np = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshBasicMaterial({ map: signTex(plates[idx], idx === 0 ? PAL.yellow : '#ffffff', '#1b2233', 256, 64) }));
        np.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.add(np, wallX + 0.13 * sx, 1.6, cz, g);
        const chair = this.makeChair(CHAIR_COLORS[idx]);
        const seatX = wallX + sx * 1.45;
        this.add(chair, seatX, 0, cz, g);
        chair.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        const binP = this.makeBin(wallX + sx * 2.35, cz - 1.75, '#6c7f96', g);
        const light = new THREE.PointLight('#bfe0ff', 0.6, 3.2, 1.6);
        this.add(light, monX + sx * 0.45, 1.15, cz, g);
        const crumbs = new THREE.Group();
        for (let i = 0; i < 14; i++) {
          const c = box(0.025, 0.012, 0.025, mat('#c58a45'), 0);
          c.position.set((Math.random() - 0.5) * 0.4, 0.79, (Math.random() - 0.5) * 0.7);
          c.rotation.y = Math.random() * 3;
          crumbs.add(c);
        }
        crumbs.visible = false;
        this.add(crumbs, wallX + sx * 0.62, 0, cz, g);
        const puddle = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: puddleTex(), transparent: true, depthWrite: false }));
        puddle.rotation.x = -Math.PI / 2;
        puddle.visible = false;
        this.add(puddle, wallX + sx * 0.6, 0.785, cz - 0.3, g);
        this.root.add(g);
        this.desks.push({
          index: idx, side, seat: W(seatX, cz), seatYaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
          checkPos: W(wallX + sx * 3.25, cz),
          standPos: W(wallX + sx * 2.3, cz),
          screenCenter: W(monX + sx * 0.04, cz, 1.14),
          screenNormal: new THREE.Vector3(sx, 0, 0),
          screen, click: [screen, bezel], canvas, ctx, tex, chair, bin: binP, light, crumbs, puddle, nameplate: np,
        });
        idx++;
      }
      for (const pz of [4.75, 9.25, 13.75, 18.25]) {
        const len = 2.7;
        const px = wallX + sx * (len / 2);
        this.add(box(len, 1.12, 0.08, M.partition, 0.03), px, 0.56, pz);
        this.add(box(len + 0.02, 0.05, 0.11, M.partitionFrame, 0.02), px, 1.13, pz);
        this.add(box(0.09, 1.16, 0.11, M.partitionFrame, 0.02), wallX + sx * len, 0.58, pz);
        this.col(px - len / 2, pz - 0.06, px + len / 2, pz + 0.06);
      }
    }
  }

  // ------------------------------------------------------------------ sala do chefe
  private buildBossRoom() {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), mat('#8c2a3c', 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    this.add(rug, 15, 0.41, 1.4);
    this.add(box(5, 0.4, 2.2, M.woodDark, 0.04), 15, 0.2, 1.3);
    this.add(box(2.6, 0.09, 1.05, M.woodDark, 0.04), 15, 1.15, 2.1);
    this.add(box(2.6, 0.75, 0.07, mat('#5e3420', 0.5), 0.03), 15, 0.78, 2.6);
    this.add(box(2.62, 0.05, 0.08, mat('#ffd23f', 0.3, 0.8), 0.01), 15, 1.05, 2.62);
    this.col(13.7, 1.6, 16.3, 2.65);
    const chair = this.makeChair('#7a2238', true);
    chair.scale.setScalar(1.5);
    this.add(chair, 15, 0.4, 1.1);
    this.add(box(0.9, 0.55, 0.05, M.dark, 0.02), 14.3, 1.5, 2.3);
    this.add(box(0.22, 0.08, 0.16, M.red, 0.03), 16.0, 1.24, 2.2);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.25, 12), mat('#ffd23f', 0.2, 0.9)), 16.4, 1.32, 2.0);
    this.add(box(1.8, 2.2, 0.4, M.woodDark, 0.02), 11.2, 1.1, 0.3);
    const bookCols = ['#e5484d', '#4da3ff', '#ffd23f', '#3ddc97', '#9b7bff', '#fff6e6'];
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 9; i++) this.add(box(0.12, 0.3 + Math.random() * 0.08, 0.25, mat(bookCols[(i + r) % 6], 0.6), 0.015), 10.5 + i * 0.16, 0.38 + r * 0.5, 0.45);
    this.col(10, 0, 20, 0.6);
    const pic = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.25),
      new THREE.MeshBasicMaterial({ map: posterTex('CHEFE DO MÊS', 'todo mês, desde 1998', '#f5d76e', (g) => ballDoodle(g, 114, 120, 70, '#9b2c47')) }),
    );
    this.add(pic, 17.8, 1.9, 0.12);
    this.add(this.makePlant(1.4, 1), 19.3, 0, 0.6);
    this.add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 16, 1, true), M.lampGlow), 13.9, 1.55, 1.9);
    this.add(new THREE.PointLight('#ffc27a', 2.5, 4, 1.8), 13.9, 1.45, 2.0);
    this.add(box(0.5, 0.95, 0.4, M.white, 0.03), 13.4, 0.475, 4.55);
    this.add(box(0.55, 0.04, 0.42, M.metal, 0.02), 13.4, 0.97, 4.55);
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.12), new THREE.MeshBasicMaterial({ map: signTex('BANDEJA', '#2F5FA8', '#fff', 256, 64) })), 13.4, 0.75, 4.76);
    this.col(13.15, 4.35, 13.65, 4.75);
    const wb = document.createElement('canvas');
    wb.width = 512;
    wb.height = 320;
    const wtex = new THREE.CanvasTexture(wb);
    wtex.colorSpace = THREE.SRGBColorSpace;
    this.whiteboard = { canvas: wb, ctx: wb.getContext('2d')!, tex: wtex };
    this.drawWhiteboard(['BOSS KEY S.A.', 'Metas da semana:', '• SINERGIA', '• FOCO', '• ☕']);
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.35 })), 7, 1.65, 4.12);
    this.add(box(2.32, 1.48, 0.04, M.metal, 0.02), 7, 1.65, 4.09);
    const clock = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 32), M.white);
    face.rotation.x = Math.PI / 2;
    clock.add(face, new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 32), mat(PAL.orange, 0.5)));
    for (let i = 0; i < 12; i++) {
      const tick = box(0.02, 0.06, 0.01, M.dark, 0);
      const a = (i / 12) * Math.PI * 2;
      tick.position.set(Math.sin(a) * 0.26, Math.cos(a) * 0.26, 0.03);
      tick.rotation.z = -a;
      clock.add(tick);
    }
    this.clockHour = new THREE.Group();
    const hh = box(0.025, 0.15, 0.01, M.dark, 0);
    hh.position.y = 0.07;
    this.clockHour.add(hh);
    this.clockMin = new THREE.Group();
    const mh = box(0.018, 0.23, 0.01, M.red, 0);
    mh.position.y = 0.11;
    this.clockMin.add(mh);
    this.clockHour.position.z = 0.04;
    this.clockMin.position.z = 0.05;
    clock.add(this.clockHour, this.clockMin);
    this.add(clock, 15, 2.62, 4.14);
    this.secCam = new THREE.Group();
    const body = box(0.18, 0.14, 0.32, M.white, 0.03);
    body.rotation.x = 0.5;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 14), M.dark);
    lens.rotation.x = Math.PI / 2 + 0.5;
    lens.position.set(0, -0.08, 0.15);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false }));
    led.position.set(0.06, 0.02, 0.15);
    const arm = box(0.04, 0.15, 0.04, M.metal, 0);
    arm.position.y = 0.1;
    this.secCam.add(body, lens, led, arm);
    this.secCam.visible = false;
    this.add(this.secCam, 15, 2.8, 4.5);
  }

  drawWhiteboard(lines: string[], highlight = -1) {
    const { ctx: g, canvas: c, tex } = this.whiteboard;
    g.fillStyle = '#fbfbf7';
    g.fillRect(0, 0, c.width, c.height);
    g.textBaseline = 'top';
    lines.forEach((l, i) => {
      g.font = i === 0 ? '400 42px "Darumadrop One", Fredoka, sans-serif' : '500 32px Fredoka, sans-serif';
      if (i === highlight) {
        g.fillStyle = 'rgba(255,210,63,0.6)';
        g.fillRect(14, 20 + i * 52 - 4, c.width - 28, 46);
      }
      g.fillStyle = i === 0 ? '#e5484d' : '#1b2233';
      g.fillText(l, 24, 20 + i * 52);
    });
    tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ centro
  private buildCenter() {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.6), mat('#f2c38a', 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    this.add(rug, 15, 0.006, 11.5);
    this.add(box(6, 0.1, 2.5, M.wood, 0.06), 15, 0.76, 11.5);
    for (const [dx, dz] of [[-2.6, -0.9], [2.6, -0.9], [-2.6, 0.9], [2.6, 0.9]]) this.add(box(0.12, 0.72, 0.12, M.dark, 0.03), 15 + dx, 0.36, 11.5 + dz);
    this.col(12, 10.25, 18, 12.75);
    for (let i = 0; i < 3; i++)
      for (const s of [-1, 1]) {
        const ch = this.makeChair(CHAIR_COLORS[(i * 2 + (s > 0 ? 1 : 0)) % 6]);
        this.add(ch, 13 + i * 2, 0, 11.5 + s * 1.65);
        ch.rotation.y = s > 0 ? Math.PI : 0;
      }
    this.add(box(0.4, 0.02, 0.28, M.metal, 0.01), 14, 0.82, 11.2);
    const lapScreen = box(0.4, 0.26, 0.015, M.dark, 0.01);
    lapScreen.rotation.x = -0.3;
    this.add(lapScreen, 14, 0.95, 11.05);
    for (const x of [13, 17]) {
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0), M.dark), x, 2.5, 11.5);
      this.add(new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 24, 1, true), mat(PAL.teal, 0.5, 0, { side: THREE.DoubleSide })), x, 1.88, 11.5);
      this.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), M.lampGlow), x, 1.76, 11.5);
      this.add(new THREE.PointLight('#ffcf8a', 4, 5, 1.8), x, 1.65, 11.5);
    }
    for (const [cx, cz] of [[7, 5], [23, 5], [7, 16], [23, 16]]) {
      this.add(box(0.8, 3, 0.8, M.wallPlain, 0.05), cx, 1.5, cz);
      this.add(box(0.86, 0.12, 0.86, M.base, 0.02), cx, 0.06, cz);
      this.add(box(0.84, 0.06, 0.84, mat(PAL.teal, 0.6), 0.01), cx, 1.08, cz);
      this.col(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4, true);
    }
  }

  // ------------------------------------------------------------------ cozinha
  private buildKitchen() {
    this.add(box(7.6, 0.9, 0.7, mat('#fff6e6', 0.55), 0.04), 10, 0.45, 19.55);
    this.add(box(7.7, 0.06, 0.78, mat('#3b4258', 0.3), 0.02), 10, 0.93, 19.55);
    for (let i = 0; i < 6; i++) this.add(box(1.15, 0.7, 0.02, mat(i % 2 ? '#ffb4a2' : '#9be3c4', 0.6), 0.02), 6.85 + i * 1.26, 0.45, 19.19);
    this.col(6.2, 19.15, 13.8, 20);
    const cm = new THREE.Group();
    const cmBody = box(0.5, 0.65, 0.45, mat('#30374d', 0.4), 0.06);
    cmBody.position.y = 0.33;
    const cmTop = box(0.52, 0.12, 0.47, M.red, 0.05);
    cmTop.position.y = 0.7;
    const spout = box(0.12, 0.08, 0.12, M.metal, 0.02);
    spout.position.set(0, 0.4, -0.22);
    const cmLight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    cmLight.position.set(0.16, 0.55, -0.23);
    cm.add(cmBody, cmTop, spout, cmLight);
    this.add(cm, 8.2, 0.96, 19.55);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: signTex('☕ CAFÉ', '#3b2416', '#ffd9a0', 256, 64) }));
    this.add(sign, 8.2, 1.85, 19.4);
    for (let i = 0; i < 3; i++) this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 14), mat(['#ffd23f', '#ff8a3d', '#4da3ff'][i], 0.4)), 9.2 + i * 0.22, 1.05, 19.7);
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.white), 12.2, 1.16, 19.6);
    for (let i = 0; i < 5; i++) this.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(['#ff6b6b', '#ffd23f', '#7bd17a'][i % 3], 0.5)), 12.1 + (i % 3) * 0.08, 1.06 + Math.floor(i / 3) * 0.07, 19.55 + (i % 2) * 0.08);
    this.add(box(0.8, 1.9, 0.7, mat('#dff3ff', 0.3, 0.1), 0.08), 5.6, 0.95, 18.9);
    this.col(5.2, 18.55, 6.0, 19.25, true);
    this.add(box(0.03, 0.5, 0.03, M.metal, 0), 5.9, 1.2, 18.55);
    this.add(box(2.2, 0.9, 0.9, M.wood, 0.05), 11, 0.45, 18.0);
    this.col(9.9, 17.55, 12.1, 18.45);
    for (const sx of [10.2, 11.8]) {
      const stool = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 16), mat(PAL.orange, 0.5));
      seat.position.y = 0.72;
      seat.castShadow = true;
      const legM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 8), M.metal);
      legM.position.y = 0.35;
      stool.add(seat, legM);
      this.add(stool, sx, 0, 17.1);
    }
    this.pizzaGroup = new THREE.Group();
    const boxMat = mat('#d7b98a', 0.8);
    this.pizzaGroup.add(box(0.7, 0.04, 0.7, boxMat, 0.01));
    const lid = box(0.7, 0.04, 0.7, boxMat, 0.01);
    lid.position.set(0, 0.35, -0.35);
    lid.rotation.x = -Math.PI / 2;
    this.pizzaGroup.add(lid);
    const sliceMat = mat('#f3b23c', 0.6);
    const pep = mat('#d63c2f', 0.5);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 12, 1, false, (i / 6) * Math.PI * 2, Math.PI / 3), sliceMat);
      s.position.y = 0.04;
      for (let k = 0; k < 2; k++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 10), pep);
        const a = ((i + 0.3 + k * 0.4) / 6) * Math.PI * 2;
        p.position.set(Math.sin(a) * 0.17, 0.022, Math.cos(a) * 0.17);
        s.add(p);
      }
      s.castShadow = true;
      this.pizzaGroup.add(s);
      this.pizzaSlices.push(s);
    }
    this.pizzaGroup.visible = false;
    this.add(this.pizzaGroup, 11, 0.92, 18.0);
    // disjuntor (parede oeste, perto da cozinha)
    const brk = box(0.12, 0.55, 0.4, mat('#9aa6b6', 0.5, 0.3), 0.02);
    this.add(brk, 0.16, 1.5, 19.4);
    this.breakerLight = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    this.add(this.breakerLight, 0.24, 1.68, 19.4);
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: signTex('⚡ DISJUNTOR', '#ffd23f', '#111', 256, 64) }));
    bs.rotation.y = Math.PI / 2;
    this.add(bs, 0.12, 1.1, 19.4);
    const wc = new THREE.Group();
    const wcb = box(0.4, 1.0, 0.4, M.white, 0.05);
    wcb.position.y = 0.5;
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.45, 16), new THREE.MeshStandardMaterial({ color: '#7cc8ff', roughness: 0.1, transparent: true, opacity: 0.6 }));
    jug.position.y = 1.25;
    wc.add(wcb, jug);
    this.add(wc, 4.6, 0, 19.3);
    this.col(4.4, 19.1, 4.8, 19.5);
  }

  private buildPrinter() {
    this.add(box(1.2, 0.75, 0.7, M.white, 0.03), 18.6, 0.375, 19.55);
    this.add(box(0.9, 0.45, 0.6, mat('#e8ecf1', 0.4), 0.06), 18.6, 0.98, 19.55);
    this.add(box(0.92, 0.05, 0.62, M.dark, 0.02), 18.6, 1.22, 19.55);
    this.add(box(0.5, 0.02, 0.35, M.white, 0), 18.6, 1.0, 19.15);
    this.printerLight = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    this.add(this.printerLight, 18.95, 1.12, 19.25);
    this.col(17.9, 19.15, 19.3, 20);
    this.add(box(1.0, 0.75, 0.6, M.wood, 0.03), 20.8, 0.375, 19.6);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.15, 12), M.red), 20.8, 0.83, 19.5);
    this.col(20.3, 19.3, 21.3, 20);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), new THREE.MeshBasicMaterial({ map: signTex('🖨 IMPRESSORA', '#ffffff', '#1b2233', 256, 64) }));
    s.rotation.y = Math.PI;
    this.add(s, 18.6, 1.6, 19.88);
  }

  // ------------------------------------------------------------------ sala de descompressão
  private buildLounge() {
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ map: rugTex('#ff8a3d', '#ffd23f', '#fff6e6'), roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    this.add(rug, 5, 0.008, 23.6);
    const sofaMat = mat('#4da3ff', 0.85);
    const sofa = new THREE.Group();
    const seatB = box(3.0, 0.42, 0.95, sofaMat, 0.15);
    seatB.position.y = 0.32;
    const backB = box(3.0, 0.7, 0.3, sofaMat, 0.14);
    backB.position.set(0, 0.72, 0.36);
    const armL = box(0.32, 0.62, 1.0, sofaMat, 0.14);
    armL.position.set(-1.5, 0.42, 0);
    const armR = armL.clone();
    armR.position.x = 1.5;
    sofa.add(seatB, backB, armL, armR);
    for (let i = 0; i < 3; i++) {
      const cush = box(0.85, 0.2, 0.8, mat('#79bbff', 0.9), 0.09);
      cush.position.set(-0.95 + i * 0.95, 0.6, -0.04);
      sofa.add(cush);
    }
    const pillow = box(0.5, 0.42, 0.14, mat(PAL.yellow, 0.9), 0.08);
    pillow.position.set(-1.05, 0.86, 0.12);
    pillow.rotation.set(-0.2, 0.3, 0.15);
    sofa.add(pillow);
    sofa.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.add(sofa, 5, 0, 25.9);
    this.col(3.3, 25.3, 6.7, 26.5);
    this.couch = { seat: W(5.4, 25.75), yaw: Math.PI, stand: W(5.4, 24.7) };
    this.add(box(1.3, 0.08, 0.7, M.wood, 0.04), 5, 0.42, 23.8);
    for (const [dx, dz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) this.add(box(0.06, 0.4, 0.06, M.dark, 0.02), 5 + dx, 0.2, 23.8 + dz);
    this.col(4.35, 23.45, 5.65, 24.15);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 14), mat(PAL.coral, 0.4)), 5.3, 0.51, 23.75);
    this.add(box(2.0, 0.5, 0.45, M.woodDark, 0.04), 5, 0.25, 20.55);
    this.col(4.0, 20.3, 6.0, 20.8);
    const tvc = document.createElement('canvas');
    tvc.width = 512;
    tvc.height = 288;
    const tvt = new THREE.CanvasTexture(tvc);
    tvt.colorSpace = THREE.SRGBColorSpace;
    this.tv = { canvas: tvc, ctx: tvc.getContext('2d')!, tex: tvt };
    this.add(box(1.7, 0.98, 0.08, M.dark, 0.03), 5, 1.05, 20.6);
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: tvt, toneMapped: false, color: new THREE.Color(0.8, 0.8, 0.8) })), 5, 1.05, 20.65);
    for (const [x, z, c] of [[2.2, 23.0, PAL.coral], [7.9, 22.6, PAL.mint], [24.2, 25.7, PAL.yellow], [26.1, 25.3, PAL.lilac]] as const) {
      const bb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), mat(c, 0.9));
      bb.scale.set(1, 0.62, 1);
      bb.castShadow = true;
      bb.receiveShadow = true;
      this.add(bb, x, 0.28, z);
      this.col(x - 0.35, z - 0.35, x + 0.35, z + 0.35);
    }
    // pebolim
    const fb = new THREE.Group();
    const fbBody = box(1.5, 0.3, 0.85, mat('#3aa6a0', 0.6), 0.05);
    fbBody.position.y = 0.82;
    const field = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.72), mat('#5ec46c', 0.9));
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.975;
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.72), mat('#ffffff', 0.8));
    lines.rotation.x = -Math.PI / 2;
    lines.position.y = 0.98;
    fb.add(fbBody, field, lines);
    for (const [dx, dz] of [[-0.62, -0.32], [0.62, -0.32], [-0.62, 0.32], [0.62, 0.32]]) {
      const l = box(0.09, 0.7, 0.09, M.dark, 0.02);
      l.position.set(dx, 0.35, dz);
      fb.add(l);
    }
    const rods: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
      const rg = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.25, 8), M.metal);
      rod.rotation.x = Math.PI / 2;
      rg.add(rod);
      const handleM = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10), M.dark);
      handleM.rotation.x = Math.PI / 2;
      handleM.position.z = i % 2 ? 0.66 : -0.66;
      rg.add(handleM);
      for (let k = 0; k < 2; k++) {
        const man = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(i % 2 ? PAL.orange : '#4da3ff', 0.5));
        man.scale.set(1, 1.5, 0.8);
        man.position.set(0, -0.03, (k - 0.5) * 0.36);
        rg.add(man);
      }
      rg.position.set(-0.55 + i * 0.22, 1.04, 0);
      fb.add(rg);
      rods.push(rg);
    }
    const fball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), mat('#ffffff', 0.4));
    fball.position.set(0, 1.0, 0);
    fb.add(fball);
    fb.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.add(fb, 15.3, 0, 23.4);
    this.col(14.5, 22.95, 16.1, 23.85);
    this.foosball = { center: W(15.3, 23.4, 1.0), stands: [W(15.3, 24.45), W(15.3, 22.35)], rods, ball: fball };
    // fliperamas (parede leste)
    const cabCols = [['#9b7bff', '#ff6b9a'], ['#ff8a3d', '#ffd23f']];
    for (let i = 0; i < 2; i++) {
      const z = 22.2 + i * 1.6;
      const cab = new THREE.Group();
      const [c1, c2] = cabCols[i];
      const bodyC = box(0.8, 1.9, 0.8, mat(c1, 0.55), 0.06);
      bodyC.position.y = 0.95;
      const marquee = box(0.82, 0.22, 0.3, mat(c2, 0.4, 0, { emissive: c2, emissiveIntensity: 0.6 }), 0.04);
      marquee.position.set(0, 1.78, -0.3);
      const panel = box(0.82, 0.12, 0.42, M.dark, 0.04);
      panel.position.set(0, 1.0, -0.42);
      panel.rotation.x = 0.35;
      for (let k = 0; k < 3; k++) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), mat(['#ff4d6d', '#ffd23f', '#3ddc97'][k], 0.3));
        btn.position.set(0.05 + k * 0.1, 1.08, -0.47);
        btn.rotation.x = 0.35;
        cab.add(btn);
      }
      const stick = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), M.red);
      stick.position.set(-0.2, 1.13, -0.47);
      cab.add(bodyC, marquee, panel, stick);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 400;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.85, 0.85, 0.85) }));
      scr.position.set(0, 1.42, -0.41);
      scr.rotation.set(-0.12, Math.PI, 0);
      cab.add(scr);
      cab.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      cab.rotation.y = Math.PI / 2;
      this.add(cab, 29.45, 0, z);
      const light = new THREE.PointLight(c2, 1.4, 3, 1.8);
      this.add(light, 28.6, 1.4, z);
      this.col(29.0, z - 0.42, 30, z + 0.42, true);
      this.arcades.push({
        stand: W(28.2, z), yaw: Math.PI / 2, screenCenter: W(29.04, z, 1.42), screenNormal: new THREE.Vector3(-1, 0, 0),
        canvas, ctx: canvas.getContext('2d')!, tex, light, click: [scr, bodyC],
      });
    }
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: neonTex('chill zone', '#ff6bd5'), transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    neon.rotation.y = -Math.PI / 2;
    this.add(neon, 29.88, 2.45, 23.0);
    this.add(new THREE.PointLight('#ff6bd5', 1.5, 4, 2), 29.2, 2.3, 23.0);
    // cesta de basquete
    this.add(box(1.0, 0.65, 0.05, M.white, 0.02), 19.5, 2.55, 26.85);
    this.add(box(0.4, 0.3, 0.06, mat(PAL.orange, 0.5), 0.005), 19.5, 2.45, 26.83);
    const rimH = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 28), mat(PAL.orange, 0.4, 0.3));
    rimH.rotation.x = Math.PI / 2;
    this.add(rimH, 19.5, 2.3, 26.6);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', wireframe: true })), 19.5, 2.14, 26.6);
    this.bins.push({ rim: W(19.5, 26.6, 2.3), r: 0.17, hoop: true });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.06), mat('#ffffff', 0.8));
    line.rotation.x = -Math.PI / 2;
    this.add(line, 19.5, 0.012, 23.8);
    this.makeBin(21.0, 26.3, PAL.orange);
    // máquina de lanches
    this.add(box(1.1, 1.95, 0.8, mat('#e5484d', 0.5), 0.06), 10.5, 0.975, 26.45);
    const vcan = document.createElement('canvas');
    vcan.width = 256;
    vcan.height = 360;
    const vg = vcan.getContext('2d')!;
    vg.fillStyle = '#1b2236';
    vg.fillRect(0, 0, 256, 360);
    const snackCols = ['#ffd23f', '#ff8a3d', '#3ddc97', '#4da3ff', '#ff6b9a', '#b79cff'];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 4; c++) {
        vg.fillStyle = snackCols[(r * 4 + c) % 6];
        vg.beginPath();
        vg.roundRect(18 + c * 58, 16 + r * 66, 44, 50, 8);
        vg.fill();
        vg.fillStyle = 'rgba(255,255,255,0.4)';
        vg.fillRect(24 + c * 58, 22 + r * 66, 10, 30);
        vg.fillStyle = '#9aa3b8';
        vg.fillRect(14 + c * 58, 68 + r * 66, 52, 4);
      }
    const vtex = new THREE.CanvasTexture(vcan);
    vtex.colorSpace = THREE.SRGBColorSpace;
    const vfront = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.3), new THREE.MeshBasicMaterial({ map: vtex, toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }));
    vfront.rotation.y = Math.PI;
    this.add(vfront, 10.35, 1.2, 26.04);
    this.col(9.95, 26.05, 11.05, 26.9, true);
    for (const [x, z, yaw] of [[22.6, 21.4, 0.4], [24.0, 21.9, -0.3]] as const) {
      const ch = this.makeChair(x < 23 ? '#ff4d6d' : '#3ddc97');
      this.add(ch, x, 0, z);
      ch.rotation.y = yaw;
      this.raceChairs.push({ group: ch, home: W(x, z), homeYaw: yaw });
    }
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6), M.dark), 1.5, 0.8, 26.2);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.32, 20, 1, true), mat('#fff3d6', 0.8, 0, { side: THREE.DoubleSide, emissive: '#ffcf8a', emissiveIntensity: 0.6 })), 1.5, 1.7, 26.2);
    this.add(new THREE.PointLight('#ffc27a', 3, 5, 1.8), 1.5, 1.6, 26.0);
    this.add(this.makePlant(1.6, 1), 1.0, 0, 21.2);
    this.add(this.makePlant(1.5, 1), 28.9, 0, 26.2);
    this.add(this.makePlant(1.2, 0), 27.6, 0, 20.9);
    this.col(0.7, 20.9, 1.3, 21.5);
    this.col(28.6, 25.9, 29.2, 26.5);
    this.col(27.3, 20.6, 27.9, 21.2);
  }

  private buildDecor() {
    for (const [x, z, k] of [[4.6, 5, 0], [25.4, 5, 1], [9.5, 4.6, 0], [20.5, 4.6, 0], [25.6, 19.3, 1]] as const) {
      this.add(this.makePlant(1, k), x, 0, z);
      this.col(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
    const posters: [string, string, string, (g: CanvasRenderingContext2D) => void, number, number, number, number][] = [
      ['SINERGIA', 'juntos enrolamos mais', '#4da3ff', (g) => { ballDoodle(g, 70, 110, 45, '#ff8a3d'); ballDoodle(g, 158, 110, 45, '#A8D5A2'); }, 24.5, 1.7, 4.12, 0],
      ['AGUENTA FIRME', 'só faltam 4 dias', '#ffd23f', (g) => { g.strokeStyle = '#5a3a1a'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, 40); g.lineTo(208, 40); g.stroke(); ballDoodle(g, 114, 120, 55, '#ff6b9a'); }, 0.12, 1.75, 20.0 + 0.6, Math.PI / 2],
      ['FOCO', 'na planilha (rs)', '#ff8a3d', (g) => { g.fillStyle = '#E8F2E8'; g.fillRect(30, 40, 168, 120); g.strokeStyle = '#3E9B5B'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(30, 60 + i * 20); g.lineTo(198, 60 + i * 20); g.stroke(); } }, 28.5, 1.7, 26.88, Math.PI],
    ];
    for (const [t, s, bg, d, x, y, z, rot] of posters) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.13), new THREE.MeshStandardMaterial({ map: posterTex(t, s, bg, d), roughness: 0.6 }));
      p.rotation.y = rot;
      this.add(p, x, y, z);
    }
  }

  private buildProtos() {
    const cup = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 16), M.white);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 0.06, 16), mat('#a0703f', 0.8));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16), mat('#3b2416', 0.5));
    lid.position.y = 0.075;
    c.castShadow = true;
    cup.add(c, sleeve, lid);
    this.coffeeCupProto = cup;
    this.paperProto = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 1), new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.9, flatShading: true }));
    this.paperProto.castShadow = true;
    this.reportProto = box(0.22, 0.03, 0.3, M.white, 0.005);
  }

  // ------------------------------------------------------------------ atualização
  update(dt: number, dayT01: number, time: number) {
    this.door.rotation.y += (-this.doorOpen * 1.6 - this.door.rotation.y) * Math.min(1, dt * 7);
    const hours = 9 + dayT01 * 9;
    this.clockHour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    this.clockMin.rotation.z = -((hours % 1) * Math.PI * 2);
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] = this.dustBase[i] + Math.sin(time * 0.3 + i) * 0.15;
      a[i + 1] = this.dustBase[i + 1] + Math.sin(time * 0.2 + i * 0.7) * 0.2;
      a[i + 2] = this.dustBase[i + 2] + Math.cos(time * 0.25 + i * 1.3) * 0.15;
    }
    p.needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.25 + 0.55 * this.lightLevel;
  }

  drawTV(t: number) {
    const { ctx: g, canvas: c, tex } = this.tv;
    const hue = (t * 20) % 360;
    const gr = g.createLinearGradient(0, 0, c.width, c.height);
    gr.addColorStop(0, `hsl(${hue},70%,55%)`);
    gr.addColorStop(1, `hsl(${(hue + 60) % 360},70%,45%)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    ballDoodle(g, 256 + Math.sin(t * 1.5) * 120, 150 - Math.abs(Math.sin(t * 3)) * 40, 50, '#ffd23f');
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 240, c.width, 48);
    g.fillStyle = '#fff';
    g.font = '700 26px Fredoka, sans-serif';
    g.fillText('📺 CANAL DA BOLA · ao vivo', 16, 272);
    tex.needsUpdate = true;
  }

  collide(p: THREE.Vector3, r: number) {
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (r - d);
          p.z += (dz / d) * (r - d);
        } else {
          const ex = Math.min(p.x - b.minX, b.maxX - p.x);
          const ez = Math.min(p.z - b.minZ, b.maxZ - p.z);
          if (ex < ez) p.x = p.x - b.minX < b.maxX - p.x ? b.minX - r : b.maxX + r;
          else p.z = p.z - b.minZ < b.maxZ - p.z ? b.minZ - r : b.maxZ + r;
        }
      }
    }
  }

  get tallColliders(): AABB[] {
    return (this._tall ??= this.colliders.filter((c) => c.tall));
  }
  private _tall: AABB[] | null = null;

  lineOfSight(a: THREE.Vector3, b: THREE.Vector3) {
    const steps = Math.ceil(a.distanceTo(b) / 0.25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const c of this.tallColliders) if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
    }
    return true;
  }
}
