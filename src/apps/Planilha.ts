import { App, MONO, rr, text, clamp, type Rect, type ScreenInput } from './common';

const BEAT = 2; // 4 batidas em 8 s
const TOL = 0.18;
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** A planilha: janela "segura". F no ritmo baixa Suspeita e Calor. */
export class Planilha extends App {
  readonly id = 'planilha' as const;
  readonly title = 'Relatorio_Q3_FINAL_v7(2).xlsx';
  readonly forbidden = false;
  readonly accent = '#1e7a46';
  readonly icon = '▦';
  private phase = 0;
  private cells: string[][] = [];
  private cursor = 0;
  combo = 0;
  private lastHit = -99;
  private feedback = '';
  private feedbackT = 0;
  private feedbackColor = '#fff';
  private pulse = 0;
  private bars = [0.4, 0.55, 0.3, 0.7, 0.5, 0.62];
  private t = 0;
  hitsTotal = 0;

  constructor(host: ConstructorParameters<typeof App>[0]) {
    super(host);
    this.resetDay();
  }

  resetDay() {
    this.cells = [];
    for (let r = 0; r < 14; r++) {
      const row: string[] = [];
      for (let c = 0; c < COLS.length; c++) row.push(r < 3 ? this.rnd() : '');
      this.cells.push(row);
    }
    this.cursor = 3 * COLS.length;
    this.combo = 0;
    this.lastHit = -99;
  }

  private rnd() {
    return (Math.random() * 9999).toFixed(Math.random() < 0.5 ? 0 : 2);
  }

  /** Em ritmo = acertou uma batida há menos de uma batida e pouco. */
  get inRhythm() {
    return this.t - this.lastHit < BEAT + 0.3;
  }

  update(dt: number, inp: ScreenInput) {
    this.t += dt;
    this.phase = (this.phase + dt) % BEAT;
    this.feedbackT = Math.max(0, this.feedbackT - dt);
    this.pulse = Math.max(0, this.pulse - dt * 4);
    if (inp.keyPressed('KeyF')) {
      const err = Math.min(this.phase, BEAT - this.phase);
      if (err <= TOL) {
        const perfect = err < 0.07;
        this.combo++;
        this.hitsTotal++;
        this.lastHit = this.t;
        this.pulse = 1;
        this.feedback = perfect ? 'PERFEITO!' : 'NO RITMO';
        this.feedbackColor = perfect ? '#ffd23f' : '#3ddc97';
        this.feedbackT = 0.7;
        for (let i = 0; i < 4; i++) this.fillCell();
        this.bars = this.bars.map((b) => clamp(b + (Math.random() - 0.4) * 0.15, 0.15, 0.95));
        this.host.emit({ t: 'beat', hit: true, perfect });
        this.host.emit({ t: 'sfx', name: 'tick', param: perfect ? 1 : 0 });
      } else {
        this.combo = 0;
        this.feedback = 'FORA DO RITMO';
        this.feedbackColor = '#ff4d6d';
        this.feedbackT = 0.7;
        this.host.emit({ t: 'beat', hit: false, perfect: false });
        this.host.emit({ t: 'sfx', name: 'miss' });
      }
    }
    // quem está "em ritmo" deixa uma batida passar sem errar
  }

  private fillCell(): void {
    const r = Math.floor(this.cursor / COLS.length);
    const c = this.cursor % COLS.length;
    if (r >= this.cells.length) {
      this.cells.shift();
      this.cells.push(COLS.map(() => ''));
      this.cursor -= COLS.length;
      return this.fillCell();
    }
    this.cells[r][c] = this.rnd();
    this.cursor++;
  }

