import { App, ball, rr, text, clamp, type Rect, type ScreenInput, MONO } from './common';
import { ACT, TIRO_KILL_FUN, TIRO_MAX_TIME } from '../balance';

interface Enemy { x: number; y: number; vx: number; vy: number; r: number; hp: number; speed: number; hit: number; kind: 0 | 1 }
interface Bullet { x: number; y: number; vx: number; vy: number; life: number }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }

const AW = 800;
const AH = 470;

/** BALL OPS — tiro top-down paródico. 1 vida, até 35 s. */
export class Tiro extends App {
  readonly id = 'tiro' as const;
  readonly title = 'BALL OPS: Ofensiva Global';
  readonly forbidden = true;
  readonly accent = '#e0832b';
  readonly icon = '✦';
  state: 'menu' | 'play' | 'over' = 'menu';
  private px = AW / 2;
  private py = AH / 2;
  private pvx = 0;
  private pvy = 0;
  private aim = 0;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private parts: Part[] = [];
  private spawnT = 0;
  private fireT = 0;
  private time = 0;
  private kills = 0;
  private earned = 0;
  private shake = 0;
  private flash = 0;
  private result = '';
  private mx = 0;
  private my = 0;
  private stars: { x: number; y: number; s: number }[] = [];
  private combo = 0;
  private comboT = 0;

  constructor(host: ConstructorParameters<typeof App>[0]) {
    super(host);
    for (let i = 0; i < 60; i++) this.stars.push({ x: Math.random() * AW, y: Math.random() * AH, s: Math.random() });
  }

  badge() {
    return this.state === 'play' ? 'AO VIVO' : `${this.host.stock.tiro}×`;
  }

  resetDay() {
    this.state = 'menu';
    this.running = false;
  }

  private start() {
    if (this.host.stock.tiro <= 0 || this.host.tiroCooldown > 0) return;
    this.host.emit({ t: 'consume', what: 'tiro' });
    this.state = 'play';
    this.running = true;
    this.px = AW / 2;
    this.py = AH / 2;
    this.pvx = this.pvy = 0;
    this.enemies = [];
    this.bullets = [];
    this.time = 0;
    this.kills = 0;
    this.earned = 0;
    this.spawnT = 1;
    this.combo = 0;
    this.host.emit({ t: 'sfx', name: 'confirm' });
  }

  private end(win: boolean) {
    this.state = 'over';
    this.running = false;
    this.result = win ? 'SOBREVIVEU!' : 'ABATIDO';
    this.host.emit({ t: 'sfx', name: win ? 'fanfare' : 'boom', param: 0.6, spatial: !win });
    if (!win) this.burst(this.px, this.py, '#ffd23f', 40);
    this.shake = 1;
  }

  private gain(v: number) {
    const left = ACT.tiro.funMax - this.earned;
    const g = Math.min(left, v);
    if (g <= 0) return;
    this.earned += g;
    this.host.emit({ t: 'fun', v: g });
  }

