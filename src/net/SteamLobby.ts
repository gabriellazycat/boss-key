import { GAME_KEY, MAX_PLAYERS, NET_VERSION } from './Lobby';
import type { JoinError, Lobby, LobbyProvider, Member, MemberMeta } from './Lobby';
import type { PeerId, Transport } from './Transport';
import type { SteamBridge } from './steam.d';

/**
 * Lobby + transporte em cima da ponte `window.steam` (Electron + steamworks.js).
 * O steamworks.js não expõe dados por membro, então cada jogador publica o próprio
 * MemberMeta por P2P (mensagens de controle começam com CTRL e nunca chegam ao jogo).
 */
const CTRL = '\u0001';
const META = `${CTRL}M`;
const HELLO = `${CTRL}H`;
const CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const newCode = () => {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * 36)];
  return s;
};
const isRawId = (s: string) => /^\d{10,}$/.test(s);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class SteamLobby implements Lobby, Transport {
  readonly transport: Transport = this;
  readonly self: PeerId;
  code: string;

  private owner = '';
  private ids: string[] = [];
  private metas = new Map<string, MemberMeta>();
  private msgCbs: ((from: PeerId, data: string) => void)[] = [];
  private leftCbs: ((peer: PeerId) => void)[] = [];
  private changedCbs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  /** Mensagens do jogo que chegam antes do Multi se inscrever (durante o waitHost). */
  private backlog: [string, string][] = [];

  constructor(
    private readonly s: SteamBridge,
    private readonly id: string,
    code: string,
    private meta: MemberMeta,
  ) {
    this.self = s.selfId;
    this.code = code;
    this.metas.set(this.self, meta);
    s.on('members', (lobbyId) => {
      if (lobbyId === this.id) this.refresh();
    });
    s.on('peer-fail', (peer) => {
      if (this.ids.includes(peer)) this.refresh();
    });
    this.refresh();
    this.timer = setInterval(() => this.tick(), 1500);
  }

  // ---- Lobby ----
  get isHost() {
    return this.owner === this.self;
  }

  members(): Member[] {
    const out: Member[] = [];
    for (const id of this.ids) {
      const m = this.metas.get(id);
      if (m) out.push({ ...m, id, host: id === this.owner });
    }
    return out;
  }

  setMeta(meta: Partial<MemberMeta>) {
    this.meta = { ...this.meta, ...meta };
    this.metas.set(this.self, this.meta);
    this.sendMeta(null);
    this.changedCbs.forEach((cb) => cb());
  }

  setJoinable(open: boolean) {
    this.s.setJoinable(this.id, open);
    this.s.setData(this.id, 'open', open ? '1' : '0');
  }

  onMembersChanged(cb: () => void) {
    this.changedCbs.push(cb);
  }

  leave() {
    this.close();
  }

  // ---- Transport ----
  send(to: PeerId, data: string, reliable: boolean) {
    if (!this.closed) this.s.send(to, data, reliable);
  }

  broadcast(data: string, reliable: boolean) {
    if (this.closed) return;
    for (const id of this.ids) if (id !== this.self) this.s.send(id, data, reliable);
  }

  onMessage(cb: (from: PeerId, data: string) => void) {
    this.msgCbs.push(cb);
  }

  onPeerLeft(cb: (peer: PeerId) => void) {
    this.leftCbs.push(cb);
  }

  poll() {
    if (this.closed) return;
    if (this.msgCbs.length && this.backlog.length)
      for (const [from, data] of this.backlog.splice(0)) this.msgCbs.forEach((cb) => cb(from, data));
    for (const [from, data] of this.s.poll()) {
      if (data.startsWith(CTRL)) this.control(from, data);
      else if (!this.ids.includes(from)) continue;
      else if (this.msgCbs.length) this.msgCbs.forEach((cb) => cb(from, data));
      else this.backlog.push([from, data]);
    }
  }

  /**
   * Convidado: só entra no jogo quando o anfitrião já respondeu por P2P. Na primeira conexão o
   * relay da Steam leva alguns segundos, e entrar antes deixava a sala sem anfitrião (e o jogador
   * tinha de tentar de novo).
   */
  async waitHost(ms: number): Promise<boolean> {
    const end = Date.now() + ms;
    let hello = 0;
    while (!this.closed && Date.now() < end) {
      this.poll();
      if (this.owner && this.metas.has(this.owner)) return true;
      if (!this.owner) this.refresh();
      else if (Date.now() > hello) {
        this.s.send(this.owner, HELLO, true);
        hello = Date.now() + 1000;
      }
      await sleep(100);
    }
    return false;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.s.leaveLobby(this.id);
  }

  // ---- internos ----
  private control(from: string, data: string) {
    if (data.startsWith(META)) {
      try {
        const m = JSON.parse(data.slice(META.length)) as MemberMeta;
        if (typeof m?.name !== 'string') return;
        this.metas.set(from, m);
        this.changedCbs.forEach((cb) => cb());
      } catch {
        /* pacote inválido */
      }
    } else if (data === HELLO) {
      this.sendMeta(from);
    }
  }

  private sendMeta(to: string | null) {
    const payload = META + JSON.stringify(this.meta);
    if (to) this.s.send(to, payload, true);
    else for (const id of this.ids) if (id !== this.self) this.s.send(id, payload, true);
  }

  private refresh() {
    if (this.closed) return;
    const info = this.s.members(this.id);
    if (!info) return;
    const before = this.ids;
    this.owner = info.owner;
    this.ids = info.members;
    const gone = before.filter((id) => !this.ids.includes(id));
    const added = this.ids.filter((id) => id !== this.self && !before.includes(id));
    for (const id of gone) {
      this.metas.delete(id);
      this.leftCbs.forEach((cb) => cb(id));
    }
    for (const id of added) {
      this.s.send(id, HELLO, true);
      this.s.send(id, META + JSON.stringify(this.meta), true);
    }
    if (gone.length || added.length) this.changedCbs.forEach((cb) => cb());
  }

  private tick() {
    this.refresh();
    for (const id of this.ids) if (id !== this.self && !this.metas.has(id)) this.s.send(id, HELLO, true);
  }
}

