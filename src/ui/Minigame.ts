import { rr, text, clamp, lerp, easeOutBack, MONO, FONT } from '../apps/common';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../core/Audio';

/**
 * Minigames rápidos (v0.10, estilo Among Us): toda ação de tarefa, missão e distração abre um painel no centro da
 * tela (~metade dela). Você fica parado e meio cego — o mundo continua nas bordas e o som (a porta!) continua.
 * O cursor é virtual (o mouse continua travado no jogo): movimento do mouse move o cursor, clique é o botão esquerdo.
 * Q sai sem progresso (ESC também solta o mouse e pausa, o que fecha o painel).
 *
 * v0.11: acabamento — fundo temático, peças com cara de hardware, fios de verdade, faíscas/tremida/flash nos
 * acertos e erros, carimbo verde ao concluir (~0,4 s) e indicador de progresso. Tudo em canvas, sem bibliotecas.
 */
export type MgKind = 'fios' | 'revirar' | 'fechadura' | 'digitar' | 'arrastar' | 'ritmo' | 'sintonizar' | 'discar' | 'alavanca' | 'balcao' | 'ponteiros' | 'poster' | 'comer';

/** Tamanho lógico do painel (a CSS escala). */
const PW = 640;
const PH = 400;
/** Altura da barra de título (o jogo desenha deslocado por ela) e área útil do jogo. */
const TOP = 30;
const AREA_H = 384;
/** Resolução interna do canvas (nitidez em telas grandes). */
const SS = 2;
const TAU = Math.PI * 2;
/** Duração do carimbo de conclusão (s). */
const STAMP_T = 0.4;

export interface MgIO {
  x: number;
  y: number;
  down: boolean;
  click: boolean;
  release: boolean;
  /** Movimento do mouse neste quadro (para discos e alavancas). */
  dx: number;
  dy: number;
  key: (code: string) => boolean;
}

export interface MgSpec {
  kind: MgKind;
  title: string;
  hint?: string;
  opts?: Record<string, unknown>;
  onDone: (result: unknown) => void;
  onCancel?: () => void;
}

type Snd = (name: string, vol?: number) => void;

// ------------------------------------------------------------------ utilidades de desenho
const within = (px: number, py: number, x: number, y: number, w: number, h: number) => px >= x && px <= x + w && py >= y && py <= y + h;
const inBox = (io: MgIO, x: number, y: number, w: number, h: number) => within(io.x, io.y, x, y, w, h);
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
const COLORS = ['#e5484d', '#3e8cff', '#3ddc97', '#ffd23f'];
const DARK = ['#8c1f26', '#1d4f9e', '#13794f', '#a8800b'];
const LIGHT = ['#ff9a9d', '#9cc4ff', '#9bf2cc', '#fff3a8'];
const INK = '#10131c';
const MUTED = '#aeb7cc';

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | CanvasGradient) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

/** Esfera/botão com brilho. */
function ball(g: CanvasRenderingContext2D, x: number, y: number, r: number, c0: string, c1: string) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, c0);
  gr.addColorStop(1, c1);
  disc(g, x, y, r, gr);
}

/** Placa com degradê vertical e borda clara. */
function plate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, top: string, bot: string, border = 'rgba(255,255,255,0.14)') {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  rr(g, x, y, w, h, r);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = border;
  g.stroke();
}

/** Rebaixo (sombra interna). */
function inset(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill = 'rgba(4,7,14,0.7)') {
  rr(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(0,0,0,0.65)';
  g.stroke();
  g.beginPath();
  g.moveTo(x + r, y + h + 1);
  g.lineTo(x + w - r, y + h + 1);
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.stroke();
}

function screw(g: CanvasRenderingContext2D, x: number, y: number) {
  ball(g, x, y, 5, '#9aa3ba', '#4a5368');
  g.beginPath();
  g.moveTo(x - 3, y + 1);
  g.lineTo(x + 3, y - 1);
  g.lineWidth = 1.4;
  g.strokeStyle = '#20263a';
  g.stroke();
}

/** Texto com largura máxima (espreme em vez de vazar). */
function fit(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign, weight: number, maxW: number) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y, maxW);
}

/** Símbolos para não depender só da cor: 0 círculo, 1 triângulo, 2 quadrado, 3 losango. */
function shape(g: CanvasRenderingContext2D, i: number, x: number, y: number, r: number, fill: string) {
  g.beginPath();
  if (i === 0) g.arc(x, y, r, 0, TAU);
  else if (i === 1) {
    g.moveTo(x, y - r);
    g.lineTo(x + r, y + r * 0.8);
    g.lineTo(x - r, y + r * 0.8);
    g.closePath();
  } else if (i === 2) g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else {
    g.moveTo(x, y - r * 1.1);
    g.lineTo(x + r, y);
    g.lineTo(x, y + r * 1.1);
    g.lineTo(x - r, y);
    g.closePath();
  }
  g.fillStyle = fill;
  g.fill();
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  col: string;
}
interface Ring {
  x: number;
  y: number;
  t: number;
  col: string;
}

