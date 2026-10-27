import { App, ball, rr, text, type Rect, type ScreenInput, MONO } from './common';
import { ACT } from '../balance';

const CLIPS = [
  { cap: 'POV: sexta, 17h59 🕺', bg: ['#ff6a88', '#ff99ac'] },
  { cap: 'bola tenta pular a mesa 💀', bg: ['#6a82fb', '#fc5c7d'] },
  { cap: 'receita: café em 3 s ☕', bg: ['#f7971e', '#ffd200'] },
  { cap: 'chefe reage ao meu Excel 😱', bg: ['#11998e', '#38ef7d'] },
];

/** CLIPCLOP — vídeos curtos. O áudio vaza (8 m) sem fones. */
export class Video extends App {
  readonly id = 'video' as const;
  readonly title = 'ClipClop — Para Você';
  readonly forbidden = true;
  readonly accent = '#ff3d77';
  readonly icon = '▶';
  playing = false;
  private clip = 0;
  private clipT = 0;
  private earned = 0;
  private hearts: { x: number; y: number; t: number }[] = [];
  private likes = 1200 + Math.floor(Math.random() * 9000);

  badge() {
    return `${Math.ceil(this.host.stock.video)}s`;
  }

  resetDay() {
    this.playing = false;
    this.running = false;
    this.earned = 0;
  }

  onShow() {
    if (this.host.stock.video > 0) this.playing = true;
  }
  onHide() {
    this.playing = false;
    this.running = false;
  }

  update(dt: number, inp: ScreenInput) {
    if (inp.pressed) {
      if (this.host.stock.video > 0) this.playing = !this.playing;
      this.host.emit({ t: 'sfx', name: 'click' });
    }
    if (this.host.stock.video <= 0) this.playing = false;
    this.running = this.playing;
    for (const h of this.hearts) {
      h.t += dt;
      h.y -= dt * 120;
    }
    this.hearts = this.hearts.filter((h) => h.t < 1.4);
    if (!this.playing) return;
    this.host.stock.video = Math.max(0, this.host.stock.video - dt);
    const v = Math.min(ACT.video.fun * dt, ACT.video.funMax - this.earned);
    if (v > 0) {
      this.earned += v;
      this.host.emit({ t: 'fun', v });
    }
    this.clipT += dt;
    if (Math.random() < dt * 2.5) {
      this.hearts.push({ x: Math.random() * 40, y: 0, t: 0 });
      this.likes += Math.floor(Math.random() * 30);
    }
    if (this.clipT > 5) {
      this.clipT = 0;
      this.clip = (this.clip + 1) % CLIPS.length;
      this.host.emit({ t: 'sfx', name: 'pop' });
    }
  }

