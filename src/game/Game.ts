import * as THREE from 'three';
import {
  B, ACT, DONO, PIZZA, BOLO, PRINTER_JAM, BLACKOUT, INTERNET, MEETING_CALL, STOCK, PAPER, ELEVATOR, ELEVATOR_TALK, dailyBossTalk, TASKS, BONK, SHOP_FX,
  TRICK_FX, tricksOn, HEIST_PRIZES, CLIENTS, VISIT, AGENDA, type TrickId,
  PAPO, COAT, INTRO, PAUTA, RUN, runMul, funGoal, dayTitle, bossDay, x9Day, X9_DAY, FUN_TASKS, MISSION_SMALL, SMALL_DAY, MISSIONS, FIXED, EVENTS, EVENT_IDS, EVENT_TIMING, PRESSURE,
  type FunId, type EventId, type BossDay, TIRO_COOLDOWN, VIDEO_HEADPHONE, WALK_STOCK,
  FLAGRANTE_FISICO, SUS_WANDER_IN_CONE, SUS_CAUGHT_RATE, SOCIAL, HEIST, type ActivityId, type BossKind,
} from '../balance';
import type { Renderer } from '../core/Renderer';
import type { AudioEngine, LoopSound } from '../core/Audio';
import type { Input } from '../core/Input';
import type { Juice } from '../core/Juice';
import { Office, W, ELEV_F, ELEV_SPOTS, LOBBY, LOBBY_DZ } from '../world/Office';
import { Shop } from './Shop';
import { Clients } from './Clients';
import { Agenda } from './Agenda';
import { Distractions } from './Distractions';
import { Items, type MItem } from './Items';
import { Missions, type MissionPlan } from './Missions';
import { Surveillance } from './Surveillance';
import { Career } from './Career';
import { LobbyCrowd } from './LobbyCrowd';
import { Nav } from '../world/Nav';
import { Ball, KIND_LOOK } from '../entities/Ball';
import { portraits } from '../characters/portrait';
import { TaskDirector, type TaskInst } from './Tasks';
import type { Look } from '../characters/designs';
import { Worker } from './Worker';
import { Boss, CHASE_TIME, type BossTarget } from './Boss';
import { Bots } from './Bots';
import type { Multi } from './Multi';
import { WEATHERS, type Weather } from '../world/Daylight';
import type { DayPlanNet, EventState, ScoreLine } from '../net/Protocol';
import { Player, type Interactable } from './Player';
import { Computer, drawBotScreen } from '../apps/Computer';
import type { AppEvent, AppId } from '../apps/common';
import { CONTROLS, type ControlMode, type HUD, type TaskView } from '../ui/HUD';
import { MinigamePanel } from '../ui/Minigame';
import type { ArenaLink } from '../apps/Arena';
import { seenOnce, type Settings } from '../save';

const BOSS_NAME: Record<BossKind, string> = { chefe: 'CHEFE', x9: 'X9', dono: 'DONO' };

/** De onde veio a Suspeita (resumo do fim do dia e setas da barra). */
export type SusSource = 'tarefa' | 'chefe' | 'erro' | 'fixa';
export const SUS_SOURCE_LABEL: Record<SusSource, string> = {
  tarefa: 'tarefas do chefe esperando',
  chefe: 'o chefe viu ou ouviu',
  erro: 'trabalho errado',
  fixa: 'tarefa fixa sem a cota',
};

export interface DayResult {
  day: number;
  /** FUN do dia (0 no placar se foi demitido) e o total da run depois deste dia. */
  fun: number;
  total: number;
  clutches: number;
  /** Suspeita no começo e no fim do expediente, com quem começa amanhã e de onde ela veio. */
  susStart: number;
  susEnd: number;
  susNext: number;
  susLog: [SusSource, number][];
  fired: boolean;
  firedReason: string;
  /** Fim da run: as vidas acabaram (no multi, de todos). */
  runOver: boolean;
  /** Vidas perdidas na run até aqui (a run acaba em RUN.lives). */
  strikes: number;
  /** Meta de FUN do dia (do time, no multi), quanto foi feito e por que perdeu vida hoje ('' = não perdeu). */
  goal: number;
  goalFun: number;
  lifeLost: '' | 'demitido' | 'tedio' | 'cota';
  /** Para o relatório do teste: eventos do dia, quem mandou e os itens da loja que você tinha. */
  events: string[];
  boss: string;
  items: Record<string, number>;
  bots: { name: string; fun: number; total?: number; fired: boolean }[];
  tasks: number;
  fixed: { label: string; done: boolean; prog: string };
  funTasks: { label: string; icon: string; big: boolean; done: boolean }[];
  /** Vale-Diversão ganho hoje e saldo depois do dia. */
  vd: number;
  wallet: number;
}

export interface FunTask {
  id: FunId;
  label: string;
  icon: string;
  big: boolean;
  goal: number;
  prog: number;
  done: boolean;
}

/** Um evento agendado no dia (pode tocar duas vezes). */
interface EventSlot {
  id: EventId;
  at: number;
  fired: boolean;
  /** 1ª vez: pode tocar antes de `at`, com chance × pressão. */
  roll?: boolean;
}

/** Elenco: o primeiro é o jogador (o acessório e as cores vêm da escolha dele). */
const PEOPLE: { name: string; look: Look }[] = [
  { name: 'Você', look: { species: 'telinha', color: '#ff8a3d', tie: '#2F5FA8', variant: 'voce' } },
  { name: 'Bia', look: { species: 'telinha', color: '#ff7eb6', tie: '#7A5BC0', variant: 'bia' } },
  { name: 'Caio', look: { species: 'telinha', color: '#4da3ff', tie: '#E6C43A', variant: 'caio' } },
  { name: 'Duda', look: { species: 'telinha', color: '#ffd23f', tie: '#3E9B5B', variant: 'bia' } },
  { name: 'Edu', look: { species: 'telinha', color: '#9b7bff', tie: '#E0832B', variant: 'voce' } },
  { name: 'Fê', look: { species: 'telinha', color: '#3ddc97', tie: '#D45A8B', variant: 'caio' } },
];
const ACTIVE_BOTS = [1, 2, 3, 5];
/** Grade de cor do térreo (luz artificial quente, sem o roxo do fim de tarde). */
const LOBBY_LIFT = new THREE.Vector3(0.012, 0.014, 0.022);
const LOBBY_GAIN = new THREE.Vector3(1.03, 1.0, 0.96);/** Atividades com teto diário de FUN controlado pelo Game. */
const CAPPED: ActivityId[] = ['soneca'];

export class Game {
  readonly nav: Nav;
  readonly workers: Worker[] = [];
  readonly allWorkers: Worker[] = [];
  readonly player: Worker;
  bosses: Boss[] = [];
  readonly chefe: Boss;
  readonly x9: Boss;
  readonly dono: Boss;
  readonly computer: Computer;
  readonly bots: Bots;
  readonly pc: Player;
  time = 0;
  duration: number = B.DAY_DURATION;
  dayIndex = 0;
  results: DayResult[] = [];
  /** FUN somado na run (o placar). */
  runFun = 0;
  /** Vidas perdidas nesta run (demissão ou meta de FUN não batida); acaba em RUN.lives. */
  strikes = 0;
  /** Vida perdida hoje (para não descontar duas vezes no mesmo dia). */
  private lostToday: '' | 'demitido' | 'tedio' | 'cota' = '';
  /** Suspeita do jogador por motivo, juntada para virar um número na tela. */
  private susFx = new Map<string, { acc: number; t: number; at?: THREE.Vector3 }>();
  /** Cota fixa de ontem não fechada: o chefe cobra quando a porta do elevador abre. */
  private fixedDebt = 0;
  running = false;
  paused = false;
  attract = false;
  instinct = 0;
  /** Última vez que o jogador ganhou FUN (conta como "se divertindo" por `PRESSURE.liveHold` s). */
  private lastFunT = -99;
  blackout = false;
  /** Ritmo da chefia hoje (o chefe cada vez mais atento; num dia de X9, `x9Day`). */
  bossToday: BossDay = X9_DAY;
  /** Eventos do dia: os ids (o cliente recebe do host) e, no host/solo, quando cada um toca. */
  dayEvents: EventId[] = [];
  private eventPlan: EventSlot[] = [];
  private prevEvent: EventId | null = null;
  weather: Weather = 'sol';
  /** Diversões do dia (1 grande + 3 pequenas): só elas ficam liberadas. */
  funTasks: FunTask[] = [];
  private dayVd = 0;
  /** Suspeita no começo do dia e de onde veio a de hoje (só a positiva). */
  private susStart = 0;
  private susLog: Partial<Record<SusSource, number>> = {};
  /** Suspeita recente por fonte (decai em ~1 s): setas da barra. */
  private susRecent: Partial<Record<SusSource, number>> = {};
  /** Internet caiu (s restantes) e reunião surpresa (fase e tempo). */
  internetT = 0;
  meetingCall: { t: number; phase: 'gather' | 'stay' } | null = null;
  /** Comida na cozinha (pizza ou bolo do aniversário) e quando o Dono julga a pizza. */
  feast: 'pizza' | 'bolo' = 'pizza';
  private pizzaJudgeAt = -1;
  /** Multi: avisos do fantasma (posição do chefe) que aparecem para todos. */
  pings: { pos: THREE.Vector3; t: number; by: string }[] = [];
  private pingCd = 0;
  /** Clientes do dia (chegam pelo elevador e prendem o chefe na sala). */
  readonly clients: Clients;
  /** Agenda do chefe (compromissos com hora, no quadro ao lado da sala dele). */
  readonly agenda: Agenda;
  /** Distrações do mapa (impressora, rádio, viva-voz, alarme): o jogador cria a brecha. */
  readonly distract: Distractions;
  /** Itens de missão no mundo (grampeador, aquário) e a missão grande do dia. */
  readonly items: Items;
  readonly missions: Missions;
  /** Painel dos minigames (v0.10): toda tarefa vira um minigame rápido no centro da tela. */
  readonly minigame: MinigamePanel;
  /** Vigilância do chefe (câmeras, sensor, sala trancada) e a carreira entre runs. */
  readonly surv: Surveillance;
  readonly career = new Career();
  /** O relógio do salão já foi adiantado hoje (missão). */
  clockGained = false;
  /** Elevador no meio do expediente (missão do salgadinho): segundos até chegar e para onde. */
  private rideT = 0;
  private rideToLobby = false;
  /** Figurantes do térreo (recepção, segurança, lojinha, quem passa). */
  readonly lobbyCrowd: LobbyCrowd;
  /** Hall: contagem da porta do elevador fechando (subir de manhã / abrir à noite) e o resultado do dia guardado para depois das compras. */
  private lobbyRide = -1;
  private eveningRes: DayResult | null = null;
  stock = { ...STOCK, ...WALK_STOCK };
  tiroCooldown = 0;
  headphones = false;
  coffeeMachineCd = 0;
  coffeePlayerCd = 0;
  onDayEnd: ((r: DayResult) => void) | null = null;
  onPause: (() => void) | null = null;
  allFiredPending = false;
  /** Começo do dia no elevador (relógio parado) ou expediente rolando. */
  phase: 'lobby' | 'elevator' | 'play' | 'leaving' | 'evening' = 'play';
  /** 18:00: indo para o elevador (0), dentro esperando a porta (1), descendo (2); e o tempo na etapa. */
  private leaveStage = 0;
  private leaveT = 0;
  private elevT = 0;
  /** Multiplayer: sala ativa (null = solo com bots). */
  net: Multi | null = null;
  /** Contagem do elevador depois que todos marcam pronto (-1 = esperando). */
  private netCount = -1;
  private netWarned = new Set<Worker>();
  private elevSkip = 0;
  private elevDinged = false;
  /** Shader dos espelhos das cabines já compilado. */
  private mirrorsWarm = false;
  private elevCloseT = 0;
  /** Tutorial do chefe no elevador (só no 1º dia, se ligado) e a fala atual (-1 = calado). */
  private elevTalking = false;
  private elevTalkIdx = -1;
  private elevSpeaker!: Boss;
  private elevScript: { t: number; say: string }[] | null = null;
  private thunderT = 12;
  /** Pulso de dessaturação quando a porta do chefe abre. */
  private desatPulse = 0;
  private pigeonFun = 0;
  /** Mascote do menu (segue o mouse com os olhos). */
  readonly mascot: Ball;
  readonly tasks: TaskDirector;
  /** Cofre da run (Vale-Diversão e o que foi comprado nas vendinhas do hall). */
  readonly shop = new Shop();
  get wallet() {
    return this.shop.wallet;
  }
  set wallet(v: number) {
    this.shop.wallet = v;
  }
  /** Usos por dia dos itens de 1×/dia (um por cópia). */
  private postitLeft = 0;
  private postitActive = false;
  private ramalLeft = 0;
  /** Visita: recarga da conversa com o chefe. */
  private visitCd = 0;
  private screen2Left = 0;
  private cupomLeft = 0;
  private cupomT = 0;
  /** Ramal falso com o chefe na sala: até quando ele não sai. */
  private ramalHold = -1;
  /** Truques do chefe ativos hoje. */
  tricks = new Set<TrickId>();
  /** Truque "volta rápida": quando ele sai de novo ("esqueci uma coisa"). */
  private comeBackAt = -1;
  /** Truque "câmera na copa": ciclo de gravação. */
  private camT = 0;
  /** Prêmio do assalto de hoje. */
  prize = HEIST_PRIZES[0];
  /** Retrato do chefe para o bilhete da ligação (gerado no início). */
  private bossPortrait: string | null = null;

  private attractT = 0;
  printerJam = 0;
  private blackoutT = 0;
  lightLevel = 1;
  pizzaLeft = 0;
  private pizzaJudgePending = false;
  private firedReason = '';
  private allFiredT = -1;
  private dayClutches = 0;
  private funAccum = 0;
  private heartbeatT = 0;
  private noiseT = 0;
  private screenT = 0;
  private flashLight = 0;
  private flashColor = new THREE.Color();
  private tipIdx = 0;
  private tipT = 0;
  private prevTiroState = 'menu';
  private physicalWarned = false;
  private wanderWarned = false;
  private bossBumpT = -99;
  /** Assalto: a rosquinha na mesa do chefe e se você estava dentro da sala no quadro anterior. */
  private heistPrize!: THREE.Mesh;
  private wasInBossRoom = false;
  private loops: Record<string, LoopSound | null | undefined> = {};

