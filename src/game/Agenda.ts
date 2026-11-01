import { AGENDA, longAway, type AgendaKind } from '../balance';
import { W } from '../world/Office';
import type { Game } from './Game';
import type { Worker } from './Worker';

/** Um compromisso do chefe: a hora (s do dia), quanto dura e se a agenda mostra (o "rasurado" fica ???). */
export interface AgendaItem {
  kind: AgendaKind;
  at: number;
  dur: number;
  hidden: boolean;
  /** Já começou (o host cumpre na hora, ou assim que o chefe estiver livre). */
  done: boolean;
  /** Supervisão: de quem (só no host) e o nome que o quadro mostra. */
  w?: Worker;
  who?: string;
}

/** Na rede: [tipo, hora, duração, rasurado, de quem (supervisão)]. */
export type AgendaNet = [AgendaKind, number, number, 0 | 1, string?][];

const findLast = <T,>(a: T[], f: (x: T) => boolean) => {
  for (let i = a.length - 1; i >= 0; i--) if (f(a[i])) return i;
  return -1;
};

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
   * Sorteia o dia (v0.11: cobre o expediente): sempre uma ronda, a SUPERVISÃO, uma pausa curta e UMA AUSÊNCIA LONGA
   * (a janela do assalto, em qualquer ponto do meio do dia), os clientes no horário deles e o resto do pool.
   * Cada compromisso ocupa o tempo dele; a folga que sobra é espalhada ao acaso entre eles.
   * `extraRonda` = truque "Agenda apertada".
   */
  roll(day: number, clients: number, extraRonda = false) {
    const A = AGENDA;
    const g = this.g;
    const d = g.duration;
    const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
    const n = Math.min(A.max, A.base + Math.floor(day / A.perDays)) + (extraRonda ? 1 : 0);
    const longKind = pick(A.long);
    const longDur = longAway(longKind, day, !g.net);
    const kinds: AgendaKind[] = ['ronda', 'supervisao', Math.random() < 0.5 ? 'cafe' : 'almoco'];
    if (extraRonda) kinds.push('ronda');
    for (let i = 0; i < clients && kinds.length < n - 1; i++) kinds.push('cliente');
    while (kinds.length < n - 1) kinds.push(pick(A.pool));
    const order = [...kinds].sort(() => Math.random() - 0.5);
    // a longa: nunca a primeira nem a última, mas em qualquer ponto do meio (a hora dela varia de verdade)
    order.splice(1 + Math.floor(Math.random() * Math.max(1, order.length - 1)), 0, longKind);
    const len = (k: AgendaKind, i: number) => (i === order.indexOf(longKind) ? longDur : Math.max(A.dur[k], A.walk));
    const t0 = g.calm + A.firstAfter;
    const span = A.end * d - t0;
    // não coube: tira os compromissos opcionais do fim (nunca a ronda, a supervisão, o cliente nem a longa)
    const total = () => order.reduce((a, k, i) => a + len(k, i), 0) + A.gap * (order.length - 1);
    while (total() > span) {
      const i = findLast(order, (k) => k !== longKind && k !== 'ronda' && k !== 'supervisao' && k !== 'cliente');
      if (i < 0) break;
      order.splice(i, 1);
    }
    const w = order.map(() => Math.random());
    const free = Math.max(0, span - total());
    const wsum = w.reduce((a, b) => a + b, 0) || 1;
    let cur = t0 + (free * w[0]) / wsum;
    // supervisão: no solo é você; no multi, um jogador vivo sorteado (o nome vai para o quadro)
    const people = g.workers.filter((x) => !x.fired && (x.isPlayer || x.remote));
    this.items = order.map((kind, i) => {
      const at = Math.round(cur);
      const dur = i === order.indexOf(longKind) ? longDur : A.dur[kind];
      cur += len(kind, i) + A.gap + (i + 1 < order.length ? (free * w[i + 1]) / wsum : 0);
      const item: AgendaItem = { kind, at, dur, hidden: false, done: false };
      if (kind === 'supervisao') {
        item.w = people.length ? pick(people) : g.player;
        item.who = g.net ? item.w.name : 'SUA mesa';
      }
      return item;
    });
    // do 3º dia em diante, um compromisso vem rasurado (nunca a ronda, o perigo, nem a longa, a janela)
    if (day >= A.smudgeFrom) {
      const smudge = this.items.filter((x) => x.kind !== 'ronda' && x.kind !== 'supervisao' && !A.long.includes(x.kind));
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
    return this.items.map((x) => [x.kind, x.at, x.dur, x.hidden ? 1 : 0, x.who]);
  }

  apply(n: AgendaNet) {
    // o convidado é a mesa dele? o quadro diz "SUA mesa"
    const me = this.g.player.name;
    this.items = n.map(([kind, at, dur, h, who]) => ({ kind, at, dur, hidden: !!h, done: false, who: who === me ? 'SUA mesa' : who }));
  }

  /**
   * v0.11: a agenda é seguida à risca — o barulho acumulado (instinto) ADIANTA a próxima ronda do quadro em vez de
   * inventar uma. Devolve false se não há ronda para adiantar.
   */
  hurryRonda() {
    const g = this.g;
    const next = this.items.find((x) => !x.done && x.kind === 'ronda' && x.at > g.time + 8);
    if (!next) return false;
    next.at = Math.round(g.time + 8);
    next.hidden = false;
    this.items.sort((a, b) => a.at - b.at);
    g.drawBoards();
    g.net?.syncShop();
    g.subtitle('[chefe: "quanto barulho… vou dar uma volta já, já"]', g.bosses[0]?.pos);
    g.hud.toastWorld('📋 o chefe ADIANTOU a ronda (veja o quadro)');
    return true;
  }

  /** Linhas do quadro (e da ajuda): "10:30 ☕ café na copa". */
  lines() {
    const d = this.g.duration;
    return this.items.map(
      (x) =>
        `${clockOf(x.at, d)}  ${x.hidden ? '??? (rasurado)' : AGENDA.label[x.kind]}${AGENDA.long.includes(x.kind) ? ` (${Math.round(x.dur)} s)` : ''}${x.kind === 'supervisao' && !x.hidden && x.who ? ` — ${x.who}` : ''}`,
    );
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
      case 'supervisao':
        g.startSupervision(x);
        break;
      case 'telefone':
        // fica na sala: não sai enquanto fala (mas a porta continua de olho)
        g.holdBoss(x.dur);
        g.subtitle('[chefe ao telefone: "sim, sim, claro…"]', main.pos);
        break;
    }
  }
}
