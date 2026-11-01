import { App, MONO, rr, text, type Rect, type ScreenInput } from './common';

export type WorkKind = 'planilha' | 'emails' | 'slides' | 'triagem';

const REPLIES = ['ok, vou ver', 'segue em anexo', 'bom dia!', 'pode deixar', 'ciente', 'obrigado!', 'na sexta sai', 'combinado'];
const SENDERS = ['cliente@megacorp', 'rh@bosskey', 'dono@bosskey', 'ti@bosskey', 'fornecedor@papelaria'];
const SUBJECTS = ['URGENTE!!!', 'Re: Re: Re: proposta', 'reunião de alinhamento', 'cadê o relatório?', 'boleto anexo', 'sinergia 2.0'];
/** Triagem (v0.10): o que é importante e o que é spam. */
const TRIAGE_IMP = ['Reunião: metas do Q4', 'RE: contrato assinado', 'Cliente: proposta final', 'RH: folha de ponto', 'Dono: relatório da semana', 'TI: troca de senha'];
const TRIAGE_SPAM = ['GANHE 1 MILHÃO!!!', 'Seu pacote não foi entregue', 'Remédio milagroso 50% OFF', 'Você foi sorteado(a)!', 'Corrente: repasse para 10', 'Tênis de marca R$ 9,90'];
const SLIDE_SETS: { hint: string; items: string[] }[] = [
  { hint: 'na ordem dos trimestres', items: ['Q1', 'Q2', 'Q3', 'Q4'] },
  { hint: 'na ordem da semana', items: ['SEG', 'TER', 'QUA', 'QUI'] },
  { hint: 'contando a história', items: ['Início', 'Problema', 'Solução', 'Lucro'] },
  { hint: 'do menor para o maior', items: ['10%', '25%', '50%', '99%'] },
];
/** Tecla → caractere para digitar respostas (layout ABNT/US simples). */
const KEYS: [string, string][] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c): [string, string] => [`Key${c.toUpperCase()}`, c]),
  ...'0123456789'.split('').map((c): [string, string] => [`Digit${c}`, c]),
  ['Space', ' '], ['Comma', ','], ['Period', '.'], ['Slash', '!'], ['Digit1', '!'],
];

type Job =
  | { kind: 'planilha'; rows: { a: number; b: number; typed: string; ok: boolean }[]; row: number }
  | { kind: 'emails'; mails: { from: string; subject: string; reply: string; typed: number }[]; cur: number }
  | { kind: 'slides'; hint: string; items: string[]; order: number[]; next: number; cards: Rect[] }
  | { kind: 'triagem'; mails: { subject: string; spam: boolean }[]; cur: number; btns: Rect[] };

/**
 * "Trabalho": a tarefa fixa de monitor do dia (totais, e-mails ou slides). É uma janela segura (não proibida).
 * Totais e slides são puzzles (resposta errada = Suspeita); e-mails são digitação.
 */
export class Trabalho extends App {
  readonly id = 'trabalho' as const;
  readonly title = 'Tarefas_do_Chefe.exe';
  readonly forbidden = false;
  readonly accent = '#2F5FA8';
  readonly icon = '✉';
  private job: Job | null = null;
  private flash = 0;
  private flashOk = false;
  private t = 0;

  get busy() {
    return !!this.job;
  }

  /** Digitando e-mail: as teclas são do texto, não atalhos. */
  get typing() {
    return this.job?.kind === 'emails';
  }

  badge() {
    return this.job ? '1' : '';
  }

  resetDay() {
    this.job = null;
  }

  start(kind: WorkKind) {
    if (kind === 'planilha') {
      const rows = Array.from({ length: 3 }, () => ({ a: 12 + Math.floor(Math.random() * 80), b: 7 + Math.floor(Math.random() * 60), typed: '', ok: false }));
      this.job = { kind, rows, row: 0 };
    } else if (kind === 'emails') {
      const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
      const used = new Set<string>();
      const mails = Array.from({ length: 3 }, () => {
        let r = pick(REPLIES);
        while (used.has(r)) r = pick(REPLIES);
        used.add(r);
        return { from: pick(SENDERS), subject: pick(SUBJECTS), reply: r, typed: 0 };
      });
      this.job = { kind, mails, cur: 0 };
    } else if (kind === 'triagem') {
      const mails = Array.from({ length: 6 }, () => {
        const spam = Math.random() < 0.5;
        const pool = spam ? TRIAGE_SPAM : TRIAGE_IMP;
        return { subject: pool[Math.floor(Math.random() * pool.length)], spam };
      });
      this.job = { kind, mails, cur: 0, btns: [] };
    } else {
      const set = SLIDE_SETS[Math.floor(Math.random() * SLIDE_SETS.length)];
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      this.job = { kind, hint: set.hint, items: set.items, order, next: 0, cards: [] };
    }
  }

  cancel() {
    this.job = null;
  }

