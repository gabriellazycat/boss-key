import * as THREE from 'three';
import { B, ACT } from '../balance';
import { W } from '../world/Office';
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
      { id: 'fofoca1', pos: W(10.3, 16.55), look: W(10.9, 17.4, 1), act: 'fofoca', busy: null },
      { id: 'fofoca2', pos: W(11.7, 16.55), look: W(11.1, 17.4, 1), act: 'fofoca', busy: null },
      { id: 'cafe', pos: W(8.2, 18.6), look: W(8.2, 19.6, 1.2), act: null, busy: null },
      { id: 'bebedouro', pos: W(4.6, 18.55), look: W(4.6, 19.3, 1), act: null, busy: null },
      { id: 'sofa', pos: o.couch.seat.clone(), look: W(5.4, 22, 1), act: 'soneca', busy: null, lie: true },
      { id: 'arcade1', pos: o.arcades[0].stand.clone(), look: o.arcades[0].screenCenter, act: 'arcade', busy: null },
      { id: 'arcade2', pos: o.arcades[1].stand.clone(), look: o.arcades[1].screenCenter, act: 'arcade', busy: null },
      { id: 'pebolim', pos: o.foosball.stands[1].clone(), look: o.foosball.center, act: 'pebolim', busy: null },
      { id: 'maquina', pos: W(10.5, 25.4), look: W(10.5, 26.4, 1.2), act: 'maquina', busy: null },
      { id: 'tv', pos: W(3.9, 24.6), look: W(5, 20.6, 1), act: 'soneca', busy: null },
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
      e = id.startsWith('fofoca') ? '🗣' : id === 'cafe' ? '☕' : id === 'bebedouro' ? '💧' : id === 'sofa' || id === 'tv' ? '💤' : id.startsWith('arcade') ? '🕹' : id === 'pebolim' ? '⚽' : id === 'maquina' ? '🍫' : '';
    } else if (w.botState === 'returning' && w.botRun) e = '💦';
    if (e) this.g.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), e, 'ft-emote', 1.6);
  }

  spot(id: string) {
    return this.spots.find((s) => s.id === id)!;
  }

  private walkTo(w: Worker, p: THREE.Vector3) {
    w.botPath = this.g.nav.find(w.ball.pos, p);
  }

  private standUp(w: Worker) {
    w.seated = false;
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
    const bossOut = g.bosses.some((b) => b.busy && b.ball.root.visible);
    const unlocked = (g.attract ? ['tiro', 'video', 'pesca'] : g.day.unlocked.filter((a) => a === 'tiro' || a === 'video' || a === 'pesca')) as AppId[];
    for (const w of g.workers) {
      if (w.isPlayer && !g.attract) continue;
      const b = w.ball;
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
      }
      if (!w.fired) this.emote(w, dt);
      b.update(dt);
    }
  }
}
