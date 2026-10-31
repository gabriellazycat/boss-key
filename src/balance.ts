// Espelho da TABELA MESTRA do GDD (seção 14). Único lugar com números de jogo.
// Mudou aqui → atualize docs/GDD.md §14 também.

export const B = {
  /** Expediente de 5 min (v0.9: cabe a missão grande e as pequenas). Os tempos escritos para `BASE_DAY` escalam por DAY_DURATION/BASE_DAY. */
  DAY_DURATION: 300,
  BASE_DAY: 300,
  PHASE_MIDDAY: 90,
  PHASE_AFTERNOON: 180,
  /** Teto técnico do FUN de um dia (a meta do dia é que importa: `funGoal`). */
  FUN_MAX: 999,
  SUS_MAX: 100,
  PLAYER_SPEED: 4.0,
  PLAYER_ACCEL: 16,

  /** Café solto entregue na bandeja (trabalho voluntário). */
  CAFE_DELIVER_SELF: 5,
  CAFE_MACHINE_CD: 20,
  CAFE_PLAYER_CD: 30,
  SPILL_PUDDLE_AT: 30,
  BATHROOM_HIDE: 8,
  BATHROOM_HIDE_CD: 45,
  PRINT_HOLD: 4,

  /** Pilar 3: da porta abrindo até a conferência, nunca menos que isso (nem com o truque da porta lubrificada). */
  MIN_WARN: 6,
  /** ALT-TAB até este tempo antes da identificação = clutch (0,35 s quase nunca acontecia). */
  CLUTCH_WINDOW: 0.5,
  /** Arriscar compensa: FUN ganho com uma chefia fora da sala (e de olhos abertos) vale mais. */
  RISK_FUN_MUL: 1.25,
  CLUTCH_FUN: 5,
  CRUMBS_PENALTY: 15,
  PAPER_EVIDENCE_SUS: 8,
  PAPER_EVIDENCE_RADIUS: 4,

  BOSS_VISION_DEG: 70,
  BOSS_VISION_RANGE: 12,
  INSTINCT_THRESHOLD: 120,
  CHECK_DIST: 1.8,
  FLASHLIGHT_DEG: 30,
  FLASHLIGHT_RANGE: 14,

  BOT_REACT_MIN: 1.5,
  BOT_REACT_MAX: 3,
  BOT_FAIL_CHANCE: 0.15,
} as const;

// ------------------------------------------------------------------ run infinita
/**
 * Run de dias com 3 vidas. Perde uma vida quem é demitido (o dia acaba na hora) ou quem termina o dia abaixo da meta de FUN
 * (no multi a meta é do time: a soma de todos). Cada dia multiplica as taxas de Suspeita por `growth`.
 * A Suspeita só sobe por um motivo que aparece na tela (nada sobe sozinho com o tempo).
 */
export const RUN = {
  growth: 1.15,
  /** Vidas por run (por jogador no multi). */
  lives: 3,
  /** Teto da Suspeita com que se começa um dia. */
  maxStartSus: 70,
  /** Demitido guarda esta parte do FUN do dia no placar e na meta. */
  firedKeepFun: 0.5,
  /** Fim do expediente: a barra descansa um pouco. */
  dayEndRelief: 10,
  /** Tarefa fixa sem a cota fechada: o chefe cobra na manhã seguinte (× curva). */
  fixedMissSus: 15,
};
/** Multiplicador das taxas de Suspeita no dia `day` (0 = primeiro dia). */
export const runMul = (day: number) => Math.pow(RUN.growth, day);
/** Meta de FUN do dia `day` (solo; no multi multiplica pelo número de jogadores). */
export const FUN_GOAL = { base: 22, perDay: 5 };
export const funGoal = (day: number, players = 1) => Math.round((FUN_GOAL.base + FUN_GOAL.perDay * day) * (players > 1 ? 0.8 * players : 1));

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
/** "Dia 7 · Quarta": o calendário só dá o clima, a contagem é o que importa. */
export const dayTitle = (day: number) => `Dia ${day + 1} · ${WEEKDAYS[day % WEEKDAYS.length]}`;

// ------------------------------------------------------------------ atividades
export type ActivityId = 'tiro' | 'pesca' | 'video' | 'lanche' | 'basquete' | 'pizza' | 'cadeira' | 'soneca' | 'fofoca' | 'maquina';

export interface ActivitySpec {
  label: string;
  /** FUN por segundo (contínuo) ou por evento (discreto). */
  fun: number;
  funMax: number;
  /** Raio do barulho (o chefe ouve). */
  noise: number;
  /** Quanto atiça o instinto do chefe (por segundo ou por uso). */
  instinct: number;
}

/**
 * O FUN segue o risco: o PC rende pouco (a mesa é o esconderijo), as excursões pelo escritório rendem muito,
 * e o assalto à sala do chefe é o maior prêmio do dia (`HEIST`).
 */
export const ACT: Record<ActivityId, ActivitySpec> = {
  tiro: { label: 'Ball Ops', fun: 0.35, funMax: 14, noise: 7, instinct: 3.0 },
  pesca: { label: 'Pesca Zen', fun: 2, funMax: 12, noise: 0, instinct: 1.0 },
  video: { label: 'ClipClop', fun: 0.4, funMax: 10, noise: 8, instinct: 2.0 },
  lanche: { label: 'Lanche', fun: 3, funMax: 99, noise: 3, instinct: 2 },
  basquete: { label: 'Basquete', fun: 3, funMax: 99, noise: 2, instinct: 1 },
  pizza: { label: 'Pizza', fun: 6, funMax: 99, noise: 4, instinct: 2 },
  // diversões andando pelo escritório — todas "físicas": vistas pelo chefe = flagrante
  cadeira: { label: 'Corrida de cadeira', fun: 1.6, funMax: 16, noise: 6, instinct: 4.0 },
  soneca: { label: 'Soneca', fun: 1.2, funMax: 20, noise: 3, instinct: 1.0 },
  fofoca: { label: 'Fofoca', fun: 7, funMax: 99, noise: 5, instinct: 2.0 },
  maquina: { label: 'Máquina de lanche', fun: 6, funMax: 99, noise: 4, instinct: 1.5 },
};
/** Juntos rende mais, juntos faz barulho: cada colega por perto (fora da mesa) soma ao FUN e ao raio do barulho. */
export const SOCIAL = { radius: 2.6, funPer: 0.5, noisePer: 0.5, maxPeople: 3 };
/** Assalto: a rosquinha na mesa do chefe (só com ele fora da sala). Pego lá dentro = demissão. */
export const HEIST = { fun: 15, hold: 1.2 };