/** Um minigame: `update` até `done`; `result` vai para quem abriu. `solve()` = resolve na hora (testes e robôs). */
abstract class Mg {
  t = 0;
  done = false;
  result: unknown = true;
  /** Mensagem curta de erro/acerto no rodapé. */
  flash = '';
  flashT = 0;
  flashColor = '#fff';
  /** Cursor (coordenadas do jogo) — o painel atualiza antes de cada update/draw. */
  mx = PW / 2;
  my = PH / 2;
  /** Carimbo verde ao concluir (alguns jogos têm a própria revelação e desligam). */
  stamp = true;
  // efeitos (pools fixos: nada é alocado por quadro)
  shakeT = 0;
  redT = 0;
  popT = 0;
  private parts: Part[] = Array.from({ length: 96 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, col: '#fff' }));
  private rings: Ring[] = Array.from({ length: 8 }, () => ({ x: 0, y: 0, t: -1, col: '#fff' }));
  private pi = 0;
  private ri = 0;
  constructor(
    protected opts: Record<string, unknown>,
    protected sfx: Snd,
  ) {}
  abstract update(dt: number, io: MgIO): void;
  abstract draw(g: CanvasRenderingContext2D): void;
  solve() {
    this.done = true;
  }
  /** Progresso para a barrinha do título: n de `of` passos (null = sem indicador). */
  prog(): [number, number] | null {
    return null;
  }
  /** Dica que muda com a fase (vazio = usa a dica padrão do tipo). */
  liveHint() {
    return '';
  }
  protected say(msg: string, color = '#fff') {
    this.flash = msg;
    this.flashT = 1;
    this.flashColor = color;
  }
  /** Passo certo: faíscas + anel + "pop" do painel. */
  protected good(x: number, y: number, col = '#3ddc97', n = 16) {
    this.burst(x, y, col, n);
    const r = this.rings[(this.ri = (this.ri + 1) % this.rings.length)];
    r.x = x;
    r.y = y;
    r.t = 0;
    r.col = col;
    this.popT = 1;
  }
  /** Passo errado: tremida + flash vermelho. */
  protected bad() {
    this.shakeT = 1;
    this.redT = 1;
  }
  protected burst(x: number, y: number, col: string, n = 12) {
    for (let k = 0; k < n; k++) {
      const p = this.parts[(this.pi = (this.pi + 1) % this.parts.length)];
      const a = Math.random() * TAU;
      const v = 70 + Math.random() * 190;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 60;
      p.max = p.life = 0.4 + Math.random() * 0.35;
      p.size = 2 + Math.random() * 2.5;
      p.col = col;
    }
  }
  fxStep(dt: number) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const r of this.rings) {
      if (r.t < 0) continue;
      r.t += dt * 3.2;
      if (r.t >= 1) r.t = -1;
    }
    this.shakeT = Math.max(0, this.shakeT - dt * 3);
    this.redT = Math.max(0, this.redT - dt * 3.5);
    this.popT = Math.max(0, this.popT - dt * 4);
  }
  fxDraw(g: CanvasRenderingContext2D) {
    g.lineCap = 'round';
    for (const r of this.rings) {
      if (r.t < 0) continue;
      g.globalAlpha = 1 - r.t;
      g.strokeStyle = r.col;
      g.lineWidth = 4 * (1 - r.t) + 1;
      g.beginPath();
      g.arc(r.x, r.y, 8 + easeOutBack(r.t) * 40, 0, TAU);
      g.stroke();
    }
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      g.globalAlpha = clamp(p.life / p.max, 0, 1);
      g.strokeStyle = p.col;
      g.lineWidth = p.size;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ fios: ligar 4 cores
const WY = (i: number) => 110 + i * 70;
const PLUG_L = 90;
const PLUG_R = 550;

class Fios extends Mg {
  private right = shuffle([0, 1, 2, 3]);
  private links: (number | null)[] = [null, null, null, null];
  private linkT = [9, 9, 9, 9];
  private drag: number | null = null;
  private back: { i: number; x: number; y: number; t: number } | null = null;
  update(dt: number, io: MgIO) {
    for (let i = 0; i < 4; i++) this.linkT[i] += dt;
    if (this.back) {
      this.back.t += dt;
      if (this.back.t > 0.22) this.back = null;
    }
    for (let i = 0; i < 4; i++) if (io.click && this.links[i] === null && Math.hypot(io.x - PLUG_L, io.y - WY(i)) < 26) this.drag = i;
    if (io.release && this.drag !== null) {
      const j = this.right.findIndex((_, k) => Math.hypot(io.x - PLUG_R, io.y - WY(k)) < 30);
      if (j >= 0 && this.right[j] === this.drag) {
        this.links[this.drag] = j;
        this.linkT[this.drag] = 0;
        this.good(PLUG_R, WY(j), COLORS[this.drag]);
        this.sfx('click', 0.7);
      } else {
        this.back = { i: this.drag, x: io.x, y: io.y, t: 0 };
        if (j >= 0) {
          this.say('cor errada', '#ff6b6b');
          this.bad();
          this.sfx('miss', 0.5);
        }
      }
      this.drag = null;
    }
    if (this.links.every((x) => x !== null)) this.done = true;
  }
  prog(): [number, number] {
    return [this.links.filter((l) => l !== null).length, 4];
  }
  draw(g: CanvasRenderingContext2D) {
    plate(g, 18, 58, 604, 308, 16, '#1c2438', '#10162a');
    screw(g, 32, 72);
    screw(g, 608, 72);
    screw(g, 32, 352);
    screw(g, 608, 352);
    inset(g, 134, 78, 372, 268, 12);
    // conectores (caixas) + faixa colorida com símbolo
    for (let i = 0; i < 4; i++) {
      const y = WY(i);
      plate(g, 28, y - 26, 86, 52, 10, '#4c566d', '#2a3144');
      rr(g, 36, y - 15, 30, 30, 7);
      g.fillStyle = COLORS[i];
      g.fill();
      shape(g, i, 51, y, 7, 'rgba(16,19,28,0.85)');
      plate(g, 526, y - 26, 86, 52, 10, '#4c566d', '#2a3144');
      rr(g, 574, y - 15, 30, 30, 7);
      g.fillStyle = COLORS[this.right[i]];
      g.fill();
      shape(g, this.right[i], 589, y, 7, 'rgba(16,19,28,0.85)');
    }
    // fios ligados
    for (let i = 0; i < 4; i++) {
      const l = this.links[i];
      if (l !== null) this.wire(g, PLUG_L, WY(i), PLUG_R, WY(l), i, 1, 1);
    }
    // fio recolhendo
    const b = this.back;
    if (b) {
      const p = clamp(b.t / 0.22, 0, 1);
      this.wire(g, PLUG_L, WY(b.i), lerp(b.x, PLUG_L, p), lerp(b.y, WY(b.i), p), b.i, 1 - p, 0.4);
    }
    // plugues por cima dos fios
    for (let i = 0; i < 4; i++) {
      const hover = this.drag !== null && Math.hypot(this.mx - PLUG_R, this.my - WY(i)) < 30;
      this.plug(g, PLUG_L, WY(i), i, this.links[i] !== null, false);
      const rc = this.right[i];
      const linked = this.links[rc] === i;
      const pulse = linked ? clamp(1 - this.linkT[rc] / 0.5, 0, 1) : 0;
      this.plug(g, PLUG_R, WY(i), rc, linked, hover);
      if (pulse > 0) {
        g.globalAlpha = pulse;
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(PLUG_R, WY(i), 22 + (1 - pulse) * 14, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }
  drawDrag(g: CanvasRenderingContext2D, io: MgIO) {
    if (this.drag === null) return;
    this.wire(g, PLUG_L, WY(this.drag), io.x, io.y, this.drag, 1, 1);
    this.plug(g, PLUG_L, WY(this.drag), this.drag, false, false);
    // ponta do fio na mão
    ball(g, io.x, io.y, 11, '#eef1f8', '#5d6680');
    disc(g, io.x, io.y, 7, COLORS[this.drag]);
    shape(g, this.drag, io.x, io.y, 4, 'rgba(16,19,28,0.85)');
  }
  private wirePath(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number) {
    const dx = Math.max(50, Math.abs(x1 - x0) * 0.45);
    g.beginPath();
    g.moveTo(x0, y0);
    g.bezierCurveTo(x0 + dx, y0 + sag, x1 - dx, y1 + sag, x1, y1);
  }
  private wire(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, i: number, alpha: number, slack: number) {
    const sag = 16 * slack;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = alpha;
    g.save();
    g.translate(0, 5);
    this.wirePath(g, x0, y0, x1, y1, sag);
    g.strokeStyle = 'rgba(0,0,0,0.38)';
    g.lineWidth = 15;
    g.stroke();
    g.restore();
    this.wirePath(g, x0, y0, x1, y1, sag);
    g.strokeStyle = DARK[i];
    g.lineWidth = 15;
    g.stroke();
    g.strokeStyle = COLORS[i];
    g.lineWidth = 10;
    g.stroke();
    g.save();
    g.translate(0, -2.5);
    this.wirePath(g, x0, y0, x1, y1, sag);
    g.strokeStyle = LIGHT[i];
    g.globalAlpha = alpha * 0.6;
    g.lineWidth = 2.5;
    g.stroke();
    g.restore();
    g.globalAlpha = 1;
  }
  private plug(g: CanvasRenderingContext2D, x: number, y: number, ci: number, lit: boolean, hover: boolean) {
    ball(g, x, y, 19, '#f4f6fc', '#5f687f');
    g.lineWidth = 2;
    g.strokeStyle = '#1b2134';
    g.stroke();
    disc(g, x, y, 13.5, '#151a2a');
    disc(g, x, y, 10, COLORS[ci]);
    shape(g, ci, x, y, 5.5, 'rgba(16,19,28,0.85)');
    if (lit || hover) {
      g.strokeStyle = hover ? '#ffffff' : rgba(COLORS[ci], 0.6);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, 23, 0, TAU);
      g.stroke();
    }
  }
}

// ------------------------------------------------------------------ revirar: clicar nos objetos até achar (ou não)
class Revirar extends Mg {
  private icons = shuffle(['📁', '🧥', '☕', '📄', '🗑', '🧾']);
  private open: number[] = [];
  private shake = -1;
  private shakeTile = 0;
  private target: number;
  private endT = -1;
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.target = opts.found ? Math.floor(Math.random() * 6) : -1;
    this.result = false;
    this.stamp = false;
  }
  private tx(i: number) {
    return 90 + (i % 3) * 170;
  }
  private ty(i: number) {
    return 80 + Math.floor(i / 3) * 140;
  }
  prog(): [number, number] {
    return [this.open.length, 6];
  }
  update(dt: number, io: MgIO) {
    if (this.endT >= 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.done = true;
      return;
    }
    if (this.shake >= 0) {
      this.shakeTile -= dt;
      if (this.shakeTile <= 0) {
        const i = this.shake;
        this.open.push(i);
        if (i === this.target) {
          this.result = true;
          this.say(`achou! ${String(this.opts.icon ?? '🔑')}`, '#3ddc97');
          this.good(this.tx(i) + 60, this.ty(i) + 55, '#3ddc97', 22);
          this.sfx('coin', 0.8);
          this.endT = 0.7;
        } else {
          this.burst(this.tx(i) + 60, this.ty(i) + 55, '#8a93a8', 8);
          if (this.open.length === 6) {
            this.say('nada aqui…', '#ffb36b');
            this.endT = 0.8;
          }
        }
        this.shake = -1;
      }
      return;
    }
    if (!io.click) return;
    for (let i = 0; i < 6; i++) {
      if (!this.open.includes(i) && inBox(io, this.tx(i), this.ty(i), 120, 110)) {
        this.shake = i;
        this.shakeTile = 0.35;
        this.sfx('crumple', 0.5);
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    plate(g, 62, 56, 516, 304, 18, '#232b42', '#161c30');
    screw(g, 76, 70);
    screw(g, 564, 70);
    screw(g, 76, 346);
    screw(g, 564, 346);
    for (let i = 0; i < 6; i++) {
      const isOpen = this.open.includes(i);
      const hover = !isOpen && this.shake < 0 && within(this.mx, this.my, this.tx(i), this.ty(i), 120, 110);
      const x = this.tx(i) + (this.shake === i ? Math.sin(this.t * 60) * 5 : 0);
      const y = this.ty(i) - (hover ? 3 : 0);
      if (isOpen) {
        inset(g, x, y, 120, 110, 14, i === this.target ? 'rgba(61,220,151,0.16)' : 'rgba(6,9,18,0.7)');
        if (i === this.target) {
          ball(g, x + 60, y + 55, 42, 'rgba(61,220,151,0.5)', 'rgba(61,220,151,0)');
          text(g, String(this.opts.icon ?? '🔑'), x + 60, y + 55, 52, '#fff', 'center');
        } else text(g, 'vazio', x + 60, y + 55, 16, '#7d869c', 'center', 600);
      } else {
        plate(g, x, y, 120, 110, 14, hover ? '#5d6c92' : '#4a5676', hover ? '#3b4766' : '#2f3a56', hover ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.14)');
        text(g, this.icons[i], x + 60, y + 52, 48, '#fff', 'center');
        rr(g, x + 40, y + 94, 40, 6, 3);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fill();
      }
    }
  }
  solve() {
    this.result = !!this.opts.found;
    this.done = true;
  }
}

// ------------------------------------------------------------------ fechadura: girar o disco até o clique, 3 vezes
class Fechadura extends Mg {
  private combo: number[] = [Math.floor(Math.random() * 10), Math.floor(Math.random() * 10), Math.floor(Math.random() * 10)];
  private idx = 0;
  private val = 0;
  private hold = 0;
  private dist() {
    const target = this.combo[Math.min(this.idx, 2)];
    return Math.min(Math.abs(this.val - target), 10 - Math.abs(this.val - target));
  }
  prog(): [number, number] {
    return [this.idx, 3];
  }
  update(dt: number, io: MgIO) {
    this.val = (this.val + io.dx * 0.035 + 1000) % 10;
    const d = this.dist();
    if (d < 0.35) {
      this.hold += dt;
      if (this.hold > 0.45) {
        this.sfx('click', 0.9);
        this.good(320, 195, '#ffd23f', 18);
        this.idx++;
        this.hold = 0;
        if (this.idx >= 3) this.done = true;
      }
    } else this.hold = 0;
  }
  draw(g: CanvasRenderingContext2D) {
    const cx = 320;
    const cy = 195;
    const R = 125;
    // moldura do cofre
    plate(g, 120, 36, 400, 336, 24, '#2b3350', '#141a2e');
    ball(g, cx, cy, R + 12, '#a3acc2', '#3a4256');
    disc(g, cx, cy, R + 3, '#0f1427');
    ball(g, cx, cy, R, '#303a5c', '#151a2e');
    // marcas (50) e números girando
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      for (let k = 0; k < 50; k++) {
        const major = k % 5 === 0;
        if (major !== (pass === 1)) continue;
        const a = ((k / 5 - this.val) / 10) * TAU - Math.PI / 2;
        const r0 = R - (major ? 20 : 12);
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5));
      }
      g.strokeStyle = pass ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)';
      g.lineWidth = pass ? 2.5 : 1.5;
      g.stroke();
    }
    for (let k = 0; k < 10; k++) {
      const a = ((k - this.val) / 10) * TAU - Math.PI / 2;
      text(g, String(k), cx + Math.cos(a) * (R - 42), cy + Math.sin(a) * (R - 42), 24, '#e6ebff', 'center', 700, MONO);
    }
    // botão central
    ball(g, cx, cy, 36, '#d3d8e8', '#4f576e');
    disc(g, cx, cy, 24, '#262d44');
    const ka = (this.val / 10) * TAU - Math.PI / 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(ka) * 8, cy + Math.sin(ka) * 8);
    g.lineTo(cx + Math.cos(ka) * 22, cy + Math.sin(ka) * 22);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.stroke();
    // ponteiro fixo
    g.beginPath();
    g.moveTo(cx - 12, cy - R - 17);
    g.lineTo(cx + 12, cy - R - 17);
    g.lineTo(cx, cy - R + 3);
    g.closePath();
    g.fillStyle = '#ffd23f';
    g.fill();
    g.strokeStyle = '#6b5300';
    g.lineWidth = 1.5;
    g.stroke();
    // medidor "quente/frio" — o clique se ouve chegando
    const s = clamp(1 - this.dist() / 3, 0, 1);
    inset(g, 538, 100, 40, 200, 10);
    if (s > 0) {
      rr(g, 543, 295 - s * 190, 30, s * 190, 6);
      g.fillStyle = s > 0.85 ? '#3ddc97' : s > 0.4 ? '#ffd23f' : '#3e8cff';
      g.fill();
    }
    text(g, 'QUENTE', 558, 84, 14, '#ffb36b', 'center', 700);
    text(g, 'FRIO', 558, 318, 14, '#8cb8ff', 'center', 700);
  }
}

