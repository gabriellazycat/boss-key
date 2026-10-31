import { AGENDA, longAway, type AgendaKind } from '../balance';
import { W } from '../world/Office';
import type { Game } from './Game';

/** Um compromisso do chefe: a hora (s do dia), quanto dura e se a agenda mostra (o "rasurado" fica ???). */
export interface AgendaItem {
  kind: AgendaKind;
  at: number;
  dur: number;
  hidden: boolean;
  /** Já começou (o host cumpre na hora, ou assim que o chefe estiver livre). */
  done: boolean;
}

/** Na rede: [tipo, hora, duração, rasurado]. */
export type AgendaNet = [AgendaKind, number, number, 0 | 1][];

/** "10:30": o dia vai de 09:00 a 18:00 (o mesmo relógio do HUD), arredondado de 15 em 15 min. */
export function clockOf(t: number, duration: number) {
  const m = 9 * 60 + Math.round(((t / duration) * 540) / 15) * 15;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Agenda do chefe: os compromissos do dia têm hora marcada e ficam no quadro ao lado da sala dele.
 * É a brecha que dá para planejar (café, almoço, cliente) — ou o perigo que dá para evitar (ronda).
 * Só o host cumpre; o convidado recebe a lista pronta e só mostra.
 */
export class Agenda {
  items: AgendaItem[] = [];
  /** Você já anotou a agenda (leu no quadro): ela aparece na ajuda (TAB) e no painel. */
  noted = false;

  constructor(private g: Game) {}

  /**
   * Sorteia o dia: sempre uma ronda, uma pausa curta e UMA AUSÊNCIA LONGA (a janela do assalto, no meio do dia),
   * os clientes no horário deles e o resto do pool. A longa ocupa a fatia dela inteira (duração + folga).
   */
  roll(day: number, clients: number) {
    const A = AGENDA;
    const d = this.g.duration;
    const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
    const n = Math.min(A.max, A.base + Math.floor(day / A.perDays));
    const longKind = pick(A.long);
    const longDur = longAway(longKind, day, !this.g.net);
    const kinds: AgendaKind[] = ['ronda', Math.random() < 0.5 ? 'cafe' : 'almoco'];
    for (let i = 0; i < clients && kinds.length < n - 1; i++) kinds.push('cliente');
    while (kinds.length < n - 1) kinds.push(pick(A.pool));
    const order = [...kinds].sort(() => Math.random() - 0.5);
    // a longa entra no meio (nem cedo demais, nem no fim do expediente)
    order.splice(Math.floor(order.length / 2), 0, longKind);
    const t0 = this.g.calm + A.firstAfter;
    const t1 = A.end * d;
    const slot = Math.max(A.gap, (t1 - t0 - longDur - A.gap) / (order.length - 1));
    let cur = t0;
    this.items = order.map((kind) => {
      const long = kind === longKind && A.long.includes(kind);
      const at = Math.round(cur + (long ? 4 : Math.random() * Math.max(0, slot - A.gap)));
      cur = long ? at + longDur + A.gap : cur + slot;
      return { kind, at, dur: long ? longDur : A.dur[kind], hidden: false, done: false };
    });
    // do 3º dia em diante, um compromisso vem rasurado (nunca a ronda, o perigo, nem a longa, a janela)
    if (day >= A.smudgeFrom) {
      const smudge = this.items.filter((x) => x.kind !== 'ronda' && !A.long.includes(x.kind));
      if (smudge.length) pick(smudge).hidden = true;
    }
    this.noted = false;
  }

  /** A ausência longa de hoje (a janela do assalto). */
  get longItem() {
    return this.items.find((x) => AGENDA.long.includes(x.kind)) ?? null;
  }

  /** Horários de chegada dos clientes (a reunião começa na hora marcada; ele sobe uns segundos antes). */
  clientTimes() {
    return this.items.filter((x) => x.kind === 'cliente').map((x) => Math.max(1, x.at - AGENDA.clientLead));
  }

  net(): AgendaNet {
    return this.items.map((x) => [x.kind, x.at, x.dur, x.hidden ? 1 : 0]);
  }

  apply(n: AgendaNet) {
    this.items = n.map(([kind, at, dur, h]) => ({ kind, at, dur, hidden: !!h, done: false }));
  }

  /** Linhas do quadro (e da ajuda): "10:30 ☕ café na copa". */
  lines() {
    const d = this.g.duration;
    return this.items.map((x) => `${clockOf(x.at, d)}  ${x.hidden ? '??? (rasurado)' : AGENDA.label[x.kind]}${AGENDA.long.includes(x.kind) ? ` (${Math.round(x.dur)} s)` : ''}`);
  }

  /** Índice do próximo compromisso (para destacar no quadro). */
  get nextIdx() {
    return this.items.findIndex((x) => !x.done && x.at >= this.g.time - 1);
  }

  /** Segundos até o próximo compromisso que tira o chefe da sala (Infinity se não houver). */
  untilNextOut() {
    const t = this.g.time;
    const next = this.items.find((x) => !x.done && x.at > t && x.kind !== 'telefone' && x.kind !== 'cliente');
    return next ? next.at - t : Infinity;
  }

  /** Host: cumpre os compromissos na hora (o chefe ocupado cumpre assim que puder). */
  update() {
    const g = this.g;
    if (!g.auth) return;
    const main = g.bosses[0];
    if (!main) return;
    for (const x of this.items) {
      if (x.done || g.time < x.at) continue;
      // cliente: quem cuida é o `Clients` (ele já foi agendado na hora certa)
      if (x.kind === 'cliente') {
        x.done = true;
        continue;
      }
      // ocupado (na rua, perseguindo, com cliente na sala): cumpre assim que puder, atrasado
      if (main.busy || main.state === 'chase' || g.clients.meeting || main.talkW) continue;
      x.done = true;
      this.start(x);
      g.drawBoards();
      break;
    }
  }

  private start(x: AgendaItem) {
    const g = this.g;
    const main = g.bosses[0];
    const P = g.office.P;
    switch (x.kind) {
      case 'ronda':
        main.startRonda(g.rondaTargets(4), 'agenda');
        break;
      case 'cafe':
        main.startRonda([{ kind: 'point', p: W(4.3, 21.25), stay: x.dur, why: 'kitchen' }], 'café');
        main.ball.setProp('mug');
        g.subtitle('[chefe: "hora do cafezinho"]', main.pos);
        break;
      case 'almoco': {
        const L = P.lounge;
        main.startRonda([{ kind: 'point', p: L[Math.floor(Math.random() * L.length)].clone(), stay: x.dur, why: 'kitchen' }], 'almoço');
        g.subtitle('[chefe: "vou almoçar na copa"]', main.pos);
        break;
      }
      case 'impressao':
        main.startRonda([{ kind: 'point', p: P.printer.clone().setZ(P.printer.z - 1.2), stay: x.dur, why: 'printer' }], 'impressão');
        g.subtitle('[chefe: "vou buscar minha impressão"]', main.pos);
        break;
      case 'almocoFora':
      case 'reuniaoAndar':
        // a janela do assalto: desce pelo elevador e some do andar
        main.leaveFloor(x.dur, x.kind === 'almocoFora' ? 'almoço fora' : 'reunião no 11º');
        g.subtitle(x.kind === 'almocoFora' ? '[chefe: "vou almoçar fora. Volto já."]' : '[chefe: "reunião lá no 11º. Não demoro."]', main.pos);
        break;
      case 'telefone':
        // fica na sala: não sai enquanto fala (mas a porta continua de olho)
        g.holdBoss(x.dur);
        g.subtitle('[chefe ao telefone: "sim, sim, claro…"]', main.pos);
        break;
    }
  }
}
