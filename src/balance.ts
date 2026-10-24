// Espelho da TABELA MESTRA do GDD (seção 14). Único lugar com números de jogo.
// Mudou aqui → atualize docs/GDD.md §14 também.

export const B = {
  DAY_DURATION: 300,
  PHASE_MIDDAY: 90,
  PHASE_AFTERNOON: 180,
  WEEK_DAYS: 5,
  FUN_MAX: 100,
  FUN_META: [40, 55, 65, 75, 85],
  SUS_MAX: 100,
  SUS_INSPECAO_RESET: 40,
  TEDIO_SUS_START: 15,
  ADVERTENCIAS_LIMITE: 3,
  PLAYER_SPEED: 4.0,
  PLAYER_ACCEL: 16,

  SUS_IDLE_DECAY: 0.3,
  SUS_STAND_IN_CONE: 6,
  SUS_PLANILHA: 2.5,
  SUS_PLANILHA_MISS: 2,
  SUS_HOT_EXTRA: 1,
  HEAT_HOT: 60,
  HEAT_DECAY_PLANILHA: 8,
  HEAT_DECAY_IDLE: 2,
  CAFE_DELIVER_SELF: 20,
  CAFE_DELIVER_OTHERS: 8,
  CAFE_MACHINE_CD: 20,
  CAFE_PLAYER_CD: 30,
  SPILL_PUDDLE_AT: 30,
  RELATORIO_DEADLINE: 90,
  RELATORIO_DELIVER: 10,
  RELATORIO_LATE: 20,
  RELATORIO_PER_DAY: [0, 2, 3, 3, 4],
  PRINT_HOLD: 4,

  CLUTCH_WINDOW: 0.35,
  CLUTCH_FUN: 5,
  CLUTCH_SUS: 10,
  CRUMBS_PENALTY: 15,
  PAPER_EVIDENCE_SUS: 8,
  PAPER_EVIDENCE_RADIUS: 4,

  BOSS_VISION_DEG: 70,
  BOSS_VISION_RANGE: 12,
  INSTINCT_THRESHOLD: 120,
  CHECK_DIST: 1.8,
  FLASHLIGHT_DEG: 30,
  FLASHLIGHT_RANGE: 14,
  CAMERA_FIXA_SUS: 5,

  BOT_REACT_MIN: 1.5,
  BOT_REACT_MAX: 3,
  BOT_FAIL_CHANCE: 0.15,
} as const;

export type ActivityId = 'tiro' | 'pesca' | 'video' | 'lanche' | 'basquete' | 'pizza';

export interface ActivitySpec {
  label: string;
  /** FUN por segundo (contínuo) ou por evento (discreto). */
  fun: number;
  funMax: number;
  /** Suspeita individual por segundo (contínuo) ou por uso. */
  sus: number;
  heat: number;
  noise: number;
  instinct: number;
}

export const ACT: Record<ActivityId, ActivitySpec> = {
  tiro: { label: 'Ball Ops', fun: 0.5, funMax: 20, sus: 1.2, heat: 6, noise: 7, instinct: 3.0 },
  pesca: { label: 'Pesca Zen', fun: 3, funMax: 18, sus: 0.5, heat: 2, noise: 0, instinct: 1.0 },
  video: { label: 'ClipClop', fun: 0.75, funMax: 15, sus: 0.8, heat: 3, noise: 8, instinct: 2.0 },
  lanche: { label: 'Lanche', fun: 4, funMax: 99, sus: 2, heat: 0, noise: 3, instinct: 2 },
  basquete: { label: 'Basquete', fun: 2, funMax: 99, sus: 0.3, heat: 0, noise: 2, instinct: 1 },
  pizza: { label: 'Pizza', fun: 6, funMax: 99, sus: 1, heat: 0, noise: 4, instinct: 2 },
};

export const TIRO_KILL_FUN = 0.5;
export const TIRO_MAX_TIME = 35;
export const TIRO_COOLDOWN = 60;
export const VIDEO_HEADPHONE = { sus: 0.3, heat: 1, noise: 0, instinct: 0.8 };
export const BASQUETE_MISS_FUN = 0.5;