// ------------------------------------------------------------------ teclado numérico (código / discar)
class Teclado extends Mg {
  private typed = '';
  private code: string;
  private pk = -1;
  private pt = 0;
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.code = String(opts.code ?? '123');
  }
  prog(): [number, number] | null {
    return this.code.length <= 10 ? [this.typed.length, this.code.length] : null;
  }
  private press(d: string) {
    this.typed += d;
    this.pk = Number(d);
    this.pt = 0.16;
    this.sfx('click', 0.5);
    if (this.typed.length < this.code.length) return;
    if (this.typed === this.code) {
      this.done = true;
      this.good(320, 100, '#3ddc97', 20);
    } else {
      this.say('errado', '#ff6b6b');
      this.bad();
      this.sfx('miss', 0.6);
      this.typed = '';
    }
  }
  update(dt: number, io: MgIO) {
    this.pt = Math.max(0, this.pt - dt);
    for (let k = 0; k <= 9; k++) if (io.key(`Digit${k}`) || io.key(`Numpad${k}`)) this.press(String(k));
    if (!io.click) return;
    for (let k = 0; k < 10; k++) {
      const [x, y] = this.keyPos(k);
      if (inBox(io, x, y, 70, 52)) this.press(String(k));
    }
  }
  private keyPos(k: number): [number, number] {
    if (k === 0) return [285, 330];
    return [210 + ((k - 1) % 3) * 75, 150 + Math.floor((k - 1) / 3) * 60];
  }
  draw(g: CanvasRenderingContext2D) {
    plate(g, 180, 60, 280, 326, 20, '#2a3350', '#161c30');
    screw(g, 194, 74);
    screw(g, 446, 74);
    // visor LCD
    inset(g, 200, 70, 240, 60, 10, '#0b1a14');
    g.fillStyle = 'rgba(61,220,151,0.06)';
    rr(g, 204, 74, 232, 24, 6);
    g.fill();
    text(g, this.typed.padEnd(this.code.length, '_').split('').join(' '), 320, 101, 34, '#3ddc97', 'center', 700, MONO);
    if (this.opts.show) {
      rr(g, 130, 14, 380, 34, 8);
      g.fillStyle = '#ffe58a';
      g.fill();
      fit(g, String(this.opts.show), 320, 32, 18, '#3b2b00', 'center', 700, 360);
    }
    for (let k = 0; k < 10; k++) {
      const [x, y] = this.keyPos(k);
      const hover = within(this.mx, this.my, x, y, 70, 52);
      const lit = this.pk === k && this.pt > 0;
      plate(g, x, y + (lit ? 2 : 0), 70, 52, 10, lit ? '#8be8bd' : hover ? '#66749c' : '#515e82', lit ? '#3ddc97' : hover ? '#454f72' : '#323b58', hover ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.14)');
      text(g, String(k), x + 35, y + 28 + (lit ? 2 : 0), 26, lit ? INK : '#fff', 'center', 700, MONO);
    }
  }
}

