import * as THREE from 'three';
import { box, mat, type Office } from './Office';
import { W, ELEV_F, LOBBY, LOBBY_DZ } from './plan';
import { tileTex } from './textures';
import {
  asphaltTex, awningTex, directoryTex, facadeSet, facadeUV, floorIndicatorTex, goldTextTex, graniteTex, marbleTex, medallionTex,
  pavingTex, slatTex, stoneTex, storefrontTex, streetSkyTex,
} from './lobbyTextures';
import { makeSign } from './Signs';
import { decodeLive, liveTexture } from '../core/liveTexture';
import type { DayLook } from './Daylight';

/** Pé-direito do saguão (o dobro do escritório: entrada de prédio). */
const H = 5;
/** Paredes do saguão (planta): norte (elevadores) e sul (fachada de vidro). */
const Z0 = LOBBY_DZ + ELEV_F;
const Z1 = LOBBY.south;
const X0 = LOBBY.west;
const X1 = LOBBY.east;
/** Lojinha: balcão e as 5 vitrines das ofertas (planta z). */
const SHOP_X = 7.5;
const SHOP_Z = [-30.9, -29.7, -28.5, -27.3, -26.1];
/** Rua lá fora (planta z): meio-fio, pista e a calçada da frente. */
const CURB = -14;
const ROAD_FAR = -7;
const FACADE = -4.2;

interface Car {
  g: THREE.Group;
  speed: number;
  x: number;
}

/**
 * O térreo: saguão de prédio comercial (mármore, pedra, pé-direito duplo, três elevadores, recepção, catracas,
 * lojinha e espera) e a rua de verdade do outro lado da fachada de vidro (calçada, pista, carros e prédios em 3D).
 */
