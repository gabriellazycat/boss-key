import { ball, clamp, text, MONO, type ScreenInput } from './common';

/** O que o jogo oferece ao campeonato: os outros jogadores (multi) e para onde mandar o que acontece. */
export interface ArenaLink {
  /** Campeonato de hoje rolando (missão do dia). */
  readonly on: boolean;
  /** Jogadores de verdade na arena (multi): posição em coordenadas da arena. */
  peers(): { id: string; name: string; x: number; y: number; a: number; alive: boolean }[];
  /** Tiros dos outros desde a última chamada. */
  shots(): { by: string; x: number; y: number; a: number }[];
  /** Meu estado (o app manda ~10×/s) e um tiro meu. */
  send(x: number, y: number, a: number, alive: boolean): void;
  shot(x: number, y: number, a: number): void;
  /** Um abate do time: um bot que eu derrubei, ou eu derrubado por um colega (quem cai confirma). */
  kill(): void;
  opened(): void;
}

interface Fighter {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  a: number;
  hp: number;
  dead: number;
  fireT: number;
  tx: number;
  ty: number;
  bot: boolean;
}
interface Shot { x: number; y: number; vx: number; vy: number; life: number; by: string }

export const ARENA_W = 800;
export const ARENA_H = 470;
const HP = 3;
const RESPAWN = 2;
const BOT_NAMES: [string, string][] = [['Bia', '#ff7eb6'], ['Caio', '#4da3ff'], ['Duda', '#ffd23f'], ['Fê', '#3ddc97']];

/**
 * Campeonato de Ball Ops (v0.10, missão "farra"): arena top-down todos contra todos. No multi os colegas de verdade
 * se enfrentam (cada um decide a própria morte); os bots completam a sala. Cada abate de humano soma na missão do time.
 * Só conta com o app aberto — a ronda do chefe obriga todo mundo a esconder junto.
 */
export class Arena {
  me: Fighter = this.spawn({ id: 'me', name: 'você', color: '#7F93A6', bot: false });
  private bots: Fighter[] = [];
  private shots: Shot[] = [];
  private sendT = 0;
  kills = 0;
  deaths = 0;
  private flash = 0;
  private feed: { t: number; s: string }[] = [];

  constructor(private link: ArenaLink, private onFun: (v: number) => void, private sfx: (n: string) => void) {}

  start() {
    this.me = this.spawn({ id: 'me', name: 'você', color: '#7F93A6', bot: false });
    this.shots = [];
    this.kills = 0;
    this.deaths = 0;
    // bots completam a arena até 4 lutadores
    const humans = this.link.peers().length + 1;
    this.bots = BOT_NAMES.slice(0, Math.max(1, 4 - humans)).map(([name, color]) => this.spawn({ id: `bot-${name}`, name, color, bot: true }));
    this.link.opened();
  }

  private spawn(f: Pick<Fighter, 'id' | 'name' | 'color' | 'bot'>): Fighter {
    return { ...f, x: 60 + Math.random() * (ARENA_W - 120), y: 60 + Math.random() * (ARENA_H - 120), a: 0, hp: HP, dead: 0, fireT: 1, tx: ARENA_W / 2, ty: ARENA_H / 2 };
  }

