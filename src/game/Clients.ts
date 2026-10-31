import * as THREE from 'three';
import { CLIENTS } from '../balance';
import { Ball } from '../entities/Ball';
import { W } from '../world/Office';
import { dq, dqa, q, qa, type ClientState } from '../net/Protocol';
import type { Game } from './Game';

type State = 'arrive' | 'wait' | 'enter' | 'meet' | 'leave' | 'gone';

interface Client {
  ball: Ball;
  state: State;
  path: THREE.Vector3[];
  t: number;
  look: number;
  /** No convidado: onde o host diz que o cliente está (o boneco anda até lá). */
  net?: { x: number; z: number; yaw: number };
}

const LOOKS = [
  { species: 'telinha', color: '#5b6476', tie: '#c0392b', variant: 'bia' },
  { species: 'telinha', color: '#3e4a5e', tie: '#ffd23f', variant: 'caio' },
  { species: 'telinha', color: '#6d5a4a', tie: '#2f5fa8', variant: 'voce' },
] as const;

/**
 * Clientes: sobem pelo elevador, vão até a sala do chefe e ficam em reunião com ele. Enquanto um cliente está lá
 * dentro, o chefe não sai (janela segura) — e da sua mesa dá para ver o cliente entrar e sair pela porta.
 * Se o chefe estiver fora quando o cliente chega, ele espera na porta.
 */
export class Clients {
  private list: Client[] = [];
  private schedule: number[] = [];
  private readonly elevOut = W(15, 6.4);
  private readonly doorWait = W(10.9, 5.4);
  private readonly doorOut = W(10, 4.9);
  private readonly doorIn = W(10, 3.2);
  private readonly chair = W(9.1, 3.0);

  constructor(private g: Game) {}

  /** Algum cliente em reunião com o chefe agora? */
  get meeting() {
    return this.list.some((c) => c.state === 'meet' || c.state === 'enter');
  }

  /** `times`: as chegadas marcadas na agenda do chefe (sem elas, sorteia como antes). */
  resetDay(count: number, times: number[] = []) {
    for (const c of this.list) c.ball.root.removeFromParent();
    this.list = [];
    const n = Math.min(CLIENTS.maxPerDay, count);
    const d = this.g.duration;
    this.schedule = [];
    if (times.length) {
      this.schedule = [...times].sort((a, b) => a - b).slice(0, n);
      return;
    }
    let at = (CLIENTS.firstAt[0] + Math.random() * (CLIENTS.firstAt[1] - CLIENTS.firstAt[0])) * d;
    for (let i = 0; i < n; i++) {
      this.schedule.push(at);
      at += (CLIENTS.gap[0] + Math.random() * (CLIENTS.gap[1] - CLIENTS.gap[0])) * d;
    }
  }

  private spawn() {
    const g = this.g;
    const look = Math.floor(Math.random() * LOOKS.length);
    const ball = new Ball('employee', { ...LOOKS[look] });
    ball.setPos(this.elevOut.x, this.elevOut.z - 1.2);
    ball.yaw = 0;
    g.r.scene.add(ball.root);
    g.openElevatorDoorBriefly();
    g.subtitle('[um cliente chegou pelo elevador]', this.elevOut);
    this.list.push({ ball, state: 'arrive', path: g.nav.find(ball.pos, this.doorWait), t: 0, look });
  }

  // ------------------------------------------------------------------ multi: o host manda, o convidado só mostra
  netStates(): ClientState[] {
    return this.list.map((c) => [q(c.ball.pos.x), q(c.ball.pos.z), qa(c.ball.yaw), c.look, c.ball.root.visible ? 1 : 0]);
  }

