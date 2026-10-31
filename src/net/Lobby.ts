import type { Look } from '../characters/designs';
import type { PeerId, Transport } from './Transport';

/** Chave de filtro dos lobbies: no AppID 480 (Spacewar) há salas do mundo todo. */
export const GAME_KEY = 'bosskey';
export const NET_VERSION = '0.6.0';
export const MAX_PLAYERS = 6;

/** O que cada membro publica no lobby. */
export interface MemberMeta {
  name: string;
  look: Look;
  ready: boolean;
  version: string;
}

export interface Member extends MemberMeta {
  id: PeerId;
  host: boolean;
}

export type JoinError = 'not-found' | 'full' | 'version' | 'in-day' | 'no-host';

export interface Lobby {
  readonly transport: Transport;
  readonly isHost: boolean;
  /** Código curto para passar ao amigo (o convite pelo overlay da Steam também funciona). */
  readonly code: string;
  members(): Member[];
  setMeta(meta: Partial<MemberMeta>): void;
  /** Host fecha a sala para novas entradas quando o dia começa (e reabre no elevador). */
  setJoinable(open: boolean): void;
  onMembersChanged(cb: () => void): void;
  leave(): void;
}

/** Fábrica de salas: implementada por SteamLobby (app) e LocalLobby (navegador). */
export interface LobbyProvider {
  readonly available: boolean;
  /** Nome do jogador (persona da Steam, ou o nome salvo no navegador). */
  selfName(): string;
  create(meta: MemberMeta): Promise<Lobby>;
  /** `step` narra as etapas para a tela de carregamento (procurando, entrando, conectando). */
  joinByCode(code: string, meta: MemberMeta, step?: (text: string) => void): Promise<Lobby | JoinError>;
  /** Convite aceito pelo overlay da Steam (Shift+Tab) com o jogo aberto ou ao abrir o jogo. */
  onInvite(cb: (code: string) => void): void;
}