// ------------------------------------------------------------------ arrastar: pastas para gavetas da cor / e-mails para a pasta certa
class Arrastar extends Mg {
  private items: { label: string; bin: number }[];
  private bins: { label: string; color: string }[];
  private held = false;
  private errors = 0;
  private total: number;
  private fb = -1;
  private fbT = 0;
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    const n = Number(opts.n ?? 5);
    if (opts.mode === 'emails') {
      this.bins = [{ label: 'IMPORTANTE', color: '#3e8cff' }, { label: 'SPAM', color: '#e5484d' }];
      const imp = ['Reunião: metas Q4', 'RE: contrato assinado', 'Relatório do chefe', 'Folha de ponto', 'Cliente: proposta'];
      const spam = ['GANHE 1 MILHÃO!!!', 'Seu pacote chegou?', 'Remédio milagroso', 'Você foi sorteado', 'Promoção de tênis'];
      this.items = Array.from({ length: n }, () => (Math.random() < 0.5 ? { label: imp[Math.floor(Math.random() * 5)], bin: 0 } : { label: spam[Math.floor(Math.random() * 5)], bin: 1 }));
    } else {
      this.bins = ['VERMELHO', 'AZUL', 'VERDE', 'AMARELO'].map((label, i) => ({ label, color: COLORS[i] }));
      this.items = Array.from({ length: n }, () => {
        const b = Math.floor(Math.random() * 4);
        return { label: `pasta ${this.bins[b].label.toLowerCase()}`, bin: b };
      });
    }
    this.total = this.items.length;
    this.result = 0;
  }
  prog(): [number, number] {
    return [this.total - this.items.length, this.total];
  }
  private binBox(i: number): [number, number, number, number] {
    const w = 560 / this.bins.length;
    return [40 + i * w + 6, 270, w - 12, 100];
  }
  update(dt: number, io: MgIO) {
    this.fbT = Math.max(0, this.fbT - dt);
    const it = this.items[0];
    if (!it) return;
    if (io.click && inBox(io, 200, 60, 240, 80)) this.held = true;
    if (io.release && this.held) {
      this.held = false;
      const i = this.bins.findIndex((_, k) => inBox(io, ...this.binBox(k)));
      if (i < 0) return;
      const [bx, by, bw, bh] = this.binBox(i);
      this.fb = i;
      this.fbT = 0.3;
      if (i === it.bin) {
        this.items.shift();
        this.good(bx + bw / 2, by + bh / 2, this.bins[i].color, 14);
        this.sfx('swish', 0.5);
        if (!this.items.length) {
          this.result = this.errors;
          this.done = true;
        }
      } else {
        this.errors++;
        this.say('lugar errado!', '#ff6b6b');
        this.bad();
        this.sfx('miss', 0.6);
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    const emails = this.opts.mode === 'emails';
    // área de chegada
    inset(g, 170, 46, 300, 110, 16, 'rgba(6,9,18,0.5)');
    text(g, `faltam ${this.items.length}`, 320, 168, 16, MUTED, 'center', 700);
    this.bins.forEach((b, i) => {
      const [x, y, w, h] = this.binBox(i);
      const hover = this.held && within(this.mx, this.my, x, y, w, h);
      const wrong = this.fb === i && this.fbT > 0 && this.redT > 0;
      plate(g, x, y, w, h, 14, b.color, rgba(b.color, 0.6), hover ? '#fff' : 'rgba(255,255,255,0.3)');
      g.fillStyle = 'rgba(0,0,0,0.18)';
      rr(g, x + 8, y + 8, w - 16, 10, 5);
      g.fill();
      if (!emails) shape(g, i, x + w / 2, y + 42, 12, 'rgba(16,19,28,0.75)');
      text(g, b.label, x + w / 2, y + (emails ? h / 2 : 76), 16, INK, 'center', 800);
      if (hover || wrong) {
        g.strokeStyle = wrong ? '#ff6b6b' : '#fff';
        g.lineWidth = 3;
        rr(g, x - 2, y - 2, w + 4, h + 4, 16);
        g.stroke();
      }
    });
    // pilha atrás do item da vez (sempre no lugar de descanso)
    for (let k = Math.min(2, this.items.length - 1); k >= 1; k--) plate(g, 200 + k * 5, 60 + k * 5, 240, 80, 12, '#c9c4b6', '#8f8a7c');
  }
  drawDrag(g: CanvasRenderingContext2D, io: MgIO) {
    const it = this.items[0];
    if (!it) return;
    const emails = this.opts.mode === 'emails';
    const x = this.held ? io.x - 120 : 200;
    const y = this.held ? io.y - 40 : 60;
    // sombra
    rr(g, x + 4, y + (this.held ? 14 : 6), 240, 80, 12);
    g.fillStyle = `rgba(0,0,0,${this.held ? 0.4 : 0.3})`;
    g.fill();
    if (emails) {
      plate(g, x, y, 240, 80, 12, '#fbf8f0', '#d9d4c4', 'rgba(0,0,0,0.25)');
      text(g, '✉', x + 26, y + 40, 28, '#3a4260', 'center', 700);
      fit(g, it.label, x + 134, y + 40, 17, '#1b2233', 'center', 700, 190);
    } else {
      const c = COLORS[it.bin];
      rr(g, x + 10, y - 8, 70, 16, 6);
      g.fillStyle = DARK[it.bin];
      g.fill();
      plate(g, x, y, 240, 80, 12, c, DARK[it.bin], 'rgba(255,255,255,0.35)');
      shape(g, it.bin, x + 38, y + 40, 16, 'rgba(16,19,28,0.7)');
      fit(g, it.label, x + 146, y + 40, 18, INK, 'center', 800, 140);
    }
  }
  solve() {
    this.result = 0;
    this.done = true;
  }
}

// ------------------------------------------------------------------ ritmo: clique quando a folha passa na linha (xerox)
class Ritmo extends Mg {
  private x = -60;
  private hits = 0;
  private need: number;
  private belt = 0;
  private zoneT = 0;
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.need = Number(opts.n ?? 6);
    this.result = 0;
  }
  prog(): [number, number] | null {
    return this.need <= 10 ? [this.hits, this.need] : null;
  }
  update(dt: number, io: MgIO) {
    this.belt = (this.belt + dt * 330) % 28;
    this.zoneT = Math.max(0, this.zoneT - dt);
    this.x += dt * 330;
    if (this.x > 700) {
      this.x = -60;
      this.say('passou!', '#ffb36b');
      this.bad();
      this.result = Number(this.result) + 1;
    }
    if (io.click || io.key('KeyF')) {
      if (Math.abs(this.x - 320) < 34) {
        this.hits++;
        this.zoneT = 0.25;
        this.good(320, 215, '#3ddc97', 18);
        this.sfx('stamp', 0.7);
        this.x = -60 - Math.random() * 120;
        if (this.hits >= this.need) this.done = true;
      } else {
        this.say('fora do tempo', '#ff6b6b');
        this.bad();
        this.result = Number(this.result) + 1;
        this.sfx('miss', 0.5);
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    plate(g, 10, 120, 620, 190, 16, '#2a3250', '#171d33');
    // esteira
    inset(g, 20, 170, 600, 90, 8, '#161b2c');
    g.save();
    rr(g, 20, 170, 600, 90, 8);
    g.clip();
    g.beginPath();
    for (let x = 20 - this.belt; x < 640; x += 28) {
      g.moveTo(x, 170);
      g.lineTo(x, 260);
    }
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 3;
    g.stroke();
    g.restore();
    // janela do scanner
    const inZone = Math.abs(this.x - 320) < 34;
    const glow = clamp((inZone ? 0.45 : 0.22) + this.zoneT * 1.2, 0, 0.9);
    g.fillStyle = rgba('#3ddc97', glow);
    g.fillRect(286, 164, 68, 102);
    g.strokeStyle = '#3ddc97';
    g.lineWidth = 3;
    g.beginPath();
    for (const [sx, sy, dx, dy] of [[286, 164, 1, 1], [354, 164, -1, 1], [286, 266, 1, -1], [354, 266, -1, -1]] as const) {
      g.moveTo(sx + dx * 14, sy);
      g.lineTo(sx, sy);
      g.lineTo(sx, sy + dy * 14);
    }
    g.stroke();
    g.fillStyle = rgba('#b9ffe0', 0.5 + 0.3 * Math.sin(this.t * 14));
    g.fillRect(319, 164, 2, 102);
    // folha
    const sx = this.x - 30;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(sx + 3, 185, 60, 70);
    plate(g, sx, 180, 60, 70, 3, '#ffffff', '#e4e4dc', 'rgba(0,0,0,0.25)');
    g.fillStyle = '#a7adbd';
    for (let k = 0; k < 4; k++) g.fillRect(sx + 8, 192 + k * 12, k === 3 ? 24 : 44, 4);
    text(g, `${this.hits}/${this.need} cópias`, 320, 292, 22, '#fff', 'center', 700);
    // bandeja de saída
    for (let k = 0; k < this.hits && k < 10; k++) {
      g.fillStyle = '#f2f2ea';
      g.fillRect(40 + k * 4, 336 - k * 2, 40, 22);
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 1;
      g.strokeRect(40 + k * 4, 336 - k * 2, 40, 22);
    }
  }
  solve() {
    this.result = 0;
    this.done = true;
  }
}

// ------------------------------------------------------------------ sintonizar: girar até o sinal encher e segurar
class Sintonizar extends Mg {
  private f = Math.random() * 100;
  private target = 20 + Math.random() * 60;
  private hold = 0;
  private signal() {
    return clamp(1 - Math.abs(this.f - this.target) / 25, 0, 1);
  }
  prog(): [number, number] {
    return [Math.round(clamp(this.hold / 0.8, 0, 1) * 8), 8];
  }
  update(dt: number, io: MgIO) {
    this.f = clamp(this.f + io.dx * 0.12, 0, 100);
    if (Math.abs(this.f - this.target) < 3) {
      this.hold += dt;
      if (this.hold > 0.8) {
        this.done = true;
        this.good(60 + this.f * 5.2, 180, '#3ddc97', 20);
      }
    } else this.hold = 0;
  }
  draw(g: CanvasRenderingContext2D) {
    const s = this.signal();
    plate(g, 36, 56, 568, 310, 20, '#3a2f2a', '#201915', 'rgba(255,255,255,0.14)');
    screw(g, 52, 72);
    screw(g, 588, 72);
    screw(g, 52, 350);
    screw(g, 588, 350);
    // mostrador
    inset(g, 60, 90, 520, 70, 10, '#1d2418');
    g.fillStyle = 'rgba(255,214,120,0.10)';
    rr(g, 62, 92, 516, 66, 8);
    g.fill();
    g.beginPath();
    for (let k = 0; k <= 50; k++) {
      const x = 60 + k * 10.4;
      g.moveTo(x, 150);
      g.lineTo(x, k % 5 === 0 ? 132 : 141);
    }
    g.strokeStyle = 'rgba(255,225,160,0.7)';
    g.lineWidth = 1.5;
    g.stroke();
    for (let k = 0; k <= 5; k++) text(g, String(88 + k * 4), 60 + k * 104, 112, 14, '#ffe3a1', 'center', 700, MONO);
    // agulha
    const nx = 60 + this.f * 5.2;
    g.fillStyle = 'rgba(229,72,77,0.25)';
    g.fillRect(nx - 6, 88, 12, 74);
    g.fillStyle = '#ff5a5f';
    g.fillRect(nx - 2, 86, 4, 78);
    // osciloscópio: o ruído some quando sintoniza
    inset(g, 60, 178, 520, 84, 10, '#08140f');
    g.save();
    rr(g, 60, 178, 520, 84, 10);
    g.clip();
    g.beginPath();
    for (let x = 64; x <= 576; x += 4) {
      const noise = Math.sin(x * 0.9 + this.t * 40) * Math.sin(x * 0.37 + this.t * 23) * (1 - s) * 34;
      const clean = Math.sin(x * 0.05 + this.t * 5) * s * 26;
      const y = 220 + noise + clean;
      if (x === 64) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    const col = s > 0.5 ? '#3ddc97' : '#ffb36b';
    g.lineJoin = 'round';
    g.strokeStyle = rgba(col, 0.28);
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = col;
    g.lineWidth = 2.2;
    g.stroke();
    g.restore();
    // barras de sinal
    for (let k = 0; k < 12; k++) {
      const lit = (k + 1) / 12 <= s + 0.001;
      rr(g, 60 + k * 44, 276, 38, 16, 4);
      g.fillStyle = lit ? (k > 8 ? '#3ddc97' : k > 4 ? '#ffd23f' : '#ff8a3d') : 'rgba(255,255,255,0.08)';
      g.fill();
    }
    text(g, s > 0.85 ? '🎶 MÚSICA!' : s > 0.4 ? 'quase… um chiado' : 'chhhhh…', 320, 326, 24, '#fff', 'center', 700);
  }
}

// ------------------------------------------------------------------ alavanca: segurar e puxar até embaixo
class Alavanca extends Mg {
  private y = 0;
  private grab = false;
  prog(): [number, number] {
    return [Math.round(this.y * 8), 8];
  }
  update(dt: number, io: MgIO) {
    if (io.click && inBox(io, 270, 90 + this.y * 200, 100, 60)) {
      this.grab = true;
      this.sfx('click', 0.4);
    }
    if (!io.down) this.grab = false;
    if (this.grab) this.y = clamp(this.y + io.dy * 0.006, 0, 1);
    else this.y = Math.max(0, this.y - dt * 1.5);
    if (this.y >= 0.98) {
      this.done = true;
      this.good(320, 330, '#ff6b6b', 20);
    }
  }
  draw(g: CanvasRenderingContext2D) {
    plate(g, 190, 36, 260, 336, 22, '#3b2a33', '#1d1319');
    screw(g, 206, 52);
    screw(g, 434, 52);
    screw(g, 206, 356);
    screw(g, 434, 356);
    // trilho e cabo que vai acendendo
    inset(g, 304, 100, 32, 260, 16, '#12080b');
    const hy = 90 + this.y * 200;
    rr(g, 310, 104, 20, Math.max(0, hy + 30 - 104), 10);
    g.fillStyle = rgba('#ff5a5f', 0.35 + this.y * 0.5);
    g.fill();
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      g.moveTo(342, 110 + k * 31);
      g.lineTo(k % 2 ? 352 : 362, 110 + k * 31);
    }
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 2;
    g.stroke();
    // lâmpada de destino
    const lit = this.y > 0.85;
    ball(g, 320, 352, 10, lit ? '#d9ffec' : '#4a2a30', lit ? '#3ddc97' : '#22101a');
    // setinhas quando parada
    if (this.y < 0.05 && !this.grab) {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = 0; k < 2; k++) {
        const oy = 168 + ((this.t * 60 + k * 20) % 40);
        g.globalAlpha = 1 - (oy - 168) / 40;
        g.beginPath();
        g.moveTo(404, oy);
        g.lineTo(424, oy);
        g.lineTo(414, oy + 12);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // manopla
    plate(g, 270, hy, 100, 60, 14, this.grab ? '#ff8a8e' : '#f0555a', '#a8212b', 'rgba(255,255,255,0.5)');
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let k = 0; k < 3; k++) g.fillRect(278, hy + 8 + k * 6, 84, 2);
    text(g, 'PUXE', 320, hy + 38, 20, '#fff', 'center', 800);
  }
}

// ------------------------------------------------------------------ balcão: pagar o valor exato com moedas
class Balcao extends Mg {
  private price: number;
  private paid = 0;
  private coins = [1, 0.5, 0.25, 0.1];
  private cp = [0, 0, 0, 0];
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.price = Number(opts.price ?? 3.75);
  }
  prog(): [number, number] {
    return [Math.min(8, Math.round((this.paid / this.price) * 8)), 8];
  }
  update(dt: number, io: MgIO) {
    for (let i = 0; i < 4; i++) this.cp[i] = Math.max(0, this.cp[i] - dt * 5);
    if (!io.click) return;
    this.coins.forEach((c, i) => {
      if (Math.hypot(io.x - (130 + i * 125), io.y - 260) < 48) {
        this.paid = Math.round((this.paid + c) * 100) / 100;
        this.cp[i] = 1;
        this.sfx('coin', 0.4);
        if (this.paid > this.price + 1e-6) {
          this.say('passou do valor! de novo', '#ff6b6b');
          this.bad();
          this.paid = 0;
        } else {
          this.good(130 + i * 125, 260, '#ffd23f', 10);
          if (Math.abs(this.paid - this.price) < 1e-6) this.done = true;
        }
      }
    });
  }
  draw(g: CanvasRenderingContext2D) {
    const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
    plate(g, 30, 40, 580, 328, 20, '#2a3350', '#151a2e');
    // etiqueta de preço
    rr(g, 130, 52, 380, 56, 12);
    g.fillStyle = '#ffe58a';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1.5;
    g.stroke();
    disc(g, 148, 80, 6, '#8a6a10');
    fit(g, `🥨 salgadinho: ${money(this.price)}`, 330, 80, 28, '#3b2b00', 'center', 800, 340);
    // visor
    inset(g, 190, 120, 260, 46, 10, '#0b1a14');
    text(g, `pago: ${money(this.paid)}`, 320, 144, 24, this.redT > 0 ? '#ff6b6b' : '#3ddc97', 'center', 700, MONO);
    text(g, this.paid > 0 ? `falta ${money(Math.max(0, this.price - this.paid))}` : 'clique nas moedas', 320, 192, 16, MUTED, 'center', 600);
    this.coins.forEach((c, i) => {
      const x = 130 + i * 125;
      const hover = Math.hypot(this.mx - x, this.my - 260) < 48;
      const k = 1 + 0.14 * Math.sin(clamp(this.cp[i], 0, 1) * Math.PI);
      const gold = c >= 1;
      g.save();
      g.translate(x, 260);
      g.scale(k, k);
      disc(g, 3, 6, 46, 'rgba(0,0,0,0.35)');
      ball(g, 0, 0, 46, gold ? '#fbe29a' : '#f1f3f8', gold ? '#a77b25' : '#7c8497');
      g.lineWidth = 3;
      g.strokeStyle = gold ? '#7a5712' : '#4f566a';
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 36, 0, TAU);
      g.lineWidth = 2;
      g.strokeStyle = gold ? 'rgba(122,87,18,0.6)' : 'rgba(79,86,106,0.6)';
      g.stroke();
      if (hover) {
        g.beginPath();
        g.arc(0, 0, 51, 0, TAU);
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        g.stroke();
      }
      g.restore();
      text(g, gold ? 'R$1' : `${Math.round(c * 100)}¢`, x, 262, 22, '#1b2233', 'center', 800);
    });
    text(g, 'passar do valor zera a conta', 320, 336, 14, '#7d869c', 'center', 500);
  }
}

