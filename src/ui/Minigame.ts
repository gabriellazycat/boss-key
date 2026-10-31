import { rr, text, clamp, MONO } from '../apps/common';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../core/Audio';

/**
 * Minigames rápidos (v0.10, estilo Among Us): toda ação de tarefa, missão e distração abre um painel no centro da
 * tela (~metade dela). Você fica parado e meio cego — o mundo continua nas bordas e o som (a porta!) continua.
 * O cursor é virtual (o mouse continua travado no jogo): movimento do mouse move o cursor, clique é o botão esquerdo.
 * Q sai sem progresso (ESC também solta o mouse e pausa, o que fecha o painel).
 */
export type MgKind = 'fios' | 'revirar' | 'fechadura' | 'digitar' | 'arrastar' | 'ritmo' | 'sintonizar' | 'discar' | 'alavanca' | 'balcao' | 'ponteiros' | 'poster' | 'comer';

/** Tamanho lógico do painel (a CSS escala). */
const PW = 640;
const PH = 400;

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

/** Um minigame: `update` até `done`; `result` vai para quem abriu. `solve()` = resolve na hora (testes e robôs). */
abstract class Mg {
  t = 0;
  done = false;
  result: unknown = true;
  /** Mensagem curta de erro/acerto no rodapé. */
  flash = '';
  flashT = 0;
  flashColor = '#fff';
  constructor(
    protected opts: Record<string, unknown>,
    protected sfx: Snd,
  ) {}
  abstract update(dt: number, io: MgIO): void;
  abstract draw(g: CanvasRenderingContext2D): void;
  solve() {
    this.done = true;
  }
  protected say(msg: string, color = '#fff') {
    this.flash = msg;
    this.flashT = 1;
    this.flashColor = color;
  }
}

const inBox = (io: MgIO, x: number, y: number, w: number, h: number) => io.x >= x && io.x <= x + w && io.y >= y && io.y <= y + h;
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
const COLORS = ['#e5484d', '#3e8cff', '#3ddc97', '#ffd23f'];

