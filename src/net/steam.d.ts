/** Ponte `window.steam` exposta por electron/preload.cjs (só existe no app desktop com a Steam aberta). */
export interface SteamBridge {
  readonly available: true;
  /** SteamID64 do jogador local, como string. */
  readonly selfId: string;
  /** Nome de perfil (persona) da Steam. */
  readonly name: string;
  createLobby(max: number): Promise<string>;
  joinLobby(id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  /** Procura entre os lobbies visíveis (amigos) um com `game` e `code` iguais. */
  findLobby(gameKey: string, code: string): Promise<string | null>;
  leaveLobby(id: string): void;
  members(id: string): { owner: string; members: string[]; limit: number } | null;
  getData(id: string, key: string): string | null;
  setData(id: string, key: string, value: string): boolean;
  setJoinable(id: string, open: boolean): void;
  openInvite(id: string): void;
  send(to: string, data: string, reliable: boolean): void;
  /** Esvazia as mensagens P2P recebidas: pares [steamId, texto]. */
  poll(): [string, string][];
  on(event: 'members' | 'invite' | 'peer-fail', cb: (id: string) => void): void;
}

declare global {
  interface Window {
    steam?: SteamBridge;
  }
}