// ------------------------------------------------------------------ ponteiros: arrastar o ponteiro dos minutos até a marca
class Ponteiros extends Mg {
  private a = -Math.PI / 2;
  private target = -Math.PI / 2 + Math.PI * (0.5 + Math.random());
  private grab = false;
  private near = false;
  update(_dt: number, io: MgIO) {
    if (io.click && Math.hypot(io.x - 320, io.y - 200) < 140) this.grab = true;
    const wasGrab = this.grab;
    if (!io.down) this.grab = false;
    if (this.grab) this.a = Math.atan2(io.y - 200, io.x - 320);
    const d = Math.abs(Math.atan2(Math.sin(this.a - this.target), Math.cos(this.a - this.target)));
    this.near = d < 0.12;
    if (!this.grab && io.release && d < 0.12) {
      this.done = true;
      this.good(320 + Math.cos(this.target) * 128, 200 + Math.sin(this.target) * 128, '#3ddc97', 20);
    } else if (io.release && d >= 0.12) {
      this.say('mais um pouco…', '#ffb36b');
      if (wasGrab) this.bad();
    }
  }
  draw(g: CanvasRenderingContext2D) {
    const cx = 320;
    const cy = 200;
    // aro e mostrador
    disc(g, cx + 4, cy + 8, 152, 'rgba(0,0,0,0.4)');
    ball(g, cx, cy, 152, '#b7bfd3', '#3d455c');
    ball(g, cx, cy, 142, '#ffffff', '#d8dce8');
    // marcas
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      for (let k = 0; k < 60; k++) {
        const major = k % 5 === 0;
        if (major !== (pass === 1)) continue;
        const a = (k / 60) * TAU - Math.PI / 2;
        g.moveTo(cx + Math.cos(a) * (major ? 118 : 128), cy + Math.sin(a) * (major ? 118 : 128));
        g.lineTo(cx + Math.cos(a) * 136, cy + Math.sin(a) * 136);
      }
      g.strokeStyle = pass ? '#1b2233' : '#8a93a8';
      g.lineWidth = pass ? 3.5 : 1.5;
      g.stroke();
    }
    for (const [n, a] of [['12', -Math.PI / 2], ['3', 0], ['6', Math.PI / 2], ['9', Math.PI]] as const) text(g, n, cx + Math.cos(a) * 98, cy + Math.sin(a) * 98, 22, '#1b2233', 'center', 800);
    // alvo verde
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy, 109, this.target - 0.12, this.target + 0.12);
    g.strokeStyle = rgba('#3ddc97', this.near ? 0.45 : 0.25);
    g.lineWidth = 20;
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, 109, this.target - 0.12, this.target + 0.12);
    g.strokeStyle = this.near ? '#16b36e' : '#3ddc97';
    g.lineWidth = 9;
    g.stroke();
    // ponteiro das horas (fixo)
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(1.1) * 66, cy + Math.sin(1.1) * 66);
    g.strokeStyle = '#4a5268';
    g.lineWidth = 9;
    g.stroke();
    // ponteiro dos minutos
    const tx = cx + Math.cos(this.a) * 112;
    const ty = cy + Math.sin(this.a) * 112;
    g.beginPath();
    g.moveTo(cx - Math.cos(this.a) * 22, cy - Math.sin(this.a) * 22);
    g.lineTo(tx, ty);
    g.strokeStyle = '#1b2233';
    g.lineWidth = 6;
    g.stroke();
    ball(g, tx, ty, 11, this.near ? '#b6ffd9' : this.grab ? '#ffe58a' : '#ff8a8e', this.near ? '#16b36e' : this.grab ? '#d9a010' : '#c43a42');
    g.lineWidth = 2;
    g.strokeStyle = '#1b2233';
    g.stroke();
    ball(g, cx, cy, 9, '#6b7388', '#1b2233');
  }
}