/** Atividades físicas: o chefe vê → flagrante após este tempo (GDD §10.4). */
export const FLAGRANTE_FISICO = 0.9;
/** Em pé, longe da mesa e sem álibi, no cone do chefe (× curva). */
export const SUS_WANDER_IN_CONE = 3;
/** Chefe olhando a tela proibida do jogador: Suspeita por segundo até chegar em 100% e demitir (sem curva do dia). */
export const SUS_CAUGHT_RATE = 60;
export const WALK_STOCK = { cadeira: 2, maquina: 2, fofoca: 3 };
export const CHAIR = { speed: 6.5, ride: 10, cooldown: 45 };
export const PAPER_DIST_BONUS = 0.4; // FUN extra por metro de distância

export const TIRO_KILL_FUN = 0.35;
export const TIRO_MAX_TIME = 35;
export const TIRO_COOLDOWN = 60;
export const VIDEO_HEADPHONE = { noise: 0, instinct: 0.8 };
export const BASQUETE_MISS_FUN = 0.5;

export interface DayStock {
  tiro: number;
  pesca: number;
  video: number;
  lanche: number;
}

export const STOCK: DayStock = { tiro: 2, pesca: 6, video: 20, lanche: 3 };
/** Bolinhas de papel: monte físico ao lado do PC (reposto todo dia) e quantas cabem na mão. */
export const PAPER = { pile: 8, handMax: 3 };

// ------------------------------------------------------------------ diversões do dia
export type FunId = 'tiro' | 'pesca' | 'video' | 'soneca' | 'cadeira' | 'lanche' | 'maquina' | 'fofoca' | 'cestas' | 'bonk' | 'vidro' | 'bonkChefe' | 'postit';

/**
 * Diversões sorteadas por dia: 1 grande + 3 pequenas, e só elas ficam liberadas.
 * `goal`: grandes contam FUN ganho na atividade; pequenas contam usos.
 */
export const FUN_TASKS: Record<FunId, { label: string; icon: string; big: boolean; goal: number; hint: string }> = {
  tiro: { label: 'Ball Ops', icon: '✦', big: true, goal: 8, hint: 'no PC: junte 8 FUN' },
  pesca: { label: 'Pesca Zen', icon: '🐟', big: true, goal: 9, hint: 'no PC: pesque 3 peixes' },
  video: { label: 'ClipClop', icon: '▶', big: true, goal: 8, hint: 'no PC: junte 8 FUN (H põe fones)' },
  soneca: { label: 'Soneca no sofá', icon: '💤', big: true, goal: 6, hint: 'sala de descompressão: junte 6 FUN' },
  cadeira: { label: 'Corrida de cadeira', icon: '🪑', big: true, goal: 6, hint: 'cadeira de rodinhas: junte 6 FUN em alta' },
  lanche: { label: 'Lanche na mesa', icon: '🍪', big: false, goal: 1, hint: 'sentado, aperte G' },
  maquina: { label: 'Máquina de lanche', icon: '🍫', big: false, goal: 1, hint: 'compre um lanche' },
  fofoca: { label: 'Fofoca', icon: '🗣', big: false, goal: 1, hint: 'segure E num colega na cozinha' },
  cestas: { label: '3 cestas de papel', icon: '📄', big: false, goal: 3, hint: 'bolinha do monte numa lixeira' },
  bonk: { label: 'Bolinha num colega', icon: '💢', big: false, goal: 1, hint: 'acerte a cabeça de alguém' },
  vidro: { label: 'Assustar os pombos', icon: '🐦', big: false, goal: 1, hint: 'E no vidro perto deles' },
  bonkChefe: { label: 'Bolinha no chefe', icon: '🎯', big: false, goal: 1, hint: 'pelas costas, sem ele ver' },
  postit: { label: 'Post-it na cadeira do chefe', icon: '🟨', big: false, goal: 1, hint: 'na sala dele, com ele fora (E na cadeira)' },
};
export const FUN_BIG: FunId[] = ['tiro', 'pesca', 'video', 'soneca', 'cadeira'];
// a fofoca não entra no sorteio: dá FUN, mas não vira tarefa do dia
export const FUN_SMALL: FunId[] = ['lanche', 'maquina', 'cestas', 'bonk', 'vidro', 'bonkChefe'];
/** Quantas por dia e quanto Vale-Diversão cada uma paga (é a única fonte de vale). */
export const FUN_DAY = { big: 1, small: 3, vdBig: 6, vdSmall: 2 };
/**
 * v0.9: as 2 missões pequenas de cada um saem deste sorteio (as diversões viraram missões com objetivo claro).
 * Cada uma paga `MISSIONS.smallFun` de FUN e `vd` de vale. Os jogos do PC ficam todos liberados (rendem pouco).
 */
export const MISSION_SMALL: FunId[] = ['cestas', 'bonkChefe', 'vidro', 'soneca', 'pesca', 'postit', 'maquina', 'cadeira'];
export const SMALL_DAY = { count: 2, vd: 3 };

