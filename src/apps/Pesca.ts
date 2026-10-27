import { App, rr, text, easeOutBack, type Rect, type ScreenInput } from './common';
import { ACT } from '../balance';

const FISH = [
  { n: 'Lambari Corporativo', c: '#9ad1ff' },
  { n: 'Tilápia do RH', c: '#ffb3c1' },
  { n: 'Peixe-Planilha', c: '#8fe3a7' },
  { n: 'Bagre de Reunião', c: '#c9a97a' },
  { n: 'Dourado Bônus', c: '#ffd23f' },
  { n: 'Baiacu Estressado', c: '#ff8a3d' },
];

/** PESCA ZEN — silenciosa, mas dá visão de túnel. */
export class Pesca extends App {
  readonly id = 'pesca' as const;
  readonly title = 'Pesca Zen 3D (versão demo)';
  readonly forbidden = true;
  readonly accent = '#2a8fbf';
  readonly icon = '≋';
  private st: 'idle' | 'cast' | 'wait' | 'bite' | 'caught' | 'lost' = 'idle';
  private timer = 0;
  private fish = FISH[0];
  private bobX = 0.62;
  private earned = 0;
  private caughtList: string[] = [];

  badge() {
    return `${this.host.stock.pesca}🐟`;
  }

  resetDay() {
    this.st = 'idle';
    this.earned = 0;
    this.caughtList = [];
  }

  onShow() {
    this.running = this.host.stock.pesca > 0;
  }
  onHide() {
    this.running = false;
  }

  update(dt: number, inp: ScreenInput) {
    this.running = this.host.stock.pesca > 0;
    this.timer += dt;
    switch (this.st) {
      case 'idle':
        if (inp.pressed && this.host.stock.pesca > 0) {
          this.st = 'cast';
          this.timer = 0;
          this.bobX = 0.45 + Math.random() * 0.35;
          this.host.emit({ t: 'sfx', name: 'throw' });
        }
        break;
      case 'cast':
        if (this.timer > 0.6) {
          this.st = 'wait';
          this.timer = -(1.8 + Math.random() * 3.2);
          this.host.emit({ t: 'sfx', name: 'plop' });
        }
        break;
      case 'wait':
        if (inp.pressed) {
          this.st = 'lost';
          this.timer = 0;
          this.host.emit({ t: 'sfx', name: 'miss' });
        } else if (this.timer >= 0) {
          this.st = 'bite';
          this.timer = 0;
          this.fish = FISH[Math.floor(Math.random() * FISH.length)];
          this.host.emit({ t: 'sfx', name: 'warn' });
        }
        break;
      case 'bite':
        if (inp.pressed) {
          this.st = 'caught';
          this.timer = 0;
          this.host.emit({ t: 'consume', what: 'pesca' });
          const v = Math.min(ACT.pesca.fun, ACT.pesca.funMax - this.earned);
          this.earned += v;
          this.caughtList.push(this.fish.n);
          this.host.emit({ t: 'fun', v, label: this.fish.n });
          this.host.emit({ t: 'sfx', name: 'splash' });
        } else if (this.timer > 0.85) {
          this.st = 'lost';
          this.timer = 0;
          this.host.emit({ t: 'sfx', name: 'miss' });
        }
        break;
      case 'caught':
      case 'lost':
        if (this.timer > 1.5 || (this.timer > 0.4 && inp.pressed)) {
          this.st = 'idle';
          this.timer = 0;
        }
        break;
    }
  }