// ------------------------------------------------------------------ pôster (difícil): alinhar balançando e alisar 5 bolhas em 6 s
class Poster extends Mg {
  private phase: 0 | 1 = 0;
  private px = 320;
  private py = 200;
  private bubbles: { x: number; y: number; ok: boolean }[] = [];
  private bt = 0;
  prog(): [number, number] {
    return [this.phase === 1 ? this.bubbles.filter((b) => b.ok).length : 0, 5];
  }
  liveHint() {
    return this.phase === 0 ? 'Clique quando o pôster encaixar na moldura.' : 'Alise todas as bolhas clicando nelas antes do tempo acabar.';
  }
  update(dt: number, io: MgIO) {
    if (this.phase === 0) {
      // o pôster segue o cursor, balançando (alinhar dá trabalho)
      this.px = io.x + Math.sin(this.t * 3.1) * 14;
      this.py = io.y + Math.cos(this.t * 2.3) * 10;
      if (io.click) {
        if (Math.abs(this.px - 320) < 9 && Math.abs(this.py - 200) < 9) {
          this.phase = 1;
          this.bt = 6;
          this.bubbles = Array.from({ length: 5 }, () => ({ x: 230 + Math.random() * 180, y: 120 + Math.random() * 160, ok: false }));
          this.good(320, 200, '#ffd23f', 18);
          this.sfx('thud', 0.5);
        } else {
          this.say('torto! tente de novo', '#ff6b6b');
          this.bad();
          this.sfx('miss', 0.4);
        }
      }
      return;
    }
    this.bt -= dt;
    for (const b of this.bubbles) {
      b.x += Math.sin(this.t * 5 + b.y) * dt * 30;
      if (io.click && !b.ok && Math.hypot(io.x - b.x, io.y - b.y) < 16) {
        b.ok = true;
        this.good(b.x, b.y, '#ffffff', 10);
        this.sfx('pop', 0.4);
      }
    }
    if (this.bubbles.every((b) => b.ok)) this.done = true;
    else if (this.bt <= 0) {
      this.say('bolhas! recomeçando', '#ff6b6b');
      this.bad();
      this.phase = 0;
    }
  }
  draw(g: CanvasRenderingContext2D) {
    // parede com listras
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 0; x < PW; x += 40) g.fillRect(x, 0, 20, AREA_H);
    const aligned = this.phase === 0 && Math.abs(this.px - 320) < 9 && Math.abs(this.py - 200) < 9;
    // moldura-guia
    if (aligned) {
      g.fillStyle = 'rgba(61,220,151,0.16)';
      g.fillRect(210, 60, 220, 280);
    }
    g.strokeStyle = aligned ? '#3ddc97' : '#ffd23f';
    g.lineWidth = aligned ? 4 : 3;
    if (!aligned) g.setLineDash([8, 6]);
    g.strokeRect(210, 60, 220, 280);
    g.setLineDash([]);
    const x = this.phase === 0 ? this.px : 320;
    const y = this.phase === 0 ? this.py : 200;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x - 104, y - 132, 220, 280);
    const gr = g.createLinearGradient(0, y - 140, 0, y + 140);
    gr.addColorStop(0, '#ffa457');
    gr.addColorStop(1, '#e8601c');
    g.fillStyle = gr;
    g.fillRect(x - 110, y - 140, 220, 280);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 3;
    g.strokeRect(x - 100, y - 130, 200, 260);
    g.fillStyle = 'rgba(240,235,200,0.85)';
    g.fillRect(x - 124, y - 148, 36, 14);
    g.fillRect(x + 88, y - 148, 36, 14);
    text(g, 'SEXTA', x, y - 40, 40, '#fff', 'center', 800);
    text(g, 'EXISTE?', x, y + 10, 40, '#fff', 'center', 800);
    if (this.phase === 1) {
      for (const b of this.bubbles)
        if (!b.ok) {
          disc(g, b.x, b.y, 14, 'rgba(255,255,255,0.35)');
          ball(g, b.x, b.y, 14, 'rgba(255,255,255,0.95)', 'rgba(210,225,255,0.7)');
          disc(g, b.x - 4, b.y - 5, 3.5, 'rgba(255,255,255,1)');
        }
      const f = clamp(this.bt / 6, 0, 1);
      inset(g, 420, 12, 200, 16, 8);
      rr(g, 423, 15, Math.max(0, 194 * f), 10, 5);
      g.fillStyle = this.bt < 2 ? '#ff6b6b' : '#3ddc97';
      g.fill();
      text(g, `${Math.max(0, this.bt).toFixed(1)} s`, 620, 44, 20, this.bt < 2 ? '#ff6b6b' : '#fff', 'right', 800, MONO);
    }
  }
}

