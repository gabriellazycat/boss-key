import * as THREE from 'three';
import { B, ACT } from '../balance';
import { ELEV_SPOTS, W } from '../world/Office';
import type { AppId } from '../apps/common';
import type { Game } from './Game';
import type { Spot, Worker } from './Worker';
import { lerpAngle } from './Boss';

/** Cérebro dos colegas: trabalham, enrolam na tela e saem para dar umas voltas pelo escritório. */
export class Bots {
  readonly spots: Spot[];

  constructor(private g: Game) {
    const o = g.office;
    this.spots = [
      { id: 'fofoca1', pos: W(9.1, 18.2), look: W(9.8, 18.6, 1), act: 'fofoca', busy: null },
      { id: 'fofoca2', pos: W(10.9, 18.2), look: W(10.2, 18.6, 1), act: 'fofoca', busy: null },
      { id: 'cafe', pos: W(4, 21.3), look: W(4, 22.4, 1.2), act: null, busy: null },
      { id: 'bebedouro', pos: W(1, 20.7), look: W(0.4, 21.2, 1), act: null, busy: null },
      { id: 'sofa', pos: o.couch.seat.clone(), look: W(15.5, 20.6, 1), act: 'soneca', busy: null, lie: true },
      { id: 'maquina', pos: W(18.5, 20.7), look: W(19.5, 20.7, 1.2), act: 'maquina', busy: null },
      { id: 'tv', pos: W(13.2, 21.6), look: W(15.5, 20.6, 1), act: 'soneca', busy: null },
    ];
  }

  private emoteT = new Map<Worker, number>();

  reset() {
    for (const s of this.spots) s.busy = null;
    this.emoteT.clear();
  }

