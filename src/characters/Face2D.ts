import * as THREE from 'three';
import { liveTexture } from '../core/liveTexture';

/** Expressões: as seis do jogo (EyeState) + falando e dormindo. */
export type Expr = 'normal' | 'alert' | 'clutch' | 'caught' | 'bored' | 'happy' | 'talk' | 'sleep';
/** Famílias de rosto: adesivo (PEAK), olhão com pálpebra (R.E.P.O.), tela de pixel, bicho e massinha. */
export type FaceStyle = 'peak' | 'repo' | 'screen' | 'critter' | 'dough';
export type Nose = 'none' | 'cat' | 'capy' | 'dog' | 'mouse' | 'frog' | 'shark' | 'dot';

export interface FaceSpec {
  style: FaceStyle;
  /** Tamanho do canvas (px). Coordenadas abaixo são px num canvas de 512. */
  w?: number;
  h?: number;
  skin: string;
  ink?: string;
  eyeGap: number;
  eyeY: number;
  eyeW: number;
  eyeH: number;
  mouthY?: number;
  mouthW?: number;
  /** Cor da sobrancelha (null = sem). */
  brow?: string | null;
  browW?: number;
  browT?: number;
  /** Cara de bravo de fábrica (chefe/dono): 0..1. */
  mean?: number;
  /** Pálpebra baixa de fábrica (capivara tranquila): 0..1. */
  chill?: number;
  nose?: Nose;
  noseY?: number;
  whiskers?: boolean;
  lashes?: boolean;
  mustache?: string | null;
  monocle?: boolean;
  teeth?: 'none' | 'under' | 'buck';
  blush?: string;
  freckles?: boolean;
  /** Pálpebra pintada (R.E.P.O.). */
  lid?: string;
  /** Tela: cor do brilho e do fundo. */
  glow?: string;
  screen?: string;
  /** Olho com íris colorida (massinha). */
  iris?: string;
}

type Mouth = 'line' | 'open' | 'o' | 'grim' | 'wave' | 'shout';

interface Pose {
  open: number;
  low: number;
  size: number;
  pupil: number;
  browY: number;
  tilt: number;
  curve: number;
  mOpen: number;
  mouth: Mouth;
  blush: number;
  sweat: number;
  shake: number;
}

const POSES: Record<Expr, Pose> = {
  normal: { open: 1, low: 0, size: 1, pupil: 1, browY: 0, tilt: 0, curve: 0.45, mOpen: 0, mouth: 'line', blush: 0.35, sweat: 0, shake: 0 },
  alert: { open: 1, low: 0, size: 1.22, pupil: 0.55, browY: 1, tilt: -0.35, curve: 0, mOpen: 0.45, mouth: 'o', blush: 0.05, sweat: 0.35, shake: 0 },
  clutch: { open: 1, low: 0, size: 1.3, pupil: 0.42, browY: 0.9, tilt: -0.85, curve: -0.3, mOpen: 0.6, mouth: 'grim', blush: 0, sweat: 1, shake: 1 },
  caught: { open: 1, low: 0, size: 1.1, pupil: 1, browY: 0.55, tilt: -0.7, curve: -0.7, mOpen: 0.6, mouth: 'wave', blush: 0, sweat: 0.7, shake: 0.35 },
  bored: { open: 0.42, low: 0.08, size: 0.96, pupil: 1, browY: -0.5, tilt: -0.15, curve: -0.25, mOpen: 0, mouth: 'line', blush: 0.08, sweat: 0, shake: 0 },
  happy: { open: 1, low: 1, size: 1.05, pupil: 1, browY: 0.6, tilt: -0.25, curve: 1, mOpen: 0.75, mouth: 'open', blush: 0.95, sweat: 0, shake: 0 },
  talk: { open: 1, low: 0.12, size: 1, pupil: 1, browY: 0.3, tilt: 0, curve: 0.55, mOpen: 0.42, mouth: 'open', blush: 0.4, sweat: 0, shake: 0 },
  sleep: { open: 0, low: 0, size: 1, pupil: 1, browY: -0.3, tilt: -0.1, curve: 0.2, mOpen: 0.2, mouth: 'o', blush: 0.55, sweat: 0, shake: 0 },
};

/** Chefe e dono: o "alerta" deles é bronca, não susto. */
const MEAN: Partial<Record<Expr, Partial<Pose>>> = {
  normal: { tilt: 0.75, curve: -0.35, blush: 0, browY: -0.2 },
  alert: { tilt: 1, pupil: 0.62, size: 1.12, curve: -0.6, mOpen: 0.8, mouth: 'shout', browY: -0.1, sweat: 0 },
  happy: { tilt: 0.45, low: 0.7, curve: 1, mOpen: 0, mouth: 'line', blush: 0.15 },
  talk: { tilt: 0.6, curve: -0.2, blush: 0 },
  bored: { tilt: 0.35 },
};

const NUM: (keyof Pose)[] = ['open', 'low', 'size', 'pupil', 'browY', 'tilt', 'curve', 'mOpen', 'blush', 'sweat', 'shake'];
const TAU = Math.PI * 2;

/**
 * Rosto 2D animado desenhado num canvas e usado como textura (decalque na cabeça ou tela).
 * Todo o carisma mora aqui: piscadas, olhares, pálpebras, boca com transição, suor, rubor.
 */
export class Face2D {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  readonly W: number;
  readonly H: number;
  expr: Expr = 'normal';
  /** Olhar externo (-1..1), ex.: o mouse. */
  lookX = 0;
  lookY = 0;
  private g: CanvasRenderingContext2D;
  private cur: Pose;
  private tgt: Pose;
  private sizeV = 0;
  private t = Math.random() * 10;
  private blinkT = 1 + Math.random() * 3;
  private blink = 0;
  private sacX = 0;
  private sacY = 0;
  private sacT = 0;
  private mouthPrev: Mouth = 'line';
  private mouthMix = 1;
  private lastKey = '';
  private pix: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private grid: HTMLCanvasElement | null = null;

