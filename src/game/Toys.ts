import * as THREE from 'three';
import { W } from '../world/plan';
import type { Interactable } from './Player';
import type { Game } from './Game';

const R = 0.2;
const MAX_DOTS = 2500;
/** Cores de caneta, uma por mesa (o slot da sala). */
const INK = ['#ffd23f', '#4da3ff', '#3ddc97', '#ff6b6b', '#b79cff', '#ff8a3d'];
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Brinquedos da espera (v0.12): enquanto a sala aguarda na cabine do elevador há uma bola para chutar e jogar pro ar
 * (clique perto dela), um cesto de bolinhas de papel (uma por vez na mão) e uma caneta que rabisca as paredes.
 * Tudo é simulado em cada cliente; quem chuta ou rabisca manda o estado aos outros pelo host.
 */
export class Toys {
  private readonly root = new THREE.Group();
  private readonly ball: THREE.Mesh;
  private readonly basket = new THREE.Group();
  private readonly cup = new THREE.Group();
  private readonly ink: THREE.InstancedMesh;
  private inkN = 0;
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private kickCd = 0;
  private syncT = 0;
  private mine = false;
  private on = false;
  private lastDot: THREE.Vector3 | null = null;
  private outbox: number[] = [];
  private outT = 0;
  private readonly ray = new THREE.Raycaster();
  /** Segurando a caneta (E no cesto). */
  pen = false;

