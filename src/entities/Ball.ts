import * as THREE from 'three';
import { makeCharacter, type Look } from '../characters/designs';
import type { Character } from '../characters/rig';

export type EyeState = 'normal' | 'alert' | 'clutch' | 'caught' | 'bored' | 'happy' | 'talk';
export type BallKind = 'employee' | 'x9' | 'boss' | 'dono';

export const TIE_COLORS = ['#2F5FA8', '#3E9B5B', '#E0832B', '#D45A8B', '#E6C43A', '#7A5BC0'];

/** Tamanho de jogo (alcance, empurrão) — o mesmo das bolas antigas, para não mexer no balanceamento. */
interface KindSpec {
  scale: number;
}
const KINDS: Record<BallKind, KindSpec> = {
  employee: { scale: 1 },
  x9: { scale: 0.8 },
  boss: { scale: 1.9 },
  dono: { scale: 2.2 },
};

/** Quem não é escolhido pelo jogador tem Telinha fixa: X9 com câmera, chefe de tela larga, dono de cartola. */
export const KIND_LOOK: Record<Exclude<BallKind, 'employee'>, Look> = {
  x9: { species: 'telinha', color: '#9be36a', tie: '#ffd23f', variant: 'x9' },
  boss: { species: 'telinha', color: '#6e1a30', tie: '#d4283c', variant: 'chefe' },
  dono: { species: 'telinha', color: '#24242e', tie: '#D4AF37', variant: 'dono' },
};

/** Alturas de "flutuação" que o jogo usa (herdadas das bolas): em pé e sentado na cadeira. */
const STAND = 0.78;
const SEAT = 0.94;
/** Altura do assento das cadeiras do escritório. */
const SEAT_Y = 0.53;
/** Altura do pivô para deitar (quadril). */
const PIVOT = 0.45;
/** Os bichos do lab são baixinhos (olhos a ~0,8 m, quase no tampo das mesas a 0,78 m): no escritório crescem 40%. */
const GAME_SIZE = 1.4;

const _head = new THREE.Vector3();
const GHOST_OPACITY = 0.42;
/** A luz do escritório (sol + luminárias) é bem mais forte que a do lab: escurece as cores para o toon não estourar. */
const OFFICE_TONE = 0.6;

function toneDown(ch: Character, k: number) {
  const seen = new Set<THREE.Material>();
  ch.root.traverse((o) => {
    if (o.userData.outline) return;
    const mats = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (seen.has(m) || !(m instanceof THREE.MeshToonMaterial)) continue;
      seen.add(m);
      m.color.multiplyScalar(k);
      for (const c of (m.userData.bands as THREE.Color[] | undefined) ?? []) c.multiplyScalar(k);
    }
  });
}

/**
 * Corpo de um funcionário/chefe no jogo. Mantém a API das antigas bolas com olhos (setEye, hoverHeight,
 * lying, setGhost...) e por baixo usa a Telinha (monitor CRT) com rosto 2D animado.
 */
export class Ball {
  readonly root = new THREE.Group();
  /** Altura de referência da "bola" (a câmera em primeira pessoa usa); sem malha. */
  readonly hover = new THREE.Group();
  /** Inclinação ao andar e ao deitar. */
  readonly tilt = new THREE.Group();
  private readonly liftG = new THREE.Group();
  /** Preso no centro da cabeça: lanterna do chefe, fones, coroa. */
  readonly squashG = new THREE.Group();
  readonly accessories = new THREE.Group();
  readonly carryAnchor = new THREE.Group();
  readonly heatRing: THREE.Mesh;
  readonly spec: KindSpec;
  ch!: Character;
  private look: Look;

  eye: EyeState = 'normal';
  private standHeadY = 1.2;
  hoverHeight = STAND;
  private curHover = STAND;
  /** Pula a subida/descida suave e já fica na altura pedida (teleporte para outro piso). */
  snapHover() {
    this.curHover = this.hoverHeight;
  }
  velocity = new THREE.Vector3();
  yaw = 0;
  heat = 0;
  /** Deitado (soneca no sofá). */
  lying = 0;
  private lyingK = 0;
  private ghost = false;
  private sleeping = false;
  private lookTarget: THREE.Vector3 | null = null;
  private t = Math.random() * 10;
  private stepPhase = 0;
  private headphones: THREE.Group | null = null;
  private prop: THREE.Object3D | null = null;
  private crown: THREE.Group | null = null;
  private saved = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();