// ------------------------------------------------------------------ chefias
export type BossKind = 'x9' | 'chefe' | 'dono';

export interface BossDay {
  speed: number;
  identify: number;
  check: number;
  warn: number;
  minInterval: number;
  /** Intervalo médio da ronda por relógio com pressão 1 (com pressão p, a chance por segundo é p / clockRonda). */
  clockRonda: number;
}

/** Base do X9 (o jeito dele); num dia de X9 os números do dia vêm de `x9Day`. */
export const X9_DAY: BossDay = { speed: 1.8, identify: 0.8, check: 2, warn: 10, minInterval: 50, clockRonda: 90 };

/** O chefe fica mais atento com os dias: além da curva de Suspeita, ronda mais e identifica mais rápido (degraus nos dias 5 e 10). */
export function bossDay(day: number): BossDay {
  return {
    speed: Math.min(3.8, 3.0 + 0.06 * day),
    identify: day >= 9 ? 0.4 : day >= 4 ? 0.45 : 0.5,
    check: 3,
    warn: Math.max(6, 8 - Math.floor(day / 3)), // pilar 3: o aviso nunca fica abaixo de 6 s
    minInterval: Math.max(22, 45 - 2 * day),
    clockRonda: Math.max(45, 75 - 2.5 * day),
  };
}

/** Dia de X9 (evento "Ronda do X9", sorteado do dia 2 em diante): o jeito dele (mais lento, confere rápido), mas a identificação e o ritmo das rondas seguem a curva do dia. */
export function x9Day(day: number): BossDay {
  return { ...bossDay(day), speed: Math.min(2.4, X9_DAY.speed + 0.04 * day), check: X9_DAY.check, warn: X9_DAY.warn };
}

// ------------------------------------------------------------------ tarefas de trabalho
/** Tarefa do chefe (telefone): 1 sorteada por dia, toca uma vez só. */
export type TaskKind = 'relatorio' | 'assinatura' | 'galao' | 'impressora' | 'cafe' | 'reuniao';
export const TASK_POOL: TaskKind[] = ['relatorio', 'assinatura', 'galao', 'impressora', 'cafe', 'reuniao'];

/**
 * Sem prazo: a Suspeita sobe enquanto a tarefa espera. 5 s de folga quando o telefone toca e de novo ao atender;
 * depois a rampa acelera (`base × (1 + t/accel)`, até `maxMul`) — tudo × curva do dia.
 */
export const TASKS = {
  perDay: 0,
  /** A ligação só toca enquanto você se diverte: chance por segundo × pressão (com pressão 1, ~12 s de diversão). */
  ringRate: 0.08,
  grace: 5,
  rampBase: 0.5,
  rampAccel: 20,
  rampMaxMul: 4,
  susDone: 8,
  susWrong: 6,
  meetingTime: 20,
  /** De quanto em quanto tempo o chefe olha para você na reunião (s) e quanto tempo dá para assentir. */
  meetingLook: [2.5, 4.5] as const,
  meetingNod: 2,
  meetingDoze: 5,
};

/** Tarefa fixa do dia (sempre ativa, sorteada entre as de monitor). Não sobe Suspeita; sem a cota no fim do dia, pune. */
export type FixedKind = 'planilha' | 'totais' | 'emails' | 'slides' | 'triagem';
export const FIXED: Record<FixedKind, { label: string; icon: string; quota: number; perRound: number; unit: string; how: string }> = {
  planilha: { label: 'Planilha', icon: '📊', quota: 12, perRound: 1, unit: 'acertos', how: 'sentado na planilha, F no ritmo' },
  totais: { label: 'Totais', icon: '▦', quota: 3, perRound: 1, unit: 'rodadas', how: 'app Trabalho do PC: some e dê ENTER' },
  emails: { label: 'E-mails', icon: '✉', quota: 3, perRound: 3, unit: 'e-mails', how: 'app Trabalho do PC: digite as respostas' },
  slides: { label: 'Slides', icon: '▭', quota: 2, perRound: 1, unit: 'apresentações', how: 'app Trabalho do PC: clique na ordem' },
  triagem: { label: 'Triagem de e-mails', icon: '✉', quota: 3, perRound: 1, unit: 'caixas', how: 'app Trabalho do PC: ← importante, → spam' },
};

/**
 * Pauta de trabalho do dia (v0.10): a cota agora é OBRIGATÓRIA (não fechar = perde 1 vida). É a tarefa fixa do PC +
 * 1 tarefa andando (2 do dia `twoFrom` em diante), cada uma com `goal` (+1 a cada `growEvery` dias). Solo: × SOLO.quotaMul.
 */
export type PautaKind = 'arquivar' | 'xerox' | 'entregar';
export const PAUTA: Record<PautaKind, { label: string; icon: string; goal: number; unit: string; how: string }> & { twoFrom: number; growEvery: number; maxGoal: number; errSus: number } = {
  arquivar: { label: 'Arquivar pastas', icon: '🗂', goal: 2, unit: 'lotes', how: 'pegue o lote na sua mesa e leve ao arquivo' },
  xerox: { label: 'Xerox em lote', icon: '🖨', goal: 2, unit: 'lotes', how: 'na impressora, no ritmo das folhas' },
  entregar: { label: 'Entregar na mesa do chefe', icon: '📨', goal: 1, unit: 'entregas', how: 'pegue na bandeja e deixe na mesa DELE' },
  twoFrom: 2,
  growEvery: 4,
  /** As tarefas andando nunca pedem mais que isso por dia. */
  maxGoal: 3,
  errSus: 2,
};
/** Meta de uma tarefa no dia `day` (o solo faz menos). */
export const workGoal = (base: number, day: number, solo: boolean) => Math.max(1, Math.round((base + Math.floor(day / PAUTA.growEvery)) * (solo ? SOLO.quotaMul : 1)));

