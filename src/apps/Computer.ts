import { App, FONT, MONO, rr, text, type AppHost, type AppId, type Rect, type ScreenInput, ball } from './common';
import { Planilha } from './Planilha';
import { Tiro } from './Tiro';
import { Pesca } from './Pesca';
import { Video } from './Video';
import { Trabalho } from './Trabalho';

const W = 1024;
const H = 640;
const BAR = 50;
const WIN: Rect = { x: 14, y: 12, w: W - 28, h: H - BAR - 22 };

/** O "BossOS" do monitor do jogador: janelas, barra de tarefas e ALT-TAB. */
export class Computer {
  readonly apps: Record<AppId, App>;
  readonly planilha: Planilha;
  readonly tiro: Tiro;
  readonly pesca: Pesca;
  readonly video: Video;
  readonly trabalho: Trabalho;
  active: AppId = 'planilha';
  /** Janela "segura" do dia: a planilha ou o app Trabalho (e-mails, totais, slides). */
  home: AppId = 'planilha';
  lastForbidden: AppId | null = null;
  /** Tempo de jogo da última troca para a janela segura vinda de uma janela proibida. */
  lastSafeSwitch = -99;
  /** Só as abas do dia: a janela de trabalho e as diversões sorteadas. */
  unlocked: AppId[] = ['planilha'];
  private fun: AppId[] = [];
  private trans = 0;
  private hoverBtn = -1;
  private btns: { id: AppId; r: Rect }[] = [];
  frozen = false;
  /** Internet caiu (evento): os jogos não abrem. */
  offline = false;
  private t = 0;
  private notif: { text: string; t: number } | null = null;
  onSwitch: ((from: AppId, to: AppId) => void) | null = null;

  constructor(readonly host: AppHost) {
    this.planilha = new Planilha(host);
    this.tiro = new Tiro(host);
    this.pesca = new Pesca(host);
    this.video = new Video(host);
    this.trabalho = new Trabalho(host);
    this.apps = { planilha: this.planilha, trabalho: this.trabalho, tiro: this.tiro, pesca: this.pesca, video: this.video };
  }

  get app() {
    return this.apps[this.active];
  }
  get forbiddenOpen() {
    return this.app.forbidden;
  }
  /** Teclado ocupado pelo app (atalhos de mesa desligados). */
  get typing() {
    return this.active === 'trabalho' && this.trabalho.typing;
  }

  resetDay(fun: AppId[]) {
    this.fun = fun;
    this.unlocked = [this.home, ...fun];
    for (const a of Object.values(this.apps)) a.resetDay();
    this.active = this.home;
    this.lastForbidden = null;
    this.lastSafeSwitch = -99;
  }

  /** O sorteio do dia mudou (clima do host): troca os jogos liberados sem zerar os apps. */
  setFun(fun: AppId[]) {
    this.fun = fun;
    this.unlocked = [this.home, ...fun];
    if (!this.unlocked.includes(this.active)) this.active = this.home;
  }

  /** A tarefa fixa do dia escolhe a janela de trabalho; a outra some da barra. */
  setHome(id: AppId) {
    this.home = id;
    this.unlocked = [id, ...this.fun];
    if (!this.apps[this.active].forbidden) this.active = id;
  }

  open(id: AppId, gameTime: number) {
    if (id === this.active) return;
    if (!this.unlocked.includes(id)) {
      this.toast('🔒 não é diversão de hoje');
      return;
    }
    if (this.offline && this.apps[id].forbidden) {
      this.toast('📡 sem internet — volte ao trabalho');
      return;
    }
    const from = this.active;
    this.apps[from].onHide();
    if (this.apps[from].forbidden && !this.apps[id].forbidden) this.lastSafeSwitch = gameTime;
    if (this.apps[id].forbidden) this.lastForbidden = id;
    this.active = id;
    this.apps[id].onShow();
    this.trans = 1;
    this.onSwitch?.(from, id);
  }

  /** ESPAÇO: alterna entre a janela de trabalho e a última janela proibida. */
  altTab(gameTime: number) {
    if (this.active === this.home) {
      if (this.lastForbidden) this.open(this.lastForbidden, gameTime);
    } else this.open(this.home, gameTime);
  }

  toast(s: string) {
    this.notif = { text: s, t: 2.2 };
  }