  private burst(x: number, y: number, c: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 260;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.3 + Math.random() * 0.5, c, s: 2 + Math.random() * 4 });
    }
  }

  update(dt: number, inp: ScreenInput) {
    // coordenadas da arena a partir do cursor (r salvo no draw)
    this.mx = (inp.x - this.ax) / this.as;
    this.my = (inp.y - this.ay) / this.as;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 0;
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 3;
      p.vy *= 1 - dt * 3;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    if (this.state !== 'play') {
      if (inp.pressed) this.start();
      return;
    }
    this.time += dt;
    this.gain(ACT.tiro.fun * dt);
    // jogador
    const ax = (inp.key('KeyD') ? 1 : 0) - (inp.key('KeyA') ? 1 : 0);
    const ay = (inp.key('KeyS') ? 1 : 0) - (inp.key('KeyW') ? 1 : 0);
    const len = Math.hypot(ax, ay) || 1;
    this.pvx += ((ax / len) * 260 - this.pvx) * Math.min(1, dt * 12);
    this.pvy += ((ay / len) * 260 - this.pvy) * Math.min(1, dt * 12);
    this.px = clamp(this.px + this.pvx * dt, 16, AW - 16);
    this.py = clamp(this.py + this.pvy * dt, 16, AH - 16);
    this.aim = Math.atan2(this.my - this.py, this.mx - this.px);
    this.fireT -= dt;
    if (inp.down && this.fireT <= 0) {
      this.fireT = 0.14;
      const sp = 720;
      const spread = (Math.random() - 0.5) * 0.06;
      this.bullets.push({ x: this.px + Math.cos(this.aim) * 20, y: this.py + Math.sin(this.aim) * 20, vx: Math.cos(this.aim + spread) * sp, vy: Math.sin(this.aim + spread) * sp, life: 0 });
      this.flash = 0.6;
      this.shake = Math.min(1, this.shake + 0.08);
      this.host.emit({ t: 'sfx', name: 'pew', spatial: true });
      this.host.emit({ t: 'flash', color: '#ffb347', v: 0.6 });
    }
    // spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const rate = Math.max(0.4, 1.35 - this.time * 0.027);
      this.spawnT = rate;
      const edge = Math.floor(Math.random() * 4);
      const x = edge === 0 ? -20 : edge === 1 ? AW + 20 : Math.random() * AW;
      const y = edge === 2 ? -20 : edge === 3 ? AH + 20 : Math.random() * AH;
      const tank = this.time > 10 && Math.random() < 0.22;
      this.enemies.push({ x, y, vx: 0, vy: 0, r: tank ? 22 : 14, hp: tank ? 4 : 1, speed: tank ? 50 : 62 + Math.random() * 40 + this.time * 1.6, hit: 0, kind: tank ? 1 : 0 });
    }
    // inimigos
    for (const e of this.enemies) {
      const dx = this.px - e.x;
      const dy = this.py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.vx += ((dx / d) * e.speed - e.vx) * Math.min(1, dt * 3);
      e.vy += ((dy / d) * e.speed - e.vy) * Math.min(1, dt * 3);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.hit = Math.max(0, e.hit - dt * 8);
      if (d < e.r + 12) {
        this.end(false);
        return;
      }
    }
    // balas
    for (const b of this.bullets) {
      b.life += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const e of this.enemies) {
        if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
          e.hp--;
          e.hit = 1;
          b.life = 99;
          e.vx += b.vx * 0.08;
          e.vy += b.vy * 0.08;
          this.burst(b.x, b.y, '#fff3b0', 5);
          if (e.hp <= 0) {
            this.kills++;
            this.combo++;
            this.comboT = 1.5;
            this.gain(TIRO_KILL_FUN * (e.kind ? 3 : 1));
            this.burst(e.x, e.y, e.kind ? '#ff4d6d' : '#ff8a3d', e.kind ? 40 : 22);
            this.shake = Math.min(1, this.shake + (e.kind ? 0.6 : 0.3));
            this.host.emit({ t: 'sfx', name: 'boom', param: e.kind ? 0.4 : 0, spatial: true });
            this.host.emit({ t: 'flash', color: '#ff6b3d', v: 1 });
          }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life < 1.2 && b.x > -20 && b.x < AW + 20 && b.y > -20 && b.y < AH + 20);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    if (this.time >= TIRO_MAX_TIME) this.end(true);
  }

  private ax = 0;
  private ay = 0;
  private as = 1;

  draw(g: CanvasRenderingContext2D, r: Rect, t: number) {
    const s = Math.min(r.w / AW, r.h / AH);
    const ox = r.x + (r.w - AW * s) / 2;
    const oy = r.y + (r.h - AH * s) / 2;
    this.ax = ox;
    this.ay = oy;
    this.as = s;
    g.fillStyle = '#10131c';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.save();
    const sh = this.shake * this.shake * 10;
    g.translate(ox + (Math.random() - 0.5) * sh, oy + (Math.random() - 0.5) * sh);
    g.scale(s, s);
    g.beginPath();
    g.rect(0, 0, AW, AH);
    g.clip();
    // chão
    const grd = g.createRadialGradient(AW / 2, AH / 2, 50, AW / 2, AH / 2, AW * 0.7);
    grd.addColorStop(0, '#2a3350');
    grd.addColorStop(1, '#141826');
    g.fillStyle = grd;
    g.fillRect(0, 0, AW, AH);
    g.strokeStyle = 'rgba(120,150,255,0.08)';
    g.lineWidth = 1;
    for (let x = 0; x < AW; x += 40) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, AH);
      g.stroke();
    }
    for (let y = 0; y < AH; y += 40) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(AW, y);
      g.stroke();
    }
    for (const st of this.stars) {
      g.fillStyle = `rgba(255,255,255,${0.15 + 0.25 * Math.sin(t * 2 + st.s * 9) ** 2})`;
      g.fillRect(st.x, st.y, 2, 2);
    }
    if (this.state === 'play' || this.state === 'over') {
      for (const e of this.enemies) {
        ball(g, e.x, e.y, e.r, e.hit > 0 ? '#ffffff' : e.kind ? '#7a2238' : '#c0392b', 0, '#111');
      }
      for (const b of this.bullets) {
        g.strokeStyle = '#fff3b0';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
        g.stroke();
      }
      if (this.state === 'play') {
        // jogador + arma
        g.save();
        g.translate(this.px, this.py);
        g.rotate(this.aim);
        g.fillStyle = '#2a2f3a';
        g.fillRect(8, -4, 22, 8);
        if (this.flash > 0.3) {
          g.fillStyle = '#ffd23f';
          g.beginPath();
          g.arc(34, 0, 9 * this.flash, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
        ball(g, this.px, this.py, 14, '#7F93A6', Math.cos(this.aim), '#2F5FA8');
        // mira
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(this.mx, this.my, 10, 0, Math.PI * 2);
        g.moveTo(this.mx - 16, this.my);
        g.lineTo(this.mx - 6, this.my);
        g.moveTo(this.mx + 6, this.my);
        g.lineTo(this.mx + 16, this.my);
        g.stroke();
      }
    }
    for (const p of this.parts) {
      g.globalAlpha = 1 - p.life / p.max;
      g.fillStyle = p.c;
      g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    g.globalAlpha = 1;
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,200,120,${this.flash * 0.08})`;
      g.fillRect(0, 0, AW, AH);
    }
    // HUD do minigame
    if (this.state === 'play') {
      text(g, `⏱ ${Math.max(0, TIRO_MAX_TIME - this.time).toFixed(1)}`, 16, 22, 20, '#fff', 'left', 700, MONO);
      text(g, `ABATES ${this.kills}`, AW - 16, 22, 20, '#ffd23f', 'right', 700, MONO);
      text(g, `+${this.earned.toFixed(1)} FUN`, AW / 2, 22, 18, '#3ddc97', 'center', 700, MONO);
      if (this.combo > 1) text(g, `${this.combo}× COMBO`, AW / 2, 52, 22 + Math.min(this.combo, 8) * 2, '#ff8a3d', 'center', 700);
    } else {
      g.fillStyle = 'rgba(10,12,20,0.6)';
      g.fillRect(0, 0, AW, AH);
      const bob = Math.sin(t * 3) * 4;
      text(g, 'BALL OPS', AW / 2, AH / 2 - 90 + bob, 72, '#ff8a3d', 'center', 700);
      text(g, 'OFENSIVA GLOBAL', AW / 2, AH / 2 - 40, 22, '#ffd23f', 'center', 600);
      if (this.state === 'over') text(g, `${this.result} · ${this.kills} abates · +${this.earned.toFixed(1)} FUN`, AW / 2, AH / 2 + 10, 22, '#fff', 'center', 600);
      const cd = this.host.tiroCooldown;
      const msg = this.host.stock.tiro <= 0 ? 'sem partidas por hoje' : cd > 0 ? `nova partida em ${Math.ceil(cd)} s` : 'CLIQUE PARA JOGAR';
      rr(g, AW / 2 - 170, AH / 2 + 50, 340, 54, 27);
      g.fillStyle = this.host.stock.tiro > 0 && cd <= 0 ? '#e0832b' : '#444a5a';
      g.fill();
      text(g, msg, AW / 2, AH / 2 + 77, 22, '#fff', 'center', 700);
      text(g, `WASD move · mouse mira · clique atira · ${this.host.stock.tiro} partida(s)`, AW / 2, AH / 2 + 130, 15, '#aab3c8', 'center', 500);
    }
    g.restore();
  }
}
