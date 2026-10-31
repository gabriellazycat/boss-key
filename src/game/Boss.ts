import * as THREE from 'three';
import { Ball } from '../entities/Ball';
import { MAP, W, type Bathroom } from '../world/Office';
import { B, X9_PATROL, type BossKind } from '../balance';
import type { Worker } from './Worker';
import type { Game } from './Game';

export type BossTarget =
  | { kind: 'desk'; w: Worker; mode: 'check' | 'flagrante' | 'inspecao' | 'audit' | 'chase' }
  | { kind: 'point'; p: THREE.Vector3; stay: number; why: 'noise' | 'printer' | 'kitchen' | 'evidence' | 'patrol' | 'break' | 'away' };

type State = 'office' | 'toDoor' | 'door' | 'walk' | 'suspicious' | 'stay' | 'check' | 'return' | 'chase' | 'wait' | 'leave';

const rand = (r: readonly [number, number]) => r[0] + Math.random() * (r[1] - r[0]);

/** Tempo máximo de uma corrida (s): depois disso o chefe desiste e para. */
export const CHASE_TIME = 14;

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
  /** Perseguição por Suspeita cheia: não vale sentar na mesa, ao alcançar é demissão. */
  private chaseFire = false;
  private glareT = 0;
  private glareAt = new THREE.Vector3();
  private identified = false;
  private checkT = 0;
  readonly home: THREE.Vector3;
  private readonly doorIn = W(10, 3.2);
  private readonly doorOut = W(10, 4.9);
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
  /** Ronda o dia inteiro (X9 na segunda) em vez de sair da sala de tempos em tempos. */
  patrolling = false;
  /** Tempo do dia em que a ronda constante acaba (ele volta para a sala). */
  patrolEnd = 0;
  /** Pausa em andamento: indo/no café ou no banheiro. */
  onBreak: 'cafe' | 'wc' | null = null;
  private breakAt = 0;
  private wcBath: Bathroom | null = null;
  /** Papo: quem está conversando com ele e até quando (ele para, virado para quem fala). */
  talkW: Worker | null = null;
  private talkUntil = 0;

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

  /** Segundos restantes da corrida (0 fora dela). */
  /** Na pausa (parado no café ou dentro do banheiro) ou fora do andar: não vê nem ouve nada. */
  get blind() {
    if (this.away) return true;
    return this.onBreak !== null && this.state === 'stay' && this.cur?.kind === 'point' && this.cur.why === 'break';
  }

  /** Fora do andar (almoço fora, reunião em outro andar): sumiu pelo elevador. */
  get away() {
    return this.state === 'stay' && this.cur?.kind === 'point' && this.cur.why === 'away';
  }

  /** Ausência longa da agenda: anda até o elevador, some por `secs` e volta pelo mesmo caminho. */
  leaveFloor(secs: number, reason: string) {
    const t: BossTarget = { kind: 'point', p: W(15, 6.3), stay: secs, why: 'away' };
    if (this.busy) this.queue.push(t);
    else this.startRonda([t], reason);
  }

  /** Sensor da porta bipou: larga tudo e volta direto para a sala. */
  callBack() {
    if (!this.out || this.state === 'chase' || this.away) return;
    this.talkW = null;
    this.queue = [];
    this.cur = null;
    this.state = 'return';
    this.path = this.game.nav.find(this.pos, this.doorOut).concat([this.doorIn.clone(), this.home.clone()]);
    this.ball.setEye('alert');
    this.game.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 1.2, 0)), '!!', 'ft-boss', 1.2);
  }

  /** Papo: para e fica virado para `w` por `secs` (na sala ele não sai; no corredor a ronda espera). */
  talk(w: Worker, secs: number) {
    if (this.state === 'chase' || this.state === 'wait' || this.state === 'leave' || this.away) return false;
    this.talkW = w;
    this.talkUntil = this.game.time + secs;
    this.game.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 1.2, 0)), '🗣 ah, oi!', 'ft-emote', 1.6);
    return true;
  }

  /** Papo em andamento (segundos restantes, 0 = ninguém conversando). */
  get talkLeft() {
    return this.talkW ? Math.max(0, this.talkUntil - this.game.time) : 0;
  }

  /** Assusta quem está em `p`? Quem ronda o dia todo só assusta de perto, e nunca na pausa. */
  scares(p: THREE.Vector3, range = 10) {
    if (!this.patrolling) return true;
    return !this.blind && this.pos.distanceTo(p) < range;
  }

  /** Espera dentro do elevador (começo do dia). */
  waitAt(p: THREE.Vector3) {
    this.reset();
    this.state = 'wait';
    this.ball.setPos(p.x, p.z);
    this.ball.yaw = 0;
    // update() não roda no elevador: sem isto ele ficaria na altura do tablado da sala dele, "voando"
    this.ball.hoverHeight = 0.78;
    this.ball.snapHover();
  }

  /** Termina o tutorial do elevador: volta para a sala sem rondar (não vê nem pune ninguém no caminho). */
  leaveElevator() {
    this.state = 'leave';
    this.path = this.game.nav.find(this.pos, this.doorOut).concat([this.doorIn.clone(), this.home.clone()]);
    this.ball.setEye('normal');
  }

  /** 18:00: larga ronda, pausa ou perseguição e volta para a sala sem ver ninguém (o expediente acabou para ele também). */
  goHomeQuiet() {
    this.glareT = 0;
    this.patrolling = false;
    this.onBreak = null;
    this.wcBath = null;
    this.queue = [];
    this.cur = null;
    this.ball.setProp(null);
    this.setFlashlight(false);
    if (this.game.office.inBossRoom(this.pos)) {
      this.state = 'office';
      this.path = [];
      return;
    }
    this.leaveElevator();
  }

  /** Começa a ronda que não acaba (X9 na segunda). `breakFirst`: sai direto para uma pausa, dando tempo ao jogador. */
  startPatrol(breakFirst = false) {
    this.patrolling = true;
    this.patrolEnd = this.game.time + rand(X9_PATROL.duration);
    this.onBreak = null;
    this.breakAt = this.game.time + rand(X9_PATROL.breakEvery);
    this.queue = breakFirst ? [this.breakTarget()] : this.game.patrolTargets();
    this.cur = null;
    this.state = 'walk';
    this.lastRondaStart = this.game.time;
    this.seenWarned.clear();
  }

  get chaseLeft() {
    return this.state === 'chase' ? Math.max(0, CHASE_TIME - this.chaseT) : 0;
  }

  /** Para e encara alguém (demissão). */
  glare(p: THREE.Vector3, secs: number) {
    this.glareAt.copy(p);
    this.glareT = secs;
  }

  /** Começa a correr atrás de alguém pego na farra. */
  startChase(w: Worker, fire = false) {
    // fora do andar (almoço fora, reunião no 11º) ele não vê nem persegue ninguém
    if (this.state === 'chase' || this.away) return;
    if (this.cur) this.queue.unshift(this.cur);
    this.cur = null;
    this.chaseW = w;
    this.chaseFire = fire;
    this.state = 'chase';
    this.chaseRepath = 0;
    this.chaseT = 0;
    this.ball.setEye('alert');
    this.ball.impulse(0.9);
    this.game.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'EI, VOCÊ!', 'ft-boss', 1.6);
    this.game.audio.play3D('yell', this.pos, 1.2);
  }

  /** Levou uma bolinha sem ver de onde: vai investigar o ponto do arremesso. */
  investigate(p: THREE.Vector3) {
    const t: BossTarget = { kind: 'point', p: p.clone(), stay: 2.5, why: 'noise' };
    if (this.out && this.state !== 'chase') this.becomeSuspicious(t, p);
    else if (!this.busy) this.startRonda([t], 'bonk');
    else this.prioritize(t);
    this.ball.impulse(0.9);
    this.ball.setEye('alert');
  }

  /** Para onde está por `secs` segundos (atendendo o telefone, conversando com uma visita) e depois segue a ronda. */
  distract(secs: number, why: 'ramal' | 'visita') {
    if (!this.out || this.state === 'chase' || this.state === 'wait' || this.state === 'leave') return false;
    if (this.cur) this.queue.unshift(this.cur);
    this.cur = { kind: 'point', p: this.pos.clone(), stay: secs, why: 'break' };
    this.state = 'stay';
    this.timer = secs;
    this.path = [];
    this.game.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 1.2, 0)), why === 'ramal' ? '📞 alô?' : '🗣 ah, oi!', 'ft-emote', 1.6);
    return true;
  }

  /** Encerra a espera num ponto (ex.: impressora destravada). */
  endStay() {
    if (this.state === 'stay') this.timer = 0.5;
  }

  get flashlightOn() {
    return this.flashOn;
  }

  setFlashlight(on: boolean) {
    this.flashOn = on;
  }

  reset() {
    this.talkW = null;
    this.patrolling = false;
    this.onBreak = null;
    this.wcBath = null;
    this.ball.setProp(null);
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
    if (!this.out || this.blind || this.state === 'wait' || this.state === 'check' || this.state === 'suspicious') return false;
    if (this.pos.distanceTo(p) > radius) return false;
    const t: BossTarget = src ? { kind: 'desk', w: src, mode: 'check' } : { kind: 'point', p: p.clone(), stay: 2.5, why: 'noise' };
    if (src && this.cur?.kind === 'desk' && this.cur.w === src) return true;
    this.becomeSuspicious(t, p);
    return true;
  }

  private becomeSuspicious(t: BossTarget, look: THREE.Vector3) {
    if (this.state === 'suspicious' || this.state === 'wait') return;
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
    if (!this.out || this.blind || this.state === 'wait') return false;
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
    if (this.patrolling && this.onBreak && this.cur?.kind === 'point' && this.cur.why === 'break') this.endBreak();
    if (this.patrolling && !this.queue.length && this.game.time >= this.patrolEnd) this.patrolling = false;
    if (this.patrolling && !this.queue.length) this.queue = this.game.time >= this.breakAt ? [this.breakTarget()] : this.game.patrolTargets();
    this.cur = this.queue.shift() ?? null;
    if (!this.cur) {
      this.state = 'return';
      this.path = this.game.nav.find(this.pos, this.doorOut).concat([this.doorIn.clone(), this.home.clone()]);
      return;
    }
    // alvo inválido (demitido) → próximo
    if (this.cur.kind === 'desk' && this.cur.w.fired) return this.nextTarget();
    // flagrante por Suspeita cheia: em vez de ir à mesa, sai atrás de quem estourou
    if (this.cur.kind === 'desk' && this.cur.mode === 'flagrante') {
      const w = this.cur.w;
      this.cur = null;
      this.state = 'walk';
      this.startChase(w, true);
      return;
    }
    const dest = this.cur.kind === 'desk' ? this.cur.w.desk.checkPos : this.cur.p;
    this.path = this.game.nav.find(this.pos, dest);
    this.state = 'walk';
  }

  /** Escolhe a pausa: café na cozinha ou banheiro mais perto. */
  private breakTarget(): BossTarget {
    const o = this.game.office;
    const cafe = Math.random() < 0.5;
    this.onBreak = cafe ? 'cafe' : 'wc';
    this.ball.setProp(cafe ? 'mug' : 'roll');
    const stay = rand(X9_PATROL.breakTime);
    if (cafe) return { kind: 'point', p: W(4.3, 21.25), stay, why: 'break' };
    this.wcBath = o.nearestBath(this.pos);
    return { kind: 'point', p: this.wcBath.out.clone(), stay, why: 'break' };
  }

  /** Chegou na pausa: no banheiro ele entra (some lá dentro), no café fica de costas para o salão. */
  private beginBreak() {
    const g = this.game;
    if (this.onBreak === 'wc' && this.wcBath) {
      const bath = this.wcBath;
      g.audio.play3D('thud', bath.entry, 0.8);
      const inside = bath.stallFront.clone().lerp(bath.entry, 0.55);
      this.ball.setPos(inside.x, inside.z);
    } else {
      g.audio.play3D('pour', g.office.P.coffee, 1.1);
      g.subtitle('[cafeteira passando café]', g.office.P.coffee);
    }
  }

  private endBreak() {
    const g = this.game;
    if (this.onBreak === 'wc' && this.wcBath) {
      g.audio.play3D('flush', this.wcBath.hidePos, 1.2);
      g.subtitle('[descarga]', this.wcBath.entry);
      g.audio.play3D('thud', this.wcBath.entry, 0.8);
      this.ball.setPos(this.wcBath.out.x, this.wcBath.out.z);
    }
    this.onBreak = null;
    this.wcBath = null;
    this.ball.setProp(null);
    this.breakAt = g.time + rand(X9_PATROL.breakEvery);
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
      if (this.kind === 'dono') this.game.audio.play3D('keys', this.pos, 1.0, 0, 14);
      else {
        this.game.audio.play3D('step', this.pos, 1.2, this.kind === 'x9' ? 1 : 0, 30);
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
    if (this.glareT > 0) {
      this.glareT -= dt;
      this.face(this.glareAt, dt * 2);
      b.lookAt(this.glareAt.clone().setY(1.2));
      b.velocity.multiplyScalar(0.8);
      b.update(dt);
      return;
    }
    // papo: parado, virado para quem fala (o cone de visão aponta para ele; quem está atrás fica livre)
    if (this.talkW) {
      const w = this.talkW;
      if (this.game.time >= this.talkUntil || w.fired || w.ball.pos.distanceTo(this.pos) > 3.2 || this.state === 'chase') {
        this.talkW = null;
        this.game.onTalkEnd(this, w);
      } else {
        this.face(w.ball.pos, dt * 2);
        b.lookAt(w.ball.headWorld());
        b.velocity.multiplyScalar(0.7);
        if (Math.random() < dt * 1.5) b.impulse(0.1);
        b.update(dt);
        return;
      }
    }
    b.velocity.multiplyScalar(0.8);
    // plataforma da sala do chefe
    const m = { x: this.pos.x + MAP.ox, z: this.pos.z + MAP.oz };
    const plat = m.z > 0.2 && m.z < 2.4 && m.x > 7.5 && m.x < 12.5 ? 0.4 : 0;
    b.hoverHeight = 0.78 + plat / b.spec.scale;
    // lanterna
    const fl = this.flashOn && this.out ? 260 : 0;
    this.flashlight.intensity += (fl - this.flashlight.intensity) * Math.min(1, dt * 6);

    switch (this.state) {
      case 'office': {
        b.setEye('normal');
        this.face(W(10, 6), dt);
        break;
      }
      case 'wait': {
        b.yaw = lerpAngle(b.yaw, 0, Math.min(1, dt * 3));
        break;
      }
      case 'leave': {
        if (this.follow(dt, 0.8)) {
          this.state = 'office';
          this.game.office.doorOpen = 0;
          // o que chegou enquanto voltava (boas-vindas, auditoria...) não se perde
          if (this.queue.length) this.startRonda(this.queue, 'fila');
        } else if (this.path.length <= 1 && this.game.office.doorOpen > 0) {
          this.game.office.doorOpen = 0;
          this.game.audio.play3D('thud', this.doorIn, 0.8);
        } else if (this.path.length === 2) this.game.office.doorOpen = 1;
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
          // a dobradiça e o tapete somam; a porta lubrificada tira, mas o aviso total não fica abaixo de MIN_WARN
          this.timer = Math.max(B.MIN_WARN - travel, Math.max(2.5, this.spec.warn - travel) + this.game.doorWarnBonus);
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
        if (!this.cur) {
          this.nextTarget();
          break;
        }
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
            if (c.why === 'break') this.beginBreak();
            if (c.why === 'away') {
              // entra no elevador e some do andar
              this.ball.root.visible = false;
              this.game.openElevatorDoorBriefly();
              this.game.subtitle('[ding! o chefe desceu pelo elevador]', this.pos);
            }
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
        if (this.blind) {
          // pausa: de costas para o salão (café) ou de frente para a pia (banheiro)
          const P = this.game.office.P;
          this.face(this.onBreak === 'cafe' ? P.coffee : this.wcBath ? this.wcBath.stallFront : this.pos, dt);
          b.lookForward();
          if (this.onBreak === 'cafe' && Math.random() < dt * 0.5) b.impulse(0.1);
        } else {
          if (c && c.kind === 'point') this.face(c.why === 'printer' ? this.game.office.P.printer : c.why === 'kitchen' ? this.game.office.P.pizza : c.p, dt);
          this.lookAround(dt);
        }
        if (this.timer <= 0) {
          if (this.away) {
            this.ball.root.visible = true;
            this.game.openElevatorDoorBriefly();
            this.game.subtitle('[ding! o chefe voltou pelo elevador]', this.pos);
            this.game.audio.play3D('ding', this.pos, 0.9);
          }
          this.nextTarget();
        }
        break;
      }
      case 'check': {
        const c = this.cur as Extract<BossTarget, { kind: 'desk' }>;
        this.face(c.w.desk.screenCenter, dt);
        b.setEye('alert');
        b.lookAt(c.w.desk.screenCenter);
        this.checkT += dt;
        const ident = (c.mode === 'audit' ? this.spec.identify + 0.4 : this.spec.identify) * (c.w.isPlayer ? this.game.identifyMul : 1);
        const total = c.mode === 'audit' ? this.spec.check + 2 : this.spec.check;
        if (!this.identified && this.checkT >= ident) {
          this.identified = true;
          this.game.onIdentify(this, c.w, c.mode);
        } else if (this.identified && this.checkT < total) {
          this.game.onCheckHold(this, c.w, dt);
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
        if (this.chaseFire && w.sus < B.SUS_MAX) this.chaseFire = false; // baixou a Suspeita: volta à perseguição comum
        // sumiu no banheiro: vai até a porta, desconfia e desiste
        if (w.hidden) {
          this.chaseW = null;
          const door = this.game.office.nearestBath(w.ball.pos).out.clone();
          this.queue.unshift({ kind: 'point', p: door, stay: 3, why: 'noise' });
          this.game.onLostInBathroom(w);
          this.nextTarget();
          break;
        }
        // chegou à mesa e sentou: confere a tela
        if (w.seated && !this.chaseFire) {
          this.chaseW = null;
          this.prioritize({ kind: 'desk', w, mode: 'chase' });
          this.nextTarget();
          break;
        }
        this.chaseRepath -= dt;
        if (this.chaseRepath <= 0) {
          this.chaseRepath = 0.35;
          this.path = this.game.nav.find(this.pos, w.ball.pos, true);
        }
        this.follow(dt, Math.max(1.75, 5.1 / this.spec.speed));
        const reach = 0.42 * b.spec.scale * 0.9 + 0.45;
        if (this.pos.distanceTo(w.ball.pos) < reach) {
          this.chaseW = null;
          this.game.fire(w, this, this.chaseFire ? 'Suspeita no máximo (flagrante)' : 'Pego na farra (e não deu tempo de fugir)');
          this.nextTarget();
        } else if (this.chaseT > CHASE_TIME) {
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
      if (w.fired || w.hidden) continue;
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