/**
 * Papo com o chefe (v0.10, no lugar do Crédito): cada tarefa de trabalho feita (`hitsPerTask` acertos de ritmo, uma
 * rodada no app Trabalho, um lote/entrega da pauta) põe `perTask` s no seu banco, até `max`. Perto de uma chefia,
 * E puxa conversa: ela para, virada para você, enquanto o banco durar. Errar o ritmo dá `missSus` (× curva).
 */
/**
 * Introdução gradual (v0.10, contra o excesso de regras): índice do dia em que cada coisa entra (0 = 1º dia).
 * Dia 1: cota + grampeador · dia 2: papo e câmera · dia 3: distrações e sensor · dia 4: sala trancada ·
 * dia 5: missões de qualquer família (antes, só roubo e relógio). A vigilância tem os dias dela em `SURV`.
 */
export const INTRO = { talkFrom: 1, distractFrom: 2, anyMissionFrom: 4, early: ['grampeador', 'relogio', 'aquario'] as BigMissionId[] };

/** Casaco na cadeira: a mesa parece ocupada por `secs` s (o chefe não estranha a mesa vazia). */
export const COAT = { secs: 60 };

export const PAPO = { perTask: 8, max: 40, hitsPerTask: 4, min: 3, range: 2.6, missSus: 1.5 };

// ------------------------------------------------------------------ lojinha
/** Bolinha na cabeça: colega (+FUN e às vezes revida) ou chefe pelas costas. */
export const BONK = { funBot: 3, funBoss: 15, revenge: 0.5, headR: 0.48 };

export type ShopItemId =
  | 'dobradica' | 'planta' | 'postit' | 'ramal' | 'tapete' | 'fita' | 'panfleto'
  | 'pantufas' | 'monteMaior'
  | 'retrovisor' | 'atalho' | 'prancheta' | 'segundaTela'
  | 'cupom' | 'gula' | 'energetico'
  | 'atestado';
export type ShopStyle = 'contra' | 'furtivo' | 'alibi' | 'ganancia' | 'raro';
export const SHOP_STYLE: Record<ShopStyle, string> = { contra: 'Contra o chefe', furtivo: 'Furtivo', alibi: 'Álibi', ganancia: 'Ganância', raro: 'Raro' };
/**
 * Vendinhas do hall (Vale-Diversão = diversões do dia concluídas). 5 ofertas sorteadas por noite; os itens empilham
 * (`max` cópias) e cada cópia a mais custa `PRICE_STEP` vezes a anterior. Tudo vale até o fim da run (`atestado` é usado na hora).
 */
export const SHOP: { id: ShopItemId; icon: string; name: string; desc: string; cost: number; style: ShopStyle; max: number; weight: number }[] = [
  { id: 'dobradica', icon: '🚪', name: 'Dobradiça barulhenta', desc: 'A porta do chefe range mais alto: +2 s de aviso por dobradiça.', cost: 12, style: 'contra', max: 3, weight: 3 },
  { id: 'planta', icon: '🌵', name: 'Planta na mesa', desc: 'Esconde o monitor: o chefe demora ×1,5 para ver o jogo (empilha).', cost: 15, style: 'contra', max: 2, weight: 3 },
  { id: 'postit', icon: '🟨', name: 'Post-it "Em reunião"', desc: '1× por dia (por post-it): cole na mesa (E perto do PC) e a próxima ronda pula você.', cost: 14, style: 'contra', max: 3, weight: 2 },
  { id: 'ramal', icon: '☎', name: 'Ramal falso', desc: '1× por dia: R sentado liga para o chefe. Na sala, ele não sai por 25 s; fora, para 8 s para atender.', cost: 16, style: 'contra', max: 2, weight: 2 },
  { id: 'tapete', icon: '🧶', name: 'Tapete escorregadio', desc: 'Na porta dele: o chefe tropeça ao sair, +1,5 s de aviso (empilha).', cost: 10, style: 'contra', max: 3, weight: 2 },
  { id: 'fita', icon: '🩹', name: 'Fita na lente', desc: 'Cega a câmera da copa (contra o truque "câmera").', cost: 12, style: 'contra', max: 1, weight: 2 },
  { id: 'panfleto', icon: '📰', name: 'Panfleto da empresa', desc: '+1 cliente por dia na sala do chefe (enquanto ele atende, ele não sai).', cost: 14, style: 'contra', max: 2, weight: 2 },
  { id: 'pantufas', icon: '🧦', name: 'Pantufas', desc: 'Suas ações fazem metade do barulho (empilha até ¼).', cost: 10, style: 'furtivo', max: 2, weight: 3 },
  { id: 'monteMaior', icon: '📄', name: 'Monte maior', desc: '+4 bolinhas de papel no seu monte, todo dia (empilha).', cost: 8, style: 'furtivo', max: 2, weight: 2 },
  { id: 'retrovisor', icon: '👀', name: 'Retrovisor no monitor', desc: 'Um espelhinho mostra quem chega por trás enquanto você joga.', cost: 18, style: 'alibi', max: 1, weight: 2 },
  { id: 'atalho', icon: '⌨', name: 'Atalho de pânico', desc: 'A janela do CLUTCH cresce 0,3 s por atalho (trocar no limite vale mais vezes).', cost: 14, style: 'alibi', max: 2, weight: 2 },
  { id: 'prancheta', icon: '📋', name: 'Prancheta', desc: 'Andando sem tarefa você parece ocupado: nunca fica "à toa".', cost: 30, style: 'alibi', max: 1, weight: 1 },
  { id: 'segundaTela', icon: '🖥', name: 'Segunda tela', desc: '1× por dia: se o chefe pegar o jogo aberto, a planilha da 2ª tela salva você.', cost: 22, style: 'alibi', max: 2, weight: 1 },
  { id: 'cupom', icon: '🎟', name: 'Cupom em dobro', desc: '1× por dia: a primeira diversão longe da mesa vale FUN ×2.', cost: 12, style: 'ganancia', max: 2, weight: 2 },
  { id: 'gula', icon: '🍩', name: 'Faro de assalto', desc: 'O prêmio da sala do chefe vale +10 FUN (empilha).', cost: 14, style: 'ganancia', max: 2, weight: 2 },
  { id: 'energetico', icon: '⚡', name: 'Energético', desc: 'O trabalho (o imposto) anda 30% mais rápido (empilha).', cost: 10, style: 'ganancia', max: 2, weight: 2 },
  { id: 'atestado', icon: '🩺', name: 'Atestado médico', desc: '+1 vida, na hora.', cost: 40, style: 'raro', max: 9, weight: 1 },
];
export const SHOP_OFFERS = 5;
export const PRICE_STEP = 1.5;
export const SHOP_FX = { pileBonus: 4, doorWarn: 2, rugWarn: 1.5, plantIdentify: 1.5, slippers: 0.5, clutchBonus: 0.3, ramalHome: 25, ramalOut: 8, heistBonus: 10, workSpeed: 1.3 };