// ------------------------------------------------------------------ fios: ligar 4 cores
class Fios extends Mg {
  private right = shuffle([0, 1, 2, 3]);
  private links: (number | null)[] = [null, null, null, null];
  private drag: number | null = null;
  update(_dt: number, io: MgIO) {
    for (let i = 0; i < 4; i++) if (io.click && this.links[i] === null && Math.hypot(io.x - 90, io.y - (110 + i * 70)) < 26) this.drag = i;
    if (io.release && this.drag !== null) {
      const j = this.right.findIndex((_, k) => Math.hypot(io.x - 550, io.y - (110 + k * 70)) < 30);
      if (j >= 0 && this.right[j] === this.drag) {
        this.links[this.drag] = j;
        this.sfx('click', 0.7);
      } else if (j >= 0) {
        this.say('cor errada', '#ff6b6b');
        this.sfx('miss', 0.5);
      }
      this.drag = null;
    }
    if (this.links.every((x) => x !== null)) this.done = true;
  }
  draw(g: CanvasRenderingContext2D) {
    for (let i = 0; i < 4; i++) {
      const y = 110 + i * 70;
      g.fillStyle = COLORS[i];
      g.fillRect(40, y - 12, 50, 24);
      g.fillStyle = COLORS[this.right[i]];
      g.fillRect(550, y - 12, 50, 24);
      const l = this.links[i];
      if (l !== null) this.wire(g, 90, y, 550, 110 + l * 70, COLORS[i]);
    }
  }
  drawDrag(g: CanvasRenderingContext2D, io: MgIO) {
    if (this.drag !== null) this.wire(g, 90, 110 + this.drag * 70, io.x, io.y, COLORS[this.drag]);
  }
  private wire(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: string) {
    g.strokeStyle = c;
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
}

// ------------------------------------------------------------------ revirar: clicar nos objetos até achar (ou não)
class Revirar extends Mg {
  private icons = shuffle(['📁', '🧥', '☕', '📄', '🗑', '🧾']);
  private open: number[] = [];
  private shake = -1;
  private shakeT = 0;
  private target: number;
  private endT = -1;
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.target = opts.found ? Math.floor(Math.random() * 6) : -1;
    this.result = false;
  }
  update(dt: number, io: MgIO) {
    if (this.endT >= 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.done = true;
      return;
    }
    if (this.shake >= 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) {
        this.open.push(this.shake);
        if (this.shake === this.target) {
          this.result = true;
          this.say(`achou! ${String(this.opts.icon ?? '🔑')}`, '#3ddc97');
          this.sfx('coin', 0.8);
          this.endT = 0.7;
        } else if (this.open.length === 6) {
          this.say('nada aqui…', '#ffb36b');
          this.endT = 0.8;
        }
        this.shake = -1;
      }
      return;
    }
    if (!io.click) return;
    for (let i = 0; i < 6; i++) {
      const x = 90 + (i % 3) * 170;
      const y = 80 + Math.floor(i / 3) * 140;
      if (!this.open.includes(i) && inBox(io, x, y, 120, 110)) {
        this.shake = i;
        this.shakeT = 0.35;
        this.sfx('crumple', 0.5);
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    for (let i = 0; i < 6; i++) {
      const x = 90 + (i % 3) * 170 + (this.shake === i ? Math.sin(this.t * 60) * 5 : 0);
      const y = 80 + Math.floor(i / 3) * 140;
      rr(g, x, y, 120, 110, 14);
      g.fillStyle = this.open.includes(i) ? '#2a3146' : '#3b4560';
      g.fill();
      text(g, this.open.includes(i) ? (i === this.target ? String(this.opts.icon ?? '🔑') : '·') : this.icons[i], x + 60, y + 58, 48, '#fff', 'center');
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
  update(dt: number, io: MgIO) {
    this.val = (this.val + io.dx * 0.035 + 1000) % 10;
    const target = this.combo[this.idx];
    const d = Math.min(Math.abs(this.val - target), 10 - Math.abs(this.val - target));
    if (d < 0.35) {
      this.hold += dt;
      if (this.hold > 0.45) {
        this.sfx('click', 0.9);
        this.idx++;
        this.hold = 0;
        if (this.idx >= 3) this.done = true;
      }
    } else this.hold = 0;
  }
  draw(g: CanvasRenderingContext2D) {
    const cx = 320;
    const cy = 200;
    g.fillStyle = '#20263a';
    g.beginPath();
    g.arc(cx, cy, 120, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 10; k++) {
      const a = ((k - this.val) / 10) * Math.PI * 2 - Math.PI / 2;
      text(g, String(k), cx + Math.cos(a) * 95, cy + Math.sin(a) * 95, 24, '#dfe6ff', 'center', 700, MONO);
    }
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.moveTo(cx - 10, cy - 135);
    g.lineTo(cx + 10, cy - 135);
    g.lineTo(cx, cy - 118);
    g.fill();
    // o "clique" se ouve chegando: a barrinha enche perto do número certo
    const target = this.combo[this.idx] ?? 0;
    const d = Math.min(Math.abs(this.val - target), 10 - Math.abs(this.val - target));
    g.fillStyle = '#3ddc97';
    g.fillRect(520, 300 - clamp(1 - d / 3, 0, 1) * 180, 30, clamp(1 - d / 3, 0, 1) * 180);
    text(g, `${this.idx}/3`, 535, 330, 20, '#fff', 'center', 700);
    text(g, 'mexa o mouse para os lados', cx, 360, 16, '#aab3c8', 'center', 500);
  }
}

// ------------------------------------------------------------------ teclado numérico (código / discar)
class Teclado extends Mg {
  private typed = '';
  private code: string;
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.code = String(opts.code ?? '123');
  }
  private press(d: string) {
    this.typed += d;
    this.sfx('click', 0.5);
    if (this.typed.length < this.code.length) return;
    if (this.typed === this.code) {
      this.done = true;
      this.sfx('confirm', 0.7);
    } else {
      this.say('errado', '#ff6b6b');
      this.sfx('miss', 0.6);
      this.typed = '';
    }
  }
  update(_dt: number, io: MgIO) {
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
    rr(g, 200, 70, 240, 60, 10);
    g.fillStyle = '#0f1420';
    g.fill();
    text(g, this.typed.padEnd(this.code.length, '_').split('').join(' '), 320, 100, 34, '#3ddc97', 'center', 700, MONO);
    if (this.opts.show) text(g, String(this.opts.show), 320, 45, 18, '#ffd23f', 'center', 600);
    for (let k = 0; k < 10; k++) {
      const [x, y] = this.keyPos(k);
      rr(g, x, y, 70, 52, 10);
      g.fillStyle = '#3b4560';
      g.fill();
      text(g, String(k), x + 35, y + 27, 26, '#fff', 'center', 700, MONO);
    }
  }
}

// ------------------------------------------------------------------ arrastar: pastas para gavetas da cor / e-mails para a pasta certa
class Arrastar extends Mg {
  private items: { label: string; bin: number }[];
  private bins: { label: string; color: string }[];
  private held = false;
  private errors = 0;
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
    this.result = 0;
  }
  private binBox(i: number): [number, number, number, number] {
    const w = 560 / this.bins.length;
    return [40 + i * w + 6, 270, w - 12, 100];
  }
  update(_dt: number, io: MgIO) {
    const it = this.items[0];
    if (!it) return;
    if (io.click && inBox(io, 200, 60, 240, 80)) this.held = true;
    if (io.release && this.held) {
      this.held = false;
      const i = this.bins.findIndex((_, k) => inBox(io, ...this.binBox(k)));
      if (i < 0) return;
      if (i === it.bin) {
        this.items.shift();
        this.sfx('swish', 0.5);
        if (!this.items.length) {
          this.result = this.errors;
          this.done = true;
        }
      } else {
        this.errors++;
        this.say('lugar errado!', '#ff6b6b');
        this.sfx('miss', 0.6);
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    this.bins.forEach((b, i) => {
      const [x, y, w, h] = this.binBox(i);
      rr(g, x, y, w, h, 12);
      g.fillStyle = b.color;
      g.fill();
      text(g, b.label, x + w / 2, y + h / 2, 16, '#10131c', 'center', 800);
    });
    text(g, `faltam ${this.items.length}`, 320, 36, 16, '#aab3c8', 'center', 600);
  }
  drawDrag(g: CanvasRenderingContext2D, io: MgIO) {
    const it = this.items[0];
    if (!it) return;
    const x = this.held ? io.x - 120 : 200;
    const y = this.held ? io.y - 40 : 60;
    rr(g, x, y, 240, 80, 12);
    g.fillStyle = this.opts.mode === 'emails' ? '#f4f1ea' : COLORS[it.bin];
    g.fill();
    text(g, this.opts.mode === 'emails' ? `✉ ${it.label}` : '📁', x + 120, y + 40, this.opts.mode === 'emails' ? 17 : 40, '#1b2233', 'center', 700);
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
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.need = Number(opts.n ?? 6);
    this.result = 0;
  }
  update(dt: number, io: MgIO) {
    this.x += dt * 330;
    if (this.x > 700) {
      this.x = -60;
      this.say('passou!', '#ffb36b');
      this.result = Number(this.result) + 1;
    }
    if (io.click || io.key('KeyF')) {
      if (Math.abs(this.x - 320) < 34) {
        this.hits++;
        this.sfx('stamp', 0.7);
        this.x = -60 - Math.random() * 120;
        if (this.hits >= this.need) this.done = true;
      } else {
        this.say('fora do tempo', '#ff6b6b');
        this.result = Number(this.result) + 1;
        this.sfx('miss', 0.5);
      }
    }
  }
  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#20263a';
    g.fillRect(0, 170, PW, 90);
    g.fillStyle = 'rgba(61,220,151,0.35)';
    g.fillRect(286, 160, 68, 110);
    g.fillStyle = '#fbfbf7';
    g.fillRect(this.x - 30, 180, 60, 70);
    text(g, `${this.hits}/${this.need} cópias`, 320, 320, 22, '#fff', 'center', 700);
    text(g, 'clique (ou F) quando a folha passar no verde', 320, 120, 16, '#aab3c8', 'center', 500);
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
  update(dt: number, io: MgIO) {
    this.f = clamp(this.f + io.dx * 0.12, 0, 100);
    if (Math.abs(this.f - this.target) < 3) {
      this.hold += dt;
      if (this.hold > 0.8) this.done = true;
    } else this.hold = 0;
  }
  draw(g: CanvasRenderingContext2D) {
    rr(g, 60, 150, 520, 60, 10);
    g.fillStyle = '#20263a';
    g.fill();
    g.fillStyle = '#e5484d';
    g.fillRect(60 + this.f * 5.2 - 3, 145, 6, 70);
    const s = clamp(1 - Math.abs(this.f - this.target) / 25, 0, 1);
    g.fillStyle = '#3ddc97';
    g.fillRect(60, 250, 520 * s, 24);
    text(g, s > 0.85 ? '🎶 MÚSICA!' : 'chhhhh…', 320, 310, 24, '#fff', 'center', 700);
  }
}

// ------------------------------------------------------------------ alavanca: segurar e puxar até embaixo
class Alavanca extends Mg {
  private y = 0;
  private grab = false;
  update(dt: number, io: MgIO) {
    if (io.click && inBox(io, 270, 90 + this.y * 200, 100, 60)) this.grab = true;
    if (!io.down) this.grab = false;
    if (this.grab) this.y = clamp(this.y + io.dy * 0.006, 0, 1);
    else this.y = Math.max(0, this.y - dt * 1.5);
    if (this.y >= 0.98) this.done = true;
  }
  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#5a1414';
    g.fillRect(300, 100, 40, 260);
    rr(g, 270, 90 + this.y * 200, 100, 60, 12);
    g.fillStyle = '#e5484d';
    g.fill();
    text(g, 'PUXE', 320, 120 + this.y * 200, 20, '#fff', 'center', 800);
    text(g, 'clique na alavanca e arraste para baixo', 320, 40, 16, '#aab3c8', 'center', 500);
  }
}

// ------------------------------------------------------------------ balcão: pagar o valor exato com moedas
class Balcao extends Mg {
  private price: number;
  private paid = 0;
  private coins = [1, 0.5, 0.25, 0.1];
  constructor(opts: Record<string, unknown>, sfx: Snd) {
    super(opts, sfx);
    this.price = Number(opts.price ?? 3.75);
  }
  update(_dt: number, io: MgIO) {
    if (!io.click) return;
    this.coins.forEach((c, i) => {
      if (Math.hypot(io.x - (130 + i * 125), io.y - 260) < 48) {
        this.paid = Math.round((this.paid + c) * 100) / 100;
        this.sfx('coin', 0.4);
        if (this.paid > this.price + 1e-6) {
          this.say('passou do valor! de novo', '#ff6b6b');
          this.paid = 0;
        } else if (Math.abs(this.paid - this.price) < 1e-6) this.done = true;
      }
    });
  }
  draw(g: CanvasRenderingContext2D) {
    text(g, `🥨 salgadinho: R$ ${this.price.toFixed(2).replace('.', ',')}`, 320, 80, 28, '#ffd23f', 'center', 800);
    text(g, `pago: R$ ${this.paid.toFixed(2).replace('.', ',')}`, 320, 140, 24, '#fff', 'center', 700, MONO);
    this.coins.forEach((c, i) => {
      g.fillStyle = c >= 1 ? '#d9b46a' : '#c9ced8';
      g.beginPath();
      g.arc(130 + i * 125, 260, 46, 0, Math.PI * 2);
      g.fill();
      text(g, c >= 1 ? 'R$1' : `${Math.round(c * 100)}¢`, 130 + i * 125, 262, 22, '#1b2233', 'center', 800);
    });
  }
}

// ------------------------------------------------------------------ ponteiros: arrastar o ponteiro dos minutos até a marca
class Ponteiros extends Mg {
  private a = -Math.PI / 2;
  private target = -Math.PI / 2 + Math.PI * (0.5 + Math.random());
  private grab = false;
  update(_dt: number, io: MgIO) {
    if (io.click && Math.hypot(io.x - 320, io.y - 200) < 140) this.grab = true;
    if (!io.down) this.grab = false;
    if (this.grab) this.a = Math.atan2(io.y - 200, io.x - 320);
    const d = Math.abs(Math.atan2(Math.sin(this.a - this.target), Math.cos(this.a - this.target)));
    if (!this.grab && io.release && d < 0.12) this.done = true;
    else if (io.release && d >= 0.12) this.say('mais um pouco…', '#ffb36b');
  }
  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#fbfbf7';
    g.beginPath();
    g.arc(320, 200, 140, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(61,220,151,0.8)';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(320, 200, 128, this.target - 0.12, this.target + 0.12);
    g.stroke();
    g.strokeStyle = '#1b2233';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(320, 200);
    g.lineTo(320 + Math.cos(this.a) * 120, 200 + Math.sin(this.a) * 120);
    g.stroke();
    text(g, 'arraste o ponteiro até o verde e solte', 320, 30, 16, '#aab3c8', 'center', 500);
  }
}

// ------------------------------------------------------------------ pôster (difícil): alinhar balançando e alisar 5 bolhas em 6 s
class Poster extends Mg {
  private phase: 0 | 1 = 0;
  private px = 320;
  private py = 200;
  private bubbles: { x: number; y: number; ok: boolean }[] = [];
  private bt = 0;
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
          this.sfx('thud', 0.5);
        } else {
          this.say('torto! tente de novo', '#ff6b6b');
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
        this.sfx('pop', 0.4);
      }
    }
    if (this.bubbles.every((b) => b.ok)) this.done = true;
    else if (this.bt <= 0) {
      this.say('bolhas! recomeçando', '#ff6b6b');
      this.phase = 0;
    }
  }
  draw(g: CanvasRenderingContext2D) {
    g.strokeStyle = '#ffd23f';
    g.setLineDash([8, 6]);
    g.lineWidth = 3;
    g.strokeRect(320 - 110, 200 - 140, 220, 280);
    g.setLineDash([]);
    const x = this.phase === 0 ? this.px : 320;
    const y = this.phase === 0 ? this.py : 200;
    g.fillStyle = '#ff8a3d';
    g.fillRect(x - 110, y - 140, 220, 280);
    text(g, 'SEXTA', x, y - 40, 40, '#fff', 'center', 800);
    text(g, 'EXISTE?', x, y + 10, 40, '#fff', 'center', 800);
    if (this.phase === 1) {
      for (const b of this.bubbles)
        if (!b.ok) {
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.beginPath();
          g.arc(b.x, b.y, 14, 0, Math.PI * 2);
          g.fill();
        }
      text(g, `${Math.max(0, this.bt).toFixed(1)} s`, 560, 40, 24, this.bt < 2 ? '#ff6b6b' : '#fff', 'center', 800, MONO);
    } else text(g, 'clique quando o pôster encaixar na moldura', 320, 380, 16, '#aab3c8', 'center', 500);
  }
}

