import { App, FONT, MONO, rr, text, type ObjView, type Rect, type ScreenInput } from './common';

const INK = '#2a2f45';
const MUTED = '#6b7189';
const GREEN = '#1e9e5a';
const ORANGE = '#e8742c';

/** HTML do jogo (<kbd>E</kbd>, <b>…</b>) para texto de canvas. */
function plain(s: string) {
  return s.replace(/<kbd>(.*?)<\/kbd>/g, '[$1]').replace(/<[^>]+>/g, '');
}

/** Quebra `s` em linhas de até `w` px na fonte atual de `g`. */
function wrap(g: CanvasRenderingContext2D, s: string, w: number) {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && g.measureText(next).width > w) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Desenha um parágrafo quebrado e devolve o y logo abaixo dele. */
function para(g: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, size: number, color: string, weight = 400) {
  g.font = `${weight} ${size}px ${FONT}`;
  const lh = Math.round(size * 1.3);
  for (const line of wrap(g, plain(s), w)) {
    text(g, line, x, y + lh / 2, size, color, 'left', weight);
    y += lh;
  }
  return y;
}

/**
 * "Objetivos": a lista de FUN do dia (missão grande com as subtarefas, as pequenas e o papo). O HUD não mostra os
 * objetivos de FUN — só aqui, sentado. É janela proibida: o chefe vendo esta tela é como ver um jogo aberto.
 */
export class Objetivos extends App {
  readonly id = 'objetivos' as const;
  readonly title = 'Coisas_pra_fazer_hoje.txt';
  readonly forbidden = true;
  readonly accent = '#8a5cf6';
  readonly icon = '★';
  /** Passos feitos da última vez que a aba esteve aberta (o aviso "!" na barra é o que mudou desde então). */
  private seen = 0;
  /** A lista já foi aberta hoje: só então os ícones de FUN aparecem sobre os lugares. */
  read = false;

  private doneCount(v: ObjView) {
    return v.big.steps.filter((s) => s.st === 'ok').length + (v.big.done ? 1 : 0) + v.small.filter((s) => s.done).length;
  }

  badge() {
    return this.doneCount(this.host.objectives()) > this.seen ? '!' : '';
  }

  onShow() {
    this.seen = this.doneCount(this.host.objectives());
    this.read = true;
  }

  onHide() {
    this.seen = this.doneCount(this.host.objectives());
  }

  resetDay() {
    this.seen = 0;
    this.read = false;
  }

  update(_dt: number, _inp: ScreenInput) {}

  draw(g: CanvasRenderingContext2D, r: Rect) {
    const v = this.host.objectives();
    g.fillStyle = '#fbf7ec';
    g.fillRect(r.x, r.y, r.w, r.h);
    const pad = 22;
    const x0 = r.x + pad;

    // meta do dia
    const done = v.have >= v.goal;
    text(g, done ? 'META DE FUN BATIDA ✓' : 'META DE FUN DE HOJE', x0, r.y + 24, 13, done ? GREEN : MUTED, 'left', 700);
    const bw = r.w - pad * 2 - 190;
    rr(g, x0, r.y + 38, bw, 16, 8);
    g.fillStyle = '#e6e0cf';
    g.fill();
    rr(g, x0, r.y + 38, Math.max(16, bw * Math.min(1, v.have / Math.max(1, v.goal))), 16, 8);
    g.fillStyle = done ? GREEN : ORANGE;
    g.fill();
    text(g, `${v.have} / ${v.goal} FUN${v.team ? ' do time' : ''}`, r.x + r.w - pad, r.y + 46, 18, INK, 'right', 700, MONO);

    // coluna da esquerda: a missão grande
    const top = r.y + 76;
    const lw = Math.round((r.w - pad * 3) * 0.58);
    const B = v.big;
    text(g, '★ MISSÃO GRANDE', x0, top + 8, 13, MUTED, 'left', 700);
    text(g, `${B.icon}  ${B.name}${B.done ? '  ✓' : ''}`, x0, top + 34, 24, B.done ? GREEN : INK, 'left', 700);
    let y = para(g, `“${B.brief}” — o chefe`, x0, top + 52, lw, 14, MUTED);
    y += 10;
    for (const s of B.steps) {
      const now = s.st === 'now';
      g.font = `400 14px ${FONT}`;
      const how = now || s.st === 'todo' ? wrap(g, plain(s.how), lw - 40) : [];
      const h = 30 + how.length * 18 + (how.length ? 6 : 0);
      if (now) {
        rr(g, x0 - 8, y - 2, lw + 16, h, 10);
        g.fillStyle = 'rgba(232,116,44,0.12)';
        g.fill();
      }
      const glyph = s.st === 'ok' ? '✓' : now ? '▸' : '○';
      const col = s.st === 'ok' ? GREEN : now ? ORANGE : MUTED;
      text(g, glyph, x0 + 8, y + 14, 18, col, 'center', 700);
      text(g, plain(s.label), x0 + 30, y + 14, 17, s.st === 'ok' ? MUTED : INK, 'left', now ? 700 : 600);
      if (s.st === 'ok') {
        g.font = `600 17px ${FONT}`;
        g.fillStyle = MUTED;
        g.fillRect(x0 + 30, y + 14, g.measureText(plain(s.label)).width, 1.5);
      }
      how.forEach((line, i) => text(g, line, x0 + 30, y + 37 + i * 18, 14, now ? INK : MUTED, 'left', 400));
      y += h + 4;
    }

    // coluna da direita: as pequenas e o papo
    const rx = x0 + lw + pad;
    const rw = r.x + r.w - pad - rx;
    text(g, '• DIVERSÕES EM DESTAQUE', rx, top + 8, 13, MUTED, 'left', 700);
    y = top + 22;
    for (const s of v.small) {
      g.font = `400 14px ${FONT}`;
      const how = s.done ? [] : wrap(g, plain(s.how), rw - 24);
      const h = 40 + how.length * 18;
      rr(g, rx, y, rw, h, 10);
      g.fillStyle = s.done ? 'rgba(30,158,90,0.10)' : '#ffffff';
      g.fill();
      g.strokeStyle = '#e6e0cf';
      g.lineWidth = 1;
      g.stroke();
      text(g, `${s.icon}  ${s.label}`, rx + 12, y + 20, 17, s.done ? GREEN : INK, 'left', 700);
      text(g, s.prog, rx + rw - 12, y + 20, 14, s.done ? GREEN : ORANGE, 'right', 700, MONO);
      how.forEach((line, i) => text(g, line, rx + 12, y + 42 + i * 18, 14, MUTED, 'left', 400));
      y += h + 10;
    }
    y += 6;
    text(g, '💬 PAPO COM O CHEFE', rx, y + 8, 13, MUTED, 'left', 700);
    para(g, v.papo, rx, y + 20, rw, 15, INK, 600);

    text(g, 'ESPAÇO volta para o trabalho · se o chefe vir esta tela, é como ver um jogo aberto', r.x + r.w / 2, r.y + r.h - 16, 13, MUTED, 'center', 600);
  }
}
