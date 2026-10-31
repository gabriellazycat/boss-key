import * as THREE from 'three';
import { B, RUN, type ActivityId, type EventId, type TaskKind, type ShopItemId, type DistractId } from '../balance';
import type { EyeState } from '../entities/Ball';
import type { Lobby, Member } from '../net/Lobby';
import { decode, dq, dqa, encode, INPUT_HZ, INTERP_MS, q, qa, SNAPSHOT_HZ, type ActKind, type BossState, type ClientMsg, type DayPlanNet, type EventState, type HostMsg, type NetMsg, type PlayerState, type PopKind, type ScoreLine } from '../net/Protocol';
import type { PeerId } from '../net/Transport';
import type { Boss } from './Boss';
import type { MissionNet } from './Missions';
import type { SurvNet } from './Surveillance';
import { lerpAngle } from './Boss';
import type { Game } from './Game';
import type { Worker } from './Worker';
import { WEATHERS, type Weather } from '../world/Daylight';

/** Cor do crachá por mesa: diferencia dois jogadores com a mesma Telinha. */
const BADGE = ['#ffd23f', '#4da3ff', '#3ddc97', '#ff6b6b', '#b79cff', '#ff8a3d'];

/** Placa com o nome acima da cabeça (canvas desenhado uma vez, sprite sempre de frente). */
function nameTag(name: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.font = '600 30px Fredoka, sans-serif';
  const w = Math.min(240, x.measureText(name).width + 40);
  x.fillStyle = 'rgba(16,20,34,.78)';
  x.beginPath();
  x.roundRect((256 - w) / 2, 8, w, 48, 24);
  x.fill();
  x.fillStyle = color;
  x.beginPath();
  x.arc((256 - w) / 2 + 22, 32, 8, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(name, 128 + 10, 33, w - 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.2, 0.3, 1);
  sp.position.y = 2.05;
  sp.renderOrder = 5;
  sp.name = 'nametag';
  return sp;
}

/** Contagem do elevador depois que todos marcam pronto. */
export const READY_COUNT = 5;

interface Sample<S> {
  at: number;
  s: S;
}

/** Guarda os últimos estados recebidos e devolve o par em volta de `now - INTERP_MS`. */
class Buffer<S> {
  list: Sample<S>[] = [];
  push(s: S) {
    this.list.push({ at: performance.now(), s });
    if (this.list.length > 8) this.list.shift();
  }
  pair(): [S, S, number] | null {
    const L = this.list;
    if (!L.length) return null;
    const t = performance.now() - INTERP_MS;
    for (let i = L.length - 1; i > 0; i--)
      if (L[i - 1].at <= t) {
        const a = L[i - 1];
        const b = L[i];
        return [a.s, b.s, THREE.MathUtils.clamp((t - a.at) / Math.max(1, b.at - a.at), 0, 1)];
      }
    return [L[0].s, L[0].s, 0];
  }
  get last() {
    return this.list.length ? this.list[this.list.length - 1].s : null;
  }
}

/**
 * Multiplayer do lado do jogo: liga a sala (Lobby/Transport) aos funcionários do escritório.
 * Jogadores remotos viram `Worker`s comuns — o chefe já sabe vigiá-los; o host decide tudo que envolve chefia.
 */
export class Multi {
  readonly isHost: boolean;
  readonly self: PeerId;
  /** Mesa (slot) de cada jogador; o host é sempre o 0. */
  slots: Record<PeerId, number> = {};
  /** Dia que o host está jogando e os eventos sorteados para ele (o cliente segue). */
  hostDay = 0;
  hostEvents: EventId[] = [];
  /** Plano do dia (agenda, missões) que o host mandou por último. */
  hostPlan: DayPlanNet | null = null;
  /** Clima sorteado pelo host para o dia (índice em WEATHERS); o cliente nunca sorteia o seu. */
  hostWeather = 0;
  playing = false;
  countdown = -1;
  onHostLeft: (() => void) | null = null;
  onRoom: (() => void) | null = null;
  readonly remotes = new Map<PeerId, { w: Worker; buf: Buffer<PlayerState> }>();
  /** Host: FUN somado na run por jogador (o placar da sala). */
  private totals = new Map<PeerId, number>();
  /** Host: vidas perdidas por jogador na run (demissão ou meta do time não batida). */
  private lost = new Map<PeerId, number>();
  private bossBuf = new Map<string, Buffer<BossState>>();
  private ev: EventState | null = null;
  private sendT = 0;
  private bytes = 0;
  private bytesT = 0;
  /** Bytes/s enviados (média do último segundo) — conferir a meta de < 6 KB/s por jogador. */
  rate = 0;

  constructor(
    private g: Game,
    readonly lobby: Lobby,
  ) {
    this.isHost = lobby.isHost;
    this.self = lobby.transport.self;
    const t = lobby.transport;
    t.onMessage((from, data) => {
      const m = decode(data);
      if (m) this.onMsg(from, m);
    });
    t.onPeerLeft((p) => this.onLeft(p));
    lobby.onMembersChanged(() => this.onMembers());
    if (this.isHost) this.slots[this.self] = 0;
    this.onMembers();
  }

  get members(): Member[] {
    return this.lobby.members();
  }

  /** Nome de um par (Steam persona). */
  nameOf(id: PeerId) {
    return this.members.find((m) => m.id === id)?.name ?? '???';
  }

  private send(to: PeerId, m: NetMsg, reliable = true) {
    const s = encode(m);
    this.bytes += s.length;
    this.lobby.transport.send(to, s, reliable);
  }
  private broadcast(m: HostMsg, reliable = true) {
    const s = encode(m);
    this.bytes += s.length * Math.max(1, this.members.length - 1);
    this.lobby.transport.broadcast(s, reliable);
  }
  private toHost(m: ClientMsg, reliable = true) {
    const host = this.members.find((x) => x.host);
    if (host) this.send(host.id, m, reliable);
  }

  // ------------------------------------------------------------------ sala
  private onMembers() {
    const ms = this.members;
    if (!this.isHost) {
      if (!ms.some((m) => m.host)) this.onHostLeft?.();
      this.onRoom?.();
      return;
    }
    // mesas: quem já tem fica; quem chega pega a primeira livre
    for (const id of Object.keys(this.slots)) if (!ms.some((m) => m.id === id)) delete this.slots[id];
    const used = new Set(Object.values(this.slots));
    for (const m of ms)
      if (this.slots[m.id] === undefined) {
        let s = 0;
        while (used.has(s)) s++;
        this.slots[m.id] = s;
        used.add(s);
      }
    this.broadcastRoom();
    this.g.applyRoster();
    this.checkReady();
    this.onRoom?.();
  }

  broadcastRoom() {
    if (!this.isHost) return;
    this.broadcast({ t: 'room', day: this.g.dayIndex, evs: this.g.dayEvents, wx: this.g.weather, slots: this.slots, playing: this.playing });
    // o plano do dia (agenda, missão) vai junto do cofre: quem entrou depois do sorteio também recebe
    this.syncShop();
  }

  private onLeft(p: PeerId) {
    const r = this.remotes.get(p);
    if (r) {
      r.w.ball.root.visible = false;
      const i = this.g.workers.indexOf(r.w);
      if (i >= 0) this.g.workers.splice(i, 1);
      if (this.g.running) this.g.subtitle(`[${r.w.name} saiu da sala]`);
    }
    this.remotes.delete(p);
    if (!this.isHost && this.members.find((m) => m.host)?.id === p) this.onHostLeft?.();
    if (!this.isHost && !this.members.some((m) => m.host)) this.onHostLeft?.();
  }

  /** Liga um par a um funcionário do escritório (feito pelo Game ao distribuir as mesas). */
  bind(id: PeerId, w: Worker) {
    this.remotes.set(id, { w, buf: new Buffer() });
    this.tag(w, this.nameOf(id), BADGE[(this.slots[id] ?? 0) % BADGE.length]);
  }

  /** Troca (ou tira, com name vazio) a placa de nome de um funcionário. */
  tag(w: Worker, name: string, color = '#fff') {
    const old = w.ball.root.getObjectByName('nametag') as THREE.Sprite | undefined;
    if (old) {
      old.material.map?.dispose();
      old.material.dispose();
      old.removeFromParent();
    }
    if (name) w.ball.root.add(nameTag(name, color));
  }

  setReady(v: boolean) {
    this.lobby.setMeta({ ready: v });
  }
  get ready() {
    return !!this.members.find((m) => m.id === this.self)?.ready;
  }

  /** Host: todos prontos → contagem; alguém desmarcou → cancela. */
  private checkReady() {
    if (!this.isHost || this.playing || this.g.phase !== 'elevator' || !this.g.running) return;
    const all = this.members.every((m) => m.ready);
    if (all && this.countdown < 0) {
      this.countdown = READY_COUNT;
      this.lobby.setJoinable(false);
      this.broadcast({ t: 'count', s: READY_COUNT });
      this.g.onCountdown(READY_COUNT);
    } else if (!all && this.countdown >= 0) {
      this.countdown = -1;
      this.lobby.setJoinable(true);
      this.broadcast({ t: 'count', s: -1 });
      this.g.onCountdown(-1);
    }
  }

  /** Novo dia (elevador): ninguém pronto, sala aberta para quem quiser entrar. */
  resetForDay() {
    this.countdown = -1;
    this.playing = false;
    this.setReady(false);
    // quadros de ontem não valem hoje (um "demitido" atrasado deixava o colega fantasma o dia todo)
    for (const r of this.remotes.values()) r.buf.list.length = 0;
    if (this.isHost) {
      this.lobby.setJoinable(true);
      this.broadcastRoom();
    }
  }

  /** Portas abriram: dia valendo, sala fechada. */
  startPlaying() {
    this.playing = true;
    this.countdown = -1;
    if (this.isHost) this.broadcastRoom();
  }

  // ------------------------------------------------------------------ mensagens
  private onMsg(from: PeerId, m: NetMsg) {
    const g = this.g;
    switch (m.t) {
      // ---- cliente → host
      case 'in': {
        const r = this.remotes.get(from);
        if (!r || m.d !== g.dayIndex) return;
        r.buf.push(m.s);
        // o host julga com os números do cliente (FUN e Suspeita são dele; o chefe soma por cima via 'sus')
        const w = r.w;
        if (!w.fired) {
          w.fun = m.s[10];
          w.sus = m.s[11];
          w.cotaDone = !!m.s[16];
          w.peakSus = Math.max(w.peakSus, w.sus);
        }
        return;
      }
      case 'act': {
        if (!this.isHost) return;
        if (m.a === 'unjam' && g.printerJam > 0) g.endJam(true);
        if (m.a === 'breaker' && g.blackout) g.endBlackout(true);
        if (m.a === 'coffee') g.coffeeMachineCd = Math.max(g.coffeeMachineCd, B.CAFE_MACHINE_CD);
        if (m.a === 'ramal') g.applyRamal();
        if (m.a.startsWith('p:')) {
          // papo: "p:<chefia>:<segundos>"
          const r = this.remotes.get(from);
          const [, kind, secs] = m.a.split(':');
          if (r) g.netTalk(r.w, kind, Number(secs) || 0);
        }
        if (m.a.startsWith('m:') || m.a.startsWith('sv:')) {
          const r = this.remotes.get(from);
          if (r) (m.a.startsWith('sv:') ? g.surv : g.missions).hostAct(r.w, m.a);
        }
        if (m.a.startsWith('d:')) {
          const r = this.remotes.get(from);
          if (r) g.distract.apply(m.a.slice(2) as DistractId, r.w);
        }
        if (m.a === 'visita') {
          const r = this.remotes.get(from);
          if (r) g.visitTalk(r.w);
        }
        if (m.a === 'pizza' && g.pizzaLeft > 0) {
          const r = this.remotes.get(from);
          if (r) g.eatPizza(r.w);
        }
        return;
      }
      case 'handoff':
        if (this.isHost) this.assign(m.kinds as TaskKind[], from);
        return;
      case 'item': {
        if (!this.isHost) return;
        const r = this.remotes.get(from);
        const v3 = (a?: [number, number, number]) => (a ? new THREE.Vector3(dq(a[0]), dq(a[1]), dq(a[2])) : undefined);
        if (r) g.items.apply(r.w, m.a, m.id, m.i, v3(m.p), v3(m.v));
        return;
      }
      case 'vale':
        if (!this.isHost) return;
        g.shop.wallet += m.v;
        this.syncShop();
        return;
      case 'buy': {
        if (!this.isHost) return;
        const r = g.shop.buy(m.id as ShopItemId);
        if (r === true) {
          // atestado: +1 vida para quem comprou
          if (m.id === 'atestado') this.lost.set(from, Math.max(0, (this.lost.get(from) ?? 0) - 1));
          this.syncShop();
          g.drawSlots();
        }
        this.send(from, { t: 'bought', id: m.id, ok: r === true, why: r === true ? '' : r });
        return;
      }
      case 'shop':
        if (this.isHost) return;
        g.shop.apply({ w: m.w, o: m.o });
        g.shop.seed = m.seed;
        g.drawSlots();
        if (m.plan) {
          this.hostPlan = m.plan;
          if (m.plan.day === g.dayIndex) g.applyPlan(m.plan);
        }
        return;
      case 'bought':
        if (this.isHost) return;
        if (!m.ok) {
          g.hud.toastWorld(`💰 ${m.why}`);
          g.audio.play('miss', 0.6);
          return;
        }
        if (m.id === 'atestado') g.strikes = Math.max(0, g.strikes - 1);
        g.onBought(m.id, true);
        return;
      case 'ping': {
        const by = this.isHost ? from : (m as Extract<HostMsg, { t: 'ping' }>).by;
        if (by === this.self) return;
        if (this.isHost) this.broadcast({ t: 'ping', by: from, x: m.x, z: m.z });
        g.onPing(dq(m.x), dq(m.z), this.nameOf(by));
        return;
      }
      case 'arena': {
        const by = this.isHost ? from : (m as Extract<HostMsg, { t: 'arena' }>).by;
        if (by === this.self) return;
        if (this.isHost) this.broadcast({ t: 'arena', by: from, x: m.x, y: m.y, a: m.a, al: m.al, s: m.s }, m.s === 1);
        g.arenaIn(by, this.nameOf(by), m.x, m.y, m.a, !!m.al, !!m.s);
        return;
      }
      case 'throw': {
        const by = this.isHost ? from : (m as Extract<HostMsg, { t: 'throw' }>).by;
        if (by === this.self) return;
        if (this.isHost) this.broadcast({ t: 'throw', by: from, p: m.p, v: m.v }, true);
        const r = this.remotes.get(by);
        if (r) g.pc.throwPaper(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), r.w);
        return;
      }
      // ---- host → cliente
      case 'room': {
        this.slots = m.slots;
        this.hostDay = m.day;
        this.hostEvents = m.evs as EventId[];
        this.hostWeather = Math.max(0, WEATHERS.indexOf(m.wx as Weather));
        g.applyRoster();
        if (!m.playing && g.phase === 'elevator') {
          if (g.dayIndex !== m.day) g.followHostDay(m.day, this.hostEvents);
          else g.setDayEvents(this.hostEvents);
          g.setWeather(WEATHERS[this.hostWeather]);
        }
        this.onRoom?.();
        return;
      }
      case 'count':
        this.countdown = m.s;
        g.onCountdown(m.s);
        return;
      case 'snap':
        this.onSnap(m);
        return;
      case 'sus':
        g.addSus(g.player, m.v, 'chefe', m.r ?? 'o chefe viu');
        return;
      case 'pop':
        g.hud.popup(m.k, m.a, m.s);
        if (m.k === 'warn' || m.k === 'caught') g.audio.play('warn', 1);
        return;
      case 'ident':
        g.onRemoteIdentify(this.boss(m.b));
        return;
      case 'fired':
        if (m.id === this.self) g.fire(g.player, this.boss(m.b), m.why);
        return;
      case 'end':
        g.endDay(m.allFired, m.ranking);
        return;
      case 'extra':
        g.tasks.addExtra(m.kind as TaskKind);
        g.hud.popup('warn', 'TAREFA EXTRA', `${m.from} foi demitido(a): o telefone vai tocar com o que era dele(a)`);
        return;
      case 'thunder':
        g.thunder(m.d);
        return;
      case 'announce':
        g.onAnnounce(m.id, m.order);
        return;
      case 'bye':
        this.onHostLeft?.();
        return;
    }
  }

  private boss(kind: string): Boss {
    const g = this.g;
    return kind === 'x9' ? g.x9 : kind === 'dono' ? g.dono : g.chefe;
  }

  private onSnap(m: Extract<HostMsg, { t: 'snap' }>) {
    const g = this.g;
    if (m.d !== g.dayIndex) return;
    if (g.phase === 'play') g.time = m.clock;
    for (const [id, s] of Object.entries(m.p)) {
      if (id === this.self) continue;
      this.remotes.get(id)?.buf.push(s);
    }
    for (const b of m.b) {
      let buf = this.bossBuf.get(b[0]);
      if (!buf) this.bossBuf.set(b[0], (buf = new Buffer()));
      buf.push(b);
    }
    this.ev = m.ev;
    if (m.c) g.clients.applyNet(m.c);
    if (m.ds) g.distract.applyNet(m.ds);
    if (m.it) g.items.applyNet(m.it);
    if (m.m) g.missions.applyNet(m.m as MissionNet);
    if (m.sv) g.surv.applyNet(m.sv as SurvNet);
  }

  // ------------------------------------------------------------------ host → um jogador
  /** Suspeita que o chefe deu a um remoto (o cliente soma na barra dele). */
  sus(w: Worker, v: number, r = '') {
    if (this.isHost && w.remote) this.send(w.remote, { t: 'sus', v, ...(r ? { r } : {}) });
  }
  pop(w: Worker, k: PopKind, a: string, s = '') {
    if (this.isHost && w.remote) this.send(w.remote, { t: 'pop', k, a, s });
  }
  ident(w: Worker, b: Boss) {
    if (this.isHost && w.remote) this.send(w.remote, { t: 'ident', b: b.kind });
  }
  fired(w: Worker, b: Boss, why: string) {
    if (this.isHost && w.remote) this.broadcast({ t: 'fired', id: w.remote, b: b.kind, why });
  }
  end(allFired: boolean, ranking: ScoreLine[]) {
    if (this.isHost) this.broadcast({ t: 'end', allFired, ranking });
  }
  thunder(d: number) {
    if (this.isHost) this.broadcast({ t: 'thunder', d });
  }
  announce(id: string, order: string[] = []) {
    if (this.isHost) this.broadcast({ t: 'announce', id, order });
  }
  /** Campeonato: meu estado na arena (ou um tiro), para os colegas. */
  arena(x: number, y: number, a: number, al: boolean, shot: boolean) {
    const msg = { t: 'arena' as const, x: Math.round(x), y: Math.round(y), a: Math.round(a * 100) / 100, al: (al ? 1 : 0) as 0 | 1, s: (shot ? 1 : 0) as 0 | 1 };
    if (this.isHost) this.broadcast({ ...msg, by: this.self }, !shot ? false : true);
    else this.toHost(msg);
  }

  throwPaper(p: THREE.Vector3, v: THREE.Vector3) {
    const msg = { t: 'throw' as const, p: [p.x, p.y, p.z] as [number, number, number], v: [v.x, v.y, v.z] as [number, number, number] };
    if (this.isHost) this.broadcast({ ...msg, by: this.self });
    else this.toHost(msg);
  }
  /** Pedido de item de missão ao host. */
  item(a: 'pick' | 'drop' | 'throw' | 'stash' | 'take', id: string, i: number, p?: [number, number, number], v?: [number, number, number]) {
    if (!this.isHost) this.toHost({ t: 'item', a, id, i, ...(p ? { p } : {}), ...(v ? { v } : {}) });
  }

  /** Id de rede de um trabalhador ('' = bot). */
  peerOf(w: Worker): string {
    return w.isPlayer ? this.self : (w.remote ?? '');
  }

  workerOf(p: string): Worker | null {
    return p === this.self ? this.g.player : (this.remotes.get(p)?.w ?? null);
  }

  act(a: ActKind) {
    if (!this.isHost) this.toHost({ t: 'act', a });
  }

  // ------------------------------------------------------------------ cofre do time
  /** Cliente ganhou Vale: o host soma no cofre. */
  vale(v: number) {
    if (!this.isHost) this.toHost({ t: 'vale', v });
  }
  /** Cliente quer comprar: o host confere o cofre. */
  buy(id: string) {
    if (!this.isHost) this.toHost({ t: 'buy', id });
  }
  /** Host: manda o cofre (e a semente das ofertas) para todo mundo. */
  syncShop() {
    if (this.isHost) this.broadcast({ t: 'shop', ...this.g.shop.state(), seed: this.g.shop.seed, plan: this.g.dayPlan() });
  }

  /** Fui demitido: o host reparte as tarefas pendentes entre quem sobrou. */
  handoff(kinds: TaskKind[]) {
    if (!kinds.length) return;
    if (this.isHost) this.assign(kinds, this.self);
    else this.toHost({ t: 'handoff', kinds });
  }

  /** Host: uma tarefa para cada colega vivo, em rodízio. */
  private assign(kinds: TaskKind[], from: PeerId) {
    const g = this.g;
    const alive: PeerId[] = [];
    if (from !== this.self && !g.player.fired) alive.push(this.self);
    for (const [id, r] of this.remotes) if (id !== from && !r.w.fired) alive.push(id);
    if (!alive.length) return;
    const name = this.nameOf(from);
    kinds.forEach((kind, i) => {
      const to = alive[i % alive.length];
      if (to !== this.self) return this.send(to, { t: 'extra', kind, from: name });
      g.tasks.addExtra(kind);
      g.hud.popup('warn', 'TAREFA EXTRA', `${name} foi demitido(a): o telefone vai tocar com o que era dele(a)`);
    });
  }

  /** Fantasma: avisa a sala onde o chefe está. */
  ping(x: number, z: number) {
    if (this.isHost) this.broadcast({ t: 'ping', by: this.self, x: q(x), z: q(z) });
    else this.toHost({ t: 'ping', x: q(x), z: q(z) });
  }

  /**
   * Host, no fim do dia: soma o FUN de hoje no placar de cada um (demitido soma só metade) e tira as vidas:
   * quem foi demitido perde uma; se o time não bateu a meta, quem não foi demitido perde uma (o 1º dia não conta).
   */
  tally() {
    const g = this.g;
    const all: [PeerId, Worker][] = [[this.self, g.player], ...[...this.remotes].map(([id, r]): [PeerId, Worker] => [id, r.w])];
    const met = g.goalFun >= g.goal;
    for (const [id, w] of all) {
      this.totals.set(id, (this.totals.get(id) ?? 0) + w.fun * (w.fired ? RUN.firedKeepFun : 1));
      const lost = this.lost.get(id) ?? 0;
      // já sem vidas (espectador) não perde mais
      if (g.dayIndex === 0 || lost >= RUN.lives) continue;
      // v0.10: a cota de trabalho é de cada um e também custa vida
      const cota = w === g.player ? g.tasks.cotaDone : w.cotaDone;
      if (w.fired || !met || !cota) this.lost.set(id, lost + 1);
    }
  }

  /** Ranking: todos os jogadores da sala, pelo placar da run. */
  ranking(): ScoreLine[] {
    const g = this.g;
    // o nome da sala (persona da Steam), não o salvo nas opções: é o que os outros veem na placa
    const line = (id: PeerId, name: string, w: Worker): ScoreLine => ({ id, name, fun: w.fun, total: this.totals.get(id) ?? 0, fired: w.fired, lives: RUN.lives - (this.lost.get(id) ?? 0) });
    const list: ScoreLine[] = [line(this.self, this.nameOf(this.self), g.player)];
    for (const [id, r] of this.remotes) list.push(line(id, r.w.name, r.w));
    return list.sort((a, b) => b.total - a.total);
  }

  // ------------------------------------------------------------------ quadro
  private playerState(): PlayerState {
    const g = this.g;
    const w = g.player;
    const b = w.ball;
    return [
      q(b.pos.x), q(b.pos.z), qa(b.yaw), q(b.hoverHeight), w.seated ? 1 : 0, b.lying > 0.5 ? 1 : 0,
      w.act, w.physical ? 1 : 0, w.hidden ? 1 : 0, g.isForbidden(w) ? 1 : 0, Math.round(w.fun * 10) / 10, Math.round(w.sus * 10) / 10,
      g.pc.carrying, b.eye, w.fired ? 1 : 0, g.workingNow() ? 1 : 0, g.tasks.cotaDone ? 1 : 0,
    ];
  }

  private remoteState(w: Worker): PlayerState {
    const r = [...this.remotes.values()].find((x) => x.w === w)!;
    const last = r.buf.last;
    const s = last ? ([...last] as PlayerState) : this.playerState();
    s[11] = Math.round(w.sus * 10) / 10;
    s[14] = w.fired ? 1 : 0;
    return s;
  }

  private bossStates(): BossState[] {
    const g = this.g;
    return [g.chefe, g.x9, g.dono].map((b) => [b.kind, b.ball.root.visible ? 1 : 0, q(b.ball.pos.x), q(b.ball.pos.z), qa(b.ball.yaw), b.ball.eye, b.flashlightOn ? 1 : 0, b.state]);
  }

  private eventState(): EventState {
    const g = this.g;
    const o = g.office;
    const meet = g.meetingCall?.phase === 'gather' ? Math.max(0.1, Math.round(g.meetingCall.t * 10) / 10) : 0;
    return [Math.round(g.lightLevel * 100), o.pizzaGroup.visible ? g.pizzaLeft : -1, g.printerJam > 0 ? 1 : 0, g.blackout ? 1 : 0, Math.round(o.doorOpen * 100), Math.round(o.elevatorOpen * 100), g.internetT > 0 ? 1 : 0, meet, Math.max(0, WEATHERS.indexOf(g.weather)), Math.round(g.coffeeMachineCd * 10) / 10];
  }

  /** Uma vez por quadro, antes da simulação: rede, entradas e snapshots. */
  update(realDt: number) {
    const g = this.g;
    this.lobby.transport.poll();
    this.bytesT += realDt;
    if (this.bytesT >= 1) {
      this.rate = this.bytes / this.bytesT;
      this.bytes = 0;
      this.bytesT = 0;
    }
    if (this.isHost && this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - realDt);
    }
    if (!g.running) return;
    this.sendT -= realDt;
    if (this.sendT <= 0) {
      if (this.isHost) {
        this.sendT = 1 / SNAPSHOT_HZ;
        const p: Record<string, PlayerState> = { [this.self]: this.playerState() };
        for (const [id, r] of this.remotes) p[id] = this.remoteState(r.w);
        const c = g.clients.netStates();
        this.broadcast({ t: 'snap', clock: Math.round(g.time * 100) / 100, d: g.dayIndex, p, b: this.bossStates(), ev: this.eventState(), ds: g.distract.netState(), it: g.items.netStates(), m: g.missions.net(), sv: g.surv.netState(), ...(c.length ? { c } : {}) }, false);
      } else {
        this.sendT = 1 / INPUT_HZ;
        this.toHost({ t: 'in', s: this.playerState(), d: g.dayIndex }, false);
      }
    }
  }

  /** Depois da simulação: coloca remotos (e, no cliente, as chefias) na posição interpolada. */
  apply(dt: number) {
    const g = this.g;
    for (const r of this.remotes.values()) {
      const pr = r.buf.pair();
      if (!pr) continue;
      const [a, b, k] = pr;
      const w = r.w;
      const ball = w.ball;
      const seated = b[4] === 1;
      if (seated !== w.seated) {
        w.seated = seated;
        if (seated) g.seatBall(w);
        else w.desk.chairYaw = w.desk.seatYaw + Math.PI;
      }
      ball.setPos(THREE.MathUtils.lerp(dq(a[0]), dq(b[0]), k), THREE.MathUtils.lerp(dq(a[1]), dq(b[1]), k));
      ball.yaw = lerpAngle(dqa(a[2]), dqa(b[2]), k);
      ball.hoverHeight = dq(b[3]);
      ball.lying = b[5];
      ball.setSleeping(b[5] === 1);
      if (!w.fired) {
        w.act = b[6] as ActivityId | null;
        w.physical = b[7] === 1;
        w.hidden = b[8] === 1;
        w.netForbidden = b[9] === 1;
        w.netWorking = b[15] === 1;
        if (ball.eye !== b[13]) ball.setEye(b[13] as EyeState);
      }
      if (!this.isHost) {
        w.fun = b[10];
        w.sus = b[11];
        if (b[14] === 1 && !w.fired) g.markRemoteFired(w);
      }
      ball.root.visible = !w.hidden || w.fired;
      ball.update(dt);
    }
    if (this.isHost) return;
    for (const boss of [g.chefe, g.x9, g.dono]) {
      const pr = this.bossBuf.get(boss.kind)?.pair();
      if (!pr) continue;
      const [a, b, k] = pr;
      const ball = boss.ball;
      ball.root.visible = b[1] === 1;
      ball.setPos(THREE.MathUtils.lerp(dq(a[2]), dq(b[2]), k), THREE.MathUtils.lerp(dq(a[3]), dq(b[3]), k));
      ball.yaw = lerpAngle(dqa(a[4]), dqa(b[4]), k);
      if (ball.eye !== b[5]) ball.setEye(b[5] as EyeState);
      if (boss.flashlightOn !== (b[6] === 1)) boss.setFlashlight(b[6] === 1);
      if (b[7]) boss.state = b[7] as typeof boss.state;
      ball.update(dt);
    }
    if (this.ev) g.applyEvents(this.ev, dt);
  }

  leave() {
    if (this.isHost) this.broadcast({ t: 'bye' });
    this.lobby.leave();
  }
}