// ------------------------------------------------------------------ truques do chefe
export type TrickId = 'camera' | 'voltaRapida' | 'ouvido' | 'portaMuda' | 'sapatoMacio' | 'olhoAguia' | 'estagiario';
/**
 * A cada dia (do 2º em diante) o chefe aprende um truque novo, anunciado no elevador; os truques se acumulam.
 * Cada um tem um item da loja que o contra-ataca (`counter`).
 */
export const TRICKS: { id: TrickId; name: string; say: string; counter: ShopItemId }[] = [
  { id: 'ouvido', name: 'Ouvido apurado', say: 'Andei treinando o <b>ouvido</b>. Qualquer barulhinho, eu escuto.', counter: 'pantufas' },
  { id: 'portaMuda', name: 'Porta lubrificada', say: 'Mandei <b>lubrificar a minha porta</b>. Nada de rangido.', counter: 'dobradica' },
  { id: 'camera', name: 'Câmera na copa', say: 'Instalei uma <b>câmera na copa</b>. A luz vermelha quer dizer que está gravando.', counter: 'fita' },
  { id: 'voltaRapida', name: 'Volta rápida', say: 'Às vezes eu <b>esqueço alguma coisa</b> e volto na hora. Fiquem espertos.', counter: 'ramal' },
  { id: 'olhoAguia', name: 'Olho de águia', say: 'Óculos novos! Eu <b>reconheço uma tela de jogo</b> num piscar de olhos.', counter: 'planta' },
  { id: 'sapatoMacio', name: 'Sapato macio', say: 'Sapato novo, <b>solado macio</b>. Vocês não vão me ouvir chegando.', counter: 'retrovisor' },
  { id: 'estagiario', name: 'Estagiário', say: 'Contratei um <b>estagiário</b> para rondar comigo. Comportem-se.', counter: 'postit' },
];
export const TRICK_FX = { hear: 1.5, doorWarn: -2, doorVol: 0.35, stepVol: 0.35, identify: 0.7, comeBack: 0.4, comeBackDelay: 4, camOn: 6, camOff: 7, camSus: 4 };
/** Truques ativos no dia `day` (0 = 1º dia: nenhum). */
/** v0.10: os truques entram depois da introdução da vigilância (dias 2–4), um por dia a partir do 5º. */
export const TRICKS_FROM = 4;
export const tricksOn = (day: number) => TRICKS.slice(0, Math.max(0, Math.min(TRICKS.length, day - TRICKS_FROM + 1)));

// ------------------------------------------------------------------ assalto e clientes
/** Prêmio do dia na mesa do chefe (anunciado no elevador). */
export const HEIST_PRIZES: { id: string; name: string; color: string; say: string }[] = [
  { id: 'rosquinha', name: 'rosquinha do chefe', color: '#f29bc0', say: 'E <b>ninguém toca na minha rosquinha</b>.' },
  { id: 'bombom', name: 'bombom importado', color: '#7a4a2a', say: 'Ganhei <b>bombons importados</b>. São MEUS.' },
  { id: 'cupcake', name: 'cupcake do chefe', color: '#9be3c4', say: 'Tem um <b>cupcake</b> na minha mesa. Para mais tarde. Meu.' },
  { id: 'macaron', name: 'macaron do chefe', color: '#ffd23f', say: 'Comprei <b>macarons</b>. Nem pensem nisso.' },
];
/** Clientes: chegam pelo elevador e entram na sala do chefe; enquanto estão lá, ele não sai (janela segura). */
/** Visita (demitido no multi): quanto tempo o chefe para conversando e a recarga. */
export const VISIT = { talk: 6, cooldown: 25 };
export const CLIENTS = { perDay: 1, maxPerDay: 3, meeting: [22, 34] as const, firstAt: [0.18, 0.3] as const, gap: [0.2, 0.3] as const, speed: 1.7, flyerBonus: 1 };

// ------------------------------------------------------------------ agenda do chefe
export type AgendaKind = 'ronda' | 'cafe' | 'almoco' | 'cliente' | 'telefone' | 'impressao' | 'almocoFora' | 'reuniaoAndar';
/**
 * Agenda do chefe (v0.9; v0.10: ausência longa). Compromissos com hora marcada, no quadro ao lado da sala dele.
 * `base` itens no 1º dia, +1 a cada `perDays`, até `max`, espalhados de `firstAfter` s depois da calmaria até `end`
 * do dia. Todo dia tem 1 ausência LONGA (`long`: ele desce pelo elevador e some do andar) — é a janela do assalto;
 * ela encurta `longShrink` s por dia até `longMin`. O dado da ronda "por relógio" fica `clockMul` vezes mais raro.
 */