  update(dt: number, gameTime: number, inp: ScreenInput) {
    this.t += dt;
    this.trans = Math.max(0, this.trans - dt * 7);
    if (this.notif) {
      this.notif.t -= dt;
      if (this.notif.t <= 0) this.notif = null;
    }
    if (this.frozen) return;
    // barra de tarefas
    this.hoverBtn = -1;
    let consumed = false;
    this.btns.forEach((b, i) => {
      if (inp.x >= b.r.x && inp.x <= b.r.x + b.r.w && inp.y >= b.r.y && inp.y <= b.r.y + b.r.h) {
        this.hoverBtn = i;
        if (inp.pressed) {
          this.open(b.id, gameTime);
          consumed = true;
        }
      }
    });
    const appInp: ScreenInput = consumed || inp.y > H - BAR ? { ...inp, pressed: false, down: false } : inp;
    this.app.update(dt, appInp, this.t);
  }

  /** Papel de parede e janela com sombra, pré-renderizados: o shadowBlur sozinho custava ~5 ms por quadro. */
  private chrome: { wall: HTMLCanvasElement; win: HTMLCanvasElement } | null = null;

  private chromeLayers() {
    if (this.chrome) return this.chrome;
    const layer = (paint: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      paint(c.getContext('2d')!);
      return c;
    };
    const wall = layer((g) => {
      const wp = g.createLinearGradient(0, 0, W, H);
      wp.addColorStop(0, '#1f6f8b');
      wp.addColorStop(1, '#3a3f8f');
      g.fillStyle = wp;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.12;
      ball(g, W * 0.78, H * 0.4, 140, '#ffffff');
    });
    const wr = WIN;
    const win = layer((g) => {
      g.shadowColor = 'rgba(0,0,0,0.45)';
      g.shadowBlur = 24;
      g.shadowOffsetY = 8;
      rr(g, wr.x, wr.y, wr.w, wr.h, 12);
      g.fillStyle = '#ffffff';
      g.fill();
    });
    this.chrome = { wall, win };
    return this.chrome;
  }