  private wrong() {
    this.flash = 1;
    this.flashOk = false;
    this.host.emit({ t: 'task', result: 'wrong' });
    this.host.emit({ t: 'sfx', name: 'miss' });
  }

  private good() {
    this.flash = 0.6;
    this.flashOk = true;
    this.host.emit({ t: 'sfx', name: 'tick', param: 1 });
  }

  private finish() {
    this.job = null;
    this.host.emit({ t: 'task', result: 'done' });
  }

  update(dt: number, inp: ScreenInput) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const j = this.job;
    if (!j) return;
    if (j.kind === 'planilha') {
      const r = j.rows[j.row];
      for (let d = 0; d <= 9; d++) if ((inp.keyPressed(`Digit${d}`) || inp.keyPressed(`Numpad${d}`)) && r.typed.length < 4) r.typed += d;
      if (inp.keyPressed('Backspace')) r.typed = r.typed.slice(0, -1);
      if ((inp.keyPressed('Enter') || inp.keyPressed('NumpadEnter')) && r.typed) {
        if (Number(r.typed) === r.a + r.b) {
          r.ok = true;
          this.good();
          j.row++;
          if (j.row >= j.rows.length) this.finish();
        } else {
          r.typed = '';
          this.wrong();
        }
      }
    } else if (j.kind === 'emails') {
      const m = j.mails[j.cur];
      const want = m.reply[m.typed];
      const typedOk = KEYS.some(([code, ch]) => ch === want && inp.keyPressed(code));
      const anyKey = KEYS.some(([code]) => inp.keyPressed(code));
      if (typedOk) {
        m.typed++;
        this.host.emit({ t: 'sfx', name: 'tick' });
        if (m.typed >= m.reply.length) {
          this.good();
          j.cur++;
          if (j.cur >= j.mails.length) this.finish();
        }
      } else if (anyKey) {
        this.flash = 0.4;
        this.flashOk = false;
      }
    } else if (j.kind === 'triagem') {
      // ← / A = importante · → / D = spam (ou clique nos botões)
      let pick: boolean | null = null;
      if (inp.keyPressed('ArrowLeft') || inp.keyPressed('KeyA')) pick = false;
      if (inp.keyPressed('ArrowRight') || inp.keyPressed('KeyD')) pick = true;
      if (inp.pressed)
        j.btns.forEach((b, i) => {
          if (inp.x >= b.x && inp.x <= b.x + b.w && inp.y >= b.y && inp.y <= b.y + b.h) pick = i === 1;
        });
      if (pick === null) return;
      const m = j.mails[j.cur];
      if (m.spam === pick) {
        this.good();
        j.cur++;
        if (j.cur >= j.mails.length) this.finish();
      } else this.wrong();
    } else if (inp.pressed) {
      j.cards.forEach((c, i) => {
        if (inp.x < c.x || inp.x > c.x + c.w || inp.y < c.y || inp.y > c.y + c.h) return;
        const item = j.order[i];
        if (item < j.next) return;
        if (item === j.next) {
          j.next++;
          this.good();
          if (j.next >= 4) this.finish();
        } else {
          j.next = 0;
          this.wrong();
        }
      });
    }
  }

  draw(g: CanvasRenderingContext2D, r: Rect) {
    g.fillStyle = '#eef3fb';
    g.fillRect(r.x, r.y, r.w, r.h);
    const j = this.job;
    if (this.flash > 0) {
      g.fillStyle = this.flashOk ? `rgba(61,220,151,${this.flash * 0.25})` : `rgba(255,77,109,${this.flash * 0.3})`;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    if (!j) {
      text(g, 'Sem pendências ✓', r.x + r.w / 2, r.y + r.h / 2 - 20, 40, '#2F5FA8', 'center', 700);
      text(g, 'quando a tarefa fixa do dia é de PC, ela aparece aqui', r.x + r.w / 2, r.y + r.h / 2 + 26, 18, '#6a7690', 'center', 500);
      return;
    }
    if (j.kind === 'planilha') {
      text(g, '▦ Fechar os totais (some e aperte ENTER)', r.x + 28, r.y + 34, 22, '#1b2233', 'left', 700);
      j.rows.forEach((row, i) => {
        const y = r.y + 90 + i * 110;
        const cur = i === j.row;
        rr(g, r.x + 40, y, r.w - 80, 86, 14);
        g.fillStyle = cur ? '#ffffff' : '#f5f8fd';
        g.fill();
        g.strokeStyle = cur ? '#2F5FA8' : '#d8e1ef';
        g.lineWidth = cur ? 3 : 1.5;
        g.stroke();
        text(g, `${row.a}`, r.x + 120, y + 43, 40, '#1b2233', 'center', 700, MONO);
        text(g, '+', r.x + 210, y + 43, 36, '#6a7690', 'center', 700);
        text(g, `${row.b}`, r.x + 300, y + 43, 40, '#1b2233', 'center', 700, MONO);
        text(g, '=', r.x + 390, y + 43, 36, '#6a7690', 'center', 700);
        rr(g, r.x + 440, y + 14, 220, 58, 10);
        g.fillStyle = row.ok ? '#d9f7e6' : cur ? '#fffbe6' : '#eef2f8';
        g.fill();
        const shown = row.ok ? `${row.a + row.b} ✓` : row.typed + (cur && Math.floor(this.t * 2) % 2 ? '_' : '');
        text(g, shown, r.x + 550, y + 43, 36, row.ok ? '#1e7a46' : '#1b2233', 'center', 700, MONO);
      });
      text(g, 'errar a conta = o chefe percebe (+Suspeita)', r.x + r.w / 2, r.y + r.h - 24, 16, '#b3162e', 'center', 600);
    } else if (j.kind === 'emails') {
      text(g, `✉ Responder e-mails  (${j.cur}/${j.mails.length})`, r.x + 28, r.y + 34, 22, '#1b2233', 'left', 700);
      const m = j.mails[j.cur];
      rr(g, r.x + 40, r.y + 70, r.w - 80, 120, 14);
      g.fillStyle = '#ffffff';
      g.fill();
      text(g, `De: ${m.from}`, r.x + 64, r.y + 100, 18, '#6a7690', 'left', 600, MONO);
      text(g, `Assunto: ${m.subject}`, r.x + 64, r.y + 134, 24, '#1b2233', 'left', 700);
      text(g, 'digite a resposta:', r.x + 64, r.y + 230, 18, '#6a7690', 'left', 600);
      text(g, 'segure E para levantar', r.x + r.w - 64, r.y + 230, 16, '#6a7690', 'right', 600);
      rr(g, r.x + 40, r.y + 250, r.w - 80, 90, 14);
      g.fillStyle = '#fffbe6';
      g.fill();
      g.font = `700 40px ${MONO}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      const done = m.reply.slice(0, m.typed);
      const rest = m.reply.slice(m.typed);
      g.fillStyle = '#1e7a46';
      g.fillText(done, r.x + 70, r.y + 295);
      const dw = g.measureText(done).width;
      g.fillStyle = '#9aa6bd';
      g.fillText(rest, r.x + 70 + dw, r.y + 295);
      if (Math.floor(this.t * 2) % 2) {
        g.fillStyle = '#2F5FA8';
        g.fillRect(r.x + 70 + dw, r.y + 274, 3, 42);
      }
    } else if (j.kind === 'triagem') {
      text(g, `✉ Triagem da caixa de entrada  (${j.cur}/${j.mails.length})`, r.x + 28, r.y + 34, 22, '#1b2233', 'left', 700);
      const m = j.mails[j.cur];
      rr(g, r.x + 40, r.y + 80, r.w - 80, 130, 14);
      g.fillStyle = '#ffffff';
      g.fill();
      text(g, m ? m.subject : '', r.x + r.w / 2, r.y + 145, 32, '#1b2233', 'center', 700);
      j.btns = [
        { x: r.x + 60, y: r.y + 250, w: (r.w - 140) / 2, h: 90 },
        { x: r.x + 80 + (r.w - 140) / 2, y: r.y + 250, w: (r.w - 140) / 2, h: 90 },
      ];
      j.btns.forEach((b, i) => {
        rr(g, b.x, b.y, b.w, b.h, 14);
        g.fillStyle = i ? '#e5484d' : '#2F5FA8';
        g.fill();
        text(g, i ? 'SPAM  →  (D)' : '(A)  ←  IMPORTANTE', b.x + b.w / 2, b.y + b.h / 2, 26, '#fff', 'center', 800);
      });
      text(g, 'errar = o chefe percebe (+Suspeita)', r.x + r.w / 2, r.y + r.h - 24, 16, '#b3162e', 'center', 600);
    } else {
      text(g, `▭ Montar os slides ${j.hint} (clique em ordem)`, r.x + 28, r.y + 34, 22, '#1b2233', 'left', 700);
      j.cards = [];
      j.order.forEach((item, i) => {
        const w = 200;
        const x = r.x + 40 + i * (w + 30);
        const y = r.y + 110;
        const c: Rect = { x, y, w, h: 150 };
        j.cards.push(c);
        const placed = item < j.next;
        rr(g, x, y + (placed ? 170 : 0), w, 150, 14);
        g.fillStyle = placed ? '#d9f7e6' : '#ffffff';
        g.fill();
        g.strokeStyle = placed ? '#3ddc97' : '#2F5FA8';
        g.lineWidth = 3;
        g.stroke();
        text(g, j.items[item], x + w / 2, y + (placed ? 170 : 0) + 75, 38, '#1b2233', 'center', 700);
        if (placed) text(g, `#${item + 1}`, x + w / 2, y + 340, 20, '#1e7a46', 'center', 700);
      });
      text(g, 'ordem errada = começa de novo e o chefe percebe (+Suspeita)', r.x + r.w / 2, r.y + r.h - 24, 16, '#b3162e', 'center', 600);
    }
  }
}