export const AGENDA = {
  base: 3,
  perDays: 2,
  max: 5,
  firstAfter: 15,
  end: 0.88,
  /** Folga mínima entre o fim de uma fatia e o próximo compromisso (s). */
  gap: 25,
  /** O cliente sobe pelo elevador uns segundos antes da reunião marcada. */
  clientLead: 12,
  /** Do 3º dia (índice 2) em diante, um compromisso vem rasurado (nunca a ausência longa nem a ronda). */
  smudgeFrom: 2,
  clockMul: 0.35,
  /** Sem ronda por relógio nestes segundos antes de um compromisso que tira o chefe da sala. */
  quietBefore: 20,
  pool: ['cafe', 'almoco', 'telefone', 'impressao', 'ronda'] as AgendaKind[],
  long: ['almocoFora', 'reuniaoAndar'] as AgendaKind[],
  /** A ausência longa fica nesta faixa do dia (nem cedo demais, nem no fim). */
  longWindow: [0.3, 0.7] as const,
  longShrink: 5,
  longMin: 45,
  dur: { ronda: 0, cafe: 20, almoco: 35, cliente: 0, telefone: 22, impressao: 14, almocoFora: 80, reuniaoAndar: 55 } as Record<AgendaKind, number>,
  label: {
    ronda: '👀 ronda pelo salão', cafe: '☕ café na copa', almoco: '🥪 almoço na copa', cliente: '🤝 reunião com cliente', telefone: '☎ telefonema (na sala)',
    impressao: '🖨 buscar impressão', almocoFora: '🍽 almoço FORA', reuniaoAndar: '🏢 reunião no 11º',
  } as Record<AgendaKind, string>,
  /** Segurar E no quadro para anotar a agenda (fica no TAB). */
  readHold: 1,
};
/** Duração da ausência longa no dia `day` (solo: `SOLO.longBonus` s a mais). */
export const longAway = (kind: AgendaKind, day: number, solo: boolean) =>
  Math.max(AGENDA.longMin, AGENDA.dur[kind] - AGENDA.longShrink * day) + (solo ? SOLO.longBonus : 0);

/** Solo (v0.10): sem time para distrair, a janela é maior e a cota menor. */
export const SOLO = { longBonus: 25, quotaMul: 0.75 };

// ------------------------------------------------------------------ distrações do mapa
export type DistractId = 'impressora' | 'radio' | 'ramal' | 'alarme';
/**
 * Distrações (v0.9): o jogador cria a brecha. `cd` = recarga (s), `hold` = segurar E, `noise` = raio do barulho no
 * lugar, `seenSus` = Suspeita se uma chefia vir quem acionou (× curva). O alarme é 1× por dia e dura `on` s.
 */
export const DISTRACT: Record<DistractId, { name: string; article: 'a' | 'o'; icon: string; verb: string; hint: string; cd: number; hold: number; noise: number; seenSus: number }> = {
  impressora: { name: 'Impressora', article: 'a', icon: '🖨', verb: 'Travar a impressora', hint: 'o alarme puxa o chefe até a impressora por um tempo', cd: 70, hold: 1.5, noise: 6, seenSus: 12 },
  radio: { name: 'Rádio', article: 'o', icon: '📻', verb: 'Ligar o rádio da copa', hint: 'música alta: o chefe vai até a copa desligar', cd: 55, hold: 0.6, noise: 8, seenSus: 8 },
  ramal: { name: 'Viva-voz', article: 'o', icon: '☎', verb: 'Ligar para o ramal do chefe', hint: 'na sala ele não sai por um tempo; fora, para para atender', cd: 60, hold: 1, noise: 2, seenSus: 10 },
  alarme: { name: 'Alarme de incêndio', article: 'o', icon: '🚨', verb: 'Puxar o alarme de incêndio', hint: '1× por dia: todo mundo (o chefe também) vai para o elevador', cd: 0, hold: 2, noise: 4, seenSus: 30 },
};
export const DISTRACT_FX = {
  radio: { on: 20, bossStay: 10 },
  alarme: { on: 25 },
};

// ------------------------------------------------------------------ itens de missão
export type ItemKind = 'grampeador' | 'aquario' | 'banquinho' | 'salgadinho';
/**
 * Itens de missão (v0.9). `speedOne`/`speedTwo` = velocidade de quem segura (sozinho / a dois). Passe: a mira da
 * bolinha × `passSpeed`; pega no ar quem estiver a `catchR` m da trajetória. Largado e achado pelo chefe = `evidenceSus`.
 * Aquário: a dois, uma mola (`spring`/s) segura vocês a `rope` m; passou de `breakAt`, alguém solta. Chacoalhar enche
 * `slosh` (sozinho sempre um pouco); cheio = SPLASH (barulho e poça).
 */
export const ITEMS = {
  grampeador: { name: 'Grampeador de ouro', icon: '📎', pickHold: 0, speedOne: 1, speedTwo: 1 },
  banquinho: { name: 'Banquinho', icon: '🪑', pickHold: 0, speedOne: 0.8, speedTwo: 0.8 },
  salgadinho: { name: 'Salgadinho', icon: '🥨', pickHold: 0, speedOne: 1, speedTwo: 1 },
  aquario: {
    name: 'Aquário', icon: '🐠', pickHold: 0.6, speedOne: 0.38, speedTwo: 0.62,
    rope: 1.3, spring: 6, breakAt: 3.2, sloshSolo: 0.09, jerkFree: 3, sloshPerJerk: 0.03, calm: 0.05, splashNoise: 9,
  },
  passSpeed: 0.85,
  passNoise: 3,
  landNoise: 4,
  catchR: 0.9,
  stashHold: 0.8,
  evidenceSus: 10,
};