  draw(g: CanvasRenderingContext2D) {
    const layers = this.chromeLayers();
    // papel de parede
    g.drawImage(layers.wall, 0, 0);
    // janela
    const k = this.trans;
    const wr = WIN;
    g.save();
    if (k > 0) {
      const s = 1 - k * 0.06;
      g.translate(W / 2, H / 2);
      g.scale(s, s);
      g.translate(-W / 2, -H / 2);
      g.globalAlpha = 1 - k * 0.6;
    }
    g.drawImage(layers.win, 0, 0);
    // barra de título
    const app = this.app;
    g.save();
    rr(g, wr.x, wr.y, wr.w, wr.h, 12);
    g.clip();
    const tb = g.createLinearGradient(0, wr.y, 0, wr.y + 36);
    tb.addColorStop(0, app.accent);
    tb.addColorStop(1, shade(app.accent, -0.2));
    g.fillStyle = tb;
    g.fillRect(wr.x, wr.y, wr.w, 36);
    text(g, `${app.icon}  ${app.title}`, wr.x + 16, wr.y + 18, 17, '#ffffff', 'left', 600);
    ['#ffd23f', '#3ddc97', '#ff4d6d'].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(wr.x + wr.w - 22 - i * 24, wr.y + 18, 7, 0, Math.PI * 2);
      g.fill();
    });
    const content: Rect = { x: wr.x, y: wr.y + 36, w: wr.w, h: wr.h - 36 };
    g.beginPath();
    g.rect(content.x, content.y, content.w, content.h);
    g.clip();
    app.draw(g, content, this.t);
    g.restore();
    g.restore();
    // barra de tarefas
    g.fillStyle = 'rgba(14,18,30,0.92)';
    g.fillRect(0, H - BAR, W, BAR);
    rr(g, 8, H - BAR + 7, 110, BAR - 14, 10);
    g.fillStyle = '#2F5FA8';
    g.fill();
    text(g, '◉ BossOS', 63, H - BAR / 2, 16, '#fff', 'center', 700);
    const ids = (['planilha', 'trabalho', 'tiro', 'pesca', 'video'] as AppId[]).filter((id) => this.unlocked.includes(id));
    this.btns = [];
    ids.forEach((id, i) => {
      const a = this.apps[id];
      const r: Rect = { x: 126 + i * 152, y: H - BAR + 6, w: 146, h: BAR - 12 };
      this.btns.push({ id, r });
      rr(g, r.x, r.y, r.w, r.h, 9);
      g.fillStyle = id === this.active ? shade(a.accent, -0.1) : this.hoverBtn === i ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
      g.fill();
      if (id === this.active) {
        g.fillStyle = '#fff';
        g.fillRect(r.x + 20, r.y + r.h - 3, r.w - 40, 3);
      }
      const label = id === 'planilha' ? 'Planilha' : id === 'trabalho' ? 'Trabalho' : id === 'tiro' ? 'Ball Ops' : id === 'pesca' ? 'Pesca Zen' : 'ClipClop';
      text(g, `${a.icon} ${label}`, r.x + 12, r.y + r.h / 2, 15, '#fff', 'left', 600);
      const badge = a.badge();
      if (badge) {
        g.font = `600 12px ${MONO}`;
        const bw = g.measureText(badge).width + 12;
        rr(g, r.x + r.w - bw - 6, r.y + 9, bw, 20, 10);
        g.fillStyle = badge === 'AO VIVO' || id === 'trabalho' ? '#ff4d6d' : 'rgba(0,0,0,0.35)';
        g.fill();
        text(g, badge, r.x + r.w - bw / 2 - 6, r.y + 19, 12, '#fff', 'center', 600, MONO);
      }
    });
    text(g, 'ESPAÇO = ALT-TAB', W - 12, H - BAR / 2, 12, '#ffd23f', 'right', 700, FONT);
    if (this.notif) {
      const a = Math.min(1, this.notif.t * 3);
      g.globalAlpha = a;
      rr(g, W - 330, H - BAR - 70, 316, 54, 12);
      g.fillStyle = 'rgba(14,18,30,0.92)';
      g.fill();
      text(g, this.notif.text, W - 172, H - BAR - 43, 17, '#fff', 'center', 600);
      g.globalAlpha = 1;
    }
    if (this.frozen) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, 0, W, H - BAR);
    }
  }

  drawCursor(g: CanvasRenderingContext2D, x: number, y: number) {
    g.save();
    g.translate(x, y);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 24);
    g.lineTo(6, 18);
    g.lineTo(11, 28);
    g.lineTo(15, 26);
    g.lineTo(10, 16);
    g.lineTo(18, 16);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
  const r = f((n >> 16) & 255);
  const gg = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${gg},${b})`;
}

/** Tela simplificada (256×160) dos bots e cabines vazias. */
export function drawBotScreen(g: CanvasRenderingContext2D, mode: 'planilha' | 'tiro' | 'video' | 'pesca' | 'off', t: number, seed: number) {
  const w = g.canvas.width;
  const h = g.canvas.height;
  if (mode === 'off') {
    g.fillStyle = '#0b0d12';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(0, 0, w, h * 0.4);
    return;
  }
  if (mode === 'planilha') {
    g.fillStyle = '#f3f6f3';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1e7a46';
    g.fillRect(0, 0, w, 16);
    g.strokeStyle = '#cfdcd2';
    for (let x = 0; x < w; x += 32) {
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 16; y < h; y += 12) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.fillStyle = '#334';
    const rows = Math.floor((t * 2 + seed) % 11);
    for (let r = 0; r < rows; r++) for (let c = 0; c < 7; c++) g.fillRect(c * 32 + 6, 20 + r * 12, 18 + ((r * 7 + c * 3 + seed) % 6), 4);
    return;
  }
  if (mode === 'tiro') {
    g.fillStyle = '#1a2036';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#c0392b' : '#ff8a3d';
      g.beginPath();
      g.arc((Math.sin(t * 1.3 + i * 2 + seed) * 0.4 + 0.5) * w, (Math.cos(t * 1.1 + i * 3) * 0.4 + 0.5) * h, 8, 0, Math.PI * 2);
      g.fill();
    }
    if (Math.sin(t * 20 + seed) > 0.6) {
      g.fillStyle = 'rgba(255,200,100,0.35)';
      g.fillRect(0, 0, w, h);
    }
    g.fillStyle = '#7F93A6';
    g.beginPath();
    g.arc(w / 2, h / 2, 9, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (mode === 'video') {
    g.fillStyle = '#0d0d12';
    g.fillRect(0, 0, w, h);
    const hue = (t * 80 + seed * 40) % 360;
    g.fillStyle = `hsl(${hue},80%,60%)`;
    g.fillRect(w / 2 - 45, 6, 90, h - 12);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(w / 2, h / 2 - Math.abs(Math.sin(t * 6)) * 20, 18, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const lake = g.createLinearGradient(0, 0, 0, h);
  lake.addColorStop(0, '#ffb38a');
  lake.addColorStop(0.5, '#5aa9c9');
  lake.addColorStop(1, '#1f5f80');
  g.fillStyle = lake;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff4d4d';
  g.beginPath();
  g.arc(w * 0.6, h * 0.65 + Math.sin(t * 3) * 2, 5, 0, Math.PI * 2);
  g.fill();
}
