import * as THREE from 'three';

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
  floor: number;
  color: THREE.Color;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  private ps: Particle[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private n: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      this.ps.push({
        alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
        life: 0, max: 1, size: 1, grow: 0, gravity: 0, drag: 0, floor: -99, color: new THREE.Color(),
      });
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
  }

  private cursor = 0;
  spawn(init: (p: Particle) => void) {
    const p = this.ps[this.cursor];
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    p.alive = true;
    p.life = 0;
    p.grow = 0;
    p.drag = 0;
    p.floor = 0.01;
    p.spin.set(0, 0, 0);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    init(p);
    this.mesh.setColorAt(idx, p.color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      const p = this.ps[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) {
        p.pos.y = p.floor;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin.multiplyScalar(0.5);
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const k = p.life / p.max;
      const sc = p.size * (1 + p.grow * k) * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
      this.q.setFromEuler(p.rot);
      this.s.setScalar(sc);
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const CONFETTI = ['#ff4d6d', '#ffd23f', '#3ddc97', '#4da3ff', '#b388ff', '#ff8a3d'];

/** Tudo que dá "peso" ao jogo: tremor, câmera lenta, hitstop, partículas e textos flutuantes. */
export class Juice {
  trauma = 0;
  timeScale = 1;
  private slowT = 0;
  private slowScale = 1;
  private stopT = 0;
  readonly lit: Pool;
  readonly glow: Pool;
  readonly puff: Pool;
  private texts: { el: HTMLElement; pos: THREE.Vector3; t: number; max: number; vy: number }[] = [];
  private shakeOff = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private t = 0;

  constructor(scene: THREE.Scene, private uiLayer: HTMLElement) {
    this.lit = new Pool(new THREE.BoxGeometry(1, 0.15, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 400);
    this.lit.mesh.castShadow = false;
    this.glow = new Pool(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      300,
    );
    this.puff = new Pool(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }),
      120,
    );
    scene.add(this.lit.mesh, this.glow.mesh, this.puff.mesh);
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  slowmo(scale: number, dur: number) {
    this.slowScale = scale;
    this.slowT = dur;
  }

  hitstop(dur: number) {
    this.stopT = Math.max(this.stopT, dur);
  }

  /** Retorna o dt de jogo (com câmera lenta/hitstop) a partir do dt real. */
  step(realDt: number) {
    this.t += realDt;
    if (this.stopT > 0) {
      this.stopT -= realDt;
      this.timeScale = 0;
    } else if (this.slowT > 0) {
      this.slowT -= realDt;
      this.timeScale = this.slowScale;
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, realDt * 6);
    }
    this.trauma = Math.max(0, this.trauma - realDt * 1.4);
    return realDt * this.timeScale;
  }

  update(dt: number, realDt: number, cam: THREE.Camera) {
    this.lit.update(dt);
    this.glow.update(dt);
    this.puff.update(dt);
    // textos flutuantes (tempo real para não congelar no hitstop)
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const ft = this.texts[i];
      ft.t += realDt;
      ft.pos.y += ft.vy * realDt;
      ft.vy *= 1 - realDt * 2;
      if (ft.t > ft.max) {
        ft.el.remove();
        this.texts.splice(i, 1);
        continue;
      }
      this.tmp.copy(ft.pos).project(cam);
      const vis = this.tmp.z < 1;
      ft.el.style.transform = `translate(${(this.tmp.x * 0.5 + 0.5) * w}px, ${(-this.tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      ft.el.style.opacity = vis ? String(Math.min(1, (ft.max - ft.t) * 3)) : '0';
    }
  }

  /** Aplica o tremor à câmera (chamar depois de posicionar a câmera). */
  applyShake(cam: THREE.Camera) {
    const s = this.trauma * this.trauma;
    if (s <= 0.0001) return;
    const n = (k: number) => Math.sin(this.t * 37 + k * 11.3) * 0.6 + Math.sin(this.t * 61 + k * 5.1) * 0.4;
    this.shakeOff.set(n(1), n(2), n(3)).multiplyScalar(s * 0.12);
    cam.position.add(this.shakeOff);
    cam.rotation.z += n(4) * s * 0.05;
  }

  text(pos: THREE.Vector3, txt: string, cls = '', max = 1.1) {
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = txt;
    this.uiLayer.appendChild(el);
    this.texts.push({ el, pos: pos.clone(), t: 0, max, vy: 1.4 });
  }

  confetti(pos: THREE.Vector3, n = 40, power = 5) {
    for (let i = 0; i < n; i++) {
      this.lit.spawn((p) => {
        p.pos.copy(pos);
        const a = Math.random() * Math.PI * 2;
        const up = 0.5 + Math.random();
        p.vel.set(Math.cos(a) * power * Math.random(), power * up, Math.sin(a) * power * Math.random());
        p.spin.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
        p.max = 1.6 + Math.random() * 1.2;
        p.size = 0.05 + Math.random() * 0.04;
        p.gravity = 7;
        p.drag = 2.2;
        p.color.set(CONFETTI[i % CONFETTI.length]);
      });
    }
  }

  sparks(pos: THREE.Vector3, color: THREE.ColorRepresentation, n = 16, power = 4) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn((p) => {
        p.pos.copy(pos);
        p.vel.randomDirection().multiplyScalar(power * (0.4 + Math.random()));
        p.max = 0.35 + Math.random() * 0.3;
        p.size = 0.03 + Math.random() * 0.03;
        p.gravity = 4;
        p.drag = 3;
        p.floor = -99;
        p.color.set(color).multiplyScalar(2.2);
      });
    }
  }

  crumbs(pos: THREE.Vector3, n = 10, color: THREE.ColorRepresentation = '#c58a45') {
    for (let i = 0; i < n; i++) {
      this.lit.spawn((p) => {
        p.pos.copy(pos);
        p.vel.set(Math.random() * 2 - 1, 1 + Math.random() * 1.5, Math.random() * 2 - 1);
        p.spin.set(Math.random() * 10, Math.random() * 10, 0);
        p.max = 1.2 + Math.random();
        p.size = 0.025 + Math.random() * 0.02;
        p.gravity = 9.8;
        p.floor = pos.y - 0.45;
        p.color.set(color);
      });
    }
  }

  smoke(pos: THREE.Vector3, n = 8, color: THREE.ColorRepresentation = '#ffffff', power = 1.2) {
    for (let i = 0; i < n; i++) {
      this.puff.spawn((p) => {
        p.pos.copy(pos).add(this.tmp.randomDirection().multiplyScalar(0.15));
        p.vel.randomDirection().multiplyScalar(power * Math.random());
        p.vel.y = Math.abs(p.vel.y) * 0.5 + 0.3;
        p.max = 0.6 + Math.random() * 0.5;
        p.size = 0.12 + Math.random() * 0.1;
        p.grow = 1.6;
        p.drag = 3;
        p.floor = -99;
        p.color.set(color);
      });
    }
  }

  /** Anel de choque no chão (usa puffs achatados). */
  ring(pos: THREE.Vector3, color: THREE.ColorRepresentation, n = 24, power = 6) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.glow.spawn((p) => {
        p.pos.copy(pos);
        p.vel.set(Math.cos(a) * power, 0.2, Math.sin(a) * power);
        p.max = 0.45;
        p.size = 0.06;
        p.drag = 5;
        p.floor = -99;
        p.color.set(color).multiplyScalar(2);
      });
    }
  }
}