// ------------------------------------------------------------------ missões
export type BigMissionId = 'grampeador' | 'aquario' | 'papel' | 'salgadinho' | 'lan' | 'relogio' | 'posteres';
export type MissionFamily = 'roubo' | 'farra' | 'escritorio';
/**
 * Missão grande do dia (v0.9; v0.10: 7 missões em 3 famílias, com subtarefas). Do time no multi: paga `bigShare` da
 * meta de FUN (dividido por quem joga) e `bigVale`. O sorteio não repete a família de ontem. `unlock` = XP de carreira
 * para entrar no sorteio (0 = desde o começo). As 2 pequenas de cada um pagam `smallFun` + vale.
 */
export const MISSIONS: Record<BigMissionId, { name: string; icon: string; family: MissionFamily; unlock: number; brief: string }> & {
  bigShare: number; bigVale: number; smallFun: number; drawerNoise: number; gulaBonus: number;
  lanKills: (day: number, players: number) => number; clockGain: number; posters: number; salgadinhoPrice: number;
} = {
  grampeador: { name: 'Roubar o grampeador', icon: '📎', family: 'roubo', unlock: 0, brief: 'Meu <b>grampeador de ouro</b> está na minha escrivaninha. A chave extra… escondi muito bem.' },
  relogio: { name: 'Adiantar o relógio', icon: '🕰', family: 'escritorio', unlock: 0, brief: 'O <b>relógio do salão</b> é sagrado. Ninguém mexe no horário desta empresa.' },
  lan: { name: 'Campeonato de Ball Ops', icon: '🎮', family: 'farra', unlock: 0, brief: 'Ouvi falar de um tal <b>campeonato de joguinho</b>. Aqui NÃO.' },
  aquario: { name: 'Sequestrar o aquário', icon: '🐠', family: 'roubo', unlock: 3, brief: 'O meu <b>aquário</b> fica na MINHA sala. Ninguém mexe no Nemo.' },
  posteres: { name: 'Colar pôsteres', icon: '🖼', family: 'escritorio', unlock: 6, brief: 'Paredes <b>limpas</b>. Pôster aqui só o meu, "CHEFE DO MÊS".' },
  salgadinho: { name: 'Salgadinho do térreo', icon: '🥨', family: 'roubo', unlock: 10, brief: 'Ninguém sai do andar no expediente. Nem para comprar <b>salgadinho</b>.' },
  papel: { name: 'Papel de parede do chefe', icon: '🖥', family: 'roubo', unlock: 15, brief: 'Meu <b>computador</b> tem senha. Uma senha muito segura.' },
  bigShare: 0.7,
  bigVale: 8,
  smallFun: 5,
  drawerNoise: 3,
  gulaBonus: 10,
  /** Abates do time no campeonato (sobe com o dia e com quem joga). */
  lanKills: (day: number, players: number) => 6 + 2 * day + 3 * (players - 1),
  /** Relógio adiantado: o expediente acaba esses segundos antes. */
  clockGain: 30,
  posters: 4,
  salgadinhoPrice: 3.75,
};

/**
 * Vigilância do chefe (v0.10): um equipamento por dia (índice do dia em que entra), sempre visível e com contra-ataque.
 * Câmera semáforo: verde `camGreen` s → amarelo piscando `camWarn` s (o aviso) → vermelho `camRed` s; cone de `camFov`
 * rad e `camRange` m que varre ±`camArc` rad. Sensor: desligado por `sensorOff` s (minigame de fios). Porta trancada:
 * o código abre por `unlockTime` s.
 */
export const SURV = {
  camsFrom: 1,
  sensorFrom: 2,
  lockFrom: 3,
  camGreen: 7,
  camWarn: 1.2,
  camRed: 5,
  camFov: 0.75,
  camRange: 9,
  camArc: 0.55,
  camSweep: 0.35,
  camSus: 5,
  sensorOff: 60,
  unlockTime: 35,
};

/** Carreira entre runs (v0.10): XP por dia sobrevivido e por missão grande feita; desbloqueia missões (`MISSIONS.unlock`). */
export const CAREER = { xpDay: 1, xpMission: 1 };

// ------------------------------------------------------------------ elevador
/** Começo do dia no elevador (s). */
export const ELEVATOR = { time: 19, skipHold: 0.8, talkDelay: 0.5 };
/** Tutorial relâmpago do chefe no elevador do 1º dia: cada fala dura `t` segundos (somam ~12 s). */
export const ELEVATOR_TALK: { t: number; say: string }[] = [
  { t: 1.8, say: 'Bom dia, time! Vou ser rápido.' },
  { t: 2.4, say: 'Aqui a gente <b>trabalha</b>. Sem moleza.' },
  { t: 2.7, say: 'Sua mesa tem a plaquinha amarela. Faça a <b>tarefa fixa</b> do dia.' },
  { t: 2.9, say: 'Quando eu ligar, <b>atenda logo</b>. Eu não gosto de esperar.' },
  { t: 2.4, say: 'Dúvida? Segure <kbd>TAB</kbd>. Bom trabalho! 😇' },
];
/** Evento "Ronda do X9" (sorteado do dia 2 em diante; o X9 manda no dia): ronda sem parar por `duration` s, com pausas de café/banheiro (cego e surdo na pausa). */
export const X9_PATROL = { duration: [45, 65] as const, breakEvery: [30, 45] as const, breakTime: [25, 40] as const };

// ------------------------------------------------------------------ eventos
export type EventId = 'boasvindas' | 'impressora' | 'auditoria' | 'blecaute' | 'pizza' | 'internet' | 'reuniao' | 'bolo' | 'ronda';

