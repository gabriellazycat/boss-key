import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
  carpetTex, ceilingTex, posterTex, signTex, tileTex, wallTex, woodTex, ballDoodle, puddleTex, paintTex,
  loungeFloorTex, glowTex, neonTex, rugTex,
} from './textures';
import { dayLook, type Weather } from './Daylight';
import { Outside } from './Outside';
import { deskTheme, mergeGroup, placeOnDesk } from './DeskDecor';
import { decodeLive, liveTexture } from '../core/liveTexture';
import { makeSign } from './Signs';
import { LobbyScene } from './Lobby';
import { City } from './City';
import { streetSkyTex } from './lobbyTextures';

// a planta mora num módulo próprio (o saguão do térreo também precisa dela, sem ciclo de import)
import { MAP, W, ELEV_F, LOBBY_DZ, LOBBY, ELEV_SPOTS } from './plan';
export { MAP, W, ELEV_F, LOBBY_DZ, LOBBY, ELEV_SPOTS };

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
  /** Referencial da mesa (girado no salão): "parede" virtual em x=0, monitor em +x, cadeira em x=1,45. */
  frame: THREE.Group;
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
  /** Para onde a cadeira gira (ela interpola): encosto atrás de quem senta, ou virado para o PC vazia. */
  chairYaw: number;
  bin: THREE.Vector3;
  light: THREE.PointLight;
  crumbs: THREE.Group;
  puddle: THREE.Mesh;
  nameplate: THREE.Object3D;
  /** Só a mesa do jogador tem o monte de papel. */
  pile: PaperPile | null;
  /** Telefone de mesa (o do jogador toca quando o chefe liga). */
  phone: { group: THREE.Group; handset: THREE.Mesh; led: THREE.MeshBasicMaterial };
}

/** Monte de bolinhas de papel amassado numa bandejinha da mesa. */
export interface DeskExtras {
  plant: THREE.Object3D;
  mirror: THREE.Object3D;
  postit: THREE.Object3D;
}

export interface PaperPile {
  group: THREE.Group;
  balls: THREE.Mesh[];
  count: number;
  /** Centro da bandeja (mundo). */
  pos: THREE.Vector3;
}

/** Porta com dobradiça (abre para dentro, girando em y). */
export interface SwingDoor {
  group: THREE.Group;
  /** +1 se a folha sai da dobradiça para +x, -1 para -x. */
  dir: number;
  open: number;
  max: number;
}