  constructor(readonly s: FaceSpec) {
    this.W = s.w ?? 512;
    this.H = s.h ?? 512;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = liveTexture(this.canvas);
    this.tex.anisotropy = 4;
    this.cur = this.pose('normal');
    this.tgt = this.pose('normal');
    if (s.style === 'screen') {
      this.pix = document.createElement('canvas');
      this.pix.width = 64;
      this.pix.height = Math.round((64 * this.H) / this.W);
      this.halo = document.createElement('canvas');
      this.halo.width = this.W / 4;
      this.halo.height = this.H / 4;
    }
    this.draw();
  }

  private pose(e: Expr): Pose {
    const p = { ...POSES[e] };
    const m = this.s.mean ?? 0;
    if (m > 0) Object.assign(p, MEAN[e] ?? {});
    if (this.s.chill && (e === 'normal' || e === 'talk')) p.open = 1 - this.s.chill;
    return p;
  }

  set(e: Expr) {
    if (e === this.expr) return;
    this.expr = e;
    const next = this.pose(e);
    if (next.mouth !== this.tgt.mouth) {
      this.mouthPrev = this.tgt.mouth;
      this.mouthMix = 0;
    }
    this.sizeV += next.size > this.tgt.size ? 4 : -1;
    this.tgt = next;
  }

  update(dt: number) {
    this.t += dt;
    const k = Math.min(1, dt * 16);
    for (const n of NUM) {
      if (n === 'size') continue;
      (this.cur[n] as number) += ((this.tgt[n] as number) - (this.cur[n] as number)) * k;
    }
    // tamanho com mola (os olhos "estalam" no susto); em subpassos de no máximo
    // 1/60 s, senão a mola diverge com o tempo acelerado (×6)
    const steps = Math.ceil(dt * 60);
    const h = dt / Math.max(1, steps);
    for (let i = 0; i < steps; i++) {
      this.sizeV += ((this.tgt.size - this.cur.size) * 260 - this.sizeV * 14) * h;
      this.cur.size += this.sizeV * h;
    }
    this.cur.mouth = this.tgt.mouth;
    this.mouthMix = Math.min(1, this.mouthMix + dt * 9);
    // piscar
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.16;
      this.blinkT = Math.random() < 0.18 ? 0.22 : 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    // sacadas: o olho nunca fica parado
    this.sacT -= dt;
    if (this.sacT < 0) {
      const busy = this.expr === 'clutch' ? 2.6 : 1;
      this.sacX = (Math.random() - 0.5) * 0.5 * busy;
      this.sacY = (Math.random() - 0.5) * 0.3 * busy;
      this.sacT = (0.5 + Math.random() * 2) / busy;
    }
    this.draw();
  }

  private get blinkAmt() {
    if (this.blink <= 0) return 0;
    const u = 1 - this.blink / 0.16;
    return Math.sin(u * Math.PI);
  }

  private get look() {
    const x = THREE.MathUtils.clamp(this.lookX + this.sacX, -1, 1);
    const y = THREE.MathUtils.clamp(this.lookY + this.sacY, -1, 1);
    return { x, y };
  }

  private get talkOpen() {
    const p = this.cur;
    if (this.expr !== 'talk') return p.mOpen;
    const a = Math.abs(Math.sin(this.t * 11.5) * 0.7 + Math.sin(this.t * 6.1) * 0.5);
    return 0.08 + p.mOpen * 1.6 * Math.min(1, a);
  }

  private draw() {
    const p = this.cur;
    const lk = this.look;
    const key = [this.expr, this.blinkAmt, lk.x, lk.y, this.mouthMix, ...NUM.map((n) => p[n] as number), this.talkOpen]
      .map((v) => (typeof v === 'number' ? v.toFixed(3) : v))
      .join('|');
    const animated = this.expr === 'caught' || this.expr === 'sleep' || p.sweat > 0.02 || p.shake > 0.02 || this.s.style === 'screen';
    if (key === this.lastKey && !animated) return;
    this.lastKey = key;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (this.s.style === 'screen') {
      this.drawScreen();
    } else {
      const sc = this.W / 512;
      const jit = p.shake * 3.2;
      g.setTransform(sc, 0, 0, sc, (Math.random() - 0.5) * jit * sc, (Math.random() - 0.5) * jit * sc);
      this.drawOrganic();
    }
    this.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ rostos "desenhados"
  private drawOrganic() {
    const s = this.s;
    const g = this.g;
    const p = this.cur;
    const cx = 256;
    const cy = 256;
    this.drawBlush(cx, cy);
    if (s.freckles) {
      g.fillStyle = 'rgba(120,60,40,0.45)';
      for (const sd of [-1, 1])
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(cx + sd * (s.eyeGap + 6 + i * 13), cy + s.eyeY + s.eyeH * 0.62 + (i % 2) * 9, 4.2, 0, TAU);
          g.fill();
        }
    }
    if (s.nose && s.nose !== 'none') this.drawNose(cx, cy);
    this.drawMouth(cx, cy);
    if (s.style === 'repo') this.drawRepoEyes(cx, cy);
    else if (s.style === 'dough') this.drawScleraEyes(cx, cy);
    else this.drawSolidEyes(cx, cy);
    if (s.brow) this.drawBrows(cx, cy);
    if (s.monocle) this.drawMonocle(cx, cy);
    if (p.sweat > 0.02) this.drawSweat(cx, cy);
  }

  private eyeBox(side: number, cx: number, cy: number) {
    const s = this.s;
    const p = this.cur;
    const lk = this.look;
    const shift = s.style === 'repo' || s.style === 'dough' ? 0 : 1;
    const ex = cx + side * s.eyeGap + lk.x * s.eyeW * 0.16 * shift;
    const ey = cy + s.eyeY + lk.y * s.eyeH * 0.1 * shift;
    // a mola do tamanho pode passar de zero numa troca brusca; raio negativo quebra o canvas
    const size = Math.max(0.05, p.size);
    return { ex, ey, rx: (s.eyeW / 2) * size, ry: (s.eyeH / 2) * size };
  }

