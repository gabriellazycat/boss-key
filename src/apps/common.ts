import type { SfxName } from '../core/Audio';

export type AppId = 'planilha' | 'tiro' | 'pesca' | 'video';

export interface ScreenInput {
  /** Cursor em coordenadas do canvas do monitor. */
  x: number;
  y: number;
  down: boolean;
  pressed: boolean;
  released: boolean;
  key: (code: string) => boolean;
  keyPressed: (code: string) => boolean;
}

export type AppEvent =
  | { t: 'fun'; v: number; label?: string }
  | { t: 'sfx'; name: SfxName; param?: number; spatial?: boolean }
  | { t: 'flash'; color: string; v: number }
  | { t: 'beat'; hit: boolean; perfect: boolean }
  | { t: 'consume'; what: 'tiro' | 'pesca' }
  | { t: 'toast'; text: string };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AppHost {
  emit(e: AppEvent): void;
  stock: { tiro: number; pesca: number; video: number };
  tiroCooldown: number;
  headphones: boolean;
}

export abstract class App {
  abstract readonly id: AppId;
  abstract readonly title: string;
  abstract readonly forbidden: boolean;
  abstract readonly accent: string;
  abstract readonly icon: string;
  /** Atividade rodando (gera FUN/Suspeita/Calor/ruído). */
  running = false;
  constructor(protected host: AppHost) {}
  abstract update(dt: number, inp: ScreenInput, t: number): void;
  abstract draw(g: CanvasRenderingContext2D, r: Rect, t: number): void;
  /** Rótulo de estoque na barra de tarefas. */
  badge(): string {
    return '';
  }
  onShow() {}
  onHide() {}
  resetDay() {}
}

export const FONT = 'Fredoka, system-ui, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, monospace';

export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 600, font = FONT) {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

export function ball(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, look = 0, tie?: string) {
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(x, y + r * 1.05, r * 0.8, r * 0.22, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(20,24,36,0.9)';
  g.lineWidth = Math.max(1.5, r * 0.08);
  g.stroke();
  g.fillStyle = '#0b0b0e';
  rr(g, x - r * 0.78, y - r * 0.36, r * 1.56, r * 0.6, r * 0.3);
  g.fill();
  for (const s of [-1, 1]) {
    g.fillStyle = '#f4f4f0';
    g.beginPath();
    g.ellipse(x + s * r * 0.34, y - r * 0.06, r * 0.19, r * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(x + s * r * 0.34 + look * r * 0.08, y - r * 0.06, r * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  if (tie) {
    g.fillStyle = tie;
    g.beginPath();
    g.moveTo(x - r * 0.08, y + r * 0.42);
    g.lineTo(x + r * 0.08, y + r * 0.42);
    g.lineTo(x + r * 0.14, y + r * 0.82);
    g.lineTo(x, y + r * 0.95);
    g.lineTo(x - r * 0.14, y + r * 0.82);
    g.closePath();
    g.fill();
  }
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
