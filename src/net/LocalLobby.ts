import { GAME_KEY, MAX_PLAYERS, NET_VERSION, type JoinError, type Lobby, type LobbyProvider, type Member, type MemberMeta } from './Lobby';
import type { PeerId, Transport } from './Transport';

/**
 * Sala de teste sem Steam: abas do mesmo navegador conversam por BroadcastChannel.
 * Mesmo contrato do SteamLobby, então o jogo não sabe a diferença.
 */
type Wire =
  | { k: 'hello'; from: PeerId; meta: MemberMeta; host: boolean; open: boolean }
  | { k: 'probe'; from: PeerId }
  | { k: 'leave'; from: PeerId }
  | { k: 'msg'; from: PeerId; to: PeerId | null; data: string };

const HEARTBEAT = 1000;
const TIMEOUT = 3500;

const rid = () => Math.random().toString(36).slice(2, 8);

class LocalRoom implements Lobby, Transport {
  readonly self = rid();
  private ch: BroadcastChannel;
  private meta: MemberMeta;
  private open = true;
  private peers = new Map<PeerId, { meta: MemberMeta; host: boolean; open: boolean; seen: number }>();
  private msgCb: ((from: PeerId, data: string) => void) | null = null;
  private leftCb: ((p: PeerId) => void) | null = null;
  private membersCb: (() => void) | null = null;
  private inbox: { from: PeerId; data: string }[] = [];
  private beat: number;
  private closed = false;
  private lastTick = performance.now();

  constructor(readonly code: string, readonly isHost: boolean, meta: MemberMeta) {
    this.meta = meta;
    this.ch = new BroadcastChannel(`${GAME_KEY}:${code}`);
    this.ch.onmessage = (e) => this.onWire(e.data as Wire);
    this.beat = window.setInterval(() => this.tick(), HEARTBEAT);
    this.hello();
  }

  get transport(): Transport {
    return this;
  }

  /** Host da sala (quem a criou), conhecido pelos hellos. */
  hostInfo() {
    for (const [id, p] of this.peers) if (p.host) return { id, ...p };
    return null;
  }

  private post(w: Wire) {
    // depois de sair, o jogo ainda pode mandar um último quadro antes de soltar a sala
    if (this.closed) return;
    this.ch.postMessage(w);
  }

  private hello() {
    this.post({ k: 'hello', from: this.self, meta: this.meta, host: this.isHost, open: this.open });
  }

  probe() {
    this.post({ k: 'probe', from: this.self });
  }

  private tick() {
    this.hello();
    const now = performance.now();
    // esta aba travou (carregando o escritório, aba em segundo plano): os outros não sumiram, a gente é que
    // não ouviu — e janelas do mesmo site dividem a thread, então todas travam juntas
    const stalled = now - this.lastTick > HEARTBEAT * 2;
    this.lastTick = now;
    if (stalled) {
      for (const p of this.peers.values()) p.seen = now;
      return;
    }
    for (const [id, p] of this.peers)
      if (now - p.seen > TIMEOUT) {
        this.peers.delete(id);
        this.leftCb?.(id);
        this.membersCb?.();
      }
  }

  private onWire(w: Wire) {
    if (w.from === this.self) return;
    if (w.k === 'probe') return this.hello();
    if (w.k === 'leave') {
      if (this.peers.delete(w.from)) {
        this.leftCb?.(w.from);
        this.membersCb?.();
      }
      return;
    }
    if (w.k === 'hello') {
      const known = this.peers.get(w.from);
      const changed = !known || JSON.stringify(known.meta) !== JSON.stringify(w.meta) || known.open !== w.open;
      this.peers.set(w.from, { meta: w.meta, host: w.host, open: w.open, seen: performance.now() });
      if (!known) this.hello();
      if (changed) this.membersCb?.();
      return;
    }
    if (w.to === null || w.to === this.self) this.inbox.push({ from: w.from, data: w.data });
  }

  // ---- Lobby
  members(): Member[] {
    const list: Member[] = [{ id: this.self, host: this.isHost, ...this.meta }];
    for (const [id, p] of this.peers) list.push({ id, host: p.host, ...p.meta });
    return list;
  }
  setMeta(meta: Partial<MemberMeta>) {
    this.meta = { ...this.meta, ...meta };
    this.hello();
    this.membersCb?.();
  }
  setJoinable(open: boolean) {
    this.open = open;
    this.hello();
  }
  onMembersChanged(cb: () => void) {
    this.membersCb = cb;
  }
  leave() {
    this.post({ k: 'leave', from: this.self });
    this.close();
  }

  // ---- Transport
  send(to: PeerId, data: string) {
    this.post({ k: 'msg', from: this.self, to, data });
  }
  broadcast(data: string) {
    this.post({ k: 'msg', from: this.self, to: null, data });
  }
  onMessage(cb: (from: PeerId, data: string) => void) {
    this.msgCb = cb;
  }
  onPeerLeft(cb: (peer: PeerId) => void) {
    this.leftCb = cb;
  }
  poll() {
    const box = this.inbox;
    this.inbox = [];
    for (const m of box) this.msgCb?.(m.from, m.data);
  }
  close() {
    this.closed = true;
    clearInterval(this.beat);
    this.ch.close();
  }
}

/** Teste de multiplayer (?mp=host): sala com código fixo, para o convidado saber onde entrar. */
export function hostLocal(code: string, meta: MemberMeta): Lobby {
  return new LocalRoom(code.trim().toUpperCase(), true, meta);
}

export function localProvider(): LobbyProvider {
  return {
    available: typeof BroadcastChannel !== 'undefined',
    selfName: () => 'Jogador',
    async create(meta) {
      return hostLocal(rid().slice(0, 4), meta);
    },
    async joinByCode(code, meta): Promise<Lobby | JoinError> {
      const room = new LocalRoom(code.trim().toUpperCase(), false, meta);
      room.probe();
      await new Promise((r) => setTimeout(r, 600));
      const host = room.hostInfo();
      let err: JoinError | null = null;
      if (!host) err = 'not-found';
      else if (host.meta.version !== NET_VERSION) err = 'version';
      else if (!host.open) err = 'in-day';
      else if (room.members().length > MAX_PLAYERS) err = 'full';
      if (err) {
        room.leave();
        return err;
      }
      return room;
    },
    onInvite() {},
  };
}