export const EVENTS: Record<EventId, { name: string; desc: string }> = {
  ronda: { name: 'Ronda do X9', desc: 'O X9 sai da sala e fica andando pelo salão por um bom tempo, com pausas de café.' },
  boasvindas: { name: 'Boas-vindas', desc: 'A chefia passa em TODAS as mesas para dar "bom dia". Fique esperto.' },
  impressora: { name: 'Impressora travada', desc: 'Alarme alto atrai o chefe. Destrave (E por 4 s) e vire herói.' },
  auditoria: { name: 'Auditoria', desc: 'O chefe confere TODAS as mesas, em ordem. A ordem aparece no quadro.' },
  blecaute: { name: 'Blecaute', desc: 'Chove forte e um raio derruba a luz. Telas brilham e denunciam. Disjuntor na cozinha (E por 6 s).' },
  pizza: { name: 'Pizza', desc: '6 fatias na cozinha (+6 FUN cada). O Dono confere a bagunça depois.' },
  internet: { name: 'Internet caiu', desc: 'Os jogos do PC ficam offline e o chefe sai para ver quem está "trabalhando".' },
  reuniao: { name: 'Reunião surpresa', desc: 'O chefe chama todo mundo para a mesa de reunião. Quem não aparecer a tempo leva Suspeita.' },
  bolo: { name: 'Aniversário', desc: 'Bolo na cozinha (+4 FUN por fatia), mas cada fatia deixa migalhas na sua mesa.' },
};
export const EVENT_IDS = Object.keys(EVENTS) as EventId[];

/** Comentário do chefe sobre cada evento, dito no elevador (multiplayer, todo dia). */
const BOSS_EVENT_TALK: Record<EventId, string> = {
  ronda: 'Hoje eu vou <b>rondar o salão</b> o dia todo. Quero ver quem trabalha.',
  boasvindas: 'Hoje eu passo em <b>todas as mesas</b> para dar bom dia. Todas.',
  impressora: 'Dizem que a <b>impressora</b> vai travar hoje. Se apitar, eu apareço.',
  auditoria: 'Hoje é dia de <b>auditoria</b>: confiro mesa por mesa, na ordem do quadro.',
  blecaute: 'Previsão de <b>tempestade</b>. Se a luz cair, o disjuntor fica na cozinha.',
  pizza: 'Tem <b>pizza</b> na cozinha hoje! Mas o Dono vai conferir a bagunça depois.',
  internet: 'A <b>internet</b> está instável. Se cair, vou ver quem está "trabalhando".',
  reuniao: 'Posso chamar uma <b>reunião surpresa</b> a qualquer hora. Quem faltar, sofre.',
  bolo: 'É dia de <b>aniversário</b>! Tem bolo, mas cuidado com as migalhas na mesa.',
};
const BOSS_GREET = ['Bom dia, time!', 'Bom dia! Todo mundo de café tomado?', 'Todo mundo aqui? Ótimo.'];
const BOSS_BYE = ['Bom trabalho! 😇', 'Façam por merecer o salário.', 'Estou de olho. 👀'];

/** Fala do chefe no elevador de cada dia da sala: saudação, o evento do dia e uma despedida (cabe nos ~11 s do elevador). */
export function dailyBossTalk(dayName: string, dayIndex: number, events: EventId[], extra: string[] = []): { t: number; say: string }[] {
  const talk = [{ t: 2.2, say: `${BOSS_GREET[dayIndex % BOSS_GREET.length]} Hoje é <b>${dayName}</b>.` }];
  if (!events.length) talk.push({ t: 2.6, say: 'O dia promete ser tranquilo… <b>por enquanto</b>.' });
  else talk.push({ t: 3, say: BOSS_EVENT_TALK[events[0]] + (events.length > 1 ? ' E tem <b>mais uma surpresa</b>.' : '') });
  for (const e of extra) talk.push({ t: 2.7, say: e });
  talk.push({ t: 1.8, say: BOSS_BYE[dayIndex % BOSS_BYE.length] });
  return talk;
}
/**
 * Pressão (0–1): o que faz a chefia agir. Tempo do dia (sozinho só leva até `timeMax`) + FUN de hoje + bônus enquanto
 * se diverte. Na calmaria depois do elevador nada sai, toca nem acumula instinto. No multi vale a maior da sala.
 */
export const PRESSURE = {
  calmFirstDay: 60,
  calm: 20,
  timeMax: 0.5,
  /** FUN de hoje que vale `funMax` de pressão. */
  funFull: 60,
  funMax: 0.35,
  /** Enquanto se diverte (ou até `liveHold` s depois de ganhar FUN). */
  live: 0.15,
  liveHold: 3,
};

/** Quando o evento toca (fração do dia) e a chance de tocar uma 2ª vez, que cresce com os dias. */
export const EVENT_TIMING = {
  /** 1ª vez: chance por segundo × pressão depois da calmaria; se não sair até `due` do dia, toca mesmo assim (o chefe anunciou). */
  rate: 0.03,
  due: 0.85,
  second: [0.68, 0.85] as const,
  secondBase: 0.15,
  secondPerDay: 0.05,
  secondMax: 0.6,
};

export const DONO = { speed: 3.5, warn: 5 };
/** Pizza/bolo: fatias, tempo segurando E e, na pizza, o julgamento do Dono `judgeAfter` s depois. */
export const PIZZA = { slices: 6, messLimit: 4, eatTime: 2, judgeAfter: 40 };
export const BOLO = { slices: 6, eatTime: 1.5, fun: 4 };
export const PRINTER_JAM = { alarm: 24, bossStay: 22, fixHold: 4, heroSus: 10 };
export const BLACKOUT = { duration: 54, breakerHold: 6, heroSus: 10 };
export const INTERNET = { duration: 25, instinct: 60 };
/** Reunião surpresa: segundos para chegar, raio em volta da mesa e a Suspeita de quem faltar (× curva). */
export const MEETING_CALL = { gather: 15, stay: 6, radius: 3.4, sus: 10 };
