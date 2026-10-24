import type * as THREE from 'three';
import type { Ball } from '../entities/Ball';
import type { Desk } from '../world/Office';
import type { AppId } from '../apps/common';
import type { ActivityId } from '../balance';

export type BotState = 'seated' | 'walking' | 'atSpot' | 'returning';

export interface Spot {
  id: string;
  pos: THREE.Vector3;
  /** Para onde olhar quando chega. */
  look: THREE.Vector3;
  act: ActivityId | null;
  busy: Worker | null;
  lie?: boolean;
}

/** Funcionário (jogador ou bot): os números que o chefe e as barras usam. */
export class Worker {
  fun = 0;
  sus = 0;
  heat = 0;
  fired = false;
  contribution = 0;
  seated = true;
  crumbs = 0;
  puddle = false;
  pizzaEaten = 0;
  clutches = 0;
  peakSus = 0;
  flagged = false;
  flagrante = false;
  /** Tempo acumulado sendo visto em atividade física pelo chefe. */
  physicalSeen = 0;
  bored = false;
  /** Atividade deste quadro (tela ou física) — definida pelo controlador. */
  act: ActivityId | null = null;
  physical = false;
  /** FUN ganho hoje por atividade (para os tetos funMax). */
  earned: Partial<Record<ActivityId, number>> = {};
  // bots
  botScreen: AppId = 'planilha';
  botTimer = 0;
  botReact = -1;
  botFailRonda = false;
  botState: BotState = 'seated';
  botPath: THREE.Vector3[] = [];
  botSpot: Spot | null = null;
  botSpotT = 0;
  botRun = false;

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
    this.act = null;
    this.physical = false;
    this.earned = {};
    this.botScreen = 'planilha';
    this.botTimer = 6 + Math.random() * 14;
    this.botReact = -1;
    this.botFailRonda = false;
    this.botState = 'seated';
    this.botPath = [];
    if (this.botSpot) this.botSpot.busy = null;
    this.botSpot = null;
    this.botRun = false;
  }
}
