import * as THREE from 'three';
import { Ball } from '../entities/Ball';
import { LOBBY, LOBBY_DZ, ELEV_F, W } from '../world/Office';
import type { Look } from '../characters/designs';
import { lerpAngle } from './Boss';
import type { Game } from './Game';

/** Quem trabalha no térreo e quem só passa: só enfeite (não vê, não pune, não conversa). */
interface Extra {
  ball: Ball;
  /** Parado no posto (recepção, catraca, balcão) olhando para `face`; ou andando por `route`. */
  post?: { pos: THREE.Vector3; yaw: number };
  route?: THREE.Vector3[];
  /** Andando: índice do próximo ponto, sentido, espera no fim (escondido no elevador ou longe na rua). */
  i: number;
  dir: 1 | -1;
  wait: number;
  speed: number;
  /** Só aparece de manhã (`am`), só à noite (`pm`) ou sempre. */
  when: 'am' | 'pm' | 'all';
  /** Some nas pontas da rota (entrou no elevador de enfeite, foi embora pela rua). */
  hideAtEnds: boolean;
}

const LOOKS: Look[] = [
  { species: 'telinha', color: '#5b6476', tie: '#c0392b', variant: 'bia' },
  { species: 'telinha', color: '#3e4a5e', tie: '#ffd23f', variant: 'caio' },
  { species: 'telinha', color: '#6d5a4a', tie: '#2f5fa8', variant: 'voce' },
  { species: 'telinha', color: '#8a4f7d', tie: '#ffd23f', variant: 'bia' },
  { species: 'telinha', color: '#3d7a6a', tie: '#fff6e6', variant: 'caio' },
  { species: 'telinha', color: '#b0703a', tie: '#2b3246', variant: 'voce' },
];

/** Figurantes do saguão: recepcionista, segurança, vendedor da lojinha, gente indo e vindo e gente passando na rua. */
export class LobbyCrowd {
  private list: Extra[] = [];
  readonly root = new THREE.Group();
  private evening = false;

  constructor(g: Game) {
    g.r.scene.add(this.root);
    const post = (look: number, x: number, z: number, yaw: number, when: Extra['when'] = 'all') =>
      this.make(look, { post: { pos: W(x, z), yaw }, when });
    post(3, 23.75, -27.4, -Math.PI / 2);
    post(4, 19.6, -30.65, 0);
    post(5, 6.4, -27.9, Math.PI / 2);
    // gente que chega e pega os elevadores de enfeite (some na porta deles e volta depois)
    const door = W(15, LOBBY.south + 1.8);
    const inGate = W(15, -28.0);
    const outGate = W(15, -31.0);
    this.make(0, { route: [door, W(15, LOBBY.south - 1.2), W(15.2, -25.5), inGate, outGate, W(10.5, LOBBY_DZ + ELEV_F + 0.6)], hideAtEnds: true, wait: 1.5, when: 'am' });
    this.make(1, { route: [W(19.5, LOBBY_DZ + ELEV_F + 0.6), W(15.3, -31.0), W(14.8, -28.0), W(14.6, -25), W(15, LOBBY.south - 1.2), door], hideAtEnds: true, wait: 6, when: 'all' });
    this.make(2, { route: [W(10.5, LOBBY_DZ + ELEV_F + 0.6), W(14.8, -31.0), W(15.2, -28.0), W(15.4, -24.6), W(15, LOBBY.south - 1.2), door], hideAtEnds: true, wait: 11, when: 'pm' });
    // um visitante esperando na recepção e alguém lendo na espera (de manhã)
    post(1, 20.9, -26.6, -Math.PI / 2 + 0.3, 'am');
    // na rua: gente passando pela calçada (atrás do vidro)
    for (let k = 0; k < 5; k++) {
      const z = LOBBY.south + 2.6 + (k % 2) * 1.1;
      const a = W(-14, z);
      const b = W(44, z);
      this.make(k, { route: k % 2 ? [b, a] : [a, b], hideAtEnds: true, wait: 2 + k * 3.5, speed: 1.0 + (k % 3) * 0.25, when: 'all' });
    }
  }

  private make(look: number, o: Partial<Extra> & { post?: Extra['post']; route?: THREE.Vector3[] }) {
    const ball = new Ball('employee', { ...LOOKS[look % LOOKS.length] });
    this.root.add(ball.root);
    const e: Extra = { ball, post: o.post, route: o.route, i: 0, dir: 1, wait: o.wait ?? 0, speed: o.speed ?? 1.25, when: o.when ?? 'all', hideAtEnds: o.hideAtEnds ?? false };
    if (e.post) {
      ball.setPos(e.post.pos.x, e.post.pos.z);
      ball.yaw = e.post.yaw;
    } else if (e.route) {
      ball.setPos(e.route[0].x, e.route[0].z);
      ball.root.visible = !e.hideAtEnds || e.wait <= 0;
    }
    ball.hoverHeight = 0.78;
    ball.snapHover();
    this.list.push(e);
  }

  /** Posições de quem está à vista (para a porta automática abrir). */
  actors(out: THREE.Vector3[]) {
    for (const e of this.list) if (e.ball.root.visible && this.root.visible) out.push(e.ball.pos);
  }

  /** Corpos dos figurantes (o espelho da cabine recorta quem não aparece pela porta). */
  roots(out: THREE.Object3D[]) {
    for (const e of this.list) out.push(e.ball.root);
  }

  /** Só roda com o térreo em cena; `evening` troca o elenco (de manhã chega gente, à noite sai). */
  update(dt: number, evening: boolean) {
    if (evening !== this.evening) {
      this.evening = evening;
      for (const e of this.list) {
        const on = e.when === 'all' || (e.when === 'pm') === evening;
        if (e.post) e.ball.root.visible = on;
        else if (!on) e.ball.root.visible = false;
      }
    }
    for (const e of this.list) {
      const on = e.when === 'all' || (e.when === 'pm') === evening;
      if (!on) continue;
      const b = e.ball;
      if (e.post) {
        b.velocity.multiplyScalar(0.8);
        b.yaw = lerpAngle(b.yaw, e.post.yaw, Math.min(1, dt * 3));
        if (Math.random() < dt * 0.5) b.impulse(0.1);
        b.update(dt);
        continue;
      }
      const r = e.route!;
      if (e.wait > 0) {
        e.wait -= dt;
        if (e.wait <= 0) b.root.visible = true;
        continue;
      }
      const target = r[e.i];
      const to = new THREE.Vector3(target.x - b.pos.x, 0, target.z - b.pos.z);
      const d = to.length();
      if (d < 0.12) {
        const next = e.i + e.dir;
        if (next < 0 || next >= r.length) {
          // chegou na ponta: some (elevador ou rua) e volta pelo mesmo caminho depois de um tempo
          e.dir = e.dir > 0 ? -1 : 1;
          if (e.hideAtEnds) {
            b.root.visible = false;
            e.wait = 4 + Math.random() * 9;
          } else e.wait = 1 + Math.random() * 3;
          e.i += e.dir;
          b.velocity.set(0, 0, 0);
        } else e.i = next;
        continue;
      }
      to.divideScalar(d);
      b.pos.addScaledVector(to, Math.min(d, e.speed * dt));
      b.velocity.copy(to).multiplyScalar(e.speed);
      b.yaw = lerpAngle(b.yaw, Math.atan2(to.x, to.z), Math.min(1, dt * 8));
      b.lookForward();
      b.update(dt);
    }
  }

  show(on: boolean) {
    this.root.visible = on;
  }
}