  /** Recorte das pálpebras: abaixo da linha da pálpebra de cima e fora do "corte" de baixo (olho ^^). */
  private lidClip(side: number, ex: number, ey: number, rx: number, ry: number, open: number) {
    const g = this.g;
    const p = this.cur;
    const slope = this.lidSlope(side, open);
    const lidY = ey - ry + (1 - open) * 2 * ry + Math.max(0, p.tilt) * ry * 0.32;
    g.beginPath();
    g.moveTo(ex - rx * 3, lidY - slope * rx * 3);
    g.lineTo(ex + rx * 3, lidY + slope * rx * 3);
    g.lineTo(ex + rx * 3, ey + ry * 4);
    g.lineTo(ex - rx * 3, ey + ry * 4);
    g.closePath();
    g.clip();
    if (p.low > 0.01) {
      g.beginPath();
      g.rect(ex - rx * 4, ey - ry * 4, rx * 8, ry * 8);
      g.ellipse(ex, ey + ry * (2.3 - p.low * 1.4), rx * 1.65, ry * 1.25, 0, 0, TAU);
      g.clip('evenodd');
    }
    return { lidY, slope };
  }

  private eyeOpen() {
    return this.cur.open * (1 - this.blinkAmt);
  }

  /** Inclinação da pálpebra: inteira no bravo; no preocupado só quando o olho já está meio fechado. */
  private lidSlope(side: number, open: number) {
    const t = this.cur.tilt;
    return -side * (t > 0 ? t : t * Math.min(1, (1 - open) * 1.6)) * 0.55;
  }