// ------------------------------------------------------------------ comer escondido: cliques sem passar do barulho
class Comer extends Mg {
  private bites = 0;
  private noise = 0;
  private bp = 0;
  prog(): [number, number] {
    return [Math.min(this.bites, 8), 8];
  }
  update(dt: number, io: MgIO) {
    this.noise = Math.max(0, this.noise - dt * 0.6);
    this.bp = Math.max(0, this.bp - dt * 5);
    if (io.click) {
      this.noise += 0.38;
      this.bites++;
      this.bp = 1;
      this.sfx('crunch', 0.3);
      if (this.noise > 1) {
        this.say('CRUNCH! alto demais', '#ff6b6b');
        this.bad();
        this.result = 'barulho';
        this.noise = 0.6;
      } else this.good(320, 170, '#d9a066', 10);
      if (this.bites >= 8) this.done = true;
    }
  }
  draw(g: CanvasRenderingContext2D) {
    plate(g, 100, 46, 440, 300, 22, '#2a3350', '#151a2e');
    // prato
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(320, 232, 108, 24, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#e9ecf4';
    g.beginPath();
    g.ellipse(320, 226, 104, 22, 0, 0, TAU);
    g.fill();
    // petisco encolhendo a cada mordida
    const k = (1 - clamp(this.bites, 0, 8) * 0.07) * (1 + this.bp * 0.12);
    g.save();
    g.translate(320, 170);
    g.scale(k, k);
    text(g, '🥨', 0, 0, 120, '#fff', 'center');
    g.restore();
    // medidor de barulho
    text(g, '🔊', 122, 296, 22, '#fff', 'center');
    inset(g, 140, 283, 360, 26, 13);
    const gr = g.createLinearGradient(140, 0, 500, 0);
    gr.addColorStop(0, '#3ddc97');
    gr.addColorStop(0.65, '#ffd23f');
    gr.addColorStop(1, '#e5484d');
    rr(g, 143, 286, Math.max(0, 354 * clamp(this.noise, 0, 1)), 20, 10);
    g.fillStyle = gr;
    g.fill();
    if (this.noise > 0.8) {
      g.strokeStyle = rgba('#ff6b6b', 0.5 + 0.5 * Math.sin(this.t * 24));
      g.lineWidth = 3;
      rr(g, 138, 281, 364, 30, 15);
      g.stroke();
    }
    text(g, 'BARULHO', 320, 266, 14, this.noise > 0.8 ? '#ff6b6b' : MUTED, 'center', 700);
    text(g, `mordidas ${this.bites}/8`, 320, 330, 18, '#fff', 'center', 700);
  }
  solve() {
    this.result = true;
    this.done = true;
  }
}

// ------------------------------------------------------------------ tema por tipo (cor de destaque) e dica padrão
const ACCENT: Record<MgKind, string> = {
  fios: '#3e8cff',
  revirar: '#ffb36b',
  fechadura: '#ffd23f',
  digitar: '#3ddc97',
  discar: '#3ddc97',
  arrastar: '#b48cff',
  ritmo: '#ff7ac8',
  sintonizar: '#5ad1ff',
  alavanca: '#ff6b6b',
  balcao: '#f2a93b',
  ponteiros: '#7be0c3',
  poster: '#ff8a3d',
  comer: '#e0a96d',
};

const HINT: Record<MgKind, string> = {
  fios: 'Arraste cada fio até o plugue da mesma cor e símbolo.',
  revirar: 'Clique nos objetos para revirar.',
  fechadura: 'Mexa o mouse para os lados e ache o clique.',
  digitar: 'Digite no teclado ou clique nas teclas.',
  discar: 'Digite no teclado ou clique nas teclas.',
  arrastar: 'Arraste o item de cima até o lugar certo.',
  ritmo: 'Clique (ou F) quando a folha passar no verde.',
  sintonizar: 'Mexa o mouse para os lados e segure no sinal.',
  alavanca: 'Clique na alavanca e arraste para baixo.',
  balcao: 'Clique nas moedas até dar o valor exato.',
  ponteiros: 'Arraste o ponteiro até o verde e solte.',
  poster: 'Clique quando o pôster encaixar na moldura.',
  comer: 'Clique para morder, sem deixar o barulho encher.',
};

interface Cur {
  spec: MgSpec;
  mg: Mg;
  /** Tempo de carimbo (-1 = ainda jogando). */
  fin: number;
  /** solve() de testes/robôs: sem carimbo, fecha no mesmo quadro. */
  instant: boolean;
}

/** O painel: um canvas DOM no meio da tela, com cursor virtual. */
export class MinigamePanel {
  private wrap: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private cur: Cur | null = null;
  private cx = PW / 2;
  private cy = PH / 2;
  private wasDown = false;

  constructor(
    private input: Input,
    private audio: AudioEngine,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'mg-wrap';
    this.wrap.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(56vw,860px);aspect-ratio:640/440;display:none;z-index:40;pointer-events:none;';
    this.canvas = document.createElement('canvas');
    this.canvas.width = PW * SS;
    this.canvas.height = (PH + 40) * SS;
    this.canvas.style.cssText = 'width:100%;height:100%;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.55),0 0 0 2px rgba(255,255,255,.08);';
    this.wrap.append(this.canvas);
    document.body.append(this.wrap);
    this.g = this.canvas.getContext('2d')!;
    this.bg = document.createElement('canvas');
    this.bg.width = PW * SS;
    this.bg.height = (PH + 40) * SS;
  }

  get open() {
    return !!this.cur;
  }
  get kind() {
    return this.cur?.spec.kind ?? null;
  }

  /** Fundo do painel (desenhado uma vez por abertura): degradê, grade, brilho do tema, barras de título e rodapé. */
  private paintBg(accent: string) {
    const b = this.bg.getContext('2d')!;
    const W = PW;
    const H = PH + 40;
    b.setTransform(SS, 0, 0, SS, 0, 0);
    const base = b.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.75);
    base.addColorStop(0, '#1c2542');
    base.addColorStop(1, '#090d19');
    b.fillStyle = base;
    b.fillRect(0, 0, W, H);
    b.beginPath();
    for (let x = 0; x <= W; x += 32) {
      b.moveTo(x, 0);
      b.lineTo(x, H);
    }
    for (let y = 0; y <= H; y += 32) {
      b.moveTo(0, y);
      b.lineTo(W, y);
    }
    b.strokeStyle = 'rgba(255,255,255,0.035)';
    b.lineWidth = 1;
    b.stroke();
    const glow = b.createLinearGradient(0, TOP, 0, 190);
    glow.addColorStop(0, rgba(accent, 0.16));
    glow.addColorStop(1, rgba(accent, 0));
    b.fillStyle = glow;
    b.fillRect(0, TOP, W, 160);
    const vig = b.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    b.fillStyle = vig;
    b.fillRect(0, 0, W, H);
    // barra de título
    const tb = b.createLinearGradient(0, 0, 0, TOP);
    tb.addColorStop(0, '#2a3454');
    tb.addColorStop(1, '#171d33');
    b.fillStyle = tb;
    b.fillRect(0, 0, W, TOP);
    b.fillStyle = accent;
    b.fillRect(0, TOP - 2, W, 2);
    b.fillStyle = 'rgba(255,255,255,0.12)';
    b.fillRect(0, 0, W, 1);
    // rodapé
    b.fillStyle = 'rgba(0,0,0,0.45)';
    b.fillRect(0, TOP + AREA_H, W, H - TOP - AREA_H);
    b.fillStyle = 'rgba(255,255,255,0.08)';
    b.fillRect(0, TOP + AREA_H, W, 1);
    b.strokeStyle = rgba(accent, 0.3);
    b.lineWidth = 2;
    b.strokeRect(1, 1, W - 2, H - 2);
  }

