import * as THREE from 'three';

export type EyeState = 'normal' | 'alert' | 'clutch' | 'caught' | 'bored' | 'happy';
export type BallKind = 'employee' | 'x9' | 'boss' | 'dono';

const OUTLINE = new THREE.MeshBasicMaterial({ color: '#141824', side: THREE.BackSide });
const VISOR = new THREE.MeshStandardMaterial({ color: '#0B0B0E', roughness: 0.25, metalness: 0.1 });
const PUPIL = new THREE.MeshBasicMaterial({ color: '#111111' });

let shadowTex: THREE.Texture | null = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(10,14,30,0.55)');
  gr.addColorStop(0.6, 'rgba(10,14,30,0.25)');
  gr.addColorStop(1, 'rgba(10,14,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

interface KindSpec {
  color: string;
  scale: number;
  tie: string | null;
  eyeSize: number;
  eyeGap: number;
  emissiveEyes?: string;
  brows?: boolean;
}

const KINDS: Record<BallKind, KindSpec> = {
  employee: { color: '#7F93A6', scale: 1, tie: '#2F5FA8', eyeSize: 0.105, eyeGap: 0.15 },
  x9: { color: '#A8D5A2', scale: 0.8, tie: '#E6C43A', eyeSize: 0.12, eyeGap: 0.15 },
  boss: { color: '#7a2238', scale: 1.9, tie: '#111111', eyeSize: 0.085, eyeGap: 0.11, brows: true },
  dono: { color: '#1A1A1F', scale: 2.2, tie: '#D4AF37', eyeSize: 0.07, eyeGap: 0.1, emissiveEyes: '#FFE9A8', brows: true },
};

export const TIE_COLORS = ['#2F5FA8', '#3E9B5B', '#E0832B', '#D45A8B', '#E6C43A', '#7A5BC0'];

/** A bola com olhos. Toda a atuação é feita por olhos + squash/stretch. */
export class Ball {
  readonly root = new THREE.Group();
  readonly hover = new THREE.Group();
  readonly tilt = new THREE.Group();
  readonly squashG = new THREE.Group();
  readonly R = 0.42;
  readonly spec: KindSpec;
  readonly bodyMat: THREE.MeshStandardMaterial;
  private tieMat: THREE.MeshStandardMaterial | null = null;
  private eyes: THREE.Group[] = [];
  private pupils: THREE.Mesh[] = [];
  private xs: THREE.Group[] = [];
  private lids: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private shadow: THREE.Mesh;
  private propeller: THREE.Group | null = null;
  readonly heatRing: THREE.Mesh;
  readonly accessories = new THREE.Group();
  readonly carryAnchor = new THREE.Group();
  private headphones: THREE.Group | null = null;
  private crown: THREE.Group | null = null;

  eye: EyeState = 'normal';
  private eyeScale = 1;
  private blinkT = 2 + Math.random() * 3;
  private blink = 0;
  private sq = 0;
  private sqV = 0;
  private t = Math.random() * 10;
  private lookLocal = new THREE.Vector3(0, 0, 1);
  hoverHeight = 0.78;
  private curHover = 0.78;
  velocity = new THREE.Vector3();
  yaw = 0;
  private ghost = false;
  heat = 0;

  constructor(readonly kind: BallKind, tieColor?: string) {
    this.spec = KINDS[kind];
    const s = this.spec;
    const R = this.R;
    this.root.add(this.hover);
    this.hover.add(this.tilt);
    this.tilt.add(this.squashG);
    this.root.scale.setScalar(s.scale);

    this.bodyMat = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, metalness: 0.05 });
    const bodyGeo = new THREE.SphereGeometry(R, 40, 28);
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.scale.set(1, 0.94, 1);
    const outline = new THREE.Mesh(bodyGeo, OUTLINE);
    outline.scale.set(1.045, 0.94 * 1.045, 1.045);
    this.squashG.add(body, outline);

    // visor: faixa da esfera centrada em +Z (phi = π/2), na altura dos olhos
    const visorGeo = new THREE.SphereGeometry(R * 1.012, 40, 16, Math.PI / 2 - 0.95, 1.9, 1.06, 0.66);
    const visor = new THREE.Mesh(visorGeo, VISOR);
    visor.scale.set(1, 0.94, 1);
    this.squashG.add(visor);

    // olhos
    const eyeMat = new THREE.MeshStandardMaterial({
      color: '#F4F4F0', roughness: 0.3,
      emissive: s.emissiveEyes ?? '#ffffff', emissiveIntensity: s.emissiveEyes ? 0.75 : 0.12,
    });
    const lidMat = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55 });
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(side * s.eyeGap, 0.07, R * 0.93);
      const white = new THREE.Mesh(new THREE.SphereGeometry(s.eyeSize, 20, 14), eyeMat);
      white.scale.set(1, 1.15, 0.55);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(s.eyeSize * 0.48, 14, 10), PUPIL);
      pupil.position.z = s.eyeSize * 0.42;
      pupil.scale.set(1, 1.1, 0.5);
      if (s.emissiveEyes) pupil.visible = false;
      const lid = new THREE.Mesh(new THREE.SphereGeometry(s.eyeSize * 1.08, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      lid.scale.set(1, 1.15, 0.62);
      lid.rotation.x = -0.25;
      lid.visible = false;
      eg.add(white, pupil, lid);
      // olho X (pego)
      const x = new THREE.Group();
      const barGeo = new THREE.BoxGeometry(s.eyeSize * 2.1, s.eyeSize * 0.42, s.eyeSize * 0.4);
      const xMat = new THREE.MeshBasicMaterial({ color: '#ff3b4e', toneMapped: false });
      const b1 = new THREE.Mesh(barGeo, xMat);
      b1.rotation.z = Math.PI / 4;
      const b2 = new THREE.Mesh(barGeo, xMat);
      b2.rotation.z = -Math.PI / 4;
      x.add(b1, b2);
      x.position.copy(eg.position);
      x.position.z += 0.02;
      x.visible = false;
      this.squashG.add(eg, x);
      this.eyes.push(eg);
      this.pupils.push(pupil);
      this.lids.push(lid);
      this.xs.push(x);
      if (s.brows) {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(s.eyeSize * 2.4, s.eyeSize * 0.5, 0.05), VISOR);
        brow.position.set(side * s.eyeGap * 1.05, 0.07 + s.eyeSize * 1.55, R * 0.9);
        brow.rotation.z = side * -0.35;
        brow.userData.side = side;
        this.squashG.add(brow);
        this.brows.push(brow);
      }
    }

    // gravata
    if (s.tie) {
      this.tieMat = new THREE.MeshStandardMaterial({ color: tieColor ?? s.tie, roughness: 0.5 });
      const tie = new THREE.Group();
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.05), this.tieMat);
      const shape = new THREE.Shape();
      shape.moveTo(-0.03, 0);
      shape.lineTo(0.03, 0);
      shape.lineTo(0.055, -0.19);
      shape.lineTo(0, -0.25);
      shape.lineTo(-0.055, -0.19);
      shape.closePath();
      const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), this.tieMat);
      blade.position.set(0, -0.025, -0.01);
      knot.castShadow = blade.castShadow = true;
      tie.add(knot, blade);
      tie.position.set(0, -0.17, R * 0.9);
      tie.rotation.x = 0.42;
      this.squashG.add(tie);
      // colarinho
      const collarMat = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6 });
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 3), collarMat);
        c.position.set(side * 0.045, -0.15, R * 0.9);
        c.rotation.set(0.5, 0, side * 2.2);
        this.squashG.add(c);
      }
    }

    if (kind === 'x9') {
      const p = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1), new THREE.MeshStandardMaterial({ color: '#444' }));
      stem.position.y = 0.05;
      const bladeMat = new THREE.MeshStandardMaterial({ color: '#E6C43A', roughness: 0.4 });
      const blades = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.06), bladeMat);
        b.position.x = 0.11;
        const holder = new THREE.Group();
        holder.rotation.y = (i / 3) * Math.PI * 2;
        holder.add(b);
        blades.add(holder);
      }
      blades.position.y = 0.1;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e04848', roughness: 0.5 }));
      p.add(stem, blades, cap);
      p.position.y = R * 0.9;
      this.squashG.add(p);
      this.propeller = blades;
    }
    if (kind === 'dono') {
      const hatMat = new THREE.MeshStandardMaterial({ color: '#0d0d10', roughness: 0.4 });
      const band = new THREE.MeshStandardMaterial({ color: '#D4AF37', roughness: 0.3, metalness: 0.8 });
      const hat = new THREE.Group();
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 28), hatMat);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.32, 28), hatMat);
      top.position.y = 0.17;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.202, 0.202, 0.05, 28), band);
      b.position.y = 0.05;
      hat.add(brim, top, b);
      hat.position.y = R * 0.86;
      hat.rotation.z = 0.08;
      this.squashG.add(hat);
      // chaveiro
      const keys = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.008), band);
        k.position.set((i - 1) * 0.02, -0.04, 0);
        k.rotation.z = (i - 1) * 0.4;
        keys.add(k);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), band);
      keys.add(ring);
      keys.position.set(R * 0.75, -0.12, R * 0.55);
      this.squashG.add(keys);
    }

    // anel de calor
    this.heatRing = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.12, 0.018, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false, transparent: true, opacity: 0 }),
    );
    this.heatRing.rotation.x = Math.PI / 2;
    this.heatRing.position.y = -0.05;
    this.squashG.add(this.heatRing);

    this.carryAnchor.position.set(0.32, -0.12, 0.3);
    this.squashG.add(this.accessories, this.carryAnchor);

    // sombra-blob
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
  }

  setTie(color: string) {
    this.tieMat?.color.set(color);
  }

  setGhost(on: boolean) {
    this.ghost = on;
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || o === this.shadow || o === this.heatRing) return;
      if (m === OUTLINE || m === VISOR || m === PUPIL) {
        o.visible = !on || m !== OUTLINE;
        return;
      }
      m.transparent = on;
      (m as THREE.MeshStandardMaterial).opacity = on ? 0.4 : 1;
      m.depthWrite = !on;
    });
    this.shadow.visible = !on;
  }

  setEye(s: EyeState) {
    this.eye = s;
    const caught = s === 'caught';
    for (const e of this.eyes) e.visible = !caught;
    for (const x of this.xs) x.visible = caught;
    for (const l of this.lids) l.visible = s === 'bored';
  }

  impulse(a: number) {
    this.sqV += a;
  }

  setHeadphones(on: boolean) {
    if (on && !this.headphones) {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: '#222630', roughness: 0.4 });
      const cup = new THREE.MeshStandardMaterial({ color: '#ff4d6d', roughness: 0.4 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(this.R * 1.05, 0.03, 8, 32, Math.PI), m);
      band.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20), cup);
        c.rotation.z = Math.PI / 2;
        c.position.x = side * this.R * 1.03;
        g.add(c);
      }
      g.add(band);
      this.headphones = g;
      this.accessories.add(g);
    }
    if (this.headphones) this.headphones.visible = on;
  }

  setCrown(on: boolean) {
    if (on && !this.crown) {
      const g = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: '#FFD23F', metalness: 0.8, roughness: 0.25, emissive: '#8a6a00', emissiveIntensity: 0.4 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20, 1, true), gold);
      g.add(base);
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), gold);
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16);
        g.add(sp);
      }
      g.position.y = this.R * 0.92;
      g.rotation.z = -0.15;
      this.crown = g;
      this.accessories.add(g);
    }
    if (this.crown) this.crown.visible = on;
  }

  /** Faz as pupilas olharem para um ponto do mundo. */
  lookAt(world: THREE.Vector3) {
    const local = this.squashG.worldToLocal(world.clone());
    local.normalize();
    this.lookLocal.lerp(local, 0.3);
  }
  lookForward() {
    this.lookLocal.lerp(new THREE.Vector3(0, 0, 1), 0.2);
  }

  setPos(x: number, z: number) {
    this.root.position.set(x, 0, z);
  }

  get pos() {
    return this.root.position;
  }

  /** Posição dos olhos no mundo (para textos e câmeras). */
  headWorld(out = new THREE.Vector3()) {
    return this.squashG.getWorldPosition(out);
  }

  update(dt: number) {
    this.t += dt;
    // hover + bob
    this.curHover += (this.hoverHeight - this.curHover) * Math.min(1, dt * 8);
    const bobAmp = this.ghost ? 0.12 : this.kind === 'x9' ? 0.08 : 0.045;
    this.hover.position.y = this.curHover + Math.sin(this.t * 2.2) * bobAmp;
    this.root.rotation.y = this.yaw;
    // inclinação pela velocidade (em espaço local)
    const v = this.velocity;
    const fwd = Math.sin(this.yaw) * v.x + Math.cos(this.yaw) * v.z;
    const side = Math.cos(this.yaw) * v.x - Math.sin(this.yaw) * v.z;
    this.tilt.rotation.x += (fwd * 0.07 - this.tilt.rotation.x) * Math.min(1, dt * 10);
    this.tilt.rotation.z += (-side * 0.07 - this.tilt.rotation.z) * Math.min(1, dt * 10);
    // squash spring
    const k = 180;
    const damp = 11;
    this.sqV += (-k * this.sq - damp * this.sqV) * dt;
    this.sq += this.sqV * dt;
    const s = THREE.MathUtils.clamp(this.sq, -0.45, 0.6);
    this.squashG.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    // olhos
    const target = this.eye === 'alert' ? 1.25 : this.eye === 'clutch' ? 1.65 : this.eye === 'happy' ? 1.1 : 1;
    this.eyeScale += (target - this.eyeScale) * Math.min(1, dt * 14);
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.14;
      this.blinkT = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    const bl = this.blink > 0 ? 0.12 : 1;
    const happySquish = this.eye === 'happy' ? 0.55 : 1;
    for (let i = 0; i < this.eyes.length; i++) {
      const e = this.eyes[i];
      e.scale.set(this.eyeScale, this.eyeScale * bl * happySquish, this.eyeScale);
      const p = this.pupils[i];
      const es = this.spec.eyeSize;
      const shrink = this.eye === 'clutch' ? 0.55 : this.eye === 'alert' ? 0.75 : 1;
      p.position.x = THREE.MathUtils.clamp(this.lookLocal.x, -1, 1) * es * 0.45;
      p.position.y = THREE.MathUtils.clamp(this.lookLocal.y, -1, 1) * es * 0.45;
      p.scale.set(shrink, shrink * 1.1, 0.5);
    }
    for (const x of this.xs) x.rotation.z = Math.sin(this.t * 8) * 0.1;
    for (const b of this.brows) {
      const sd = b.userData.side as number;
      const angry = this.eye === 'alert' || this.eye === 'caught' ? 0.6 : 0.3;
      b.rotation.z += (sd * -angry - b.rotation.z) * Math.min(1, dt * 10);
      b.position.y = 0.07 + this.spec.eyeSize * (1.45 + (this.eyeScale - 1) * 0.9);
    }
    if (this.propeller) this.propeller.rotation.y += dt * (12 + v.length() * 10);
    // calor
    const hm = this.heatRing.material as THREE.MeshBasicMaterial;
    const hot = this.heat > 60 ? 0.5 + 0.5 * Math.sin(this.t * 10) : 0;
    hm.opacity += (hot - hm.opacity) * Math.min(1, dt * 8);
    this.heatRing.rotation.z += dt * 2;
    // sombra encolhe com a altura
    const hs = 1 - (this.hover.position.y - 0.5) * 0.3;
    this.shadow.scale.setScalar(THREE.MathUtils.clamp(hs, 0.5, 1.1));
  }
}