  /** Olho "adesivo": oval escuro com brilho (PEAK / bichos). No susto vira olho branco com pupila miúda. */
  private drawSolidEyes(cx: number, cy: number) {
    const s = this.s;
    const g = this.g;
    const p = this.cur;
    const ink = s.ink ?? '#1b1424';
    const open = this.eyeOpen();
    for (const side of [-1, 1]) {
      const { ex, ey, rx, ry } = this.eyeBox(side, cx, cy);
      if (this.expr === 'caught') {
        this.drawX(ex, ey, rx * 1.05, ink);
        continue;
      }
      if (open < 0.1) {
        this.closedEye(ex, ey, rx, ry, ink);
        continue;
      }
      g.save();
      this.lidClip(side, ex, ey, rx, ry, open);
      const alarm = THREE.MathUtils.clamp((0.86 - p.pupil) / 0.18, 0, 1);
      if (alarm < 1) {
        g.globalAlpha = 1 - alarm;
        g.fillStyle = ink;
        g.beginPath();
        g.ellipse(ex, ey, rx, ry, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(ex + rx * 0.3, ey - ry * 0.4, rx * 0.34, ry * 0.26, -0.4, 0, TAU);
        g.fill();
        g.beginPath();
        g.arc(ex - rx * 0.28, ey + ry * 0.38, rx * 0.14, 0, TAU);
        g.fill();
        if (s.style === 'critter') {
          // reflexo extra: olho de bicho é mais "molhado"
          g.globalAlpha = (1 - alarm) * 0.35;
          g.beginPath();
          g.ellipse(ex - rx * 0.1, ey + ry * 0.55, rx * 0.55, ry * 0.18, 0, 0, TAU);
          g.fill();
        }
      }
      if (alarm > 0) {
        g.globalAlpha = alarm;
        const lk = this.look;
        g.fillStyle = '#ffffff';
        g.strokeStyle = ink;
        g.lineWidth = rx * 0.24;
        g.beginPath();
        g.ellipse(ex, ey, rx * 1.02, ry * 1.02, 0, 0, TAU);
        g.fill();
        g.stroke();
        g.fillStyle = ink;
        g.beginPath();
        g.ellipse(ex + lk.x * rx * 0.3, ey + lk.y * ry * 0.25, rx * 0.72 * p.pupil, ry * 0.62 * p.pupil, 0, 0, TAU);
        g.fill();
      }
      g.restore();
      this.lidLine(side, ex, ey, rx, ry, open, ink, 0.18);
    }
  }

  /** Pálpebra visível quando o olho está meio fechado (tédio, bravo). */
  private lidLine(side: number, ex: number, ey: number, rx: number, ry: number, open: number, ink: string, w: number) {
    const p = this.cur;
    const show = Math.max(1 - open, Math.max(0, p.tilt) * 0.8);
    if (show < 0.12 || p.low > 0.5) return;
    const g = this.g;
    g.save();
    g.beginPath();
    g.ellipse(ex, ey, rx * 1.12, ry * 1.12, 0, 0, TAU);
    g.clip();
    const slope = this.lidSlope(side, open);
    const lidY = ey - ry + (1 - open) * 2 * ry + Math.max(0, p.tilt) * ry * 0.32;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    g.lineWidth = rx * w;
    g.globalAlpha = Math.min(1, show * 2);
    g.beginPath();
    g.moveTo(ex - rx * 1.2, lidY - slope * rx * 1.2);
    g.lineTo(ex + rx * 1.2, lidY + slope * rx * 1.2);
    g.stroke();
    g.restore();
  }

  private closedEye(ex: number, ey: number, rx: number, ry: number, ink: string) {
    const g = this.g;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    g.lineWidth = Math.max(9, rx * 0.34);
    g.beginPath();
    const sleepy = this.expr === 'sleep';
    g.moveTo(ex - rx * 1.05, ey + (sleepy ? -ry * 0.05 : 0));
    g.quadraticCurveTo(ex, ey + (sleepy ? ry * 0.55 : ry * 0.18), ex + rx * 1.05, ey + (sleepy ? -ry * 0.05 : 0));
    g.stroke();
    if (this.s.lashes) {
      g.lineWidth *= 0.55;
      for (const k of [-0.7, 0.7]) {
        g.beginPath();
        g.moveTo(ex + k * rx, ey + ry * 0.12);
        g.lineTo(ex + k * rx * 1.25, ey + ry * 0.42);
        g.stroke();
      }
    }
  }

  private drawX(ex: number, ey: number, r: number, ink: string) {
    const g = this.g;
    const wob = Math.sin(this.t * 9) * 0.12;
    g.save();
    g.translate(ex, ey);
    g.rotate(wob);
    g.strokeStyle = ink;
    g.lineCap = 'round';
    g.lineWidth = r * 0.42;
    g.beginPath();
    g.moveTo(-r, -r);
    g.lineTo(r, r);
    g.moveTo(r, -r);
    g.lineTo(-r, r);
    g.stroke();
    g.restore();
  }

  /** Olho branco com pupila e pálpebra cor da pele (massinha). */
  private drawScleraEyes(cx: number, cy: number) {
    const s = this.s;
    const g = this.g;
    const p = this.cur;
    const ink = s.ink ?? '#2a1d22';
    const open = this.eyeOpen();
    const lk = this.look;
    for (const side of [-1, 1]) {
      const { ex, ey, rx, ry } = this.eyeBox(side, cx, cy);
      if (this.expr === 'caught') {
        this.drawX(ex, ey, rx * 0.95, ink);
        continue;
      }
      if (open < 0.1) {
        this.closedEye(ex, ey, rx, ry, ink);
        continue;
      }
      g.save();
      const { lidY, slope } = this.lidClip(side, ex, ey, rx, ry, open);
      g.fillStyle = '#fffdf8';
      g.beginPath();
      g.ellipse(ex, ey, rx, ry, 0, 0, TAU);
      g.fill();
      const pr = rx * 0.62 * Math.min(1.1, p.pupil + 0.1);
      const px = ex + lk.x * rx * 0.4;
      const py = ey + lk.y * ry * 0.3 + ry * 0.06;
      if (s.iris) {
        g.fillStyle = s.iris;
        g.beginPath();
        g.arc(px, py, pr, 0, TAU);
        g.fill();
      }
      g.fillStyle = ink;
      g.beginPath();
      g.arc(px, py, pr * (s.iris ? 0.55 : 0.9), 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(px + pr * 0.35, py - pr * 0.4, pr * 0.3, 0, TAU);
      g.fill();
      g.restore();
      // contorno do olho + linha da pálpebra
      g.save();
      g.beginPath();
      g.ellipse(ex, ey, rx, ry, 0, 0, TAU);
      g.clip();
      g.strokeStyle = ink;
      g.lineWidth = rx * 0.2;
      g.lineCap = 'round';
      if (open < 0.97 || p.tilt > 0.05) {
        g.beginPath();
        g.moveTo(ex - rx * 1.1, lidY - slope * rx * 1.1);
        g.lineTo(ex + rx * 1.1, lidY + slope * rx * 1.1);
        g.stroke();
      }
      g.restore();
      g.save();
      this.lidClip(side, ex, ey, rx, ry, open);
      g.strokeStyle = ink;
      g.lineWidth = rx * 0.13;
      g.beginPath();
      g.ellipse(ex, ey, rx, ry, 0, 0, TAU);
      g.stroke();
      g.restore();
      if (s.lashes) {
        g.strokeStyle = ink;
        g.lineCap = 'round';
        g.lineWidth = rx * 0.14;
        const ly = lidY + slope * (side * rx * 0.85);
        g.beginPath();
        g.moveTo(ex + side * rx * 0.82, ly + 4);
        g.lineTo(ex + side * rx * 1.25, ly - ry * 0.2);
        g.stroke();
      }
    }
  }

  /** Olhão de robô: esclera grande, pálpebra metálica que corta o olho (R.E.P.O.). Sem boca. */
  private drawRepoEyes(cx: number, cy: number) {
    const s = this.s;
    const g = this.g;
    const p = this.cur;
    const ink = s.ink ?? '#15151d';
    const lid = s.lid ?? s.skin;
    const open = this.eyeOpen();
    const lk = this.look;
    for (const side of [-1, 1]) {
      const { ex, ey, rx, ry } = this.eyeBox(side, cx, cy);
      g.save();
      g.beginPath();
      g.ellipse(ex, ey, rx, ry, 0, 0, TAU);
      g.clip();
      g.fillStyle = '#f6f4ee';
      g.fillRect(ex - rx, ey - ry, rx * 2, ry * 2);
      // sombra interna em cima (dá volume)
      const sh = g.createLinearGradient(0, ey - ry, 0, ey + ry);
      sh.addColorStop(0, 'rgba(40,40,60,0.28)');
      sh.addColorStop(0.35, 'rgba(40,40,60,0)');
      g.fillStyle = sh;
      g.fillRect(ex - rx, ey - ry, rx * 2, ry * 2);
      if (this.expr === 'caught') {
        // olho em espiral (tonto)
        g.strokeStyle = ink;
        g.lineWidth = rx * 0.11;
        g.lineCap = 'round';
        g.beginPath();
        const rot = this.t * 7 * side;
        for (let a = 0; a < TAU * 2.6; a += 0.15) {
          const r = (a / (TAU * 2.6)) * rx * 0.82;
          const x = ex + Math.cos(a + rot) * r;
          const y = ey + Math.sin(a + rot) * r;
          if (a === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      } else {
        const pr = rx * 0.42 * p.pupil;
        const px = ex + lk.x * rx * 0.42;
        const py = ey + lk.y * ry * 0.36;
        g.fillStyle = ink;
        g.beginPath();
        g.arc(px, py, pr, 0, TAU);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(px + pr * 0.38, py - pr * 0.4, pr * 0.28, 0, TAU);
        g.fill();
      }
      // pálpebras (cima com inclinação; baixo no sorriso)
      const slope = this.lidSlope(side, open);
      const lidY = ey - ry + (1 - open) * 2 * ry + Math.max(0, p.tilt) * ry * 0.34;
      g.fillStyle = lid;
      g.strokeStyle = ink;
      g.lineWidth = rx * 0.1;
      g.beginPath();
      g.moveTo(ex - rx * 1.5, lidY - slope * rx * 1.5);
      g.lineTo(ex + rx * 1.5, lidY + slope * rx * 1.5);
      g.lineTo(ex + rx * 1.5, ey - ry * 2);
      g.lineTo(ex - rx * 1.5, ey - ry * 2);
      g.closePath();
      g.fill();
      g.stroke();
      if (p.low > 0.01) {
        g.beginPath();
        g.ellipse(ex, ey + ry * (2.3 - p.low * 1.4), rx * 1.65, ry * 1.25, 0, 0, TAU);
        g.fill();
        g.stroke();
      }
      g.restore();
      g.strokeStyle = ink;
      g.lineWidth = rx * 0.13;
      g.beginPath();
      g.ellipse(ex, ey, rx, ry, 0, 0, TAU);
      g.stroke();
    }
  }

  private drawBrows(cx: number, cy: number) {
    const s = this.s;
    const g = this.g;
    const p = this.cur;
    const bw = s.browW ?? s.eyeW * 1.05;
    g.strokeStyle = s.brow!;
    g.lineCap = 'round';
    g.lineWidth = s.browT ?? 15;
    for (const side of [-1, 1]) {
      const bx = cx + side * s.eyeGap * 1.04 + this.look.x * 6;
      const by = cy + s.eyeY - (s.eyeH / 2) * p.size - 26 - p.browY * 24 + (this.expr === 'bored' ? 12 : 0);
      const inner = { x: bx - side * bw * 0.5, y: by + p.tilt * 20 };
      const outer = { x: bx + side * bw * 0.5, y: by - p.tilt * 7 + 6 };
      g.beginPath();
      g.moveTo(inner.x, inner.y);
      g.quadraticCurveTo(bx, by - 9 - Math.max(0, -p.tilt) * 4, outer.x, outer.y);
      g.stroke();
    }
  }

  private drawBlush(cx: number, cy: number) {
    const s = this.s;
    const p = this.cur;
    if (p.blush < 0.02 || s.style === 'repo') return;
    const g = this.g;
    const col = s.blush ?? '#ff6f91';
    for (const side of [-1, 1]) {
      const bx = cx + side * (s.eyeGap + s.eyeW * 0.42);
      const by = cy + s.eyeY + s.eyeH * 0.68;
      const rx = s.eyeW * 0.62;
      g.save();
      g.translate(bx, by);
      g.scale(1, 0.55);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, hexA(col, 0.62 * p.blush));
      gr.addColorStop(1, hexA(col, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, rx, 0, TAU);
      g.fill();
      g.restore();
      if (p.blush > 0.7) {
        g.strokeStyle = hexA(col, (p.blush - 0.7) * 3);
        g.lineWidth = 5;
        g.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(bx + i * 15 - 6, by + 8);
          g.lineTo(bx + i * 15 + 6, by - 8);
          g.stroke();
        }
      }
    }
  }

  private drawSweat(cx: number, cy: number) {
    const s = this.s;
    const g = this.g;
    const p = this.cur;
    const k = (this.t * 0.9) % 1;
    const x = cx + s.eyeGap + s.eyeW * 0.85;
    const y = cy + s.eyeY - s.eyeH * 0.75 + k * 70;
    const r = 15 + (1 - k) * 4;
    g.save();
    g.globalAlpha = p.sweat * (k < 0.85 ? 1 : (1 - k) / 0.15);
    g.fillStyle = '#9fe0ff';
    g.strokeStyle = '#2a5f8a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x, y - r * 1.9);
    g.bezierCurveTo(x + r * 0.4, y - r, x + r, y - r * 0.2, x + r, y + r * 0.2);
    g.arc(x, y + r * 0.2, r, 0, Math.PI);
    g.bezierCurveTo(x - r, y - r * 0.2, x - r * 0.4, y - r, x, y - r * 1.9);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x - r * 0.35, y, r * 0.25, 0, TAU);
    g.fill();
    g.restore();
  }

  private drawMonocle(cx: number, cy: number) {
    const g = this.g;
    const { ex, ey } = this.eyeBox(1, cx, cy);
    // o monóculo é rígido: acompanha pouco o olho arregalar/apertar
    const r = (Math.max(this.s.eyeW, this.s.eyeH) / 2) * 1.32 * THREE.MathUtils.clamp(this.cur.size, 0.85, 1.25);
    g.save();
    g.fillStyle = 'rgba(220,240,255,0.18)';
    g.beginPath();
    g.arc(ex, ey, r, 0, TAU);
    g.fill();
    g.strokeStyle = '#e8b93a';
    g.lineWidth = 10;
    g.stroke();
    g.strokeStyle = '#8a6410';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = '#e8b93a';
    g.lineWidth = 4;
    g.setLineDash([7, 5]);
    g.beginPath();
    g.moveTo(ex + r * 0.7, ey + r * 0.7);
    g.quadraticCurveTo(ex + r * 1.4, ey + r * 2.2, ex + r * 0.9, ey + r * 3.4);
    g.stroke();
    g.restore();
  }

  private drawNose(cx: number, cy: number) {
    const s = this.s;
    const g = this.g;
    const ink = s.ink ?? '#1b1424';
    const ny = cy + (s.noseY ?? (s.eyeY + (s.mouthY ?? 90)) * 0.5);
    g.save();
    switch (s.nose) {
      case 'cat': {
        g.fillStyle = '#ff8fab';
        g.strokeStyle = ink;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(cx - 20, ny - 9);
        g.quadraticCurveTo(cx, ny - 15, cx + 20, ny - 9);
        g.quadraticCurveTo(cx + 4, ny + 14, cx, ny + 13);
        g.quadraticCurveTo(cx - 4, ny + 14, cx - 20, ny - 9);
        g.fill();
        g.stroke();
        break;
      }
      case 'capy': {
        // focinho de capivara: almofada escura larga com duas fendas
        g.fillStyle = '#4a2f20';
        roundRect(g, cx - 54, ny - 26, 108, 50, 24);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        roundRect(g, cx - 38, ny - 21, 76, 12, 6);
        g.fill();
        g.fillStyle = '#1b100a';
        for (const sd of [-1, 1]) {
          g.beginPath();
          g.ellipse(cx + sd * 24, ny + 2, 6, 13, sd * -0.35, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'frog': {
        g.fillStyle = ink;
        for (const sd of [-1, 1]) {
          g.beginPath();
          g.ellipse(cx + sd * 18, ny, 6, 9, sd * 0.5, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'dog': {
        g.fillStyle = '#231a20';
        g.beginPath();
        g.moveTo(cx - 44, ny - 18);
        g.quadraticCurveTo(cx, ny - 30, cx + 44, ny - 18);
        g.quadraticCurveTo(cx + 46, ny + 10, cx, ny + 22);
        g.quadraticCurveTo(cx - 46, ny + 10, cx - 44, ny - 18);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath();
        g.ellipse(cx - 14, ny - 12, 14, 6, -0.2, 0, TAU);
        g.fill();
        break;
      }
      case 'mouse': {
        g.fillStyle = '#ff8fab';
        g.strokeStyle = ink;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(cx, ny, 17, 0, TAU);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(cx - 5, ny - 6, 5, 0, TAU);
        g.fill();
        break;
      }
      case 'dot': {
        g.fillStyle = hexA(ink, 0.55);
        g.beginPath();
        g.ellipse(cx, ny, 9, 6, 0, 0, TAU);
        g.fill();
        break;
      }
    }
    if (s.whiskers) {
      g.strokeStyle = hexA(ink, 0.55);
      g.lineWidth = 4;
      g.lineCap = 'round';
      for (const sd of [-1, 1])
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(cx + sd * 64, ny + 10 + i * 12);
          g.quadraticCurveTo(cx + sd * 110, ny + 4 + i * 18, cx + sd * 150, ny + i * 26);
          g.stroke();
        }
    }
    g.restore();
  }

  private drawMouth(cx: number, cy: number) {
    const s = this.s;
    if (s.mouthW === undefined || s.style === 'repo') return;
    const g = this.g;
    const my = cy + (s.mouthY ?? 90);
    if (this.mouthMix < 1) {
      g.save();
      g.globalAlpha = 1 - this.mouthMix;
      this.mouthShape(this.mouthPrev, cx, my, 1 - this.mouthMix * 0.4);
      g.restore();
    }
    g.save();
    g.globalAlpha = this.mouthMix;
    this.mouthShape(this.cur.mouth, cx, my, 0.6 + this.mouthMix * 0.4);
    g.restore();
    if (s.mustache) this.drawMustache(cx, my);
  }

  private mouthShape(shape: Mouth, cx: number, my: number, sy: number) {
    const s = this.s;
    const g = this.g;
    const p = this.cur;
    const ink = s.ink ?? '#1b1424';
    const mw = s.mouthW!;
    const c = p.curve;
    const open = this.talkOpen;
    const inside = '#4a1626';
    g.save();
    g.translate(cx, my);
    g.scale(1, sy);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = ink;
    if (s.nose === 'shark' && (shape === 'line' || shape === 'open' || shape === 'shout')) {
      this.sharkGrin(mw, c, open, ink);
      g.restore();
      return;
    }
    if (shape === 'line' && s.nose === 'cat') {
      // boquinha "w"
      g.lineWidth = mw * 0.11;
      const w = mw * 0.5;
      const up = c * 10;
      g.beginPath();
      g.moveTo(-w, -up);
      g.quadraticCurveTo(-w * 0.5, 14 + up, 0, -4);
      g.quadraticCurveTo(w * 0.5, 14 + up, w, -up);
      g.stroke();
    } else if (shape === 'line') {
      const w = mw * (0.5 + Math.max(0, c) * 0.12);
      g.lineWidth = Math.max(8, mw * 0.12);
      g.beginPath();
      g.moveTo(-w, -c * mw * 0.1);
      g.quadraticCurveTo(0, c * mw * 0.32, w, -c * mw * 0.1);
      g.stroke();
      if (s.teeth === 'under') this.fangs(w, c, mw);
      if (s.teeth === 'buck') this.buckTeeth(mw, c * mw * 0.11);
    } else if (shape === 'open' || shape === 'shout') {
      const w = mw * (shape === 'shout' ? 0.6 : 0.52 + Math.max(0, c) * 0.1);
      const cy0 = -c * mw * 0.12;
      const top = shape === 'shout' ? -mw * 0.12 : c * mw * 0.06 - open * mw * 0.08;
      const bot = open * mw * (shape === 'shout' ? 0.95 : 0.85) + Math.max(0, c) * mw * 0.22;
      g.beginPath();
      g.moveTo(-w, cy0);
      g.quadraticCurveTo(0, top, w, cy0);
      g.quadraticCurveTo(w * 0.9, bot, 0, bot);
      g.quadraticCurveTo(-w * 0.9, bot, -w, cy0);
      g.closePath();
      g.fillStyle = inside;
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = '#ff7b93';
      g.beginPath();
      g.ellipse(0, bot, w * 0.6, mw * 0.2 + open * mw * 0.1, 0, 0, TAU);
      g.fill();
      if (shape === 'shout' || s.teeth === 'under') {
        g.fillStyle = '#fffaf0';
        g.fillRect(-w, top - 4, w * 2, mw * 0.1 + 6);
      }
      if (s.teeth === 'buck') {
        g.fillStyle = '#fffaf0';
        g.fillRect(-mw * 0.14, top - 2, mw * 0.28, mw * 0.16);
      }
      g.restore();
      g.lineWidth = mw * 0.09;
      g.stroke();
    } else if (shape === 'o') {
      const rx = mw * (0.16 + open * 0.12);
      const ry = mw * (0.13 + open * 0.28);
      g.fillStyle = inside;
      g.lineWidth = mw * 0.09;
      g.beginPath();
      g.ellipse(0, ry * 0.4, rx, ry, 0, 0, TAU);
      g.fill();
      g.stroke();
    } else if (shape === 'grim') {
      const w = mw * 0.56;
      const h = mw * 0.34;
      const wob = Math.sin(this.t * 30) * p.shake * 2;
      g.fillStyle = '#fffaf0';
      g.lineWidth = mw * 0.08;
      roundRect(g, -w, -h * 0.5 + wob, w * 2, h, h * 0.45);
      g.fill();
      g.stroke();
      g.lineWidth = mw * 0.045;
      g.beginPath();
      g.moveTo(-w + 8, wob);
      g.lineTo(w - 8, wob);
      for (let i = 1; i < 4; i++) {
        const x = -w + (i * w * 2) / 4;
        g.moveTo(x, -h * 0.5 + 4 + wob);
        g.lineTo(x, h * 0.5 - 4 + wob);
      }
      g.stroke();
    } else if (shape === 'wave') {
      const w = mw * 0.55;
      g.lineWidth = Math.max(8, mw * 0.1);
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const x = -w + u * w * 2;
        const y = Math.sin(u * TAU * 2 + this.t * 10) * mw * 0.07 + 6;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  private fangs(w: number, c: number, mw: number) {
    const g = this.g;
    g.fillStyle = '#fffaf0';
    g.lineWidth = 4;
    for (const sd of [-1, 1]) {
      const x = sd * w * 0.55;
      const y = c * mw * 0.18;
      g.beginPath();
      g.moveTo(x - 9, y + 2);
      g.lineTo(x, y - 20);
      g.lineTo(x + 9, y + 2);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  private buckTeeth(mw: number, y: number) {
    const g = this.g;
    g.fillStyle = '#fffaf0';
    g.lineWidth = 4;
    const w = mw * 0.13;
    roundRect(g, -w, y, w * 2, mw * 0.2, 5);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(0, y + mw * 0.2);
    g.stroke();
  }

  /** Sorriso de tubarão: sorrisão largo com duas fileiras de dentes (é a marca dele, até bravo). */
  private sharkGrin(mw: number, c: number, open: number, ink: string) {
    const g = this.g;
    const w = mw * 0.62;
    const corner = -mw * (0.1 + Math.max(0, c) * 0.06);
    const topC = mw * 0.2;
    const botC = topC + mw * 0.2 + open * mw * 0.5;
    const bez = (u: number, ctrl: number) => (1 - u) * (1 - u) * corner + 2 * u * (1 - u) * ctrl + u * u * corner;
    g.beginPath();
    g.moveTo(-w, corner);
    g.quadraticCurveTo(0, topC, w, corner);
    g.quadraticCurveTo(0, botC, -w, corner);
    g.closePath();
    g.fillStyle = '#4a1626';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#fffaf0';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const um = (u0 + u1) / 2;
      const x0 = -w + 2 * w * u0;
      const x1 = -w + 2 * w * u1;
      const xm = -w + 2 * w * um;
      const yt = bez(um, topC);
      g.beginPath();
      g.moveTo(x0, bez(u0, topC) - 4);
      g.lineTo(x1, bez(u1, topC) - 4);
      g.lineTo(xm, yt + mw * 0.17);
      g.closePath();
      g.fill();
      const yb = bez(um, botC);
      g.beginPath();
      g.moveTo(x0, bez(u0, botC) + 4);
      g.lineTo(x1, bez(u1, botC) + 4);
      g.lineTo(xm, yb - mw * 0.15);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.beginPath();
    g.moveTo(-w, corner);
    g.quadraticCurveTo(0, topC, w, corner);
    g.quadraticCurveTo(0, botC, -w, corner);
    g.closePath();
    g.strokeStyle = ink;
    g.lineWidth = mw * 0.06;
    g.stroke();
  }

  private drawMustache(cx: number, my: number) {
    const g = this.g;
    const lift = this.talkOpen * 10 + Math.sin(this.t * 3) * 1.5;
    g.save();
    g.translate(cx, my - 18 - lift);
    g.fillStyle = this.s.mustache!;
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -4);
      g.bezierCurveTo(sd * 30, -26, sd * 76, -18, sd * 92, 10);
      g.bezierCurveTo(sd * 74, 0, sd * 54, 14, sd * 26, 10);
      g.bezierCurveTo(sd * 14, 8, sd * 4, 4, 0, 4);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // ------------------------------------------------------------------ rosto de tela (pixel + CRT)
  private drawScreen() {
    const s = this.s;
    const g = this.g;
    const W = this.W;
    const H = this.H;
    const bsod = this.expr === 'caught';
    const glow = s.glow ?? '#62f3ff';
    const bg = s.screen ?? '#0b1a22';
    // fundo
    const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
    if (bsod) {
      gr.addColorStop(0, '#3b78f0');
      gr.addColorStop(1, '#1638a8');
    } else {
      gr.addColorStop(0, shade(bg, 1.7));
      gr.addColorStop(1, bg);
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // rosto em pixels
    const pix = this.pix!;
    const pg = pix.getContext('2d')!;
    pg.clearRect(0, 0, pix.width, pix.height);
    pg.fillStyle = bsod ? '#ffffff' : glow;
    this.pixelFace(pg, pix.width, pix.height, bsod);
    // brilho: borrado numa cópia a 1/4 e ampliado (shadowBlur no canvas cheio custava ~4 ms por rosto)
    const halo = this.halo!;
    const hg = halo.getContext('2d')!;
    const hs = halo.width / W;
    hg.clearRect(0, 0, halo.width, halo.height);
    hg.imageSmoothingEnabled = false;
    hg.shadowColor = bsod ? 'rgba(255,255,255,0.6)' : glow;
    hg.shadowBlur = 26 * hs;
    hg.drawImage(pix, 0, 0, halo.width, halo.height);
    hg.shadowBlur = 10 * hs;
    hg.drawImage(pix, 0, 0, halo.width, halo.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(halo, 0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.drawImage(pix, 0, 0, W, H);
    // grade de LED + scanlines (fixas, desenhadas uma vez) + faixa rolando + vinheta
    g.drawImage(this.crtGrid(), 0, 0);
    const band = ((this.t * 0.35) % 1.4) - 0.2;
    const bg2 = g.createLinearGradient(0, (band - 0.1) * H, 0, (band + 0.1) * H);
    bg2.addColorStop(0, 'rgba(255,255,255,0)');
    bg2.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    bg2.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = bg2;
    g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  private crtGrid() {
    if (this.grid) return this.grid;
    const W = this.W;
    const H = this.H;
    this.grid = document.createElement('canvas');
    this.grid.width = W;
    this.grid.height = H;
    const g = this.grid.getContext('2d')!;
    const cell = W / this.pix!.width;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 0; x < W; x += cell) g.fillRect(Math.round(x), 0, 1.5, H);
    for (let y = 0; y < H; y += cell) g.fillRect(0, Math.round(y), W, 1.5);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    return this.grid;
  }

  /** Desenha o rosto numa grade 64×N, pixel a pixel. */
  private pixelFace(pg: CanvasRenderingContext2D, w: number, h: number, bsod: boolean) {
    const p = this.cur;
    const lk = this.look;
    const e = this.expr;
    const dot = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < w && y < h) pg.fillRect(Math.round(x), Math.round(y), 1, 1);
    };
    const disc = (cx: number, cy: number, rx: number, ry: number, keep?: (x: number, y: number) => boolean) => {
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, Math.ceil(cy + ry)); y++)
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(w - 1, Math.ceil(cx + rx)); x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1 && (!keep || keep(x + 0.5, y + 0.5))) dot(x, y);
        }
    };
    const ring = (cx: number, cy: number, r: number, t: number) => {
      for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(h - 1, Math.ceil(cy + r + 1)); y++)
        for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(w - 1, Math.ceil(cx + r + 1)); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d <= r && d >= r - t) dot(x, y);
        }
    };
    const line = (x0: number, y0: number, x1: number, y1: number, t = 2) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pg.fillRect(Math.round(x0 + (x1 - x0) * u - t / 2), Math.round(y0 + (y1 - y0) * u - t / 2), t, t);
      }
    };
    const cx = w / 2;
    const cy = h / 2;
    if (bsod) {
      // ":(" e linhas de "texto" da tela azul
      const r = 3;
      pg.fillRect(8, 9, r, r);
      pg.fillRect(8, 17, r, r);
      for (let a = -1.1; a <= 1.1; a += 0.06) dot(26 - Math.cos(a) * 12 + 12, 15 + Math.sin(a) * 11);
      for (let a = -1.1; a <= 1.1; a += 0.06) dot(26 - Math.cos(a) * 12 + 13, 15 + Math.sin(a) * 11);
      pg.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) pg.fillRect(8, 32 + i * 4, [44, 36, 48, 22][i], 2);
      const k = Math.floor(this.t * 2) % 3;
      pg.fillRect(8, 49, 6 + k * 4, 1);
      pg.globalAlpha = 1;
      return;
    }
    const gap = 13;
    const ey = cy - 5 + lk.y * 2;
    const ex = lk.x * 4;
    const open = this.eyeOpen();
    for (const side of [-1, 1]) {
      const x = cx + side * gap + ex;
      const slope = this.lidSlope(side, open);
      const ry = 7.6 * p.size;
      const rx = 4.6 * p.size;
      const lidY = ey - ry + (1 - open) * 2 * ry + Math.max(0, p.tilt) * ry * 0.35;
      const keep = (px: number, py: number) => py >= lidY + slope * (px - x);
      if (e === 'happy') {
        line(x - 5, ey + 2, x, ey - 3, 2);
        line(x, ey - 3, x + 5, ey + 2, 2);
      } else if (e === 'clutch') {
        const d = side;
        line(x - 4 * d, ey - 4, x + 3 * d, ey, 2);
        line(x + 3 * d, ey, x - 4 * d, ey + 4, 2);
      } else if (e === 'alert' && !this.s.mean) {
        ring(x, ey, 6.2 * p.size * 0.82, 2);
        disc(x + lk.x * 1.5, ey + lk.y * 1.5, 1.6, 1.6);
      } else if (e === 'sleep' || open < 0.12) {
        line(x - 4, ey + 1, x - 1, ey + 3, 2);
        line(x - 1, ey + 3, x + 2, ey + 3, 2);
        line(x + 2, ey + 3, x + 4, ey + 1, 2);
      } else if (e === 'bored') {
        pg.fillRect(Math.round(x - 4), Math.round(ey + 1), 9, 2);
        disc(x, ey + 4, 3, 2.2, (_, py) => py >= ey + 3);
      } else {
        disc(x, ey, rx, ry, keep);
        // brilho (pixel apagado)
        if (open > 0.6) pg.clearRect(Math.round(x + 1), Math.round(ey - ry + 2), 1, 2);
      }
    }
    if (this.s.mean && e !== 'happy') {
      for (const side of [-1, 1]) {
        const x = cx + side * gap + ex;
        line(x - side * 5, ey - 7 + p.tilt * 2, x + side * 4, ey - 10, 2);
      }
    }
    // boca
    const my = cy + 9;
    const mo = this.talkOpen;
    if (e === 'talk') {
      for (let i = 0; i < 5; i++) {
        const hh = 1 + Math.round(Math.abs(Math.sin(this.t * (9 + i * 2.3) + i)) * 6 * (0.4 + mo));
        pg.fillRect(Math.round(cx - 9 + i * 4), Math.round(my - hh / 2), 2, hh);
      }
    } else if (e === 'happy' || (e === 'alert' && this.s.mean)) {
      disc(cx, my - 1, 7, 5, (_, py) => py >= my - 1);
      pg.fillRect(Math.round(cx - 7), Math.round(my - 1), 14, 1);
    } else if (e === 'alert' || e === 'sleep') {
      ring(cx, my + 1, e === 'sleep' ? 2.2 : 3.2, 1.2);
    } else if (e === 'clutch') {
      for (let i = 0; i < 8; i++) pg.fillRect(Math.round(cx - 8 + i * 2), Math.round(my + (i % 2 ? 1 : -1) + Math.sin(this.t * 30) * 0.6), 2, 2);
    } else {
      const c = p.curve;
      for (let i = -6; i <= 6; i++) {
        const u = i / 6;
        dot(cx + i, my + (1 - u * u) * c * 3 - c * 1.2);
        dot(cx + i, my + 1 + (1 - u * u) * c * 3 - c * 1.2);
      }
    }
    // extras: suor, "zZ", "..." do tédio
    if (p.sweat > 0.3) {
      const k = (this.t * 1.2) % 1;
      disc(cx + 24, 8 + k * 14, 1.6, 2.2);
    }
    if (e === 'sleep') {
      const k = (this.t * 0.5) % 1;
      const zx = cx + 18 + k * 6;
      const zy = 12 - k * 8;
      line(zx, zy, zx + 4, zy, 1);
      line(zx + 4, zy, zx, zy + 4, 1);
      line(zx, zy + 4, zx + 4, zy + 4, 1);
    }
    if (e === 'bored') {
      const k = Math.floor(this.t * 2.5) % 4;
      for (let i = 0; i < k; i++) pg.fillRect(Math.round(cx + 14 + i * 3), Math.round(my + 1), 2, 2);
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hexA(hex: string, a: number) {
  const c = new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${THREE.MathUtils.clamp(a, 0, 1)})`;
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return `#${c.getHexString()}`;
}