export interface Bathroom {
  /** Centro do vão de entrada (na parede z = 4). */
  entry: THREE.Vector3;
  /** Ponto do lado de fora, onde o chefe para e desconfia. */
  out: THREE.Vector3;
  /** Frente da cabine (onde aparece o "esconder"). */
  stallFront: THREE.Vector3;
  /** Centro da porta da cabine (a fresta por onde se espia). */
  stallDoorPos: THREE.Vector3;
  /** Onde a bola fica escondida (dentro da cabine, na frente da privada). */
  hidePos: THREE.Vector3;
  /** Olho de quem está escondido: rente à borda livre da porta, espiando pela fresta. */
  peek: THREE.Vector3;
  door: SwingDoor;
  stallDoor: SwingDoor;
  /** Retângulo interno (mundo) para saber se a câmera está dentro. */
  box: AABB;
  mirror: THREE.Object3D;
  light: THREE.PointLight;
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
const MAT_CACHE = new Map<string, THREE.MeshStandardMaterial>();
/** Material fosco "pintado"; reaproveitado por cor/parâmetros (permite mesclar geometria). */
export const mat = (color: string, rough = 0.85, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const key = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`;
  let m = MAT_CACHE.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map: PAINT, ...extra });
    MAT_CACHE.set(key, m);
  }
  return m;
};

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

/** Monitor da mesa: grande e perto de quem senta (distância da parede, tamanho da tela e altura do centro). */
const MON_X = 0.5;
const MON_W = 1.05;
const MON_H = 0.656;
const MON_Y = 1.22;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Mesas (planta): lugar da cadeira e de que lado a porta do chefe aparece (+1 / −1). Em arco em volta da porta,
 * para nenhuma tapar a vista da outra. A ordem é a dos funcionários (0 = jogador).
 */
const DESK_LAYOUT: [number, number, 1 | -1][] = [
  [4.5, 12, 1], [3, 8.5, 1], [7.5, 15.5, 1], [17.2, 9.6, -1], [15.5, 12.6, -1], [12.5, 15.5, -1],
];
/** Ângulo (graus) entre o centro do monitor e a porta do chefe: fora do monitor, dentro da visão. */
const DESK_DOOR_SIDE = 40;

export const CHAIR_COLORS = ['#ff8a3d', '#4da3ff', '#ff6b9a', '#ffd23f', '#9b7bff', '#3ddc97'];

export const box = (w: number, h: number, d: number, m: THREE.Material, r = 0.03) => {
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
  readonly raceChairs: RaceChair[] = [];
  /** Lixeiras/cestas onde a bolinha de papel conta ponto (borda, mundo). */
  readonly bins: { rim: THREE.Vector3; r: number; hoop: boolean }[] = [];
  readonly panels: THREE.Mesh[] = [];
  readonly hallLights: THREE.PointLight[] = [];
  readonly shafts: THREE.Mesh[] = [];
  readonly baths: Bathroom[] = [];
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
  copaCam!: THREE.Group;
  /** Distrações: o rádio da copa (luz acesa = tocando) e o alarme de incêndio (lâmpada piscando). */
  private radioLed!: THREE.MeshBasicMaterial;
  private alarmLamp!: THREE.MeshBasicMaterial;
  private alarmLight!: THREE.PointLight;
  /** Câmera no hall: o sol (sem sombra lá) baixa. */
  lobbyView = false;
  /** Luz "de térreo" (hall ou qualquer cabine: as duas têm que ficar iguais) e a mistura suave até ela (0 = escritório). */
  lobbyLight = false;
  private lobbyMix = 0;
  /** Conta os quadros (update): os espelhos refazem o reflexo só uma vez em cada um. */
  private frame = 0;
  private copaRecMat!: THREE.MeshBasicMaterial;
  breakerLight!: THREE.Mesh;
  coffeeCupProto!: THREE.Group;
  paperProto!: THREE.Mesh;
  reportProto!: THREE.Mesh;
  couch!: { seat: THREE.Vector3; yaw: number; stand: THREE.Vector3 };
  dust!: THREE.Points;
  private dustBase!: Float32Array;
  lightLevel = 1;
  stringBulbs!: THREE.InstancedMesh;
  siren!: { group: THREE.Group; light: THREE.SpotLight; dome: THREE.Mesh; on: number };
  /** Elevador (vão leste): 0 = porta fechada, 1 = aberta. */
  elevatorOpen = 0;
  private elevDoorK = 0;
  private elevDoors!: [THREE.Group, THREE.Group];
  private elevFloor!: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; n: number; up: boolean; mat: THREE.Material };
  private elevPanel!: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mat: THREE.Material };
  elevMirror!: THREE.Object3D;
  /** Espelho da cabine do térreo (só renderiza com a câmera lá dentro). */
  lobbyMirror!: THREE.Object3D;
  /** Corpo do jogador: invisível para a câmera em 1ª pessoa, mas desenhado dentro dos espelhos. */
  reflectBody: THREE.Object3D | null = null;
  /** Gente que anda (colegas, chefias, figurantes): o espelho da cabine só desenha quem aparece pelo vão da porta. */
  mirrorPeople: THREE.Object3D[] = [];
  /** Peças soltas do prédio com a esfera em volta (o centro relativo à posição, porque as dinâmicas se mexem). */
  private doorCullList: { o: THREE.Object3D; off: THREE.Vector3; r: number }[] | null = null;
  private readonly cull = {
    eye: new THREE.Vector3(),
    p: new THREE.Vector3(),
    q: [0, 1, 2, 3].map(() => new THREE.Vector3()),
    planes: [0, 1, 2, 3].map(() => new THREE.Plane()),
    out: [] as THREE.Object3D[],
  };
  /** Último "look" do dia (o Game usa para a grade de cor). */
  lastLook: ReturnType<typeof dayLook> | null = null;
  /** Onde um pombo arrulhou neste quadro (o Game toca o som). */
  cooAt: THREE.Vector3 | null = null;
  /** Céu de fora: nuvens, avião, chuva, raios e pombos. */
  outside!: Outside;
  weather: Weather = 'sol';
  private skyMat!: THREE.MeshBasicMaterial;
  private city!: City;
  private readonly deskDecor = new Map<Desk, { key: string; g: THREE.Group }>();
  /** Itens da loja na mesa do jogador. */
  extras!: DeskExtras;
  /** Botões do elevador (interativo) e a luzinha que acende. */
  elevButtons!: THREE.Group;
  /** Interior da cabine (mundo). */
  readonly elevBox: AABB = { minX: W(13.1, 0).x, maxX: W(16.9, 0).x, minZ: W(0, 0.1).z, maxZ: W(0, ELEV_F - 0.1).z };
  /** Hall do térreo: portas do elevador (0 = fechadas), vitrines das vendinhas. */
  readonly lobby: {
    doors: THREE.Object3D[];
    open: number;
    k: number;
    slots: { pos: THREE.Vector3; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mesh: THREE.Mesh }[];
    /** Onde ficam os marcadores (lojinha, porta da rua, elevador) e o caminho de quem sai pela rua. */
    shopMark: THREE.Vector3;
    exit: THREE.Vector3;
    exitPath: THREE.Vector3[];
    elevMark: THREE.Vector3;
  } = { doors: [], open: 0, k: 0, slots: [], shopMark: new THREE.Vector3(), exit: new THREE.Vector3(), exitPath: [], elevMark: new THREE.Vector3() };
  /** Saguão do térreo (rua, porta automática, carros) e as luzes da cabine de baixo. */
  lobbyScene!: LobbyScene;
  readonly lobbyCabinLights: THREE.Light[] = [];
  /** Vão da porta da sala do chefe (planta x 9,22–10,78 na parede z = 4): só tapa a visão quando a porta está fechada. */
  private readonly bossDoorSight: AABB = { minX: W(9.22, 0).x, maxX: W(10.78, 0).x, minZ: W(0, 3.85).z, maxZ: W(0, 4.15).z };
  private readonly lobbyDoorBox: AABB = { minX: W(14.2, 0).x, maxX: W(15.8, 0).x, minZ: W(0, LOBBY_DZ + ELEV_F - 0.22).z, maxZ: W(0, LOBBY_DZ + ELEV_F + 0.12).z };
  /** Bloqueio da porta fechada (para o jogador não sair antes da hora). */
  private readonly elevDoorBox: AABB = { minX: W(14.2, 0).x, maxX: W(15.8, 0).x, minZ: W(0, ELEV_F - 0.22).z, maxZ: W(0, ELEV_F + 0.12).z };

  readonly P = {
    bossDesk: W(10, 1.6),
    bossDoor: W(10, 4.0),
    bossDoorOut: W(10, 5.2),
    tray: W(8.4, 4.7),
    coffee: W(4.0, 22.1),
    printer: W(7.6, 19.0),
    stamp: W(9.8, 19.1),
    breaker: W(0.6, 22.4),
    pizza: W(7.6, 22.55),
    meeting: W(10, 11.5),
    secCam: W(10, 4.6, 2.85),
    vending: W(18.6, 20.7),
    /** Centro da cabine do elevador e o lado de fora da porta. */
    elevator: W(15, ELEV_F / 2),
    elevatorDoor: W(15, ELEV_F),
    elevatorOut: W(15, ELEV_F + 1.0),
    elevatorBtn: W(16.35, ELEV_F - 0.75),
    /** Cadeira da reunião relâmpago e o viva-voz no meio da mesa. */
    meetingSeat: W(8.7, 12.75),
    speaker: W(10, 11.5, 0.84),
    ring: [W(5, 7), W(15, 7), W(15, 15), W(5, 15)],
    lounge: [W(8.4, 21.2), W(10.4, 21.4), W(14.4, 21.2)],
  };

  constructor() {
    this.buildShell();
    this.buildExterior();
    this.outside = new Outside(this.root);
    this.outside.root.userData.dynamic = true;
    this.buildLights();
    this.buildCubicles();
    this.buildBossRoom();
    this.buildElevator();
    this.buildBathrooms();
    this.buildCenter();
    this.buildKitchen();
    this.buildPrinter();
    this.buildLounge();
    this.buildDistractions();
    this.buildLockers();
    this.buildDecor();
    this.buildClutter();
    this.buildCeilingDecor();
    this.buildLobby();
    this.buildProtos();
    this.buildPile(this.desks[0]);
    this.buildExtras(this.desks[0]);
    this.markDynamic();
    this.optimize();
  }

  /** Objetos que mudam em jogo não podem ser mesclados. */
  private markDynamic() {
    const dyn: THREE.Object3D[] = [this.door, this.clockHour, this.clockMin, this.pizzaGroup, this.secCam, this.printerLight, this.breakerLight, ...this.shafts];
    for (const d of this.desks) dyn.push(d.chair, d.crumbs, d.puddle, d.screen);
    for (const r of this.raceChairs) dyn.push(r.group);
    for (const b of this.baths) dyn.push(b.door.group, b.stallDoor.group, b.mirror);
    dyn.push(this.elevMirror, this.lobbyMirror);
    for (const o of dyn) o.userData.dynamic = true;
  }

  /** Mescla toda a geometria estática por material (corta milhares de draw calls). */
  private optimize() {
    this.root.updateMatrixWorld(true);
    const isDynamic = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p && p !== this.root; p = p.parent) if (p.userData.dynamic) return true;
      return false;
    };
    const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; order: number }>();
    const remove: THREE.Mesh[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || isDynamic(m)) return;
      const mtl = m.material as THREE.Material;
      if ((mtl as THREE.ShaderMaterial).isShaderMaterial) return;
      const g = m.geometry.clone();
      if (!g.attributes.uv || !g.attributes.normal) return;
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.morphAttributes = {};
      g.clearGroups();
      g.applyMatrix4(m.matrixWorld);
      const key = `${mtl.uuid}|${m.castShadow}|${m.receiveShadow}|${g.index ? 'i' : 'n'}|${m.renderOrder}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: mtl, cast: m.castShadow, recv: m.receiveShadow, geos: [], order: m.renderOrder }));
      b.geos.push(g);
      remove.push(m);
    });
    for (const m of remove) m.removeFromParent();
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.recv;
      mesh.renderOrder = b.order;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
  }

  // ------------------------------------------------------------------ teto e luzes decorativas
  /** Sirene "CHEFE À SOLTA" em cima da porta (gira quando ele sai da sala). */
  private buildSiren() {
    const g = new THREE.Group();
    const base = box(0.3, 0.08, 0.2, M.dark, 0.02);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff3040', emissive: '#ff1020', emissiveIntensity: 0.2, roughness: 0.3, transparent: true, opacity: 0.85 }));
    dome.position.y = 0.04;
    const light = new THREE.SpotLight('#ff2a3a', 0, 14, 0.5, 0.5, 1.2);
    light.position.set(0, 0.1, 0);
    light.target.position.set(4, -2, 0);
    g.add(base, dome, light, light.target);
    g.userData.dynamic = true;
    this.add(g, 10, 2.76, 4.32);
    this.siren = { group: g, light, dome, on: 0 };
  }

  private buildCeilingDecor() {
    this.buildSiren();
    // forro modular do salão: perfis em grade + placas levemente alternadas
    const grid = mat('#e6dac4', 0.8, 0, { emissive: '#b8a888', emissiveIntensity: 0.45 });
    for (let z = 4; z <= 20; z += 1.25) this.add(box(MAP.w, 0.035, 0.05, grid, 0), MAP.w / 2, 2.985, z);
    for (let x = 0; x <= MAP.w; x += 1.25) this.add(box(0.05, 0.035, 16, grid, 0), x, 2.985, 12);
    const tileA = mat('#efe5d2', 1);
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 12; z++) if ((x * 7 + z * 3) % 5 === 0) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), tileA);
        t.rotation.x = Math.PI / 2;
        this.add(t, 0.625 + x * 1.25, 2.995, 4.625 + z * 1.25);
      }
    // forro de ripas de madeira na descompressão
    const slat = mat('#c98f55', 0.7);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, 4), mat('#5a3a24', 1));
    back.rotation.x = Math.PI / 2;
    this.add(back, MAP.w / 2, 2.97, 22);
    for (let z = 20.35; z < 23.9; z += 0.24) this.add(box(MAP.w, 0.08, 0.13, slat, 0), MAP.w / 2, 2.9, z);
    for (const x of [0.5, 6, 12, 19.5]) this.add(box(0.12, 0.1, 3.4, mat('#8a5a36', 0.7), 0), x, 2.82, 22.1);
    // varal de luzinhas
    const bulbCols = ['#ffd27a', '#ff8a6b', '#7fd0ff', '#b6ff8a', '#ff9be0'];
    const N = 3 * 46;
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
    bulbs.userData.dynamic = true;
    let k = 0;
    const m4 = new THREE.Matrix4();
    for (const z of [20.6, 22.2, 23.6]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const sag = Math.sin(t * Math.PI * 3) ** 2 * 0.32;
        pts.push(W(0.4 + t * 19.2, z, 2.78 - sag));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.008, 4, false), M.dark);
      this.root.add(wire);
      for (let i = 0; i < 46; i++) {
        const p = curve.getPoint((i + 0.5) / 46);
        m4.makeTranslation(p.x, p.y - 0.05, p.z);
        bulbs.setMatrixAt(k, m4);
        bulbs.setColorAt(k, new THREE.Color(bulbCols[k % bulbCols.length]).multiplyScalar(1.5));
        k++;
      }
    }
    this.root.add(bulbs);
    this.stringBulbs = bulbs;
    for (const x of [5, 10, 15]) this.add(new THREE.PointLight('#ffcf8f', 0.7, 6, 2), x, 2.4, 22.2);
    // nuvens acústicas coloridas no salão
    const clouds: [number, number, string][] = [[5, 8.4, PAL.teal], [15, 8.4, PAL.coral], [5, 14.4, PAL.yellow], [15, 14.4, PAL.lilac]];
    for (const [x, z, c] of clouds) {
      this.add(box(3.2, 0.09, 1.5, mat(c, 0.95), 0.04), x, 2.55, z);
      for (const [dx, dz] of [[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.6], [1.4, 0.6]]) this.add(box(0.012, 0.4, 0.012, M.dark, 0), x + dx, 2.78, z + dz);
    }
    // letreiro da empresa
    const logo = makeSign({ text: 'BOSS KEY S.A.', sub: '12º andar · elevadores', icon: 'up', accent: '#e5484d', theme: 'dark', w: 2.0, h: 0.42, font: '"Darumadrop One"', glow: 0.35 });
    this.add(logo, 15.0, 2.66, ELEV_F + 0.14);
    this.makeBin(18.6, 11.4, PAL.teal);
    this.makeBin(6.4, 9.6, PAL.coral);
    this.makeBin(2.6, 23.45, PAL.yellow);
    this.makeBin(18.45, 23.55, PAL.lilac);
  }

  add(o: THREE.Object3D, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    o.position.copy(W(x, z, y));
    parent.add(o);
    return o;
  }

  col(x0: number, z0: number, x1: number, z1: number, tall = false) {
    const a = W(Math.min(x0, x1), Math.min(z0, z1));
    const b = W(Math.max(x0, x1), Math.max(z0, z1));
    this.colliders.push({ minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z, tall });
  }

  /** Parede alinhada a um eixo, com rodapé; `y0/h` permitem peitoris e vergas de janelas. */
  wall(x0: number, z0: number, x1: number, z1: number, h = MAP.wallH, t = 0.2, y0 = 0, collide = true, m: THREE.Material = M.wall) {
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

  floor(x0: number, z0: number, x1: number, z1: number, m: THREE.Material, y = 0) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.add(f, (x0 + x1) / 2, y, (z0 + z1) / 2);
    return f;
  }

  // ------------------------------------------------------------------ casca
  private buildShell() {
    const { w, d } = MAP;
    this.floor(0, 4, w, 20, new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 0.95 }));
    this.floor(0, 20, w, d, new THREE.MeshStandardMaterial({ map: loungeFloorTex(), roughness: 0.55 }));
    this.floor(7, 0, 13, 4, new THREE.MeshStandardMaterial({ map: woodTex('#9a5f37', [4, 2]), roughness: 0.5 }));
    const bath = new THREE.MeshStandardMaterial({ map: tileTex('#eaf6f6', '#cfe9e8', 8, [2, 4.4]), roughness: 0.3 });
    const n = -MAP.north;
    this.floor(0, n, 3, 4, bath);
    this.floor(17, n, w, 4, bath);
    this.floor(3, 0, 7, 4, M.wallDark);
    this.floor(13, 0, 17, ELEV_F, new THREE.MeshStandardMaterial({ map: tileTex('#4b5470', '#3a4158', 8, [3, 4.2]), roughness: 0.35, metalness: 0.2 }), 0.004);
    this.floor(0, 20, 9.8, d, new THREE.MeshStandardMaterial({ map: tileTex('#fff4e2', '#f2c9a0', 8, [4, 1.5]), roughness: 0.4 }), 0.004);

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.1, d + 0.4), M.ceiling);
    ceil.castShadow = true;
    ceil.receiveShadow = true;
    this.add(ceil, w / 2, MAP.wallH + 0.05, d / 2);
    for (const bx of [1.5, 18.5]) this.add(box(3.4, 0.1, MAP.north + 0.2, M.ceiling, 0), bx, MAP.wallH + 0.05, n / 2 - 0.1);

    // fachada norte (topo da planta) e leste/oeste
    this.wall(3, 0, 17, 0);
    this.wall(0, n, 3, n);
    this.wall(17, n, w, n);
    this.wall(0, n, 0, 4.6);
    this.windowWall('z', 0, 4.6, 16.6, 1.75, 2.75);
    this.wall(0, 16.6, 0, d);
    this.wall(w, n, w, 4.6);
    this.windowWall('z', w, 4.6, 16.6, 1.75, 2.75);
    this.wall(w, 16.6, w, d);
    // fachada sul (descompressão): janelas em três vãos
    this.wall(0, d, 2, d);
    this.windowWall('x', d, 2, 7);
    this.wall(7, d, 9, d);
    this.windowWall('x', d, 9, 13);
    this.wall(13, d, 15, d);
    this.windowWall('x', d, 15, 18);
    this.wall(18, d, w, d);

    // faixa norte: banheiros (avançam além da fachada), sala do chefe e corredores fechados
    this.wall(3, n, 3, 4);
    this.wall(17, n, 17, 4);
    this.wall(3, 4, 7, 4);
    // vão leste: porta do elevador (1,6 m, alinhada à grade da Nav)
    this.wall(13, ELEV_F, 14.2, ELEV_F);
    this.wall(15.8, ELEV_F, 17, ELEV_F);
    this.wall(14.2, ELEV_F, 15.8, ELEV_F, 0.8, 0.2, 2.2, false);
    this.wall(7, 0, 7, 4);
    this.wall(13, 0, 13, ELEV_F);
    this.wall(17, 4, 17, ELEV_F);
    // banheiros: vão de 1,2 m com verga (as portas ficam em buildBathrooms)
    this.wall(0, 4, 0.9, 4);
    this.wall(2.1, 4, 3, 4);
    this.wall(0.9, 4, 2.1, 4, 0.8, 0.2, 2.2, false);
    this.wall(17, 4, 17.9, 4);
    this.wall(19.1, 4, w, 4);
    this.wall(17.9, 4, 19.1, 4, 0.8, 0.2, 2.2, false);

    // sala do chefe: janela de vidro com persiana e porta no meio
    this.wall(7, 4, 7.2, 4);
    this.wall(8.8, 4, 9.22, 4);
    this.wall(10.78, 4, 13, 4);
    this.wall(7.2, 4, 8.8, 4, 1.0);
    this.wall(7.2, 4, 8.8, 4, 0.8, 0.2, 2.2, false);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), M.glass);
    this.add(glass, 8, 1.6, 4);
    const slatMat = mat('#fff6e6', 0.6);
    for (let i = 0; i < 9; i++) {
      const slat = box(1.56, 0.012, 0.08, slatMat, 0);
      slat.rotation.x = 0.9;
      this.add(slat, 8, 1.08 + i * 0.13, 4.06);
    }
    this.col(7.2, 3.9, 8.8, 4.1, true);

    this.door = new THREE.Group();
    const leaf = box(1.55, 2.3, 0.07, M.woodDark, 0.02);
    leaf.position.set(0.78, 1.15, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat('#ffd23f', 0.3, 0.8));
    knob.position.set(1.38, 1.05, 0.06);
    const plate = makeSign({ text: 'DIRETORIA', sub: 'bata antes. ou melhor, não bata', icon: 'boss', accent: '#c0392b', theme: 'brass', w: 0.66, h: 0.2, glow: 0.15 });
    plate.position.set(0.78, 1.8, 0.05);
    this.door.add(leaf, knob, plate);
    this.add(this.door, 9.22, 0, 4);
    this.wall(9.22, 4, 10.78, 4, 0.7, 0.2, 2.3, false);
    for (const dx of [9.18, 10.82]) this.add(box(0.1, 2.32, 0.28, M.frame, 0.01), dx, 1.16, 4);

    // descompressão: meia-parede com dois vãos para entrar do salão
    const half = (x0: number, x1: number) => {
      const len = x1 - x0;
      this.add(box(len, 1.1, 0.2, M.wallPlain, 0.02), (x0 + x1) / 2, 0.55, 20);
      this.add(box(len + 0.06, 0.06, 0.32, M.wood, 0.02), (x0 + x1) / 2, 1.13, 20);
      this.col(x0, 19.9, x1, 20.1);
    };
    half(0, 3.4);
    half(5.4, 11.6);
    half(13.6, w);
  }

  // ------------------------------------------------------------------ banheiros
  /** Porta de abrir: dobradiça em (x, z) da planta; a folha sai para `dir` (±x) e abre para o norte. */
  private makeSwingDoor(x: number, z: number, width: number, h: number, dir: number, m: THREE.Material, y0 = 0, max = 1.45): SwingDoor {
    const group = new THREE.Group();
    const leaf = box(width - 0.04, h, 0.05, m, 0.02);
    leaf.position.set((dir * width) / 2, y0 + h / 2, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), M.metal);
    knob.position.set(dir * (width - 0.12), y0 + Math.min(1.0, h * 0.55), 0.05);
    const knob2 = knob.clone();
    knob2.position.z = -0.05;
    group.add(leaf, knob, knob2);
    this.add(group, x, 0, z);
    return { group, dir, open: 0, max };
  }

  /** Privada de louça virada para +z (sul), com caixa acoplada encostada na parede. */
  private makeToilet() {
    const g = new THREE.Group();
    const china = mat('#fbfaf6', 0.25);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.3, 20), china);
    ped.position.set(0, 0.15, 0.05);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.15, 0.16, 24), china);
    bowl.scale.z = 1.3;
    bowl.position.set(0, 0.36, 0.08);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), mat('#9fd8ec', 0.05));
    water.rotation.x = -Math.PI / 2;
    water.scale.y = 1.3;
    water.position.set(0, 0.42, 0.08);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.032, 8, 28), mat('#ffffff', 0.4));
    seat.rotation.x = Math.PI / 2;
    seat.scale.y = 1.3;
    seat.position.set(0, 0.455, 0.08);
    const lid = box(0.36, 0.46, 0.03, mat('#ffffff', 0.4), 0.012);
    lid.position.set(0, 0.68, -0.15);
    lid.rotation.x = -0.12;
    const tank = box(0.44, 0.38, 0.18, china, 0.04);
    tank.position.set(0, 0.68, -0.27);
    const tankLid = box(0.47, 0.04, 0.21, china, 0.015);
    tankLid.position.set(0, 0.89, -0.27);
    const flush = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 14), M.metal);
    flush.position.set(0, 0.915, -0.27);
    for (const o of [ped, bowl, seat, lid, tank, tankLid]) o.castShadow = true;
    g.add(ped, bowl, water, seat, lid, tank, tankLid, flush);
    return g;
  }

  /** Dois banheiros fundos (3 × 6,6 m): porta de entrada, cabine com privada, bancada com pias e espelho. */
  private buildBathrooms() {
    const n = -MAP.north;
    const tile = new THREE.MeshStandardMaterial({ map: tileTex('#ffffff', '#dff2f1', 8, [3, 1]), roughness: 0.3 });
    const stallMat = mat('#9fd8d2', 0.6);
    const counterMat = mat('#3b4258', 0.25);
    const sides = [
      { outer: 0, label: 'FEMININO', colr: '#ff6b9a' },
      { outer: MAP.w, label: 'MASCULINO', colr: '#4da3ff' },
    ];
    sides.forEach(({ outer, label, colr }, i) => {
      const sg = i ? -1 : 1;
      // u: distância da fachada lateral (0) até a parede interna (3)
      const X = (u: number) => outer + sg * u;
      const cx = X(1.5);

      // revestimento de azulejo até 1,3 m nas paredes de dentro
      const wains = (x0: number, z0: number, x1: number, z1: number) => {
        const t = box(Math.abs(x1 - x0) || 0.012, 1.3, Math.abs(z1 - z0) || 0.012, tile, 0);
        t.castShadow = false;
        this.add(t, (x0 + x1) / 2, 0.77, (z0 + z1) / 2);
      };
      wains(X(0.106), n + 0.1, X(0.106), 3.9);
      wains(X(2.894), n + 0.1, X(2.894), 3.9);
      wains(X(0.1), n + 0.106, X(2.9), n + 0.106);

      // placa na verga, do lado de fora
      const s = makeSign({ text: label, icon: 'wc', accent: colr, theme: 'light', w: 0.62, h: 0.2 });
      this.add(s, cx, 2.55, 4.13);
      // porta de entrada (abre para dentro)
      const door = this.makeSwingDoor(X(0.92), 4, 1.16, 2.18, sg, mat(colr, 0.5));
      for (const u of [0.86, 2.14]) this.add(box(0.08, 2.22, 0.26, M.frame, 0.01), X(u), 1.11, 4);

      // cabine no fundo, junto da fachada: divisória, frente e porta (com fresta embaixo)
      this.wall(X(1.5), n + 0.1, X(1.5), -0.9, 1.95, 0.05, 0.15, false, stallMat);
      this.col(X(1.5) - 0.04, n, X(1.5) + 0.04, -0.9);
      this.wall(X(0.1), -0.9, X(0.72), -0.9, 1.95, 0.05, 0.15, false, stallMat);
      this.col(X(0.1), -0.94, X(0.72), -0.86);
      for (const u of [0.72, 1.5]) this.add(box(0.05, 2.1, 0.05, M.metal, 0.01), X(u), 1.05, -0.9);
      this.add(box(0.85, 0.05, 0.05, M.metal, 0.01), X(1.11), 2.12, -0.9);
      const stallDoor = this.makeSwingDoor(X(1.47), -0.9, 0.74, 1.8, -sg, stallMat, 0.18, 1.35);
      this.add(this.makeToilet(), X(0.78), 0, n + 0.38);
      this.col(X(0.78) - 0.24, n, X(0.78) + 0.24, n + 0.72);
      // papel higiênico na divisória
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 16), mat('#ffffff', 0.9));
      roll.rotation.z = Math.PI / 2;
      this.add(roll, X(1.4), 0.72, n + 0.75);
      this.add(box(0.03, 0.03, 0.16, M.metal, 0.005), X(1.46), 0.79, n + 0.75);

      // bancada com duas pias e espelho na parede interna
      const ux = 2.62;
      this.add(box(0.56, 0.08, 2.2, counterMat, 0.02), X(ux), 0.86, 1.4);
      this.add(box(0.5, 0.78, 2.1, mat('#f2efe6', 0.6), 0.02), X(ux + 0.02), 0.43, 1.4);
      this.col(X(2.34), 0.3, X(2.9), 2.5);
      for (const z of [0.85, 1.95]) {
        // cuba embutida: louça clara com fundo mais escuro e ralo
        for (const [r, y, c] of [[0.17, 0.902, '#fbfaf6'], [0.11, 0.903, '#dfe6e8'], [0.022, 0.904, '#8a939c']] as [number, number, string][]) {
          const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat(c, 0.15, c === '#8a939c' ? 0.6 : 0));
          disc.rotation.x = -Math.PI / 2;
          disc.scale.y = 1.25;
          this.add(disc, X(ux - 0.04), y, z);
        }
        this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), M.metal), X(ux + 0.17), 1.0, z);
        this.add(box(0.14, 0.025, 0.025, M.metal, 0.008), X(ux + 0.11), 1.1, z);
      }
      this.add(box(0.03, 1.0, 2.1, M.frame, 0.01), X(2.895), 1.62, 1.4);
      const mirror = new Reflector(new THREE.PlaneGeometry(2.0, 0.9), { textureWidth: 768, textureHeight: 346, color: 0xd8dde2, clipBias: 0.003 });
      this.showBodyIn(mirror);
      mirror.rotation.y = -sg * (Math.PI / 2);
      mirror.visible = false;
      this.add(mirror, X(2.875), 1.62, 1.4);
      // secador de mãos e lixeira (vale como cesta de papel)
      this.add(box(0.12, 0.3, 0.26, M.white, 0.04), X(2.84), 1.25, 3.05);
      this.add(box(0.06, 0.03, 0.12, M.dark, 0.01), X(2.78), 1.08, 3.05);
      this.makeBin(X(2.6), 3.35, colr);

      // canto do fundo: mictório no masculino, vaso de planta no feminino
      if (i) {
        this.add(box(0.38, 0.6, 0.3, mat('#fbfaf6', 0.25), 0.12), X(2.3), 0.85, n + 0.25);
        this.add(box(0.03, 0.3, 0.03, M.metal, 0.005), X(2.3), 1.3, n + 0.12);
        this.col(X(2.3) - 0.2, n, X(2.3) + 0.2, n + 0.42);
      } else {
        this.add(this.makePlant(0.9, 1), X(2.4), 0, n + 0.45);
        this.col(X(2.4) - 0.25, n + 0.2, X(2.4) + 0.25, n + 0.7);
      }

      // luz do teto
      this.add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.05, 0.9, 2, 0.02), M.panel), cx, 2.97, 0.9);
      const light = new THREE.PointLight('#fff2dc', 2.6, 7, 1.6);
      this.add(light, cx, 2.6, 0.9);

      const a = W(Math.min(outer, X(3)), n);
      const b = W(Math.max(outer, X(3)), 4);
      this.baths.push({
        entry: W(cx, 4),
        out: W(cx, 4.9),
        stallFront: W(X(1.1), -0.4),
        stallDoorPos: W(X(1.1), -0.9),
        hidePos: W(X(0.78), -1.7),
        peek: W(X(0.778), -1.45, 1.45),
        door,
        stallDoor,
        box: { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z },
        mirror,
        light,
      });
    });
  }

  /** Banheiro mais perto de um ponto (mundo). */
  nearestBath(p: THREE.Vector3) {
    return this.baths.reduce((best, b) => (b.entry.distanceToSquared(p) < best.entry.distanceToSquared(p) ? b : best));
  }

  /**
   * Liga o corpo do jogador só durante o desenho do reflexo do espelho. O reflexo sai uma vez por quadro: o GTAO desenha
   * a cena de novo (normais) e, sem a trava, refazia o reflexo inteiro a cada passe. `userData.every` = de quantos em
   * quantos quadros (o da cabine visto do hall: o reflexo enxerga o saguão todo, ~1500 desenhos, e de longe não se nota).
   */
  private showBodyIn(mirror: Reflector) {
    const orig = mirror.onBeforeRender as (...a: unknown[]) => void;
    let drawn = -1e9;
    mirror.onBeforeRender = (...a: unknown[]) => {
      if (this.frame - drawn < ((mirror.userData.every as number) || 1)) return;
      drawn = this.frame;
      const body = this.reflectBody;
      if (body) body.visible = true;
      const cam = a[2] as THREE.Camera;
      const hide = mirror.userData.cabinDz !== undefined && mirror.userData.every === 1 ? this.outsideDoorView(mirror, cam) : [];
      for (const o of hide) o.visible = false;
      orig.apply(mirror, a);
      for (const o of hide) o.visible = true;
      if (body) body.visible = false;
    };
  }

  /**
   * Com a câmera dentro da cabine, o espelho do fundo só enxerga o lado de fora pelo vão da porta, mas o desenho não sabe
   * que as paredes tapam o resto (refazia o hall inteiro: ~700 desenhos a mais). Devolve o que está todo do lado de fora
   * e fora da pirâmide "olho refletido → vão da porta"; esses somem só durante o reflexo.
   */
  private outsideDoorView(mirror: THREE.Object3D, cam: THREE.Camera) {
    const t = this.cull;
    t.out.length = 0;
    const dz = mirror.userData.cabinDz as number;
    const doorZ = W(0, dz + ELEV_F).z;
    cam.getWorldPosition(t.eye);
    t.eye.z = 2 * mirror.getWorldPosition(t.p).z - t.eye.z;
    const [x0, x1] = [W(14.12, 0).x, W(15.88, 0).x];
    const [a, b, c, d] = t.q;
    a.set(x0, 0, doorZ);
    b.set(x1, 0, doorZ);
    c.set(x1, 2.3, doorZ);
    d.set(x0, 2.3, doorZ);
    // um ponto além do vão, no meio: dentro dos quatro planos
    const inner = t.p.set((x0 + x1) / 2, 1.15, doorZ).sub(t.eye).multiplyScalar(2).add(t.eye);
    const edges = [[a, b], [b, c], [c, d], [d, a]];
    edges.forEach(([u, v], i) => {
      const pl = t.planes[i].setFromCoplanarPoints(t.eye, u, v);
      if (pl.distanceToPoint(inner) < 0) pl.negate();
    });
    const seen = (center: THREE.Vector3, r: number) => center.z - r <= doorZ || t.planes.every((pl) => pl.distanceToPoint(center) >= -r);
    if (!this.doorCullList) {
      // só as peças soltas: o estático já foi mesclado em blocos do tamanho do prédio (esses ficam)
      this.doorCullList = [];
      const box = new THREE.Box3();
      const sph = new THREE.Sphere();
      for (const o of this.root.children) {
        if (o === this.elevMirror.parent || o === this.lobbyMirror.parent) continue;
        box.setFromObject(o);
        if (box.isEmpty()) continue;
        box.getBoundingSphere(sph);
        if (sph.radius > 12) continue;
        this.doorCullList.push({ o, off: sph.center.clone().sub(o.getWorldPosition(new THREE.Vector3())), r: sph.radius });
      }
    }
    const ctr = new THREE.Vector3();
    for (const { o, off, r } of this.doorCullList) {
      if (!o.visible) continue;
      o.getWorldPosition(ctr).add(off);
      if (!seen(ctr, r)) t.out.push(o);
    }
    for (const o of this.mirrorPeople) {
      if (!o.visible) continue;
      o.getWorldPosition(ctr).y += 0.8;
      if (!seen(ctr, 1.1)) t.out.push(o);
    }
    return t.out;
  }

  /** Portas abrem quando o jogador chega perto; o espelho só renderiza com a câmera lá dentro. */
  updateBaths(dt: number, player: THREE.Vector3 | null, hiding: Bathroom | null, eye: THREE.Vector3) {
    const k = Math.min(1, dt * 6);
    const near = (q: THREE.Vector3, r: number) => !!player && (player.x - q.x) ** 2 + (player.z - q.z) ** 2 < r * r;
    for (const b of this.baths) {
      const doorT = hiding === null && near(b.entry, 1.7) ? 1 : 0;
      const stallT = hiding === b ? 0.35 : near(b.stallDoorPos, 1.25) ? 1 : 0;
      for (const [d, target] of [[b.door, doorT], [b.stallDoor, stallT]] as [SwingDoor, number][]) {
        d.open += (target - d.open) * k;
        d.group.rotation.y = d.dir * d.open * d.max;
      }
      const bx = b.box;
      b.mirror.visible = eye.x > bx.minX - 0.2 && eye.x < bx.maxX + 0.2 && eye.z > bx.minZ && eye.z < bx.maxZ + 1.2;
    }
  }

  // ------------------------------------------------------------------ exterior
  private buildExterior() {
    // só o céu fica pintado (degradê e nuvens); a cidade na frente dele é de verdade, em 3D
    const sky = new THREE.MeshBasicMaterial({ map: streetSkyTex(), toneMapped: false, fog: false });
    this.skyMat = sky;
    for (const [x, z, rot] of [[MAP.w / 2, 70, Math.PI], [-50, MAP.d / 2, Math.PI / 2], [70, MAP.d / 2, -Math.PI / 2]] as const) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(220, 150), sky);
      s.rotation.y = rot;
      this.add(s, x, 30, z);
    }
    this.city = new City((o, x, y, z) => this.add(o, x, y, z));
    // 12º andar: em volta do escritório é o terraço do prédio (grama, deque e guarda-corpo); a rua fica lá embaixo
    const T = { x0: -9, x1: 29, z0: -3, z1: 37 };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(T.x1 - T.x0, T.z1 - T.z0), new THREE.MeshStandardMaterial({ color: '#86c46e', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.add(ground, (T.x0 + T.x1) / 2, -0.6, (T.z0 + T.z1) / 2);
    this.add(box(T.x1 - T.x0 + 0.6, 1.2, T.z1 - T.z0 + 0.6, mat('#c9c2b6', 0.8), 0), (T.x0 + T.x1) / 2, -1.25, (T.z0 + T.z1) / 2);
    const rail = mat('#3b4250', 0.4, 0.6);
    const glassRail = new THREE.MeshStandardMaterial({ color: '#cfeaff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false });
    for (const [a, b, at, alongX] of [[T.x0, T.x1, T.z1, true], [T.z0, T.z1, T.x0, false], [T.z0, T.z1, T.x1, false]] as const) {
      const len = b - a;
      const c = (a + b) / 2;
      const [x, z] = alongX ? [c, at] : [at, c];
      this.add(box(alongX ? len : 0.08, 0.06, alongX ? 0.08 : len, rail, 0.01), x, 0.5, z);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), glassRail);
      g.rotation.y = alongX ? 0 : Math.PI / 2;
      this.add(g, x, -0.05, z);
    }
    const street = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ color: '#6f766f', roughness: 1 }));
    street.rotation.x = -Math.PI / 2;
    this.add(street, MAP.w / 2, -40, MAP.d / 2);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(40, 4), mat('#d8d0c2', 0.9));
    walk.rotation.x = -Math.PI / 2;
    this.add(walk, MAP.w / 2, -0.55, 26.5);
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + Math.random() * 0.4, 1), i % 2 ? M.plant : M.plant2);
      b.castShadow = true;
      this.add(b, -6 + i * 2.1, -0.1, 30 + Math.random());
    }
  }

  // ------------------------------------------------------------------ luz
  private buildLights() {
    this.hemi = new THREE.HemisphereLight('#fff0dc', '#4f7f88', 0.78);
    this.root.add(this.hemi);
    this.fill = new THREE.AmbientLight('#ffe7c4', 0.12);
    this.root.add(this.fill);
    this.sun = new THREE.DirectionalLight('#ffd49a', 6);
    this.sun.position.copy(W(-6, 34, 13));
    this.sun.target.position.copy(W(MAP.w / 2, MAP.d / 2, 0));
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
    for (let x = 0; x < 4; x++)
      for (let z = 0; z < 3; z++) {
        const p = new THREE.Mesh(geo, M.panel);
        this.add(p, 1.5 + x * 4.25, 2.97, 7 + z * 4.5);
        this.panels.push(p);
      }
    for (const [x, z] of [[5, 8.5], [15, 8.5], [5, 15], [15, 15], [10, 6.5], [10, 18]]) {
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
    for (const [x0, x1] of [[2, 7], [9, 13], [15, 18]]) {
      const len = 4.4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, len), shaftMat);
      const start = W((x0 + x1) / 2, MAP.d, 1.65);
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
      const p = W(1 + Math.random() * 18, 4 + Math.random() * 19.5, 0.3 + Math.random() * 2.5);
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
    this.fill.intensity = 0.02 + 0.1 * on;
    M.panel.emissiveIntensity = 0.03 + 1.6 * on;
    M.lampGlow.emissiveIntensity = 0.1 + 2.5 * on;
    M.ceiling.emissiveIntensity = 0.04 + 0.51 * on;
    for (const l of this.hallLights) l.intensity = 7 * on;
    for (const b of this.baths) b.light.intensity = 2.6 * on;
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

  // ------------------------------------------------------------------ mesas
  /**
   * Mesas soltas no salão, em arco em volta da porta do chefe: cada uma gira para que, olhando o centro do monitor,
   * a porta (e o chefe saindo por ela) apareça de canto, a `DESK_DOOR_SIDE` graus — sem o monitor tapar.
   * Cada mesa é montada no próprio referencial (`frame`): "parede" virtual em x=0, monitor em x=MON_X virado para +x,
   * cadeira em x=1,45 (quem senta olha para −x).
   */
  private buildCubicles() {
    const plates = ['VOCÊ', 'Bia', 'Caio', 'Duda', 'Edu', 'Fê'];
    const door = this.P.bossDoor;
    const L = (o: THREE.Object3D, x: number, y: number, z: number, parent: THREE.Object3D) => {
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    DESK_LAYOUT.forEach(([px, pz, side], idx) => {
      const seat = W(px, pz);
      // olhar = raio até a porta girado; ψ = rotação do referencial (o olhar local é −x)
      const a = Math.atan2(door.z - seat.z, door.x - seat.x) + side * THREE.MathUtils.degToRad(DESK_DOOR_SIDE);
      const psi = Math.atan2(Math.sin(a), -Math.cos(a));
      const g = new THREE.Group();
      g.rotation.y = psi;
      g.position.copy(seat).sub(new THREE.Vector3(1.45, 0, 0).applyAxisAngle(UP, psi));
      g.updateMatrixWorld(true);
      const toW = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
      // lado da porta no referencial da mesa: o que é alto (luminária, planta, post-its) vai para o outro lado
      const far = -Math.sign(g.worldToLocal(door.clone()).z) || 1;
      L(box(0.95, 0.06, 1.95, M.wood, 0.025), 0.5, 0.75, 0, g);
      L(box(0.8, 0.7, 0.46, mat(CHAIR_COLORS[idx], 0.6), 0.03), 0.5, 0.36, 0.66, g);
      for (let i = 0; i < 3; i++) L(box(0.025, 0.025, 0.2, M.white, 0.01), 0.91, 0.6 - i * 0.2, 0.66, g);
      L(box(0.8, 0.72, 0.05, M.white, 0.015), 0.5, 0.36, -0.92, g);
      // fundo baixo da mesa (painel de privacidade): abaixo da linha do olho, não tapa a porta de ninguém
      L(box(0.05, 0.3, 1.95, M.partition, 0.02), 0.03, 0.93, 0, g);
      // colisor: caixa alinhada que cobre a mesa girada
      const cs = [toW(0, -0.97), toW(0.97, -0.97), toW(0.97, 0.97), toW(0, 0.97)];
      this.col(
        Math.min(...cs.map((c) => c.x)) + MAP.ox, Math.min(...cs.map((c) => c.z)) + MAP.oz,
        Math.max(...cs.map((c) => c.x)) + MAP.ox, Math.max(...cs.map((c) => c.z)) + MAP.oz,
      );
      L(box(0.08, 0.2, 0.08, M.dark, 0.02), MON_X - 0.04, 0.89, 0, g);
      L(box(0.22, 0.025, 0.3, M.dark, 0.012), MON_X - 0.04, 0.79, 0, g);
      const bezel = box(0.07, MON_H + 0.08, MON_W + 0.12, mat('#2c3348', 0.4), 0.03);
      L(bezel, MON_X, MON_Y, 0, g);
      const canvas = document.createElement('canvas');
      canvas.width = idx === 0 ? 1024 : 256;
      canvas.height = idx === 0 ? 640 : 160;
      const ctx = canvas.getContext('2d')!;
      const tex = liveTexture(canvas);
      tex.anisotropy = 8;
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(MON_W, MON_H),
        decodeLive(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.86, 0.86, 0.86) })),
      );
      screen.rotation.y = Math.PI / 2;
      L(screen, MON_X + 0.037, MON_Y, 0, g);
      // post-its na borda do monitor
      for (let k = 0; k < 3; k++) {
        const pi = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), mat(['#ffe066', '#ff9ec7', '#9be3c4'][(k + idx) % 3], 0.9, 0, { side: THREE.DoubleSide }));
        pi.rotation.y = Math.PI / 2;
        pi.rotation.z = (Math.random() - 0.5) * 0.4;
        L(pi, MON_X + 0.04, MON_Y + 0.1 - k * 0.12, far * (MON_W / 2 - 0.04 - (k % 2) * 0.05), g);
      }
      L(box(0.18, 0.025, 0.52, mat('#eef0f4', 0.5), 0.012), 0.72, 0.79, 0, g);
      L(box(0.1, 0.035, 0.065, mat('#eef0f4', 0.5), 0.017), 0.72, 0.795, -0.42, g);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 16), mat(CHAIR_COLORS[(idx + 2) % 6], 0.4));
      mug.castShadow = true;
      L(mug, 0.45, 0.835, -far * 0.74, g);
      const frame = box(0.03, 0.17, 0.14, M.woodDark, 0.01);
      frame.rotation.z = 0.2;
      L(frame, 0.18, 0.865, far * 0.6, g);
      if (idx % 2 === 0) L(this.makePlant(0.6, 2), 0.18, 0.78, far * 0.84, g);
      // luminária de mesa
      L(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 14), M.dark), 0.12, 0.79, far * 0.86, g);
      const arm1 = box(0.025, 0.36, 0.025, M.dark, 0.008);
      arm1.rotation.z = 0.35;
      L(arm1, 0.17, 0.96, far * 0.86, g);
      const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 14, 1, true), mat(CHAIR_COLORS[idx], 0.5, 0, { side: THREE.DoubleSide }));
      lampHead.rotation.z = 2.4;
      L(lampHead, 0.25, 1.13, far * 0.86, g);
      // telefone de mesa
      const phone = new THREE.Group();
      const pBase = box(0.17, 0.06, 0.2, M.dark, 0.02);
      pBase.position.y = 0.03;
      const keys = box(0.1, 0.008, 0.09, mat('#c9ced6', 0.4), 0.004);
      keys.position.set(0.02, 0.062, 0.03);
      const handset = box(0.07, 0.05, 0.22, mat('#2f3650', 0.4), 0.025);
      handset.position.set(-0.035, 0.085, 0);
      const ledMat = new THREE.MeshBasicMaterial({ color: '#3a4a3a', toneMapped: false });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), ledMat);
      led.position.set(0.07, 0.065, -0.07);
      phone.add(pBase, keys, handset, led);
      phone.userData.dynamic = true;
      L(phone, 0.7, 0.78, -0.8, g);
      // plaquinha com o nome em cima do monitor
      const np = makeSign({ text: plates[idx], theme: idx === 0 ? 'yellow' : 'light', w: 0.42, h: 0.11, glow: 0.12 });
      np.rotation.y = Math.PI / 2;
      L(np, MON_X + 0.04, MON_Y + MON_H / 2 + 0.12, 0, g);
      // a cadeira fica fora do referencial (o jogo gira e move em coordenadas do mundo)
      const chair = this.makeChair(CHAIR_COLORS[idx]);
      chair.position.copy(seat);
      chair.rotation.y = psi + Math.PI / 2;
      this.root.add(chair);
      const binW = toW(2.35, -1.75);
      const binP = this.makeBin(binW.x + MAP.ox, binW.z + MAP.oz, '#6c7f96');
      const light = new THREE.PointLight('#bfe0ff', 0.6, 3.2, 1.6);
      L(light, MON_X + 0.45, 1.15, 0, g);
      const crumbs = new THREE.Group();
      for (let i = 0; i < 14; i++) {
        const c = box(0.025, 0.012, 0.025, mat('#c58a45'), 0);
        c.position.set((Math.random() - 0.5) * 0.4, 0.79, (Math.random() - 0.5) * 0.7);
        c.rotation.y = Math.random() * 3;
        crumbs.add(c);
      }
      crumbs.visible = false;
      L(crumbs, 0.62, 0, 0, g);
      const puddle = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: puddleTex(), transparent: true, depthWrite: false }));
      puddle.rotation.x = -Math.PI / 2;
      puddle.visible = false;
      L(puddle, 0.6, 0.785, -0.3, g);
      this.root.add(g);
      this.desks.push({
        index: idx, frame: g, seat: seat.clone(), seatYaw: psi - Math.PI / 2,
        checkPos: toW(3.25, 0),
        standPos: toW(2.3, 0),
        screenCenter: toW(MON_X + 0.04, 0, MON_Y),
        screenNormal: new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, psi),
        screen, click: [screen, bezel], canvas, ctx, tex, chair, chairYaw: chair.rotation.y, bin: binP, light, crumbs, puddle, nameplate: np, pile: null,
        phone: { group: phone, handset, led: ledMat },
      });
    });
  }

  // ------------------------------------------------------------------ hall de entrada (térreo)
  /**
   * O térreo fica ao norte do prédio, fora da vista do escritório. A cabine do elevador do hall é a do escritório
   * deslocada em `LOBBY_DZ` (planta): entrar nela e fechar a porta = subir (o jogo teleporta com o mesmo deslocamento).
   */
  private buildLobby() {
    this.lobbyScene = new LobbyScene(this);
  }

  /** Ponto (mundo) dentro da cabine do elevador do hall. */
  inLobbyCabin(p: THREE.Vector3) {
    const a = W(13.1, LOBBY_DZ + 0.1);
    const b = W(16.9, LOBBY_DZ + ELEV_F - 0.3);
    return p.x > a.x && p.x < b.x && p.z > a.z && p.z < b.z;
  }

  /** Ponto (mundo) no térreo (hall ou cabine dele). */
  inLobby(p: THREE.Vector3) {
    return p.z < W(0, LOBBY.south + 1).z;
  }

  // ------------------------------------------------------------------ sala do chefe
  private buildBossRoom() {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), mat('#8c2a3c', 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    this.add(rug, 10, 0.41, 1.4);
    this.add(box(5, 0.4, 2.2, M.woodDark, 0.04), 10, 0.2, 1.3);
    this.add(box(2.6, 0.09, 1.05, M.woodDark, 0.04), 10, 1.15, 2.1);
    this.add(box(2.6, 0.75, 0.07, mat('#5e3420', 0.5), 0.03), 10, 0.78, 2.6);
    this.add(box(2.62, 0.05, 0.08, mat('#ffd23f', 0.3, 0.8), 0.01), 10, 1.05, 2.62);
    this.col(8.7, 1.6, 11.3, 2.65);
    const chair = this.makeChair('#7a2238', true);
    chair.scale.setScalar(1.5);
    this.add(chair, 10, 0.4, 1.1);
    this.add(box(0.9, 0.55, 0.05, M.dark, 0.02), 9.3, 1.5, 2.3);
    this.add(box(0.22, 0.08, 0.16, M.red, 0.03), 11.0, 1.24, 2.2);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.25, 12), mat('#ffd23f', 0.2, 0.9)), 11.4, 1.32, 2.0);
    this.add(box(1.8, 2.2, 0.4, M.woodDark, 0.02), 8.1, 1.1, 0.3);
    const bookCols = ['#e5484d', '#4da3ff', '#ffd23f', '#3ddc97', '#9b7bff', '#fff6e6'];
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 9; i++) this.add(box(0.12, 0.3 + Math.random() * 0.08, 0.25, mat(bookCols[(i + r) % 6], 0.6), 0.015), 7.6 + i * 0.16, 0.38 + r * 0.5, 0.45);
    this.col(7, 0, 13, 0.6);
    const pic = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.25),
      new THREE.MeshBasicMaterial({ map: posterTex('CHEFE DO MÊS', 'todo mês, desde 1998', '#f5d76e', (g) => ballDoodle(g, 114, 120, 70, '#9b2c47')) }),
    );
    this.add(pic, 11.6, 1.9, 0.12);
    this.add(this.makePlant(1.4, 1), 12.4, 0, 0.6);
    this.add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 16, 1, true), M.lampGlow), 8.9, 1.55, 1.9);
    this.add(new THREE.PointLight('#ffc27a', 2.5, 4, 1.8), 8.9, 1.45, 2.0);
    // bandeja do café: fica na frente da porta, do lado de fora da sala
    this.add(box(0.5, 0.95, 0.4, M.white, 0.03), 8.4, 0.475, 4.55);
    this.add(box(0.55, 0.04, 0.42, M.metal, 0.02), 8.4, 0.97, 4.55);
    this.add(makeSign({ text: 'BANDEJA', sub: 'do café do chefe', icon: 'tray', accent: '#ffd23f', theme: 'blue', w: 0.46, h: 0.15 }), 8.4, 0.72, 4.77);
    this.col(8.15, 4.35, 8.65, 4.75);
    const wb = document.createElement('canvas');
    wb.width = 512;
    wb.height = 320;
    const wtex = new THREE.CanvasTexture(wb);
    wtex.colorSpace = THREE.SRGBColorSpace;
    this.whiteboard = { canvas: wb, ctx: wb.getContext('2d')!, tex: wtex };
    this.drawWhiteboard(['BOSS KEY S.A.', 'Metas da semana:', '• SINERGIA', '• FOCO', '• ☕']);
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), new THREE.MeshStandardMaterial({ map: wtex, color: '#d6d1c6', roughness: 0.9 })), 4.6, 1.65, 4.12);
    this.add(box(2.32, 1.48, 0.04, M.metal, 0.02), 4.6, 1.65, 4.09);
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
    this.add(clock, 12.5, 2.55, 4.14);
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
    this.add(this.secCam, 10, 2.8, 4.5);
    // câmera da copa (truque do chefe): pendurada na meia-parede, olhando para a copa; a luz acende quando grava
    this.copaCam = this.secCam.clone();
    this.copaRecMat = new THREE.MeshBasicMaterial({ color: '#3a1010', toneMapped: false });
    (this.copaCam.children[2] as THREE.Mesh).material = this.copaRecMat;
    this.copaCam.visible = false;
    this.copaCam.userData.dynamic = true;
    this.add(this.copaCam, 10, 2.9, 19.6);
  }

  /** Luz da câmera da copa: vermelha = gravando. */
  setCopaRec(on: boolean) {
    this.copaRecMat.color.set(on ? '#ff2020' : '#3a1010');
  }

  /** Rádio da copa tocando (distração). */
  setRadio(on: boolean) {
    this.radioLed.color.set(on ? '#3ddc97' : '#1d3a2c');
  }

  /** Alarme de incêndio tocando: a lâmpada e uma luz vermelha no salão. */
  setFireAlarm(on: boolean) {
    this.alarmLamp.color.set(on ? '#ff2020' : '#5a1414');
    this.alarmLight.intensity = on ? 6 : 0;
  }

  /** Armários (esconderijo dos itens de missão): onde se fica de pé para usar e a porta (abre ao guardar). */
  readonly lockers: { pos: THREE.Vector3; mark: THREE.Vector3; door: THREE.Group; label: string }[] = [];

  /** Armários de metal nas paredes laterais (v0.9): guardam o que foi roubado. Cada um tem um número. */
  private buildLockers() {
    const spots: [number, number, 1 | -1][] = [[0.3, 14.2, 1], [19.7, 14.2, -1], [0.3, 17.1, 1], [19.7, 6.9, -1]];
    const colors = ['#5b8def', '#3ddc97', '#ff8a3d', '#b07cff'];
    spots.forEach(([x, z, face], i) => {
      const g = new THREE.Group();
      const body = box(0.5, 1.85, 0.55, mat('#8b95a8', 0.4, 0.5), 0.03);
      body.position.y = 0.925;
      const door = new THREE.Group();
      const leaf = box(0.03, 1.7, 0.5, mat(colors[i], 0.45, 0.3), 0.01);
      leaf.position.set(0, 0, 0.25);
      door.add(leaf);
      for (let k = 0; k < 4; k++) {
        const slot = box(0.035, 0.02, 0.3, M.dark, 0.003);
        slot.position.set(0, 0.62 - k * 0.05, 0.25);
        door.add(slot);
      }
      const handle = box(0.04, 0.12, 0.03, M.metal, 0.01);
      handle.position.set(0.02, -0.05, 0.44);
      door.add(handle);
      door.position.set(0.265, 0.93, -0.25);
      door.userData.dynamic = true;
      g.add(body, door);
      g.rotation.y = face > 0 ? 0 : Math.PI;
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.add(g, x + face * 0.0, 0, z);
      const num = makeSign({ text: `${i + 1}`, accent: colors[i], theme: 'light', w: 0.16, h: 0.16 });
      num.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.add(num, x + face * 0.29, 1.62, z);
      this.col(x - 0.28, z - 0.3, x + 0.28, z + 0.3);
      this.lockers.push({ pos: W(x + face * 0.95, z), mark: W(x + face * 0.4, z, 2.2), door, label: `armário ${i + 1}` });
    });
    // arquivo de aço com 4 gavetas coloridas (pauta "arquivar pastas")
    const file = new THREE.Group();
    const steel = mat('#9aa3b5', 0.35, 0.6);
    const shell = box(1.0, 1.3, 0.6, steel, 0.03);
    shell.position.y = 0.65;
    file.add(shell);
    ['#e5484d', '#3e8cff', '#3ddc97', '#ffd23f'].forEach((c, k) => {
      const d = box(0.44, 0.26, 0.03, mat(c, 0.5), 0.01);
      d.position.set(k % 2 ? 0.24 : -0.24, 0.95 - Math.floor(k / 2) * 0.4, -0.31);
      file.add(d);
    });
    file.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.add(file, 12.6, 0, 19.35);
    this.add(makeSign({ text: 'ARQUIVO', sub: 'pastas por cor', accent: '#9aa3b5', theme: 'light', w: 0.5, h: 0.14 }), 12.6, 1.45, 19.04);
    this.col(12.1, 19.05, 13.1, 19.65);
  }

  /** Arquivo de aço do corredor (pauta "arquivar pastas"): onde se fica para arquivar. */
  readonly filePos = W(12.6, 18.55);

  /** Porta do armário `i`: 0 = fechada, 1 = aberta. */
  setLocker(i: number, open: number) {
    const l = this.lockers[i];
    if (l) l.door.rotation.y = -open * 1.6;
  }

  /** Onde o aquário do chefe mora (em cima do aparador da sala dele, perto da porta). */
  readonly aquariumStand = W(7.78, 3.25, 0.76);

  // ------------------------------------------------------------------ distrações (rádio, alarme)
  private buildDistractions() {
    // aparador do aquário, dentro da sala do chefe, encostado na parede da frente
    this.add(box(0.85, 0.74, 0.48, M.woodDark, 0.03), 7.78, 0.37, 3.25);
    this.col(7.35, 3.0, 8.21, 3.5);
    // rádio vermelho em cima do aparador da TV
    const radio = new THREE.Group();
    radio.add(box(0.44, 0.26, 0.17, mat('#e5484d', 0.55), 0.05));
    const grille = box(0.2, 0.17, 0.02, M.dark, 0.01);
    grille.position.set(-0.09, 0, 0.09);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.white);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0.12, 0.03, 0.09);
    this.radioLed = new THREE.MeshBasicMaterial({ color: '#1d3a2c', toneMapped: false });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), this.radioLed);
    led.position.set(0.12, -0.07, 0.09);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.36, 6), M.metal);
    ant.position.set(0.17, 0.28, -0.03);
    ant.rotation.z = -0.35;
    radio.add(grille, knob, led, ant);
    radio.rotation.y = Math.PI;
    radio.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    radio.userData.dynamic = true;
    this.add(radio, 16.25, 0.63, 20.6);
    // alarme de incêndio: caixa vermelha na parede da frente, à esquerda do quadro da agenda (à vista de quem sai da sala do chefe)
    const alarm = new THREE.Group();
    alarm.add(box(0.26, 0.34, 0.08, mat('#d42a2a', 0.45), 0.03));
    const lever = box(0.14, 0.07, 0.06, M.white, 0.01);
    lever.position.set(0, -0.05, 0.05);
    this.alarmLamp = new THREE.MeshBasicMaterial({ color: '#5a1414', toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.alarmLamp);
    lamp.position.set(0, 0.2, 0.02);
    alarm.add(lever, lamp);
    alarm.userData.dynamic = true;
    this.add(alarm, 2.85, 1.35, 4.1);
    this.add(makeSign({ text: 'INCÊNDIO', sub: 'puxe a alavanca', accent: '#e5484d', theme: 'light', w: 0.34, h: 0.12 }), 2.85, 1.82, 4.1);
    this.alarmLight = new THREE.PointLight('#ff3030', 0, 14, 1.6);
    this.add(this.alarmLight, 10, 2.6, 10);
  }

  // ------------------------------------------------------------------ elevador
  private buildElevator() {
    this.buildCabin(0);
    this.buildCabin(LOBBY_DZ);
  }

  /** Cabine do elevador (interior, portas, displays); `dz` (planta) = 0 em cima, `LOBBY_DZ` no térreo: as duas são idênticas, a subida é invisível. */
  private buildCabin(dz: number) {
    const top = dz === 0;
    const cab = new THREE.Group();
    cab.position.z = dz;
    this.root.add(cab);
    const add = (o: THREE.Object3D, x: number, y: number, z: number) => this.add(o, x, y, z, cab);
    const steel = mat('#c9ced6', 0.32, 0.75);
    const steelDark = mat('#8d95a3', 0.35, 0.7);
    const wood = M.wood;
    // painéis de inox nas três paredes de dentro e corrimão de madeira
    const F = ELEV_F;
    const mid = F / 2;
    add(box(0.02, 2.5, F - 0.4, steel, 0), 13.11, 1.35, mid);
    add(box(0.02, 2.5, F - 0.4, steel, 0), 16.89, 1.35, mid);
    add(box(3.6, 2.5, 0.02, steel, 0), 15.0, 1.35, 0.11);
    for (const x of [13.6, 16.4]) add(box(1.0, 2.5, 0.02, steel, 0), x, 1.35, F - 0.11);
    add(box(1.8, 0.75, 0.02, steel, 0), 15.0, 2.62, F - 0.11);
    for (const z of [0.95, 2.0, 3.05, 4.1, 5.15]) {
      add(box(0.012, 2.5, 0.015, steelDark, 0), 13.12, 1.35, z);
      add(box(0.012, 2.5, 0.015, steelDark, 0), 16.88, 1.35, z);
    }
    add(box(0.06, 0.05, F - 0.7, wood, 0.02), 13.18, 0.95, mid);
    add(box(0.06, 0.05, F - 0.7, wood, 0.02), 16.82, 0.95, mid);
    add(box(3.3, 0.05, 0.06, wood, 0.02), 15.0, 0.95, 0.18);
    // teto iluminado
    add(new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.04, F - 1.6, 2, 0.02), M.panel), 15, 2.97, mid);
    for (const z of [1.5, F - 1.5]) {
      // a de cima recebe também as lâmpadas do escritório (alcance 11 m, atravessam a parede): a de baixo compensa
      const l = add(new THREE.PointLight('#fff1d6', top ? 3.2 : 4.3, 6, 1.6), 15, 2.6, z) as THREE.PointLight;
      if (!top) this.lobbyCabinLights.push(l);
    }
    // espelho no fundo (só renderiza com a câmera dentro, como o do banheiro)
    const mirror = new Reflector(new THREE.PlaneGeometry(2.6, 1.3), { textureWidth: 640, textureHeight: 320, color: 0xd8dde2, clipBias: 0.003 });
    mirror.visible = false;
    this.showBodyIn(mirror);
    add(mirror, 15, 1.65, 0.13);
    mirror.userData.cabinDz = dz;
    if (top) this.elevMirror = mirror;
    else this.lobbyMirror = mirror;
    // painel do dia (parede oeste de dentro) e display de andar: a mesma textura nas duas cabines
    if (top) {
      const pc = document.createElement('canvas');
      pc.width = 512;
      pc.height = 384;
      const ptex = new THREE.CanvasTexture(pc);
      ptex.colorSpace = THREE.SRGBColorSpace;
      this.elevPanel = { canvas: pc, ctx: pc.getContext('2d')!, tex: ptex, mat: new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false, color: new THREE.Color(0.92, 0.92, 0.92) }) };
      const fc = document.createElement('canvas');
      fc.width = 256;
      fc.height = 96;
      const ftex = liveTexture(fc);
      this.elevFloor = { canvas: fc, ctx: fc.getContext('2d')!, tex: ftex, n: -1, up: true, mat: decodeLive(new THREE.MeshBasicMaterial({ map: ftex, toneMapped: false })) };
    }
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), this.elevPanel.mat);
    panel.rotation.y = Math.PI / 2;
    add(panel, 13.13, 1.6, mid);
    add(box(0.03, 1.3, 1.7, M.dark, 0.02), 13.12, 1.6, mid);
    // display de andar (dentro, em cima da porta; e fora, ao lado da porta lá em cima)
    const fmat = this.elevFloor.mat;
    const inDisp = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), fmat);
    inDisp.rotation.y = Math.PI;
    add(inDisp, 15, 2.5, F - 0.135);
    if (top) {
      const outDisp = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.165), fmat);
      add(outDisp, 16.35, 2.0, F + 0.115);
      add(box(0.5, 0.21, 0.02, M.dark, 0.01), 16.35, 2.0, F + 0.105);
      this.setElevatorFloor(1, true);
    }
    // botões: dentro (parede leste, perto da porta) e o de chamar, fora
    const btns = new THREE.Group();
    const plate = box(0.03, 0.62, 0.24, steelDark, 0.01);
    btns.add(plate);
    const lit = new THREE.MeshBasicMaterial({ color: '#ffe9a8', toneMapped: false });
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14), i === 7 ? M.red : i === 3 ? lit : mat('#e8ecf1', 0.4, 0.3));
      b.rotation.z = Math.PI / 2;
      b.position.set(-0.02, 0.22 - Math.floor(i / 2) * 0.12, i % 2 ? 0.05 : -0.05);
      btns.add(b);
    }
    add(btns, 16.87, 1.15, F - 0.75);
    if (top) {
      btns.userData.dynamic = true;
      this.elevButtons = btns;
      add(box(0.12, 0.2, 0.02, steelDark, 0.01), 16.35, 1.15, F + 0.11);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), lit), 16.35, 1.17, F + 0.13);
    }
    // batente e portas de correr
    for (const x of [14.12, 15.88]) add(box(0.12, 2.24, 0.26, steelDark, 0.01), x, 1.12, F);
    add(box(1.88, 0.1, 0.26, steelDark, 0.01), 15.0, 2.25, F);
    const leaf = () => {
      const g = new THREE.Group();
      const l = box(0.8, 2.18, 0.05, steel, 0.01);
      l.position.y = 1.09;
      const line = box(0.81, 0.012, 0.055, steelDark, 0);
      line.position.y = 1.2;
      g.add(l, line);
      g.userData.dynamic = true;
      return g;
    };
    const a = leaf();
    const b = leaf();
    add(a, 14.6, 0, F - 0.14);
    add(b, 15.4, 0, F - 0.14);
    if (top) this.elevDoors = [a, b];
    else this.lobby.doors = [a, b];
  }

  /** Display de andar ("▲ 7"). Só reenvia a textura quando o número muda. */
  /** Material do display de andar (o mesmo nas duas cabines e na parede do térreo). */
  get floorDisplayMat() {
    return this.elevFloor.mat;
  }

  setElevatorFloor(n: number, up: boolean) {
    const f = this.elevFloor;
    if (f.n === n && f.up === up) return;
    f.n = n;
    f.up = up;
    const g = f.ctx;
    g.fillStyle = '#120d08';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ff9a3c';
    g.font = '700 64px "JetBrains Mono", monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(`${up ? '▲' : '▼'} ${n || 'T'}`, 128, 52);
    f.tex.needsUpdate = true;
  }

  /** Painel do dia dentro do elevador: tarefa fixa, evento e as diversões sorteadas. */
  drawElevatorPanel(day: string, fixed: string, event: string, eventDesc: string, funs: string[]) {
    const { ctx: g, canvas: c, tex } = this.elevPanel;
    g.fillStyle = '#10141f';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, c.width, 58);
    g.fillStyle = '#1b2233';
    g.textBaseline = 'middle';
    g.font = '400 36px "Darumadrop One", Fredoka, sans-serif';
    g.fillText(`☀ ${day.toUpperCase()}`, 18, 31);
    g.font = '600 22px Fredoka, sans-serif';
    g.fillStyle = '#a9b1c6';
    g.fillText('TAREFA FIXA', 18, 86);
    g.font = '700 22px Fredoka, sans-serif';
    g.fillStyle = '#3ddc97';
    const fw = fixed.split(': ');
    g.fillText(fw[0], 18, 116);
    if (fw[1]) g.fillText(fw[1], 18, 142);
    g.font = '600 22px Fredoka, sans-serif';
    g.fillStyle = '#a9b1c6';
    g.fillText('EVENTO DO DIA', 270, 86);
    g.font = '700 27px Fredoka, sans-serif';
    g.fillStyle = '#ff8a3d';
    g.fillText(event, 270, 122);
    g.font = '500 18px Fredoka, sans-serif';
    g.fillStyle = '#dfe4f0';
    const words = eventDesc.split(' ');
    let line = '';
    let y = 172;
    for (const w of words) {
      if (g.measureText(`${line} ${w}`).width > 470) {
        g.fillText(line.trim(), 18, y);
        y += 24;
        line = '';
      }
      line += ` ${w}`;
    }
    if (line.trim()) g.fillText(line.trim(), 18, y);
    y += 34;
    g.font = '600 22px Fredoka, sans-serif';
    g.fillStyle = '#ffd23f';
    g.fillText('MISSÕES DE HOJE (★ grande · • pequenas)', 18, y);
    g.font = '600 21px Fredoka, sans-serif';
    g.fillStyle = '#fff';
    funs.forEach((ch, i) => g.fillText(ch, 18, y + 28 + i * 26));
    tex.needsUpdate = true;
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

  // ------------------------------------------------------------------ salão central
  private buildCenter() {
    // mesa de reunião média (4 × 1,6 m) entre os pilares, com corredor livre em volta
    const mx = 10;
    const mz = 11.5;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.8), mat('#f2c38a', 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    this.add(rug, mx, 0.006, mz);
    this.add(box(4, 0.08, 1.6, M.wood, 0.05), mx, 0.75, mz);
    for (const [dx, dz] of [[-1.75, -0.6], [1.75, -0.6], [-1.75, 0.6], [1.75, 0.6]]) this.add(box(0.1, 0.71, 0.1, M.dark, 0.03), mx + dx, 0.355, mz + dz);
    this.col(mx - 2, mz - 0.8, mx + 2, mz + 0.8);
    for (let i = 0; i < 3; i++)
      for (const s of [-1, 1]) {
        const ch = this.makeChair(CHAIR_COLORS[(i * 2 + (s > 0 ? 1 : 0)) % 6]);
        this.add(ch, mx - 1.3 + i * 1.3, 0, mz + s * 1.15);
        ch.rotation.y = s > 0 ? Math.PI : 0;
      }
    this.add(box(0.36, 0.02, 0.25, M.metal, 0.01), mx - 0.9, 0.8, mz - 0.25);
    // viva-voz da reunião relâmpago
    const spk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 3), M.dark);
    this.add(spk, mx, 0.815, mz);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      this.add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false })), mx + Math.cos(a) * 0.1, 0.845, mz + Math.sin(a) * 0.1);
    }
    const lapScreen = box(0.36, 0.24, 0.015, M.dark, 0.01);
    lapScreen.rotation.x = -0.3;
    this.add(lapScreen, mx - 0.9, 0.92, mz - 0.39);
    for (let i = 0; i < 3; i++) this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), mat(['#ffd23f', '#ff8a3d', '#4da3ff'][i], 0.4)), mx + 0.4 + i * 0.5, 0.84, mz + (i % 2 ? 0.35 : -0.3));
    for (const x of [mx - 1, mx + 1]) {
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.95), M.dark), x, 2.52, mz);
      this.add(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.28, 24, 1, true), mat(PAL.teal, 0.5, 0, { side: THREE.DoubleSide })), x, 1.92, mz);
      this.add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), M.lampGlow), x, 1.8, mz);
      this.add(new THREE.PointLight('#ffcf8a', 3, 4.5, 1.8), x, 1.7, mz);
    }
    // (o pilar de [15, 6] foi tirado: a cabine do elevador chega até z = ELEV_F e a porta dá para esse lugar)
    for (const [cx, cz] of [[5, 6], [5, 17], [15, 17]]) {
      this.add(box(0.8, 3, 0.8, M.wallPlain, 0.05), cx, 1.5, cz);
      this.add(box(0.86, 0.12, 0.86, M.base, 0.02), cx, 0.06, cz);
      this.add(box(0.84, 0.06, 0.84, mat(PAL.teal, 0.6), 0.01), cx, 1.08, cz);
      this.col(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4, true);
    }
  }

  // ------------------------------------------------------------------ cozinha (fica na descompressão)
  private buildKitchen() {
    this.add(box(7.6, 0.9, 0.7, mat('#fff6e6', 0.55), 0.04), 5.8, 0.45, 22.55);
    this.add(box(7.7, 0.06, 0.78, mat('#3b4258', 0.3), 0.02), 5.8, 0.93, 22.55);
    for (let i = 0; i < 6; i++) this.add(box(1.15, 0.7, 0.02, mat(i % 2 ? '#ffb4a2' : '#9be3c4', 0.6), 0.02), 2.65 + i * 1.26, 0.45, 22.19);
    this.col(2.0, 22.2, 9.6, 22.9);
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
    this.add(cm, 4.0, 0.96, 22.55);
    const sign = makeSign({ text: 'CAFÉ', sub: 'combustível corporativo', icon: 'coffee', accent: '#b5562b', theme: 'dark', w: 0.74, h: 0.22 });
    this.add(sign, 4.0, 1.85, 22.4);
    for (let i = 0; i < 3; i++) this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 14), mat(['#ffd23f', '#ff8a3d', '#4da3ff'][i], 0.4)), 5.0 + i * 0.22, 1.05, 22.7);
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.white), 8.0, 1.16, 22.6);
    for (let i = 0; i < 5; i++) this.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(['#ff6b6b', '#ffd23f', '#7bd17a'][i % 3], 0.5)), 7.9 + (i % 3) * 0.08, 1.06 + Math.floor(i / 3) * 0.07, 22.55 + (i % 2) * 0.08);
    // geladeira encostada no canto (parede oeste + fachada sul), porta virada para o leste
    const fridgeMat = mat('#dff3ff', 0.3, 0.1);
    this.add(box(0.72, 1.9, 0.8, fridgeMat, 0.08), 0.47, 0.95, 23.48);
    this.add(box(0.02, 0.012, 0.76, mat('#b9cfdf', 0.4), 0), 0.84, 1.32, 23.48);
    for (const [y, h] of [[1.0, 0.4], [1.55, 0.22]] as const) this.add(box(0.03, h, 0.03, M.metal, 0), 0.86, y, 23.16);
    for (let i = 0; i < 4; i++) {
      const mg = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), mat(['#ff6b6b', '#ffd23f', '#4da3ff', '#3ddc97'][i], 0.6, 0, { side: THREE.DoubleSide }));
      mg.rotation.y = Math.PI / 2;
      mg.rotation.z = (i - 1.5) * 0.2;
      this.add(mg, 0.835, 1.15 + (i % 2) * 0.16, 23.3 + i * 0.12);
    }
    this.col(0.1, 23.08, 0.83, 23.9, true);
    // pizza em cima do balcão (sem mesa nem banquetas)
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
    this.add(this.pizzaGroup, 7.6, 0.92, 22.55);
    // disjuntor (parede oeste, perto da cozinha)
    const brk = box(0.12, 0.55, 0.4, mat('#9aa6b6', 0.5, 0.3), 0.02);
    this.add(brk, 0.16, 1.5, 22.4);
    this.breakerLight = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    this.add(this.breakerLight, 0.24, 1.68, 22.4);
    const bs = makeSign({ text: 'DISJUNTOR', icon: 'bolt', accent: '#1b2233', theme: 'yellow', w: 0.42, h: 0.12, glow: 0.2 });
    bs.rotation.y = Math.PI / 2;
    this.add(bs, 0.12, 1.1, 22.4);
    // bebedouro
    const wc = new THREE.Group();
    const wcb = box(0.4, 1.0, 0.4, M.white, 0.05);
    wcb.position.y = 0.5;
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.45, 16), new THREE.MeshStandardMaterial({ color: '#7cc8ff', roughness: 0.1, transparent: true, opacity: 0.6 }));
    jug.position.y = 1.25;
    wc.add(wcb, jug);
    this.add(wc, 0.4, 0, 21.2);
    this.col(0.2, 21.0, 0.6, 21.4);
  }

  /** Impressora e mesa do carimbo no salão, de costas para a meia-parede da descompressão. */
  private buildPrinter() {
    const [px, pz, sx] = [7.6, 19.55, 9.8];
    this.add(box(1.2, 0.75, 0.7, M.white, 0.03), px, 0.375, pz);
    this.add(box(0.9, 0.45, 0.6, mat('#e8ecf1', 0.4), 0.06), px, 0.98, pz);
    this.add(box(0.92, 0.05, 0.62, M.dark, 0.02), px, 1.22, pz);
    this.add(box(0.5, 0.02, 0.35, M.white, 0), px, 1.0, pz - 0.4);
    this.printerLight = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    this.add(this.printerLight, px + 0.35, 1.12, pz - 0.3);
    this.col(px - 0.7, pz - 0.35, px + 0.7, pz + 0.35);
    this.add(box(1.0, 0.75, 0.6, M.wood, 0.03), sx, 0.375, pz + 0.05);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.15, 12), M.red), sx, 0.83, pz - 0.05);
    this.col(sx - 0.5, pz - 0.25, sx + 0.5, pz + 0.35);
    // placa num suporte sobre o tampo da meia-parede
    this.add(box(0.03, 0.3, 0.03, M.metal, 0.005), px, 1.31, 20);
    const s = makeSign({ text: 'IMPRESSORA', sub: 'trava às terças (e às vezes nos outros dias)', icon: 'printer', accent: '#3aa6a0', theme: 'dark', w: 0.92, h: 0.26 });
    s.rotation.y = Math.PI;
    this.add(s, px, 1.55, 19.97);
    const s2 = s.clone();
    s2.rotation.y = 0;
    this.add(s2, px, 1.55, 20.03);
  }

  // ------------------------------------------------------------------ sala de descompressão
  private buildLounge() {
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ map: rugTex('#ff8a3d', '#ffd23f', '#fff6e6'), roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    this.add(rug, 15.5, 0.008, 22.1);
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
    this.add(sofa, 15.5, 0, 23.1);
    this.col(14.0, 22.55, 17.0, 23.75);
    this.couch = { seat: W(15.9, 22.85), yaw: Math.PI, stand: W(15.9, 21.6) };
    // TV de parede e aparador (em frente ao sofá)
    this.add(box(2.0, 0.5, 0.45, M.woodDark, 0.04), 15.5, 0.25, 20.55);
    this.col(14.5, 20.3, 16.5, 20.8, true);
    const tvc = document.createElement('canvas');
    tvc.width = 512;
    tvc.height = 288;
    const tvt = liveTexture(tvc);
    this.tv = { canvas: tvc, ctx: tvc.getContext('2d')!, tex: tvt };
    this.add(box(1.7, 0.98, 0.08, M.dark, 0.03), 15.5, 1.05, 20.6);
    this.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), decodeLive(new THREE.MeshBasicMaterial({ map: tvt, toneMapped: false, color: new THREE.Color(0.8, 0.8, 0.8) }))), 15.5, 1.05, 20.65);
    // bolas da descompressão
    for (const [x, z, c] of [[11.4, 23.15, PAL.mint], [18.3, 22.7, PAL.yellow]] as const) {
      const bb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), mat(c, 0.9));
      bb.scale.set(1, 0.62, 1);
      bb.castShadow = true;
      bb.receiveShadow = true;
      this.add(bb, x, 0.28, z);
      this.col(x - 0.35, z - 0.35, x + 0.35, z + 0.35);
    }
    // máquina de lanches: de costas para a parede leste, no canto com a meia-parede, frente para o oeste
    this.add(box(0.8, 1.95, 1.1, mat('#e5484d', 0.5), 0.06), 19.5, 0.975, 20.7);
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
    vfront.rotation.y = -Math.PI / 2;
    this.add(vfront, 19.09, 1.2, 20.7);
    this.col(19.1, 20.15, 19.9, 21.25, true);
    // cadeiras de corrida ficam no salão
    for (const [x, z, yaw] of [[17.6, 14.4, 0.4], [18.6, 15.6, -0.3]] as const) {
      const ch = this.makeChair(x < 18 ? '#ff4d6d' : '#3ddc97');
      this.add(ch, x, 0, z);
      ch.rotation.y = yaw;
      this.raceChairs.push({ group: ch, home: W(x, z), homeYaw: yaw });
    }
    // luz neon "chill zone" na parede leste
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: neonTex('chill zone', '#ff6bd5'), transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    neon.rotation.y = -Math.PI / 2;
    this.add(neon, 19.88, 2.45, 22.6);
    this.add(new THREE.PointLight('#ff6bd5', 1.5, 4, 2), 19.2, 2.3, 22.6);
    // plantas e barreiras
    this.add(this.makePlant(1.6, 1), 1.4, 0, 23.7);
    this.add(this.makePlant(1.5, 1), 19.4, 0, 23.6);
    this.col(1.2, 23.5, 1.6, 23.9);
    this.col(19.1, 23.3, 19.7, 23.9);
  }

  private buildDecor() {
    for (const [x, z, k] of [[3.6, 5.4, 0], [17.45, 5.5, 1]] as const) {
      this.add(this.makePlant(1, k), x, 0, z);
      this.col(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
    }
    const posters: [string, string, string, (g: CanvasRenderingContext2D) => void, number, number, number, number][] = [
      ['SINERGIA', 'juntos enrolamos mais', '#4da3ff', (g) => { ballDoodle(g, 70, 110, 45, '#ff8a3d'); ballDoodle(g, 158, 110, 45, '#A8D5A2'); }, 6.3, 1.7, 4.12, 0],
      ['AGUENTA FIRME', 'só faltam 4 dias', '#ffd23f', (g) => { g.strokeStyle = '#5a3a1a'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, 40); g.lineTo(208, 40); g.stroke(); ballDoodle(g, 114, 120, 55, '#ff6b9a'); }, 0.12, 1.75, 23.6, Math.PI / 2],
      ['FOCO', 'na planilha (rs)', '#ff8a3d', (g) => { g.fillStyle = '#E8F2E8'; g.fillRect(30, 40, 168, 120); g.strokeStyle = '#3E9B5B'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(30, 60 + i * 20); g.lineTo(198, 60 + i * 20); g.stroke(); } }, 18.9, 1.7, 23.88, Math.PI],
    ];
    for (const [t, s, bg, d, x, y, z, rot] of posters) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.13), new THREE.MeshStandardMaterial({ map: posterTex(t, s, bg, d), roughness: 0.6 }));
      p.rotation.y = rot;
      this.add(p, x, y, z);
    }
  }

  /** Bagunça de escritório: caixas, cabideiro, pôsteres-piada nos pilares e mural de recados. */
  private buildClutter() {
    const card = mat('#c9a06a', 0.95);
    const tape = mat('#e8d6a8', 0.8);
    for (const [x, z] of [[0.6, 18.6], [19.4, 18.6]]) {
      const stack: [number, number, number, number][] = [[0.62, 0.42, 0.5, 0], [0.5, 0.36, 0.44, 0.42], [0.36, 0.28, 0.32, 0.78]];
      for (const [w, h, d, y] of stack) {
        const b = box(w, h, d, card, 0.01);
        b.rotation.y = (Math.random() - 0.5) * 0.3;
        this.add(b, x, y + h / 2, z);
        this.add(box(w + 0.005, 0.005, 0.08, tape, 0), x, y + h + 0.002, z);
      }
      this.col(x - 0.34, z - 0.3, x + 0.34, z + 0.3);
    }
    // cabideiro entre a sala do chefe e o elevador
    const wood = M.woodDark;
    const cx = 12.4;
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.8, 10), wood), cx, 0.9, 4.6);
    for (let i = 0; i < 3; i++) {
      const foot = box(0.4, 0.04, 0.05, wood, 0.01);
      foot.rotation.y = (i / 3) * Math.PI;
      this.add(foot, cx, 0.03, 4.6);
    }
    for (let i = 0; i < 4; i++) this.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), wood), cx + Math.cos(i * 1.57) * 0.12, 1.72, 4.6 + Math.sin(i * 1.57) * 0.12);
    const coat = box(0.32, 0.75, 0.14, mat('#c7a27a', 0.9), 0.06);
    coat.rotation.y = 0.4;
    this.add(coat, cx + 0.08, 1.3, 4.66);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), M.dark), cx - 0.12, 0.48, 4.55);
    this.add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 8), mat('#e5484d', 0.6)), cx - 0.12, 0.62, 4.55);
    this.col(cx - 0.2, 4.4, cx + 0.2, 4.8);
    // pôsteres-piada nos pilares
    const jokes: [string, string, string, number, number, number][] = [
      ['SEXTA EXISTE?', 'estudos dizem que sim', '#ff8a3d', 5, 6.41, 0],
      ['PROATIVIDADE', 'fazer antes do chefe pedir', '#9b7bff', 17.11, 5.0, Math.PI / 2],
      ['FOCO NO CAFÉ', 'o resto a gente vê', '#3ddc97', 15, 16.59, Math.PI],
    ];
    for (const [t, s, bg, x, z, rot] of jokes) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), new THREE.MeshStandardMaterial({ map: posterTex(t, s, bg, (g) => ballDoodle(g, 114, 118, 52, '#ffffff')), roughness: 0.6 }));
      p.rotation.y = rot;
      this.add(p, x, 1.68, z);
    }
    // mural de recados (cortiça) no pilar sudoeste
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 288;
    const g = c.getContext('2d')!;
    g.fillStyle = '#b98a55';
    g.fillRect(0, 0, 384, 288);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},30,0.25)`;
      g.fillRect(Math.random() * 384, Math.random() * 288, 2, 2);
    }
    const notes = ['reunião sobre\nreuniões 15h', 'quem pegou\nmeu iogurte??', 'aniver do chefe:\nNÃO CANTAR', 'wi-fi:\ntrabalhe123'];
    notes.forEach((n, i) => {
      const x = 22 + (i % 2) * 180;
      const y = 22 + Math.floor(i / 2) * 135;
      g.save();
      g.translate(x + 75, y + 55);
      g.rotate((Math.random() - 0.5) * 0.2);
      g.fillStyle = ['#fff07a', '#ffc2d1', '#b7e2ff', '#c4f3b4'][i];
      g.fillRect(-75, -55, 150, 110);
      g.fillStyle = '#e5484d';
      g.beginPath();
      g.arc(0, -46, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b2233';
      g.font = '600 19px Fredoka, sans-serif';
      g.textAlign = 'center';
      n.split('\n').forEach((l, k) => g.fillText(l, 0, -8 + k * 24));
      g.restore();
    });
    const ct = new THREE.CanvasTexture(c);
    ct.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.585), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.9 }));
    board.rotation.y = Math.PI;
    this.add(board, 5, 1.7, 16.585);
    this.add(box(0.82, 0.625, 0.02, M.woodDark, 0.01), 5, 1.7, 16.595);
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

  /** Bandejinha de rascunhos ao lado do teclado, com as bolinhas já amassadas. */
  buildPile(d: Desk) {
    const g = new THREE.Group();
    const trayMat = mat('#c98f55', 0.8);
    const base = box(0.3, 0.02, 0.34, trayMat, 0.008);
    base.position.y = 0.01;
    g.add(base);
    for (const [w, dd, x, z] of [[0.3, 0.02, 0, 0.16], [0.3, 0.02, 0, -0.16], [0.02, 0.34, 0.14, 0], [0.02, 0.34, -0.14, 0]] as const) {
      const wall = box(w, 0.07, dd, trayMat, 0.006);
      wall.position.set(x, 0.035, z);
      g.add(wall);
    }
    const label = makeSign({ text: 'RASCUNHO', theme: 'light', w: 0.2, h: 0.05, glow: 0.1 });
    label.position.set(-0.151, 0.04, 0);
    label.rotation.y = -Math.PI / 2;
    g.add(label);
    const balls: THREE.Mesh[] = [];
    const slots = [[-0.06, -0.07], [0.06, 0.07], [0.06, -0.08], [-0.06, 0.08], [0, 0]];
    for (let i = 0; i < 16; i++) {
      const layer = Math.floor(i / 5);
      const [x, z] = slots[i % 5];
      const b = this.paperProto.clone();
      b.position.set(x * (1 - layer * 0.25), 0.07 + layer * 0.075, z * (1 - layer * 0.25));
      b.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      b.scale.setScalar(0.95 + Math.random() * 0.15);
      g.add(b);
      balls.push(b);
    }
    g.position.set(0.74, 0.78, 0.58);
    d.frame.add(g);
    g.userData.dynamic = true;
    d.pile = { group: g, balls, count: 0, pos: g.getWorldPosition(new THREE.Vector3()).setY(0.85) };
  }

  /** Itens da lojinha na sua mesa: planta, retrovisor e post-it (todos escondidos até comprar/usar). */
  private buildExtras(d: Desk) {
    const plant = this.makePlant(0.75, 1);
    this.add(plant, 0, 0.78, 0);
    plant.visible = false;
    plant.userData.dynamic = true;
    const mg = new THREE.Group();
    const frame = box(0.05, 0.17, 0.27, M.dark, 0.02);
    const glass = new Reflector(new THREE.PlaneGeometry(0.24, 0.14), { textureWidth: 320, textureHeight: 192, color: 0xd8dde2, clipBias: 0.003 });
    const arm = box(0.03, 0.12, 0.03, M.dark, 0.01);
    arm.position.set(0, -0.12, 0.08);
    mg.add(frame, glass, arm);
    this.add(mg, 0, MON_Y + MON_H / 2 + 0.16, 0);
    mg.visible = false;
    mg.userData.dynamic = true;
    const pt = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: signTex('EM REUNIÃO', '#ffe24a', '#1b2233', 256, 256, '"Darumadrop One"'), side: THREE.DoubleSide }));
    pt.rotation.z = 0.12;
    this.add(pt, 0, MON_Y + MON_H / 2 + 0.2, 0);
    pt.visible = false;
    pt.userData.dynamic = true;
    this.extras = { plant, mirror: mg, postit: pt };
    this.placeExtras(d);
  }

  /** Leva os itens da lojinha para a mesa de quem joga (no multi o convidado não senta na mesa 0). */
  placeExtras(d: Desk) {
    const { plant, mirror, postit } = this.extras;
    // no referencial da mesa (monitor em +x)
    const glass = mirror.children[1];
    d.frame.add(plant, mirror, postit);
    // a planta vai para o lado oposto ao da porta do chefe (não tapa a vista dela)
    d.frame.updateMatrixWorld(true);
    const far = -Math.sign(d.frame.worldToLocal(this.P.bossDoor.clone()).z) || 1;
    plant.position.set(0.2, plant.position.y, far * 0.85);
    glass.rotation.y = Math.PI / 2;
    glass.position.x = 0.028;
    mirror.rotation.set(0, -0.4, 0.12);
    mirror.position.set(MON_X + 0.075, mirror.position.y, -0.45);
    postit.rotation.y = Math.PI / 2;
    postit.position.set(MON_X + 0.045, postit.position.y, 0.28);
  }

  /** O monitor de quem joga tem a resolução do BossOS (1024×640); os outros, a das telas dos bots. */
  setScreenRes(d: Desk, big: boolean) {
    const w = big ? 1024 : 256;
    if (d.canvas.width === w) return;
    d.canvas.width = w;
    d.canvas.height = big ? 640 : 160;
    // a textura na GPU tem tamanho fixo: descartar faz o three recriar com o novo
    d.tex.dispose();
    d.tex.needsUpdate = true;
  }

  setPile(d: Desk, n: number) {
    if (!d.pile) return;
    d.pile.count = n;
    d.pile.balls.forEach((b, i) => (b.visible = i < n));
  }

  // ------------------------------------------------------------------ atualização
  setWeather(w: Weather) {
    this.weather = w;
    this.outside.setWeather(w);
  }

  /** Sol, céu, feixes e lâmpadas acompanham a hora do dia e o clima. Devolve o "look" (a grade usa). */
  private updateDaylight(dayT01: number) {
    const look = dayLook(dayT01, this.weather);
    const on = this.lightLevel;
    const f = this.outside.flash;
    const k = 0.13 + 0.87 * on;
    this.sun.color.copy(look.sunColor);
    if (f) this.sun.color.set('#dfe8ff');
    // no hall (térreo) o sol não tem sombra (fica fora da caixa de sombras): quase apagado, quem ilumina é o teto
    const m = this.lobbyMix;
    this.sun.intensity = (look.sunI * k + f * 7) * (1 - 0.92 * m);
    this.sun.position.copy(look.sunPos);
    this.hemi.color.copy(look.hemiSky);
    this.hemi.intensity = (look.hemiI * k + f * 0.6) * (1 + 0.25 * m);
    this.skyMat.color.copy(look.skyTint).multiplyScalar(1 + f * 1.6);
    this.city.update(look);
    for (const l of this.hallLights) l.intensity = 7 * on * (1 + 0.35 * look.lampK);
    (this.stringBulbs.material as THREE.MeshBasicMaterial).color.setScalar(0.55 + 0.75 * look.lampK);
    // feixes de luz: seguem o sol e só existem com ele vindo do sul
    const dir = new THREE.Vector3().subVectors(this.sun.target.position, this.sun.position).normalize();
    const fromSouth = THREE.MathUtils.smoothstep(look.sunPos.z + MAP.oz, 24, 30);
    const shaftUp = new THREE.Vector3(0, 1, 0);
    const mids = [4.5, 11, 16.5];
    this.shafts.forEach((m, i) => {
      const sm = m.material as THREE.ShaderMaterial;
      sm.uniforms.uStrength.value = (0.05 + 0.11 * on) * look.shaftK * fromSouth;
      sm.uniforms.uColor.value.copy(look.shaftColor);
      const start = W(mids[i], MAP.d, 1.65);
      m.position.copy(start).addScaledVector(dir, 2.2);
      m.quaternion.setFromUnitVectors(shaftUp, dir.clone().negate());
    });
    return look;
  }

  /** Decoração da mesa com a cara de quem senta nela (refeita só se mudar). */
  setDeskTheme(d: Desk, variant: string, color: string) {
    const key = `${variant}|${color}`;
    const cur = this.deskDecor.get(d);
    if (cur?.key === key) return;
    cur?.g.removeFromParent();
    const g = placeOnDesk(mergeGroup(deskTheme(variant, color)), d);
    d.frame.add(g);
    this.deskDecor.set(d, { key, g });
  }

  update(dt: number, dayT01: number, time: number) {
    this.frame++;
    // no hall já começa no térreo (sem fade); saindo da cabine de cima, a luz do escritório volta aos poucos
    this.lobbyMix = this.lobbyView ? 1 : this.lobbyMix + ((this.lobbyLight ? 1 : 0) - this.lobbyMix) * Math.min(1, dt * 2);
    this.lastLook = this.updateDaylight(dayT01);
    const coo = this.outside.update(dt, time, this.lastLook.skyTint);
    this.cooAt = coo;
    const sr = this.siren;
    sr.on += ((this.doorOpen > 0 ? 1 : 0) - sr.on) * Math.min(1, dt * 6);
    sr.light.intensity = sr.on * 60;
    (sr.dome.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + sr.on * (2.5 + Math.sin(time * 18) * 1.2);
    sr.light.target.position.set(Math.cos(time * 7) * 4, -2, Math.sin(time * 7) * 4);
    this.door.rotation.y += (this.doorOpen * 1.75 - this.door.rotation.y) * Math.min(1, dt * 7);
    // portas do elevador: correm para os lados (com uma folguinha no fim)
    this.elevDoorK += (this.elevatorOpen - this.elevDoorK) * Math.min(1, dt * 3.2);
    const off = this.elevDoorK * 0.78;
    this.elevDoors[0].position.x = W(14.6 - off, 0).x;
    this.elevDoors[1].position.x = W(15.4 + off, 0).x;
    const lb = this.lobby;
    lb.k += (lb.open - lb.k) * Math.min(1, dt * 3.2);
    if (lb.doors.length) {
      lb.doors[0].position.x = W(14.6 - lb.k * 0.78, 0).x;
      lb.doors[1].position.x = W(15.4 + lb.k * 0.78, 0).x;
    }
    // cadeiras giram até o alvo (sentar/levantar/espiar)
    const kc = Math.min(1, dt * 12);
    for (const d of this.desks) {
      let delta = d.chairYaw - d.chair.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(delta) > 1e-4) d.chair.rotation.y += delta * kc;
    }
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

  /** Bolinha voando: acima das mesas/divisórias (≈1,15 m) só bate no que é alto (paredes, colunas). */
  collideBall(p: THREE.Vector3, r: number) {
    this.collide(p, r, p.y < 1.15 ? this.colliders : this.tallColliders);
  }

  collide(p: THREE.Vector3, r: number, list: AABB[] = this.colliders) {
    if (list === this.colliders && this.elevDoorK < 0.75) this.collideBox(p, r, this.elevDoorBox);
    if (list === this.colliders && this.lobby.k < 0.75) this.collideBox(p, r, this.lobbyDoorBox);
    for (const b of list) this.collideBox(p, r, b);
  }

  private collideBox(p: THREE.Vector3, r: number, b: AABB) {
    {
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

  /** O ponto (mundo) está dentro da sala do chefe (planta x 7–13, z 0–3,5)? */
  inBossRoom(p: THREE.Vector3) {
    const a = W(7, 0);
    // a soleira (último meio metro antes da parede z = 4) não conta: quem passa rente à porta, ou é empurrado
    // pelo chefe saindo, não está "dentro da sala" (os robôs eram demitidos ali)
    const b = W(13, 3.5);
    return p.x > a.x && p.x < b.x && p.z > a.z && p.z < b.z;
  }

  /** Quanto as portas de cada cabine estão abertas (0–1). */
  get elevDoorOpen() {
    return this.elevDoorK;
  }

  /**
   * O espelho do fundo da cabine aparece para quem está dentro ou olhando pela porta aberta (até ~9 m na frente dela);
   * longe dali não renderiza, porque o reflexo redesenha a cena inteira.
   */
  cabinMirrorVisible(mirror: THREE.Object3D, eye: THREE.Vector3, dz: number, doorK: number) {
    const inside = eye.z < W(0, dz + ELEV_F).z;
    mirror.userData.every = inside ? 1 : 4;
    if (inside) return eye.z > W(0, dz + 0.1).z && eye.x > W(13.1, 0).x && eye.x < W(16.9, 0).x;
    return doorK > 0.02 && eye.z < W(0, dz + ELEV_F + 9).z && eye.x > W(9, 0).x && eye.x < W(21, 0).x;
  }

  /** O ponto (mundo) está dentro da cabine? */
  inElevator(p: THREE.Vector3) {
    const b = this.elevBox;
    return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
  }

  get tallColliders(): AABB[] {
    return (this._tall ??= this.colliders.filter((c) => c.tall));
  }
  private _tall: AABB[] | null = null;

  lineOfSight(a: THREE.Vector3, b: THREE.Vector3) {
    const steps = Math.ceil(a.distanceTo(b) / 0.25);
    // a porta da sala do chefe fechada tapa a vista (sem isso, ele "via" o assalto pela porta fechada)
    const door = this.doorOpen < 0.5 ? this.bossDoorSight : null;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const c of this.tallColliders) if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
      if (door && x > door.minX && x < door.maxX && z > door.minZ && z < door.maxZ) return false;
    }
    return true;
  }
}