  constructor(
    readonly r: Renderer,
    readonly audio: AudioEngine,
    readonly input: Input,
    readonly juice: Juice,
    readonly office: Office,
    readonly hud: HUD,
    readonly settings: Settings,
  ) {
    // os banheiros entram pela porta de 1,2 m: do lado de fora até 1 m para dentro
    const baths = office.baths.map((b): [THREE.Vector3, THREE.Vector3] => [b.out.clone(), b.entry.clone().add(new THREE.Vector3(0, 0, -1))]);
    this.nav = new Nav(office.colliders, 0.42, baths);
    office.desks.forEach((d, i) => {
      const p = PEOPLE[i];
      const ball = new Ball('employee', i === 0 ? this.playerLook() : p.look);
      const w = new Worker(i, i === 0 ? settings.name || 'Você' : p.name, i === 0, d, ball);
      this.allWorkers.push(w);
      r.scene.add(ball.root);
    });
    this.player = this.allWorkers[0];
    this.chefe = new Boss('chefe', this.bossSpec(bossDay(0)), this, W(10, 1.15));
    // em pé ao lado da mesa do chefe (nos dias de X9 os dois ficam na sala)
    this.x9 = new Boss('x9', this.bossSpec(X9_DAY), this, W(11.9, 1.3));
    this.dono = new Boss('dono', { speed: DONO.speed, identify: 0.5, check: 3, warn: DONO.warn }, this, W(8.3, 2.9));
    for (const b of [this.chefe, this.x9, this.dono]) r.scene.add(b.ball.root);
    // cada mesa com a cara de quem senta nela
    office.desks.forEach((d, i) => {
      const look = i === 0 ? this.playerLook() : PEOPLE[i].look;
      office.setDeskTheme(d, look.variant ?? 'voce', look.color);
    });
    this.computer = new Computer(this.hostAdapter());
    this.bots = new Bots(this);
    this.mascot = new Ball('employee', this.playerLook());
    this.mascot.root.visible = false;
    r.scene.add(this.mascot.root);
    this.pc = new Player(this);
    // assalto do dia: a rosquinha na mesa do chefe
    const donut = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.04, 10, 20), new THREE.MeshStandardMaterial({ color: '#f29bc0', roughness: 0.6 }));
    donut.rotation.x = Math.PI / 2;
    donut.position.copy(W(10.7, 2.25, 1.24));
    donut.castShadow = true;
    r.scene.add(donut);
    this.heistPrize = donut;
    this.tasks = new TaskDirector(this);
    this.agenda = new Agenda(this);
    this.distract = new Distractions(this);
    this.items = new Items(this);
    this.missions = new Missions(this);
    this.minigame = new MinigamePanel(input, audio);
    this.surv = new Surveillance(this);
    this.career.onUnlock = (names) => this.hud.popup('good', '🔓 DESBLOQUEADO', `nova missão no sorteio: ${names.join(', ')}`);
    this.clients = new Clients(this);
    this.lobbyCrowd = new LobbyCrowd(this);
    void portraits([KIND_LOOK.boss], 160).then((u) => (this.bossPortrait = u[0] ?? null));
    this.input.onBlur = () => {
      if (this.running && this.computer.forbiddenOpen && this.pc.mode === 'seated') {
        this.computer.open(this.computer.home, this.time);
        this.computer.lastSafeSwitch = -99;
      }
    };
    document.addEventListener('pointerlockchange', () => {
      // ESC saiu do cursor travado no meio do dia → pausa
      const lockedModes = ['walk', 'seated', 'chair', 'nap', 'ghost', 'hide', 'meeting'];
      if (!document.pointerLockElement && this.running && !this.paused && lockedModes.includes(this.pc.mode) && !this.unlockingOnPurpose) this.onPause?.();
    });
  }
  unlockingOnPurpose = false;

  private hostAdapter() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      emit: (e: AppEvent) => g.onAppEvent(e),
      get stock() {
        return g.stock;
      },
      get tiroCooldown() {
        return g.tiroCooldown;
      },
      get headphones() {
        return g.headphones;
      },
      get workSpeed() {
        return Math.pow(SHOP_FX.workSpeed, g.shop.count('energetico'));
      },
      get arena() {
        return g.missions.lanOn ? g.arenaLink : null;
      },
    };
  }

  private bossSpec(d: BossDay) {
    return { speed: d.speed, identify: d.identify, check: d.check, warn: d.warn };
  }

  /** Escala dos tempos escritos para o dia de 5 min (eventos, rondas). */
  get k() {
    return this.duration / B.BASE_DAY;
  }

  /** Calmaria depois do elevador (s): nada sai, toca nem acumula instinto. */
  get calm() {
    return this.dayIndex === 0 ? PRESSURE.calmFirstDay : PRESSURE.calm;
  }

  /** Está se divertindo agora (o remoto conta pela atividade que manda). */
  funNow(w: Worker) {
    return !!w.act || (w === this.player && this.time - this.lastFunT < PRESSURE.liveHold);
  }

  /** Pressão de um jogador (0–1): tempo do dia (até `timeMax`) + FUN de hoje + bônus enquanto se diverte. Zero na calmaria. */
  pressureOf(w: Worker | null) {
    const P = PRESSURE;
    const calm = this.calm;
    if (this.time < calm) return 0;
    const p = P.timeMax * Math.min(1, (this.time - calm) / Math.max(1, this.duration - calm));
    if (!w || w.fired) return p;
    return Math.min(1, p + P.funMax * Math.min(1, w.fun / P.funFull) + (this.funNow(w) ? P.live : 0));
  }

  /** Pressão da sala (ronda e eventos): a maior entre os jogadores. */
  get pressure() {
    const humans = this.workers.filter((w) => (w.isPlayer || w.remote) && !w.fired);
    return humans.length ? Math.max(...humans.map((w) => this.pressureOf(w))) : this.pressureOf(null);
  }

  /** v0.9+: o telefone não toca mais sozinho (o trabalho do dia é a pauta). */
  phoneRolls(_dt: number) {
    return false;
  }

  /** Papo com o chefe: segundos guardados (trabalho feito) e a fração até a próxima tarefa. */
  talkBank = 0;
  private talkBar = 0;

  /** Trabalho feito enche o banco de papo (`PAPO.perTask` s por tarefa, até `PAPO.max`). */
  workCredit(v: number) {
    if (this.player.fired) return;
    this.talkBar += v;
    while (this.talkBar >= 1) {
      this.talkBar -= 1;
      if (this.talkBank >= PAPO.max) continue;
      this.talkBank = Math.min(PAPO.max, this.talkBank + PAPO.perTask);
      const msg = `💬 +${PAPO.perTask} s de papo com o chefe (${Math.round(this.talkBank)} s)`;
      if (this.pc.mode === 'seated') this.computer.toast(msg);
      else this.hud.toastWorld(msg);
      this.audio.play('coin', 0.5);
    }
  }

  /** E perto de uma chefia: puxa conversa e gasta o banco (ela para, virada para você). */
  startTalk(b: Boss) {
    const secs = Math.floor(this.talkBank);
    if (secs < PAPO.min) return;
    this.talkBank = 0;
    this.audio.play('chat', 0.7);
    if (this.auth) {
      b.talk(this.player, secs);
      if (!b.out) this.holdBoss(secs);
    } else this.net?.act(`p:${b.kind}:${secs}`);
    this.hud.toastWorld(`💬 papo com o chefe: ${secs} s — os colegas atrás dele estão livres`);
  }

  /** Host: um convidado puxou papo. */
  netTalk(w: Worker, kind: string, secs: number) {
    const b = this.bosses.find((x) => x.kind === kind && x.ball.root.visible);
    // a posição do convidado chega com atraso (rede): folga de 2 m
    if (!b || w.ball.pos.distanceTo(b.pos) > PAPO.range + 2) return;
    b.talk(w, Math.min(PAPO.max, secs));
    if (!b.out) this.holdBoss(secs);
  }

  /** Curva da run: multiplica toda Suspeita de hoje. */
  get mul() {
    return runMul(this.dayIndex);
  }

  // ------------------------------------------------------------------ vitrine (menu)
  startAttract() {
    this.attract = true;
    this.running = false;
    this.workers.length = 0;
    this.bots.reset();
    for (const w of this.allWorkers) {
      w.resetDay(10);
      w.ball.root.visible = true;
      w.ball.setGhost(false);
      w.ball.setEye('normal');
      this.seatBall(w);
      this.workers.push(w);
    }
    this.bosses = [this.chefe];
    this.chefe.spec = this.bossSpec(bossDay(0));
    this.x9.ball.root.visible = false;
    this.dono.ball.root.visible = false;
    this.chefe.ball.root.visible = true;
    this.chefe.reset();
    this.chefe.lastRondaEnd = -10;
    this.office.setLights(1);
    this.office.setWeather('sol');
    this.office.pizzaGroup.visible = false;
    this.office.secCam.visible = false;
    this.time = 0;
    this.hud.show(false);
    this.attractT = 0;
    this.mascot.root.visible = true;
    this.mascot.setEye('normal');
    this.audio.startMusic('menu');
    for (const l of ['typing', 'video', 'cooler']) this.loops[l]?.setVol(0);
  }

  // ------------------------------------------------------------------ run
  /** Nova run: dias sem fim, Suspeita de todos zerada, vale e lojinha do zero. */
  newRun() {
    this.shop.reset();
    this.dayIndex = 0;
    this.results = [];
    this.runFun = 0;
    this.strikes = 0;
    this.fixedDebt = 0;
    this.prevEvent = null;
    for (const w of this.allWorkers) w.sus = 0;
  }

  get dayName() {
    return dayTitle(this.dayIndex);
  }

  /** Eventos do dia: 1 sorteado (diferente do de ontem), com chance de tocar de novo que cresce com os dias. */
  private planEvents() {
    const pool = EVENT_IDS.filter((e) => e !== this.prevEvent && !(e === 'reuniao' && this.dayIndex === 0) && !(e === 'ronda' && this.dayIndex === 0));
    const id = pool[Math.floor(Math.random() * pool.length)];
    this.prevEvent = id;
    const T = EVENT_TIMING;
    const at = (r: readonly [number, number]) => (r[0] + Math.random() * (r[1] - r[0])) * this.duration;
    this.eventPlan = [{ id, at: T.due * this.duration, fired: false, roll: true }];
    if (Math.random() < Math.min(T.secondMax, T.secondBase + T.secondPerDay * this.dayIndex)) this.eventPlan.push({ id, at: at(T.second), fired: false });
    this.dayEvents = this.eventPlan.map((e) => e.id);
  }

  /** Cliente: o host decidiu os eventos de hoje. */
  setDayEvents(ids: EventId[]) {
    if (!ids.length || ids.join() === this.dayEvents.join()) return;
    const bossesOf = (e: EventId[]) => `${e.includes('ronda')}|${e.includes('pizza')}`;
    const changed = bossesOf(ids) !== bossesOf(this.dayEvents);
    this.dayEvents = ids;
    this.eventPlan = [];
    this.feast = ids.includes('bolo') ? 'bolo' : 'pizza';
    // o host sorteou outro evento: a chefia do dia (X9, Dono) pode ter mudado
    if (changed && (this.phase === 'elevator' || this.phase === 'lobby')) {
      this.setupBosses();
      this.placeBossesInElevator(this.workers.filter((w) => !w.isPlayer).length, new THREE.Vector3(0, 0, this.phase === 'lobby' ? LOBBY_DZ : 0));
    }
    this.drawBoards();
  }

  /** Cliente: o host decidiu o clima de hoje. */
  setWeather(w: Weather) {
    if (w === this.weather) return;
    this.weather = w;
    this.office.setWeather(w);
    // o sorteio foi feito com o clima local; se o host trouxe chuva, os pombos somem e a diversão deles também
    if (w === 'chuva' && this.funTasks.some((f) => f.id === 'vidro')) {
      this.rollFun();
      this.computer.setFun(this.pcGamesToday());
      this.drawBoards();
    }
  }

  /** Diversões do dia: 1 grande + 3 pequenas (no 1º dia com tutorial a grande é o Ball Ops). No multi cada jogador sorteia as suas. */
  private rollFun() {
    const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
    // v0.9: 2 missões pequenas por pessoa (na chuva os pombos não pousam no parapeito)
    const small = shuffle(MISSION_SMALL.filter((f) => f !== 'vidro' || this.weather !== 'chuva')).slice(0, SMALL_DAY.count);
    this.funTasks = small.map((id) => {
      const f = FUN_TASKS[id];
      return { id, label: f.label, icon: f.icon, big: f.big, goal: f.goal, prog: 0, done: false };
    });
  }


  /** Jogos do PC que são tarefa de hoje: só esses aparecem na barra do BossOS. */
  private pcGamesToday(): AppId[] {
    // v0.9: os jogos do PC ficam todos liberados (a diversão de mesa é a ganância barata)
    return ['tiro', 'pesca', 'video'];
  }

  /**
   * Jogos do PC só valem se forem a tarefa do dia (os outros ficam trancados);
   * as diversões fora do PC valem todo dia — as sorteadas só pagam Vale a mais.
   */
  canFun(_id: FunId) {
    return true;
  }

  /** Colegas por perto e fora da mesa (juntos rende mais e faz mais barulho). */
  companions(w: Worker) {
    if (w.seated) return 0;
    let n = 0;
    for (const o of this.workers) if (o !== w && !o.fired && !o.seated && o.ball.root.visible && o.ball.pos.distanceTo(w.ball.pos) < SOCIAL.radius) n++;
    return Math.min(SOCIAL.maxPeople, n);
  }

  /**
   * Disfarçado (sentado no trabalho, numa tarefa do chefe, com algo dele na mão), exposto (qualquer diversão, ou dentro
   * da sala do chefe) ou à toa (em pé sem motivo). O FUN vem do tempo exposto; o chefe só estranha o exposto e o à toa.
   */
  get cover(): 'disfarcado' | 'exposto' | 'atoa' {
    const p = this.player;
    const pc = this.pc;
    if (p.act || p.physical || this.office.inBossRoom(p.ball.pos) || (pc.mode === 'seated' && this.computer.forbiddenOpen)) return 'exposto';
    if (pc.mode === 'seated' || pc.mode === 'meeting' || pc.mode === 'hide') return 'disfarcado';
    // conversando com o chefe ou num minigame de trabalho (xerox, arquivo): trabalhando
    if (this.bosses.some((b) => b.talkW === p) || (this.minigame.open && pc.workPanel)) return 'disfarcado';
    if (pc.carrying || this.tasks.active.length > 0 || this.meetingCall || this.shop.has('prancheta')) return 'disfarcado';
    return 'atoa';
  }

  /** Bolinhas de papel: liberadas se alguma diversão de hoje usa papel. */
  get paperAllowed() {
    return this.canFun('cestas') || this.canFun('bonk') || this.canFun('bonkChefe');
  }

  /** Progresso numa diversão do dia (FUN ganho nas grandes, usos nas pequenas). */
  funProgress(id: FunId, v = 1) {
    if (this.attract || this.player.fired) return;
    const f = this.funTasks.find((x) => x.id === id);
    if (!f || f.done) return;
    f.prog = Math.min(f.goal, f.prog + v);
    if (f.prog < f.goal) return;
    f.done = true;
    const vd = SMALL_DAY.vd;
    this.missionFun(MISSIONS.smallFun, f.label);
    // multi: o cofre é do time (o host soma e avisa todo mundo)
    if (this.net && !this.net.isHost) this.net.vale(vd);
    else {
      this.wallet += vd;
      this.net?.syncShop();
    }
    this.dayVd += vd;
    const all = this.funTasks.every((x) => x.done);
    this.hud.popup('good', all ? '🎉 AS DUAS PEQUENAS!' : `✔ ${f.label.toUpperCase()}`, `missão pequena feita · +${MISSIONS.smallFun} FUN · +${vd} de vale`);
    this.audio.play(all ? 'fanfare' : 'coin', 0.6);
    if (all)
      for (const o of this.workers)
        if (!o.isPlayer && !o.fired) {
          o.danceT = 2.2;
          this.juice.text(o.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), '🎉', 'ft-emote', 1.6);
        }
  }

  /** Quadro branco e painel do elevador com o que vale hoje. */
  drawBoards() {
    const f = FIXED[this.tasks.fixed.kind];
    const ev = this.dayEvents[0];
    // o quadro ao lado da sala do chefe é a agenda dele (o próximo compromisso fica marcado)
    const ag = this.agenda.lines();
    const next = this.agenda.nextIdx;
    this.office.drawWhiteboard(['AGENDA DO CHEFE', ...(ag.length ? ag : [this.dayName, `Fixa: ${f.label}`])], next >= 0 ? next + 1 : -1);
    this.office.drawElevatorPanel(
      this.dayName,
      `${f.icon} ${f.label}: ${f.quota} ${f.unit}`,
      ev ? EVENTS[ev].name : '—',
      ev ? EVENTS[ev].desc : '',
      [`★ ${this.missions.spec.name}`, ...this.funTasks.map((x) => `• ${x.label}`)],
    );
  }

  startDay(i: number) {
    this.attract = false;
    this.mascot.root.visible = false;
    this.dayIndex = i;
    this.duration = B.DAY_DURATION;
    this.clockGained = false;
    this.rideT = 0;
    this.hasCoat = false;
    for (const w of this.allWorkers) {
      w.coatUntil = -1;
      this.showCoat(w, false);
    }
    this.time = 0;
    this.instinct = 0;
    this.lastFunT = -99;
    this.running = true;
    this.paused = false;
    this.stock = { ...STOCK, ...WALK_STOCK };
    this.tiroCooldown = 0;
    this.headphones = false;
    this.player.ball.setHeadphones(false);
    this.audio.stepMul = 1;
    this.audio.doorMul = 1;
    this.coffeeMachineCd = 0;
    this.coffeePlayerCd = 0;
    this.printerJam = 0;
    this.blackout = false;
    this.blackoutT = 0;
    this.lightLevel = 1;
    this.office.setLights(1);
    // multi: quem manda nos eventos e no clima é o host; o cliente só segue o que ele sorteou
    const follow = !!this.net && !this.net.isHost && this.net.hostDay === i && this.net.hostEvents.length > 0;
    if (follow) {
      this.dayEvents = [...this.net!.hostEvents];
      this.eventPlan = [];
    } else this.planEvents();
    // clima sorteado (o blecaute sempre vem com tempestade)
    this.weather = follow ? WEATHERS[this.net!.hostWeather] : this.dayEvents.includes('blecaute') ? 'chuva' : WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
    this.office.setWeather(this.weather);
    this.thunderT = 8 + Math.random() * 8;
    this.pigeonFun = 0;
    const pl = this.playerLook();
    this.office.setDeskTheme(this.player.desk, pl.variant ?? 'voce', pl.color);
    this.pizzaLeft = 0;
    this.pizzaJudgeAt = -1;
    this.pizzaJudgePending = false;
    this.feast = this.dayEvents.includes('bolo') ? 'bolo' : 'pizza';
    this.office.pizzaGroup.visible = false;
    this.office.pizzaSlices.forEach((s) => (s.visible = true));
    this.office.secCam.visible = false;
    this.internetT = 0;
    this.computer.offline = false;
    this.meetingCall = null;
    // v0.9: o assalto virou a missão do dia (grampeador / aquário); a rosquinha some
    this.heistPrize.visible = false;
    this.wasInBossRoom = false;
    this.pings = [];
    this.firedReason = '';
    this.allFiredT = -1;
    this.allFiredPending = false;
    this.dayClutches = 0;
    this.dayVd = 0;
    this.talkBank = 0;
    this.talkBar = 0;
    this.susLog = {};
    this.susRecent = {};
    this.tipIdx = 0;
    this.tipT = 0;
    this.physicalWarned = false;
    this.wanderWarned = false;
    this.prevTiroState = 'menu';
    this.setLed(this.office.printerLight, '#3ddc97');
    this.setLed(this.office.breakerLight, '#3ddc97');
    this.bots.reset();
    this.workers.length = 0;
    for (const w of this.allWorkers) {
      const active = w.isPlayer || (this.net ? !!w.remote : ACTIVE_BOTS.includes(w.id));
      w.ball.root.visible = active;
      if (!active) continue;
      // a barra de Suspeita passa de um dia para o outro (o fim do dia já descontou e somou o que devia)
      w.resetDay(w.sus);
      w.bored = false;
      w.ball.setGhost(false);
      w.ball.setEye('normal');
      w.ball.lying = 0;
      w.ball.setSleeping(false);
      w.desk.crumbs.visible = false;
      w.desk.puddle.visible = false;
      this.seatBall(w);
      this.workers.push(w);
    }
    this.player.ball.setCrown(false);
    this.setupBosses();
    this.rollFun();
    this.computer.resetDay(this.pcGamesToday());
    this.computer.onSwitch = (from, to) => this.onSwitch(from, to);
    this.pc.resetDay();
    // multi: sem vidas, você assiste o resto da run como fantasma (os amigos seguem jogando)
    if (this.net && this.outOfLives) {
      this.player.fired = true;
      this.player.ball.setGhost(true);
      this.firedReason = 'sem vidas';
    }
    this.tasks.resetDay();
    this.distract.resetDay();
    this.setPrinterLed(false);
    this.postitLeft = this.shop.count('postit');
    this.postitActive = false;
    this.ramalLeft = this.shop.count('ramal');
    this.screen2Left = this.shop.count('segundaTela');
    this.cupomLeft = this.shop.count('cupom');
    this.cupomT = 0;
    this.ramalHold = -1;
    this.comeBackAt = -1;
    this.camT = 0;
    this.tricks = new Set(tricksOn(this.dayIndex).map((t) => t.id));
    this.office.copaCam.visible = this.tricks.has('camera');
    this.prize = HEIST_PRIZES[this.dayIndex % HEIST_PRIZES.length];
    (this.heistPrize.material as THREE.MeshStandardMaterial).color.set(this.prize.color);
    const ex = this.office.extras;
    ex.plant.visible = this.shop.has('planta');
    ex.mirror.visible = false;
    ex.postit.visible = false;
    this.susStart = this.player.sus;
    this.lostToday = '';
    this.susFx.clear();
    this.hud.show(true);
    this.hud.setBanner(null);
    this.hud.ghost(null);
    this.ensureLoops();
    this.audio.tension = 0;
    // no convidado a lista é só espelho do host: zera a cada dia
    // a agenda do dia sai do host (o convidado recebe pronta na mensagem da lojinha); os clientes chegam na hora dela
    const nClients = this.auth ? Math.min(CLIENTS.maxPerDay, CLIENTS.perDay + this.shop.count('panfleto') * CLIENTS.flyerBonus) : 0;
    if (this.auth) {
      this.agenda.roll(this.dayIndex, nClients);
      this.surv.resetDay(this.dayIndex);
      this.missions.roll(this.dayIndex, this.career.unlocked());
    } else {
      this.surv.resetDay(this.dayIndex);
      this.agenda.items = [];
      this.planKey = '';
      const plan = this.net?.hostPlan;
      if (plan && plan.day === i) this.applyPlan(plan);
    }
    this.clients.resetDay(nClients, this.agenda.clientTimes());
    this.drawBoards();
    this.net?.syncShop();
    this.enterLobby();
  }

  /** Plano do dia que o host decide e manda para todos (agenda; missões). */
  dayPlan(): DayPlanNet {
    return { day: this.dayIndex, ag: this.agenda.net(), ms: this.missions.plan(), sv: this.surv.plan() };
  }

  /** Último plano aplicado: ele chega de novo a cada sincronia do cofre, e reaplicar zeraria a missão do dia. */
  private planKey = '';

  /** Convidado: aplica o plano do dia que o host mandou (uma vez por dia). */
  applyPlan(p: DayPlanNet) {
    const key = JSON.stringify(p);
    if (key === this.planKey) return;
    this.planKey = key;
    this.agenda.apply(p.ag as Parameters<Agenda['apply']>[0]);
    if (p.ms) this.missions.applyPlan(p.ms as MissionPlan);
    if (p.sv) this.surv.applyPlan(p.sv as [string, number]);
    this.drawBoards();
  }

  // ------------------------------------------------------------------ hall de entrada
  /** Começo do dia no térreo: você entra pela porta da rua e pega o elevador; quem manda hoje espera lá dentro. */
  private enterLobby() {
    const o = this.office;
    this.phase = 'lobby';
    this.lobbyRide = -1;
    o.lobby.open = 1;
    o.elevatorOpen = 0;
    this.pc.placeAt(W(15, LOBBY.south - 1.4), 0);
    // o time e o chefe já esperam na cabine de baixo, nos mesmos lugares da de cima: a subida não mexe em ninguém
    this.placeElevatorCast(LOBBY_DZ);
    o.setElevatorFloor(0, true);
    o.lobby.slots.forEach((s, i) => {
      this.shop.drawClosed(s.ctx, i);
      s.tex.needsUpdate = true;
    });
    this.drawBoards();
    this.audio.startMusic('elevator');
    this.hud.elevator(true);
    this.hud.say('', null);
  }

  /** A porta da cabine de baixo fechou: sobe (mesmo lugar na cabine de cima) e começa o elevador com o chefe. */
  private rideUp() {
    this.shiftCabin(-LOBBY_DZ, (p) => this.office.inLobbyCabin(p));
    this.office.lobby.open = 0;
    this.enterElevator(true);
  }

  /**
   * As duas cabines são a mesma, em dois lugares: quem está dentro de uma (`inside`) muda para a outra somando `dz`
   * (planta) — jogador, câmera, colegas e chefias, cada um na mesma pose. Quem ficou fora some (foi de escada).
   */
  private shiftCabin(dz: number, inside: (p: THREE.Vector3) => boolean) {
    this.player.ball.pos.z += dz;
    this.pc.camPos.z += dz;
    for (const w of this.workers) {
      if (w.isPlayer || w.remote) continue;
      if (inside(w.ball.pos)) {
        w.ball.pos.z += dz;
        for (const q of w.botPath) q.z += dz;
      } else if (dz < 0) w.ball.root.visible = false;
    }
    for (const b of [this.chefe, this.x9, this.dono])
      if (b.ball.root.visible && inside(b.ball.pos)) b.ball.pos.z += dz;
  }

  /** Colegas e chefias nos lugares da cabine; `dz` (planta) = 0 lá em cima, `LOBBY_DZ` no térreo. */
  private placeElevatorCast(dz: number) {
    const off = new THREE.Vector3(0, 0, dz);
    let k = 0;
    for (const w of this.workers) if (!w.isPlayer) this.bots.waitInElevator(w, ELEV_SPOTS[k++].clone().add(off));
    this.placeBossesInElevator(k, off);
  }

  /** 18:00: o expediente acaba ali mesmo; a porta do elevador abre e todo mundo vai embora andando (o chefe volta para a sala). */
  private enterLeaving(res: DayResult) {
    const o = this.office;
    // 18:00 com alguém no térreo (salgadinho): sobe direto para a saída
    if (o.inLobby(this.player.ball.pos) || o.inLobbyCabin(this.player.ball.pos)) {
      this.player.ball.pos.z -= LOBBY_DZ;
      this.pc.camPos.z -= LOBBY_DZ;
    }
    this.rideT = 0;
    this.minigame.close(true);
    this.eveningRes = res;
    this.running = true;
    this.phase = 'leaving';
    this.leaveStage = 0;
    this.leaveT = 0;
    this.tasks.closePicker();
    this.pc.dropCarry();
    this.distract.resetDay();
    for (const w of this.workers) this.items.dropAll(w);
    this.meetingCall = null;
    if (this.pc.mode === 'nap' || this.pc.mode === 'chair') this.pc.bail();
    if (this.player.fired) {
      // demitido não atravessa paredes na saída: aparece na porta do elevador, cabisbaixo
      this.player.ball.setGhost(false);
      this.player.ball.setEye('bored');
      if (this.pc.mode === 'ghost' || this.pc.mode === 'cinematic') this.pc.placeAt(W(15, ELEV_F + 1.8), 0);
    }
    this.pc.setMode('walk');
    this.input.lock();
    this.bots.goHome();
    for (const b of [this.chefe, this.x9, this.dono]) if (b.ball.root.visible) b.goHomeQuiet();
    this.loops.alarm?.stop();
    this.loops.alarm = null;
    o.elevatorOpen = 1;
    o.setElevatorFloor(12, false);
    this.hud.show(true);
    // acabou o expediente: some o painel de jogo (suspeita, tarefas, FUN), fica só o objetivo
    this.hud.elevator(true);
    this.hud.setBanner(null);
    this.hud.say('', null);
    this.audio.stopMusic();
  }

  private updateLeaving(dt: number, realDt: number) {
    const o = this.office;
    const p = this.player;
    this.updateWeather(dt);
    this.bots.update(dt);
    for (const b of [this.chefe, this.x9, this.dono])
      if (b.ball.root.visible) {
        if (b.state === 'leave') b.update(dt);
        else b.ball.update(dt);
      }
    this.pc.update(dt, realDt);
    this.separateBalls();
    const inside = o.inElevator(p.ball.pos);
    this.leaveT += realDt;
    if (this.leaveStage === 0) {
      o.elevatorOpen = 1;
      if (inside) {
        this.leaveStage = 1;
        this.leaveT = 0;
      }
    } else if (this.leaveStage === 1) {
      // segura a porta para quem ainda vem vindo (no máximo uns segundos: quem não chegou vai de escada)
      const coming = this.workers.some((w) => !w.isPlayer && !w.remote && w.botState === 'goingHome' && w.ball.root.visible);
      if (!inside) this.leaveStage = 0;
      else if (this.leaveT > 1.4 && (!coming || this.leaveT > 6)) {
        this.leaveStage = 2;
        this.leaveT = 0;
        o.elevatorOpen = 0;
        this.audio.play3D('ding', o.P.elevatorDoor, 0.5);
        this.audio.startMusic('elevator');
      }
    } else {
      const k = THREE.MathUtils.clamp((this.leaveT - 1.2) / 3, 0, 1);
      o.setElevatorFloor(Math.round(12 * (1 - k)), false);
      if (this.leaveT > 4.6) return this.rideDown();
    }
    const lives = RUN.lives - this.strikes;
    this.hud.setClock(1, this.dayName, this.leaveStage === 2 ? 'descendo…' : 'saída');
    if (this.leaveStage === 2) this.hud.goal('🛗 DESCENDO', 'Térreo em instantes. A <b>Lojinha</b> aceita o seu Vale-Diversão.', 'tut');
    else this.hud.goal('🕕 18:00 · EXPEDIENTE ENCERRADO', `Ninguém está olhando mais. Pegue o <b>elevador</b> para descer ao térreo.<br><small>💰 ${this.wallet} de vale · ${lives} ${lives === 1 ? 'vida' : 'vidas'}</small>`, 'tut');
    this.projectMarkers(this.leaveStage === 0 ? [{ pos: o.P.elevatorOut.clone().setY(3.0), icon: '⬇', text: 'elevador' }] : []);
    this.hud.update(realDt);
    if (this.input.pressed('KeyP') || (this.input.pressed('Escape') && !this.input.locked)) this.onPause?.();
  }

  /** A porta de cima fechou com você dentro: desce (a mesma cabine, lá embaixo) e começa a noite no hall. */
  private rideDown() {
    this.shiftCabin(LOBBY_DZ, (q) => this.office.inElevator(q));
    this.office.elevatorOpen = 0;
    this.enterEvening();
  }

  /** Térreo à noite: a porta da cabine abre, a lojinha está aberta e a porta da rua leva para casa (o relatório). */
  private enterEvening() {
    const o = this.office;
    this.running = true;
    this.phase = 'evening';
    o.lobby.open = 0;
    o.setElevatorFloor(0, false);
    this.lobbyRide = 0.9;
    this.shop.roll(this.dayIndex);
    this.drawSlots();
    this.hud.show(true);
    this.hud.elevator(true);
    this.hud.setBanner(null);
    this.hud.say('', null);
    this.audio.startMusic('elevator');
  }

  /** Vitrines das vendinhas (as ofertas da noite). */
  drawSlots() {
    this.office.lobby.slots.forEach((s, i) => {
      this.shop.drawSlot(s.ctx, this.shop.offers[i] ?? null);
      s.tex.needsUpdate = true;
    });
  }

  /** Comprar a oferta `i` (no multi, o host decide: o cofre é do time). */
  private buyOffer(i: number) {
    const id = this.shop.offers[i];
    if (!id) return;
    if (this.net && !this.net.isHost) return this.net.buy(id);
    const r = this.shop.buy(id);
    if (r !== true) {
      this.hud.toastWorld(`💰 ${r}`);
      this.audio.play('miss', 0.6);
      return;
    }
    this.onBought(id, true);
    this.net?.syncShop();
  }

  /** Compra confirmada (`mine`: foi você quem comprou). */
  onBought(id: string, mine: boolean) {
    const s = this.shop.spec(id as Parameters<Shop['spec']>[0]);
    if (mine) {
      if (id === 'atestado') {
        if (!this.net) this.strikes = Math.max(0, this.strikes - 1);
        this.hud.popup('good', '🩺 ATESTADO', '+1 vida');
      } else this.hud.toastWorld(`${s.icon} ${s.name}: comprado!`);
      this.audio.play('coin', 0.9);
      this.juice.confetti(this.player.ball.headWorld().add(new THREE.Vector3(0, 0.4, 0)), 30, 3);
    }
    this.drawSlots();
  }

  /** Sair pela porta da rua: acaba o dia (relatório). */
  private goHome() {
    const res = this.eveningRes;
    if (!res) return;
    this.eveningRes = null;
    this.running = false;
    this.phase = 'play';
    this.unlockingOnPurpose = true;
    this.input.unlock();
    setTimeout(() => (this.unlockingOnPurpose = false), 200);
    res.wallet = this.wallet;
    this.hud.show(false);
    this.audio.play('door', 0.5);
    this.onDayEnd?.(res);
  }

  /** O que dá para fazer no hall: as vitrines (à noite) e a porta da rua. */
  private lobbyInteractables(): Interactable[] {
    const list: Interactable[] = [];
    if (this.phase !== 'evening') return list;
    this.office.lobby.slots.forEach((s, i) => {
      const id = this.shop.offers[i];
      if (!id) return;
      const it = this.shop.spec(id);
      const sold = this.shop.soldOut(id);
      const price = this.shop.price(id);
      list.push({
        id: `buy${i}`, pos: s.pos, r: 2.4, hold: 0, obj: [s.mesh], needView: true,
        label: sold ? `${it.icon} ${it.name} · esgotado` : `<kbd>E</kbd>Levar ${it.icon} ${it.name} · 💰 ${price}`,
        hint: sold ? 'volta amanhã (talvez)' : `${it.desc}${this.wallet < price ? ` · faltam 💰 ${price - this.wallet}` : ` · sobra 💰 ${this.wallet - price}`}`,
        ok: () => !sold,
        act: () => this.buyOffer(i),
      });
    });
    list.push({ id: 'home', pos: this.office.lobby.exit, r: 2.4, hold: 0.5, label: '<kbd>E</kbd>Ir para casa (segure)', hint: 'fecha o dia e mostra o relatório', ok: () => true, act: () => this.goHome() });
    return list;
  }

  private updateLobby(dt: number, realDt: number) {
    const o = this.office;
    const p = this.player;
    this.pc.update(dt, realDt);
    this.bots.update(dt);
    for (const b of [this.chefe, this.x9, this.dono]) if (b.ball.root.visible) b.ball.update(dt);
    this.separateBalls();
    this.lobbyCrowd.update(dt, this.phase === 'evening');
    const lives = RUN.lives - this.strikes;
    const lifeTxt = `${lives} ${lives === 1 ? 'vida' : 'vidas'}`;
    const marks: { pos: THREE.Vector3; icon: string; text: string }[] = [];
    if (this.phase === 'lobby') {
      if (this.lobbyRide < 0 && o.inLobbyCabin(p.ball.pos)) {
        this.lobbyRide = 1.1;
        o.lobby.open = 0;
        this.audio.play('ding', 0.6);
      }
      if (this.lobbyRide >= 0) {
        this.lobbyRide -= realDt;
        if (this.lobbyRide <= 0) return this.rideUp();
      }
      if (!o.inLobbyCabin(p.ball.pos)) marks.push({ pos: o.lobby.elevMark, icon: '⬆', text: 'elevador' });
      this.hud.goal('☀ BOM DIA', `O time e o chefe já estão no <b>elevador</b>. Suba com eles.<br><small>Meta de hoje: <b>${this.goal} FUN</b>${this.net ? ' do time' : ''} · ${lifeTxt}</small>`, 'tut');
      this.hud.setClock(0, this.dayName, 'chegando');
    } else {
      if (this.lobbyRide >= 0) {
        this.lobbyRide -= realDt;
        if (this.lobbyRide <= 0) {
          o.lobby.open = 1;
          this.audio.play('ding', 0.8);
          this.subtitle('[ding! térreo]');
          this.bots.leaveLobby(o.lobby.exitPath);
        }
      }
      if (this.lobbyRide < 0) {
        marks.push({ pos: o.lobby.shopMark, icon: '🛍', text: 'Lojinha' });
        marks.push({ pos: o.lobby.exit.clone().setY(2.5), icon: '🏠', text: 'ir para casa' });
      }
      this.hud.goal('🌙 TÉRREO · 18:10', `A <b>Lojinha</b> está aberta: você tem 💰 <b>${this.wallet}</b> de vale${this.net ? ' (cofre do time)' : ''}.<br><small>Quando acabar, saia pela <b>porta da rua</b>. ${lifeTxt}</small>`, 'tut');
      this.hud.setClock(1, this.dayName, 'fim do expediente');
    }
    this.projectMarkers(marks);
    this.hud.update(realDt);
    if (this.input.pressed('KeyP') || (this.input.pressed('Escape') && !this.input.locked)) this.onPause?.();
  }

  /** Porta do elevador do escritório abre por uns segundos (cliente chegando/saindo). */
  openElevatorDoorBriefly() {
    this.office.elevatorOpen = 1;
    this.elevCloseT = Math.max(this.elevCloseT, 3.5);
  }

  /** Quem manda hoje: o X9 se o evento sorteado for "Ronda do X9" (o chefe fica na sala e só liga), senão o chefe; com pizza, o Dono também. */
  private setupBosses() {
    const i = this.dayIndex;
    this.chefe.ball.root.visible = false;
    this.x9.ball.root.visible = false;
    this.dono.ball.root.visible = false;
    const x9 = this.dayEvents.includes('ronda');
    const main = x9 ? this.x9 : this.chefe;
    this.bossToday = x9 ? x9Day(i) : bossDay(i);
    main.spec = this.bossSpec(this.bossToday);
    main.reset();
    main.lastRondaEnd = 0;
    main.lastRondaStart = 0;
    main.ball.root.visible = true;
    main.setFlashlight(this.weather === 'chuva');
    this.bosses = [main];
    // pizza: o Dono vem julgar a bagunça
    if (this.dayEvents.includes('pizza')) {
      this.dono.reset();
      this.dono.ball.root.visible = true;
      this.bosses.push(this.dono);
    }
    if (x9) {
      this.chefe.reset();
      this.chefe.ball.root.visible = true;
    } else if (tricksOn(i).some((t) => t.id === 'estagiario')) {
      // truque "estagiário": o X9 ronda junto com o chefe
      this.x9.spec = this.bossSpec(x9Day(i));
      this.x9.reset();
      this.x9.ball.root.visible = true;
      this.bosses.push(this.x9);
    }
  }

  // ------------------------------------------------------------------ elevador
  /** Todo dia começa com o time no elevador; quando a porta abre, o expediente começa. */
  private enterElevator(fromLobby = false) {
    const o = this.office;
    this.phase = 'elevator';
    this.elevT = ELEVATOR.time;
    this.elevSkip = 0;
    this.elevDinged = false;
    o.elevatorOpen = 0;
    this.netCount = -1;
    this.netWarned.clear();
    this.net?.resetForDay();
    // vindo do hall o elenco já está na cabine (subiu junto); senão cada um nasce no seu canto (na sala, o slot decide)
    if (!fromLobby) {
      this.placeElevatorCast(0);
      this.pc.placeAt(this.net ? this.elevSpot() : W(15.0, 4.6), Math.PI);
    }
    this.drawBoards();
    this.audio.startMusic('elevator');
    this.hud.elevator(true);
  }

  /** Chefias no elevador: o X9 do dia espera num canto (`spot` = 1º canto livre depois dos colegas); quem fala fica de frente para o time. */
  private placeBossesInElevator(spot: number, off: THREE.Vector3) {
    if (this.bosses[0] === this.x9) this.x9.waitAt(ELEV_SPOTS[spot].clone().add(off));
    // 1º dia: o chefe entra no elevador, de frente para o jogador, e explica o jogo em poucas falas
    const tutorial = !this.net && this.settings.tutorial && this.dayIndex === 0;
    // todo dia quem manda hoje (chefe ou X9) passa o dia no elevador: meta, evento, truque novo e o prêmio da mesa dele
    this.elevTalking = true;
    this.elevSpeaker = tutorial ? this.chefe : this.bosses[0];
    this.elevScript = tutorial ? ELEVATOR_TALK : null;
    this.elevTalkIdx = -1;
    this.hud.say('', null);
    if (this.elevTalking && this.elevSpeaker !== this.x9) {
      const c = this.elevSpeaker;
      // no fundo da cabine, de frente para a porta: quem entra dá de cara com ele
      c.waitAt(W(15.0, 1.25).add(off));
      c.setFlashlight(false);
      c.ball.root.visible = true;
    }
  }


  // ------------------------------------------------------------------ bonk (bolinha na cabeça)
  /** Quem a bolinha acertou (colega, chefe ou, se foi um colega que jogou, você). */
  bonkTarget(pos: THREE.Vector3, owner: Worker | null): { w?: Worker; b?: Boss; me?: boolean } | null {
    const head = new THREE.Vector3();
    for (const w of this.workers) {
      if (w.isPlayer || w === owner || w.fired || w.hidden || !w.ball.root.visible) continue;
      if (w.ball.headWorld(head).distanceTo(pos) < BONK.headR) return { w };
    }
    for (const b of this.bosses) {
      if (!b.ball.root.visible) continue;
      if (b.ball.headWorld(head).distanceTo(pos) < BONK.headR * b.ball.spec.scale * 0.8) return { b };
    }
    if (owner && !this.player.fired && this.r.camera.position.distanceTo(pos) < 0.45) return { me: true };
    return null;
  }

  onBonk(t: { w?: Worker; b?: Boss; me?: boolean }, from: THREE.Vector3, owner: Worker | null) {
    const p = this.player;
    if (t.me && owner) {
      this.hud.splat();
      this.juice.shake(0.12);
      this.audio.play('bonk', 0.9);
      this.subtitle(`[${owner.name} revidou! 😤]`);
      return;
    }
    if (owner) return;
    const ball = t.w ? t.w.ball : t.b!.ball;
    const head = ball.headWorld().add(new THREE.Vector3(0, 0.6, 0));
    this.audio.play3D('bonk', head, 1);
    ball.impulse(1);
    this.juice.text(head, 'BONK!', 'ft-big', 1.1);
    if (t.w) {
      const w = t.w;
      if (this.canFun('bonk')) {
        this.addFun(p, BONK.funBot, 'bonk');
        this.funProgress('bonk');
      }
      w.ball.setEye('alert');
      this.juice.text(head.clone().add(new THREE.Vector3(0, 0.4, 0)), '💢', 'ft-emote', 1.3);
      setTimeout(() => !w.fired && w.ball.eye === 'alert' && w.ball.setEye('normal'), 1400);
      const bossNear = this.bosses.some((b) => b.busy && b.ball.root.visible && b.pos.distanceTo(w.ball.pos) < 10);
      if (Math.random() < BONK.revenge && !bossNear) setTimeout(() => this.botThrowAt(w), 800);
      return;
    }
    const b = t.b!;
    if (b.sees(p.ball.pos) && !this.attract) {
      // viu quem foi: corre atrás
      this.pc.bail();
      b.startChase(p);
      this.hud.popup('caught', 'ELE VIU!', 'bolinha no chefe — corra para a SUA mesa!');
      this.hud.setBanner('🏃 O CHEFE ESTÁ TE PERSEGUINDO', '');
      this.audio.play('warn', 1);
      return;
    }
    if (this.canFun('bonkChefe')) {
      this.addFun(p, BONK.funBoss, 'BONK NO CHEFE');
      this.funProgress('bonkChefe');
    }
    this.juice.text(head.clone().add(new THREE.Vector3(0, 0.5, 0)), '?!', 'ft-boss', 1.4);
    b.investigate(from);
    for (const w of this.workers) if (!w.isPlayer && !w.fired && w.ball.pos.distanceTo(b.pos) < 12) this.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), '😂', 'ft-emote', 1.4);
  }

  /** O colega revida: joga uma bolinha na sua cabeça (balística em ~0,75 s). */
  private botThrowAt(w: Worker) {
    if (w.fired || this.player.fired || !this.running) return;
    const start = w.ball.headWorld().add(new THREE.Vector3(0, 0.15, 0));
    const target = this.r.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.25));
    const T = 0.75;
    const vel = new THREE.Vector3().subVectors(target, start).sub(new THREE.Vector3(0, -9.8 * 0.5 * T * T, 0)).divideScalar(T);
    w.ball.yaw = Math.atan2(target.x - start.x, target.z - start.z);
    w.ball.impulse(0.6);
    this.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), 'TOMA!', 'ft-small', 1);
    this.pc.throwPaper(start, vel, w);
  }

  // ------------------------------------------------------------------ lojinha
  /** Aviso extra da porta: dobradiças e tapete somam; a porta lubrificada (truque) tira. */
  get doorWarnBonus() {
    const s = this.shop;
    return s.count('dobradica') * SHOP_FX.doorWarn + s.count('tapete') * SHOP_FX.rugWarn + (this.tricks.has('portaMuda') ? TRICK_FX.doorWarn : 0);
  }

  /** Quanto o chefe demora para reconhecer a tela: plantas somam, o olho de águia (truque) tira. */
  get identifyMul() {
    return Math.pow(SHOP_FX.plantIdentify, this.shop.count('planta')) * (this.tricks.has('olhoAguia') ? TRICK_FX.identify : 1);
  }

  /** Janela do CLUTCH (o atalho de pânico aumenta). */
  get clutchWindow() {
    return B.CLUTCH_WINDOW + this.shop.count('atalho') * SHOP_FX.clutchBonus;
  }

  /** Ramal falso (R sentado, 1×/dia por cópia): na sala ele não sai por um tempo; fora, para para atender. */
  useRamal() {
    if (this.ramalLeft <= 0 || this.phase !== 'play' || this.player.fired) return;
    this.ramalLeft--;
    this.audio.play('click', 0.7);
    this.subtitle('[você ligou para o ramal do chefe…]');
    if (this.auth) this.applyRamal();
    else this.net?.act('ramal');
  }

  /** Efeito do ramal falso (no host/solo). */
  applyRamal() {
    const main = this.bosses[0];
    if (!main.busy) {
      this.ramalHold = this.time + SHOP_FX.ramalHome;
      this.hud.toastWorld(`☎ o chefe está no telefone: ${SHOP_FX.ramalHome} s sem sair da sala`);
    } else {
      main.distract(SHOP_FX.ramalOut, 'ramal');
      this.hud.toastWorld(`☎ o chefe parou para atender (${SHOP_FX.ramalOut} s)`);
    }
  }

  /** Visita (demitido no multi): puxa conversa com a chefia mais perto, que para por uns segundos. */
  visitTalk(w: Worker) {
    const b = this.bosses.filter((x) => x.ball.root.visible && x.out).sort((a, c) => a.pos.distanceTo(w.ball.pos) - c.pos.distanceTo(w.ball.pos))[0];
    if (b && b.pos.distanceTo(w.ball.pos) < 3) b.distract(VISIT.talk, 'visita');
  }

  /** Depois da cena da demissão: no multi você volta como visita (anda, avisa e distrai o chefe); senão, fantasma. */
  afterFired() {
    if (!this.net || this.outOfLives) return this.pc.setMode('ghost');
    this.pc.setMode('walk');
    this.player.ball.setGhost(false);
    this.player.ball.setEye('bored');
    this.pc.placeAt(this.office.P.elevatorOut, Math.PI);
    this.hud.ghost('🪪 <b>VISITA</b> — você foi demitido hoje, mas voltou de crachá de visitante.<br><kbd>E</kbd> perto do chefe puxa conversa (ele para), <kbd>F</kbd> avisa a sala onde ele está.');
  }

  /** Post-it "Em reunião" na mesa (1×/dia por cópia): a próxima ronda pula você. */
  private usePostit() {
    this.postitLeft--;
    this.postitActive = true;
    this.office.extras.postit.visible = true;
    this.audio.play('crumple', 0.5);
    this.hud.toastWorld('🟨 "EM REUNIÃO" — a próxima ronda pula a sua mesa');
  }

  /** Debug/testes: pula direto para a porta abrindo. */
  // ------------------------------------------------------------------ multiplayer
  /** Entra numa sala (ou volta ao solo com `null`): mesas por slot, colegas = jogadores. */
  setNet(net: Multi | null) {
    this.net = net;
    if (!net) {
      // solo de novo: cada um na mesa original, com a cara e o nome de antes
      this.allWorkers.forEach((w, i) => {
        w.ball.root.getObjectByName('nametag')?.removeFromParent();
        w.remote = null;
        w.desk = this.office.desks[i];
        w.name = i === 0 ? this.settings.name || 'Você' : PEOPLE[i].name;
        const look = i === 0 ? this.playerLook() : PEOPLE[i].look;
        if (w.ball.differs(look)) w.ball.setLook(look);
        this.office.setDeskTheme(w.desk, look.variant ?? 'voce', look.color);
        if (i > 0) this.office.setPile(w.desk, 0);
      });
      this.claimDesk();
      return;
    }
    this.applyRoster();
  }

  /** A mesa do jogador local ganha o monitor do BossOS e os itens da lojinha. */
  private claimDesk() {
    for (const d of this.office.desks) this.office.setScreenRes(d, d === this.player.desk);
    this.office.placeExtras(this.player.desk);
  }

  /** Mesas da sala: o jogador local senta na mesa do slot dele; cada remoto ocupa a mesa do seu slot. */
  applyRoster() {
    const net = this.net;
    if (!net) return;
    const desks = this.office.desks;
    const mine = net.slots[net.self] ?? 0;
    const others = this.allWorkers.slice(1);
    // mesas livres (sem o slot local), na ordem: cada funcionário não-jogador fica com uma
    const free = desks.filter((_, i) => i !== mine);
    this.player.desk = desks[mine];
    this.claimDesk();
    // monte de bolinhas: só existe na mesa de quem joga
    if (!this.player.desk.pile) this.office.buildPile(this.player.desk);
    for (const d of desks) if (d !== this.player.desk) this.office.setPile(d, 0);
    others.forEach((w, i) => (w.desk = free[i]));
    const seen = new Set<string>();
    for (const m of net.members) {
      if (m.id === net.self) continue;
      const slot = net.slots[m.id];
      if (slot === undefined) continue;
      const w = others.find((x) => x.desk === desks[slot]);
      if (!w) continue;
      seen.add(m.id);
      let r = net.remotes.get(m.id);
      if (r && r.w !== w) {
        r.w.remote = null;
        net.remotes.delete(m.id);
        r = undefined;
      }
      if (!r) {
        net.bind(m.id, w);
      }
      w.remote = m.id;
      w.name = m.name;
      if (w.ball.differs(m.look)) w.ball.setLook(m.look);
      this.office.setDeskTheme(w.desk, m.look.variant ?? 'voce', m.look.color);
      // quem chega com o elevador parado aparece lá dentro
      if (this.running && this.phase === 'elevator' && !this.workers.includes(w)) {
        w.resetDay(0);
        w.ball.root.visible = true;
        w.ball.setGhost(false);
        this.workers.push(w);
      }
    }
    for (const w of others)
      if (w.remote && !seen.has(w.remote)) {
        net.remotes.delete(w.remote);
        net.tag(w, '');
        w.remote = null;
      }
    // mesas vazias ficam vazias (sem colegas bots no multi)
    for (const w of others)
      if (!w.remote) {
        w.ball.root.visible = false;
        const i = this.workers.indexOf(w);
        if (i >= 0) this.workers.splice(i, 1);
      }
    const pl = this.playerLook();
    this.office.setDeskTheme(this.player.desk, pl.variant ?? 'voce', pl.color);
    // o slot chegou depois de entrar no elevador: vai para o seu canto
    if (this.running && this.phase === 'elevator' && mine !== this.placedSlot) this.pc.placeAt(this.elevSpot(), Math.PI);
  }

  private placedSlot = -1;
  /** Canto do elevador do jogador local na sala. */
  private elevSpot() {
    const spots = ELEV_SPOTS;
    this.placedSlot = this.net?.slots[this.net.self] ?? 0;
    return spots[this.placedSlot % spots.length];
  }

  /** Cliente: o host está em outro dia (entrou no meio da run ou o host avançou). */
  followHostDay(day: number, events: EventId[]) {
    this.startDay(day);
    this.setDayEvents(events);
  }

  /** Contagem do elevador (s < 0 = cancelada). */
  onCountdown(s: number) {
    this.netCount = s;
    if (s > 0) {
      this.audio.play('confirm', 0.9);
      this.hud.popup('info', 'TODOS PRONTOS!', `as portas abrem em ${s} s`);
    } else if (s < 0) this.hud.popup('warn', 'CONTAGEM CANCELADA', 'alguém desmarcou o pronto');
  }

  /** Cliente: o chefe conferiu sua mesa e você estava limpo — clutch se trocou de janela em cima da hora. */
  onRemoteIdentify(b: Boss) {
    if (this.player.fired || this.pc.mode !== 'seated') return;
    const since = this.time - this.computer.lastSafeSwitch;
    if (since <= this.clutchWindow) this.clutch(b);
  }

  /** Cliente: um colega remoto foi demitido (visto pelo snapshot). */
  markRemoteFired(w: Worker) {
    w.fired = true;
    this.audio.play3D('caught', w.ball.pos, 0.7);
    this.juice.smoke(w.ball.headWorld(), 14, '#cfd6e4');
    this.subtitle(`[${w.name} foi demitido(a)!]`, w.ball.pos);
    setTimeout(() => {
      // o dia pode ter virado nesse 1,5 s: quem já voltou não vira fantasma
      if (!w.fired) return;
      w.ball.setGhost(true);
      w.ball.hoverHeight = 1.7;
      w.ball.setEye('bored');
    }, 1500);
  }

  /** Cliente: espelha os eventos do dia que o host simula. */
  applyEvents(ev: EventState, dt: number) {
    const o = this.office;
    const [light, pizza, jam, black, door, elev, net, meet, wx, coffee] = ev;
    this.setWeather(WEATHERS[wx] ?? this.weather);
    // o contador local já anda junto; só sobe quando outro jogador usou a máquina
    this.coffeeMachineCd = Math.max(this.coffeeMachineCd, coffee);
    this.lightLevel += (light / 100 - this.lightLevel) * Math.min(1, dt * 8);
    if (this.dayEvents.includes('blecaute') || light < 100) o.setLights(this.lightLevel);
    if (net && this.internetT <= 0) this.startInternet();
    else if (!net && this.internetT > 0) this.endInternet();
    if (meet > 0 && !this.meetingCall) this.startMeetingCall();
    if (this.meetingCall) {
      this.meetingCall.t = meet;
      if (meet <= 0) this.meetingCall = null;
    }
    if (black && !this.blackout) {
      o.outside.lightning();
      this.audio.play('thunder', 1);
      this.audio.play('blackout', 1);
      this.r.u.uFlash.value = 0.55;
      this.hud.popup('warn', 'BLECAUTE!', 'telas acesas denunciam — disjuntor na parede da cozinha');
    }
    this.blackout = black === 1;
    this.setLed(o.breakerLight, black ? '#ff2020' : '#3ddc97');
    if (jam && this.printerJam <= 0) {
      this.loops.alarm = this.audio.loop('alarm', o.P.printer.clone().setY(1));
      this.loops.alarm?.setVol(0.9);
      this.hud.popup('warn', 'IMPRESSORA TRAVOU!', 'o alarme atrai o chefe — destrave (E)');
    } else if (!jam && this.printerJam > 0) {
      this.loops.alarm?.stop();
      this.loops.alarm = null;
    }
    this.printerJam = jam ? 1 : 0;
    this.setLed(o.printerLight, jam ? '#ff2020' : '#3ddc97');
    if (pizza >= 0 && !o.pizzaGroup.visible) this.feastPopup();
    o.pizzaGroup.visible = pizza >= 0;
    this.pizzaLeft = Math.max(0, pizza);
    o.pizzaSlices.forEach((sl, i) => (sl.visible = i < this.pizzaLeft));
    o.doorOpen = door / 100;
    if (this.phase === 'play') o.elevatorOpen = elev / 100;
  }

  /** Planilha no ritmo ou app Trabalho aberto (trabalho de verdade) — o host usa para não estranhar quem trabalha. */
  workingNow() {
    const c = this.computer;
    return this.pc.mode === 'seated' && c.active === c.home && (c.home !== 'planilha' || c.planilha.inRhythm);
  }

  /** Lista da sala no painel do elevador. */
  private lobbyHTML() {
    const net = this.net!;
    const rows = net.members
      .map((m) => `${m.ready ? '✅' : '⏳'} ${m.host ? '👑 ' : ''}${m.name.replace(/[<>&]/g, '')}${m.id === net.self ? ' (você)' : ''}`)
      .join('<br>');
    const code = `<small>código da sala: <b>${net.lobby.code}</b> · convite: Shift+Tab (Steam)</small>`;
    const foot =
      this.netCount > 0
        ? `<b>portas abrem em ${Math.ceil(this.netCount)} s…</b>`
        : `Aperte <kbd>E</kbd> no painel de botões para ${net.ready ? 'cancelar' : 'marcar'} <b>PRONTO</b>.`;
    return `${rows}<br>${foot}<br>${code}`;
  }

  skipElevator() {
    if (this.phase === 'lobby') this.rideUp();
    if (this.phase === 'elevator') this.elevT = 0.01;
    if (this.phase === 'leaving') {
      this.pc.placeAt(W(15, 3), 0);
      this.leaveStage = 2;
      this.leaveT = 99;
    }
  }

  /** O que o chefe fala no elevador além do evento: a meta, o truque novo de hoje, a cota de ontem e o prêmio da mesa dele. */
  private briefingLines() {
    const lines = [`Meta de hoje: <b>${this.goal} de produtividade</b>${this.net ? ' do time' : ''}. Entenderam? 😇`];
    const t = tricksOn(this.dayIndex).at(-1);
    if (t && this.dayIndex > 0) lines.push(`${t.say} <small>(truque novo: ${t.name})</small>`);
    if (this.fixedDebt > 0) lines.push('E alguém me deve a <b>cota de ontem</b>. Vou cobrar.');
    lines.push(this.missions.spec.brief);
    const sv = this.surv.briefing(this.dayIndex);
    if (sv) lines.push(sv);
    if (this.dayIndex === INTRO.talkFrom) lines.push('Quem <b>trabalha</b> ganha o direito de <b>conversar comigo</b>. Eu adoro uma conversa. 😇');
    if (this.dayIndex === INTRO.distractFrom) lines.push('E ninguém mexe na <b>impressora</b>, no <b>rádio</b>, no <b>viva-voz</b> ou no <b>alarme</b>. Ouviram?');
    lines.push(`Cota de hoje: <b>${this.tasks.cotaText().split('/')[1]} entregas de trabalho</b>. Não fechou, não fica.`);
    lines.push('Minha <b>agenda</b> fica no quadro ao lado da minha sala. Não que vocês precisem dela. 😇');
    return lines;
  }

  /** Tutorial relâmpago do chefe: uma fala por vez, termina antes do "ding". */
  private updateElevatorTalk() {
    let t = ELEVATOR.time - this.elevT - ELEVATOR.talkDelay;
    if (t < 0) return;
    // na sala o texto depende dos eventos do dia, que o cliente só conhece depois do host: monta na primeira fala
    const script = (this.elevScript ??= dailyBossTalk(this.dayName, this.dayIndex, this.dayEvents, this.briefingLines()));
    let idx = -1;
    for (let i = 0; i < script.length; i++) {
      if (t < script[i].t) {
        idx = i;
        break;
      }
      t -= script[i].t;
    }
    if (idx === this.elevTalkIdx) return;
    this.elevTalkIdx = idx;
    const c = this.elevSpeaker;
    this.hud.say(c === this.x9 ? 'X9' : 'CHEFE', idx < 0 ? null : script[idx].say);
    c.ball.setEye(idx < 0 ? 'normal' : 'talk');
    if (idx < 0) return;
    c.ball.impulse(0.5);
    this.audio.play3D('click', c.pos, 0.7);
  }

  private updateElevator(dt: number, realDt: number) {
    const o = this.office;
    this.elevT -= dt;
    if (this.net) {
      // sala: o elevador espera no 12º andar até todos marcarem pronto
      if (this.netCount >= 0) {
        this.netCount = Math.max(0, this.netCount - dt);
        if (this.netCount === 0) this.elevT = Math.min(this.elevT, 2);
      }
      if (this.netCount !== 0) this.elevT = Math.max(this.elevT, 2.3);
    }
    const T = ELEVATOR.time;
    const ride = THREE.MathUtils.clamp(1 - (this.elevT - 2) / (T - 2), 0, 1);
    o.setElevatorFloor(Math.round(ride * 12), true);
    this.bots.update(dt);
    for (const b of this.bosses) b.ball.update(dt);
    if (this.chefe.ball.root.visible && !this.bosses.includes(this.chefe)) this.chefe.ball.update(dt);
    this.pc.update(dt, realDt);
    this.separateBalls();
    // a partir do 2º dia dá para pular: segure ESPAÇO
    if (!this.net && this.dayIndex > 0 && this.elevT > 2.2) {
      this.elevSkip = this.input.isDown('Space') ? this.elevSkip + realDt : Math.max(0, this.elevSkip - realDt * 2);
      this.hud.meter(this.elevSkip > 0.05 ? '⏩ pulando o elevador…' : null, this.elevSkip / ELEVATOR.skipHold);
      if (this.elevSkip >= ELEVATOR.skipHold) {
        this.elevT = 2.2;
        this.hud.meter(null);
      }
    }
    if (this.elevTalking) this.updateElevatorTalk();
    if (!this.elevDinged && this.elevT <= 2) {
      this.elevDinged = true;
      this.audio.stopMusic();
      this.audio.play('ding', 0.9);
      this.subtitle('[ding! 12º andar]');
    }
    if (this.elevT <= 1) o.elevatorOpen = 1;
    const left = Math.max(0, Math.ceil(this.elevT));
    this.hud.setClock(0, this.dayName, this.net ? 'sala' : 'subindo…');
    const shop = `💰 ${this.wallet} de vale`;
    if (this.net) this.hud.goal('🏢 ELEVADOR · SALA', `${this.lobbyHTML()}<br><small>${shop}</small>`, 'tut');
    else this.hud.goal(
      '🏢 ELEVADOR',
      `Meta de hoje: <b>${this.goal} FUN</b>${this.net ? ' do time' : ''} · ${RUN.lives - this.strikes} ${RUN.lives - this.strikes === 1 ? 'vida' : 'vidas'}. Trabalho (cota e telefone) é o seu disfarce.<br><small>${this.elevTalking ? 'Escute o chefe e leia o painel ao lado' : 'Leia o painel ao lado'}. A porta abre em <b>${left} s</b> · ${shop}${this.dayIndex > 0 ? ' · segure <kbd>ESPAÇO</kbd> para pular' : ''}.</small>`,
      'tut',
    );
    this.hud.setMarkers([]);
    this.hud.setFunList(this.funRows());
    this.hud.update(realDt);

    if (this.input.pressed('KeyP') || (this.input.pressed('Escape') && !this.input.locked)) this.onPause?.();
    if (this.elevT <= 0 && (!this.net || this.net.isHost || this.netCount >= 0 || this.net.playing)) this.openElevator();
  }

  private openElevator() {
    this.phase = 'play';
    this.net?.startPlaying();
    this.time = 0;
    this.elevCloseT = 7;
    this.office.elevatorOpen = 1;
    this.bots.releaseFromElevator();
    if (this.elevTalking) {
      // acabou o tutorial: o chefe volta andando para a sala dele
      this.elevTalking = false;
      this.hud.say('', null);
      this.elevSpeaker.ball.setEye('normal');
      if (this.elevSpeaker !== this.x9) this.elevSpeaker.leaveElevator();
    }
    // o X9 desce do elevador e vai para a sala; dali sai nas rondas normais (antes ficava parado no elevador o dia todo)
    if (this.auth && this.x9.state === 'wait') this.x9.leaveElevator();
    this.hud.elevator(false);
    this.hud.meter(null);
    this.audio.startMusic('day');
    this.audio.play('bell', 0.7);
    this.hud.popup('info', `☀ ${this.dayName.toUpperCase()}`, `meta de hoje: <b>${this.goal} FUN</b>${this.net ? ' (do time)' : ''} · ${RUN.lives - this.strikes} ${RUN.lives - this.strikes === 1 ? 'vida' : 'vidas'}`);
    if (this.net && this.player.fired) this.pc.setMode('ghost');
    // a cota fixa de ontem que ficou aberta: o chefe cobra agora, com o número na tela
    if (this.fixedDebt > 0 && !this.player.fired) {
      const debt = this.fixedDebt;
      this.fixedDebt = 0;
      setTimeout(() => {
        if (!this.running) return;
        this.addSus(this.player, debt, 'fixa', 'cota de ontem');
        this.hud.popup('warn', 'COTA DE ONTEM', `a tarefa fixa ficou aberta: +${Math.round(debt)} Suspeita`);
      }, 1800);
    }
  }

  /** Clima: chuva com raios (trovão chega depois do clarão), pombos fogem de quem chega perto do vidro. */
  private updateWeather(dt: number) {
    const o = this.office;
    if (o.weather === 'chuva') {
      this.loops.rain ??= this.audio.loop('rain', null);
      this.loops.rain?.setVol(0.22);
      // só o solo/host sorteia o raio; o cliente recebe o aviso pela rede
      if (this.auth) {
        this.thunderT -= dt;
        if (this.thunderT <= 0) {
          this.thunderT = 12 + Math.random() * 14;
          const delay = 400 + Math.random() * 1200;
          this.thunder(delay);
          this.net?.thunder(delay);
        }
      }
    } else if (this.loops.rain) {
      this.loops.rain.stop();
      this.loops.rain = null;
    }
    if (o.cooAt) this.audio.play3D('coo', o.cooAt, 0.8, 0, 14);
    const me = this.player.ball.pos;
    if (o.outside.scare(me, 0.95)) this.audio.play3D('plop', me, 0.4);
  }

  /** Raio: clarão agora, trovão `delay` ms depois. */
  thunder(delay: number) {
    this.office.outside.lightning();
    this.r.u.uFlash.value = Math.max(this.r.u.uFlash.value, 0.18);
    this.r.u.uFlashColor.value.set('#e6efff');
    setTimeout(() => this.audio.play('thunder', 0.8), delay);
    this.subtitle('[trovão]');
  }

  /** Cliente: o host disparou um evento que só anuncia (o resto vem pelo snapshot). */
  onAnnounce(id: string, order: string[]) {
    if (id === 'boasvindas') {
      this.audio.play('gong', 0.8);
      this.hud.popup('info', 'BOAS-VINDAS!', `${this.bosses[0] === this.x9 ? 'o X9' : 'o chefe'} vai passar em TODAS as mesas`);
    } else if (id === 'auditoria') {
      this.office.drawWhiteboard(['AUDITORIA', ...order.map((n, i) => `${i + 1}. ${n}`)]);
      this.hud.popup('warn', 'AUDITORIA!', `ordem: ${order.join(' → ')}`);
      this.audio.play('gong', 0.9);
    } else if (id === 'ronda') {
      this.audio.play('gong', 0.8);
      this.hud.popup('warn', 'RONDA DO X9!', 'ele vai ficar andando pelo salão — fique de olho');
    } else if (id === 'missao') {
      this.audio.play('fanfare', 0.8);
      this.missions.done = true;
    } else if (id === 'alarme') {
      this.hud.popup('warn', '🚨 ALARME DE INCÊNDIO!', 'todo mundo para o elevador — a sala do chefe ficou vazia');
    }
  }

  /** Bater no vidro: os pombos voam (FUN só se for diversão de hoje, 3× por dia). */
  private tapGlass() {
    const me = this.player.ball.pos;
    this.audio.play3D('tap', me, 1);
    this.pc.pawGesture('press', 0.4);
    const n = this.office.outside.scare(me, 3.2);
    if (n > 0) {
      this.audio.play3D('coo', me, 0.9);
      if (this.canFun('vidro') && this.pigeonFun < 3) {
        this.pigeonFun++;
        this.addFun(this.player, 1, 'pombos!');
        this.funProgress('vidro');
      }
    }
  }

  /** O telefone da mesa treme e pisca enquanto toca. */
  private updatePhone(realDt: number) {
    const ph = this.player.desk.phone;
    const ring = !!this.tasks.ringing;
    const t = this.time;
    ph.handset.position.y = 0.085 + (ring ? Math.abs(Math.sin(t * 38)) * 0.02 : 0);
    ph.group.rotation.y = ring ? Math.sin(t * 55) * 0.05 : 0;
    ph.led.color.set(ring ? (Math.sin(t * 12) > 0 ? '#ff3040' : '#401010') : this.tasks.active.length ? '#ffb020' : '#3a4a3a');
    void realDt;
  }

  /** A porta do elevador fecha sozinha (se ninguém estiver no vão). */
  private updateElevatorDoor(dt: number) {
    if (this.office.elevatorOpen <= 0) return;
    this.elevCloseT -= dt;
    if (this.elevCloseT > 0) return;
    const door = this.office.P.elevatorDoor;
    const blocked = [this.player, ...this.workers].some((w) => !w.seated && w.ball.pos.distanceTo(door) < 1.1);
    if (blocked) this.elevCloseT = 1;
    else {
      this.office.elevatorOpen = 0;
      this.audio.play3D('ding', door, 0.25);
    }
  }

  /** Botões do elevador: apertar é sempre uma piadinha (e o alarme assusta todo mundo). */
  private pressElevatorButton() {
    const o = this.office;
    this.pc.pawGesture('press', 0.5);
    this.audio.play3D('click', o.P.elevatorBtn, 1);
    const roll = Math.random();
    if (this.phase === 'elevator' && this.net) {
      if (this.netCount > 0) return;
      const v = !this.net.ready;
      this.net.setReady(v);
      this.audio.play(v ? 'confirm' : 'click', 0.8);
      this.hud.toastWorld(v ? '✅ PRONTO — esperando os colegas' : 'pronto cancelado');
      return;
    }
    if (this.phase === 'elevator') {
      if (roll < 0.3) {
        this.audio.play3D('warn', o.P.elevator, 1);
        this.bots.startle();
        this.hud.toastWorld('🚨 ALARME! todo mundo deu um pulo');
      } else this.hud.toastWorld(['você apertou todos os andares 😈', 'o botão de fechar porta é de enfeite', 'nada acontece. como sempre.'][Math.floor(roll * 3) % 3]);
      return;
    }
    // fora: chama o elevador, que abre e não leva ninguém
    o.elevatorOpen = 1;
    this.elevCloseT = 3;
    this.audio.play3D('ding', o.P.elevator, 0.6);
    this.hud.toastWorld('🛗 o elevador chegou… e ninguém entrou');
  }

  // ------------------------------------------------------------------ tarefas do chefe (telefone)
  get printerBusy() {
    return this.printerJam > 0;
  }

  /** Luz da impressora: vermelha quando ela trava (evento ou tarefa). */
  setPrinterLed(jammed: boolean) {
    this.setLed(this.office.printerLight, jammed ? '#ff2020' : '#3ddc97');
  }

  /** Galão d'água para a tarefa do bebedouro. */
  makeGalao() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.38, 20), new THREE.MeshStandardMaterial({ color: '#7cc8ff', roughness: 0.1, transparent: true, opacity: 0.75 }));
    body.position.y = 0.19;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.08, 14), body.material);
    neck.position.y = 0.42;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14), new THREE.MeshStandardMaterial({ color: '#2f5fa8', roughness: 0.5 }));
    cap.position.y = 0.47;
    g.add(body, neck, cap);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  onPhoneRing() {
    this.subtitle('[telefone tocando na sua mesa]', this.player.desk.screenCenter);
    // quem está perto olha para a sua mesa
    const at = this.player.desk.screenCenter;
    for (const w of this.workers)
      if (!w.isPlayer && !w.fired && w.ball.pos.distanceTo(at) < 9) {
        w.glanceAt.copy(at);
        w.glanceT = 2.5;
        this.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), '👀', 'ft-emote', 1.4);
      }
    if (this.pc.mode === 'seated') this.computer.toast(`📞 seu telefone! aperte T (${TASKS.grace} s de folga)`);
  }

  onPhoneAnswered(inst: TaskInst, say: string) {
    this.audio.play('click', 0.6);
    this.audio.play('blah', 0.9, 0);
    setTimeout(() => this.audio.play('blah', 0.7, 0), 900);
    this.pc.pawGesture('phone', 3);
    this.hud.call(this.bosses[0] === this.x9 ? 'O Chefe (da sala)' : 'O Chefe', say, this.bossPortrait);
    this.subtitle(`[chefe: "${say}"]`);
    void inst;
  }

  onTaskDone(t: TaskInst, msg: string) {
    const p = this.player;
    // o alívio cresce com a curva, como a punição (antes só a punição escalava)
    const relief = Math.round(TASKS.susDone * this.mul);
    this.addSus(p, -relief);
    // trabalho não é festa: carimbo seco, sem confete nem moeda (isso é da diversão)
    this.hud.toastWorld(`🗂 ${t.title}: OK · −${relief} Suspeita${msg ? ` · ${msg}` : ''}`);
    this.audio.play('stamp', 0.5);
    if (this.pc.mode === 'seated') this.computer.toast(`🗂 ${t.title}: OK`);
  }

  /** Cota do dia inteira fechada (fixa + pauta): a vida está salva. */
  onCotaDone() {
    this.player.cotaDone = true;
    this.hud.popup('good', '✅ COTA DO DIA FECHADA', 'a vida do trabalho está salva — agora é a missão');
    this.audio.play('stamp', 0.7);
  }

  /** Cota da tarefa fixa fechada: não baixa a Suspeita, mas livra da punição do fim do dia. */
  onFixedDone() {
    const f = FIXED[this.tasks.fixed.kind];
    this.hud.toastWorld(`🗂 ${f.label}: cota do dia OK`);
    this.audio.play('stamp', 0.5);
    if (this.pc.mode === 'seated') this.computer.toast(`🗂 ${f.label}: cota do dia OK`);
  }

  /** Trabalho errado (puzzle, receita, ritmo): Suspeita × curva do dia. */
  onTaskWrong(why: string, base: number = TASKS.susWrong) {
    const v = base * this.mul;
    this.addSus(this.player, v, 'erro', why);
    const txt = `❌ ${why}: +${Math.round(v)} Suspeita`;
    if (this.pc.mode === 'seated') this.computer.toast(txt);
    else this.hud.toastWorld(txt);
    this.audio.play('miss', 0.8);
  }

  private setLed(m: THREE.Mesh, color: string) {
    (m.material as THREE.MeshBasicMaterial).color.set(color);
  }

  private ensureLoops() {
    if (!this.audio.ready) return;
    const seat = this.player.desk.screenCenter;
    this.loops.typing ??= this.audio.loop('typing', seat);
    this.loops.video ??= this.audio.loop('video', seat);
    this.loops.cooler ??= this.audio.loop('cooler', this.player.desk.seat.clone().setY(0.6));
    this.loops.hum ??= this.audio.loop('hum', null);
    this.loops.hum?.setVol(0.05);
  }

  /** Tamanho do monte de papel do dia (a loja pode aumentar). */
  paperPileSize() {
    return PAPER.pile + this.shop.count('monteMaior') * SHOP_FX.pileBonus;
  }

  /** Aparência escolhida pelo jogador (acessório, cor do monitor e gravata). */
  playerLook(): Look {
    const s = this.settings;
    return { species: 'telinha', color: s.color, tie: s.tie, variant: s.variant };
  }

  seatBall(w: Worker) {
    const b = w.ball;
    b.setPos(w.desk.seat.x, w.desk.seat.z);
    b.yaw = w.desk.seatYaw;
    b.hoverHeight = 0.94;
    b.velocity.set(0, 0, 0);
    w.seated = true;
    w.desk.chair.position.copy(w.desk.seat).setY(0);
    // sentado: encosto atrás de quem senta
    w.desk.chairYaw = w.desk.seatYaw;
  }

  // ------------------------------------------------------------------ eventos dos apps
  private onAppEvent(e: AppEvent) {
    const p = this.player;
    const src = p.desk.screenCenter;
    switch (e.t) {
      case 'fun': {
        this.addFun(p, e.v, e.label);
        const app = this.computer.active;
        if (app === 'tiro' || app === 'pesca' || app === 'video') this.funProgress(app, e.v);
        break;
      }
      case 'sfx':
        if (e.spatial) {
          this.audio.play3D(e.name, src, 0.7, e.param ?? 0);
          if (e.name === 'boom' || e.name === 'pew') this.noise(src, ACT.tiro.noise, p, 0.15);
        } else this.audio.play(e.name, 0.8, e.param ?? 0);
        if (e.name === 'boom') this.juice.shake(0.07);
        break;
      case 'flash':
        this.flashLight = Math.max(this.flashLight, e.v);
        this.flashColor.set(e.color);
        break;
      case 'beat':
        this.tasks.onBeat(e.hit);
        if (e.hit) this.workCredit(1 / PAPO.hitsPerTask);
        else this.addSus(p, PAPO.missSus * this.mul, 'erro', 'fora do ritmo');
        if (e.hit && e.perfect) this.juice.sparks(p.desk.screenCenter.clone().addScaledVector(p.desk.screenNormal, 0.05), '#3ddc97', 10, 1.5);
        break;
      case 'consume':
        if (e.what === 'tiro') this.stock.tiro--;
        else if (e.what === 'pesca') this.stock.pesca--;
        break;
      case 'toast':
        this.computer.toast(e.text);
        break;
      case 'task':
        this.tasks.onWork(e.result);
        if (e.result === 'done') this.workCredit(1);
        break;
    }
  }

  private onSwitch(from: AppId, to: AppId) {
    const fromF = this.computer.apps[from].forbidden;
    const toF = this.computer.apps[to].forbidden;
    this.audio.play(toF ? 'click' : 'confirm', 0.5);
    if (fromF && !toF) {
      this.r.u.uAberration.value = Math.max(this.r.u.uAberration.value, 0.006);
      this.player.ball.impulse(0.25);
    }
  }

  toggleHeadphones() {
    this.headphones = !this.headphones;
    this.player.ball.setHeadphones(this.headphones);
    this.audio.play('click', 0.6);
    this.computer.toast(this.headphones ? '🎧 fones colocados — você ouve menos!' : '🔊 fones fora');
  }

  // ------------------------------------------------------------------ números
  earnedLeft(w: Worker, act: ActivityId) {
    return ACT[act].funMax - (w.earned[act] ?? 0);
  }

  addFun(w: Worker, v: number, label?: string, pos?: THREE.Vector3) {
    if (w.fired || v <= 0) return;
    // arriscar compensa: com o chefe fora da sala a diversão rende mais
    if (this.bosses.some((b) => b.out && !b.blind)) v *= B.RISK_FUN_MUL;
    // cupom (1×/dia por cópia): a primeira diversão longe da mesa vale ×2 por 20 s
    if (w.isPlayer && !w.seated) {
      if (this.cupomT <= 0 && this.cupomLeft > 0) {
        this.cupomLeft--;
        this.cupomT = 20;
        this.hud.toastWorld('🎟 CUPOM: FUN ×2 por 20 s');
      }
      if (this.cupomT > 0) {
        v *= 2;
        if (label) label = `${label} ×2`;
      }
    }
    // juntos rende mais (e faz mais barulho, em `noise`)
    const crowd = this.companions(w);
    if (crowd > 0) {
      v *= 1 + SOCIAL.funPer * crowd;
      if (label) label = `${label} ×${String(1 + SOCIAL.funPer * crowd).replace('.', ',')} juntos`;
    }
    if (w.act && CAPPED.includes(w.act)) {
      v = Math.min(v, this.earnedLeft(w, w.act));
      if (v <= 0) return;
      w.earned[w.act] = (w.earned[w.act] ?? 0) + v;
    }
    const before = w.fun;
    if (w.isPlayer) this.lastFunT = this.time;
    w.fun = Math.min(B.FUN_MAX, w.fun + v);
    if (!w.isPlayer || this.attract) return;
    this.funAccum += w.fun - before;
    if (this.funAccum >= 1 || label) {
      const shown = label ? `+${Math.max(1, Math.round(v))} ${label}` : `+${Math.floor(this.funAccum)}`;
      let at = pos?.clone();
      if (!at) {
        at = this.pc.mode === 'seated'
          ? this.player.desk.screenCenter.clone().addScaledVector(this.player.desk.screenNormal, 0.25).add(new THREE.Vector3(0, 0.25, (Math.random() - 0.5) * 0.5))
          : this.player.ball.headWorld().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.7, 0));
      } else at.y += 0.4;
      this.juice.text(at, shown, 'ft-fun', 0.9);
      this.audio.play('fun', 0.35, Math.floor(w.fun / 8));
      this.funAccum = label ? this.funAccum : this.funAccum - Math.floor(this.funAccum);
    }
  }

  /**
   * Soma Suspeita. Subir sempre tem um motivo que aparece na tela: `reason` vira "+N 👁 motivo" no mundo (em `at`) e
   * na lista embaixo da barra. `why` separa as fontes no resumo do dia. Valor negativo (alívio) não precisa de motivo.
   */
  addSus(w: Worker, v: number, why: SusSource, reason: string, at?: THREE.Vector3): void;
  addSus(w: Worker, v: number): void;
  addSus(w: Worker, v: number, why: SusSource = 'chefe', reason = '', at?: THREE.Vector3) {
    if (w.fired) return;
    if (w.remote) this.net?.sus(w, v, reason);
    const before = w.sus;
    w.sus = THREE.MathUtils.clamp(w.sus + v, 0, B.SUS_MAX);
    w.peakSus = Math.max(w.peakSus, w.sus);
    if (w.isPlayer && !this.attract && w.sus > before) {
      const gain = w.sus - before;
      this.susLog[why] = (this.susLog[why] ?? 0) + gain;
      this.susRecent[why] = (this.susRecent[why] ?? 0) + gain;
      this.showSus(reason || SUS_SOURCE_LABEL[why], gain, at);
    }
  }

  /** "+N 👁 motivo": junta o que sobe aos poucos (ele vendo você passear, tarefa esperando) e mostra no máximo a cada 0,6 s. */
  private showSus(reason: string, gain: number, at?: THREE.Vector3) {
    const fx = this.susFx.get(reason) ?? { acc: 0, t: -99 };
    fx.acc += gain;
    if (at) fx.at = at.clone();
    this.susFx.set(reason, fx);
    if (fx.acc < 1 || this.time - fx.t < 0.6) return;
    const n = Math.round(fx.acc);
    fx.acc = 0;
    fx.t = this.time;
    this.hud.susFeed(reason, n);
    const pos = fx.at ? fx.at.clone().setY(Math.max(fx.at.y, 1.9)) : this.player.ball.headWorld().add(new THREE.Vector3(0, 0.8, 0));
    this.juice.text(pos, `+${n} 👁 ${reason}`, 'ft-sus', 1.4);
  }

  /** Suspeita que o chefe dá ao ver/ouvir algo (× curva do dia); `at` é de onde ele viu (a cabeça dele, por padrão). */
  bossSus(w: Worker, v: number, reason: string, at?: THREE.Vector3) {
    const s = v * this.mul;
    this.addSus(w, s, 'chefe', reason, at ?? this.bosses.find((b) => b.out)?.ball.headWorld());
    return Math.round(s);
  }

  /** Tela proibida aberta (mesmo que o dono não esteja sentado). */
  isForbidden(w: Worker) {
    if (w.isPlayer && !this.attract) return this.computer.forbiddenOpen;
    if (w.remote) return w.netForbidden;
    return w.seated && w.botScreen !== 'planilha';
  }

  noise(p: THREE.Vector3, radius: number, src: Worker | null, throttle = 0) {
    if (src === this.player) radius *= Math.max(0.25, Math.pow(SHOP_FX.slippers, this.shop.count('pantufas')));
    if (this.tricks.has('ouvido')) radius *= TRICK_FX.hear;
    if (src) radius *= 1 + SOCIAL.noisePer * this.companions(src);
    if (radius <= 0) return;
    if (throttle > 0) {
      this.noiseT -= throttle;
      if (this.noiseT > 0) return;
      this.noiseT = 0.6;
    }
    for (const b of this.bosses) b.hear(p, radius, src);
  }

  /** Despistou o chefe no banheiro. */
  onLostInBathroom(w: Worker) {
    const s = this.bossSus(w, 15, 'fugiu dele');
    if (w.isPlayer) {
      this.hud.popup('warn', 'DESPISTOU!', `ele perdeu você de vista · +${s} Suspeita`);
      this.audio.play('confirm', 0.8);
    }
  }

  /** O chefe vê um funcionário em pé (chamado pela visão do chefe). */
  onSeen(w: Worker, b: Boss, dt: number) {
    if (w.fired) return;
    if (w.physical) {
      w.physicalSeen += dt;
      if (w.isPlayer && !this.physicalWarned && !this.attract) {
        this.physicalWarned = true;
        this.hud.popup('warn', 'ELE ESTÁ VENDO!', 'pare a farra!');
        this.audio.play('warn', 1);
      }
      if (w.physicalSeen > FLAGRANTE_FISICO) {
        const id = (w.act ?? (w.isPlayer ? this.pc.physicalAct : null)) as ActivityId | null;
        const what = id && ACT[id] ? ACT[id].label.toLowerCase() : 'farra';
        if (w.seated && (w.isPlayer || w.remote) && !this.attract) {
          // já sentado (lanche/basquete na mesa): não tem para onde correr — leva a bronca na hora
          w.physicalSeen = 0;
          if (w.isPlayer) this.pc.bail();
          const s = this.bossSus(w, 25, `${what} na mesa`, b.ball.headWorld());
          w.flagged = true;
          this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'na mesa, é?!', 'ft-boss', 1.6);
          this.net?.pop(w, 'warn', 'ELE TE VIU!', `${what} na mesa: +${s} Suspeita`);
          if (w.isPlayer) {
            this.hud.popup('warn', 'ELE TE VIU!', `${what} na mesa: +${s} Suspeita`);
            this.audio.play('warn', 1);
          }
        } else if (w.isPlayer && !this.attract && b.state !== 'chase') {
          // perseguição! corra para a sua mesa
          w.physicalSeen = 0;
          this.pc.bail();
          b.startChase(w);
          this.hud.popup('caught', 'CORRE!!!', `${what} — sente na SUA mesa antes que ele te alcance!`);
          this.hud.setBanner('🏃 O CHEFE ESTÁ TE PERSEGUINDO', '');
          this.audio.play('warn', 1);
          this.audio.duck(0.2, 4);
          this.juice.shake(0.4);
          this.r.u.uAberration.value = 0.03;
        } else if (w.remote && b.state !== 'chase') {
          w.physicalSeen = 0;
          b.startChase(w);
          this.net?.pop(w, 'caught', 'CORRE!!!', `${what} — sente na SUA mesa antes que ele te alcance!`);
        } else if (!w.isPlayer || this.attract) this.fire(w, b, `Flagrante: ${what}`);
      }
      return;
    }
    // em pé longe da mesa e sem álibi (algo na mão, tarefa do chefe em andamento ou reunião convocada)
    const atDesk = w.ball.pos.distanceTo(w.desk.standPos) < 2.6;
    const alibi = (w.isPlayer && (!!this.pc.carrying || this.tasks.active.length > 0 || this.shop.has('prancheta'))) || !!this.meetingCall;
    if (!atDesk && !alibi) {
      this.bossSus(w, SUS_WANDER_IN_CONE * dt, 'passeando à toa', b.ball.headWorld());
      if (w.remote && !this.netWarned.has(w)) {
        this.netWarned.add(w);
        this.net?.pop(w, 'warn', 'PASSEANDO?', 'sem tarefa nem café na mão, a Suspeita sobe');
      }
      if (w.isPlayer && !this.wanderWarned && !this.attract) {
        this.wanderWarned = true;
        this.hud.popup('warn', 'PASSEANDO?', 'sem tarefa nem café na mão, a Suspeita sobe');
      }
    }
  }

  // ------------------------------------------------------------------ callbacks do chefe
  subtitle(text: string, pos?: THREE.Vector3) {
    if (!this.settings.subtitles || this.attract) return;
    let t = text;
    if (pos) t = `${text} — ${this.dirWord(pos)}`;
    this.hud.subtitle(t);
  }

  /** Direção de um ponto em relação à câmera, em palavras. */
  private dirWord(pos: THREE.Vector3) {
    const a = this.relAngle(pos);
    return Math.abs(a) < 0.6 ? 'à frente' : Math.abs(a) > 2.4 ? 'atrás' : a > 0 ? 'à direita' : 'à esquerda';
  }

  private relAngle(pos: THREE.Vector3) {
    const cam = this.r.camera;
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    const rgt = new THREE.Vector3(-f.z, 0, f.x);
    const v = new THREE.Vector3().subVectors(pos, cam.position).setY(0);
    return Math.atan2(v.dot(rgt), v.dot(f));
  }

  onDoor(b: Boss) {
    this.audio.play('door', (b.kind === 'dono' ? 0.6 : 1) * (this.tricks.has('portaMuda') ? TRICK_FX.doorVol : 1));
    if (b.kind === 'dono') this.audio.play('keys', 0.8);
    this.audio.duck(0.35, 6);
    this.subtitle(b.kind === 'dono' ? '[O DONO saiu da sala]' : '[PORTA DO CHEFE]', b.pos);
    if (this.attract) return;
    if (b.kind !== 'x9') this.hud.setBanner(b.kind === 'dono' ? '👑 O DONO ESTÁ ANDANDO' : '⚠ CHEFE EM RONDA', b.kind === 'dono' ? 'gold' : '');
    this.juice.shake(0.18);
    this.r.u.uAberration.value = 0.012;
    this.r.u.uDanger.value = 0.9;
    // a imagem perde a cor e dá um zoom curto (susto)
    this.desatPulse = 0.5;
    this.r.fovKick = -6;
    // colegas reagem: "!" em cima de cada um
    for (const w of this.workers)
      if (!w.isPlayer && !w.fired) setTimeout(() => !w.fired && this.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), '❗', 'ft-emote', 1.2), Math.random() * 600);
    // primeira ronda do navegador: explica o que é o chefe (uma vez só)
    if (b.kind === 'chefe' && seenOnce('ronda-chefe')) this.hud.popup('info', 'CHEFE EM RONDA', 'ele vem checar as telas · Suspeita cheia = flagrante');
  }

  onBossBack(b: Boss) {
    // truque "volta rápida": às vezes ele sai de novo logo em seguida
    if (this.auth && this.tricks.has('voltaRapida') && b === this.bosses[0] && Math.random() < TRICK_FX.comeBack) this.comeBackAt = this.time + TRICK_FX.comeBackDelay;
    if (this.bosses.some((x) => x.busy)) return;
    this.hud.setBanner(null);
  }

  onCheckStart(b: Boss, w: Worker) {
    if (w.isPlayer && !this.attract && w.seated) this.audio.play('heartbeat', 0.9, 1);
    // mesa vazia: só desconfia se você não está numa tarefa dele
    const errand = (w.isPlayer && (this.tasks.active.length > 0 || this.tasks.deliveringToBoss() || this.pc.carrying === 'doc')) || !!this.meetingCall || w.coatUntil > this.time;
    if (!w.seated && !w.fired && !errand) {
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'cadê?', 'ft-boss', 1.4);
      this.bossSus(w, 5, 'mesa vazia', b.ball.headWorld());
    }
  }

  onIdentify(b: Boss, w: Worker, mode: 'check' | 'flagrante' | 'inspecao' | 'audit' | 'chase') {
    if (w.fired) return;
    const forbidden = this.isForbidden(w);
    // Suspeita cheia com o chefe na frente é demissão, seja qual for o motivo da checagem
    if (w.sus >= B.SUS_MAX) return this.fire(w, b, 'Suspeita no máximo (flagrante)');
    if (mode === 'flagrante') this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'falso alarme', 'ft-boss', 1.5);
    if (forbidden && !w.seated) {
      // mesa vazia com jogo aberto
      const s = this.bossSus(w, 25, 'jogo aberto na mesa vazia', b.ball.headWorld());
      w.flagged = true;
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'JOGANDO?!', 'ft-boss', 1.6);
      this.net?.pop(w, 'warn', 'ELE VIU SEU PC!', `jogo aberto na mesa vazia: +${s} Suspeita`);
      if (w.isPlayer) {
        this.hud.popup('warn', 'ELE VIU SEU PC!', `jogo aberto na mesa vazia: +${s} Suspeita`);
        this.audio.play('warn', 1);
      }
      return;
    }
    if (mode === 'chase' && w.seated && !forbidden) {
      const s = this.bossSus(w, 25, 'escapou por pouco', b.ball.headWorld());
      w.flagged = true;
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'hmmmm...', 'ft-boss', 1.6);
      // escapou da demissão, mas custa caro: aviso âmbar, sem confete
      this.net?.pop(w, 'warn', 'ESCAPOU... POR POUCO', `não foi demitido, mas: +${s} de Suspeita`);
      if (w.isPlayer) {
        this.hud.popup('warn', 'ESCAPOU... POR POUCO', `não foi demitido, mas: +${s} de Suspeita`);
        this.audio.play('clutch', 0.4);
        this.r.u.uFlash.value = 0.3;
      }
      return;
    }
    if (forbidden && w.seated) {
      // segunda tela (1×/dia por cópia): a planilha do outro monitor salva você
      if (w.isPlayer && !this.attract && this.screen2Left > 0) {
        this.screen2Left--;
        this.computer.open(this.computer.home, this.time);
        this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'hm… planilha.', 'ft-boss', 1.4);
        this.hud.popup('good', '🖥 SEGUNDA TELA!', `ele olhou a planilha do outro monitor · resta${this.screen2Left === 1 ? '' : 'm'} ${this.screen2Left} hoje`);
        this.audio.play('clutch', 0.6);
        return;
      }
      // jogador: a Suspeita dispara enquanto ele olha a tela (dá a chance de fechar a janela); demite ao chegar no máximo
      if (w.isPlayer && !this.attract) {
        w.flagged = true;
        this.hud.popup('caught', 'ELE VIU!', 'feche a janela AGORA — a Suspeita está disparando!');
        this.audio.play('warn', 1);
        return;
      }
      return this.fire(w, b, b.kind === 'dono' ? 'O Dono viu sua tela' : 'Pego com a janela aberta');
    }
    if (w.isPlayer && !this.attract && w.seated) {
      const since = this.time - this.computer.lastSafeSwitch;
      if (since <= this.clutchWindow) this.clutch(b);
      else if (since < 3) this.juice.text(this.player.desk.screenCenter.clone().addScaledVector(this.player.desk.screenNormal, 0.3).setY(1.45), 'ufa...', 'ft-small', 1.2);
    }
    if (w.remote && w.seated) this.net?.ident(w, b);
    if (w.crumbs >= 2) {
      const s = this.bossSus(w, B.CRUMBS_PENALTY, 'migalhas na mesa', w.desk.screenCenter);
      if (w.isPlayer) this.hud.popup('warn', 'MIGALHAS!', `+${s} de Suspeita · segure C para limpar`);
    }
    if (w.puddle) {
      const s = this.bossSus(w, 10, 'café derramado na mesa', w.desk.screenCenter);
      if (w.isPlayer) this.hud.popup('warn', 'CAFÉ NA MESA!', `+${s} de Suspeita a cada vistoria até amanhã`);
    }
    w.flagged = false;
    if (!w.isPlayer || this.attract) this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), '👍', 'ft-boss', 1.0);
  }

  onCheckHold(b: Boss, w: Worker, dt: number) {
    if (w.fired) return;
    if (!this.isForbidden(w) || !w.seated) return;
    if (w.isPlayer && !this.attract) {
      // flagrante: Suspeita sobe rápido (sem curva do dia) e só demite ao bater 100%
      this.addSus(w, SUS_CAUGHT_RATE * dt, 'chefe', 'ele está vendo sua tela', b.ball.headWorld());
      if (w.sus >= B.SUS_MAX) this.fire(w, b, b.kind === 'dono' ? 'O Dono viu sua tela' : 'Pego com a janela aberta');
      return;
    }
    this.fire(w, b, 'Reabriu a janela na frente do chefe');
  }

  onCheckEnd(_b: Boss, w: Worker) {
    if (w.isPlayer && !w.fired && !this.attract && w.seated) this.audio.play('bell', 0.15);
  }

  // ------------------------------------------------------------------ clutch / demissão
  private clutch(b: Boss) {
    const p = this.player;
    p.clutches++;
    this.dayClutches++;
    this.addFun(p, B.CLUTCH_FUN, 'CLUTCH');
    this.juice.hitstop(0.07);
    this.juice.slowmo(0.22, 0.6);
    this.juice.shake(0.35);
    this.r.u.uFlash.value = 0.75;
    this.r.u.uFlashColor.value.set('#fff6c8');
    this.r.u.uAberration.value = 0.03;
    this.r.fovKick = -9;
    this.audio.play('clutch', 1);
    this.audio.duck(0.2, 2);
    this.hud.popup('clutch', 'CLUTCH!', `+${B.CLUTCH_FUN} FUN · por um triz`);
    const c = p.desk.screenCenter.clone().addScaledVector(p.desk.screenNormal, 0.35);
    this.juice.confetti(c, 80, 4);
    this.juice.sparks(c, '#ffd23f', 30, 3);
    b.ball.impulse(0.7);
    this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), '?!', 'ft-boss', 1.6);
    this.pc.clutchPeek = 1.5;
  }

  fire(w: Worker, b: Boss, reason: string) {
    if (w.fired) return;
    w.fired = true;
    // pego com o item da missão: o chefe toma de volta (volta para a gaveta / para a sala dele)
    if (this.auth) this.items.confiscate(w);
    this.net?.fired(w, b, reason);
    if (w.isPlayer) this.tasks.closePicker();
    w.ball.setEye('caught');
    w.ball.impulse(1.2);
    w.ball.lying = 0;
    w.ball.setSleeping(false);
    if (w.botSpot) {
      w.botSpot.busy = null;
      w.botSpot = null;
    }
    b.ball.setEye('alert');
    b.ball.impulse(0.8);
    b.glare(w.ball.pos, w.isPlayer && !this.attract ? 2.8 : 1.2);
    this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'DEMITIDO!', 'ft-boss', 1.8);
    if (w.isPlayer && !this.attract) {
      this.firedReason = reason;
      // o 1º dia é de aprender: não gasta vida. No multi quem conta as vidas é o host (chega no fim do dia).
      const learning = this.dayIndex === 0;
      if (!learning && !this.lostToday) {
        this.lostToday = 'demitido';
        if (!this.net) this.strikes++;
      }
      this.pc.dropCarry();
      // multi: o que você tinha do chefe passa para os colegas que sobraram
      if (this.net) this.net.handoff(this.tasks.pendingKinds());
      this.computer.open(this.computer.home, this.time);
      this.juice.hitstop(0.35);
      this.juice.shake(0.6);
      this.r.u.uFlash.value = 0.6;
      this.r.u.uFlashColor.value.set('#ff2a40');
      this.r.u.uAberration.value = 0.04;
      this.audio.play('caught', 1);
      this.audio.play('stamp', 1);
      this.audio.duck(0.15, 3);
      this.hud.popup('caught', 'PEGO!', reason);
      setTimeout(() => {
        if (!this.running) return;
        const left = RUN.lives - this.strikes - (this.net && !learning ? 1 : 0);
        this.hud.popup('fired', 'DEMITIDO',
          learning ? 'o 1º dia não gasta vida · amanhã você volta sem Suspeita'
          : left > 0 ? `−1 vida (restam ${left}) · amanhã você volta sem Suspeita` : 'acabaram suas vidas');
        this.audio.play('stamp', 1);
        this.juice.shake(0.4);
      }, 900);
      this.pc.cine = { t: 2.8 };
      this.pc.setMode('cinematic');
      this.r.canvas.classList.remove('nocursor');
    } else {
      this.audio.play3D('caught', w.ball.pos, 0.7);
      this.juice.smoke(w.ball.headWorld(), 14, '#cfd6e4');
      if (!this.attract) this.subtitle(`[${w.name} foi demitido(a)!]`, w.ball.pos);
      setTimeout(() => {
        if (!w.fired) return;
        w.ball.setGhost(true);
        w.ball.hoverHeight = 1.7;
        w.ball.setEye('bored');
        if (this.attract) setTimeout(() => this.unfire(w), 4000);
      }, 1500);
    }
    // solo: demitido = o expediente acaba na hora; multi: quando todos foram demitidos
    if (!this.attract && (this.workers.every((x) => x.fired) || (!this.net && w.isPlayer))) {
      this.allFiredT = 2.8;
      this.allFiredPending = true;
    }
  }

  /** O jogador já perdeu todas as vidas da run (no multi vira espectador até o fim dela). */
  get outOfLives() {
    return this.strikes >= RUN.lives;
  }

  /** Meta de FUN de hoje (no multi, do time). */
  get goal() {
    const players = this.net ? this.workers.filter((w) => w.isPlayer || w.remote).length : 1;
    return funGoal(this.dayIndex, players);
  }

  /** FUN que conta para a meta: o seu, ou a soma do time (demitido conta metade). */
  get goalFun() {
    const humans = this.net ? this.workers.filter((w) => w.isPlayer || w.remote) : [this.player];
    return humans.reduce((a, w) => a + w.fun * (w.fired ? RUN.firedKeepFun : 1), 0);
  }

  private unfire(w: Worker) {
    w.fired = false;
    w.sus = 10;
    w.ball.setGhost(false);
    w.ball.setEye('normal');
    w.botState = 'seated';
    this.seatBall(w);
  }

  // ------------------------------------------------------------------ rondas e eventos
  /** FUN de missão: o valor anunciado, sem multiplicadores (risco, juntos, cupom). */
  missionFun(v: number, label: string) {
    const w = this.player;
    if (w.fired || v <= 0) return;
    this.lastFunT = this.time;
    w.fun = Math.min(B.FUN_MAX, w.fun + v);
    this.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.7, 0)), `+${Math.round(v)} ${label}`, 'ft-fun', 1.6);
    this.audio.play('fun', 0.5, Math.floor(w.fun / 8));
  }

  /** Vale de missão (no multi, vai para o cofre do time pelo host). */
  missionVale(vd: number) {
    if (this.net && !this.net.isHost) this.net.vale(vd);
    else {
      this.wallet += vd;
      this.net?.syncShop();
    }
    this.dayVd += vd;
  }

  /** Visto segurando um item de missão: "O QUE É ISSO?!" e a perseguição de demissão. */
  caughtWithItem(w: Worker, b: Boss, it: MItem) {
    const name = it.kind === 'aquario' ? 'MEU AQUÁRIO' : 'MEU GRAMPEADOR';
    this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'O QUE É ISSO?!', 'ft-boss', 1.8);
    this.audio.play3D('yell', b.pos, 1);
    this.subtitle(`[chefe: "EI! ISSO É O ${name}?!"]`, b.pos);
    if (w.isPlayer) {
      this.hud.popup('caught', 'O QUE É ISSO?!', 'o chefe viu o item — passe (botão direito), largue (Q) ou se esconda no banheiro');
      this.audio.play('warn', 1);
    } else this.net?.pop(w, 'caught', 'O QUE É ISSO?!', 'o chefe viu o item — passe, largue ou se esconda');
    b.startChase(w, true);
  }

  /** Água do aquário no chão (evidência para o chefe). */
  spillEvidence(pos: THREE.Vector3, w: Worker) {
    this.pc.makePuddle(pos, w, 'água no chão');
  }

  /** Campeonato de Ball Ops: os colegas de verdade na arena (multi) e os tiros deles que ainda não viraram bala. */
  private arenaPeers = new Map<string, { name: string; x: number; y: number; a: number; alive: boolean; t: number }>();
  private arenaShotsIn: { by: string; x: number; y: number; a: number }[] = [];

  /** O que o Ball Ops enxerga e para onde manda (no solo, só os bots). */
  readonly arenaLink: ArenaLink = (() => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      get on() {
        return g.missions.lanOn;
      },
      peers: () => [...g.arenaPeers].filter(([, p]) => g.time - p.t < 2).map(([id, p]) => ({ id, name: p.name, x: p.x, y: p.y, a: p.a, alive: p.alive })),
      shots: () => {
        const s = g.arenaShotsIn;
        g.arenaShotsIn = [];
        return s;
      },
      send: (x: number, y: number, a: number, alive: boolean) => g.net?.arena(x, y, a, alive, false),
      shot: (x: number, y: number, a: number) => g.net?.arena(x, y, a, true, true),
      kill: () => g.missions.lanKill(),
      opened: () => g.missions.lanOpened(),
    };
  })();

  /** Multi: um colega mexeu (ou atirou) na arena. */
  arenaIn(by: string, name: string, x: number, y: number, a: number, alive: boolean, shot: boolean) {
    this.arenaPeers.set(by, { name, x, y, a, alive, t: this.time });
    if (shot) this.arenaShotsIn.push({ by, x, y, a });
  }

  /** Casaco na mão (do cabideiro para a cadeira). */
  private hasCoat = false;
  private coats = new Map<Worker, THREE.Mesh>();

  /** Casaco pendurado no encosto da cadeira de `w`. */
  showCoat(w: Worker, on: boolean) {
    let m = this.coats.get(w);
    if (!m && on) {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: '#6b4c9a', roughness: 0.9 }));
      m.position.set(0, 0.85, 0.22);
      w.desk.chair.add(m);
      this.coats.set(w, m);
    }
    if (m) m.visible = on;
  }

  /** Elevador no meio do expediente (salgadinho): `down` = para o térreo. Leva uns segundos, parado. */
  rideMidday(down: boolean) {
    if (this.rideT > 0) return;
    this.rideT = 2.2;
    this.rideToLobby = down;
    if (down) this.office.elevatorOpen = 0;
    else this.office.lobby.open = 0;
    this.audio.play('ding', 0.6);
    this.hud.toastWorld(down ? '🛗 descendo ao térreo…' : '🛗 subindo ao 12º…');
  }

  private updateRide(realDt: number) {
    if (this.rideT <= 0) return;
    this.rideT -= realDt;
    if (this.rideT > 0) return;
    const dz = this.rideToLobby ? LOBBY_DZ : -LOBBY_DZ;
    this.player.ball.pos.z += dz;
    this.pc.camPos.z += dz;
    if (this.rideToLobby) this.office.lobby.open = 1;
    else this.openElevatorDoorBriefly();
    this.audio.play('ding', 0.9);
  }

  /** O papo com o chefe acabou (tempo, distância ou ele saiu correndo). */
  onTalkEnd(b: Boss, w: Worker) {
    if (w.isPlayer) this.hud.toastWorld('💬 o papo acabou');
    this.subtitle('[chefe: "bom, de volta ao trabalho!"]', b.pos);
  }

  /** O chefe fica na sala (telefone da agenda, ramal falso) por `secs`. */
  holdBoss(secs: number) {
    this.ramalHold = Math.max(this.ramalHold, this.time + secs);
  }

  rondaTargets(count = 3): BossTarget[] {
    const alive = this.workers.filter((w) => !w.fired);
    const flagged = alive.filter((w) => w.flagged);
    const ranked = alive.filter((w) => !w.flagged).sort((a, b) => b.contribution - a.contribution + (Math.random() - 0.5) * 2);
    let list = [...flagged, ...ranked.slice(0, Math.max(0, count - flagged.length))];
    if (this.postitActive && list.includes(this.player)) {
      list = list.filter((w) => w !== this.player);
      this.postitActive = false;
      this.office.extras.postit.visible = false;
    }
    const t: BossTarget[] = [];
    for (const w of list) {
      if (Math.random() < 0.3) t.push({ kind: 'point', p: this.office.P.ring[Math.floor(Math.random() * 4)].clone(), stay: 0.8, why: 'patrol' });
      t.push({ kind: 'desk', w, mode: 'check' });
    }
    // passa pela sala de descompressão em metade das rondas
    if (Math.random() < 0.55) {
      const L = this.office.P.lounge;
      t.splice(Math.floor(Math.random() * (t.length + 1)), 0, { kind: 'point', p: L[Math.floor(Math.random() * L.length)].clone(), stay: 1.6, why: 'patrol' });
    }
    return t;
  }

  /** Próximo trecho da ronda constante (X9): duas mesas e alguns pontos do salão. */
  patrolTargets(): BossTarget[] {
    const P = this.office.P;
    const pts = [...P.ring, ...P.lounge, W(10, 6.5), W(10, 17.6), W(3.6, 12), W(16.4, 12), P.printer.clone().setZ(P.printer.z - 1.2), P.coffee.clone().setZ(P.coffee.z - 1.3)];
    const t: BossTarget[] = this.rondaTargets(2).filter((x) => x.kind === 'desk');
    for (let i = 0; i < 3; i++) t.splice(Math.floor(Math.random() * (t.length + 1)), 0, { kind: 'point', p: pts[Math.floor(Math.random() * pts.length)].clone(), stay: 0.8 + Math.random() * 1.6, why: 'patrol' });
    return t;
  }

  private updateDirector(dt: number) {
    const main = this.bosses[0];
    const d = this.bossToday;
    const k = this.k;
    // calmaria depois do elevador: o chefe fica na sala e o barulho de ninguém se acumula
    const calm = this.time < this.calm;
    if (calm) this.instinct = 0;
    // o chefe não sai: no telefone (ramal falso) ou atendendo um cliente
    const held = this.time < this.ramalHold || this.clients.meeting || !!main.talkW;
    // truque "volta rápida": "esqueci uma coisa!"
    if (this.comeBackAt > 0 && this.time >= this.comeBackAt) {
      this.comeBackAt = -1;
      if (!main.busy && !held) {
        main.startRonda(this.rondaTargets(2), 'esqueci');
        this.subtitle('[chefe: "ah, esqueci uma coisa!"]', main.pos);
      }
    }
    // truque "estagiário": o X9 ronda junto, no ritmo dele
    const intern = this.bosses.find((b) => b !== main && b.kind === 'x9');
    if (intern && !intern.busy && !calm && this.time - intern.lastRondaEnd > 45 && Math.random() < dt / 35) intern.startRonda(this.rondaTargets(2), 'estagiário');
    if (!main.busy && !calm && !held) {
      const since = this.time - main.lastRondaEnd;
      if (this.instinct >= B.INSTINCT_THRESHOLD && since >= d.minInterval * k) {
        this.instinct = 0;
        main.startRonda(this.rondaTargets(), 'instinto');
      } else if (
        since >= d.minInterval * k * 0.5 &&
        this.agenda.untilNextOut() > AGENDA.quietBefore &&
        Math.random() < (dt * this.pressure * AGENDA.clockMul) / (d.clockRonda * k)
      ) {
        // a rotina é a agenda; o dado só sobra para não deixar o salão 100% previsível
        main.startRonda(this.rondaTargets(), 'relógio');
      }
    }
    this.agenda.update();
    this.distract.update(dt);
    for (const w of this.workers) {
      // Suspeita cheia de qualquer um: o chefe sai atrás dele para demitir (se escapar, tenta de novo em 12 s)
      if (w.fired || w.sus < B.SUS_MAX || w.hidden || this.time < w.flagranteRetry) continue;
      if (main.state === 'chase' || main.away || this.bosses.some((b) => b.chaseW === w)) continue;
      w.flagranteRetry = this.time + 12;
      const t: BossTarget = { kind: 'desk', w, mode: 'flagrante' };
      if (main.out && main.state !== 'wait' && main.state !== 'leave') main.startChase(w, true);
      else if (main.busy) main.prioritize(t);
      else main.startRonda([t], 'flagrante');
      if (w.isPlayer) {
        this.hud.popup('caught', 'SUSPEITA NO MÁXIMO!', 'o chefe está vindo te demitir — baixe a Suspeita ou fuja!');
        this.audio.play('warn', 1);
      } else this.net?.pop(w, 'caught', 'SUSPEITA NO MÁXIMO!', 'o chefe está vindo te demitir');
    }
    this.updateEvents(dt);
    this.tasks.update(dt);
    this.clients.update(dt);
  }

  /** Truque "câmera na copa": grava em ciclos (luz vermelha); quem estiver exposto na copa enquanto ela grava leva Suspeita. */
  private updateCopaCam(dt: number) {
    const cam = this.office.copaCam;
    if (!this.tricks.has('camera') || this.shop.has('fita')) {
      this.office.setCopaRec(false);
      return;
    }
    this.camT = (this.camT + dt) % (TRICK_FX.camOn + TRICK_FX.camOff);
    const rec = this.camT < TRICK_FX.camOn;
    this.office.setCopaRec(rec);
    const p = this.player;
    if (!rec || p.fired || this.cover !== 'exposto') return;
    if (p.ball.pos.z < W(0, 20.2).z) return;
    this.addSus(p, TRICK_FX.camSus * this.mul * dt, 'chefe', 'câmera da copa gravou', cam.getWorldPosition(new THREE.Vector3()));
  }

  /** Eventos agendados (host/solo): cada um toca na sua hora; os que duram são cuidados aqui. */
  private updateEvents(dt: number) {
    // a 1ª vez pode adiantar (chance × pressão); a 2ª só depois da 1ª
    const roll = this.time >= this.calm && Math.random() < dt * EVENT_TIMING.rate * this.pressure;
    for (const e of this.eventPlan) {
      if (e.fired || (this.time < e.at && !(e.roll && roll))) continue;
      if (!e.roll && this.eventPlan.some((o) => o.roll && !o.fired)) continue;
      // a 2ª vez espera a 1ª acabar
      if (this.eventBusy(e.id)) {
        e.at = this.time + 1;
        continue;
      }
      e.fired = true;
      this.fireEvent(e.id);
    }
    if (this.printerJam > 0) {
      this.printerJam -= dt;
      if (this.printerJam <= 0) this.endJam(false);
    }
    if (this.blackout) {
      this.blackoutT -= dt;
      if (this.blackoutT <= 0) this.endBlackout(false);
    }
    if (this.dayEvents.includes('blecaute')) {
      const target = this.blackout ? 0 : 1;
      this.lightLevel += (target - this.lightLevel) * Math.min(1, dt * (this.blackout ? 10 : 3));
      this.office.setLights(this.lightLevel);
    }
    if (this.internetT > 0) {
      this.internetT -= dt;
      if (this.internetT <= 0) this.endInternet();
    }
    if (this.meetingCall) this.updateMeetingCall(dt);
    // comida na cozinha: os bots beliscam até perto do julgamento do Dono
    if (this.pizzaLeft > 0 && (this.pizzaJudgeAt < 0 || this.time < this.pizzaJudgeAt - 5))
      for (const w of this.workers) if (!w.isPlayer && !w.remote && !w.fired && Math.random() < dt * 0.01) this.eatPizza(w);
    if (this.pizzaJudgeAt >= 0 && this.time >= this.pizzaJudgeAt) {
      this.pizzaJudgeAt = -1;
      this.dono.startRonda([{ kind: 'point', p: this.office.P.pizza.clone().add(new THREE.Vector3(0, 0, -1.4)), stay: 3, why: 'kitchen' }], 'pizza');
      this.pizzaJudgePending = true;
    }
  }

  /** O evento ainda está acontecendo (a 2ª vez espera). */
  private eventBusy(id: EventId) {
    switch (id) {
      case 'impressora':
        return this.printerJam > 0;
      case 'blecaute':
        return this.blackout;
      case 'internet':
        return this.internetT > 0;
      case 'reuniao':
        return !!this.meetingCall;
      case 'ronda':
        return this.x9.patrolling;
      case 'pizza':
      case 'bolo':
        return this.pizzaLeft > 0 || this.pizzaJudgeAt >= 0 || this.pizzaJudgePending;
      default:
        return false;
    }
  }

  private fireEvent(id: EventId) {
    const main = this.bosses[0];
    const P = this.office.P;
    const ronda = (ts: BossTarget[], why: string) => (main.busy ? main.queue.push(...ts) : main.startRonda(ts, why));
    switch (id) {
      case 'boasvindas': {
        this.audio.play('gong', 0.8);
        this.hud.popup('info', 'BOAS-VINDAS!', `${main === this.x9 ? 'o X9' : 'o chefe'} vai passar em TODAS as mesas`);
        this.net?.announce('boasvindas');
        ronda(this.workers.filter((w) => !w.fired).map((w): BossTarget => ({ kind: 'desk', w, mode: 'check' })), 'boas-vindas');
        break;
      }
      case 'impressora':
        this.jamPrinter('o alarme atrai o chefe — destrave (E)');
        break;
      case 'auditoria': {
        const order = this.workers.filter((w) => !w.fired).sort(() => Math.random() - 0.5);
        this.office.drawWhiteboard(['AUDITORIA', ...order.map((w, i) => `${i + 1}. ${w.name}`)]);
        this.hud.popup('warn', 'AUDITORIA!', `ordem: ${order.map((w) => w.name).join(' → ')}`);
        this.audio.play('gong', 0.9);
        this.net?.announce('auditoria', order.map((w) => w.name));
        ronda(order.map((w): BossTarget => ({ kind: 'desk', w, mode: 'audit' })), 'auditoria');
        break;
      }
      case 'blecaute':
        this.office.outside.lightning();
        this.audio.play('thunder', 1);
        this.r.u.uFlash.value = 0.55;
        this.r.u.uFlashColor.value.set('#e6efff');
        this.blackout = true;
        this.blackoutT = BLACKOUT.duration;
        main.setFlashlight(true);
        this.audio.play('blackout', 1);
        this.juice.shake(0.3);
        this.setLed(this.office.breakerLight, '#ff2020');
        this.hud.popup('warn', 'BLECAUTE!', 'telas acesas denunciam — disjuntor na parede da cozinha');
        this.subtitle('[a luz caiu]');
        break;
      case 'pizza':
      case 'bolo':
        this.feast = id;
        this.pizzaLeft = id === 'bolo' ? BOLO.slices : PIZZA.slices;
        this.office.pizzaGroup.visible = true;
        this.office.pizzaSlices.forEach((s) => (s.visible = true));
        for (const w of this.workers) w.pizzaEaten = 0;
        if (id === 'pizza') this.pizzaJudgeAt = Math.min(this.time + PIZZA.judgeAfter, this.duration - 8);
        this.audio.play('bell', 0.8);
        this.feastPopup();
        break;
      case 'internet':
        this.startInternet();
        this.instinct += INTERNET.instinct;
        if (!main.busy) main.startRonda(this.rondaTargets(4), 'internet');
        break;
      case 'ronda':
        if (main !== this.x9) break;
        this.hud.popup('warn', 'RONDA DO X9!', 'ele vai ficar andando pelo salão — fique de olho');
        this.audio.play('gong', 0.8);
        this.net?.announce('ronda');
        main.startPatrol(false);
        break;
      case 'reuniao': {
        this.startMeetingCall();
        const t: BossTarget = { kind: 'point', p: P.speaker.clone().setY(0).add(new THREE.Vector3(1.2, 0, 0)), stay: MEETING_CALL.gather + MEETING_CALL.stay, why: 'patrol' };
        if (main.busy) main.prioritize(t);
        else main.startRonda([t], 'reunião');
        break;
      }
    }
  }

  feastPopup() {
    if (this.feast === 'bolo') this.hud.popup('good', '🎂 ANIVERSÁRIO!', `+${BOLO.fun} FUN por fatia — cada uma deixa migalhas na sua mesa`);
    else this.hud.popup('good', '🍕 PIZZA!', `+${ACT.pizza.fun} FUN por fatia — o Dono confere a bagunça depois`);
  }

  /** Internet caiu: jogos do PC offline (no host o tempo conta; no cliente, o snapshot liga e desliga). */
  startInternet() {
    this.internetT = INTERNET.duration;
    this.computer.offline = true;
    if (this.computer.forbiddenOpen) this.computer.open(this.computer.home, this.time);
    this.audio.play('blackout', 0.5);
    this.hud.popup('warn', '📡 INTERNET CAIU!', 'jogos do PC offline · o chefe vai ver quem está trabalhando');
  }

  endInternet() {
    this.internetT = 0;
    this.computer.offline = false;
    this.audio.play('lightson', 0.6);
    this.hud.popup('info', '📶 INTERNET VOLTOU', 'os jogos do PC voltaram');
  }

  /** Reunião surpresa: todo mundo para a mesa de reunião. */
  startMeetingCall() {
    this.meetingCall = { t: MEETING_CALL.gather, phase: 'gather' };
    this.audio.play('gong', 0.9);
    this.hud.popup('warn', '📣 REUNIÃO SURPRESA!', `vá para a mesa de reunião em ${MEETING_CALL.gather} s`);
  }

  /** Host: no fim do prazo, quem não está perto da mesa de reunião leva Suspeita. */
  private updateMeetingCall(dt: number) {
    const m = this.meetingCall!;
    m.t -= dt;
    if (m.t > 0) return;
    if (m.phase === 'stay') {
      this.meetingCall = null;
      this.hud.popup('info', 'REUNIÃO ENCERRADA', 'de volta ao "trabalho"');
      return;
    }
    const at = this.office.P.speaker;
    for (const w of this.workers) {
      if (w.fired || !(w.isPlayer || w.remote)) continue;
      const here = Math.hypot(w.ball.pos.x - at.x, w.ball.pos.z - at.z) < MEETING_CALL.radius;
      if (here) {
        if (w.isPlayer) this.hud.popup('good', 'PRESENTE ✓', 'o chefe anotou');
        else this.net?.pop(w, 'good', 'PRESENTE ✓', 'o chefe anotou');
        continue;
      }
      const s = this.bossSus(w, MEETING_CALL.sus, 'faltou à reunião', this.office.P.speaker.clone().setY(1.6));
      if (w.isPlayer) {
        this.hud.popup('warn', 'FALTOU À REUNIÃO', `+${s} Suspeita`);
        this.audio.play('sad', 0.7);
      } else this.net?.pop(w, 'warn', 'FALTOU À REUNIÃO', `+${s} Suspeita`);
    }
    m.phase = 'stay';
    m.t = MEETING_CALL.stay;
  }

  private checkPizzaJudge() {
    if (!this.pizzaJudgePending || this.dono.state !== 'stay') return;
    this.pizzaJudgePending = false;
    const eaten = PIZZA.slices - this.pizzaLeft;
    if (eaten >= PIZZA.messLimit) {
      const alive = this.workers.filter((w) => !w.fired && w.pizzaEaten > 0);
      const max = Math.max(...alive.map((w) => w.pizzaEaten), 0);
      const top = alive.filter((w) => w.pizzaEaten === max);
      const who = top[Math.floor(Math.random() * top.length)];
      if (who) this.fire(who, this.dono, `Comeu ${who.pizzaEaten} fatias de pizza`);
    } else this.juice.text(this.dono.ball.headWorld().add(new THREE.Vector3(0, 1.4, 0)), 'cozinha limpa.', 'ft-boss', 1.6);
  }

  /** Uma fatia de pizza ou bolo (bônus de evento, fora das diversões do dia). */
  eatPizza(w: Worker) {
    if (this.pizzaLeft <= 0) return;
    this.pizzaLeft--;
    w.pizzaEaten++;
    const s = this.office.pizzaSlices[this.pizzaLeft];
    if (s) s.visible = false;
    const bolo = this.feast === 'bolo';
    this.addFun(w, bolo ? BOLO.fun : ACT.pizza.fun, w.isPlayer ? (bolo ? 'bolo' : 'pizza') : undefined);
    if (bolo) this.addCrumbs(w);
    this.instinct += ACT.pizza.instinct;
    this.audio.play3D('crunch', this.office.P.pizza, 0.8);
    this.noise(this.office.P.pizza, ACT.pizza.noise, w);
    this.juice.crumbs(this.office.P.pizza.clone().setY(1.0), 8, '#f3b23c');
  }

  /** Migalhas na mesa (o chefe pune 2 ou mais na vistoria; C limpa). */
  addCrumbs(w: Worker) {
    w.crumbs++;
    w.desk.crumbs.visible = true;
  }

  /** Impressora trava (evento do dia ou distração de alguém): o alarme puxa o chefe até lá por um tempo. */
  jamPrinter(sub: string) {
    if (this.printerJam > 0) return;
    const main = this.bosses[0];
    const P = this.office.P;
    this.printerJam = PRINTER_JAM.alarm;
    this.loops.alarm = this.audio.loop('alarm', P.printer.clone().setY(1));
    this.loops.alarm?.setVol(0.9);
    this.setLed(this.office.printerLight, '#ff2020');
    this.hud.popup('warn', 'IMPRESSORA TRAVOU!', sub);
    this.subtitle('[ALARME DA IMPRESSORA]', P.printer);
    const t: BossTarget = { kind: 'point', p: P.printer.clone().add(new THREE.Vector3(0, 0, -1.6)), stay: PRINTER_JAM.bossStay, why: 'printer' };
    if (main.busy) main.prioritize(t);
    else main.startRonda([t], 'impressora');
  }

  endJam(fixed: boolean) {
    this.printerJam = 0;
    this.loops.alarm?.stop();
    this.loops.alarm = null;
    this.setLed(this.office.printerLight, '#3ddc97');
    for (const b of this.bosses) {
      b.queue = b.queue.filter((q) => !(q.kind === 'point' && q.why === 'printer'));
      if (b.cur?.kind === 'point' && b.cur.why === 'printer') b.endStay();
    }
    if (fixed) {
      this.addSus(this.player, -PRINTER_JAM.heroSus);
      this.hud.popup('good', 'HERÓI!', 'impressora destravada · −10 Suspeita');
      this.audio.play('confirm', 1);
      this.juice.confetti(this.office.P.printer.clone().setY(1.4), 50, 4);
    }
  }

  endBlackout(fixed: boolean) {
    this.blackout = false;
    this.audio.play('lightson', 1);
    this.setLed(this.office.breakerLight, '#3ddc97');
    if (fixed) {
      this.addSus(this.player, -BLACKOUT.heroSus);
      this.hud.popup('good', 'LUZ!', 'disjuntor religado · −10 Suspeita');
      this.juice.sparks(this.office.P.breaker.clone().setY(1.5), '#ffd23f', 40, 4);
    }
  }

  /** Interações que dependem do estado do dia (impressora, disjuntor, pizza). */
  eventInteractables(): Interactable[] {
    if (this.phase === 'lobby' || this.phase === 'evening') return this.lobbyInteractables();
    if (this.phase === 'leaving') return [];
    const P = this.office.P;
    const list: Interactable[] = [];
    // agenda do chefe: ler dá para ler de longe; anotar (fica no TAB) exige ficar ali parado, à vista da porta
    if (this.agenda.items.length && !this.player.fired)
      list.push({
        id: 'agenda', pos: W(4.6, 4.6), r: 1.8, hold: AGENDA.readHold, needView: true,
        label: this.agenda.noted ? 'agenda anotada (TAB)' : '<kbd>E</kbd>Anotar a agenda do chefe (segure)',
        hint: 'os horários vão para a ajuda (TAB) e para o painel',
        ok: () => !this.agenda.noted,
        act: () => {
          this.agenda.noted = true;
          this.audio.play('confirm', 0.5);
          this.hud.toastWorld('📒 agenda anotada · segure TAB para ver');
        },
      });
    // casaco (v0.10): pegue no cabideiro e pendure na sua cadeira — a mesa parece ocupada por um minuto
    if (!this.player.fired && this.pc.mode === 'walk') {
      if (!this.hasCoat && !this.pc.carrying && !this.pc.holdingMission && !this.missions.spotPending(0))
        list.push({ id: 'coat', pos: W(12.4, 5.2), r: 1.4, hold: 0, label: '<kbd>E</kbd>🧥 Pegar um casaco do cabideiro', hint: 'pendurado na sua cadeira, parece que você está por perto', ok: () => true, act: () => { this.hasCoat = true; this.audio.play('crumple', 0.4); } });
      if (this.hasCoat)
        list.push({
          id: 'coatHang', pos: this.player.desk.standPos, r: 2.2, hold: 0, prio: 0, label: '<kbd>E</kbd>🧥 Pendurar o casaco na sua cadeira', hint: `${COAT.secs} s de mesa "ocupada"`, ok: () => true,
          act: () => {
            this.hasCoat = false;
            this.player.coatUntil = this.time + COAT.secs;
            this.showCoat(this.player, true);
            this.hud.toastWorld(`🧥 mesa "ocupada" por ${COAT.secs} s`);
          },
        });
    }
    // papo (v0.10): trabalho feito vira conversa — o chefe para, virado para você
    if (!this.player.fired && this.pc.mode === 'walk' && this.dayIndex >= INTRO.talkFrom)
      for (const b of this.bosses) {
        if (!b.ball.root.visible || b.state === 'chase' || b.away || b.talkW) continue;
        if (b.pos.distanceTo(this.player.ball.pos) > PAPO.range + 0.6) continue;
        // sem assunto (nada de trabalho feito) o papo nem aparece: não rouba o E de quem está perto
        const ok = this.talkBank >= PAPO.min;
        if (!ok) continue;
        list.push({
          id: `papo-${b.kind}`, pos: b.pos, r: PAPO.range + 0.6, hold: 0, obj: [b.ball.root], prio: 2,
          label: ok ? `<kbd>E</kbd>💬 Puxar papo com o chefe (${Math.floor(this.talkBank)} s)` : '💬 sem assunto: faça trabalho para ter papo',
          hint: 'ele para e fica virado para você — quem está atrás dele fica livre',
          ok: () => ok,
          act: () => this.startTalk(b),
        });
      }
    // visita (demitido no multi): conversar com o chefe
    if (this.player.fired && this.net && this.pc.mode === 'walk')
      for (const b of this.bosses)
        if (b.ball.root.visible && b.out && b.pos.distanceTo(this.player.ball.pos) < 2.6)
          list.push({
            id: 'visita', pos: b.pos, r: 2.6, hold: 0, obj: [b.ball.root], prio: 3,
            label: this.visitCd > 0 ? `conversa de novo em ${Math.ceil(this.visitCd)} s` : '<kbd>E</kbd>Puxar conversa com o chefe',
            hint: `ele para ${VISIT.talk} s para conversar`,
            ok: () => this.visitCd <= 0,
            act: () => {
              this.visitCd = VISIT.cooldown;
              if (this.auth) this.visitTalk(this.player);
              else this.net?.act('visita');
            },
          });
    const pig = this.office.outside.nearestPigeon(this.player.ball.pos);
    if (pig && pig.dist < 2.2)
      list.push({ id: 'glass', pos: pig.pos, r: 2.2, hold: 0, label: '<kbd>E</kbd>Bater no vidro (assustar os pombos)', hint: this.canFun('vidro') ? 'diversão de hoje!' : 'hoje não vale FUN', ok: () => true, act: () => this.tapGlass() });
    const inside = this.office.inElevator(this.player.ball.pos);
    list.push({
      id: 'elevBtn', pos: inside ? P.elevatorBtn : P.elevatorBtn.clone().setZ(P.elevatorBtn.z + 1.5), r: 1.3, hold: 0,
      obj: [this.office.elevButtons], needView: inside,
      label: inside ? (this.net && this.phase === 'elevator' ? (this.net.ready ? '<kbd>E</kbd>Cancelar PRONTO' : '<kbd>E</kbd>Marcar PRONTO') : '<kbd>E</kbd>Apertar os botões') : '<kbd>E</kbd>Chamar o elevador',
      ok: () => true,
      act: () => this.pressElevatorButton(),
    });
    if (this.postitLeft > 0 && !this.postitActive && !this.pc.carrying)
      list.push({ id: 'postit', pos: this.player.desk.standPos, r: 2.4, hold: 0.5, obj: this.player.desk.click, needView: true, label: `<kbd>E</kbd>Colar post-it "Em reunião" (${this.postitLeft} hoje)`, hint: 'a próxima ronda pula a sua mesa', ok: () => true, act: () => this.usePostit() });
    if (this.printerJam > 0) list.push({ id: 'jam', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: 0, mg: { kind: 'fios', title: '🖨 Destravar a impressora', hint: 'ligue cada fio na cor certa' }, label: '<kbd>E</kbd>Destravar impressora', ok: () => true, act: () => (this.net && !this.net.isHost ? this.net.act('unjam') : this.endJam(true)) });
    list.push(...this.tasks.interactables());
    list.push(...this.distract.interactables());
    list.push(...this.items.interactables());
    list.push(...this.missions.interactables());
    list.push(...this.surv.interactables());
    if (this.blackout) list.push({ id: 'breaker', pos: P.breaker.clone().setX(P.breaker.x + 0.5), r: 1.5, hold: 0, mg: { kind: 'fios', title: '⚡ Religar o disjuntor' }, label: '<kbd>E</kbd>Religar disjuntor', ok: () => true, act: () => (this.net && !this.net.isHost ? this.net.act('breaker') : this.endBlackout(true)) });
    if (this.pizzaLeft > 0 && !this.pc.carrying) {
      const bolo = this.feast === 'bolo';
      list.push({
        id: 'pizza', pos: P.pizza.clone().setZ(P.pizza.z - 0.8), r: 1.5, hold: bolo ? BOLO.eatTime : PIZZA.eatTime,
        label: `<kbd>E</kbd>Comer ${bolo ? 'bolo' : 'pizza'} (${this.pizzaLeft} restantes)`, hint: bolo ? 'deixa migalhas na sua mesa' : 'o Dono confere a bagunça depois', ok: () => true,
        act: () => {
          if (!this.net || this.net.isHost) return this.eatPizza(this.player);
          // cliente: o host tira a fatia; o FUN (e as migalhas) contam aqui
          this.net.act('pizza');
          this.addFun(this.player, bolo ? BOLO.fun : ACT.pizza.fun, bolo ? 'bolo' : 'pizza');
          if (bolo) this.addCrumbs(this.player);
          this.audio.play3D('crunch', P.pizza, 0.8);
        },
      });
    }
    if (this.heistPrize.visible && this.office.inBossRoom(this.player.ball.pos))
      list.push({
        id: 'heist', pos: this.heistPrize.position, r: 1.7, hold: HEIST.hold, obj: [this.heistPrize], prio: 2,
        label: `<kbd>E</kbd>Pegar o ${this.prize.name} (segure)`,
        hint: `+${this.heistFun} FUN · se ele te pegar aqui dentro, é demissão`,
        ok: () => !this.player.fired,
        act: () => this.takeHeist(),
      });
    // missão pequena "post-it na cadeira do chefe": só lá dentro (exposto; pego = demissão)
    if (this.funTasks.some((f) => f.id === 'postit' && !f.done) && this.office.inBossRoom(this.player.ball.pos))
      list.push({
        id: 'postitChefe', pos: W(10, 0.75), r: 1.5, hold: 1.2, prio: 2,
        label: '<kbd>E</kbd>🟨 Colar um post-it na cadeira do chefe (segure)',
        hint: '"EU ❤ SEGUNDA-FEIRA" · missão pequena',
        ok: () => !this.player.fired,
        act: () => {
          this.audio.play('crumple', 0.6);
          this.funProgress('postit');
        },
      });
    return list;
  }

  /** FUN do assalto (o faro de assalto soma). */
  get heistFun() {
    return HEIST.fun + this.shop.count('gula') * SHOP_FX.heistBonus;
  }

  /** Assalto concluído: o prêmio do chefe é seu (o maior FUN do dia). */
  private takeHeist() {
    const at = this.heistPrize.position.clone();
    this.heistPrize.visible = false;
    this.addFun(this.player, this.heistFun, `${this.prize.name}!`, at);
    this.hud.popup('good', '🍩 ASSALTO!', 'agora saia daí antes que ele volte');
    this.audio.play('coin', 0.9);
    this.audio.play3D('crunch', at, 0.8);
    this.juice.confetti(at.clone().setY(1.5), 40, 3);
    this.noise(at, 3, this.player);
  }

  /**
   * Sala do chefe: com alguém da chefia lá dentro a porta fica fechada (você esbarra nela); com ele fora, é o assalto.
   * Se ele voltar ou te vir lá dentro: demissão.
   */
  private updateBossRoom() {
    const p = this.player;
    if (p.fired || this.attract || this.phase !== 'play') return;
    // num dia de X9 o chefe fica sentado na sala dele (não está em `bosses`)
    const chiefs = this.bosses.includes(this.chefe) ? this.bosses : [...this.bosses, this.chefe];
    const home = chiefs.find((b) => b.ball.root.visible && !b.out);
    const inRoom = this.office.inBossRoom(p.ball.pos);
    if (!inRoom) {
      this.wasInBossRoom = false;
      return;
    }
    // entregando um documento na mesa dele: entra com motivo (ele não estranha)
    if (this.tasks.deliveringToBoss()) {
      this.wasInBossRoom = true;
      return;
    }
    if (!this.wasInBossRoom && home) {
      // porta fechada: volta para o corredor
      p.ball.pos.copy(this.office.P.bossDoorOut);
      p.ball.velocity.set(0, 0, 0);
      this.hud.toastWorld('🔒 o chefe está na sala');
      this.audio.play3D('thud', this.office.P.bossDoor, 0.6);
      return;
    }
    this.wasInBossRoom = true;
    if (this.pc.mode !== 'walk') return;
    const seer = chiefs.find((b) => b.ball.root.visible && (!b.out || b.sees(p.ball.pos)));
    if (seer) this.fire(p, seer, 'Pego dentro da sala do chefe');
  }

  /** Café da máquina; `forBoss` = o café pedido numa tarefa (não gasta a máquina). */
  takeCoffee(forBoss = false) {
    if (!forBoss) {
      this.coffeeMachineCd = B.CAFE_MACHINE_CD;
      this.coffeePlayerCd = B.CAFE_PLAYER_CD;
      // a máquina é uma só: o host guarda o tempo e todo mundo vê esquentando
      this.net?.act('coffee');
    }
    this.audio.play3D('pour', this.office.P.coffee, 1);
    this.pc.carry('coffee');
    this.pc.bossCoffee = forBoss;
    this.juice.smoke(this.office.P.coffee.clone().setY(1.5), 6, '#ffffff', 0.5);
  }

  deliver() {
    const p = this.player;
    const pos = this.office.P.tray.clone().setY(1.2);
    if (this.pc.carrying === 'coffee') {
      const k = (this.pc.spill < B.SPILL_PUDDLE_AT ? 1 : 0.5) * this.mul;
      this.addSus(p, -B.CAFE_DELIVER_SELF * k);
      this.hud.popup('good', '☕ CAFÉ ENTREGUE', `−${Math.round(B.CAFE_DELIVER_SELF * k)} Suspeita · puxa-saco`);
      this.juice.confetti(pos, 30, 3);
    }
    this.audio.play('confirm', 0.9);
    this.pc.dropCarry();
  }

  // ------------------------------------------------------------------ jogador: atividade do quadro
  private updatePlayerAct() {
    const p = this.player;
    const pc = this.pc;
    p.act = null;
    p.physical = false;
    if (p.fired) return;
    switch (pc.mode) {
      case 'seated': {
        const app = this.computer.app;
        if (app.forbidden && app.running) p.act = app.id as ActivityId;
        p.physical = pc.eating > 0 || pc.throwing;
        break;
      }
      case 'chair':
        p.act = pc.chairSpeed > 1.5 ? 'cadeira' : null;
        p.physical = true;
        break;
      case 'nap':
        p.act = 'soneca';
        p.physical = true;
        break;
      default:
        p.physical = !!pc.physicalAct;
    }
  }

  /** Bolas não se atravessam: empurrão macio (e engraçado). */
  private separateBalls() {
    const p = this.player.ball;
    if (this.player.fired || this.pc.mode === 'seated' || this.pc.mode === 'ghost' || this.pc.mode === 'cinematic') return;
    const others: { b: Ball; r: number; heavy: boolean }[] = [];
    for (const w of this.workers) if (!w.isPlayer && !w.fired && !w.seated && !w.ball.lying) others.push({ b: w.ball, r: 0.4, heavy: false });
    const guide = this.chefe.state === 'wait' || this.chefe.state === 'leave';
    for (const bo of guide ? [...this.bosses, this.chefe] : this.bosses) if (bo.ball.root.visible && bo.out) others.push({ b: bo.ball, r: 0.42 * bo.ball.spec.scale * 0.9, heavy: true });
    for (const o of others) {
      const dx = p.pos.x - o.b.pos.x;
      const dz = p.pos.z - o.b.pos.z;
      const d = Math.hypot(dx, dz);
      const min = 0.38 + o.r;
      if (d > 0.001 && d < min) {
        const push = min - d;
        const k = o.heavy ? 1 : 0.6;
        p.pos.x += (dx / d) * push * k;
        p.pos.z += (dz / d) * push * k;
        if (!o.heavy) {
          o.b.pos.x -= (dx / d) * push * 0.4;
          o.b.pos.z -= (dz / d) * push * 0.4;
        }
        // logo ao levantar não conta: o chefe que confere a tela fica parado onde você aparece
        if (o.heavy && push > 0.04 && this.time - this.bossBumpT > 4 && this.time - this.pc.standAt > 1) {
          this.bossBumpT = this.time;
          this.bossSus(this.player, 8, 'trombou no chefe', o.b.headWorld());
          this.juice.text(o.b.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'olha por onde anda!', 'ft-boss', 1.4);
          this.audio.play3D('suspicious', o.b.pos, 1);
          this.juice.shake(0.2);
        }
        if (push > 0.05) {
          p.impulse(0.25);
          o.b.impulse(0.2);
          if (Math.random() < 0.3) this.audio.play3D('plop', p.pos, 0.4);
        }
      }
    }
    this.office.collide(p.pos, 0.38);
  }

  // ------------------------------------------------------------------ números contínuos
  private updateWorkers(dt: number) {
    for (const w of this.workers) {
      if (w.fired) continue;
      if (w.remote) {
        // FUN e Suspeita do remoto vêm dele; aqui só o flagrante de lanche/basquete sentado à vista
        if (w.seated && w.physical) {
          const seer = this.bosses.find((b) => b.busy && b.sees(w.ball.pos, 10));
          if (seer) this.onSeen(w, seer, dt);
        }
        if (!w.physical) w.physicalSeen = Math.max(0, w.physicalSeen - dt);
        const spec = w.act ? ACT[w.act] : null;
        if (this.auth && spec && w.act !== 'fofoca' && w.act !== 'maquina') {
          this.instinct += spec.instinct * dt;
          if (spec.noise > 0) this.noise(w.seated ? w.desk.seat : w.ball.pos, spec.noise, w, 0);
        }
        continue;
      }
      // diversão não soma Suspeita sozinha: só atiça o instinto e faz barulho (o chefe precisa ver ou ouvir)
      const act = w.act;
      if (act) {
        let spec = { ...ACT[act] };
        if (act === 'video' && w.isPlayer && this.headphones) spec = { ...spec, ...VIDEO_HEADPHONE };
        const botScale = w.isPlayer ? 1 : 0.45;
        const discrete = act === 'fofoca' || act === 'maquina';
        if (!discrete) {
          this.instinct += spec.instinct * dt * botScale;
          w.contribution += spec.instinct * dt;
        }
        if (!w.isPlayer && w.seated) this.addFun(w, (act === 'pesca' ? 0.4 : spec.fun) * dt);
        if (w.isPlayer && act === 'soneca') {
          const before = w.fun;
          this.addFun(w, spec.fun * dt);
          this.funProgress('soneca', w.fun - before);
        }
        const src = w.seated ? w.desk.seat : w.ball.pos;
        if (spec.noise > 0 && (w.isPlayer || Math.random() < dt * 2)) this.noise(src, spec.noise, w, w.isPlayer ? dt : 0);
      } else if (w.seated && !w.isPlayer) this.addSus(w, -1.2 * dt);
      w.contribution *= Math.exp(-dt / 30);
      // flagrante físico sentado (lanche/basquete à vista) — em pé é tratado em onSeen
      if (w.seated && w.physical) {
        const seer = this.bosses.find((b) => b.busy && b.sees(w.ball.pos, 10));
        if (seer) this.onSeen(w, seer, dt);
      }
      if (!w.physical) w.physicalSeen = Math.max(0, w.physicalSeen - dt);
    }
    for (const pa of this.pc.papers) {
      if (pa.flying || pa.reported || pa.owner) continue;
      for (const b of this.bosses)
        if (b.out && b.pos.distanceTo(pa.mesh.position) < B.PAPER_EVIDENCE_RADIUS) {
          pa.reported = true;
          this.bossSus(this.player, B.PAPER_EVIDENCE_SUS, 'bolinha no chão', pa.mesh.position);
          this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'lixo?!', 'ft-boss', 1.3);
        }
    }
    for (const pu of this.pc.puddles) {
      if (pu.reported) continue;
      for (const b of this.bosses)
        if (b.out && b.pos.distanceTo(pu.mesh.position) < 3) {
          pu.reported = true;
          this.bossSus(pu.who, 6, pu.what, pu.mesh.position);
          this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), pu.what.startsWith('café') ? 'café?!' : 'água?!', 'ft-boss', 1.3);
        }
    }
  }

  // ------------------------------------------------------------------ telas e luzes
  private updateScreens(realDt: number) {
    const pd = this.player.desk;
    const comp = this.computer;
    this.screenT -= realDt;
    const tick = this.screenT <= 0;
    // o monitor do jogador (1024×640) custa caro para redesenhar e reenviar à GPU:
    // a cada quadro só com ele sentado olhando; de longe, no ritmo das telas dos bots
    const atDesk = this.pc.mode === 'seated' || this.pc.mode === 'cinematic';
    if (!this.attract && (atDesk || tick)) {
      comp.draw(pd.ctx);
      if (this.pc.mode === 'seated' && !comp.frozen) comp.drawCursor(pd.ctx, this.pc.mouseCanvas.x, this.pc.mouseCanvas.y);
      pd.tex.needsUpdate = true;
    }
    if (tick) {
      this.screenT = 0.1;
      for (const w of this.allWorkers) {
        if (w.isPlayer && !this.attract) continue;
        const on = w.ball.root.visible && this.workers.includes(w);
        const scr = w.botScreen === 'trabalho' ? 'planilha' : w.botScreen;
        drawBotScreen(w.desk.ctx, !on || w.fired ? 'off' : w.seated ? scr : 'planilha', this.time + w.id * 3, w.id);
        w.desk.tex.needsUpdate = true;
      }
      if (this.attract && pd.canvas.width > 256) {
        const tmp = document.createElement('canvas');
        tmp.width = 256;
        tmp.height = 160;
        drawBotScreen(tmp.getContext('2d')!, this.player.botScreen === 'trabalho' ? 'planilha' : this.player.botScreen, this.time, 0);
        pd.ctx.drawImage(tmp, 0, 0, 1024, 640);
        pd.tex.needsUpdate = true;
      }
      this.office.drawTV(this.time);
    }
    this.flashLight = Math.max(0, this.flashLight - realDt * 5);
    for (const w of this.allWorkers) {
      const scr = w.isPlayer && !this.attract ? comp.active : w.botScreen;
      const base = scr === 'planilha' || scr === 'trabalho' ? '#cfe8ff' : scr === 'tiro' ? '#ff9a5a' : scr === 'video' ? '#ff5aa0' : '#5ac8ff';
      const light = w.desk.light;
      light.color.set(base);
      if (w.isPlayer && this.flashLight > 0) light.color.lerp(this.flashColor, this.flashLight);
      const on = w.ball.root.visible && !w.fired;
      light.intensity = on ? (0.5 + 3 * (1 - this.lightLevel)) * (1 + (w.isPlayer ? this.flashLight * 1.5 : 0)) : 0.05;
    }
  }

  // ------------------------------------------------------------------ áudio
  private updateAudio(realDt: number) {
    const a = this.audio;
    if (!a.ready) return;
    this.ensureLoops();
    const p = this.player;
    const comp = this.computer;
    const seated = this.pc.mode === 'seated' && !this.attract;
    this.loops.typing?.setVol(seated && comp.active === 'planilha' && comp.planilha.inRhythm ? 0.25 : 0);
    const vid = !this.attract && comp.active === 'video' && comp.video.playing;
    this.loops.video?.setVol(vid && !this.headphones ? 0.35 : vid ? 0.05 : 0);
    const fishing = seated && comp.active === 'pesca';
    a.stepMul = (this.headphones ? 0.35 : 1) * (fishing ? 0.7 : 1) * (this.tricks.has('sapatoMacio') ? TRICK_FX.stepVol : 1);
    a.doorMul = this.headphones ? 0.5 : 1;
    let danger = 0;
    if (!this.attract && !p.fired) {
      for (const b of this.bosses) {
        if (!b.busy || !b.ball.root.visible) continue;
        const d = b.pos.distanceTo(p.ball.pos);
        const targeting = (b.cur?.kind === 'desk' && b.cur.w === p) || b.chaseW === p;
        danger = Math.max(danger, THREE.MathUtils.clamp(1 - d / (targeting ? 9 : 7), 0, 1));
      }
    }
    const alarming = this.bosses.some((b) => b.busy && (!b.patrolling || b.pos.distanceTo(p.ball.pos) < 9));
    a.tension += ((alarming && !this.attract ? 0.6 : 0) + danger * 0.4 - a.tension) * Math.min(1, realDt * 2);
    const risky = (comp.forbiddenOpen && this.pc.mode === 'seated') || p.physical || this.bosses.some((b) => b.chaseW === p);
    const uD = danger * (risky ? 0.9 : 0.25);
    this.r.u.uDanger.value += (uD * (0.75 + 0.25 * Math.sin(this.time * 9)) - this.r.u.uDanger.value) * Math.min(1, realDt * 8);
    if (danger > 0.15 && this.phase === 'play') {
      this.heartbeatT -= realDt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 1.1 - danger * 0.55;
        a.play('heartbeat', 0.5 + danger * 0.6, danger);
      }
    }
  }

  // ------------------------------------------------------------------ HUD
  private updateHUD(realDt: number) {
    const p = this.player;
    const hud = this.hud;
    hud.setFun(p.fun, this.runFun, this.goal, this.goalFun);
    hud.setLives(RUN.lives - this.strikes - (this.lostToday && this.net ? 1 : 0), RUN.lives);
    if (p.fired) hud.setCover(null);
    else {
      const cv = this.cover;
      const crowd = this.companions(p);
      hud.setCover(cv, cv === 'exposto' && crowd ? `juntos ×${String(1 + SOCIAL.funPer * crowd).replace('.', ',')}` : '');
    }
    // setas só quando sobe (e o motivo aparece embaixo da barra): ↑↑ tarefa esperando, ↑↑↑ o chefe vendo / erro
    const decay = Math.exp(-realDt);
    for (const key of Object.keys(this.susRecent) as SusSource[]) this.susRecent[key] = (this.susRecent[key] ?? 0) * decay;
    const r = this.susRecent;
    const arrows = p.fired ? '' : (r.chefe ?? 0) > 0.05 || (r.erro ?? 0) > 0.05 ? '↑↑↑' : this.tasks.ramping ? '↑↑' : '';
    hud.setSus(p.sus, arrows, this.mul);
    const k = this.k;
    const ev = this.dayEvents[0];
    const phase = this.time < B.PHASE_MIDDAY * k ? 'manhã' : this.time < B.PHASE_AFTERNOON * k ? `meio-dia${ev ? ` · ${EVENTS[ev].name}` : ''}` : 'tarde';
    hud.setClock(this.time / this.duration, this.dayName, phase);
    const s = this.stock;
    const tasks: TaskView[] = this.tasks.views();
    if (this.pc.carrying === 'coffee' && !this.pc.bossCoffee) tasks.push({ icon: '☕', label: 'leve o café à bandeja do chefe', bar: null });
    if (this.pc.mode === 'seated' && this.tiroCooldown > 0 && s.tiro > 0 && this.canFun('tiro')) tasks.push({ icon: '✦', label: `Ball Ops recarrega: ${Math.ceil(this.tiroCooldown)} s`, bar: 1 - this.tiroCooldown / TIRO_COOLDOWN });
    if (this.printerJam > 0) tasks.push({ icon: '🚨', label: 'impressora travada!', bar: this.printerJam / PRINTER_JAM.alarm, urgent: true });
    if (this.blackout) tasks.push({ icon: '⚡', label: 'religue o disjuntor (cozinha)', bar: this.blackoutT / BLACKOUT.duration, urgent: true });
    if (this.internetT > 0) tasks.push({ icon: '📡', label: 'internet caiu: jogos do PC offline', bar: this.auth ? this.internetT / INTERNET.duration : null, urgent: true });
    if (this.meetingCall) tasks.push({ icon: '📣', label: this.meetingCall.phase === 'gather' ? `reunião surpresa: vá à mesa de reunião (${Math.ceil(this.meetingCall.t)} s)` : 'reunião surpresa', bar: this.meetingCall.phase === 'gather' ? this.meetingCall.t / MEETING_CALL.gather : null, urgent: true });
    if (this.pizzaLeft > 0) tasks.push({ icon: this.feast === 'bolo' ? '🎂' : '🍕', label: `${this.feast === 'bolo' ? 'bolo' : 'pizza'} na cozinha: ${this.pizzaLeft} fatias`, bar: null });
    hud.setTasks(tasks);
    hud.setFunList(this.funRows());
    this.pingCd = Math.max(0, this.pingCd - realDt);
    for (const pg of this.pings) pg.t -= realDt;
    this.pings = this.pings.filter((pg) => pg.t > 0);
    this.updateMarkers();
    this.updateAlert();
    this.updateGoal(realDt);
    hud.help(this.input.isDown('Tab') ? this.helpHTML() : null);
    hud.update(realDt);
  }

  /** Faixa vermelha do topo: o que está acontecendo + o que fazer agora. */
  private updateAlert() {
    const pc = this.pc;
    const c = this.computer;
    const chaser = this.bosses.find((b) => b.chaseW === this.player);
    const out = this.bosses.find((b) => b.busy && (!b.patrolling || b.pos.distanceTo(this.player.ball.pos) < 9));
    // demitido (fantasma): a faixa do chefe não diz respeito a ele
    if ((!chaser && !out) || this.player.fired) return this.hud.setBanner(null);
    // perseguição: diz de onde ele vem e quanto tempo falta para ele desistir
    if (chaser) {
      const left = (chaser.chaseLeft / CHASE_TIME) * 100;
      const bar = `<div class="chase-bar"><i style="width:${left}%"></i></div>`;
      return this.hud.setBanner(`🏃 ${BOSS_NAME[chaser.kind]} TE PERSEGUE`, '', `vem ${this.dirWord(chaser.pos)} · sente na SUA mesa ou vá ao banheiro 🚽${bar}`);
    }
    // na ronda longa o X9 fica andando pelo salão: sem faixa vermelha (a de perto já avisa); nas rondas normais avisa como o chefe
    if (out!.kind === 'x9' && out!.patrolling) return this.hud.setBanner(null);
    let sub: string;
    if (pc.mode === 'seated') sub = c.forbiddenOpen ? 'aperte <kbd>ESPAÇO</kbd> para esconder o jogo!' : `fique ${c.home === 'planilha' ? 'na planilha' : 'no trabalho'} até ele voltar para a sala`;
    else if (pc.physicalAct) sub = 'pare a diversão (<kbd>E</kbd>) e volte para a sua mesa';
    else if (c.forbiddenOpen) sub = 'seu jogo ficou ABERTO no PC — corra para fechar!';
    else if (pc.carrying || this.tasks.active.length) sub = 'numa tarefa dele (ou com café na mão) você tem álibi';
    else sub = 'volte para a mesa ou pegue um café (álibi)';
    const text = out!.kind === 'dono' ? '👑 O DONO ESTÁ ANDANDO' : out!.kind === 'x9' ? '⚠ O X9 SAIU DA SALA' : '⚠ O CHEFE SAIU DA SALA';
    this.hud.setBanner(text, out!.kind === 'dono' ? 'gold' : '', `${sub} · <b>FUN ×${String(B.RISK_FUN_MUL).replace('.', ',')}</b> enquanto ele está fora`);
  }

  /** Cartão de objetivo: tutorial no 1º dia, depois o que mais importa agora. */
  private updateGoal(realDt: number) {
    const p = this.player;
    const ring = this.tasks.ringing;
    if (ring && !p.fired) {
      const left = TASKS.grace - ring.t;
      return this.hud.goal('📞 TELEFONE!', `O chefe está ligando. ${left > 0 ? `Atenda em <b>${Math.ceil(left)} s</b> antes que a Suspeita comece a subir` : '<b>A Suspeita já está subindo!</b> Atenda'}: <kbd>E</kbd> perto do telefone ou <kbd>clique</kbd> nele sentado.`, 'urgent');
    }
    if (this.updateTips(realDt)) return;
    if (p.fired)
      return this.hud.goal('HOJE', this.outOfLives && this.net ? 'Suas vidas acabaram: assista o time até o fim da run.<br><kbd>F</kbd> avisa a sala onde o chefe está.' : `Você foi demitido(a) hoje: metade do seu FUN conta para o placar e para a meta.${this.net ? '<br><kbd>F</kbd> avisa a sala onde o chefe está.' : ''}`, '');
    if (this.meetingCall?.phase === 'gather')
      return this.hud.goal('📣 REUNIÃO SURPRESA', `Vá para a <b>mesa de reunião</b> em <b>${Math.ceil(this.meetingCall.t)} s</b> ou leve Suspeita.`, 'urgent');
    const job = this.tasks.active[0];
    if (job && this.tasks.ramping)
      return this.hud.goal('📋 TAREFA DO CHEFE', `<b>${job.title}:</b> ${this.tasks.stepLabel(job)}. Enquanto ela espera, a Suspeita sobe <b>cada vez mais rápido</b>. Entregar baixa <b>${TASKS.susDone}</b>.`, 'urgent');
    if (this.pc.mode !== 'seated' && this.computer.forbiddenOpen)
      return this.hud.goal('⚠ CUIDADO', 'Seu jogo ficou <b>aberto no PC</b>. Se o chefe passar pela mesa vazia, a Suspeita dispara.', 'urgent');
    if (p.sus > 70)
      return this.hud.goal('⚠ SUSPEITA ALTA', 'Se encher, o chefe vem te flagrar. Entregue as <b>tarefas do chefe</b> (cada uma baixa) e não deixe ele te ver.', 'urgent');
    const fixedTxt = this.tasks.cotaDone ? '✅ cota de trabalho feita' : `cota de trabalho <b>${this.tasks.cotaText()}</b> — obrigatória (vale 1 vida)`;
    const goal = this.goal;
    const have = Math.floor(this.goalFun);
    if (have >= goal) return this.hud.goal('✓ META BATIDA', `${have} de ${goal} FUN${this.net ? ' do time' : ''}. Agora é placar — só não seja pego.<br><small>${fixedTxt}</small>`, 'done');
    const [head, txt] = this.missions.stepText();
    this.hud.goal(head, `${txt}<br><small><b>${have} de ${goal} FUN</b>${this.net ? ' do time' : ''} até as 18h · ${fixedTxt}</small>`, this.missions.done ? 'done' : '');
  }

  /** Diversões do dia no painel: [nome, progresso, sempre visível]. */
  private funRows(): [string, string | number, boolean][] {
    const s = this.stock;
    const stock: Partial<Record<FunId, string | number>> = {
      tiro: `${s.tiro} partidas`, pesca: `${s.pesca} iscas`, video: `${Math.ceil(s.video)} s`, lanche: `${s.lanche} na gaveta`,
      cadeira: `${s.cadeira} corridas`, fofoca: `${s.fofoca}×`, maquina: `${s.maquina}×`,
      cestas: `${this.pc.paperHeld} na mão · ${this.player.desk.pile?.count ?? 0} no monte`,
    };
    const M = this.missions;
    // a grande com as subtarefas embaixo (✓ feita · ▸ agora · ○ depois)
    const rows: [string, string | number, boolean][] = [[`★ ${M.spec.icon} ${M.spec.name}`, M.done ? '✓' : '', true]];
    for (const [label, st] of M.steps()) rows.push([`\u00a0\u00a0\u00a0${st === 'ok' ? '✓' : st === 'now' ? '▸' : '○'} ${label}`, '', true]);
    for (const f of this.funTasks) {
      const prog = f.done ? '✓' : f.big ? `${Math.floor((f.prog / f.goal) * 100)}%` : `${f.prog}/${f.goal}`;
      const extra = !f.done && stock[f.id] !== undefined ? ` · ${stock[f.id]}` : '';
      rows.push([`• ${f.icon} ${f.label}`, `${prog}${extra}`, true]);
    }
    rows.push([`💬 Papo com o chefe`, this.talkBank >= PAPO.min ? `${Math.floor(this.talkBank)} s · E perto dele` : 'trabalhe para ganhar', true]);
    return rows;
  }

  /** Multi: o fantasma avisa a sala onde o chefe está (F). */
  ghostPing() {
    if (!this.net || this.pingCd > 0 || !this.player.fired) return;
    const b = this.bosses.find((x) => x.ball.root.visible && x.busy) ?? this.bosses[0];
    this.pingCd = 4;
    this.net.ping(b.pos.x, b.pos.z);
    this.onPing(b.pos.x, b.pos.z, this.net.nameOf(this.net.self));
  }

  /** Aviso de um fantasma: marcador na posição do chefe por alguns segundos. */
  onPing(x: number, z: number, by: string) {
    this.pings.push({ pos: new THREE.Vector3(x, 2.4, z), t: 4, by });
    this.audio.play('hover', 1);
    if (!this.player.fired) this.hud.toastWorld(`👻 ${by}: o chefe está ali!`);
  }

  /** Ícones sobre os lugares que importam agora (andando; avisos de fantasma em qualquer modo). */
  private updateMarkers() {
    if (!this.running || this.attract) return this.hud.setMarkers([]);
    const list: { pos: THREE.Vector3; icon: string; text: string }[] = [];
    for (const pg of this.pings) list.push({ pos: pg.pos, icon: '👻', text: `<b>chefe aqui!</b> · ${pg.by}` });
    // fantasma: vê as chefias através das paredes
    if (this.pc.mode === 'ghost')
      for (const b of this.bosses) if (b.ball.root.visible) list.push({ pos: b.ball.headWorld().add(new THREE.Vector3(0, 0.9, 0)), icon: '👔', text: this.net ? '<kbd>F</kbd> avisar a sala' : BOSS_NAME[b.kind] });
    if (this.pc.mode !== 'walk') return this.projectMarkers(list);
    const todo = (id: FunId) => this.funTasks.some((f) => f.id === id && !f.done);
    if (this.tasks.ringing) list.push({ pos: this.player.desk.screenCenter.clone().setY(1.75), icon: '📞', text: `<b>atenda!</b> · ${Math.round(this.player.ball.pos.distanceTo(this.player.desk.standPos))} m` });
    for (const t of this.tasks.active) {
      const at = this.tasks.stepPos(t);
      if (at) list.push({ pos: at, icon: t.icon, text: `${this.tasks.stepLabel(t)} · ${Math.round(this.player.ball.pos.distanceTo(at.clone().setY(0)))} m` });
    }
    if (this.meetingCall?.phase === 'gather') list.push({ pos: this.office.P.speaker.clone().setY(1.6), icon: '📣', text: `<b>reunião!</b> · ${Math.ceil(this.meetingCall.t)} s` });
    const pcFun = this.funTasks.find((f) => !f.done && (f.id === 'tiro' || f.id === 'pesca' || f.id === 'video'));
    if (pcFun) list.push({ pos: this.player.desk.screenCenter.clone().setY(1.5), icon: pcFun.icon, text: `sente e jogue ${pcFun.label}` });
    if (this.paperAllowed) {
      const pile = this.player.desk.pile;
      if (this.pc.paperHeld > 0) {
        const bin = this.office.bins.reduce((a, b) => (b.rim.distanceTo(this.player.ball.pos) < a.rim.distanceTo(this.player.ball.pos) ? b : a));
        list.push({ pos: bin.rim.clone().setY(1.2), icon: '📄', text: `segure <kbd>Btn dir.</kbd> e arremesse · ${this.pc.paperHeld} na mão` });
      } else if (pile && pile.count > 0 && (todo('cestas') || todo('bonk') || todo('bonkChefe') || this.player.ball.pos.distanceTo(pile.pos) < 6))
        list.push({ pos: pile.pos.clone().setY(1.25), icon: '📄', text: `<kbd>E</kbd>pegue bolinhas · ${pile.count}` });
    }
    // diversões de hoje que ainda faltam: um ícone em cima de cada lugar onde dá para fazê-las
    const far = (at: THREE.Vector3) => `${Math.round(this.player.ball.pos.distanceTo(at.clone().setY(0)))} m`;
    // sala do chefe vazia: o assalto do dia
    const chiefs = this.bosses.includes(this.chefe) ? this.bosses : [...this.bosses, this.chefe];
    if (!this.missions.done && !chiefs.some((b) => b.ball.root.visible && !b.out))
      list.push({ pos: this.office.P.bossDoor.clone().setY(2.5), icon: '🚪', text: `sala do chefe vazia · ${far(this.office.P.bossDoor)}` });
    list.push(...this.missions.markers());
    if (todo('soneca')) {
      const at = this.office.couch.seat.clone().setY(1.4);
      list.push({ pos: at, icon: '💤', text: `<kbd>E</kbd>soneca no sofá · ${far(at)}` });
    }
    if (todo('cadeira') && this.stock.cadeira > 0)
      for (const rc of this.office.raceChairs) {
        const at = rc.group.position.clone().setY(1.5);
        list.push({ pos: at, icon: '🪑', text: `<kbd>E</kbd>corrida de cadeira · ${this.stock.cadeira}` });
      }
    if (todo('lanche') && this.stock.lanche > 0) list.push({ pos: this.player.desk.seat.clone().setY(1.2), icon: '🍪', text: `sente e aperte <kbd>G</kbd> · ${this.stock.lanche}` });
    if (todo('maquina') && this.stock.maquina > 0) {
      const at = this.office.P.vending.clone().setY(2.3);
      list.push({ pos: at, icon: '🍫', text: `<kbd>E</kbd>comprar lanche · ${far(at)}` });
    }
    if (todo('fofoca') && this.stock.fofoca > 0) {
      const spots = ['fofoca1', 'fofoca2'].map((id) => this.bots.spot(id));
      const talk = spots.filter((s) => s.busy && !s.busy.isPlayer);
      for (const s of talk) list.push({ pos: s.pos.clone().setY(1.9), icon: '🗣', text: `<kbd>E</kbd>fofocar (segure) · ${this.stock.fofoca}` });
      // ninguém na cozinha ainda: mostra onde esperar um colega
      if (!talk.length) {
        const at = spots[0].pos.clone().lerp(spots[1].pos, 0.5).setY(1.9);
        list.push({ pos: at, icon: '🗣', text: `fofoca: espere um colega na cozinha · ${far(at)}` });
      }
    }
    if (todo('vidro')) {
      const pig = this.office.outside.nearestPigeon(this.player.ball.pos);
      if (pig) list.push({ pos: pig.pos.clone().setY(pig.pos.y + 0.8), icon: '🐦', text: `<kbd>E</kbd>bata no vidro · ${far(pig.pos)}` });
    }
    this.projectMarkers(list);
  }

  private projectMarkers(list: { pos: THREE.Vector3; icon: string; text: string }[]) {
    const v = new THREE.Vector3();
    const out: { x: number; y: number; icon: string; text: string }[] = [];
    for (const m of list) {
      v.copy(m.pos).project(this.r.camera);
      if (v.z >= 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      out.push({ x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, icon: m.icon, text: m.text });
    }
    this.hud.setMarkers(out);
  }

  /** Painel de ajuda (segure TAB): objetivo, legenda da tela, controles e o que resta hoje. */
  private helpHTML() {
    const mode: ControlMode = this.pc.mode === 'cinematic' ? 'none' : this.pc.mode === 'ghost' && this.net ? 'ghostNet' : this.pc.mode;
    const left = this.funRows();
    const row = (k: string, v: string) => `<div class="hrow"><span>${k}</span><b>${v}</b></div>`;
    const fx = FIXED[this.tasks.fixed.kind];
    return `<div class="help-card">
      <div class="help-goal">🎯 Bata a <b>meta de FUN</b> do dia (${this.goal}${this.net ? ', do time' : ''}): a <b>missão grande</b> ★ paga a maior parte, as 2 pequenas • e as diversões completam. E feche a <b>cota de trabalho</b> (à direita): ela é obrigatória. Leia a <b>agenda</b> do chefe (a <b>ausência longa</b> é a sua janela), <b>crie brechas</b> (impressora, rádio, viva-voz, alarme) e não seja visto com o item na mão. Cada trabalho feito vira <b>💬 segundos de papo</b>: E perto do chefe e ele para, virado para você. ${RUN.lives} vidas: demissão, meta de FUN ou cota perdida custa uma.</div>
      <div class="help-cols">
        <div>
          <h4>A SUSPEITA (topo)</h4>
          <div class="leg"><i>👁</i><span>É <b>sua</b> e passa para o dia seguinte. Cheia = o chefe vem te flagrar.</span></div>
          <div class="leg"><i>⬆</i><span>Nunca sobe sozinha: só com <b>tarefa do chefe esperando</b>, <b>trabalho errado</b> e <b>o chefe vendo ou ouvindo</b> algo — o motivo aparece embaixo da barra. Cada dia tudo sobe ×${RUN.growth.toFixed(2).replace('.', ',')}.</span></div>
          <div class="leg"><i>⬇</i><span>Baixa entregando <b>tarefas do chefe</b> (−${TASKS.susDone}) e um pouco no fim do dia.</span></div>
          <h4>O TRABALHO</h4>
          <div class="leg"><i>${fx.icon}</i><span>Cota de hoje (<b>${this.tasks.cotaText()}</b>): <b>${fx.label}</b> no PC${this.tasks.pauta.length ? ` + ${this.tasks.pauta.map((p) => PAUTA[p.kind].label.toLowerCase()).join(' + ')}` : ''}. <b>Não fechou = −1 vida.</b></span></div>
          <div class="leg"><i>🎮</i><span>Tudo é <b>minigame rápido</b>: você fica parado e meio cego — ouça a porta. <kbd>Q</kbd> sai sem progresso.</span></div>
        </div>
        <div>
          <h4>CONTROLES AGORA</h4>
          ${CONTROLS[mode].map(([k, t]) => `<div class="hrow"><span>${t}</span><kbd>${k}</kbd></div>`).join('') || '<div class="hrow"><span>—</span></div>'}
          <h4>AGENDA DO CHEFE</h4>
          ${this.agenda.noted ? this.agenda.lines().map((l, i) => `<div class="hrow${this.agenda.items[i].done ? ' done' : ''}"><span>${l}</span></div>`).join('') : '<div class="hrow"><span>leia e anote no quadro ao lado da sala dele (segure E)</span></div>'}
          <h4>MISSÕES DE HOJE</h4>
          ${left.filter((x) => x[2]).map(([k, v]) => row(k, String(v))).join('')}
        </div>
      </div>
      <div class="help-foot">solte <kbd>TAB</kbd> para voltar · <kbd>P</kbd> pausa</div>
    </div>`;
  }

  /** Tutorial do 1º dia (aprender fazendo). Retorna true se ocupou o cartão de objetivo. */
  private updateTips(realDt: number) {
    if (!this.settings.tutorial || this.dayIndex !== 0) return false;
    this.tipT += realDt;
    const c = this.computer;
    const pc = this.pc;
    const tips: [string, () => boolean][] = [
      ['Ande com <kbd>WASD</kbd> até o <b>seu PC</b> (plaquinha amarela "VOCÊ") e <b>clique</b> nele para sentar.', () => pc.mode === 'seated'],
      ['Trabalho no <b>ritmo</b>: aperte <kbd>F</kbd> quando o anel branco encolher até o verde. É parte da <b>cota</b> (à direita).', () => c.planilha.hitsTotal >= 3 || this.tipT > 30],
      ['A <b>cota</b> é <b>obrigatória</b>: a planilha e as tarefas andando da lista à direita. Não fechou até as 18h = <b>−1 vida</b>.', () => this.tipT > 12],
      ['<b>Ouça a porta</b> da sala do chefe. Jogando no PC? <kbd>ESPAÇO</kbd> volta à planilha antes de ele ver.', () => this.bosses[0].out || this.tipT > 30],
      ['Aperte <kbd>E</kbd> para levantar. A <b>agenda do chefe</b> fica no quadro ao lado da sala dele: ali você vê <b>quando ele sai</b>.', () => this.agenda.noted || this.tipT > 30],
      ['A <b>missão do dia</b> (★, à esquerda) paga a maior parte da meta. Ela pede entrar onde não deve — escolha a hora.', () => this.missions.step > 0 || this.tipT > 25],
      ['Sem brecha? <b>Crie uma</b>: travar a impressora, ligar o rádio da copa, o viva-voz ou (1× por dia) o alarme de incêndio puxam o chefe.', () => this.tipT > 14],
      ['Visto com o item da missão na mão, ele <b>persegue</b>. Passe para um colega (botão direito), largue (<kbd>Q</kbd>) ou se esconda no banheiro.', () => this.tipT > 14],
      ['Esqueceu algo? <b>Segure <kbd>TAB</kbd></b> a qualquer momento: regras, controles e o que falta hoje.', () => this.input.isDown('Tab') || this.tipT > 15],
      [`Pronto! Bata a <b>meta de FUN</b> (barra verde) todo dia sem ser pego. ${RUN.lives} vidas — hoje não conta. 😎`, () => this.tipT > 8],
    ];
    if (this.tipIdx >= tips.length) return false;
    const [txt, done] = tips[this.tipIdx];
    this.hud.goal(`TUTORIAL · ${this.tipIdx + 1}/${tips.length}`, txt, 'tut');
    if (done()) {
      this.tipIdx++;
      this.tipT = 0;
      this.audio.play('hover', 1);
      if (this.tipIdx < tips.length) this.hud.toastWorld('✓ boa!');
    }
    return true;
  }

  // ------------------------------------------------------------------ loop
  /** Quem simula chefias, eventos e o fim do dia: o solo e o host. */
  get auth() {
    return !this.net || this.net.isHost;
  }

  update(realDt: number) {
    this.net?.update(realDt);
    const dt0 = this.juice.step(Math.min(realDt, 0.05));
    const ff = this.pc.fastForward && this.pc.mode === 'ghost' && !this.net ? 6 : 1;
    const dt = this.paused ? 0 : dt0 * ff;
    if (this.attract) {
      this.time += dt;
      const b = this.chefe;
      if (!b.busy && this.time - b.lastRondaEnd > 12) b.startRonda(this.rondaTargets(2), 'vitrine');
      b.update(dt);
      this.bots.update(dt);
    } else if (this.running && !this.paused && (this.phase === 'lobby' || this.phase === 'evening')) {
      this.updateLobby(dt, realDt);
    } else if (this.running && !this.paused && this.phase === 'elevator') {
      this.updateElevator(dt, realDt);
    } else if (this.running && !this.paused && this.phase === 'leaving') {
      this.updateLeaving(dt, realDt);
    } else if (this.running && !this.paused) {
      this.time += dt;
      this.updateElevatorDoor(dt);
      this.updateWeather(dt);
      if (this.auth && this.chefe.ball.root.visible && !this.bosses.includes(this.chefe)) {
        if (this.chefe.state === 'leave') this.chefe.update(dt);
        else this.chefe.ball.update(dt);
      }
      this.tiroCooldown = Math.max(0, this.tiroCooldown - dt);
      const ts = this.computer.tiro.state;
      if (this.prevTiroState === 'play' && ts === 'over') this.tiroCooldown = TIRO_COOLDOWN;
      this.prevTiroState = ts;
      this.coffeeMachineCd = Math.max(0, this.coffeeMachineCd - dt);
      this.coffeePlayerCd = Math.max(0, this.coffeePlayerCd - dt);
      this.cupomT = Math.max(0, this.cupomT - dt);
      this.visitCd = Math.max(0, this.visitCd - dt);
      if (this.player.fired && this.net && this.pc.mode === 'walk' && this.input.pressed('KeyF')) this.ghostPing();
      this.updateCopaCam(dt);
      if (this.input.pressed('KeyR') && this.pc.mode === 'seated' && !this.computer.typing) this.useRamal();
      if (this.auth) this.updateDirector(dt);
      else {
        this.tasks.update(dt);
        this.clients.updateNet(dt);
      }
      this.tasks.updatePicker();
      this.updatePhone(realDt);
      if (this.auth) {
        this.checkPizzaJudge();
        for (const b of this.bosses) if (b.ball.root.visible) b.update(dt);
      }
      this.updatePlayerAct();
      this.bots.update(dt);
      // painel aberto: parado e com o mouse no cursor dele; perseguido ou demitido, larga na hora
      if (this.minigame.open && (this.player.fired || this.bosses.some((b) => b.chaseW === this.player) || this.pc.mode !== 'walk')) this.minigame.close(true);
      this.pc.lockMove = this.minigame.open || !!this.tasks.picker || this.rideT > 0;
      this.pc.update(dt, realDt);
      this.minigame.update(realDt);
      this.updatePlayerAct();
      this.separateBalls();
      if (this.auth) this.items.update(dt);
      this.items.updateLocal();
      this.items.render(dt);
      this.surv.update(dt);
      this.updateRide(realDt);
      if (this.player.coatUntil > 0 && this.time >= this.player.coatUntil) {
        this.player.coatUntil = -1;
        this.showCoat(this.player, false);
      }
      this.missions.update();
      this.updateBossRoom();
      this.updateWorkers(dt);
      if (this.input.pressed('KeyP') && this.pc.mode !== 'cinematic' && !this.computer.typing) this.onPause?.();
      if (this.input.pressed('Escape') && !this.input.locked && this.pc.mode !== 'cinematic') {
        this.onPause?.();
      }
      if (!this.auth) {
        // cliente: o host avisa o fim do dia
      } else if (this.allFiredT > 0) {
        this.allFiredT -= realDt;
        if (this.allFiredT <= 0) this.endDay(true);
      } else if (this.time >= this.duration) this.endDay(false);
    }
    if (this.net && this.running) this.net.apply(dt0);
    const eye = this.r.camera.position;
    this.office.lobbyView = !this.attract && this.office.inLobby(eye);
    // as duas cabines com a mesma luz: a de cima também usa a do térreo (a subida não muda nada na tela)
    this.office.lobbyLight = this.office.lobbyView || (!this.attract && this.office.inElevator(eye));
    this.office.update(realDt, this.attract ? (this.time % 300) / 300 : this.time / this.duration, this.time);
    if (!this.mirrorsWarm) {
      // compila o shader dos espelhos já no começo (senão a tela trava no primeiro quadro em que um deles aparece)
      this.mirrorsWarm = true;
      this.office.elevMirror.visible = this.office.lobbyMirror.visible = true;
      this.r.renderer.compile(this.r.scene, this.r.camera);
    }
    const { elevMirror, lobbyMirror } = this.office;
    elevMirror.visible = !this.attract && this.office.cabinMirrorVisible(elevMirror, eye, 0, this.office.elevDoorOpen);
    lobbyMirror.visible = !this.attract && this.office.cabinMirrorVisible(lobbyMirror, eye, LOBBY_DZ, this.office.lobby.k);
    // térreo: luzes, figurantes, porta automática e rua só com a câmera lá embaixo
    const below = this.office.lobbyView;
    this.office.lobbyScene.setActive(below, this.office.lobbyCabinLights);
    this.lobbyCrowd.show(below);
    if (below) {
      const actors = [this.player.ball.pos];
      for (const w of this.workers) if (w.ball.root.visible) actors.push(w.ball.pos);
      this.lobbyCrowd.actors(actors);
      this.office.lobbyScene.update(realDt, this.office.lastLook, actors);
    }
    const people = this.office.mirrorPeople;
    people.length = 0;
    for (const w of this.allWorkers) if (!w.isPlayer) people.push(w.ball.root);
    for (const b of this.bosses) people.push(b.ball.root);
    if (below) this.lobbyCrowd.roots(people);
    this.office.extras.mirror.visible = !this.attract && this.shop.has('retrovisor') && this.pc.mode === 'seated';
    if (this.attract) this.updateAttractCamera(realDt);
    else this.pc.updateCamera(realDt);
    this.juice.applyShake(this.r.camera);
    this.juice.update(dt0, realDt, this.r.camera);
    this.updateScreens(realDt);
    this.updateAudio(realDt);
    if (!this.attract && this.running && this.phase === 'play') this.updateHUD(realDt);
    this.audio.updateListener(this.r.camera);
    this.audio.update();
    const u = this.r.u;
    const look = this.office.lastLook;
    if (look) {
      // no térreo quem ilumina é a luz quente do saguão: a cor da hora fica só lá fora (na rua)
      const lift = this.office.lobbyLight ? LOBBY_LIFT : look.lift;
      const gain = this.office.lobbyLight ? LOBBY_GAIN : look.gain;
      u.uLift.value.lerp(lift, Math.min(1, realDt * 2));
      u.uGain.value.lerp(gain, Math.min(1, realDt * 2));
    }
    u.uFlash.value = Math.max(0, u.uFlash.value - realDt * 2.2);
    // tela reage ao perigo: Suspeita alta e velocidade (perseguição / corrida de cadeira)
    const playing = !this.attract && this.running && this.phase === 'play' && !this.player.fired;
    const susK = playing ? THREE.MathUtils.smoothstep(this.player.sus, 50, 100) : 0;
    u.uSus.value += (susK - u.uSus.value) * Math.min(1, realDt * 3);
    const chased = this.bosses.some((b) => b.chaseW === this.player);
    const speedK = !playing ? 0 : chased ? 1 : this.pc.mode === 'chair' ? THREE.MathUtils.clamp((this.pc.chairSpeed - 2) / 4, 0, 1) : 0;
    u.uSpeed.value += (speedK - u.uSpeed.value) * Math.min(1, realDt * 6);
    this.desatPulse = Math.max(0, this.desatPulse - realDt * 1.2);
    u.uAberration.value = Math.max(0.0012, u.uAberration.value - realDt * 0.05);
    this.r.fovKick += (0 - this.r.fovKick) * Math.min(1, realDt * 4);
    u.uDesat.value += (Math.max((this.pc.mode === 'ghost' || this.pc.mode === 'cinematic') && !this.attract ? 0.65 : 0, this.desatPulse) - u.uDesat.value) * Math.min(1, realDt * 3);
    if (this.attract) {
      u.uDanger.value *= 0.9;
      u.uDesat.value *= 0.9;
    }
  }

  private updateAttractCamera(realDt: number) {
    this.attractT += realDt;
    const t = this.attractT * 0.05;
    const cam = this.r.camera;
    const target = W(10 + Math.sin(t) * 3, 21.5 + Math.cos(t * 0.8) * 0.6, 2.35);
    if (this.attractT < 0.1) this.pc.camPos.copy(target);
    this.pc.camPos.lerp(target, Math.min(1, realDt * 0.8));
    const look = W(10 + Math.sin(t * 0.7) * 3, 12, 0.9);
    if (this.attractT < 0.1) this.pc.camLook.copy(look);
    this.pc.camLook.lerp(look, Math.min(1, realDt * 0.8));
    cam.position.copy(this.pc.camPos);
    cam.lookAt(this.pc.camLook);
    this.r.baseFov = 60;
    // mascote à direita, perto da câmera, olhando o cursor
    const m = this.mascot;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const p = cam.position.clone().addScaledVector(fwd, 2.5).addScaledVector(right, 1.15);
    m.root.position.set(p.x, cam.position.y - 1.55, p.z);
    // o personagem fica em pé em cima do balcão em primeiro plano
    m.hoverHeight = 1.0;
    m.yaw = Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
    const mx = (this.input.mouseX / window.innerWidth) * 2 - 1;
    const my = -(this.input.mouseY / window.innerHeight) * 2 + 1;
    m.lookAt(new THREE.Vector3(mx, my, 0.5).unproject(cam));
    if (Math.random() < realDt * 0.4) m.impulse(0.3);
    m.update(realDt);
  }

  // ------------------------------------------------------------------ fim do dia
  endDay(allFired: boolean, ranking?: ScoreLine[]) {
    if (!this.running) return;
    if (this.net && this.net.isHost) {
      this.net.tally();
      ranking = this.net.ranking();
      this.net.end(allFired, ranking);
    }
    this.running = false;
    this.loops.alarm?.stop();
    this.loops.alarm = null;
    for (const l of ['typing', 'video', 'cooler', 'rain']) this.loops[l]?.setVol(0);
    const p = this.player;
    const susEnd = p.sus;
    // demitido: só metade do FUN de hoje entra no placar
    const dayFun = p.fired ? p.fun * RUN.firedKeepFun : p.fun;
    // carreira: sobreviver ao dia conta (desbloqueia missões para as próximas runs)
    if (!p.fired) this.career.dayDone();
    this.runFun += dayFun;
    // meta de FUN: no multi o host somou o time e mandou as vidas de cada um no ranking
    const goal = this.goal;
    const goalFun = ranking && this.net ? ranking.reduce((a, x) => a + (x.fired ? x.fun * RUN.firedKeepFun : x.fun), 0) : this.goalFun;
    const learning = this.dayIndex === 0;
    if (goalFun < goal && !this.lostToday && !learning && !p.fired) {
      this.lostToday = 'tedio';
      if (!this.net) this.strikes++;
    }
    // v0.10: a cota de trabalho é obrigatória (perde vida também)
    if (!this.tasks.cotaDone && !this.lostToday && !learning && !p.fired) {
      this.lostToday = 'cota';
      if (!this.net) this.strikes++;
    }
    const mine = ranking && this.net ? ranking.find((x) => x.id === this.net!.self) : null;
    if (mine) this.strikes = RUN.lives - mine.lives;
    const runOver = ranking && this.net ? ranking.every((x) => x.lives <= 0) : this.outOfLives;
    // a barra vai para amanhã: descansa um pouco; a cota fixa aberta o chefe cobra amanhã cedo (demitido volta zerado)
    let susNext = 0;
    if (!p.fired) {
      susNext = THREE.MathUtils.clamp(susEnd - RUN.dayEndRelief, 0, RUN.maxStartSus);
      // v0.10: cota não feita já custou vida; nada de dívida para amanhã
      this.fixedDebt = 0;
    } else this.fixedDebt = 0;
    p.sus = susNext;
    for (const w of this.workers) if (!w.isPlayer && !w.remote) w.sus = w.fired ? 0 : THREE.MathUtils.clamp(w.sus - RUN.dayEndRelief, 0, RUN.maxStartSus);
    const fx = FIXED[this.tasks.fixed.kind];
    const res: DayResult = {
      day: this.dayIndex, fun: dayFun, total: this.runFun, clutches: this.dayClutches,
      susStart: this.susStart, susEnd, susNext,
      susLog: (Object.entries(this.susLog) as [SusSource, number][]).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]),
      fired: p.fired, firedReason: this.firedReason, runOver, strikes: this.strikes,
      goal, goalFun, lifeLost: this.lostToday,
      events: [...this.dayEvents], boss: this.bosses[0]?.kind ?? 'chefe', items: this.shop.state().o,
      bots: ranking && this.net
        ? ranking.filter((x) => x.id !== this.net!.self).map((x) => ({ name: x.name, fun: x.fun, total: x.total, fired: x.fired }))
        : this.workers.filter((w) => !w.isPlayer).map((w) => ({ name: w.name, fun: w.fun, fired: w.fired })),
      tasks: this.tasks.done,
      fixed: { label: `Cota de trabalho (${fx.label}${this.tasks.pauta.length ? ' + pauta' : ''})`, done: this.tasks.cotaDone, prog: this.tasks.cotaText() },
      // a missão grande (★) e as 2 pequenas (•)
      funTasks: [
        { label: this.missions.spec.name, icon: this.missions.spec.icon, big: true, done: this.missions.done },
        ...this.funTasks.map((f) => ({ label: f.label, icon: f.icon, big: false, done: f.done })),
      ],
      vd: this.dayVd, wallet: this.wallet,
    };
    this.results.push(res);
    this.hud.help(null);
    this.hud.setBanner(null);
    this.hud.prompt(null);
    this.hud.meter(null);
    this.hud.crosshair(null);
    this.r.canvas.classList.remove('nocursor');
    this.audio.play('bell', 0.9);
    this.audio.tension = 0;
    void allFired;
    const perfect = goalFun >= goal && !p.fired;
    if (runOver) {
      this.hud.popup('fired', 'FIM DA RUN', `acabaram as ${RUN.lives} vidas`);
      this.audio.play('sad', 1);
    } else if (this.lostToday === 'tedio') {
      this.hud.popup('fired', 'ENTEDIADO', `FUN ${Math.floor(goalFun)} de ${goal}: −1 vida`);
      this.audio.play('sad', 0.8);
    } else {
      this.hud.popup(perfect ? 'good' : 'info', '18:00!', perfect ? `META BATIDA — ${Math.floor(goalFun)} de ${goal} FUN 🎉` : 'fim do expediente');
      if (perfect) {
        this.audio.play('fanfare', 0.8);
        this.juice.confetti(this.r.camera.position.clone().add(this.r.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.2)), 120, 4);
      }
    }
    // a run continua: todo mundo pega o elevador e desce para o hall (lojinha) antes do relatório
    if (!runOver) return this.enterLeaving(res);
    setTimeout(() => {
      this.unlockingOnPurpose = true;
      this.input.unlock();
      setTimeout(() => (this.unlockingOnPurpose = false), 200);
      this.hud.show(false);
      this.onDayEnd?.(res);
    }, 1700);
  }

  abortDay() {
    this.running = false;
    this.loops.rain?.stop();
    this.loops.rain = null;
    this.loops.alarm?.stop();
    this.loops.alarm = null;
    for (const l of ['typing', 'video', 'cooler']) this.loops[l]?.setVol(0);
    this.hud.show(false);
    this.unlockingOnPurpose = true;
    this.input.unlock();
    setTimeout(() => (this.unlockingOnPurpose = false), 200);
  }
}