  /** Balãozinho de emoji acima da cabeça (vida + leitura de quem está enrolando). */
  private emote(w: Worker, dt: number) {
    const t = (this.emoteT.get(w) ?? 3 + Math.random() * 6) - dt;
    if (t > 0) {
      this.emoteT.set(w, t);
      return;
    }
    this.emoteT.set(w, 5 + Math.random() * 7);
    let e = '';
    if (w.botState === 'seated') e = w.botScreen === 'planilha' ? (Math.random() < 0.3 ? '📊' : '') : w.botScreen === 'tiro' ? '🎮' : w.botScreen === 'video' ? '😂' : '🎣';
    else if (w.botState === 'atSpot' && w.botSpot) {
      const id = w.botSpot.id;
      e = id.startsWith('fofoca') ? '🗣' : id === 'cafe' ? '☕' : id === 'bebedouro' ? '💧' : id === 'sofa' || id === 'tv' ? '💤' : id === 'maquina' ? '🍫' : '';
    } else if (w.botState === 'returning' && w.botRun) e = '💦';
    else if (w.botState === 'waiting') e = ['🎵', '☕', '🥱', '📱', ''][Math.floor(Math.random() * 5)];
    else if (w.botState === 'goingHome' || w.botState === 'leavingLobby') e = ['🏠', '👋', '😮‍💨', '🎒', ''][Math.floor(Math.random() * 5)];
    if (e) this.g.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), e, 'ft-emote', 1.6);
  }

  spot(id: string) {
    return this.spots.find((s) => s.id === id)!;
  }

  /** Começo do dia: em pé dentro do elevador, esperando a porta abrir. */
  waitInElevator(w: Worker, p: THREE.Vector3) {
    w.seated = false;
    w.botState = 'waiting';
    w.botPath = [];
    w.desk.chairYaw = w.desk.seatYaw + Math.PI;
    w.ball.setPos(p.x, p.z);
    w.ball.hoverHeight = 0.78;
    w.ball.snapHover();
    w.ball.yaw = 0;
    w.ball.velocity.set(0, 0, 0);
    w.ball.root.visible = true;
  }

  /** A porta abriu: cada um sai para a sua mesa, um de cada vez. */
  releaseFromElevator() {
    let i = 0;
    for (const w of this.g.workers)
      if (!w.isPlayer && !w.remote && w.botState === 'waiting') {
        w.botState = 'exiting';
        w.botTimer = 0.15 + i++ * 0.45;
      }
  }

  /** 18:00: cada um larga o que está fazendo e vai andando para o seu lugar na cabine (demitido já foi embora). */
  goHome() {
    let k = 0;
    for (const w of this.g.workers) {
      if (w.isPlayer || w.remote) continue;
      const spot = ELEV_SPOTS[k++ % ELEV_SPOTS.length];
      if (w.fired) {
        w.botState = 'gone';
        w.ball.root.visible = false;
        continue;
      }
      if (w.botSpot) {
        w.botSpot.busy = null;
        w.botSpot = null;
      }
      w.ball.lying = 0;
      w.ball.setSleeping(false);
      w.ball.setEye('happy');
      if (w.seated) this.standUp(w);
      w.botState = 'goingHome';
      w.botRun = false;
      // uns se espreguiçam antes, outros já estão de mochila nas costas
      w.botTimer = 0.2 + Math.random() * 2.2;
      this.walkTo(w, spot);
    }
  }

  /** A porta do térreo abriu: quem desceu junto sai pela rua, um de cada vez, e some lá fora. */
  leaveLobby(path: THREE.Vector3[]) {
    let i = 0;
    for (const w of this.g.workers)
      if (!w.isPlayer && !w.remote && w.botState === 'waiting' && w.ball.root.visible) {
        w.botState = 'leavingLobby';
        w.botTimer = 0.4 + i++ * 0.7;
        const side = i % 2 ? 1 : -1;
        w.botPath = path.map((p, j) => (j === path.length - 1 ? p.clone().add(new THREE.Vector3(side * (3 + i), 0, 0)) : p.clone().add(new THREE.Vector3(side * 0.3, 0, 0))));
      }
  }

  /** Alarme de incêndio: todo mundo larga o que faz e espera no hall do elevador por `secs`, depois volta para a mesa. */
  evacuate(at: THREE.Vector3, secs: number) {
    let i = 0;
    for (const w of this.g.workers) {
      if (w.isPlayer || w.remote || w.fired || !w.ball.root.visible) continue;
      if (w.botSpot) {
        w.botSpot.busy = null;
        w.botSpot = null;
      }
      w.ball.lying = 0;
      w.ball.setSleeping(false);
      if (w.seated) this.standUp(w);
      w.botState = 'evacuating';
      w.botRun = true;
      w.botTimer = secs;
      const k = i++;
      this.walkTo(w, at.clone().add(new THREE.Vector3((k % 3) - 1, 0, Math.floor(k / 3) * 0.9)));
      this.g.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), '🚨', 'ft-emote', 1.3);
    }
  }

  /** Susto coletivo (alarme do elevador etc.). */
  startle() {
    for (const w of this.g.workers)
      if (!w.isPlayer && !w.remote && !w.fired) {
        w.ball.impulse(0.9);
        w.ball.setEye('alert');
        this.g.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), '😱', 'ft-emote', 1.3);
        setTimeout(() => !w.fired && w.ball.eye === 'alert' && w.ball.setEye('normal'), 1500);
      }
  }

  private walkTo(w: Worker, p: THREE.Vector3) {
    w.botPath = this.g.nav.find(w.ball.pos, p);
  }

  private standUp(w: Worker) {
    w.seated = false;
    // cadeira vazia: encosto virado para o PC
    w.desk.chairYaw = w.desk.seatYaw + Math.PI;
    w.ball.setPos(w.desk.standPos.x, w.desk.standPos.z);
    w.ball.hoverHeight = 0.78;
    w.ball.impulse(0.4);
  }

  private sit(w: Worker) {
    w.botState = 'seated';
    w.botRun = false;
    this.g.seatBall(w);
    w.ball.impulse(0.3);
    w.ball.setEye('normal');
    w.botTimer = 18 + Math.random() * 30;
    w.botScreen = 'planilha';
  }

  /** Manda de volta para a mesa (porta do chefe). */
  private goBack(w: Worker, run: boolean) {
    if (w.botSpot) {
      w.botSpot.busy = null;
      w.botSpot = null;
    }
    w.ball.lying = 0;
    w.ball.setSleeping(false);
    w.botState = 'returning';
    w.botRun = run;
    this.walkTo(w, w.desk.standPos);
  }

  private follow(w: Worker, dt: number, speed: number) {
    const b = w.ball;
    const t = w.botPath[0];
    if (!t) {
      b.velocity.multiplyScalar(0.7);
      return true;
    }
    const to = new THREE.Vector3(t.x - b.pos.x, 0, t.z - b.pos.z);
    const d = to.length();
    if (d < 0.12) {
      w.botPath.shift();
      return w.botPath.length === 0;
    }
    to.divideScalar(d);
    b.velocity.lerp(to.clone().multiplyScalar(speed), Math.min(1, dt * 8));
    b.pos.addScaledVector(b.velocity, dt);
    b.yaw = lerpAngle(b.yaw, Math.atan2(to.x, to.z), Math.min(1, dt * 10));
    return false;
  }

  update(dt: number) {
    const g = this.g;
    // o X9 em ronda só assusta quem está perto (e ninguém quando ele está na pausa)
    const scared = (w: Worker) => g.bosses.some((b) => b.busy && b.ball.root.visible && b.scares(w.ball.pos));
    // os colegas bots jogam qualquer coisa: o sorteio de diversões é só do jogador
    const unlocked: AppId[] = ['tiro', 'video', 'pesca'];
    for (const w of g.workers) {
      if ((w.isPlayer || w.remote) && !g.attract) continue;
      const b = w.ball;
      const bossOut = scared(w);
      w.act = null;
      w.physical = false;
      if (w.fired) {
        b.velocity.multiplyScalar(0.9);
        b.update(dt);
        continue;
      }
      switch (w.botState) {
        case 'seated': {
          w.botTimer -= dt;
          if (bossOut) {
            if (w.botScreen !== 'planilha') {
              if (w.botReact < 0) {
                w.botReact = B.BOT_REACT_MIN + Math.random() * (B.BOT_REACT_MAX - B.BOT_REACT_MIN);
                w.botFailRonda = Math.random() < B.BOT_FAIL_CHANCE;
              }
              w.botReact -= dt;
              if (w.botReact <= 0 && !w.botFailRonda) {
                w.botScreen = 'planilha';
                b.impulse(0.45);
                b.setEye('alert');
                setTimeout(() => !w.fired && b.eye === 'alert' && b.setEye('normal'), 1200);
              }
            }
          } else {
            w.botReact = -1;
            if (w.botTimer <= 0) {
              const r = Math.random();
              const free = this.spots.filter((s) => !s.busy);
              if (r < 0.38 && free.length && g.time > 8) {
                // sai para dar uma volta
                const pick = free[Math.floor(Math.random() * free.length)];
                pick.busy = w;
                w.botSpot = pick;
                w.botState = 'walking';
                w.botScreen = 'planilha';
                this.standUp(w);
                this.walkTo(w, pick.pos);
              } else if (w.botScreen === 'planilha' && unlocked.length && r < 0.75) {
                w.botScreen = unlocked[Math.floor(Math.random() * unlocked.length)];
                w.botTimer = 6 + Math.random() * 10;
              } else {
                w.botScreen = 'planilha';
                w.botTimer = 8 + Math.random() * 16;
              }
            }
          }
          const playing = w.botScreen !== 'planilha';
          if (playing) w.act = w.botScreen as never;
          if (Math.random() < dt * (playing ? 3 : 5)) b.impulse(playing ? 0.12 : -0.05);
          b.lookAt(playing ? w.desk.screenCenter : w.desk.screenCenter.clone().setY(1.0));
          b.yaw = w.desk.seatYaw;
          break;
        }
        case 'walking': {
          if (bossOut && !g.attract) {
            this.goBack(w, true);
            break;
          }
          if (this.follow(w, dt, 2.4)) {
            w.botState = 'atSpot';
            w.botSpotT = 10 + Math.random() * 14;
            if (w.botSpot?.lie) {
              b.lying = 1;
              b.setSleeping(true);
              b.setPos(w.botSpot.pos.x, w.botSpot.pos.z);
              b.hoverHeight = 0.7;
            }
          }
          b.lookForward();
          break;
        }
        case 'atSpot': {
          const s = w.botSpot!;
          w.botSpotT -= dt;
          w.act = s.act;
          w.physical = !!s.act;
          const yaw = Math.atan2(s.look.x - b.pos.x, s.look.z - b.pos.z);
          if (!s.lie) b.yaw = lerpAngle(b.yaw, yaw, Math.min(1, dt * 6));
          else b.yaw = Math.PI;
          b.velocity.multiplyScalar(0.8);
          if (s.act && !s.lie && Math.random() < dt * 4) b.impulse(0.15);
          b.lookAt(s.look);
          if (s.act) {
            const spec = ACT[s.act];
            if (s.act === 'fofoca' || s.act === 'maquina') g.addFun(w, (spec.fun / 8) * dt);
            else g.addFun(w, spec.fun * dt);
          }
          if (bossOut && !g.attract) {
            if (w.botReact < 0) {
              w.botReact = 1.2 + Math.random() * 1.6;
              w.botFailRonda = Math.random() < B.BOT_FAIL_CHANCE;
            }
            w.botReact -= dt;
            if (w.botReact <= 0) {
              if (!w.botFailRonda) {
                b.setEye('alert');
                b.impulse(0.6);
                g.juice.text(b.headWorld().add(new THREE.Vector3(0, 0.7, 0)), '!', 'ft-boss', 0.9);
                this.goBack(w, true);
              } else w.botReact = 4; // vacilou: continua mais um pouco
            }
          } else {
            w.botReact = -1;
            if (w.botSpotT <= 0) this.goBack(w, false);
          }
          break;
        }
        case 'returning': {
          if (this.follow(w, dt, w.botRun ? 4.3 : 2.4)) this.sit(w);
          break;
        }
        case 'waiting': {
          // no elevador: de frente para a porta, olhando o display de andar
          b.velocity.multiplyScalar(0.8);
          b.yaw = lerpAngle(b.yaw, 0, Math.min(1, dt * 3));
          // o display fica em cima da porta da cabine em que ele está (a de cima ou a do térreo)
          b.lookAt(g.office.P.elevatorOut.clone().setY(2.4).setZ(b.pos.z + 3));
          if (Math.random() < dt * 0.6) b.impulse(0.12);
          break;
        }
        case 'exiting': {
          w.botTimer -= dt;
          if (w.botTimer <= 0) this.goBack(w, false);
          break;
        }
        case 'goingHome': {
          w.botTimer -= dt;
          if (w.botTimer > 0) {
            b.velocity.multiplyScalar(0.8);
            break;
          }
          if (this.follow(w, dt, 2.3)) w.botState = 'waiting';
          b.lookForward();
          break;
        }
        case 'leavingLobby': {
          w.botTimer -= dt;
          if (w.botTimer > 0) {
            b.velocity.multiplyScalar(0.8);
            break;
          }
          if (this.follow(w, dt, 2.1)) {
            w.botState = 'gone';
            b.root.visible = false;
          }
          b.lookForward();
          break;
        }
        case 'evacuating': {
          w.botTimer -= dt;
          if (this.follow(w, dt, w.botRun ? 3.6 : 2.4)) {
            w.botRun = false;
            b.lookAt(g.office.P.elevatorOut.clone().setY(1.6));
          } else b.lookForward();
          if (w.botTimer <= 0) this.goBack(w, false);
          break;
        }
        case 'gone':
          continue;
      }
      // olhar para o telefone que toca / dancinha da meta
      if (w.glanceT > 0) {
        w.glanceT -= dt;
        b.lookAt(w.glanceAt);
      }
      if (w.danceT > 0) {
        w.danceT -= dt;
        const ph = w.danceT * 9;
        if (Math.sin(ph) > 0.92) b.impulse(0.35);
        if (!w.seated) b.yaw += Math.sin(ph * 0.5) * dt * 4;
        b.setEye('happy');
        if (w.danceT <= 0) b.setEye('normal');
      }
      if (!w.fired) this.emote(w, dt);
      b.update(dt);
    }
  }
}
