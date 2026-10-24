import type { Ball } from '../entities/Ball';
import type { Desk } from '../world/Office';
import type { AppId } from '../apps/common';

/** Funcionário (jogador ou bot): os números que o chefe e as barras usam. */
export class Worker {
  fun = 0;
  sus = 0;
  heat = 0;
  fired = false;
  /** Contribuição recente ao Instinto (decai) — define a ordem da ronda. */
  contribution = 0;
  seated = true;
  crumbs = 0;
  puddle = false;
  pizzaEaten = 0;
  clutches = 0;
  peakSus = 0;
  /** Bandeira para a próxima ronda (relatório atrasado, flagrante...). */
  flagged = false;
  flagrante = false;
  /** Tempo acumulado sendo visto em atividade física pelo chefe. */
  physicalSeen = 0;
  bored = false;
  // bots
  botScreen: AppId = 'planilha';
  botTimer = 0;
  botReact = -1;
  botFailRonda = false;
  botScreenTimer = 0;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly isPlayer: boolean,
    readonly desk: Desk,
    readonly ball: Ball,
  ) {}

  resetDay(startSus: number) {
    this.fun = 0;
    this.sus = startSus;
    this.heat = 0;
    this.fired = false;
    this.contribution = 0;
    this.seated = true;
    this.crumbs = 0;
    this.puddle = false;
    this.pizzaEaten = 0;
    this.clutches = 0;
    this.peakSus = startSus;
    this.flagged = false;
    this.flagrante = false;
    this.physicalSeen = 0;
    this.botScreen = 'planilha';
    this.botTimer = 4 + Math.random() * 10;
    this.botReact = -1;
    this.botFailRonda = false;
  }
}