export class LobbyScene {
  /** Luzes do térreo: só ficam ligadas com a câmera lá (no escritório não pesam). */
  readonly lights: THREE.Light[] = [];
  private cars: Car[] = [];
  private doors: THREE.Object3D[] = [];
  private doorK = 0;
  /** Materiais de fora: céu e fachadas (sem luz própria, tingidos pela hora) e as janelas que acendem à noite. */
  private dayBasic: { m: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private outStd: THREE.MeshStandardMaterial[] = [];
  private night: THREE.MeshBasicMaterial[] = [];
  private lamps: THREE.MeshStandardMaterial[] = [];
  private headlights: THREE.MeshBasicMaterial[] = [];
  private lightsOn = true;

  constructor(private o: Office) {
    this.buildShell();
    this.buildElevatorWall();
    this.buildCeiling();
    this.buildFacade();
    this.buildReception();
    this.buildGates();
    this.buildShop();
    this.buildWaiting();
    this.buildStreet();
    this.buildLights();
    const lb = o.lobby;
    lb.exit.copy(W(15, Z1 - 0.7));
    lb.exitPath = [W(15, Z0 + 1.2), W(15, -28.4), W(15, -24.2), W(15, Z1 - 0.6), W(15, Z1 + 1.6), W(15, -17.2)];
    lb.shopMark.copy(W(SHOP_X + 0.6, -28.5, 2.45));
    lb.elevMark.copy(W(15, Z0 + 0.4, 3.6));
  }

  // ------------------------------------------------------------------ helpers
  private add(obj: THREE.Object3D, x: number, y: number, z: number) {
    return this.o.add(obj, x, y, z);
  }

  /** Material de fora com "luz do dia" própria (o sol não chega no térreo): o emissivo segue a hora. */
  private outMat(color: string, rough = 0.85, metal = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: color, emissiveIntensity: 0.5 });
    this.outStd.push(m);
    return m;
  }

  private basic(map: THREE.Texture | null, color = '#ffffff') {
    const m = new THREE.MeshBasicMaterial({ map, color, fog: false });
    this.dayBasic.push({ m, base: new THREE.Color(color) });
    return m;
  }

  private plane(w: number, h: number, m: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.rotation.set(rx, ry, 0, 'YXZ');
    p.receiveShadow = true;
    this.add(p, x, y, z);
    return p;
  }

  /** Setor de anel (balcão curvo): raio r0..r1, ângulos a0..a1 (planta: x = cos, z = −sen), altura h, a partir de y. */
  private arc(r0: number, r1: number, a0: number, a1: number, h: number, m: THREE.Material, cx: number, y: number, cz: number) {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, a0, a1, false);
    s.absarc(0, 0, r0, a1, a0, true);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.add(mesh, cx, y, cz);
    return mesh;
  }

  // ------------------------------------------------------------------ casca: piso, paredes, cabine
  private buildShell() {
    const o = this.o;
    const w = X1 - X0;
    const d = Z1 - Z0;
    o.floor(X0, Z0, X1, Z1, new THREE.MeshStandardMaterial({ map: marbleTex([w / 4.8, d / 4.8]), roughness: 0.16, metalness: 0.05 }));
    // faixa de granito junto das paredes e o tapete da entrada
    const gran = new THREE.MeshStandardMaterial({ map: graniteTex('#2c2f37', [8, 1]), roughness: 0.22, metalness: 0.1 });
    o.floor(X0, Z0, X1, Z0 + 0.5, gran, 0.002);
    o.floor(X0, Z0 + 0.5, X0 + 0.5, Z1, gran, 0.002);
    o.floor(X1 - 0.5, Z0 + 0.5, X1, Z1, gran, 0.002);
    this.add(box(3.4, 0.012, 1.7, mat('#26222a', 0.95), 0.005), 15, 0.006, Z1 - 1.0);
    this.add(box(3.1, 0.014, 1.4, mat('#5a2430', 0.95), 0.005), 15, 0.008, Z1 - 1.0);
    // medalhão no centro (a rota da porta ao elevador passa por cima dele)
    const med = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64), new THREE.MeshStandardMaterial({ map: medallionTex(), roughness: 0.18, transparent: true }));
    med.rotation.x = -Math.PI / 2;
    med.receiveShadow = true;
    this.add(med, 15, 0.004, -25.2);
    // paredes leste e oeste em travertino, com rodapé de granito
    const stone = new THREE.MeshStandardMaterial({ map: stoneTex([d / 4, H / 2]), roughness: 0.6 });
    const skirt = mat('#24262c', 0.3, 0.1);
    for (const [x, s] of [[X0, -1], [X1, 1]] as const) {
      this.add(box(0.3, H, d + 0.3, stone, 0), x + s * 0.15, H / 2, (Z0 + Z1) / 2);
      this.add(box(0.04, 0.14, d, skirt, 0), x - s * 0.02, 0.07, (Z0 + Z1) / 2);
      o.col(x - 0.3, Z0, x + 0.3, Z1, true);
      // pilastras nos cantos, com capitel de latão
      for (const z of [Z0 + 0.45, Z1 - 0.45]) {
        this.add(box(0.5, H, 0.7, stone, 0.02), x - s * 0.18, H / 2, z);
        this.add(box(0.56, 0.16, 0.76, mat('#c9a55a', 0.3, 0.75), 0.02), x - s * 0.18, H - 0.5, z);
      }
    }
    // cabine de baixo: piso igual ao da de cima e casca (o interior vem do Office.buildCabin)
    o.floor(13, LOBBY_DZ, 17, Z0, new THREE.MeshStandardMaterial({ map: tileTex('#4b5470', '#3a4158', 8, [3, 4.2]), roughness: 0.35, metalness: 0.2 }), 0.004);
    const shaft = mat('#3a3e48', 0.6);
    this.add(box(0.2, 3.2, ELEV_F, shaft, 0), 12.95, 1.6, LOBBY_DZ + ELEV_F / 2);
    this.add(box(0.2, 3.2, ELEV_F, shaft, 0), 17.05, 1.6, LOBBY_DZ + ELEV_F / 2);
    this.add(box(4.3, 3.2, 0.2, shaft, 0), 15, 1.6, LOBBY_DZ - 0.1);
    // teto da cabine: para dentro da parede do saguão (senão a laje vaza no hall, por cima da porta)
    this.add(box(4.3, 0.12, ELEV_F - 0.2, mat('#e9e4da', 0.9), 0), 15, 3.06, LOBBY_DZ + (ELEV_F - 0.4) / 2);
    o.col(12.85, LOBBY_DZ, 13.1, Z0, true);
    o.col(16.9, LOBBY_DZ, 17.15, Z0, true);
    o.col(12.85, LOBBY_DZ - 0.2, 17.15, LOBBY_DZ + 0.1, true);
  }

  // ------------------------------------------------------------------ parede dos elevadores (norte)
  private buildElevatorWall() {
    const o = this.o;
    const gran = new THREE.MeshStandardMaterial({ map: graniteTex('#30333b', [3, 2]), roughness: 0.25, metalness: 0.15 });
    const brass = mat('#c9a55a', 0.3, 0.75);
    // aço igual ao da cabine (Office.buildCabin): as três portas têm que parecer a mesma
    const steel = mat('#c9ced6', 0.32, 0.75);
    const steelDark = mat('#8d95a3', 0.35, 0.7);
    // parede com os três vãos (1,76 m); só o do meio (x 15) é de verdade
    const bays = [10.5, 15, 19.5];
    const edges = [X0, ...bays.flatMap((x) => [x - 0.88, x + 0.88]), X1];
    // 10 cm, como a parede do escritório no lado da cabine: mais grossa, engole os painéis de aço em volta da porta
    for (let i = 0; i < edges.length; i += 2) {
      const [a, b] = [edges[i], edges[i + 1]];
      this.add(box(b - a, H, 0.1, gran, 0), (a + b) / 2, H / 2, Z0 - 0.05);
    }
    for (const x of bays) this.add(box(1.76, H - 2.3, 0.1, gran, 0), x, 2.3 + (H - 2.3) / 2, Z0 - 0.05);
    o.col(X0, Z0 - 0.3, 14.12, Z0, true);
    o.col(15.88, Z0 - 0.3, X1, Z0, true);
    // frisos de latão: rodapé, faixa a 3,4 m e montantes entre os elevadores
    this.add(box(X1 - X0, 0.05, 0.03, brass, 0), 15, 3.4, Z0 + 0.015);
    for (const x of [8.4, 12.6, 17.4, 21.6]) this.add(box(0.05, H, 0.03, brass, 0), x, H / 2, Z0 + 0.015);
    // portas de enfeite (os outros dois elevadores: só os figurantes usam): batente, folhas e fundo como os da cabine
    for (const x of [10.5, 19.5]) {
      this.add(box(1.76, 2.3, 0.04, mat('#2a2d33', 0.7), 0), x, 1.15, Z0 - 0.28);
      for (const dx of [-0.88, 0.88]) this.add(box(0.12, 2.24, 0.26, steelDark, 0.01), x + dx, 1.12, Z0);
      this.add(box(1.88, 0.1, 0.26, steelDark, 0.01), x, 2.25, Z0);
      for (const dx of [-0.4, 0.4]) {
        this.add(box(0.8, 2.18, 0.05, steel, 0.01), x + dx, 1.09, Z0 - 0.14);
        this.add(box(0.81, 0.012, 0.055, steelDark, 0), x + dx, 1.2, Z0 - 0.14);
      }
    }
    // batente de latão das três portas (na de verdade, a folha e o batente de aço vêm da cabine)
    for (const x of bays) {
      for (const dx of [-0.98, 0.98]) this.add(box(0.12, 2.3, 0.2, brass, 0.01), x + dx, 1.15, Z0 + 0.06);
      this.add(box(2.08, 0.12, 0.2, brass, 0.01), x, 2.4, Z0 + 0.06);
    }
    // mostradores de andar: o de verdade é o mesmo da cabine; os de enfeite ficam parados
    const disp = (m: THREE.Material, x: number) => {
      this.add(box(0.56, 0.24, 0.03, mat('#111318', 0.4), 0.01), x, 2.68, Z0 + 0.02);
      this.plane(0.5, 0.19, m, x, 2.68, Z0 + 0.04);
    };
    disp(o.floorDisplayMat, 15);
    disp(new THREE.MeshBasicMaterial({ map: floorIndicatorTex('▼ 7'), toneMapped: false }), 10.5);
    disp(new THREE.MeshBasicMaterial({ map: floorIndicatorTex('▲ 3'), toneMapped: false }), 19.5);
    // botoeiras entre as portas
    const lit = new THREE.MeshBasicMaterial({ color: '#ffe3a0', toneMapped: false });
    for (const x of [12.6, 17.4]) {
      this.add(box(0.16, 0.34, 0.025, brass, 0.01), x + (x < 15 ? 0.45 : -0.45), 1.2, Z0 + 0.02);
      for (const dy of [0.07, -0.07]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), dy > 0 ? lit : mat('#f2efe8', 0.4, 0.3));
        b.rotation.x = Math.PI / 2;
        this.add(b, x + (x < 15 ? 0.45 : -0.45), 1.2 + dy, Z0 + 0.04);
      }
    }
    const elev = makeSign({ text: 'ELEVADORES', sub: '1º ao 12º andar', icon: 'up', accent: '#7a2234', theme: 'brass', w: 1.7, h: 0.36, glow: 0.18 });
    this.add(elev, 15, 3.0, Z0 + 0.05);
    // diretório do prédio
    this.add(box(1.24, 1.7, 0.05, brass, 0.015), 23.0, 1.75, Z0 + 0.03);
    const dir = new THREE.MeshStandardMaterial({
      map: directoryTex([
        ['12º', 'BOSS KEY S.A.'],
        ['11º', 'Contabilidade Criativa'],
        ['10º', 'Sala de Reunião Infinita'],
        ['9º', 'Sinergia & Associados'],
        ['8º', 'Coach de Coaches'],
        ['7º', 'Startup (pivotando)'],
        ['6º', 'Depósito de Ideias'],
        ['T', 'Recepção · Lojinha'],
      ]),
      roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.12,
    });
    dir.emissiveMap = dir.map;
    this.plane(1.12, 1.58, dir, 23.0, 1.75, Z0 + 0.06);
    // vasos altos nos cantos
    for (const x of [6.1, 23.9]) this.add(o.makePlant(1.9, 1), x, 0, Z0 + 0.75);
  }

  // ------------------------------------------------------------------ teto: caixotões, sancas de luz e lustre
  private buildCeiling() {
    const plaster = mat('#e4ddd0', 0.95);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), plaster);
    ceil.rotation.x = Math.PI / 2;
    this.add(ceil, 15, H, (Z0 + Z1) / 2);
    const beam = mat('#dcd3c4', 0.85);
    for (let x = X0 + 2.5; x < X1 - 0.5; x += 2.5) this.add(box(0.22, 0.32, Z1 - Z0, beam, 0), x, H - 0.16, (Z0 + Z1) / 2);
    for (let z = Z0 + 2.4; z < Z1 - 0.5; z += 2.4) this.add(box(X1 - X0, 0.32, 0.22, beam, 0), 15, H - 0.16, z);
    // sanca: faixa de luz quente rente às paredes
    const cove = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffcf8f', emissiveIntensity: 0.9, roughness: 1 });
    this.add(box(X1 - X0 - 0.6, 0.06, 0.12, cove, 0), 15, H - 0.42, Z0 + 0.25);
    for (const x of [X0 + 0.25, X1 - 0.25]) this.add(box(0.12, 0.06, Z1 - Z0 - 0.6, cove, 0), x, H - 0.42, (Z0 + Z1) / 2);
    // spots embutidos no meio de cada caixotão
    const spot = new THREE.MeshBasicMaterial({ color: '#fff4dc', toneMapped: false });
    for (let x = X0 + 1.25; x < X1; x += 2.5)
      for (let z = Z0 + 1.2; z < Z1; z += 2.4) {
        if (Math.hypot(x - 15, z + 25.2) < 2.6) continue;
        const c = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), spot);
        c.rotation.x = Math.PI / 2;
        this.add(c, x, H - 0.005, z);
      }
    // lustre de anéis sobre o medalhão
    const ringM = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffd59a', emissiveIntensity: 1.2, roughness: 0.6 });
    const brass = mat('#c9a55a', 0.3, 0.75);
    for (const [r, y] of [[1.7, 3.55], [1.15, 3.8], [0.6, 4.05]] as const) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 10, 72), ringM);
      t.rotation.x = Math.PI / 2;
      this.add(t, 15, y, -25.2);
      const tb = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 72, Math.PI * 2), brass);
      tb.rotation.x = Math.PI / 2;
      this.add(tb, 15, y + 0.05, -25.2);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H - 3.55, 4), brass), 15 + Math.cos(a) * 1.7, 3.55 + (H - 3.55) / 2, -25.2 + Math.sin(a) * 1.7);
    }
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 32), brass), 15, H - 0.03, -25.2);
  }

  // ------------------------------------------------------------------ fachada de vidro (sul) e porta automática
  private buildFacade() {
    const o = this.o;
    const bronze = mat('#3b352e', 0.35, 0.6);
    const glass = new THREE.MeshStandardMaterial({ color: '#b7d3e2', roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.14, depthWrite: false });
    for (const x of [X0 + 0.05, 7.6, 10.1, 12.6, 13.45, 16.55, 17.4, 19.9, 22.4, X1 - 0.05]) this.add(box(0.1, H, 0.16, bronze, 0.01), x, H / 2, Z1);
    for (const y of [0.04, 3.0, H - 0.06]) this.add(box(X1 - X0, y > 0.1 ? 0.1 : 0.08, 0.16, bronze, 0.01), 15, y, Z1);
    for (const [a, b] of [[X0, 13.45], [16.55, X1]]) this.plane(b - a, H, glass, (a + b) / 2, H / 2, Z1, Math.PI);
    this.plane(3.1, H - 2.75, glass, 15, 2.75 + (H - 2.75) / 2, Z1, Math.PI);
    o.col(X0, Z1 - 0.12, X1, Z1 + 0.12, true);
    // porta automática de duas folhas: abre quando alguém chega perto
    for (const x of [14.25, 15.75]) {
      const g = new THREE.Group();
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.62), glass);
      gl.position.y = 1.36;
      g.add(gl);
      for (const dx of [-0.72, 0.72]) {
        const st = box(0.05, 2.7, 0.06, bronze, 0);
        st.position.set(dx, 1.35, 0);
        g.add(st);
      }
      for (const y of [0.03, 2.68]) {
        const rail = box(1.48, 0.06, 0.06, bronze, 0);
        rail.position.y = y;
        g.add(rail);
      }
      const handle = box(0.03, 0.8, 0.05, mat('#c9a55a', 0.3, 0.75), 0.01);
      handle.position.set(x < 15 ? 0.6 : -0.6, 1.1, 0.06);
      g.add(handle);
      g.userData.dynamic = true;
      this.add(g, x, 0, Z1 + 0.05);
      this.doors.push(g);
    }
    this.add(box(3.1, 0.25, 0.3, bronze, 0.02), 15, 2.82, Z1);
    // placa de saída pendurada
    const exit = makeSign({ text: 'SAÍDA', sub: 'rua · casa · sofá', icon: 'exit', accent: '#2f9a57', theme: 'dark', w: 1.3, h: 0.34, double: true, hang: H - 3.4 - 0.17 });
    exit.rotation.y = Math.PI;
    this.add(exit, 15, 3.4, Z1 - 0.6);
    // marquise lá fora
    const can = mat('#2a2d34', 0.5, 0.3);
    this.add(box(8.4, 0.2, 2.6, can, 0.02), 15, 3.5, Z1 + 1.3);
    const dl = new THREE.MeshBasicMaterial({ color: '#fff1d6', toneMapped: false });
    for (const x of [12, 14, 16, 18]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), dl);
      c.rotation.x = Math.PI / 2;
      this.add(c, x, 3.39, Z1 + 1.3);
    }
  }

  // ------------------------------------------------------------------ recepção (leste)
  private buildReception() {
    const o = this.o;
    const cx = 23.6;
    const cz = -27.4;
    const a0 = Math.PI - 0.95;
    const a1 = Math.PI + 0.95;
    const front = new THREE.MeshStandardMaterial({ map: slatTex([3, 1]), roughness: 0.6 });
    const top = new THREE.MeshStandardMaterial({ map: graniteTex('#efe9df', [2, 1]), roughness: 0.2 });
    const led = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffcf8f', emissiveIntensity: 2.4, roughness: 1 });
    this.arc(1.8, 1.95, a0, a1, 1.0, front, cx, 0.06, cz);
    this.arc(1.78, 1.97, a0, a1, 0.06, mat('#24262c', 0.3, 0.1), cx, 0, cz);
    this.arc(1.95, 1.99, a0, a1, 0.025, led, cx, 0.07, cz);
    this.arc(1.3, 2.08, a0 - 0.03, a1 + 0.03, 0.06, top, cx, 1.06, cz);
    this.arc(2.04, 2.09, a0 - 0.03, a1 + 0.03, 0.02, led, cx, 1.04, cz);
    o.col(21.55, cz - 1.75, 22.95, cz + 1.75);
    // em cima do balcão: monitor, telefone, campainha e um vaso
    const mon = box(0.62, 0.38, 0.04, mat('#1b1e26', 0.4), 0.015);
    mon.rotation.y = Math.PI / 2 + 0.25;
    this.add(mon, 22.6, 1.42, cz - 0.6);
    this.add(box(0.05, 0.2, 0.05, mat('#1b1e26', 0.4), 0.01), 22.62, 1.18, cz - 0.6);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d9b46a', 0.25, 0.85));
    this.add(bell, 21.9, 1.12, cz + 0.35);
    this.add(o.makePlant(0.55, 2), 22.3, 1.12, cz + 1.1);
    const plate = makeSign({ text: 'RECEPÇÃO', sub: 'identifique-se (ou finja)', icon: 'bell', accent: '#c9a55a', theme: 'dark', w: 0.7, h: 0.2, glow: 0.3 });
    plate.rotation.y = -Math.PI / 2;
    plate.rotation.z = 0;
    this.add(plate, 21.82, 1.26, cz);
    this.add(box(0.06, 0.1, 0.5, mat('#24262c', 0.3, 0.1), 0.01), 21.9, 1.14, cz);
    // parede de ripas com o logo dourado
    const panel = new THREE.MeshStandardMaterial({ map: slatTex([10, 1]), roughness: 0.55 });
    this.add(box(0.1, 3.9, 7.6, panel, 0), X1 - 0.06, 1.95, cz);
    this.add(box(0.12, 0.06, 7.6, led, 0), X1 - 0.12, 3.94, cz);
    const logo = new THREE.MeshStandardMaterial({ map: goldTextTex('BOSS KEY S.A.', 'DESDE 1998 · SINERGIA, FOCO E CAFÉ'), transparent: true, roughness: 0.3, metalness: 0.6, emissive: '#ffd59a', emissiveIntensity: 0.25 });
    logo.emissiveMap = logo.map;
    this.plane(4.6, 1.15, logo, X1 - 0.13, 2.6, cz, -Math.PI / 2);
    // cadeira da recepcionista
    const chair = o.makeChair('#2b3246');
    chair.rotation.y = -Math.PI / 2;
    this.add(chair, 24.3, 0, cz + 0.6);
  }

  // ------------------------------------------------------------------ catracas (entre a porta e os elevadores)
  private buildGates() {
    const o = this.o;
    const z = -29.7;
    const inox = mat('#c4cad2', 0.25, 0.85);
    const top = mat('#1b1e26', 0.2, 0.2);
    const ok = new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false });
    const no = new THREE.MeshBasicMaterial({ color: '#ff5a4f', toneMapped: false });
    const flap = new THREE.MeshStandardMaterial({ color: '#d5ecf5', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    for (const x of [12.1, 13.1, 14.1, 15.9, 16.9, 17.9]) {
      this.add(box(0.24, 0.98, 1.2, inox, 0.05), x, 0.49, z);
      this.add(box(0.26, 0.03, 1.22, top, 0.01), x, 0.995, z);
      const center = x === 14.1 || x === 15.9;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), center ? ok : no);
      dot.rotation.x = -Math.PI / 2;
      this.add(dot, x, 1.012, z - 0.4);
      o.col(x - 0.12, z - 0.6, x + 0.12, z + 0.6);
      // abas de vidro: fechadas nas pistas estreitas, recolhidas na pista larga do meio
      if (!center) for (const s of [-1, 1]) if ((x < 15 && !(x === 12.1 && s < 0)) || (x > 15 && !(x === 17.9 && s > 0))) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.55), flap);
        f.rotation.y = Math.PI / 2;
        this.add(f, x + s * 0.3, 0.78, z);
      }
    }
    // balcãozinho do segurança
    this.add(box(0.9, 1.05, 0.55, mat('#2b3246', 0.5), 0.04), 19.6, 0.525, z - 0.2);
    this.add(box(1.0, 0.05, 0.65, top, 0.02), 19.6, 1.07, z - 0.2);
    o.col(19.15, z - 0.48, 20.05, z + 0.08);
  }

  // ------------------------------------------------------------------ lojinha (oeste)
  private buildShop() {
    const o = this.o;
    const z0 = -32.7;
    const z1 = -24.3;
    const zc = (z0 + z1) / 2;
    const len = z1 - z0;
    const red = mat('#c8463d', 0.55);
    const cream = mat('#fff3df', 0.7);
    const wood = mat('#6b4428', 0.6);
    // paredes laterais do nicho
    for (const z of [z0, z1]) {
      this.add(box(3.9, 3.5, 0.16, cream, 0.02), X0 + 1.95, 1.75, z);
      this.add(box(0.2, 3.5, 0.22, wood, 0.02), X0 + 3.9, 1.75, z);
      o.col(X0, z - 0.1, X0 + 4.0, z + 0.1, true);
    }
    // estante do fundo com produtos
    this.add(box(0.5, 2.6, len - 0.3, wood, 0.02), X0 + 0.3, 1.3, zc);
    const pal = ['#ffd23f', '#ff8a3d', '#4da3ff', '#3ddc97', '#ff6b9a', '#b79cff', '#fff6e6', '#e5484d'].map((c) => mat(c, 0.55));
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const y of [0.5, 1.05, 1.6, 2.15]) {
      this.add(box(0.55, 0.04, len - 0.3, mat('#8a5a36', 0.5), 0.01), X0 + 0.6, y, zc);
      for (let z = z0 + 0.35; z < z1 - 0.35; ) {
        const w = 0.12 + rnd() * 0.18;
        const h = 0.14 + rnd() * 0.3;
        const kind = rnd();
        const m = pal[Math.floor(rnd() * pal.length)];
        if (kind < 0.35) this.add(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.4, h, 12), m), X0 + 0.65, y + 0.02 + h / 2, z + w / 2);
        else this.add(box(0.22, h, w, m, 0.015), X0 + 0.65, y + 0.02 + h / 2, z + w / 2);
        z += w + 0.03 + rnd() * 0.05;
      }
    }
    // balcão inteiro (com as pontas fechadas: ninguém passa para trás)
    this.add(box(0.75, 0.98, len, red, 0.03), SHOP_X, 0.49, zc);
    this.add(box(0.06, 0.08, len, mat('#fff6e6', 0.4), 0.01), SHOP_X + 0.38, 0.85, zc);
    this.add(box(0.95, 0.05, len + 0.1, cream, 0.02), SHOP_X - 0.02, 1.0, zc);
    o.col(SHOP_X - 0.4, z0, SHOP_X + 0.42, z1);
    // caixa registradora e pote de balas
    const reg = new THREE.Group();
    const rb = box(0.42, 0.18, 0.36, mat('#2b3246', 0.4), 0.03);
    rb.position.y = 0.09;
    const rs = box(0.3, 0.2, 0.03, mat('#1b1e26', 0.3), 0.01);
    rs.position.set(-0.05, 0.3, 0);
    rs.rotation.y = Math.PI / 2;
    reg.add(rb, rs);
    this.add(reg, SHOP_X, 1.025, z0 + 0.55);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.26, 18), new THREE.MeshStandardMaterial({ color: '#e8f6ff', roughness: 0.05, transparent: true, opacity: 0.45 }));
    this.add(jar, SHOP_X, 1.155, z1 - 0.5);
    for (let i = 0; i < 9; i++) this.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), pal[i % pal.length]), SHOP_X + (rnd() - 0.5) * 0.12, 1.07 + rnd() * 0.12, z1 - 0.5 + (rnd() - 0.5) * 0.12);
    // toldo listrado e letreiro
    const aw = new THREE.MeshStandardMaterial({ map: awningTex('#c8463d', '#fff3df'), roughness: 0.8, side: THREE.DoubleSide });
    aw.map!.wrapS = THREE.RepeatWrapping;
    aw.map!.repeat.set(len / 2.4, 1);
    // lona caindo para a frente do balcão (listras no sentido da queda) e a sanefa na ponta
    const ag = new THREE.PlaneGeometry(len, 1.7).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
    const awning = new THREE.Mesh(ag, aw);
    awning.rotation.z = -0.27;
    awning.castShadow = true;
    this.add(awning, X0 + 3.2, 3.24, zc);
    const val = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.24), aw);
    val.rotation.y = Math.PI / 2;
    this.add(val, X0 + 4.03, 2.9, zc);
    for (const z of [z0 + 0.1, z1 - 0.1]) this.add(box(1.75, 0.04, 0.04, mat('#24262c', 0.4, 0.4), 0.01), X0 + 3.2, 3.24, z);
    const sign = makeSign({ text: 'LOJINHA DO TÉRREO', sub: 'aceitamos Vale-Diversão · fiado só amanhã', icon: 'bag', accent: '#c8463d', theme: 'yellow', w: 3.6, h: 0.62, glow: 0.35 });
    sign.rotation.y = Math.PI / 2;
    this.add(sign, X0 + 4.05, 3.72, zc);
    const board = makeSign({ text: 'OFERTAS DA NOITE', sub: 'mudam todo dia · cada cópia sai mais cara', icon: 'star', accent: '#ffd23f', theme: 'dark', w: 2.6, h: 0.5, glow: 0.3 });
    board.rotation.y = Math.PI / 2;
    this.add(board, X0 + 0.6, 2.75, zc);
    // as 5 ofertas, lado a lado no balcão, cada uma num cavalete de acrílico
    const acr = new THREE.MeshStandardMaterial({ color: '#e8f6ff', roughness: 0.05, transparent: true, opacity: 0.35 });
    for (const z of SHOP_Z) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 640;
      const tex = liveTexture(canvas);
      tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.8), decodeLive(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true })));
      m.rotation.set(-0.18, Math.PI / 2, 0, 'YXZ');
      m.userData.dynamic = true;
      this.add(m, SHOP_X + 0.12, 1.47, z);
      this.add(box(0.3, 0.03, 0.5, acr, 0.01), SHOP_X + 0.05, 1.04, z);
      o.lobby.slots.push({ pos: W(SHOP_X + 1.5, z), ctx: canvas.getContext('2d')!, tex, mesh: m });
    }
  }

  // ------------------------------------------------------------------ espera (cantos do sul)
  private makeSofa(len: number, color: string) {
    const g = new THREE.Group();
    const m = mat(color, 0.85);
    const dark = mat('#24262c', 0.4, 0.3);
    const base = box(len, 0.42, 0.9, m, 0.08);
    base.position.y = 0.3;
    const back = box(len, 0.55, 0.22, m, 0.08);
    back.position.set(0, 0.72, -0.36);
    g.add(base, back);
    for (const s of [-1, 1]) {
      const arm = box(0.2, 0.32, 0.9, m, 0.07);
      arm.position.set(s * (len / 2 - 0.1), 0.62, 0);
      g.add(arm);
    }
    const n = Math.max(1, Math.round(len / 0.8));
    for (let i = 0; i < n; i++) {
      const c = box(len / n - 0.06, 0.14, 0.66, mat(color, 0.95), 0.06);
      c.position.set(-len / 2 + (i + 0.5) * (len / n), 0.57, 0.06);
      g.add(c);
    }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(0.05, 0.1, 0.05, dark, 0.01);
      leg.position.set(dx * (len / 2 - 0.1), 0.05, dz * 0.35);
      g.add(leg);
    }
    g.traverse((c) => (c.castShadow = true));
    return g;
  }

  private buildWaiting() {
    const o = this.o;
    // sudoeste: sofá, poltronas e mesa de centro olhando a rua
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), mat('#5a6b7a', 1));
    rug.rotation.x = -Math.PI / 2;
    this.add(rug, 7.7, 0.006, -22.3);
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.5).rotateX(-Math.PI / 2), mat('#7d8fa0', 1)), 7.7, 0.008, -22.3);
    const sofa = this.makeSofa(2.4, '#2f4858');
    sofa.rotation.y = Math.PI / 2;
    this.add(sofa, 5.75, 0, -22.3);
    o.col(5.3, -23.5, 6.2, -21.1);
    for (const z of [-23.1, -21.5]) {
      const ch = this.makeSofa(0.95, '#c98f55');
      ch.rotation.y = -Math.PI / 2;
      this.add(ch, 9.6, 0, z);
      o.col(9.15, z - 0.5, 10.05, z + 0.5);
    }
    const tbl = mat('#24262c', 0.3, 0.2);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 32), mat('#efe9df', 0.2)), 7.7, 0.44, -22.3);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.42, 16), tbl), 7.7, 0.21, -22.3);
    o.col(7.2, -22.8, 8.2, -21.8);
    for (let i = 0; i < 3; i++) {
      const mg = box(0.22, 0.012, 0.3, mat(['#e5484d', '#4da3ff', '#ffd23f'][i], 0.6), 0.005);
      mg.rotation.y = i * 0.5 - 0.4;
      this.add(mg, 7.6 + i * 0.08, 0.47 + i * 0.012, -22.4 + i * 0.05);
    }
    // luminária de chão
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 8), tbl), 5.8, 0.8, -20.75);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffcf8f', emissiveIntensity: 1.2, side: THREE.DoubleSide })), 5.8, 1.7, -20.75);
    this.add(o.makePlant(1.7, 1), 6.0, 0, -24.0);
    // sudeste: banco de madeira, revisteiro e plantas
    this.add(box(0.5, 0.42, 3.0, mat('#24262c', 0.3, 0.1), 0.03), 24.35, 0.21, -22.2);
    this.add(box(0.56, 0.06, 3.1, new THREE.MeshStandardMaterial({ map: slatTex([1, 2]), roughness: 0.6 }), 0.02), 24.35, 0.45, -22.2);
    o.col(24.05, -23.75, 24.7, -20.65);
    this.add(o.makePlant(1.8, 1), 24.0, 0, -20.75);
    this.add(o.makePlant(1.4, 0), 20.6, 0, -20.8);
    this.add(box(0.5, 1.1, 0.35, mat('#2b3246', 0.5), 0.03), 21.6, 0.55, -23.9);
    for (let i = 0; i < 4; i++) this.add(box(0.4, 0.32, 0.02, mat(['#fff6e6', '#ffd23f', '#e5484d', '#4da3ff'][i], 0.6), 0.005), 21.6, 0.75 + (i % 2) * 0.2, -23.9 + 0.19 + (i > 1 ? 0.03 : 0));
    o.col(21.3, -24.1, 21.9, -23.7);
  }

  // ------------------------------------------------------------------ a rua
  private buildStreet() {
    const L = -40;
    const R = 70;
    const len = R - L;
    const cx = (L + R) / 2;
    // céu ao fundo (proporção certa) e prédios de verdade na frente dele
    const sky = this.basic(streetSkyTex());
    this.plane(160, 70, sky, cx, 24, -2.65, Math.PI);
    // calçadas, meio-fio, pista
    const pav = this.outMat('#ffffff', 0.9);
    pav.map = pavingTex([len / 2.4, (Z1 - CURB) / 2.4]);
    pav.emissiveMap = pav.map;
    this.plane(len, CURB - Z1, pav, cx, 0, (Z1 + CURB) / 2, 0, -Math.PI / 2);
    const pav2 = this.outMat('#ffffff', 0.9);
    pav2.map = pavingTex([len / 2.4, (FACADE - ROAD_FAR) / 2.4]);
    pav2.emissiveMap = pav2.map;
    this.plane(len, FACADE - ROAD_FAR + 0.4, pav2, cx, 0, (ROAD_FAR + FACADE) / 2 + 0.2, 0, -Math.PI / 2);
    const curbM = this.outMat('#b9b4ab', 0.8);
    for (const z of [CURB, ROAD_FAR]) this.add(box(len, 0.16, 0.3, curbM, 0.03), cx, -0.07, z);
    const asp = this.outMat('#ffffff', 0.95);
    asp.map = asphaltTex([len / 4, (ROAD_FAR - CURB) / 4]);
    asp.emissiveMap = asp.map;
    this.plane(len, ROAD_FAR - CURB, asp, cx, -0.15, (CURB + ROAD_FAR) / 2, 0, -Math.PI / 2);
    const paint = this.outMat('#f2efe6', 0.8);
    const yellow = this.outMat('#f5c42c', 0.8);
    const mid = (CURB + ROAD_FAR) / 2;
    for (let x = L; x < R; x += 4) if (x < 11 || x > 19) this.add(box(2, 0.01, 0.12, yellow, 0), x + 1, -0.142, mid);
    for (const z of [CURB + 0.35, ROAD_FAR - 0.35]) this.add(box(len, 0.01, 0.1, paint, 0), cx, -0.142, z);
    // faixa de pedestre na frente da porta
    for (let x = 12.4; x < 18; x += 0.9) this.add(box(0.5, 0.01, ROAD_FAR - CURB - 1.2, paint, 0), x, -0.141, mid);
    // prédios do outro lado (térreo com loja + andares com janelas)
    // fachadas compartilhadas (repetidas por UV) com a cidade vista do escritório: uma textura por estilo, não por prédio
    const set = facadeSet();
    const upperM = set.map((f) => this.basic(f.day));
    const glowM = set.map((f) => {
      const m = new THREE.MeshBasicMaterial({ map: f.lights, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
      this.night.push(m);
      return m;
    });
    const sideM = set.map((f) => this.basic(null, f.style.wall));
    const trimMs = set.map((f) => this.basic(null, f.style.trim));
    const shops: [string, string][] = [['PADARIA PÃO QUENTE', '#ffb347'], ['FARMÁCIA', '#3ddc97'], ['XEROX & CIA', '#4da3ff'], ['LANCHONETE', '#ff6b6b'], ['ÓTICA', '#b79cff'], ['CHAVEIRO 24H', '#ffd23f'], ['BANCO', '#7fd0ff']];
    const fronts = new Map<string, THREE.MeshBasicMaterial>();
    const widths = [10, 8, 12, 9, 11, 8, 10, 12, 9, 11, 10, 9];
    const heights = [14, 22, 17, 26, 12, 19, 24, 15, 20, 13, 23, 16];
    let x = L;
    let i = 0;
    while (x < R) {
      const w = widths[i % widths.length];
      const h = heights[i % heights.length];
      const k = i % set.length;
      const st = set[k].style;
      const fx = x + w / 2;
      const depth = 1.3;
      const zc = FACADE + depth / 2;
      const side = sideM[k];
      // térreo
      const [sn, sc] = shops[i % shops.length];
      const key = `${sn}|${k}`;
      let front = fronts.get(key);
      if (!front) fronts.set(key, (front = this.basic(storefrontTex(sn, sc, st.wall, 70 + i))));
      const gf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 3.6, depth), [side, side, side, side, side, front]);
      this.add(gf, fx, 1.8, zc);
      // andares: caixa lisa e a fachada (com janelas) na frente, repetindo a cada 8 × 12 m
      const uh = Math.max(2, Math.round((h - 3.6) / 3)) * 3;
      this.add(new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, uh, depth), side), fx, 3.6 + uh / 2, zc);
      for (const [m, dz] of [[upperM[k], 0.006], [glowM[k], 0.02]] as const) {
        const f = new THREE.Mesh(facadeUV(new THREE.PlaneGeometry(w - 0.2, uh), w - 0.2, uh), m);
        f.rotation.y = Math.PI;
        this.add(f, fx, 3.6 + uh / 2, FACADE - dz);
      }
      // cornija e caixa d'água
      const trimM = trimMs[k];
      this.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.35, depth + 0.3), trimM), fx, 3.6 + uh + 0.17, zc - 0.15);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.2, depth + 0.2), trimM), fx, 3.65, zc - 0.1);
      if (i % 3 === 1) this.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.2), this.basic(null, '#9aa3ad')), fx + w * 0.2, 3.6 + uh + 1.1, zc);
      x += w;
      i++;
    }
    // postes de luz e árvores na nossa calçada; árvores também na de lá
    const pole = this.outMat('#2a2d34', 0.5, 0.4);
    for (const px of [-6, 8, 22, 36]) {
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 10), pole), px, 2.6, CURB - 0.5);
      const arm = box(0.08, 0.08, 1.6, pole, 0.02);
      this.add(arm, px, 5.15, CURB + 0.25);
      const lampM = new THREE.MeshStandardMaterial({ color: '#2a2d34', emissive: '#ffd79a', emissiveIntensity: 0, roughness: 0.5 });
      this.lamps.push(lampM);
      this.add(box(0.36, 0.14, 0.6, lampM, 0.04), px, 5.05, CURB + 0.95);
    }
    const trunk = this.outMat('#6b4a32', 0.9);
    const leaves = [this.outMat('#4f9a52', 0.85), this.outMat('#3e8446', 0.85), this.outMat('#67b062', 0.85)];
    const planter = this.outMat('#55585f', 0.6);
    const tree = (tx: number, tz: number, s: number) => {
      this.add(box(1.3, 0.45, 1.3, planter, 0.04), tx, 0.22, tz);
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 2.6 * s, 8), trunk), tx, 1.3 * s + 0.4, tz);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 * s, 1), leaves[k % 3]);
        b.position.set(Math.cos(a) * 0.6 * s, 0, Math.sin(a) * 0.6 * s);
        b.castShadow = false;
        this.add(b, tx + Math.cos(a) * 0.6 * s, 3.0 * s + 0.4 + (k % 2) * 0.35, tz + Math.sin(a) * 0.6 * s);
      }
      this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * s, 1), leaves[1]), tx, 3.6 * s + 0.4, tz);
    };
    for (const tx of [1, 11.2, 18.8, 29]) tree(tx, CURB - 1.4, 1);
    for (const tx of [-2, 13, 27, 41]) tree(tx, FACADE - 1.1, 0.9);
    // banca de jornal e ponto de ônibus (dão vida ao fundo)
    this.add(box(2.4, 2.3, 1.6, this.outMat('#2f7d4a', 0.6), 0.05), -1.5, 1.15, CURB - 3.2);
    this.add(box(2.8, 0.12, 2.0, this.outMat('#e8e1d2', 0.6), 0.03), -1.5, 2.4, CURB - 3.1);
    this.add(box(3.2, 0.08, 1.3, this.outMat('#2a2d34', 0.4, 0.3), 0.02), 31, 2.5, CURB - 0.9);
    for (const px of [29.6, 32.4]) this.add(box(0.08, 2.5, 0.08, pole, 0.01), px, 1.25, CURB - 1.4);
    this.add(box(2.6, 0.08, 0.45, this.outMat('#c98f55', 0.7), 0.02), 31, 0.45, CURB - 1.3);
    // carros
    const colors = ['#e5484d', '#4da3ff', '#f2efe6', '#ffd23f', '#2b3246', '#3ddc97'];
    const lanes = [CURB + 1.9, ROAD_FAR - 1.9];
    for (let k = 0; k < 6; k++) {
      const dir = k % 2 ? -1 : 1;
      const g = this.makeCar(colors[k]);
      g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.userData.dynamic = true;
      this.add(g, 0, -0.15, lanes[k % 2]);
      this.cars.push({ g, speed: dir * (6 + (k * 1.7) % 4), x: L + ((k * 23) % len) });
    }
  }

  private makeCar(color: string) {
    const g = new THREE.Group();
    const body = box(1.8, 0.62, 4.0, this.outMat(color, 0.35, 0.3), 0.18);
    body.position.y = 0.6;
    const cab = box(1.6, 0.58, 2.1, new THREE.MeshStandardMaterial({ color: '#1c2330', roughness: 0.1, metalness: 0.5 }), 0.16);
    cab.position.set(0, 1.12, -0.2);
    g.add(body, cab);
    const tire = this.outMat('#1b1c20', 0.9);
    for (const [x, z] of [[-0.85, 1.25], [0.85, 1.25], [-0.85, -1.3], [0.85, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.34, z);
      g.add(w);
    }
    const head = new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false });
    this.headlights.push(head);
    const tail = new THREE.MeshBasicMaterial({ color: '#ff3b30', toneMapped: false });
    for (const x of [-0.6, 0.6]) {
      const h = box(0.36, 0.14, 0.04, head, 0.01);
      h.position.set(x, 0.66, 2.0);
      const t = box(0.32, 0.12, 0.04, tail, 0.01);
      t.position.set(x, 0.7, -2.0);
      g.add(h, t);
    }
    return g;
  }

  // ------------------------------------------------------------------ luz
  private buildLights() {
    const pl = (c: string, i: number, d: number, x: number, y: number, z: number) => {
      const l = new THREE.PointLight(c, i, d, 1.4);
      this.add(l, x, y, z);
      this.lights.push(l);
    };
    pl('#ffe2b8', 6, 13, 10, 4.3, -27.4);
    pl('#ffe2b8', 6, 13, 20, 4.3, -27.4);
    pl('#ffd9a6', 5, 12, 15, 3.0, -25.2);
    pl('#ffe8c8', 4.5, 10, 15, 4.3, -32.4);
    pl('#ffd08a', 4, 7, SHOP_X - 0.6, 2.9, -28.5);
    pl('#ffd59a', 3, 7, 23.2, 3.4, -27.4);
  }

  /**
   * Liga as luzes do térreo só com a câmera lá. Apaga pela intensidade, nunca por `visible`: mudar o número de luzes
   * da cena recompila o shader de todos os materiais (a tela travava no quadro em que a cabine trocava de andar).
   */
  setActive(on: boolean, cabinLights: THREE.Light[]) {
    if (on === this.lightsOn) return;
    this.lightsOn = on;
    for (const l of [...this.lights, ...cabinLights]) {
      l.userData.baseI ??= l.intensity;
      l.intensity = on ? l.userData.baseI : 0;
    }
  }

  /** Porta automática, carros, e a rua seguindo a hora do dia (céu, fachadas, janelas acesas, postes). */
  update(dt: number, look: DayLook | null, actors: THREE.Vector3[]) {
    const door = W(15, Z1);
    const near = actors.some((p) => Math.abs(p.x - door.x) < 2.2 && Math.abs(p.z - door.z) < 2.6);
    this.doorK += ((near ? 1 : 0) - this.doorK) * Math.min(1, dt * 4);
    const off = this.doorK * 1.35;
    this.doors[0].position.x = W(14.25 - off, 0).x;
    this.doors[1].position.x = W(15.75 + off, 0).x;
    for (const c of this.cars) {
      c.x += c.speed * dt;
      if (c.x > 72) c.x = -42;
      if (c.x < -42) c.x = 72;
      c.g.position.x = W(c.x, 0).x;
    }
    if (!look) return;
    const tint = look.skyTint;
    const day = THREE.MathUtils.clamp((tint.r + tint.g + tint.b) / 3, 0.25, 1.1);
    for (const { m, base } of this.dayBasic) m.color.copy(base).multiply(tint);
    for (const m of this.outStd) m.emissiveIntensity = 0.12 + 0.5 * day;
    for (const m of this.night) m.opacity = look.cityK;
    for (const m of this.lamps) m.emissiveIntensity = 3 * look.lampK;
    const hk = 0.6 + 1.4 * look.lampK;
    for (const m of this.headlights) m.color.setRGB(hk, hk * 0.95, hk * 0.82);
  }
}
