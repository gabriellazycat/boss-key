import * as THREE from 'three';

export type EyeState = 'normal' | 'alert' | 'clutch' | 'caught' | 'bored' | 'happy';
export type BallKind = 'employee' | 'x9' | 'boss' | 'dono';
export type Accessory = 'tuft' | 'bun' | 'cap' | 'bow' | 'beanie' | 'glasses' | 'headset' | 'none';

const VISOR = new THREE.MeshStandardMaterial({ color: '#1c2238', roughness: 0.18, metalness: 0.25 });
const PUPIL = new THREE.MeshBasicMaterial({ color: '#141420' });
const SHINE = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const BROW = new THREE.MeshStandardMaterial({ color: '#2a2238', roughness: 0.6 });
const BLUSH = new THREE.MeshBasicMaterial({ color: '#ff7a9c', transparent: true, opacity: 0.55, depthWrite: false });

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

let shadowTex: THREE.Texture | null = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(20,30,50,0.5)');
  gr.addColorStop(0.6, 'rgba(20,30,50,0.2)');
  gr.addColorStop(1, 'rgba(20,30,50,0)');
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
  angry?: boolean;
}

const KINDS: Record<BallKind, KindSpec> = {
  employee: { color: '#ff8a3d', scale: 1, tie: '#2F5FA8', eyeSize: 0.11, eyeGap: 0.15 },
  x9: { color: '#9be36a', scale: 0.8, tie: '#ffd23f', eyeSize: 0.125, eyeGap: 0.15 },
  boss: { color: '#6e1a30', scale: 1.9, tie: '#1b1b24', eyeSize: 0.085, eyeGap: 0.115, angry: true },
  dono: { color: '#24242e', scale: 2.2, tie: '#D4AF37', eyeSize: 0.075, eyeGap: 0.1, emissiveEyes: '#FFE9A8', angry: true },
};

export const TIE_COLORS = ['#2F5FA8', '#3E9B5B', '#E0832B', '#D45A8B', '#E6C43A', '#7A5BC0'];

/** A bola com olhos. Toda a atuação é feita por olhos, sobrancelhas e squash/stretch. */
export class Ball {
  readonly root = new THREE.Group();
  readonly hover = new THREE.Group();
  readonly tilt = new THREE.Group();
  readonly squashG = new THREE.Group();
  readonly R = 0.42;
  readonly spec: KindSpec;
  readonly bodyMat: THREE.MeshToonMaterial;
  private outlineMat: THREE.MeshBasicMaterial;
  private tieMat: THREE.MeshStandardMaterial | null = null;
  private eyes: THREE.Group[] = [];
  private pupils: THREE.Group[] = [];
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
  private zzz: THREE.Sprite | null = null;

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
  /** Deitado (soneca no sofá). */
  lying = 0;
  private stepPhase = 0;