export interface DayStock {
  tiro: number;
  pesca: number;
  video: number;
  lanche: number;
  basquete: number;
}

export const STOCK: DayStock = { tiro: 2, pesca: 6, video: 20, lanche: 3, basquete: 6 };

export type BossKind = 'x9' | 'chefe' | 'dono';

export interface DaySpec {
  name: string;
  short: string;
  boss: BossKind;
  bossName: string;
  speed: number;
  identify: number;
  check: number;
  minInterval: number;
  clockRonda: number;
  warn: number;
  flashlight: boolean;
  unlocked: Array<'tiro' | 'pesca' | 'video' | 'lanche' | 'basquete'>;
  event: 'boasvindas' | 'impressora' | 'auditoria' | 'blecaute' | 'pizza';
  eventName: string;
  eventDesc: string;
  novelty: string;
}

export const DAYS: DaySpec[] = [
  {
    name: 'Segunda-feira', short: 'SEG', boss: 'x9', bossName: 'Estagiário X9',
    speed: 2.5, identify: 0.8, check: 2, minInterval: 50, clockRonda: 90, warn: 10, flashlight: false,
    unlocked: ['tiro', 'lanche', 'basquete'],
    event: 'boasvindas', eventName: 'Boas-vindas',
    eventDesc: 'O X9 faz uma ronda dupla de "boas-vindas". Fique esperto.',
    novelty: 'Tutorial. O X9 é lento e grita quando desconfia.',
  },
  {
    name: 'Terça-feira', short: 'TER', boss: 'chefe', bossName: 'O Chefe',
    speed: 3.0, identify: 0.5, check: 3, minInterval: 45, clockRonda: 75, warn: 8, flashlight: false,
    unlocked: ['tiro', 'lanche', 'basquete', 'pesca', 'video'],
    event: 'impressora', eventName: 'Impressora travada',
    eventDesc: 'Alarme alto atrai o chefe. Destrave (E por 4 s) e vire herói.',
    novelty: 'Relatórios: imprima e entregue na bandeja antes do prazo.',
  },
  {
    name: 'Quarta-feira', short: 'QUA', boss: 'chefe', bossName: 'O Chefe',
    speed: 3.0, identify: 0.5, check: 3, minInterval: 40, clockRonda: 75, warn: 8, flashlight: false,
    unlocked: ['tiro', 'lanche', 'basquete', 'pesca', 'video'],
    event: 'auditoria', eventName: 'Auditoria',
    eventDesc: 'O chefe confere TODAS as mesas, em ordem. A ordem aparece no quadro.',
    novelty: 'Câmera de segurança no corredor do chefe.',
  },
  {
    name: 'Quinta-feira', short: 'QUI', boss: 'chefe', bossName: 'Chefe c/ lanterna',
    speed: 3.3, identify: 0.5, check: 3, minInterval: 35, clockRonda: 70, warn: 7, flashlight: true,
    unlocked: ['tiro', 'lanche', 'basquete', 'pesca', 'video'],
    event: 'blecaute', eventName: 'Blecaute',
    eventDesc: 'A luz cai. Telas brilham e denunciam. Disjuntor na cozinha (E por 6 s).',
    novelty: 'O chefe anda com lanterna.',
  },
  {
    name: 'Sexta-feira', short: 'SEX', boss: 'chefe', bossName: 'Chefe + O Dono',
    speed: 3.3, identify: 0.5, check: 3, minInterval: 30, clockRonda: 60, warn: 6, flashlight: false,
    unlocked: ['tiro', 'lanche', 'basquete', 'pesca', 'video'],
    event: 'pizza', eventName: 'Pizza de sexta',
    eventDesc: '6 fatias na cozinha (+6 FUN cada). O Dono confere a bagunça depois.',
    novelty: 'O Dono: sem passos, só chaves tilintando.',
  },
];

export const DONO = { speed: 3.5, rondas: [120, 240], warn: 5 };
export const PIZZA = { slices: 6, messLimit: 4, eatTime: 2 };
export const PRINTER_JAM = { alarm: 20, bossStay: 15, fixHold: 4, heroSus: 10, at: 100 };
export const BLACKOUT = { duration: 90, breakerHold: 6, heroSus: 10, at: 95 };