// ------------------------------------------------------------------ comer escondido: cliques sem passar do barulho
class Comer extends Mg {
  private bites = 0;
  private noise = 0;
  update(dt: number, io: MgIO) {
    this.noise = Math.max(0, this.noise - dt * 0.6);
    if (io.click) {
      this.noise += 0.38;
      this.bites++;
      this.sfx('crunch', 0.3);
      if (this.noise > 1) {
        this.say('CRUNCH! alto demais', '#ff6b6b');
        this.result = 'barulho';
        this.noise = 0.6;
      }
      if (this.bites >= 8) this.done = true;
    }
  }
  draw(g: CanvasRenderingContext2D) {
    text(g, '🥨', 320, 170, 120, '#fff', 'center');
    g.fillStyle = '#20263a';
    g.fillRect(140, 300, 360, 26);
    g.fillStyle = this.noise > 0.8 ? '#e5484d' : '#3ddc97';
    g.fillRect(140, 300, 360 * clamp(this.noise, 0, 1), 26);
    text(g, `mordidas ${this.bites}/8 · não deixe o barulho encher`, 320, 350, 16, '#aab3c8', 'center', 500);
  }
  solve() {
    this.result = true;
    this.done = true;
  }
}

/** O painel: um canvas DOM no meio da tela, com cursor virtual. */
export class MinigamePanel {
  private wrap: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private cur: { spec: MgSpec; mg: Mg } | null = null;
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
    this.canvas.width = PW;
    this.canvas.height = PH + 40;
    this.canvas.style.cssText = 'width:100%;height:100%;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.55);';
    this.wrap.append(this.canvas);
    document.body.append(this.wrap);
    this.g = this.canvas.getContext('2d')!;
  }

  get open() {
    return !!this.cur;
  }
  get kind() {
    return this.cur?.spec.kind ?? null;
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
    this.cur = { spec, mg };
    this.cx = PW / 2;
    this.cy = PH / 2 + 60;
    this.wasDown = this.input.isDown('Mouse0');
    this.wrap.style.display = 'block';
    this.audio.play('click', 0.5);
  }

  /** Fecha. `cancel`: sem progresso (Q, pausa, perseguição). */
  close(cancel: boolean) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.wrap.style.display = 'none';
    if (cancel) c.spec.onCancel?.();
  }

  /** Testes e robôs: resolve o minigame aberto na hora. */
  solve() {
    this.cur?.mg.solve();
  }

  update(realDt: number) {
    const c = this.cur;
    if (!c) return;
    const inp = this.input;
    if (inp.pressed('KeyQ')) return this.close(true);
    const dx = inp.dx * 0.9;
    const dy = inp.dy * 0.9;
    this.cx = clamp(this.cx + dx, 0, PW);
    this.cy = clamp(this.cy + dy, 0, PH);
    const down = inp.isDown('Mouse0');
    const io: MgIO = { x: this.cx, y: this.cy, down, click: down && !this.wasDown, release: !down && this.wasDown, dx, dy, key: (code) => inp.pressed(code) };
    this.wasDown = down;
    const mg = c.mg;
    mg.t += realDt;
    mg.flashT = Math.max(0, mg.flashT - realDt);
    mg.update(realDt, io);
    this.draw(c.spec, mg, io);
    if (mg.done) {
      this.cur = null;
      this.wrap.style.display = 'none';
      this.audio.play('confirm', 0.6);
      c.spec.onDone(mg.result);
    }
  }

  private draw(spec: MgSpec, mg: Mg, io: MgIO) {
    const g = this.g;
    g.save();
    g.fillStyle = 'rgba(16,20,32,0.94)';
    g.fillRect(0, 0, PW, PH + 40);
    // título e rodapé
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, PW, 4);
    text(g, spec.title, 20, 22, 18, '#ffd23f', 'left', 800);
    text(g, '[Q] sair', PW - 20, 22, 14, '#8a93a8', 'right', 600);
    g.translate(0, 30);
    mg.draw(g);
    const dragger = mg as unknown as { drawDrag?: (g: CanvasRenderingContext2D, io: MgIO) => void };
    dragger.drawDrag?.(g, io);
    if (mg.flashT > 0) text(g, mg.flash, PW / 2, PH - 6, 20, mg.flashColor, 'center', 800);
    if (spec.hint) text(g, spec.hint, 20, PH - 6, 13, '#8a93a8', 'left', 500);
    // cursor
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(io.x, io.y);
    g.lineTo(io.x + 14, io.y + 18);
    g.lineTo(io.x + 4, io.y + 17);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