  update(dt: number, inp: ScreenInput, mx: number, my: number) {
    const me = this.me;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.feed = this.feed.filter((f) => (f.t -= dt) > 0);
    // eu
    if (me.dead > 0) {
      me.dead -= dt;
      if (me.dead <= 0) Object.assign(me, this.spawn(me), { id: 'me' });
    } else {
      const ax = (inp.key('KeyD') ? 1 : 0) - (inp.key('KeyA') ? 1 : 0);
      const ay = (inp.key('KeyS') ? 1 : 0) - (inp.key('KeyW') ? 1 : 0);
      const len = Math.hypot(ax, ay) || 1;
      me.x = clamp(me.x + (ax / len) * 240 * dt, 16, ARENA_W - 16);
      me.y = clamp(me.y + (ay / len) * 240 * dt, 16, ARENA_H - 16);
      me.a = Math.atan2(my - me.y, mx - me.x);
      me.fireT -= dt;
      if (inp.down && me.fireT <= 0) {
        me.fireT = 0.22;
        this.fire(me);
        this.link.shot(me.x, me.y, me.a);
        this.sfx('pew');
      }
    }
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.1;
      this.link.send(me.x, me.y, me.a, me.dead <= 0);
    }
    // tiros dos colegas (multi)
    for (const s of this.link.shots()) this.shots.push({ x: s.x + Math.cos(s.a) * 20, y: s.y + Math.sin(s.a) * 20, vx: Math.cos(s.a) * 640, vy: Math.sin(s.a) * 640, life: 0, by: s.by });
    // bots: andam até um ponto e atiram no mais perto
    const peers = this.link.peers().filter((p) => p.alive);
    for (const b of this.bots) {
      if (b.dead > 0) {
        b.dead -= dt;
        if (b.dead <= 0) Object.assign(b, this.spawn(b));
        continue;
      }
      if (Math.hypot(b.tx - b.x, b.ty - b.y) < 20) {
        b.tx = 40 + Math.random() * (ARENA_W - 80);
        b.ty = 40 + Math.random() * (ARENA_H - 80);
      }
      const d = Math.hypot(b.tx - b.x, b.ty - b.y) || 1;
      b.x += ((b.tx - b.x) / d) * 150 * dt;
      b.y += ((b.ty - b.y) / d) * 150 * dt;
      const targets = [...(me.dead <= 0 ? [{ x: me.x, y: me.y }] : []), ...peers, ...this.bots.filter((o) => o !== b && o.dead <= 0)];
      let best: { x: number; y: number } | null = null;
      let bd = 1e9;
      for (const t of targets) {
        const dd = Math.hypot(t.x - b.x, t.y - b.y);
        if (dd < bd) {
          bd = dd;
          best = t;
        }
      }
      if (best) b.a = Math.atan2(best.y - b.y, best.x - b.x) + (Math.random() - 0.5) * 0.25;
      b.fireT -= dt;
      if (best && bd < 420 && b.fireT <= 0) {
        b.fireT = 0.7 + Math.random() * 0.7;
        this.fire(b);
      }
    }
    // tiros
    for (const s of this.shots) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // eu levo de bots e de colegas (quem cai confirma)
      if (s.by !== 'me' && me.dead <= 0 && Math.hypot(s.x - me.x, s.y - me.y) < 16) {
        s.life = 99;
        me.hp--;
        this.flash = 1;
        if (me.hp <= 0) {
          me.dead = RESPAWN;
          this.deaths++;
          const human = !s.by.startsWith('bot-');
          if (human) this.link.kill();
          this.feed.push({ t: 3, s: `💀 você caiu (${human ? this.link.peers().find((p) => p.id === s.by)?.name ?? 'colega' : s.by.slice(4)})` });
          this.sfx('boom');
        }
        continue;
      }
      // meus tiros (e dos bots) derrubam bots
      for (const b of this.bots) {
        if (b.dead > 0 || s.by === b.id || Math.hypot(s.x - b.x, s.y - b.y) >= 16) continue;
        s.life = 99;
        b.hp--;
        if (b.hp <= 0) {
          b.dead = RESPAWN;
          if (s.by === 'me') {
            this.kills++;
            this.link.kill();
            this.onFun(0.6);
            this.feed.push({ t: 3, s: `🎯 você derrubou ${b.name}` });
            this.sfx('boom');
          }
        }
        break;
      }
    }
    this.shots = this.shots.filter((s) => s.life < 1.2 && s.x > -20 && s.x < ARENA_W + 20 && s.y > -20 && s.y < ARENA_H + 20);
  }

  private fire(f: Fighter) {
    this.shots.push({ x: f.x + Math.cos(f.a) * 20, y: f.y + Math.sin(f.a) * 20, vx: Math.cos(f.a) * 640, vy: Math.sin(f.a) * 640, life: 0, by: f.id });
  }

  draw(g: CanvasRenderingContext2D, mx: number, my: number) {
    g.fillStyle = '#16203a';
    g.fillRect(0, 0, ARENA_W, ARENA_H);
    g.fillStyle = 'rgba(255,210,63,0.06)';
    for (let i = 0; i < 6; i++) g.fillRect(120 * i + 40, 0, 40, ARENA_H);
    const all: { x: number; y: number; a: number; name: string; color: string; alive: boolean; hp?: number }[] = [
      ...this.bots.map((b) => ({ ...b, alive: b.dead <= 0 })),
      ...this.link.peers().map((p) => ({ ...p, color: '#ff8a3d' })),
    ];
    for (const f of all) {
      if (!f.alive) continue;
      ball(g, f.x, f.y, 14, f.color, Math.cos(f.a), '#111');
      text(g, f.name, f.x, f.y - 24, 13, '#fff', 'center', 700);
    }
    if (this.me.dead <= 0) {
      ball(g, this.me.x, this.me.y, 14, this.me.color, Math.cos(this.me.a), '#2F5FA8');
      for (let k = 0; k < this.me.hp; k++) g.fillRect(this.me.x - 14 + k * 10, this.me.y + 20, 8, 4);
    }
    g.strokeStyle = '#fff3b0';
    g.lineWidth = 4;
    for (const s of this.shots) {
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - s.vx * 0.02, s.y - s.vy * 0.02);
      g.stroke();
    }
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,60,60,${this.flash * 0.25})`;
      g.fillRect(0, 0, ARENA_W, ARENA_H);
    }
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(mx, my, 10, 0, Math.PI * 2);
    g.stroke();
    text(g, '🏆 CAMPEONATO', 16, 22, 20, '#ffd23f', 'left', 800);
    text(g, `ABATES ${this.kills} · QUEDAS ${this.deaths}`, ARENA_W - 16, 22, 18, '#fff', 'right', 700, MONO);
    if (this.me.dead > 0) text(g, `voltando em ${this.me.dead.toFixed(1)} s`, ARENA_W / 2, ARENA_H / 2, 28, '#fff', 'center', 800);
    this.feed.forEach((f, i) => text(g, f.s, ARENA_W / 2, 54 + i * 22, 16, '#ffd23f', 'center', 700));
  }
}