  draw(g: CanvasRenderingContext2D, r: Rect, t: number) {
    g.fillStyle = '#0d0d12';
    g.fillRect(r.x, r.y, r.w, r.h);
    const vh = r.h - 20;
    const vw = vh * 9 / 16;
    const vx = r.x + (r.w - vw) / 2;
    const vy = r.y + 10;
    const c = CLIPS[this.clip];
    g.save();
    rr(g, vx, vy, vw, vh, 18);
    g.clip();
    const bg = g.createLinearGradient(vx, vy, vx + vw, vy + vh);
    bg.addColorStop(0, c.bg[0]);
    bg.addColorStop(1, c.bg[1]);
    g.fillStyle = bg;
    g.fillRect(vx, vy, vw, vh);
    const tt = this.playing ? t : 0;
    const cx = vx + vw / 2;
    const cy = vy + vh * 0.55;
    if (this.clip === 0) {
      const beat = Math.abs(Math.sin(tt * 6));
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsla(${(tt * 120 + i * 45) % 360},90%,65%,0.5)`;
        g.fillRect(vx + (i * vw) / 8, vy + vh * 0.75 - beat * 40 * ((i % 3) + 1), vw / 8 - 4, 400);
      }
      ball(g, cx + Math.sin(tt * 3) * 40, cy - beat * 60, 48, '#7F93A6', Math.sin(tt * 6), '#ff3d77');
    } else if (this.clip === 1) {
      g.fillStyle = '#7a5634';
      g.fillRect(cx - 20, cy + 10, 120, 20);
      const k = (tt * 0.8) % 1;
      const bx = cx - 90 + k * 160;
      const by = cy - 40 - Math.sin(Math.min(1, k * 1.3) * Math.PI) * 120 + (k > 0.75 ? (k - 0.75) * 900 : 0);
      ball(g, bx, by, 34, '#A8D5A2', 1);
      if (k > 0.8) text(g, '💥', cx + 60, cy + 80, 50, '#fff', 'center');
    } else if (this.clip === 2) {
      g.fillStyle = '#fff';
      rr(g, cx - 40, cy, 80, 100, 10);
      g.fill();
      const fill = (tt % 3) / 3;
      g.fillStyle = '#5a3418';
      g.fillRect(cx - 34, cy + 94 - fill * 84, 68, fill * 84);
      g.strokeStyle = '#5a3418';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(cx, vy + 40);
      g.lineTo(cx, cy + 90 - fill * 84);
      g.stroke();
      text(g, `${(fill * 3).toFixed(1)} s`, cx, cy - 40, 40, '#fff', 'center', 700, MONO);
    } else {
      ball(g, cx, cy, 70, '#7a2238', Math.sin(tt * 2), '#111');
      const s = 1 + Math.abs(Math.sin(tt * 8)) * 0.2;
      text(g, '😱', cx + 60, cy - 90, 60 * s, '#fff', 'center');
      g.fillStyle = '#E8F2E8';
      g.fillRect(cx - 80, cy + 90, 160, 70);
      g.strokeStyle = '#3E9B5B';
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(cx - 80, cy + 100 + i * 16);
        g.lineTo(cx + 80, cy + 100 + i * 16);
        g.stroke();
      }
    }
    // legenda
    rr(g, vx + 14, vy + vh * 0.12, vw - 28, 46, 10);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fill();
    text(g, c.cap, vx + vw / 2, vy + vh * 0.12 + 23, 17, '#fff', 'center', 700);
    // lateral: like, comentários
    const sx = vx + vw - 34;
    text(g, '❤', sx, vy + vh * 0.55, 30, '#ff3d77', 'center');
    text(g, `${(this.likes / 1000).toFixed(1)}k`, sx, vy + vh * 0.55 + 26, 13, '#fff', 'center', 600);
    text(g, '💬', sx, vy + vh * 0.67, 26, '#fff', 'center');
    text(g, '↗', sx, vy + vh * 0.78, 28, '#fff', 'center', 700);
    for (const h of this.hearts) {
      g.globalAlpha = 1 - h.t / 1.4;
      text(g, '❤', sx - 10 + h.x * Math.sin(h.t * 4), vy + vh * 0.5 + h.y, 22, '#ff3d77', 'center');
    }
    g.globalAlpha = 1;
    text(g, '@bola_do_rh', vx + 18, vy + vh - 50, 16, '#fff', 'left', 700);
    // barra de progresso
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(vx, vy + vh - 6, vw, 6);
    g.fillStyle = '#fff';
    g.fillRect(vx, vy + vh - 6, vw * (this.clipT / 5), 6);
    if (!this.playing) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(vx, vy, vw, vh);
      text(g, this.host.stock.video > 0 ? '▶' : '⏹', cx, vy + vh / 2, 90, '#fff', 'center');
      if (this.host.stock.video <= 0) text(g, 'cota de vídeo esgotada', cx, vy + vh / 2 + 80, 18, '#fff', 'center', 600);
    }
    g.restore();
    // painel lateral
    text(g, `restam ${this.host.stock.video.toFixed(1)} s hoje`, r.x + 24, r.y + 30, 18, '#fff', 'left', 600, MONO);
    text(g, this.host.headphones ? '🎧 fones: SIM (você ouve menos)' : '🔊 fones: NÃO (o som vaza!)', r.x + 24, r.y + 60, 16, this.host.headphones ? '#3ddc97' : '#ff8a3d', 'left', 600);
    text(g, '[H] alterna fones · clique pausa', r.x + 24, r.y + 88, 14, '#9aa3b8', 'left', 500);
  }
}