  start(spec: MgSpec) {
    if (this.cur) this.close(true);
    const s: Snd = (n, v = 0.6) => this.audio.play(n as Parameters<AudioEngine['play']>[0], v);
    const o = spec.opts ?? {};
    const k = spec.kind;
    const mg: Mg =
      k === 'fios' ? new Fios(o, s)
      : k === 'revirar' ? new Revirar(o, s)
      : k === 'fechadura' ? new Fechadura(o, s)
      : k === 'digitar' || k === 'discar' ? new Teclado(o, s)
      : k === 'arrastar' ? new Arrastar(o, s)
      : k === 'ritmo' ? new Ritmo(o, s)
      : k === 'sintonizar' ? new Sintonizar(o, s)
      : k === 'alavanca' ? new Alavanca(o, s)
      : k === 'balcao' ? new Balcao(o, s)
      : k === 'ponteiros' ? new Ponteiros(o, s)
      : k === 'poster' ? new Poster(o, s)
      : new Comer(o, s);
    this.cur = { spec, mg, fin: -1, instant: false };
    this.cx = PW / 2;
    this.cy = PH / 2 + 60;
    this.wasDown = this.input.isDown('Mouse0');
    this.paintBg(ACCENT[k] ?? '#ffd23f');
    this.wrap.style.display = 'block';
    if (typeof this.wrap.animate === 'function') {
      this.wrap.animate(
        [
          { opacity: 0, transform: 'translate(-50%,-50%) scale(0.92)' },
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
        ],
        { duration: 160, easing: 'ease-out' },
      );
    }
    this.audio.play('click', 0.5);
  }

  /** Fecha. `cancel`: sem progresso (Q, pausa, perseguição). */
  close(cancel: boolean) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.wrap.style.display = 'none';
    // já concluído (só faltava o carimbo): o resultado vale mesmo assim
    if (c.fin >= 0) c.spec.onDone(c.mg.result);
    else if (cancel) c.spec.onCancel?.();
  }

  /** Testes e robôs: resolve o minigame aberto na hora. */
  solve() {
    const c = this.cur;
    if (!c) return;
    c.mg.solve();
    c.instant = true;
  }

  update(realDt: number) {
    const c = this.cur;
    if (!c) return;
    const inp = this.input;
    const mg = c.mg;
    // carimbo de conclusão: o jogo congela, os efeitos continuam
    if (c.fin >= 0) {
      c.fin += realDt;
      mg.fxStep(realDt);
      this.draw(c, this.cx, this.cy);
      if (c.fin >= STAMP_T) this.finish(c);
      return;
    }
    if (inp.pressed('KeyQ')) return this.close(true);
    const dx = inp.dx * 0.9;
    const dy = inp.dy * 0.9;
    this.cx = clamp(this.cx + dx, 0, PW);
    this.cy = clamp(this.cy + dy, 0, PH);
    const down = inp.isDown('Mouse0');
    const io: MgIO = { x: this.cx, y: this.cy, down, click: down && !this.wasDown, release: !down && this.wasDown, dx, dy, key: (code) => inp.pressed(code) };
    this.wasDown = down;
    mg.mx = io.x;
    mg.my = io.y;
    mg.t += realDt;
    mg.flashT = Math.max(0, mg.flashT - realDt);
    mg.update(realDt, io);
    mg.fxStep(realDt);
    if (mg.done) {
      this.audio.play('confirm', 0.6);
      if (c.instant || !mg.stamp) return this.finish(c);
      c.fin = 0;
    }
    this.draw(c, io.x, io.y);
  }

  private finish(c: Cur) {
    if (this.cur !== c) return;
    this.cur = null;
    this.wrap.style.display = 'none';
    c.spec.onDone(c.mg.result);
  }

  private draw(c: Cur, cx: number, cy: number) {
    const { spec, mg } = c;
    const g = this.g;
    const accent = ACCENT[spec.kind] ?? '#ffd23f';
    g.setTransform(SS, 0, 0, SS, 0, 0);
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0, PW, PH + 40);

    // barra de título: ponto do tema, título, dica do pedido, progresso e "sair"
    disc(g, 16, 15, 5, accent);
    g.font = `800 18px ${FONT}`;
    const tw = g.measureText(spec.title).width;
    text(g, spec.title, 30, 16, 18, '#f4f6ff', 'left', 800);
    const pr = mg.prog();
    let right = PW - 20;
    text(g, '[Q] sair', right, 16, 14, '#9aa4bd', 'right', 600);
    right -= 78;
    if (pr && pr[1] <= 10) {
      const w = 14;
      const gap = 4;
      right -= pr[1] * (w + gap) - gap;
      for (let k = 0; k < pr[1]; k++) {
        rr(g, right + k * (w + gap), 11, w, 9, 3);
        g.fillStyle = k < pr[0] ? '#3ddc97' : 'rgba(255,255,255,0.15)';
        g.fill();
      }
      right -= 14;
    }
    if (spec.hint) fit(g, spec.hint, 30 + tw + 16, 16, 14, MUTED, 'left', 500, Math.max(40, right - (30 + tw + 16)));

    // área do jogo (com tremida, "pop", faíscas)
    g.save();
    g.translate(0, TOP);
    g.beginPath();
    g.rect(0, 0, PW, AREA_H);
    g.clip();
    if (mg.shakeT > 0) g.translate(Math.sin(mg.t * 90 + mg.shakeT * 20) * 7 * mg.shakeT, 0);
    g.save();
    if (mg.popT > 0) {
      const k = 1 + 0.03 * Math.sin(mg.popT * Math.PI);
      g.translate(PW / 2, 200);
      g.scale(k, k);
      g.translate(-PW / 2, -200);
    }
    mg.draw(g);
    const dragger = mg as unknown as { drawDrag?: (g: CanvasRenderingContext2D, io: MgIO) => void };
    dragger.drawDrag?.(g, { x: cx, y: cy, down: false, click: false, release: false, dx: 0, dy: 0, key: () => false });
    g.restore();
    mg.fxDraw(g);
    g.restore();

    // flash vermelho do erro
    if (mg.redT > 0) {
      g.fillStyle = `rgba(255,60,60,${0.26 * mg.redT})`;
      g.fillRect(0, TOP, PW, AREA_H);
      g.strokeStyle = `rgba(255,90,90,${0.8 * mg.redT})`;
      g.lineWidth = 4;
      g.strokeRect(2, TOP + 2, PW - 4, AREA_H - 4);
    }

    // rodapé: mensagem de erro/acerto ou a dica
    const fy = TOP + AREA_H + 13;
    if (mg.flashT > 0) fit(g, mg.flash, PW / 2, fy, 18, mg.flashColor, 'center', 800, PW - 40);
    else fit(g, mg.liveHint() || HINT[spec.kind], 20, fy, 14, MUTED, 'left', 500, PW - 40);

    // carimbo de conclusão
    if (c.fin >= 0) this.drawStamp(g, clamp(c.fin / STAMP_T, 0, 1));

    // cursor
    g.save();
    g.translate(0, TOP);
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx + 2, cy + 3);
    g.lineTo(cx + 16, cy + 21);
    g.lineTo(cx + 6, cy + 20);
    g.closePath();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fill();
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + 14, cy + 18);
    g.lineTo(cx + 4, cy + 17);
    g.closePath();
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.fill();
    g.stroke();
    g.restore();
  }

  /** Selo verde com o "certo" desenhado aos poucos. */
  private drawStamp(g: CanvasRenderingContext2D, p: number) {
    const cx = PW / 2;
    const cy = TOP + 200;
    g.fillStyle = `rgba(10,40,28,${0.45 * Math.min(1, p * 3)})`;
    g.fillRect(0, TOP, PW, AREA_H);
    const k = easeOutBack(clamp(p * 1.8, 0, 1));
    const r = 54 * k;
    if (r > 0) {
      g.beginPath();
      g.arc(cx, cy, r + 8, 0, TAU);
      g.fillStyle = 'rgba(61,220,151,0.25)';
      g.fill();
      ball(g, cx, cy, r, '#6df0b3', '#16a36a');
      g.lineWidth = 5;
      g.strokeStyle = '#eafff4';
      g.stroke();
    }
    const q = clamp((p - 0.25) / 0.5, 0, 1);
    if (q > 0) {
      const ax = cx - 24;
      const ay = cy + 2;
      const bx = cx - 7;
      const by = cy + 20;
      const ex = cx + 26;
      const ey = cy - 18;
      g.beginPath();
      g.moveTo(ax, ay);
      if (q < 0.4) {
        const t = q / 0.4;
        g.lineTo(lerp(ax, bx, t), lerp(ay, by, t));
      } else {
        const t = (q - 0.4) / 0.6;
        g.lineTo(bx, by);
        g.lineTo(lerp(bx, ex, t), lerp(by, ey, t));
      }
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 11;
      g.strokeStyle = '#ffffff';
      g.stroke();
    }
  }
}