  constructor(private g: Game) {
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(R, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#ff4d6d', roughness: 0.45 }),
    );
    this.ball.castShadow = true;
    // gomos brancos da bola
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.99, 0.018, 8, 32), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
    this.ball.add(band);
    const band2 = band.clone();
    band2.rotation.y = Math.PI / 2;
    this.ball.add(band2);
    // cesto de bolinhas e a caneta ao lado
    const wicker = new THREE.MeshStandardMaterial({ color: '#b8743a', roughness: 0.8 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.3, 16, 1, true), wicker);
    bowl.position.y = 0.15;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), wicker);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.02;
    this.basket.add(bowl, bottom);
    const paper = g.office.paperProto;
    for (let i = 0; i < 9; i++) {
      const p = paper.clone();
      p.visible = true;
      const a = i * 2.4;
      p.position.set(Math.cos(a) * 0.12 * (i % 3 === 0 ? 0.3 : 1), 0.2 + (i % 3) * 0.05, Math.sin(a) * 0.12 * (i % 3 === 0 ? 0.3 : 1));
      p.scale.setScalar(1.6);
      this.basket.add(p);
    }
    // copinho com a caneta, ao lado do cesto
    const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 12), new THREE.MeshStandardMaterial({ color: '#2c3348', roughness: 0.6 }));
    cupBody.position.y = 0.07;
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), new THREE.MeshStandardMaterial({ color: '#2b6cff' }));
    pen.position.set(0.02, 0.2, 0);
    pen.rotation.z = 0.25;
    this.cup.add(cupBody, pen);
    this.basket.position.copy(W(14.5, 0.62));
    this.cup.position.copy(W(15.6, 0.62));

    this.ink = new THREE.InstancedMesh(new THREE.CircleGeometry(0.022, 8), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), MAX_DOTS);
    this.ink.count = 0;
    this.ink.frustumCulled = false;
    this.ink.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOTS * 3), 3);
    this.root.add(this.ball, this.basket, this.cup, this.ink);
    this.root.visible = false;
    g.r.scene.add(this.root);
    this.resetBall();
  }

  private resetBall() {
    this.pos.copy(W(15.0, 3.3)).setY(R);
    this.vel.set(0, 0, 0);
    this.ball.position.copy(this.pos);
  }

  /** Novo ciclo de espera: bola no meio, paredes limpas. */
  private begin() {
    this.resetBall();
    this.inkN = 0;
    this.ink.count = 0;
    this.pen = false;
    this.lastDot = null;
    this.outbox.length = 0;
  }

  /** Cesto e caneta: só existem na espera da cabine. */
  interactables(): Interactable[] {
    if (!this.on) return [];
    const pc = this.g.pc;
    const at = this.basket.position;
    return [
      {
        id: 'toy-paper', pos: at, r: 1.0, hold: 0, obj: [this.basket], needView: true,
        label: pc.paperHeld > 0 ? 'já tem uma bolinha na mão' : '<kbd>E</kbd>Pegar uma bolinha de papel',
        hint: 'para jogar no amigo',
        ok: () => pc.paperHeld < 1 && !pc.carrying,
        act: () => {
          pc.paperHeld = 1;
          this.g.audio.play('crumple', 0.7);
        },
      },
      {
        id: 'toy-pen', pos: this.cup.position, r: 1.0, hold: 0, obj: [this.cup], needView: true,
        label: this.pen ? '<kbd>E</kbd>Largar a caneta' : '<kbd>E</kbd>Pegar a caneta',
        hint: 'segure o clique esquerdo mirando a parede para rabiscar',
        ok: () => true,
        act: () => {
          this.pen = !this.pen;
          this.g.audio.play('pop', 0.5);
        },
      },
    ];
  }

  update(dt: number) {
    const g = this.g;
    const on = g.phase === 'elevator' && !g.attract;
    if (on !== this.on) {
      this.on = on;
      this.root.visible = on;
      if (on) this.begin();
    }
    if (!on) return;
    this.stepBall(dt);
    this.stepPen(dt);
  }

  private box() {
    return this.g.office.elevBox;
  }

  private stepBall(dt: number) {
    const g = this.g;
    const b = this.box();
    const pos = this.pos;
    const vel = this.vel;
    this.kickCd -= dt;
    vel.y -= 9.8 * dt;
    pos.addScaledVector(vel, dt);
    if (pos.y < R) {
      pos.y = R;
      if (vel.y < 0) {
        if (vel.y < -1.2) g.audio.play3D('thud', pos, Math.min(0.5, -vel.y * 0.08));
        vel.y *= -0.62;
        if (Math.abs(vel.y) < 0.7) vel.y = 0;
      }
      const k = Math.max(0, 1 - 1.1 * dt);
      vel.x *= k;
      vel.z *= k;
    }
    if (pos.y > 2.9) {
      pos.y = 2.9;
      vel.y = -Math.abs(vel.y) * 0.5;
    }
    if (pos.x < b.minX + R) { pos.x = b.minX + R; vel.x = Math.abs(vel.x) * 0.6; }
    if (pos.x > b.maxX - R) { pos.x = b.maxX - R; vel.x = -Math.abs(vel.x) * 0.6; }
    if (pos.z < b.minZ + R) { pos.z = b.minZ + R; vel.z = Math.abs(vel.z) * 0.6; }
    if (pos.z > b.maxZ - R) { pos.z = b.maxZ - R; vel.z = -Math.abs(vel.z) * 0.6; }
    this.ball.position.copy(pos);
    this.ball.rotation.x += vel.z * dt * 4;
    this.ball.rotation.z -= vel.x * dt * 4;

    // chute: encostar andando; clique perto (ou ESPAÇO não): joga pro alto na direção da mira
    const me = g.player.ball;
    const dx = pos.x - me.pos.x;
    const dz = pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (this.kickCd <= 0 && g.pc.mode === 'walk') {
      if (d < 0.66 && pos.y < 1.3) {
        const sp = Math.hypot(me.velocity.x, me.velocity.z);
        const nx = d > 0.001 ? dx / d : 0;
        const nz = d > 0.001 ? dz / d : 1;
        vel.set(nx * (2.6 + sp * 1.3), 2.8 + sp * 0.5, nz * (2.6 + sp * 1.3));
        this.touched();
      } else if (g.input.locked && g.input.pressed('Mouse0') && !this.pen && d < 2.4) {
        const dir = g.r.camera.getWorldDirection(new THREE.Vector3());
        vel.set(dir.x * 6, Math.max(3.5, dir.y * 6 + 3.5), dir.z * 6);
        this.touched();
      }
    }
    // quem chutou por último segue avisando os outros enquanto ela rola
    if (this.mine) {
      this.syncT -= dt;
      const moving = vel.lengthSq() > 0.05 || pos.y > R + 0.01;
      if (this.syncT <= 0 && moving) this.sendBall();
      else if (!moving) this.mine = false;
    }
  }

  private touched() {
    this.kickCd = 0.3;
    this.mine = true;
    this.g.audio.play3D('plop', this.pos, 0.7);
    this.g.juice.smoke(this.pos.clone().setY(0.1), 2, '#efe6d6', 0.4);
    this.sendBall();
  }

  private sendBall() {
    this.syncT = 0.25;
    const r = (n: number) => Math.round(n * 100) / 100;
    this.g.net?.toy('ball', [r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.vel.x), r(this.vel.y), r(this.vel.z)]);
  }

  /** Mensagem de outro jogador. */
  onRemote(k: string, d: number[], slot: number) {
    if (!this.on) return;
    if (k === 'ball' && d.length >= 6) {
      this.pos.set(d[0], d[1], d[2]);
      this.vel.set(d[3], d[4], d[5]);
      this.mine = false;
    } else if (k === 'ink') {
      for (let i = 0; i + 5 < d.length; i += 6) this.addDot(new THREE.Vector3(d[i], d[i + 1], d[i + 2]), new THREE.Vector3(d[i + 3], d[i + 4], d[i + 5]), slot);
    }
  }

  private slot() {
    const net = this.g.net;
    return net ? net.slots[net.self] ?? 0 : 0;
  }

  private stepPen(dt: number) {
    const g = this.g;
    if (this.pen && g.input.locked && g.input.isDown('Mouse0') && g.pc.mode === 'walk') {
      g.hud.crosshair('aim');
      this.ray.setFromCamera(new THREE.Vector2(0, 0), g.r.camera);
      this.ray.far = 4;
      const hit = this.ray.intersectObjects(g.office.root.children, true).find((h) => {
        const m = h.object as THREE.Mesh;
        return m.isMesh && m.visible && h.face && !(m as unknown as THREE.Sprite).isSprite;
      });
      if (hit && hit.face) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (n.dot(this.ray.ray.direction) > 0) n.negate();
        const p = hit.point.clone().addScaledVector(n, 0.006);
        // linha contínua: preenche o espaço entre os pontos
        const last = this.lastDot;
        if (last && last.distanceTo(p) < 0.5) {
          const steps = Math.floor(last.distanceTo(p) / 0.025);
          for (let i = 1; i <= steps; i++) this.dot(last.clone().lerp(p, i / (steps + 1)), n);
        }
        this.dot(p, n);
        this.lastDot = p;
      } else this.lastDot = null;
    } else this.lastDot = null;
    // pontos novos vão para os outros em lotes
    this.outT -= dt;
    if (this.outT <= 0 && this.outbox.length) {
      this.g.net?.toy('ink', this.outbox.splice(0, 120));
      this.outT = 0.12;
    }
  }

  private dot(p: THREE.Vector3, n: THREE.Vector3) {
    this.addDot(p, n, this.slot());
    const r = (v: number) => Math.round(v * 100) / 100;
    this.outbox.push(r(p.x), r(p.y), r(p.z), r(n.x), r(n.y), r(n.z));
  }

  private addDot(p: THREE.Vector3, n: THREE.Vector3, slot: number) {
    const i = this.inkN % MAX_DOTS;
    this.inkN++;
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(Z, n.clone().normalize()), new THREE.Vector3(1, 1, 1));
    this.ink.setMatrixAt(i, m);
    this.ink.setColorAt(i, new THREE.Color(INK[slot % INK.length]));
    this.ink.count = Math.min(this.inkN, MAX_DOTS);
    this.ink.instanceMatrix.needsUpdate = true;
    if (this.ink.instanceColor) this.ink.instanceColor.needsUpdate = true;
  }
}
