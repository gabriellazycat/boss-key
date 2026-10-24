import * as THREE from 'three';
import { Ball } from '../entities/Ball';
import { W } from '../world/Office';
import { B, type BossKind } from '../balance';
import type { Worker } from './Worker';
import type { Game } from './Game';

export type BossTarget =
  | { kind: 'desk'; w: Worker; mode: 'check' | 'flagrante' | 'inspecao' | 'audit' | 'chase' }
  | { kind: 'point'; p: THREE.Vector3; stay: number; why: 'noise' | 'printer' | 'kitchen' | 'evidence' | 'patrol' };

type State = 'office' | 'toDoor' | 'door' | 'walk' | 'suspicious' | 'stay' | 'check' | 'return' | 'chase';

export interface BossSpec {
  speed: number;
  identify: number;
  check: number;
  warn: number;
}

/** O chefe: FSM Na sala → Porta → Ronda (Suspeito → Investigar) → CheckScreen → Retorno. */
export class Boss {
  readonly ball: Ball;
  state: State = 'office';
  queue: BossTarget[] = [];
  cur: BossTarget | null = null;
  private path: THREE.Vector3[] = [];
  private timer = 0;
  private stepT = 0;
  /** Perseguição: alvo e tempo até recalcular o caminho. */
  chaseW: Worker | null = null;
  private chaseRepath = 0;
  private chaseT = 0;
  private identified = false;
  private checkT = 0;
  readonly home: THREE.Vector3;
  private readonly doorIn = W(15, 3.2);
  private readonly doorOut = W(15, 4.9);
  private suspiciousOf: BossTarget | null = null;
  private lookTarget: THREE.Vector3 | null = null;
  /** Fim da última ronda (tempo do dia). */
  lastRondaEnd = -999;
  lastRondaStart = -999;
  readonly flashlight: THREE.SpotLight;
  private flashOn = false;
  rondaReason = '';
  visible = true;
  private seenWarned = new Set<Worker>();

  constructor(readonly kind: BossKind, public spec: BossSpec, private game: Game, home: THREE.Vector3) {
    this.ball = new Ball(kind === 'x9' ? 'x9' : kind === 'dono' ? 'dono' : 'boss');
    this.home = home.clone();
    this.ball.setPos(home.x, home.z);
    this.ball.yaw = 0;
    this.flashlight = new THREE.SpotLight('#fff6d8', 0, B.FLASHLIGHT_RANGE, THREE.MathUtils.degToRad(B.FLASHLIGHT_DEG / 2), 0.4, 1.2);
    this.flashlight.position.set(0.35, 0.1, 0.3);
    this.flashlight.target.position.set(0, -0.5, 4);
    this.ball.squashG.add(this.flashlight, this.flashlight.target);
  }

  get out() {
    return this.state !== 'office' && this.state !== 'toDoor';
  }
  get busy() {
    return this.state !== 'office';
  }
  get pos() {
    return this.ball.pos;
  }