  draw(g: CanvasRenderingContext2D, r: Rect) {
    // fita de ferramentas
    g.fillStyle = '#f3f6f3';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#e1ebe3';
    g.fillRect(r.x, r.y, r.w, 34);
    const tools = ['Arquivo', 'Página Inicial', 'Inserir', 'Fórmulas', 'Dados', 'Revisão'];
    tools.forEach((s, i) => text(g, s, r.x + 14 + i * 96, r.y + 17, 15, i === 1 ? '#1e7a46' : '#4a5a50', 'left', i === 1 ? 700 : 500));
    // fórmula
    g.fillStyle = '#fff';
    g.fillRect(r.x + 8, r.y + 40, r.w - 270, 26);
    g.strokeStyle = '#cfd8d0';
    g.strokeRect(r.x + 8.5, r.y + 40.5, r.w - 271, 25);
    text(g, 'fx  =SOMA(SINERGIA:FOCO)*PROATIVIDADE', r.x + 16, r.y + 53, 14, '#50605a', 'left', 500, MONO);
    // grade
    const gx = r.x + 8;
    const gy = r.y + 72;
    const cw = (r.w - 270) / (COLS.length + 0.5);
    const ch = (r.h - 80) / (this.cells.length + 1);
    g.fillStyle = '#e8efe9';
    g.fillRect(gx, gy, r.w - 270, ch);
    COLS.forEach((c, i) => text(g, c, gx + cw * 0.5 + cw * (i + 0.5), gy + ch / 2, 13, '#56645c', 'center', 600));
    const curRow = Math.floor(this.cursor / COLS.length);
    for (let row = 0; row < this.cells.length; row++) {
      const y = gy + ch * (row + 1);
      g.fillStyle = row % 2 ? '#fbfdfb' : '#ffffff';
      g.fillRect(gx, y, r.w - 270, ch);
      text(g, String(row + 1 + Math.max(0, this.hitsTotal / 2 | 0)), gx + cw * 0.25, y + ch / 2, 12, '#8a968f', 'center', 500, MONO);
      for (let c = 0; c < COLS.length; c++) {
        const v = this.cells[row][c];
        const cx = gx + cw * 0.5 + cw * c;
        if (row === curRow && c === this.cursor % COLS.length) {
          g.strokeStyle = '#1e7a46';
          g.lineWidth = 2.5;
          g.strokeRect(cx + 1, y + 1, cw - 2, ch - 2);
        }
        if (v) text(g, v, cx + cw - 6, y + ch / 2, 13, '#22302a', 'right', 500, MONO);
      }
    }
    g.strokeStyle = '#dfe7e1';
    g.lineWidth = 1;
    for (let c = 0; c <= COLS.length; c++) {
      g.beginPath();
      g.moveTo(gx + cw * 0.5 + cw * c, gy);
      g.lineTo(gx + cw * 0.5 + cw * c, gy + ch * (this.cells.length + 1));
      g.stroke();
    }
    // painel do ritmo
    const px = r.x + r.w - 252;
    const py = r.y + 40;
    rr(g, px, py, 244, r.h - 48, 14);
    g.fillStyle = '#123d27';
    g.fill();
    text(g, 'MODO PRODUTIVO', px + 122, py + 24, 16, '#bfe9cf', 'center', 700);
    text(g, 'aperte F no ritmo', px + 122, py + 46, 13, '#7fbf98', 'center', 500);
    const cx = px + 122;
    const cy = py + 150;
    const R0 = 46;
    const k = this.phase / BEAT; // 0..1, batida em 0/1
    const ringR = R0 + (1 - k) * 70;
    // zona de acerto
    g.strokeStyle = 'rgba(61,220,151,0.25)';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(cx, cy, R0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = this.inRhythm ? '#3ddc97' : '#8fd6ae';
    g.lineWidth = 4 + this.pulse * 6;
    g.beginPath();
    g.arc(cx, cy, R0 + this.pulse * 8, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.35 + k * 0.65})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, ringR, 0, Math.PI * 2);
    g.stroke();
    text(g, 'F', cx, cy + 2, 40 + this.pulse * 10, '#ffffff', 'center', 700);
    if (this.feedbackT > 0) text(g, this.feedback, cx, cy + 92, 20 + this.feedbackT * 8, this.feedbackColor, 'center', 700);
    text(g, `combo ×${this.combo}`, cx, cy + 124, 15, '#bfe9cf', 'center', 600, MONO);
    // mini gráfico
    const bx = px + 22;
    const by = py + r.h - 70;
    this.bars.forEach((b, i) => {
      g.fillStyle = i % 2 ? '#3ddc97' : '#2fb07a';
      g.fillRect(bx + i * 34, by - b * 70, 24, b * 70);
    });
    text(g, this.inRhythm ? '▼ SUSPEITA' : 'parado', px + 122, by + 16, 14, this.inRhythm ? '#3ddc97' : '#7fbf98', 'center', 700);
  }
}