  draw(g: CanvasRenderingContext2D, r: Rect, t: number) {
    // céu de fim de tarde
    const sky = g.createLinearGradient(0, r.y, 0, r.y + r.h * 0.5);
    sky.addColorStop(0, '#ffb38a');
    sky.addColorStop(1, '#ffe0b0');
    g.fillStyle = sky;
    g.fillRect(r.x, r.y, r.w, r.h * 0.5);
    g.fillStyle = '#ffd27a';
    g.beginPath();
    g.arc(r.x + r.w * 0.75, r.y + r.h * 0.42, 50, 0, Math.PI * 2);
    g.fill();
    // morros
    g.fillStyle = '#c47a6a';
    g.beginPath();
    g.moveTo(r.x, r.y + r.h * 0.5);
    for (let i = 0; i <= 10; i++) g.lineTo(r.x + (r.w * i) / 10, r.y + r.h * (0.38 + Math.sin(i * 1.7) * 0.05));
    g.lineTo(r.x + r.w, r.y + r.h * 0.5);
    g.fill();
    // lago
    const lake = g.createLinearGradient(0, r.y + r.h * 0.5, 0, r.y + r.h);
    lake.addColorStop(0, '#5aa9c9');
    lake.addColorStop(1, '#1f5f80');
    g.fillStyle = lake;
    g.fillRect(r.x, r.y + r.h * 0.5, r.w, r.h * 0.5);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const y = r.y + r.h * 0.55 + ((i * 37 + t * 12) % (r.h * 0.45));
      const x = r.x + ((i * 173) % r.w);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 40, y);
      g.stroke();
    }
    // vara e linha
    const rodX = r.x + 90;
    const rodY = r.y + r.h - 20;
    const tipX = r.x + 260;
    const tipY = r.y + r.h * 0.42;
    g.strokeStyle = '#5a3a1a';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(rodX, rodY);
    g.lineTo(tipX, tipY);
    g.stroke();
    let bx = r.x + r.w * this.bobX;
    let by = r.y + r.h * 0.62 + Math.sin(t * 2.5) * 3;
    if (this.st === 'cast') {
      const k = Math.min(1, this.timer / 0.6);
      bx = tipX + (bx - tipX) * k;
      by = tipY + (by - tipY) * k - Math.sin(k * Math.PI) * 120;
    }
    if (this.st === 'bite') by += 10 + Math.sin(t * 40) * 6;
    if (this.st !== 'idle') {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.quadraticCurveTo((tipX + bx) / 2, Math.max(tipY, by) + 30, bx, by);
      g.stroke();
      g.fillStyle = '#ff4d4d';
      g.beginPath();
      g.arc(bx, by, 9, Math.PI, 0);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(bx, by, 9, 0, Math.PI);
      g.fill();
      if (this.st === 'bite') {
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.ellipse(bx, by + 6, 16 + ((t * 60 + k * 14) % 40), 5 + ((t * 20 + k * 5) % 12), 0, 0, Math.PI * 2);
          g.stroke();
        }
        text(g, '!', bx, by - 50 - Math.sin(t * 20) * 4, 64, '#ffd23f', 'center', 700);
      }
    }
    // peixe pego
    if (this.st === 'caught') {
      const k = easeOutBack(Math.min(1, this.timer / 0.4));
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h * 0.42;
      g.save();
      g.translate(cx, cy);
      g.scale(k, k);
      g.rotate(Math.sin(t * 10) * 0.15);
      g.fillStyle = this.fish.c;
      g.beginPath();
      g.ellipse(0, 0, 70, 34, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(60, 0);
      g.lineTo(100, -30);
      g.lineTo(100, 30);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(-38, -8, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(-40, -8, 5, 0, Math.PI * 2);
      g.fill();
      g.restore();
      text(g, this.fish.n, cx, cy + 70, 26, '#ffffff', 'center', 700);
      text(g, `+${ACT.pesca.fun} FUN`, cx, cy + 102, 22, '#ffd23f', 'center', 700);
    }
    if (this.st === 'lost') text(g, 'escapou...', r.x + r.w / 2, r.y + r.h * 0.4, 34, '#ffffff', 'center', 700);
    // painel
    rr(g, r.x + 14, r.y + 14, 240, 70, 14);
    g.fillStyle = 'rgba(20,40,60,0.55)';
    g.fill();
    text(g, `🐟 restantes hoje: ${this.host.stock.pesca}`, r.x + 28, r.y + 36, 17, '#fff', 'left', 600);
    const hint = this.st === 'idle' ? 'clique para lançar' : this.st === 'wait' ? 'espere... (não clique)' : this.st === 'bite' ? 'CLIQUE AGORA!' : '';
    text(g, this.host.stock.pesca > 0 ? hint : 'o lago esvaziou por hoje', r.x + 28, r.y + 62, 15, '#bfe3ff', 'left', 500);
    text(g, '🔇 silencioso · 👁 visão de túnel', r.x + r.w - 20, r.y + 30, 15, 'rgba(20,40,60,0.8)', 'right', 600);
  }
}