  /** Começa a correr atrás de alguém pego na farra. */
  startChase(w: Worker) {
    if (this.state === 'chase') return;
    if (this.cur) this.queue.unshift(this.cur);
    this.cur = null;
    this.chaseW = w;
    this.state = 'chase';
    this.chaseRepath = 0;
    this.chaseT = 0;
    this.ball.setEye('alert');
    this.ball.impulse(0.9);
    this.game.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'EI, VOCÊ!', 'ft-boss', 1.6);
    this.game.audio.play3D('yell', this.pos, 1.2);
  }

  /** Encerra a espera num ponto (ex.: impressora destravada). */
  endStay() {
    if (this.state === 'stay') this.timer = 0.5;
  }

  setFlashlight(on: boolean) {
    this.flashOn = on;
  }

  reset() {
    this.state = 'office';
    this.queue = [];
    this.cur = null;
    this.path = [];
    this.ball.setPos(this.home.x, this.home.z);
    this.ball.yaw = 0;
    this.ball.velocity.set(0, 0, 0);
    this.ball.setEye('normal');
    this.lastRondaEnd = -999;
    this.lastRondaStart = -999;
    this.game.office.doorOpen = 0;
    this.seenWarned.clear();
  }

  /** Inicia uma ronda com os alvos dados (sai da sala). */
  startRonda(targets: BossTarget[], reason: string) {
    if (this.busy) {
      // já fora: só acrescenta alvos na frente
      this.queue.unshift(...targets);
      return;
    }
    this.queue = targets;
    this.rondaReason = reason;
    this.state = 'toDoor';
    this.path = this.game.nav.find(this.pos, this.doorIn);
    this.lastRondaStart = this.game.time;
    this.seenWarned.clear();
  }

  /** Adiciona um alvo prioritário durante a ronda. */
  prioritize(t: BossTarget) {
    if (t.kind === 'desk' && this.cur?.kind === 'desk' && this.cur.w === t.w) return;
    if (t.kind === 'desk' && this.queue.some((q) => q.kind === 'desk' && q.w === t.w)) {
      this.queue = this.queue.filter((q) => !(q.kind === 'desk' && q.w === t.w));
    }
    this.queue.unshift(t);
  }

  /** Ruído ouvido. Retorna true se o chefe ouviu. */
  hear(p: THREE.Vector3, radius: number, src: Worker | null) {
    if (!this.out || this.state === 'check' || this.state === 'suspicious') return false;
    const mul = src && src.heat > B.HEAT_HOT ? 1.5 : 1;
    if (this.pos.distanceTo(p) > radius * mul) return false;
    const t: BossTarget = src ? { kind: 'desk', w: src, mode: 'check' } : { kind: 'point', p: p.clone(), stay: 2.5, why: 'noise' };
    if (src && this.cur?.kind === 'desk' && this.cur.w === src) return true;
    this.becomeSuspicious(t, p);
    return true;
  }

  private becomeSuspicious(t: BossTarget, look: THREE.Vector3) {
    if (this.state === 'suspicious') return;
    this.suspiciousOf = t;
    this.lookTarget = look.clone();
    this.state = 'suspicious';
    this.timer = 2;
    this.ball.setEye('alert');
    this.ball.impulse(0.6);
    const head = this.ball.headWorld().add(new THREE.Vector3(0, 1.2, 0));
    this.game.juice.text(head, '?', 'ft-boss', 1.6);
    this.game.audio.play3D('suspicious', this.pos, 1.2);
    if (this.kind === 'x9') {
      this.game.audio.play('yell', 0.8);
      this.game.subtitle('[X9 grita: "EI!"]', this.pos);
    } else this.game.subtitle('[chefe: "hm?"]', this.pos);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.ball.yaw), 0, Math.cos(this.ball.yaw));
  }

  /** Vê um ponto? (cone + alcance + linha de visão) */
  sees(p: THREE.Vector3, range: number = B.BOSS_VISION_RANGE, fovDeg: number = B.BOSS_VISION_DEG) {
    if (!this.out) return false;
    const d = new THREE.Vector3().subVectors(p, this.pos).setY(0);
    const dist = d.length();
    if (dist > range) return false;
    if (dist < 0.8) return true;
    d.divideScalar(dist);
    const f = this.forward();
    if (f.dot(d) < Math.cos(THREE.MathUtils.degToRad(fovDeg / 2))) return false;
    return this.game.office.lineOfSight(this.pos, p);
  }

  private nextTarget(): void {
    this.cur = this.queue.shift() ?? null;
    if (!this.cur) {
      this.state = 'return';
      this.path = this.game.nav.find(this.pos, this.doorOut).concat([this.doorIn.clone(), this.home.clone()]);
      return;
    }
    // alvo inválido (demitido) → próximo
    if (this.cur.kind === 'desk' && this.cur.w.fired) return this.nextTarget();
    const dest = this.cur.kind === 'desk' ? this.cur.w.desk.checkPos : this.cur.p;
    this.path = this.game.nav.find(this.pos, dest);
    this.state = 'walk';
  }

  private follow(dt: number, speedMul = 1) {
    const target = this.path[0];
    if (!target) return true;
    const to = new THREE.Vector3(target.x - this.pos.x, 0, target.z - this.pos.z);
    const d = to.length();
    const sp = this.spec.speed * speedMul;
    if (d < 0.15) {
      this.path.shift();
      return this.path.length === 0;
    }
    to.divideScalar(d);
    const step = Math.min(d, sp * dt);
    this.pos.addScaledVector(to, step);
    this.ball.velocity.copy(to).multiplyScalar(sp);
    const yaw = Math.atan2(to.x, to.z);
    this.ball.yaw = lerpAngle(this.ball.yaw, yaw, Math.min(1, dt * 8));
    // passos
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = this.state === 'chase' ? 0.26 : this.kind === 'x9' ? 0.3 : this.kind === 'dono' ? 0.7 : 0.48;
      if (this.kind === 'dono') {
        this.game.audio.play3D('keys', this.pos, 1.0, 0, 14);
        this.game.bossSound(this.pos, '[chaves tilintando]');
      } else {
        this.game.audio.play3D('step', this.pos, 1.2, this.kind === 'x9' ? 1 : 0, 30);
        this.game.bossSound(this.pos, this.kind === 'x9' ? '[passinhos rápidos]' : '[passos pesados]');
        this.ball.impulse(-0.12);
        this.game.juice.shake(this.state === 'chase' ? 0.05 : this.kind === 'chefe' ? 0.012 : 0);
      }
    }
    return false;
  }

  private face(p: THREE.Vector3, dt: number) {
    const yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.ball.yaw = lerpAngle(this.ball.yaw, yaw, Math.min(1, dt * 6));
  }

  update(dt: number) {
    const b = this.ball;
    b.velocity.multiplyScalar(0.8);
    // plataforma da sala do chefe
    const m = { x: this.pos.x + 15, z: this.pos.z + 10 };
    const plat = m.z < 2.4 && m.x > 12.5 && m.x < 17.5 ? 0.4 : 0;
    b.hoverHeight = 0.78 + plat / b.spec.scale;
    // lanterna
    const fl = this.flashOn && this.out ? 260 : 0;
    this.flashlight.intensity += (fl - this.flashlight.intensity) * Math.min(1, dt * 6);

    switch (this.state) {
      case 'office': {
        b.setEye('normal');
        this.face(W(15, 6), dt);
        break;
      }
      case 'toDoor': {
        if (this.follow(dt, 0.8)) {
          this.state = 'door';
          this.game.office.doorOpen = 1;
          this.game.onDoor(this);
          // espera na porta para garantir o aviso mínimo
          const first = this.queue[0];
          let travel = 3;
          if (first) {
            const dest = first.kind === 'desk' ? first.w.desk.checkPos : first.p;
            travel = this.game.nav.length(this.game.nav.find(this.doorOut, dest), this.doorOut) / this.spec.speed;
          }
          this.timer = Math.max(2.5, this.spec.warn - travel);
          this.path = [this.doorOut.clone()];
          b.setEye('alert');
        }
        break;
      }
      case 'door': {
        this.follow(dt, 0.6);
        this.timer -= dt;
        // olha o salão de um lado para o outro
        b.yaw = Math.sin(this.timer * 1.4) * 0.6;
        if (this.timer <= 0) {
          b.setEye('normal');
          this.nextTarget();
        }
        break;
      }
      case 'walk': {
        this.lookAround(dt);
        if (this.follow(dt)) {
          const c = this.cur!;
          if (c.kind === 'desk') {
            this.state = 'check';
            this.identified = false;
            this.checkT = 0;
            this.game.onCheckStart(this, c.w);
          } else {
            this.state = 'stay';
            this.timer = c.stay;
          }
        }
        break;
      }
      case 'suspicious': {
        this.timer -= dt;
        if (this.lookTarget) this.face(this.lookTarget, dt);
        if (this.timer <= 0) {
          b.setEye('normal');
          if (this.suspiciousOf) {
            if (this.cur) this.queue.unshift(this.cur);
            this.queue.unshift(this.suspiciousOf);
            this.suspiciousOf = null;
          }
          this.nextTarget();
        }
        break;
      }
      case 'stay': {
        this.timer -= dt;
        const c = this.cur;
        if (c && c.kind === 'point') this.face(c.why === 'printer' ? this.game.office.P.printer : c.why === 'kitchen' ? this.game.office.P.pizza : c.p, dt);
        this.lookAround(dt);
        if (this.timer <= 0) this.nextTarget();
        break;
      }
      case 'check': {
        const c = this.cur as Extract<BossTarget, { kind: 'desk' }>;
        this.face(c.w.desk.screenCenter, dt);
        b.setEye('alert');
        b.lookAt(c.w.desk.screenCenter);
        this.checkT += dt;
        const ident = c.mode === 'audit' ? this.spec.identify + 0.4 : this.spec.identify;
        const total = c.mode === 'audit' ? this.spec.check + 2 : this.spec.check;
        if (!this.identified && this.checkT >= ident) {
          this.identified = true;
          this.game.onIdentify(this, c.w, c.mode);
        } else if (this.identified && this.checkT < total) {
          this.game.onCheckHold(this, c.w);
        }
        if (this.checkT >= total || c.w.fired) {
          b.setEye('normal');
          this.game.onCheckEnd(this, c.w);
          this.nextTarget();
        }
        break;
      }
      case 'chase': {
        const w = this.chaseW;
        this.chaseT += dt;
        if (!w || w.fired) {
          this.chaseW = null;
          this.nextTarget();
          break;
        }
        b.setEye('alert');
        // chegou à mesa e sentou: confere a tela
        if (w.seated) {
          this.chaseW = null;
          this.prioritize({ kind: 'desk', w, mode: 'chase' });
          this.nextTarget();
          break;
        }
        this.chaseRepath -= dt;
        if (this.chaseRepath <= 0) {
          this.chaseRepath = 0.35;
          this.path = this.game.nav.find(this.pos, w.ball.pos);
        }
        this.follow(dt, Math.max(1.75, 5.1 / this.spec.speed));
        const reach = 0.42 * b.spec.scale * 0.9 + 0.45;
        if (this.pos.distanceTo(w.ball.pos) < reach) {
          this.chaseW = null;
          this.game.fire(w, this, 'Pego na farra (e não deu tempo de fugir)');
          this.nextTarget();
        } else if (this.chaseT > 14) {
          // cansou de correr
          this.chaseW = null;
          this.game.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'ufa... ufa...', 'ft-boss', 1.4);
          this.nextTarget();
        }
        break;
      }
      case 'return': {
        this.lookAround(dt);
        if (this.follow(dt)) {
          this.state = 'office';
          this.game.office.doorOpen = 0;
          this.lastRondaEnd = this.game.time;
          this.game.onBossBack(this);
        }
        // fecha a porta quando passa por ela
        if (this.path.length <= 1 && this.game.office.doorOpen > 0) {
          this.game.office.doorOpen = 0;
          this.game.audio.play3D('thud', this.doorIn, 0.8);
        }
        break;
      }
    }
    b.update(dt);
  }

  /** Visão durante a ronda: pune quem está em pé no cone e repara em telas suspeitas. */
  private lookAround(dt: number) {
    const g = this.game;
    let nearest: THREE.Vector3 | null = null;
    for (const w of g.workers) {
      if (w.fired) continue;
      const head = w.ball.pos;
      if (!w.seated) {
        if (this.sees(head)) {
          g.onSeen(w, this, dt);
          nearest = head;
          if (!this.seenWarned.has(w) && w.isPlayer && !g.attract) {
            this.seenWarned.add(w);
            g.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 1.2, 0)), '👁', 'ft-boss', 1.2);
          }
        }
        continue;
      }
      // tela proibida à vista (de costas para o chefe)
      if (g.isForbidden(w) && (!this.cur || this.cur.kind !== 'desk' || this.cur.w !== w)) {
        const range = this.flashOn ? B.FLASHLIGHT_RANGE : 10;
        const fov = this.flashOn ? Math.max(B.FLASHLIGHT_DEG, 50) : B.BOSS_VISION_DEG;
        const back = new THREE.Vector3().subVectors(this.pos, w.desk.seat).setY(0).normalize();
        const facing = new THREE.Vector3(Math.sin(w.desk.seatYaw), 0, Math.cos(w.desk.seatYaw));
        const behind = back.dot(facing) < -0.2;
        if ((behind || g.blackout) && this.sees(w.desk.screenCenter, range, fov)) {
          this.becomeSuspicious({ kind: 'desk', w, mode: 'check' }, w.desk.screenCenter);
          return;
        }
      }
    }
    if (nearest) this.ball.lookAt(nearest.clone().setY(1));
    else this.ball.lookForward();
  }
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
