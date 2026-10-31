/** Canal entre os jogadores de uma sala. Steam (P2P relay) no app; BroadcastChannel no navegador. */
export type PeerId = string;

export interface Transport {
  readonly self: PeerId;
  /** `reliable` para eventos (pronto, pego, demitido); falso para snapshots/inputs que se substituem. */
  send(to: PeerId, data: string, reliable: boolean): void;
  broadcast(data: string, reliable: boolean): void;
  onMessage(cb: (from: PeerId, data: string) => void): void;
  /** Chamado quando um par some (saiu do lobby, caiu ou fechou o jogo). */
  onPeerLeft(cb: (peer: PeerId) => void): void;
  /** Esvazia a fila de entrada; chamado uma vez por frame (o Steam é por polling). */
  poll(): void;
  close(): void;
}