  constructor(readonly kind: BallKind, look?: Look) {
    this.spec = KINDS[kind];
    this.look = kind === 'employee' ? look! : KIND_LOOK[kind];
    this.root.add(this.hover, this.tilt);
    this.tilt.position.y = PIVOT;
    this.tilt.add(this.liftG);
    this.squashG.add(this.accessories, this.carryAnchor);
    this.carryAnchor.position.set(0.3, -0.3, 0.3);
    this.heatRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.018, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false, transparent: true, opacity: 0 }),
    );
    this.heatRing.rotation.x = Math.PI / 2;
    this.build();
  }

  private build() {
    const ch = makeCharacter(this.look);
    ch.root.scale.multiplyScalar(GAME_SIZE);
    toneDown(ch, OFFICE_TONE);
    // no jogo há textos flutuando; os balões ficam só para dormir, flagra e alegria
    ch.emotes = ['sleep', 'caught', 'happy'];
    if (this.ch) {
      ch.setExpr(this.ch.expr);
      this.liftG.remove(this.ch.root);
      dispose(this.ch);
    }
    this.ch = ch;
    this.liftG.add(ch.root);
    ch.headAnchor.add(this.squashG);
    ch.root.add(this.heatRing);
    this.heatRing.position.y = ch.butt + 0.18;
    this.heatRing.scale.setScalar(this.look.species === 'telinha' ? 0.62 : 0.72);
    this.accessories.scale.setScalar((ch.headR / 0.42) * 1.05);
    this.saved.clear();
    if (this.ghost) this.setGhost(true);
    // altura da cabeça em pé e parado (medida sem animação): base da câmera em 1ª pessoa
    this.root.updateWorldMatrix(true, true);
    this.standHeadY = this.headWorld(_head).y - this.root.position.y - PIVOT - this.liftG.position.y;
  }

  /** Altura dos olhos em pé, sem o quique do passo nem a mola da cabeça (a câmera não treme); acompanha pulo e voo. */
  eyeY() {
    return this.root.position.y + this.standHeadY + (this.curHover - STAND) * this.spec.scale;
  }

  /** Troca espécie/cores (escolha do jogador). */
  setLook(look: Look) {
    this.look = { ...look };
    this.build();
  }

  differs(look: Look) {
    const a = this.look;
    return a.species !== look.species || a.color !== look.color || a.tie !== look.tie || a.variant !== look.variant;
  }

  setGhost(on: boolean) {
    this.ghost = on;
    this.ch.root.traverse((o) => {
      if (o.userData.outline) {
        o.visible = !on;
        return;
      }
      const mats = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (on) {
          if (!this.saved.has(m)) this.saved.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
          m.transparent = true;
          m.opacity = this.saved.get(m)!.opacity * GHOST_OPACITY;
          m.depthWrite = false;
        } else {
          const s = this.saved.get(m);
          if (!s) continue;
          m.transparent = s.transparent;
          m.opacity = s.opacity;
          m.depthWrite = s.depthWrite;
        }
        m.needsUpdate = true;
      }
    });
    if (!on) this.saved.clear();
  }

  setEye(s: EyeState) {
    this.eye = s;
    if (!this.sleeping) this.ch.setExpr(s);
  }

  impulse(a: number) {
    this.ch.impulse(a);
  }

  setHeadphones(on: boolean) {
    if (on && !this.headphones) {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: '#222630', roughness: 0.4 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 32, Math.PI), m);
      band.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#ff4d6d', roughness: 0.5 }));
        c.rotation.z = Math.PI / 2;
        c.position.x = side * 0.44;
        g.add(c);
      }
      g.add(band);
      this.headphones = g;
      this.accessories.add(g);
    }
    if (this.headphones) this.headphones.visible = on;
  }

  /** Algo na mão (pausa do X9: caneca de café ou rolo de papel higiênico). */
  setProp(kind: 'mug' | 'roll' | null) {
    this.prop?.removeFromParent();
    this.prop = null;
    if (!kind) return;
    const g = new THREE.Group();
    if (kind === 'mug') {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.17, 18), new THREE.MeshStandardMaterial({ color: '#f7f4ee', roughness: 0.4 }));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 16), cup.material);
      handle.position.x = 0.1;
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.08, 18), new THREE.MeshStandardMaterial({ color: '#4a2a14', roughness: 0.2 }));
      coffee.rotation.x = -Math.PI / 2;
      coffee.position.y = 0.075;
      const logo = new THREE.Mesh(new THREE.CylinderGeometry(0.091, 0.081, 0.05, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#e5484d', roughness: 0.5 }));
      g.add(cup, handle, coffee, logo);
    } else {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.13, 20), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }));
      roll.rotation.z = Math.PI / 2;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.135, 12), new THREE.MeshStandardMaterial({ color: '#b58a5a', roughness: 0.9 }));
      hole.rotation.z = Math.PI / 2;
      g.add(roll, hole);
    }
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.carryAnchor.add(g);
    this.prop = g;
  }

  setCrown(on: boolean) {
    if (on && !this.crown) {
      const g = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: '#FFD23F', metalness: 0.8, roughness: 0.25, emissive: '#8a6a00', emissiveIntensity: 0.4 });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20, 1, true), gold));
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), gold);
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16);
        g.add(sp);
      }
      g.position.y = 0.45;
      g.rotation.z = -0.15;
      this.crown = g;
      this.accessories.add(g);
    }
    if (this.crown) this.crown.visible = on;
  }

  /** Soneca: olhos fechados e balão "zZ". */
  setSleeping(on: boolean) {
    this.sleeping = on;
    this.ch.setExpr(on ? 'sleep' : this.eye);
  }

  lookAt(world: THREE.Vector3) {
    (this.lookTarget ??= new THREE.Vector3()).copy(world);
  }
  lookForward() {
    this.lookTarget = null;
  }

  setPos(x: number, z: number) {
    this.root.position.set(x, 0, z);
  }

  get pos() {
    return this.root.position;
  }

  headWorld(out = new THREE.Vector3()) {
    return this.squashG.getWorldPosition(out);
  }

  update(dt: number) {
    this.t += dt;
    const ch = this.ch;
    this.curHover += (this.hoverHeight - this.curHover) * Math.min(1, dt * 8);
    const sp = this.velocity.length();
    // referência da câmera: o mesmo quique das bolas
    this.stepPhase += dt * (4 + sp * 3.2);
    const hop = sp > 0.4 ? Math.abs(Math.sin(this.stepPhase)) * Math.min(0.12, sp * 0.03) : 0;
    this.hover.position.y = this.curHover + Math.sin(this.t * 2.2) * (this.ghost ? 0.12 : 0.04) + hop;
    this.root.rotation.y = this.yaw;

    const sitting = !this.ghost && this.lying < 0.5 && Math.abs(this.hoverHeight - SEAT) < 0.02;
    let lift = sitting ? SEAT_Y - ch.butt * ch.root.scale.y : (this.curHover - STAND) * this.spec.scale;
    if (this.ghost) lift += Math.sin(this.t * 2.2) * 0.1;
    this.liftG.position.y = lift - PIVOT;

    const v = this.velocity;
    const fwd = Math.sin(this.yaw) * v.x + Math.cos(this.yaw) * v.z;
    const side = Math.cos(this.yaw) * v.x - Math.sin(this.yaw) * v.z;
    this.lyingK += (this.lying - this.lyingK) * Math.min(1, dt * 6);
    this.tilt.rotation.x += (fwd * 0.03 - this.lyingK * 1.45 - this.tilt.rotation.x) * Math.min(1, dt * 10);
    this.tilt.rotation.z += (-side * 0.03 - this.tilt.rotation.z) * Math.min(1, dt * 10);

    ch.action = sitting ? 'sit' : sp > 0.4 && this.lying < 0.5 ? 'walk' : 'idle';
    ch.walkRate = THREE.MathUtils.clamp(sp / 3.2, 0.7, 1.5);
    if (this.lookTarget) ch.lookAt.copy(this.lookTarget);
    else ch.lookAt.set(this.root.position.x + Math.sin(this.yaw) * 4, 1.1, this.root.position.z + Math.cos(this.yaw) * 4);
    ch.update(dt);

    const hm = this.heatRing.material as THREE.MeshBasicMaterial;
    const hot = this.heat > 60 ? 0.5 + 0.5 * Math.sin(this.t * 10) : 0;
    hm.opacity += (hot - hm.opacity) * Math.min(1, dt * 8);
    this.heatRing.rotation.z += dt * 2;
  }
}

function dispose(ch: Character) {
  ch.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !o.userData.outline) m.geometry.dispose();
  });
  for (const f of ch.faces) f.tex.dispose();
}
