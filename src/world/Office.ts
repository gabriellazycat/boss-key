import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { carpetTex, ceilingTex, posterTex, signTex, tileTex, wallTex, woodTex, ballDoodle, puddleTex } from './textures';

/** Converte coordenadas da planta (origem no canto sup. esq., metros) para o mundo. */
export const W = (mx: number, mz: number, y = 0) => new THREE.Vector3(mx - 15, y, mz - 10);

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Desk {
  index: number;
  side: 'L' | 'R';
  /** Posição da bola sentada (mundo). */
  seat: THREE.Vector3;
  seatYaw: number;
  /** Onde o chefe para para o CheckScreen. */
  checkPos: THREE.Vector3;
  /** Onde a bola fica em pé para sentar/levantar. */
  standPos: THREE.Vector3;
  screenCenter: THREE.Vector3;
  screenNormal: THREE.Vector3;
  screen: THREE.Mesh;
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

const M = {
  wall: new THREE.MeshStandardMaterial({ color: '#EDE8DC', roughness: 0.9, map: wallTex() }),
  wallDark: new THREE.MeshStandardMaterial({ color: '#d9d2c2', roughness: 0.9 }),
  base: new THREE.MeshStandardMaterial({ color: '#5a5f6e', roughness: 0.7 }),
  partition: new THREE.MeshStandardMaterial({ color: '#C9CFD6', roughness: 0.85 }),
  partitionTrim: new THREE.MeshStandardMaterial({ color: '#8d96a3', roughness: 0.6, metalness: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ color: '#C79F6B', roughness: 0.65 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: '#9aa3ae', roughness: 0.35, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.45 }),
  plastic: new THREE.MeshStandardMaterial({ color: '#e8e6e1', roughness: 0.5 }),
  chair: new THREE.MeshStandardMaterial({ color: '#2b3140', roughness: 0.7 }),
  chairBoss: new THREE.MeshStandardMaterial({ color: '#5a1426', roughness: 0.5 }),
  plant: new THREE.MeshStandardMaterial({ color: '#3fa05a', roughness: 0.8 }),
  plant2: new THREE.MeshStandardMaterial({ color: '#2f7d46', roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: '#d36e45', roughness: 0.7 }),
  red: new THREE.MeshStandardMaterial({ color: '#d9443f', roughness: 0.5 }),
  glass: new THREE.MeshStandardMaterial({ color: '#bfe3ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25 }),
  ceiling: new THREE.MeshStandardMaterial({ map: ceilingTex(), roughness: 1, emissive: '#ffffff', emissiveMap: ceilingTex(), emissiveIntensity: 0.35 }),
  panel: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#FFE9C4', emissiveIntensity: 2.2, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: '#7cc8ff', roughness: 0.1, transparent: true, opacity: 0.6 }),
};

const box = (w: number, h: number, d: number, mat: THREE.Material, r = 0.03) => {
  const m = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export class Office {
  readonly root = new THREE.Group();
  readonly colliders: AABB[] = [];
  readonly desks: Desk[] = [];
  readonly panels: THREE.Mesh[] = [];
  hemi!: THREE.HemisphereLight;
  sun!: THREE.DirectionalLight;
  fill!: THREE.AmbientLight;
  door!: THREE.Group;
  doorOpen = 0;
  clockHour!: THREE.Group;
  clockMin!: THREE.Group;
  whiteboard!: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  printerLight!: THREE.Mesh;
  pizzaSlices: THREE.Mesh[] = [];
  pizzaGroup!: THREE.Group;
  secCam!: THREE.Group;
  breakerLight!: THREE.Mesh;
  coffeeCupProto!: THREE.Group;
  paperProto!: THREE.Mesh;
  reportProto!: THREE.Mesh;

  readonly P = {
    bossDesk: W(15, 1.6),
    bossDoor: W(15, 4.0),
    bossDoorOut: W(15, 5.2),
    tray: W(13.4, 4.7),
    coffee: W(8.2, 19.1),
    printer: W(18.6, 19.0),
    stamp: W(20.8, 19.1),
    breaker: W(6.6, 19.5),
    pizza: W(11, 18.2),
    meeting: W(15, 11.5),
    secCam: W(15, 4.6, 2.85),
    ring: [W(8, 7), W(22, 7), W(22, 16), W(8, 16)],
  };

  constructor() {
    this.buildShell();
    this.buildLights();
    this.buildCubicles();
    this.buildBossRoom();
    this.buildCenter();
    this.buildKitchen();
    this.buildPrinter();
    this.buildDecor();
    this.buildProtos();
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.matrixAutoUpdate = o.userData.dynamic ? true : o.matrixAutoUpdate;
    });
  }

  private add(o: THREE.Object3D, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    const p = W(x, z, y);
    o.position.copy(p);
    parent.add(o);
    return o;
  }

  /** Collider na planta (coordenadas de mapa). */
  private col(x0: number, z0: number, x1: number, z1: number) {
    const a = W(Math.min(x0, x1), Math.min(z0, z1));
    const b = W(Math.max(x0, x1), Math.max(z0, z1));
    this.colliders.push({ minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z });
  }

  /** Parede de x0,z0 → x1,z1 (alinhada a um eixo) com espessura t. */
  private wall(x0: number, z0: number, x1: number, z1: number, h = 3, t = 0.2, mat = M.wall) {
    const w = Math.abs(x1 - x0) || t;
    const d = Math.abs(z1 - z0) || t;
    const m = box(w, h, d, mat, 0);
    this.add(m, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    const bb = box(w + 0.02, 0.12, d + 0.02, M.base, 0);
    this.add(bb, (x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    this.col((x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - d / 2, (x0 + x1) / 2 + w / 2, (z0 + z1) / 2 + d / 2);
  }

  private floor(x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    this.add(m, (x0 + x1) / 2, y, (z0 + z1) / 2);
  }

  private buildShell() {
    this.floor(0, 4, 30, 20, new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 0.95 }));
    this.floor(10, 0, 20, 4, new THREE.MeshStandardMaterial({ map: woodTex('#8a5a33'), roughness: 0.55 }));
    const bath = new THREE.MeshStandardMaterial({ map: tileTex('#e9eef2', '#d5dde4', 8, [2, 2]), roughness: 0.3 });
    this.floor(0, 0, 4, 4, bath);
    this.floor(26, 0, 30, 4, bath);
    this.floor(4, 0, 10, 4, M.wallDark);
    this.floor(20, 0, 26, 4, M.wallDark);
    this.floor(6, 17, 14, 20, new THREE.MeshStandardMaterial({ map: tileTex('#f3efe6', '#c9b79a', 8, [4, 1.5]), roughness: 0.4 }), 0.005);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), M.ceiling);
    ceil.rotation.x = Math.PI / 2;
    this.add(ceil, 15, 3, 10);

    // perímetro
    this.wall(0, 0, 30, 0);
    this.wall(0, 20, 30, 20);
    this.wall(0, 0, 0, 20);
    this.wall(30, 0, 30, 20);
    // parede norte do salão (z = 4) com vãos: banheiro F (1.4-2.6), porta do chefe (14.2-15.8), banheiro M (27.4-28.6)
    this.wall(0, 4, 1.4, 4);
    this.wall(2.6, 4, 10, 4);
    this.wall(10, 4, 11.2, 4);
    this.wall(12.8, 4, 14.2, 4);
    this.wall(15.8, 4, 17.2, 4);
    this.wall(18.8, 4, 20, 4);
    this.wall(20, 4, 27.4, 4);
    this.wall(28.6, 4, 30, 4);
    // janelas da sala do chefe (com persianas)
    for (const wx of [12, 18]) {
      const low = box(1.6, 1.0, 0.2, M.wall, 0);
      this.add(low, wx, 0.5, 4);
      const top = box(1.6, 0.8, 0.2, M.wall, 0);
      this.add(top, wx, 2.6, 4);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), M.glass);
      this.add(glass, wx, 1.6, 4);
      for (let i = 0; i < 9; i++) {
        const slat = box(1.56, 0.012, 0.08, M.plastic, 0);
        slat.rotation.x = 0.9;
        this.add(slat, wx, 1.08 + i * 0.13, 4.06);
      }
      this.col(wx - 0.8, 3.9, wx + 0.8, 4.1);
    }
    // laterais da sala do chefe e banheiros
    this.wall(4, 0, 4, 4);
    this.wall(10, 0, 10, 4);
    this.wall(20, 0, 20, 4);
    this.wall(26, 0, 26, 4);

    // porta do chefe (pivô na lateral esquerda)
    this.door = new THREE.Group();
    const leaf = box(1.55, 2.3, 0.07, M.woodDark, 0.02);
    leaf.position.set(0.78, 1.15, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), M.metal);
    knob.position.set(1.38, 1.05, 0.06);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.16), new THREE.MeshBasicMaterial({ map: signTex('CHEFE', '#d4af37', '#2a1a00', 256, 64) }));
    plate.position.set(0.78, 1.75, 0.04);
    this.door.add(leaf, knob, plate);
    this.add(this.door, 14.22, 0, 4);
    const lintel = box(1.6, 0.7, 0.2, M.wall, 0);
    this.add(lintel, 15, 2.65, 4);

    // portas dos banheiros (sempre fechadas, decorativas) + placas
    for (const [bx, label] of [[2, 'F'], [28, 'M']] as const) {
      const d = box(1.15, 2.2, 0.06, new THREE.MeshStandardMaterial({ color: '#6c89a8', roughness: 0.5 }), 0.02);
      this.add(d, bx, 1.1, 4.02);
      this.col(bx - 0.6, 3.9, bx + 0.6, 4.1);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: signTex(label === 'F' ? '♀' : '♂', '#ffffff', '#2F5FA8', 128, 128) }));
      this.add(s, bx, 1.75, 4.06);
      const top = box(1.2, 0.8, 0.2, M.wall, 0);
      this.add(top, bx, 2.6, 4);
    }
  }

  private buildLights() {
    this.hemi = new THREE.HemisphereLight('#fff1dc', '#2c3c5c', 0.85);
    this.root.add(this.hemi);
    this.fill = new THREE.AmbientLight('#ffe9c4', 0.25);
    this.root.add(this.fill);
    this.sun = new THREE.DirectionalLight('#FFE9C4', 1.5);
    this.sun.position.set(-6, 14, 6);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -19;
    c.right = 19;
    c.top = 14;
    c.bottom = -14;
    c.near = 1;
    c.far = 40;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.root.add(this.sun, this.sun.target);
    // painéis fluorescentes
    const geo = new THREE.BoxGeometry(1.2, 0.04, 0.6);
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 3; z++) {
        const p = new THREE.Mesh(geo, M.panel);
        this.add(p, 5 + x * 5, 2.98, 7 + z * 4.5);
        this.panels.push(p);
      }
    for (const x of [12.5, 17.5]) {
      const p = new THREE.Mesh(geo, M.panel);
      this.add(p, x, 2.98, 2);
      this.panels.push(p);
    }
  }

  setLights(on: number) {
    this.hemi.intensity = 0.1 + 0.75 * on;
    this.sun.intensity = 0.05 + 1.45 * on;
    this.fill.intensity = 0.04 + 0.21 * on;
    M.panel.emissiveIntensity = 0.02 + 2.2 * on;
    M.ceiling.emissiveIntensity = 0.35 * on;
    for (const d of this.desks) d.light.intensity = 0.6 + 2.6 * (1 - on);
  }

  private makeChair(boss = false) {
    const g = new THREE.Group();
    const mat = boss ? M.chairBoss : M.chair;
    const seat = box(0.55, 0.09, 0.55, mat, 0.04);
    seat.position.y = 0.48;
    const back = box(0.52, boss ? 0.9 : 0.6, 0.08, mat, 0.04);
    back.position.set(0, boss ? 0.98 : 0.84, -0.26);
    back.rotation.x = -0.08;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.38), M.metal);
    post.position.y = 0.27;
    g.add(seat, back, post);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = box(0.3, 0.03, 0.04, M.dark, 0.01);
      leg.position.set(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15);
      leg.rotation.y = -a;
      const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.dark);
      wheel.position.set(Math.cos(a) * 0.29, 0.035, Math.sin(a) * 0.29);
      g.add(leg, wheel);
    }
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  private makePlant(s = 1) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.13 * s, 0.32 * s, 14), M.pot);
    pot.position.y = 0.16 * s;
    pot.castShadow = true;
    g.add(pot);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 8, 6), i % 2 ? M.plant : M.plant2);
      const a = (i / 7) * Math.PI * 2;
      leaf.scale.set(0.6, 1.4, 0.6);
      leaf.position.set(Math.cos(a) * 0.1 * s, (0.45 + (i % 3) * 0.12) * s, Math.sin(a) * 0.1 * s);
      leaf.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      leaf.castShadow = true;
      g.add(leaf);
    }
    return g;
  }

  private buildCubicles() {
    const zs = [7, 11.5, 16];
    const tiesForPlate = ['VOCÊ', 'Bia', 'Caio', 'Duda', 'Edu', 'Fê'];
    let idx = 0;
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1; // direção para dentro do salão
      const wallX = side === 'L' ? 0 : 30;
      for (const cz of zs) {
        const g = new THREE.Group();
        // mesa
        const deskX = wallX + sx * 0.5;
        const top = box(0.9, 0.05, 1.9, M.wood, 0.02);
        this.add(top, deskX, 0.75, cz, g);
        const ped = box(0.8, 0.7, 0.45, M.plastic, 0.02);
        this.add(ped, deskX, 0.36, cz + 0.65, g);
        for (let i = 0; i < 3; i++) {
          const handle = box(0.02, 0.02, 0.18, M.metal, 0);
          this.add(handle, deskX + sx * 0.41, 0.6 - i * 0.2, cz + 0.65, g);
        }
        const leg = box(0.8, 0.72, 0.04, M.plastic, 0.01);
        this.add(leg, deskX, 0.36, cz - 0.9, g);
        this.col(Math.min(wallX, wallX + sx * 0.95), cz - 0.95, Math.max(wallX, wallX + sx * 0.95), cz + 0.95);
        // monitor
        const monX = wallX + sx * 0.32;
        const standM = box(0.08, 0.3, 0.08, M.dark, 0.01);
        this.add(standM, monX - sx * 0.04, 0.92, cz, g);
        const foot = box(0.25, 0.02, 0.2, M.dark, 0.01);
        this.add(foot, monX - sx * 0.04, 0.785, cz, g);
        const bezel = box(0.06, 0.66, 1.06, M.dark, 0.025);
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
        this.add(screen, monX + sx * 0.032, 1.14, cz, g);
        // teclado, caneca, porta-retrato
        const kb = box(0.18, 0.025, 0.5, M.dark, 0.01);
        this.add(kb, wallX + sx * 0.72, 0.79, cz, g);
        const mouse = box(0.1, 0.03, 0.06, M.dark, 0.015);
        this.add(mouse, wallX + sx * 0.72, 0.79, cz - 0.42, g);
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), new THREE.MeshStandardMaterial({ color: ['#ff6b6b', '#4da3ff', '#ffd23f', '#3ddc97', '#b388ff', '#ff8a3d'][idx], roughness: 0.4 }));
        mug.castShadow = true;
        this.add(mug, wallX + sx * 0.45, 0.83, cz + 0.72, g);
        const frame = box(0.03, 0.16, 0.13, M.woodDark, 0.01);
        frame.rotation.z = sx * 0.2;
        this.add(frame, wallX + sx * 0.2, 0.86, cz - 0.72, g);
        // plaquinha com o nome
        const np = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: signTex(tiesForPlate[idx], idx === 0 ? '#ffd23f' : '#ffffff', '#1b2233', 256, 64) }));
        np.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.add(np, wallX + 0.13 * sx, 1.8, cz, g);
        // cadeira
        const chair = this.makeChair();
        const seatX = wallX + sx * 1.45;
        this.add(chair, seatX, 0, cz, g);
        chair.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        // lixeira (basquete) do outro lado do cubículo
        const binX = wallX + sx * 2.35;
        const binZ = cz - 1.75;
        const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.45, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#5b6b7d', roughness: 0.5, side: THREE.DoubleSide }));
        bin.castShadow = true;
        this.add(bin, binX, 0.225, binZ, g);
        const binRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 24), M.metal);
        binRim.rotation.x = Math.PI / 2;
        this.add(binRim, binX, 0.45, binZ, g);
        const binBottom = new THREE.Mesh(new THREE.CircleGeometry(0.16, 18), M.dark);
        binBottom.rotation.x = -Math.PI / 2;
        this.add(binBottom, binX, 0.02, binZ, g);
        // luz da tela
        const light = new THREE.PointLight('#bfe0ff', 0.6, 3.2, 1.6);
        this.add(light, monX + sx * 0.45, 1.15, cz, g);
        // migalhas e poça (evidências)
        const crumbs = new THREE.Group();
        for (let i = 0; i < 14; i++) {
          const c = box(0.025, 0.012, 0.025, new THREE.MeshStandardMaterial({ color: '#c58a45' }), 0);
          c.position.set((Math.random() - 0.5) * 0.4, 0.785, (Math.random() - 0.5) * 0.7);
          c.rotation.y = Math.random() * 3;
          crumbs.add(c);
        }
        crumbs.visible = false;
        this.add(crumbs, wallX + sx * 0.62, 0, cz, g);
        crumbs.position.y = 0;
        const puddle = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: puddleTex(), transparent: true, depthWrite: false }));
        puddle.rotation.x = -Math.PI / 2;
        puddle.visible = false;
        this.add(puddle, wallX + sx * 0.6, 0.78, cz - 0.3, g);
        this.root.add(g);

        const seat = W(seatX, cz);
        const yaw = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.desks.push({
          index: idx, side, seat, seatYaw: yaw,
          checkPos: W(wallX + sx * 3.25, cz),
          standPos: W(wallX + sx * 2.25, cz),
          screenCenter: W(monX + sx * 0.035, cz, 1.14),
          screenNormal: new THREE.Vector3(sx, 0, 0),
          screen, canvas, ctx, tex, chair, bin: W(binX, binZ, 0.45), light, crumbs, puddle, nameplate: np,
        });
        idx++;
      }
      // divisórias
      for (const pz of [4.75, 9.25, 13.75, 18.25]) {
        const len = 2.7;
        const px = wallX + sx * (len / 2);
        const p = box(len, 1.1, 0.07, M.partition, 0.02);
        this.add(p, px, 0.55, pz);
        const trim = box(len, 0.04, 0.09, M.partitionTrim, 0.01);
        this.add(trim, px, 1.11, pz);
        this.col(px - len / 2, pz - 0.06, px + len / 2, pz + 0.06);
      }
    }
  }

  private buildBossRoom() {
    // plataforma elevada + mesa
    const plat = box(5, 0.4, 2.2, M.woodDark, 0.03);
    this.add(plat, 15, 0.2, 1.3);
    const desk = box(2.6, 0.08, 1.0, M.woodDark, 0.03);
    this.add(desk, 15, 1.15, 2.1);
    const front = box(2.6, 0.75, 0.06, new THREE.MeshStandardMaterial({ color: '#4a2f1b', roughness: 0.5 }), 0.02);
    this.add(front, 15, 0.78, 2.58);
    this.col(13.7, 1.6, 16.3, 2.65);
    const chair = this.makeChair(true);
    chair.scale.setScalar(1.5);
    this.add(chair, 15, 0.4, 1.1);
    const mon = box(0.9, 0.55, 0.05, M.dark, 0.02);
    this.add(mon, 14.3, 1.5, 2.3);
    const phone = box(0.22, 0.08, 0.16, M.red, 0.03);
    this.add(phone, 16.0, 1.23, 2.2);
    const trophy = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.25, 12), new THREE.MeshStandardMaterial({ color: '#FFD23F', metalness: 0.9, roughness: 0.2 }));
    this.add(trophy, 16.4, 1.32, 2.0);
    // estante
    const shelf = box(1.8, 2.2, 0.4, M.woodDark, 0.02);
    this.add(shelf, 11.2, 1.1, 0.3);
    const bookCols = ['#c0392b', '#2F5FA8', '#E6C43A', '#3E9B5B', '#7A5BC0', '#ecf0f1'];
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 9; i++) {
        const b = box(0.12, 0.3 + Math.random() * 0.08, 0.25, new THREE.MeshStandardMaterial({ color: bookCols[(i + r) % 6], roughness: 0.6 }), 0.01);
        this.add(b, 10.5 + i * 0.16, 0.38 + r * 0.5, 0.45);
      }
    this.col(10, 0, 20, 0.6);
    // quadro "funcionário do mês" (o próprio chefe)
    const pic = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.25),
      new THREE.MeshBasicMaterial({
        map: posterTex('CHEFE DO MÊS', 'todo mês, desde 1998', '#f5d76e', (g) => {
          ballDoodle(g, 114, 120, 70, '#7a2238');
        }),
      }),
    );
    this.add(pic, 17.8, 1.9, 0.12);
    this.add(this.makePlant(1.3), 19.3, 0, 0.6);
    // bandeja do café
    const stand = box(0.5, 0.95, 0.4, M.plastic, 0.03);
    this.add(stand, 13.4, 0.475, 4.55);
    const tray = box(0.55, 0.04, 0.42, M.metal, 0.02);
    this.add(tray, 13.4, 0.97, 4.55);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.12), new THREE.MeshBasicMaterial({ map: signTex('BANDEJA', '#2F5FA8', '#fff', 256, 64) }));
    this.add(lbl, 13.4, 0.75, 4.76);
    this.col(13.15, 4.35, 13.65, 4.75);
    // quadro branco (auditoria)
    const wb = document.createElement('canvas');
    wb.width = 512;
    wb.height = 320;
    const wctx = wb.getContext('2d')!;
    const wtex = new THREE.CanvasTexture(wb);
    wtex.colorSpace = THREE.SRGBColorSpace;
    this.whiteboard = { canvas: wb, ctx: wctx, tex: wtex };
    this.drawWhiteboard(['BOSS KEY S.A.', 'Metas da semana:', '• SINERGIA', '• FOCO', '• ☕']);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.3 }));
    this.add(board, 7, 1.65, 4.11);
    const bframe = box(2.3, 1.47, 0.04, M.metal, 0.02);
    this.add(bframe, 7, 1.65, 4.09);
    // relógio
    const clock = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 32), M.plastic);
    face.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 32), M.dark);
    clock.add(face, rim);
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
    this.add(clock, 15, 2.65, 4.13);
    // câmera de segurança
    this.secCam = new THREE.Group();
    const body = box(0.18, 0.14, 0.32, M.plastic, 0.03);
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
      g.font = i === 0 ? '700 40px Fredoka, sans-serif' : '500 32px Fredoka, sans-serif';
      g.fillStyle = i === 0 ? '#c0392b' : i === highlight ? '#2F5FA8' : '#1b2233';
      if (i === highlight) {
        g.fillStyle = 'rgba(255,210,63,0.6)';
        g.fillRect(14, 20 + i * 52 - 4, c.width - 28, 46);
        g.fillStyle = '#1b2233';
      }
      g.fillText(l, 24, 20 + i * 52);
    });
    tex.needsUpdate = true;
  }

  private buildCenter() {
    const top = box(6, 0.1, 2.5, M.wood, 0.05);
    this.add(top, 15, 0.76, 11.5);
    for (const [dx, dz] of [[-2.7, -1], [2.7, -1], [-2.7, 1], [2.7, 1]]) {
      const l = box(0.1, 0.72, 0.1, M.metal, 0.02);
      this.add(l, 15 + dx, 0.36, 11.5 + dz);
    }
    this.col(12, 10.25, 18, 12.75);
    for (let i = 0; i < 3; i++)
      for (const s of [-1, 1]) {
        const ch = this.makeChair();
        this.add(ch, 13 + i * 2, 0, 11.5 + s * 1.65);
        ch.rotation.y = s > 0 ? Math.PI : 0;
      }
    // laptop e café na mesa
    const lap = box(0.4, 0.02, 0.28, M.metal, 0.01);
    this.add(lap, 14, 0.82, 11.2);
    const lapScreen = box(0.4, 0.26, 0.015, M.dark, 0.01);
    lapScreen.rotation.x = -0.3;
    this.add(lapScreen, 14, 0.95, 11.05);
    // colunas
    for (const [cx, cz] of [[7, 5], [23, 5], [7, 16], [23, 16]]) {
      const c = box(0.8, 3, 0.8, M.wall, 0.04);
      this.add(c, cx, 1.5, cz);
      const b = box(0.84, 0.12, 0.84, M.base, 0.02);
      this.add(b, cx, 0.06, cz);
      this.col(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4);
    }
  }

  private buildKitchen() {
    // balcão no fundo
    const counter = box(7.6, 0.9, 0.7, M.plastic, 0.03);
    this.add(counter, 10, 0.45, 19.6);
    const ctop = box(7.7, 0.05, 0.75, new THREE.MeshStandardMaterial({ color: '#3b3f4a', roughness: 0.3 }), 0.02);
    this.add(ctop, 10, 0.92, 19.6);
    this.col(6.2, 19.2, 13.8, 20);
    // armários superiores
    const cab = box(7.6, 0.7, 0.4, M.plastic, 0.03);
    this.add(cab, 10, 2.1, 19.78);
    // máquina de café
    const cm = new THREE.Group();
    const cmBody = box(0.5, 0.65, 0.45, M.dark, 0.05);
    cmBody.position.y = 0.33;
    const cmTop = box(0.52, 0.12, 0.47, M.red, 0.04);
    cmTop.position.y = 0.7;
    const spout = box(0.12, 0.08, 0.12, M.metal, 0.02);
    spout.position.set(0, 0.4, 0.22);
    const cmLight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    cmLight.position.set(0.16, 0.55, 0.23);
    cm.add(cmBody, cmTop, spout, cmLight);
    cm.userData.light = cmLight;
    this.add(cm, 8.2, 0.95, 19.55);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: signTex('☕ CAFÉ', '#3b2416', '#ffd9a0', 256, 64) }));
    this.add(sign, 8.2, 1.95, 19.56);
    // geladeira
    const fridge = box(0.8, 1.9, 0.7, new THREE.MeshStandardMaterial({ color: '#dfe6ec', roughness: 0.3, metalness: 0.2 }), 0.06);
    this.add(fridge, 13.3, 0.95, 19.55);
    const handle = box(0.03, 0.5, 0.03, M.metal, 0);
    this.add(handle, 13.0, 1.2, 19.18);
    // ilha da pizza / fofoca
    const island = box(2.2, 0.9, 0.9, M.wood, 0.04);
    this.add(island, 11, 0.45, 18.2);
    this.col(9.9, 17.75, 12.1, 18.65);
    this.pizzaGroup = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({ color: '#d7b98a', roughness: 0.8 });
    const pbox = box(0.7, 0.04, 0.7, boxMat, 0.01);
    this.pizzaGroup.add(pbox);
    const lid = box(0.7, 0.04, 0.7, boxMat, 0.01);
    lid.position.set(0, 0.35, -0.35);
    lid.rotation.x = -Math.PI / 2;
    this.pizzaGroup.add(lid);
    const sliceMat = new THREE.MeshStandardMaterial({ color: '#f3b23c', roughness: 0.6 });
    const pep = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.5 });
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
    this.add(this.pizzaGroup, 11, 0.92, 18.2);
    // disjuntor
    const brk = box(0.4, 0.55, 0.12, new THREE.MeshStandardMaterial({ color: '#8d96a3', roughness: 0.5, metalness: 0.3 }), 0.02);
    this.add(brk, 6.6, 1.5, 19.9);
    this.breakerLight = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    this.add(this.breakerLight, 6.6, 1.68, 19.83);
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), new THREE.MeshBasicMaterial({ map: signTex('⚡ DISJUNTOR', '#ffd23f', '#111', 256, 64) }));
    this.add(bs, 6.6, 1.15, 19.83);
    // bebedouro
    const wc = new THREE.Group();
    const wcb = box(0.4, 1.0, 0.4, M.plastic, 0.04);
    wcb.position.y = 0.5;
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.45, 16), M.water);
    jug.position.y = 1.25;
    wc.add(wcb, jug);
    this.add(wc, 5.4, 0, 19.5);
    this.col(5.2, 19.3, 5.6, 19.7);
  }

  private buildPrinter() {
    const stand = box(1.2, 0.75, 0.7, M.plastic, 0.03);
    this.add(stand, 18.6, 0.375, 19.55);
    const pr = box(0.9, 0.45, 0.6, new THREE.MeshStandardMaterial({ color: '#dcdfe3', roughness: 0.4 }), 0.05);
    this.add(pr, 18.6, 0.98, 19.55);
    const prTop = box(0.92, 0.05, 0.62, M.dark, 0.02);
    this.add(prTop, 18.6, 1.22, 19.55);
    const paper = box(0.5, 0.02, 0.35, new THREE.MeshStandardMaterial({ color: '#ffffff' }), 0);
    this.add(paper, 18.6, 1.0, 19.15);
    this.printerLight = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    this.add(this.printerLight, 18.95, 1.12, 19.25);
    this.col(17.9, 19.2, 19.3, 20);
    const st = box(1.0, 0.75, 0.6, M.wood, 0.03);
    this.add(st, 20.8, 0.375, 19.6);
    const stamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.15, 12), M.red);
    this.add(stamp, 20.8, 0.83, 19.5);
    this.col(20.3, 19.3, 21.3, 20);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), new THREE.MeshBasicMaterial({ map: signTex('🖨 IMPRESSORA', '#ffffff', '#1b2233', 256, 64) }));
    this.add(s, 18.6, 2.0, 19.88);
  }

  private buildDecor() {
    for (const [x, z] of [[4.6, 5], [25.4, 5], [4.6, 19.3], [25.4, 19.3], [9.5, 4.6], [20.5, 4.6]]) {
      this.add(this.makePlant(), x, 0, z);
      this.col(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
    const posters: [string, string, string, (g: CanvasRenderingContext2D) => void, number, number, number][] = [
      ['SINERGIA', 'juntos enrolamos mais', '#4da3ff', (g) => { ballDoodle(g, 70, 110, 45, '#7F93A6'); ballDoodle(g, 158, 110, 45, '#A8D5A2'); }, 23.5, 1.7, 19.88],
      ['AGUENTA FIRME', 'só faltam 4 dias', '#ffd23f', (g) => { g.strokeStyle = '#5a3a1a'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, 40); g.lineTo(208, 40); g.stroke(); ballDoodle(g, 114, 120, 55, '#7F93A6'); }, 15, 1.8, 19.88],
      ['FOCO', 'na planilha (rs)', '#ff8a3d', (g) => { g.fillStyle = '#E8F2E8'; g.fillRect(30, 40, 168, 120); g.strokeStyle = '#3E9B5B'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(30, 60 + i * 20); g.lineTo(198, 60 + i * 20); g.stroke(); } }, 26.5, 1.7, 4.12],
    ];
    for (const [t, s, bg, d, x, y, z] of posters) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.13), new THREE.MeshStandardMaterial({ map: posterTex(t, s, bg, d), roughness: 0.6 }));
      if (z > 19) p.rotation.y = Math.PI;
      this.add(p, x, y, z);
    }
  }

  private buildProtos() {
    const cup = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 0.06, 16), new THREE.MeshStandardMaterial({ color: '#a0703f', roughness: 0.8 }));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16), new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.5 }));
    lid.position.y = 0.075;
    c.castShadow = true;
    cup.add(c, sleeve, lid);
    this.coffeeCupProto = cup;
    this.paperProto = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.9, flatShading: true }));
    this.paperProto.castShadow = true;
    this.reportProto = box(0.22, 0.03, 0.3, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), 0.005);
  }

  update(dt: number, dayT01: number, time: number) {
    // porta
    const target = this.doorOpen;
    this.door.rotation.y += (-target * 1.6 - this.door.rotation.y) * Math.min(1, dt * 7);
    // relógio do dia: 9h → 18h
    const hours = 9 + dayT01 * 9;
    this.clockHour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    this.clockMin.rotation.z = -((hours % 1) * Math.PI * 2);
    // painéis tremeluzem de leve
    const fl = 1 + Math.sin(time * 50) * 0.01;
    for (const p of this.panels) p.scale.y = fl;
  }

  /** Resolve colisão de um círculo (x,z,r) contra os AABBs. */
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
          // centro dentro da caixa: empurra pelo eixo mais curto
          const ex = Math.min(p.x - b.minX, b.maxX - p.x);
          const ez = Math.min(p.z - b.minZ, b.maxZ - p.z);
          if (ex < ez) p.x = p.x - b.minX < b.maxX - p.x ? b.minX - r : b.maxX + r;
          else p.z = p.z - b.minZ < b.maxZ - p.z ? b.minZ - r : b.maxZ + r;
        }
      }
    }
  }

  /** Linha de visão simples (amostragem contra colliders altos). */
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

  /** Colliders que bloqueiam visão (paredes e colunas, não mesas/divisórias baixas). */
  get tallColliders(): AABB[] {
    if (!this._tall) {
      const isWall = (b: AABB) => {
        const w = b.maxX - b.minX;
        const d = b.maxZ - b.minZ;
        return (w <= 0.25 || d <= 0.25 || (Math.abs(w - 0.8) < 0.01 && Math.abs(d - 0.8) < 0.01)) && !(Math.abs(d - 0.12) < 0.01);
      };
      this._tall = this.colliders.filter(isWall);
    }
    return this._tall;
  }
  private _tall: AABB[] | null = null;
}