  constructor(readonly kind: BallKind, tieColor?: string, bodyColor?: string, acc: Accessory = 'none') {
    this.spec = KINDS[kind];
    const s = this.spec;
    const R = this.R;
    this.root.add(this.hover);
    this.hover.add(this.tilt);
    this.tilt.add(this.squashG);
    this.root.scale.setScalar(s.scale);

    const col = bodyColor ?? s.color;
    this.bodyMat = toonMat(col, kind === 'dono' ? '#ffd27a' : '#fff3dd', kind === 'dono' ? 0.4 : 0.3);
    const bodyGeo = new THREE.SphereGeometry(R, 48, 32);
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.castShadow = true;
    body.receiveShadow = false;
    body.scale.set(1, 0.95, 1);
    this.outlineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.28), side: THREE.BackSide });
    const outline = new THREE.Mesh(bodyGeo, this.outlineMat);
    outline.scale.set(1.04, 0.95 * 1.04, 1.04);
    outline.userData.outline = true;
    this.squashG.add(body, outline);

    // visor com brilho
    const visorGeo = new THREE.SphereGeometry(R * 1.014, 48, 16, Math.PI / 2 - 0.95, 1.9, 1.06, 0.66);
    const visor = new THREE.Mesh(visorGeo, VISOR);
    visor.scale.set(1, 0.95, 1);
    this.squashG.add(visor);
    // reflexo no visor (faixa clara no canto superior)
    const gloss = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 24, 6, Math.PI / 2 + 0.25, 0.55, 1.12, 0.07), new THREE.MeshBasicMaterial({ color: '#c9d6ff', transparent: true, opacity: 0.5 }));
    gloss.scale.set(1, 0.95, 1);
    this.squashG.add(gloss);

    // olhos
    const eyeMat = new THREE.MeshStandardMaterial({
      color: s.emissiveEyes ? '#fbfaf5' : '#e9e6dc', roughness: 0.35,
      emissive: s.emissiveEyes ?? '#000000', emissiveIntensity: s.emissiveEyes ? 0.75 : 0,
    });
    const lidMat = toonMat(col);
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(side * s.eyeGap, 0.075, R * 0.93);
      const white = new THREE.Mesh(new THREE.SphereGeometry(s.eyeSize, 24, 16), eyeMat);
      white.scale.set(1, 1.18, 0.55);
      const pg = new THREE.Group();
      pg.position.z = s.eyeSize * 0.42;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(s.eyeSize * 0.5, 16, 12), PUPIL);
      pupil.scale.set(1, 1.12, 0.45);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(s.eyeSize * 0.16, 8, 6), SHINE);
      shine.position.set(s.eyeSize * 0.16, s.eyeSize * 0.2, s.eyeSize * 0.12);
      pg.add(pupil, shine);
      if (s.emissiveEyes) pg.visible = false;
      const lid = new THREE.Mesh(new THREE.SphereGeometry(s.eyeSize * 1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      lid.scale.set(1, 1.18, 0.62);
      lid.rotation.x = -0.3;
      lid.visible = false;
      eg.add(white, pg, lid);
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
      this.pupils.push(pg);
      this.lids.push(lid);
      this.xs.push(x);
      // sobrancelha (todos têm)
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(s.eyeSize * 0.2, s.eyeSize * 1.4, 4, 8), BROW);
      brow.rotation.z = Math.PI / 2;
      brow.position.set(side * s.eyeGap * 1.05, 0.075 + s.eyeSize * 1.6, R * 0.92);
      brow.userData.side = side;
      this.squashG.add(brow);
      this.brows.push(brow);
      // bochecha
      if (kind === 'employee' || kind === 'x9') {
        const blush = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), BLUSH);
        blush.scale.set(1.3, 0.75, 1);
        const a = side * 0.52;
        blush.position.set(Math.sin(a) * R * 1.005, -0.09, Math.cos(a) * R * 1.005);
        blush.rotation.y = a;
        this.squashG.add(blush);
      }
    }

    // gravata + colarinho
    if (s.tie) {
      this.tieMat = new THREE.MeshStandardMaterial({ color: tieColor ?? s.tie, roughness: 0.5 });
      const tie = new THREE.Group();
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), this.tieMat);
      knot.scale.set(1.1, 0.9, 0.7);
      const shape = new THREE.Shape();
      shape.moveTo(-0.03, 0);
      shape.lineTo(0.03, 0);
      shape.lineTo(0.058, -0.19);
      shape.lineTo(0, -0.26);
      shape.lineTo(-0.058, -0.19);
      shape.closePath();
      const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 3 }), this.tieMat);
      blade.position.set(0, -0.025, -0.012);
      knot.castShadow = blade.castShadow = true;
      tie.add(knot, blade);
      tie.position.set(0, -0.17, R * 0.9);
      tie.rotation.x = 0.42;
      this.squashG.add(tie);
      const collarMat = new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.6 });
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 3), collarMat);
        c.position.set(side * 0.05, -0.15, R * 0.88);
        c.rotation.set(0.5, 0, side * 2.2);
        this.squashG.add(c);
      }
    }

    if (kind === 'x9') this.addPropeller();
    if (kind === 'dono') this.addTopHat();
    if (kind === 'boss') this.addCombover();
    if (kind === 'boss' || kind === 'dono') this.addSuit(kind === 'dono' ? '#0e0e14' : '#2b2f45');
    this.setAccessory(acc);

    this.heatRing = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.12, 0.018, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false, transparent: true, opacity: 0 }),
    );
    this.heatRing.rotation.x = Math.PI / 2;
    this.heatRing.position.y = -0.05;
    this.squashG.add(this.heatRing);

    this.carryAnchor.position.set(0.34, -0.12, 0.3);
    this.squashG.add(this.accessories, this.carryAnchor);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;
    this.shadow.userData.noAO = true;
    this.root.add(this.shadow);
  }

  private addPropeller() {
    const p = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1), new THREE.MeshStandardMaterial({ color: '#444' }));
    stem.position.y = 0.05;
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.4 });
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
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toonMat('#ff4d6d'));
    cap.scale.set(1, 0.6, 1);
    const capB = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toonMat('#4da3ff'));
    capB.scale.set(1.002, 0.6, 1.002);
    capB.rotation.y = Math.PI / 2;
    const visorC = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), toonMat('#ff4d6d'));
    visorC.position.set(0, 0.0, 0.1);
    p.add(stem, blades, cap, capB, visorC);
    p.position.y = this.R * 0.82;
    this.squashG.add(p);
    this.propeller = blades;
  }

  private addTopHat() {
    const hatMat = toonMat('#121218', '#ffd27a', 0.4);
    const band = new THREE.MeshStandardMaterial({ color: '#D4AF37', roughness: 0.3, metalness: 0.8 });
    const hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 28), hatMat);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.32, 28), hatMat);
    top.position.y = 0.17;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.202, 0.202, 0.05, 28), band);
    b.position.y = 0.05;
    hat.add(brim, top, b);
    hat.position.y = this.R * 0.86;
    hat.rotation.z = 0.1;
    this.squashG.add(hat);
    const mono = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), band);
    mono.position.set(0.1, 0.075, this.R * 0.99);
    this.squashG.add(mono);
    const keys = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.008), band);
      k.position.set((i - 1) * 0.02, -0.04, 0);
      k.rotation.z = (i - 1) * 0.4;
      keys.add(k);
    }
    keys.add(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), band));
    keys.position.set(this.R * 0.75, -0.12, this.R * 0.55);
    this.squashG.add(keys);
  }

  /** Paletó: metade de baixo da bola vestida, com camisa e lapelas. */
  private addSuit(color: string) {
    const R = this.R;
    const suit = toonMat(color, '#9fb0ff', 0.25);
    const jacket = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 40, 16, 0, Math.PI * 2, 1.74, Math.PI - 1.74), suit);
    jacket.scale.set(1, 0.95, 1);
    jacket.castShadow = true;
    this.squashG.add(jacket);
    // camisa branca em V
    const shirt = new THREE.Mesh(new THREE.SphereGeometry(R * 1.026, 24, 10, Math.PI / 2 - 0.36, 0.72, 1.74, 0.85), new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.6 }));
    shirt.scale.set(1, 0.95, 1);
    this.squashG.add(shirt);
    // botões
    for (let i = 0; i < 2; i++) {
      const bt = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.7, roughness: 0.3 }));
      const a = 2.2 + i * 0.25;
      const ph = 0.42;
      bt.position.set(Math.sin(ph) * Math.sin(a) * R * 1.03, Math.cos(a) * R * 0.97, Math.cos(ph) * Math.sin(a) * R * 1.03);
      this.squashG.add(bt);
    }
  }

  private addCombover() {
    const hair = toonMat('#2a1d24', '#ff9a9a', 0.3);
    for (let i = 0; i < 3; i++) {
      const strand = new THREE.Mesh(new THREE.TorusGeometry(this.R * 0.9, 0.018, 6, 20, 1.4), hair);
      strand.rotation.set(0, Math.PI / 2, 0);
      strand.rotation.order = 'ZYX';
      strand.rotation.z = Math.PI / 2 - 0.7;
      strand.position.set(-0.04 + i * 0.05, 0.13, -0.05);
      this.squashG.add(strand);
    }
    // bigode
    const stache = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.16, 4, 8), hair);
    stache.rotation.z = Math.PI / 2;
    stache.position.set(0, -0.09, this.R * 0.96);
    this.squashG.add(stache);
  }

  /** Acessório de personalidade (cabelo, boné, laço...). */
  setAccessory(acc: Accessory) {
    const R = this.R;
    const g = new THREE.Group();
    g.name = 'acc';
    const old = this.squashG.getObjectByName('acc');
    if (old) old.removeFromParent();
    if (acc === 'tuft') {
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 8), this.bodyMat);
        leaf.position.set((i - 1) * 0.05, R * 0.98, 0.02);
        leaf.rotation.z = (i - 1) * -0.5;
        g.add(leaf);
      }
    } else if (acc === 'bun') {
      const hair = toonMat('#5a3424');
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), hair);
      bun.position.set(0, R * 0.98, -0.08);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 16), toonMat('#ffd23f'));
      band.rotation.x = Math.PI / 2 + 0.3;
      band.position.set(0, R * 0.9, -0.06);
      g.add(bun, band);
    } else if (acc === 'cap') {
      const m = toonMat('#e5484d');
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 24, 12, 0, Math.PI * 2, 0, 1.0), m);
      const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), m);
      bill.position.set(0, R * 0.55, -R * 0.75);
      bill.rotation.set(-0.25, Math.PI, 0);
      g.add(dome, bill);
    } else if (acc === 'bow') {
      const m = toonMat('#ff6b9a');
      for (const s of [-1, 1]) {
        const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4), m);
        lobe.rotation.z = (s * Math.PI) / 2;
        lobe.position.set(0.18 + s * 0.08, R * 0.88, 0.05);
        g.add(lobe);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), m);
      knot.position.set(0.18, R * 0.88, 0.05);
      g.add(knot);
    } else if (acc === 'beanie') {
      const m = toonMat('#3ddc97');
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 24, 12, 0, Math.PI * 2, 0, 1.05), m);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(R * 0.88, 0.04, 8, 32), toonMat('#2fb07a'));
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = R * 0.5;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), toonMat('#ffffff'));
      pom.position.y = R * 1.06;
      g.add(dome, cuff, pom);
    } else if (acc === 'glasses') {
      const m = new THREE.MeshStandardMaterial({ color: '#2a2238', roughness: 0.4 });
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(this.spec.eyeSize * 1.35, 0.012, 6, 24), m);
        ring.position.set(s * this.spec.eyeGap, 0.075, R * 1.06);
        g.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.012), m);
      bridge.position.set(0, 0.09, R * 1.06);
      g.add(bridge);
    } else if (acc === 'headset') {
      const m = new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.4 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.04, 0.022, 6, 28, Math.PI), m);
      band.rotation.y = Math.PI / 2;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), toonMat('#9b7bff'));
      cup.rotation.z = Math.PI / 2;
      cup.position.x = R * 1.02;
      const mic = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 4, 12, 1.4), m);
      mic.position.set(R * 0.95, -0.08, 0.1);
      mic.rotation.y = -0.6;
      g.add(band, cup, mic);
    }
    this.squashG.add(g);
  }

  setTie(color: string) {
    this.tieMat?.color.set(color);
  }

  setBodyColor(color: string) {
    this.bodyMat.color.set(color);
    this.outlineMat.color.set(color).multiplyScalar(0.28);
  }

  setGhost(on: boolean) {
    this.ghost = on;
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || o === this.shadow || o === this.heatRing) return;
      if (o.userData.outline) {
        o.visible = !on;
        return;
      }
      if (m === VISOR || m === PUPIL || m === SHINE || m === BROW || m === BLUSH) return;
      m.transparent = on;
      (m as THREE.MeshStandardMaterial).opacity = on ? 0.42 : 1;
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
      const band = new THREE.Mesh(new THREE.TorusGeometry(this.R * 1.06, 0.03, 8, 32, Math.PI), m);
      band.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20), toonMat('#ff4d6d'));
        c.rotation.z = Math.PI / 2;
        c.position.x = side * this.R * 1.04;
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
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20, 1, true), gold));
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), gold);
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16);
        g.add(sp);
      }
      g.position.y = this.R * 0.98;
      g.rotation.z = -0.15;
      this.crown = g;
      this.accessories.add(g);
    }
    if (this.crown) this.crown.visible = on;
  }

  /** "Zzz" flutuando (soneca). */
  setSleeping(on: boolean) {
    if (on && !this.zzz) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 64;
      const g = c.getContext('2d')!;
      g.font = '400 52px "Darumadrop One", Fredoka, sans-serif';
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#2a2238';
      g.lineWidth = 6;
      g.strokeText('zZz', 8, 50);
      g.fillText('zZz', 8, 50);
      this.zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      this.zzz.scale.set(0.5, 0.25, 1);
      this.root.add(this.zzz);
    }
    if (this.zzz) this.zzz.visible = on;
  }

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

  headWorld(out = new THREE.Vector3()) {
    return this.squashG.getWorldPosition(out);
  }

  update(dt: number) {
    this.t += dt;
    this.curHover += (this.hoverHeight - this.curHover) * Math.min(1, dt * 8);
    const sp = this.velocity.length();
    // passinhos: quique sincronizado com a velocidade
    this.stepPhase += dt * (4 + sp * 3.2);
    const hop = sp > 0.4 ? Math.abs(Math.sin(this.stepPhase)) * Math.min(0.12, sp * 0.03) : 0;
    const bobAmp = this.ghost ? 0.12 : this.kind === 'x9' ? 0.08 : 0.04;
    this.hover.position.y = this.curHover + Math.sin(this.t * 2.2) * bobAmp + hop;
    this.root.rotation.y = this.yaw;
    const v = this.velocity;
    const fwd = Math.sin(this.yaw) * v.x + Math.cos(this.yaw) * v.z;
    const side = Math.cos(this.yaw) * v.x - Math.sin(this.yaw) * v.z;
    const lieX = this.lying * -1.35;
    this.tilt.rotation.x += (fwd * 0.08 + lieX - this.tilt.rotation.x) * Math.min(1, dt * 10);
    this.tilt.rotation.z += (-side * 0.08 - this.tilt.rotation.z) * Math.min(1, dt * 10);
    const k = 180;
    const damp = 11;
    this.sqV += (-k * this.sq - damp * this.sqV) * dt;
    this.sq += this.sqV * dt;
    const s = THREE.MathUtils.clamp(this.sq, -0.45, 0.6);
    this.squashG.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    const target = this.eye === 'alert' ? 1.25 : this.eye === 'clutch' ? 1.65 : this.eye === 'happy' ? 1.1 : 1;
    this.eyeScale += (target - this.eyeScale) * Math.min(1, dt * 14);
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.14;
      this.blinkT = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    const sleeping = this.zzz?.visible;
    const bl = this.blink > 0 || sleeping ? 0.1 : 1;
    const happySquish = this.eye === 'happy' ? 0.55 : 1;
    for (let i = 0; i < this.eyes.length; i++) {
      this.eyes[i].scale.set(this.eyeScale, this.eyeScale * bl * happySquish, this.eyeScale);
      const p = this.pupils[i];
      const es = this.spec.eyeSize;
      const shrink = this.eye === 'clutch' ? 0.55 : this.eye === 'alert' ? 0.75 : 1;
      p.position.x = THREE.MathUtils.clamp(this.lookLocal.x, -1, 1) * es * 0.45;
      p.position.y = THREE.MathUtils.clamp(this.lookLocal.y, -1, 1) * es * 0.45;
      p.scale.setScalar(shrink);
    }
    for (const x of this.xs) x.rotation.z = Math.sin(this.t * 8) * 0.1;
    // sobrancelhas expressivas
    for (const b of this.brows) {
      const sd = b.userData.side as number;
      let ang = 0.12;
      let lift = 1.55;
      if (this.spec.angry) ang = 0.42;
      if (this.eye === 'alert') {
        ang = this.spec.angry ? 0.6 : -0.15;
        lift = 1.9;
      } else if (this.eye === 'clutch') {
        ang = -0.25;
        lift = 2.3;
      } else if (this.eye === 'caught') {
        ang = -0.45;
        lift = 1.7;
      } else if (this.eye === 'bored') {
        ang = -0.3;
        lift = 1.35;
      } else if (this.eye === 'happy') {
        ang = -0.1;
        lift = 1.75;
      }
      const targetZ = Math.PI / 2 + sd * -ang;
      b.rotation.z += (targetZ - b.rotation.z) * Math.min(1, dt * 12);
      const ty = 0.075 + this.spec.eyeSize * (lift + (this.eyeScale - 1) * 0.9);
      b.position.y += (ty - b.position.y) * Math.min(1, dt * 12);
    }
    if (this.propeller) this.propeller.rotation.y += dt * (12 + sp * 10);
    const hm = this.heatRing.material as THREE.MeshBasicMaterial;
    const hot = this.heat > 60 ? 0.5 + 0.5 * Math.sin(this.t * 10) : 0;
    hm.opacity += (hot - hm.opacity) * Math.min(1, dt * 8);
    this.heatRing.rotation.z += dt * 2;
    if (this.zzz?.visible) {
      const k2 = (this.t * 0.5) % 1;
      this.zzz.position.set(0.25 + k2 * 0.2, 1.1 + k2 * 0.5, 0);
      (this.zzz.material as THREE.SpriteMaterial).opacity = 1 - k2;
    }
    const hs = 1 - (this.hover.position.y - 0.5) * 0.3;
    this.shadow.scale.setScalar(THREE.MathUtils.clamp(hs, 0.5, 1.1));
  }
}