  applyNet(states: ClientState[]) {
    states.forEach(([x, z, yaw, look, vis], i) => {
      let c = this.list[i];
      if (!c) {
        const ball = new Ball('employee', { ...LOOKS[look % LOOKS.length] });
        ball.setPos(dq(x), dq(z));
        this.g.r.scene.add(ball.root);
        this.g.subtitle('[um cliente chegou pelo elevador]', this.elevOut);
        c = { ball, state: 'arrive', path: [], t: 0, look };
        this.list.push(c);
      }
      c.net = { x: dq(x), z: dq(z), yaw: dqa(yaw) };
      c.ball.root.visible = vis === 1;
    });
  }

  /** Convidado: anda até a última posição que o host mandou (sem simular nada). */
  updateNet(dt: number) {
    for (const c of this.list) {
      if (c.net) {
        const p = c.ball.pos;
        const k = Math.min(1, dt * 8);
        const dx = (c.net.x - p.x) * k;
        const dz = (c.net.z - p.z) * k;
        p.x += dx;
        p.z += dz;
        c.ball.velocity.set(dx / Math.max(dt, 1e-3), 0, dz / Math.max(dt, 1e-3));
        c.ball.yaw = c.net.yaw;
      }
      c.ball.update(dt);
    }
  }

  /** Anda pelo caminho; devolve true ao chegar. */
  private walk(c: Client, dt: number) {
    const p = c.ball.pos;
    while (c.path.length && p.distanceTo(c.path[0]) < 0.15) c.path.shift();
    if (!c.path.length) {
      c.ball.velocity.set(0, 0, 0);
      return true;
    }
    const to = new THREE.Vector3().subVectors(c.path[0], p).setY(0);
    const d = to.length();
    to.divideScalar(d);
    p.addScaledVector(to, Math.min(d, CLIENTS.speed * dt));
    c.ball.velocity.copy(to).multiplyScalar(CLIENTS.speed);
    c.ball.yaw = Math.atan2(to.x, to.z);
    return false;
  }

  update(dt: number) {
    const g = this.g;
    while (this.schedule.length && g.time >= this.schedule[0]) {
      this.schedule.shift();
      this.spawn();
    }
    const main = g.bosses[0];
    const home = main && !main.busy;
    for (const c of this.list) {
      switch (c.state) {
        case 'arrive':
          if (this.walk(c, dt)) c.state = 'wait';
          break;
        case 'wait':
          // espera o chefe estar na sala (e a porta livre)
          c.ball.yaw = Math.PI;
          if (home && !g.office.doorOpen) {
            c.state = 'enter';
            c.path = [this.doorOut.clone(), this.doorIn.clone(), this.chair.clone()];
            g.office.doorOpen = 1;
            g.audio.play3D('door', this.doorOut, 0.6);
            g.subtitle('[cliente entrou na sala do chefe]', this.doorOut);
          }
          break;
        case 'enter':
          if (this.walk(c, dt)) {
            c.state = 'meet';
            c.t = CLIENTS.meeting[0] + Math.random() * (CLIENTS.meeting[1] - CLIENTS.meeting[0]);
            g.office.doorOpen = 0;
            g.audio.play3D('thud', this.doorIn, 0.6);
          }
          break;
        case 'meet':
          c.ball.yaw = Math.PI;
          c.t -= dt;
          if (Math.random() < dt * 0.5) g.audio.play3D('blah', c.ball.pos, 0.4, 0);
          if (c.t <= 0) {
            c.state = 'leave';
            c.path = [this.doorIn.clone(), this.doorOut.clone(), ...g.nav.find(this.doorOut, this.elevOut), W(15, 4.6)];
            g.office.doorOpen = 1;
            g.subtitle('[o cliente está saindo da sala do chefe]', this.doorOut);
          }
          break;
        case 'leave':
          if (g.office.doorOpen && c.ball.pos.distanceTo(this.doorOut) < 0.6 && c.path.length && c.path[0].z > this.doorOut.z) g.office.doorOpen = 0;
          if (this.walk(c, dt)) {
            c.state = 'gone';
            c.ball.root.visible = false;
            g.openElevatorDoorBriefly();
          }
          break;
      }
      c.ball.update(dt);
    }
  }
}