async function enter(s: SteamBridge, id: string, meta: MemberMeta, step: (text: string) => void): Promise<Lobby | JoinError> {
  step('entrando na sala…');
  const r = await s.joinLobby(id);
  if (!r.ok) return /full|limit|limite|cheio/i.test(r.error) ? 'full' : 'not-found';
  // os dados do lobby chegam logo depois da entrada — às vezes vários segundos depois
  let game: string | null = null;
  for (let i = 0; i < 40 && game === null; i++) {
    game = s.getData(r.id, 'game');
    if (game === null) await sleep(150);
  }
  const bail = (e: JoinError): JoinError => {
    s.leaveLobby(r.id);
    return e;
  };
  if (game !== GAME_KEY) return bail('not-found');
  if (s.getData(r.id, 'v') !== NET_VERSION) return bail('version');
  const info = s.members(r.id);
  if (info && info.members.length > MAX_PLAYERS) return bail('full');
  if (s.getData(r.id, 'open') === '0') return bail('in-day');
  const lobby = new SteamLobby(s, r.id, s.getData(r.id, 'code') ?? '', meta);
  step('conectando ao anfitrião…');
  if (await lobby.waitHost(20000)) return lobby;
  lobby.close();
  return 'no-host';
}

class SteamProvider implements LobbyProvider {
  readonly available = true;
  constructor(private readonly s: SteamBridge) {}

  selfName() {
    return this.s.name;
  }

  async create(meta: MemberMeta): Promise<Lobby> {
    const id = await this.s.createLobby(MAX_PLAYERS);
    const code = newCode();
    this.s.setData(id, 'game', GAME_KEY);
    this.s.setData(id, 'v', NET_VERSION);
    this.s.setData(id, 'code', code);
    this.s.setData(id, 'open', '1');
    return new SteamLobby(this.s, id, code, meta);
  }

  async joinByCode(code: string, meta: MemberMeta, step: (text: string) => void = () => {}): Promise<Lobby | JoinError> {
    const c = code.trim();
    if (!c) return 'not-found';
    if (!isRawId(c)) step('procurando a sala…');
    const id = isRawId(c) ? c : await this.s.findLobby(GAME_KEY, c);
    if (!id) return 'not-found';
    return enter(this.s, id, meta, step);
  }

  onInvite(cb: (code: string) => void) {
    this.s.on('invite', cb);
  }
}

export function steamProvider(): LobbyProvider | null {
  const s = typeof window !== 'undefined' ? window.steam : undefined;
  return s && s.available ? new SteamProvider(s) : null;
}
