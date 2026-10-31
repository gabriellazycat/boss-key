
/** Posições quantizadas em centímetros e ângulos em milirradianos: JSON curto sem perder suavidade. */
export const q = (v: number) => Math.round(v * 100);
export const dq = (v: number) => v / 100;
export const qa = (a: number) => Math.round(a * 1000);
export const dqa = (a: number) => a / 1000;

export const INPUT_HZ = 20;
export const SNAPSHOT_HZ = 15;
/** Atraso da interpolação dos remotos (ms): ~1,5 snapshot, absorve jitter sem parecer lento. */
export const INTERP_MS = 100;

export type Carry = 'coffee' | 'report' | 'doc' | 'galao' | null;

/**
 * Estado de um jogador como os outros o veem (e como o host o julga):
 * [x, z, yaw, hover, seated, lying, act, physical, hidden, forbidden, fun, sus, carry, eye, ghost, work, cota]
 * x/z/hover em cm, yaw em mrad; booleanos como 0/1; `work` = planilha no ritmo (baixa Suspeita).
 */
export type PlayerState = [number, number, number, number, 0 | 1, 0 | 1, string | null, 0 | 1, 0 | 1, 0 | 1, number, number, Carry, string, 0 | 1, 0 | 1, 0 | 1];

/** Estado de uma chefia: [kind, visible, x, z, yaw, eye, flashlight, state] (`state` decide faixa, batimento e vinheta no cliente). */
export type BossState = [string, 0 | 1, number, number, number, string, 0 | 1, string];

/**
 * Eventos do dia espelhados no cliente: [luz %, fatias de pizza/bolo (-1 = nada na cozinha), impressora travada, blecaute,
 * porta do chefe %, elevador %, internet caiu, reunião surpresa (s para chegar; 0 = nenhuma), clima (índice em WEATHERS),
 * s que a cafeteira ainda esquenta].
 */
export type EventState = [number, number, 0 | 1, 0 | 1, number, number, 0 | 1, number, number, number];

/** Cliente do chefe (só o host simula): [x, z, yaw (q/qa), visual (índice), visível]. */
export type ClientState = [number, number, number, number, 0 | 1];

export type PopKind ='clutch' | 'caught' | 'fired' | 'info' | 'good' | 'warn';

export type ClientMsg =
  /** `d` = dia do estado: o host ignora quadros atrasados de outro dia. */
  | { t: 'in'; s: PlayerState; d: number }
  /** Pedido de arremesso; o host repassa para todos (efeitos só contam no host). */
  | { t: 'throw'; p: [number, number, number]; v: [number, number, number] }
  /** Campeonato de Ball Ops: posição na arena (x, y, mira, vivo) e `s` = 1 quando é um tiro. */
  | { t: 'arena'; x: number; y: number; a: number; al: 0 | 1; s: 0 | 1 }
  /** Ação num objeto compartilhado do escritório (destravar impressora, religar disjuntor, comer pizza). */
  | { t: 'act'; a: ActKind }
  /** Item de missão: pegar, largar, passar, guardar/pegar do armário `i`. */
  | { t: 'item'; a: 'pick' | 'drop' | 'throw' | 'stash' | 'take'; id: string; i: number; p?: [number, number, number]; v?: [number, number, number] }
  /** Cofre do time: Vale ganho por um cliente e pedido de compra nas vendinhas (o host decide). */
  | { t: 'vale'; v: number }
  | { t: 'buy'; id: string }
  /** Fui demitido: estas tarefas do chefe ficaram pendentes (o host reparte entre quem sobrou). */
  | { t: 'handoff'; kinds: string[] }
  /** Fantasma avisando onde o chefe está (x/z em cm). */
  | { t: 'ping'; x: number; z: number };

export interface ScoreLine {
  id: string;
  name: string;
  /** FUN do dia e o total da run (o placar). */
  fun: number;
  total: number;
  fired: boolean;
  /** Vidas que restam na run (o host conta). */
  lives: number;
}

export type HostMsg =
  /** Snapshot: relógio do dia, todos os jogadores (inclusive o host), chefias e eventos. */
  /** `d` = dia do snapshot: o cliente ignora os atrasados de outro dia (ex.: "demitido" de ontem chegando depois da virada). */
  | { t: 'snap'; clock: number; d: number; p: Record<string, PlayerState>; b: BossState[]; ev: EventState; c?: ClientState[]; ds?: number[]; it?: ItemState[]; m?: number[]; sv?: number[] }
  /** Sala: dia atual, eventos sorteados para ele e a mesa (slot) de cada um; enviado sempre que alguém entra/sai. */
  | { t: 'room'; day: number; evs: string[]; wx: string; slots: Record<string, number>; playing: boolean }
  /** Trovão: o host sorteia quando; `d` = ms de atraso do som depois do clarão. */
  | { t: 'thunder'; d: number }
  /** Eventos que só anunciam (boas-vindas, auditoria + a ordem sorteada dos nomes). */
  | { t: 'announce'; id: string; order: string[] }
  | { t: 'count'; s: number }
  /** Suspeita causada pelo chefe a um jogador remoto (o cliente soma na dele). */
  | { t: 'sus'; v: number; r?: string }
  | { t: 'pop'; k: PopKind; a: string; s: string }
  /** O chefe conferiu sua mesa e você estava limpo (o cliente decide se foi clutch). */
  | { t: 'ident'; b: string }
  | { t: 'fired'; id: string; b: string; why: string }
  | { t: 'throw'; by: string; p: [number, number, number]; v: [number, number, number] }
  | { t: 'arena'; by: string; x: number; y: number; a: number; al: 0 | 1; s: 0 | 1 }
  | { t: 'end'; allFired: boolean; ranking: ScoreLine[] }
  /** Tarefa herdada de um colega demitido. */
  | { t: 'extra'; kind: string; from: string }
  | { t: 'ping'; by: string; x: number; z: number }
  /** Cofre do time (Vale e itens) e a semente das ofertas da noite. */
  | { t: 'shop'; w: number; o: Record<string, number>; seed: number; plan?: DayPlanNet }
  /** Resposta a um pedido de compra. */
  | { t: 'bought'; id: string; ok: boolean; why: string }
  | { t: 'bye' };

export type NetMsg = ClientMsg | HostMsg;

export const encode = (m: NetMsg) => JSON.stringify(m);
export function decode(s: string): NetMsg | null {
  try {
    const m = JSON.parse(s);
    return m && typeof m.t === 'string' ? (m as NetMsg) : null;
  } catch {
    return null;
  }
}

/**
 * Plano do dia decidido pelo host (vai junto do cofre no começo do dia): a agenda do chefe e o sorteio das missões
 * (onde está a chave, qual armário, quais pequenas de cada um).
 */
export interface DayPlanNet {
  day: number;
  ag: [string, number, number, 0 | 1][];
  ms?: unknown;
  sv?: unknown;
}

/** Pedidos de ação do convidado ao host (`d:` = distração do mapa). */
export type ActKind = 'unjam' | 'breaker' | 'pizza' | 'coffee' | 'ramal' | 'visita' | 'd:impressora' | 'd:radio' | 'd:ramal' | 'd:alarme' | `m:${string}` | `p:${string}`;

/** Item de missão (só o host decide): [id, quem segura ('' = ninguém), x, y, z (q), estado]. */
export type ItemState = [string, string, number, number, number, number];
