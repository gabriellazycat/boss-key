import * as THREE from 'three';
import {
  B, ACT, DAYS, DONO, PIZZA, PRINTER_JAM, BLACKOUT, STOCK, TIRO_COOLDOWN, VIDEO_HEADPHONE, WALK_STOCK,
  FLAGRANTE_FISICO, SUS_WANDER_IN_CONE, type ActivityId, type DaySpec,
} from '../balance';
import type { Renderer } from '../core/Renderer';
import type { AudioEngine, LoopSound } from '../core/Audio';
import type { Input } from '../core/Input';
import type { Juice } from '../core/Juice';
import { Office, W } from '../world/Office';
import { Nav } from '../world/Nav';
import { Ball, type Accessory } from '../entities/Ball';
import { Worker } from './Worker';
import { Boss, type BossTarget } from './Boss';
import { Bots } from './Bots';
import { Player, type Interactable } from './Player';
import { Computer, drawBotScreen } from '../apps/Computer';
import { Tiro } from '../apps/Tiro';
import type { AppEvent, AppId } from '../apps/common';
import type { HUD, TaskView } from '../ui/HUD';
import type { Settings } from '../save';

export interface DayResult {
  day: number;
  fun: number;
  meta: number;
  met: boolean;
  clutches: number;
  peakSus: number;
  fired: boolean;
  firedReason: string;
  warning: boolean;
  bots: { name: string; fun: number; fired: boolean }[];
  score: number;
  coffees: number;
  reports: number;
}

const PEOPLE: { name: string; color: string; acc: Accessory; tie: string }[] = [
  { name: 'Você', color: '#ff8a3d', acc: 'tuft', tie: '#2F5FA8' },
  { name: 'Bia', color: '#ff7eb6', acc: 'bun', tie: '#7A5BC0' },
  { name: 'Caio', color: '#4da3ff', acc: 'cap', tie: '#E6C43A' },
  { name: 'Duda', color: '#ffd23f', acc: 'bow', tie: '#3E9B5B' },
  { name: 'Edu', color: '#9b7bff', acc: 'beanie', tie: '#E0832B' },
  { name: 'Fê', color: '#3ddc97', acc: 'headset', tie: '#D45A8B' },
];
const ACTIVE_BOTS = [1, 2, 3, 5];
/** Atividades com teto diário de FUN controlado pelo Game. */
const CAPPED: ActivityId[] = ['pebolim', 'soneca'];

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
  readonly arcadeApp: Tiro;
  readonly bots: Bots;
  readonly pc: Player;
  time = 0;
  duration: number = B.DAY_DURATION;
  dayIndex = 0;
  day: DaySpec = DAYS[0];
  warnings = 0;
  results: DayResult[] = [];
  running = false;
  paused = false;
  attract = false;
  instinct = 0;
  blackout = false;
  boredNext = false;
  stock = { ...STOCK, ...WALK_STOCK };
  tiroCooldown = 0;
  headphones = false;
  coffeeMachineCd = 0;
  coffeePlayerCd = 0;
  onDayEnd: ((r: DayResult) => void) | null = null;
  onPause: (() => void) | null = null;
  allFiredPending = false;
  /** Mascote do menu (segue o mouse com os olhos). */
  readonly mascot: Ball;

  private attractT = 0;
  private reports: { at: number; deadline: number; active: boolean; done: boolean }[] = [];
  private printerJam = 0;
  private blackoutT = 0;
  private lightLevel = 1;
  private pizzaLeft = 0;
  private pizzaChecked = false;
  private pizzaJudgePending = false;
  private eventFired = false;
  private donoRondas: number[] = [];
  private firedReason = '';
  private allFiredT = -1;
  private dayClutches = 0;
  private coffees = 0;
  private reportsDone = 0;
  private funAccum = 0;
  private lastSoundPos: THREE.Vector3 | null = null;
  private lastSoundT = -99;
  private lastSoundLabel = '';
  private lastSubT = -99;
  private heartbeatT = 0;
  private sighT = 20;
  private noiseT = 0;
  private screenT = 0;
  private flashLight = 0;
  private flashColor = new THREE.Color();
  private tipIdx = 0;
  private tipT = 0;
  private firstDoor = false;
  private inspection = false;
  private prevTiroState = 'menu';
  private physicalWarned = false;
  private wanderWarned = false;
  private bossBumpT = -99;
  private chaseBanner = false;
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
    this.nav = new Nav(office.colliders, 0.42);
    office.desks.forEach((d, i) => {
      const p = PEOPLE[i];
      const ball = new Ball('employee', i === 0 ? settings.tie : p.tie, p.color, p.acc);
      const w = new Worker(i, i === 0 ? settings.name || 'Você' : p.name, i === 0, d, ball);
      this.allWorkers.push(w);
      r.scene.add(ball.root);
    });
    this.player = this.allWorkers[0];
    this.chefe = new Boss('chefe', this.bossSpec(DAYS[1]), this, W(15, 1.15));
    this.x9 = new Boss('x9', this.bossSpec(DAYS[0]), this, W(15, 1.15));
    this.dono = new Boss('dono', { speed: DONO.speed, identify: 0.5, check: 3, warn: DONO.warn }, this, W(18.3, 2.9));
    for (const b of [this.chefe, this.x9, this.dono]) r.scene.add(b.ball.root);
    this.computer = new Computer(this.hostAdapter());
    this.arcadeApp = new Tiro(this.arcadeHost());
    this.bots = new Bots(this);
    this.mascot = new Ball('employee', settings.tie, PEOPLE[0].color, 'tuft');
    this.mascot.root.visible = false;
    r.scene.add(this.mascot.root);
    this.pc = new Player(this);
    this.input.onBlur = () => {
      if (this.running && this.computer.forbiddenOpen && this.pc.mode === 'seated') {
        this.computer.open('planilha', this.time);
        this.computer.lastSafeSwitch = -99;
      }
    };
    document.addEventListener('pointerlockchange', () => {
      // ESC saiu do cursor travado no meio do dia → pausa
      const lockedModes = ['walk', 'chair', 'nap', 'foosball', 'ghost', 'hide'];
      if (!document.pointerLockElement && this.running && !this.paused && lockedModes.includes(this.pc.mode) && !this.unlockingOnPurpose) this.onPause?.();
    });
  }
  unlockingOnPurpose = false;

  private hostAdapter() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      emit: (e: AppEvent) => g.onAppEvent(e, false),
      get stock() {
        return g.stock;
      },
      get tiroCooldown() {
        return g.tiroCooldown;
      },
      get headphones() {
        return g.headphones;
      },
    };
  }

  private arcadeHost() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    const stock = {
      get tiro() {
        return g.stock.arcade;
      },
      set tiro(v: number) {
        g.stock.arcade = v;
      },
      pesca: 0,
      video: 0,
    };
    return {
      emit: (e: AppEvent) => g.onAppEvent(e, true),
      stock,
      tiroCooldown: 0,
      headphones: false,
    };
  }

  private bossSpec(d: DaySpec) {
    return { speed: d.speed, identify: d.identify, check: d.check, warn: d.warn };
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
    this.chefe.spec = this.bossSpec(DAYS[2]);
    this.x9.ball.root.visible = false;
    this.dono.ball.root.visible = false;
    this.chefe.ball.root.visible = true;
    this.chefe.reset();
    this.chefe.lastRondaEnd = -10;
    this.office.setLights(1);
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

  // ------------------------------------------------------------------ semana
  newWeek() {
    this.dayIndex = 0;
    this.warnings = 0;
    this.results = [];
    this.boredNext = false;
  }

  startDay(i: number) {
    this.attract = false;
    this.mascot.root.visible = false;
    this.dayIndex = i;
    this.day = DAYS[i];
    const k = this.settings.dayLength === 'curto' ? 0.6 : 1;
    this.duration = B.DAY_DURATION * k;
    this.time = 0;
    this.instinct = 0;
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
    this.pizzaLeft = 0;
    this.pizzaChecked = false;
    this.pizzaJudgePending = false;
    this.office.pizzaGroup.visible = false;
    this.office.pizzaSlices.forEach((s) => (s.visible = true));
    this.office.secCam.visible = i >= 2;
    this.eventFired = false;
    this.firedReason = '';
    this.allFiredT = -1;
    this.allFiredPending = false;
    this.dayClutches = 0;
    this.coffees = 0;
    this.reportsDone = 0;
    this.inspection = false;
    this.tipIdx = 0;
    this.tipT = 0;
    this.firstDoor = false;
    this.physicalWarned = false;
    this.wanderWarned = false;
    this.lastSoundPos = null;
    this.prevTiroState = 'menu';
    this.setLed(this.office.printerLight, '#3ddc97');
    this.setLed(this.office.breakerLight, '#3ddc97');
    this.office.drawWhiteboard(['BOSS KEY S.A.', `${this.day.name}`, `Meta: ${B.FUN_META[i]} FUN (rs)`, `Evento: ${this.day.eventName}`]);
    this.bots.reset();
    this.workers.length = 0;
    for (const w of this.allWorkers) {
      const active = w.isPlayer || ACTIVE_BOTS.includes(w.id);
      w.ball.root.visible = active;
      if (!active) continue;
      w.resetDay(w.isPlayer && this.boredNext ? B.TEDIO_SUS_START : 0);
      w.bored = w.isPlayer && this.boredNext;
      w.ball.setGhost(false);
      w.ball.setEye(w.bored ? 'bored' : 'normal');
      w.ball.lying = 0;
      w.ball.setSleeping(false);
      w.desk.crumbs.visible = false;
      w.desk.puddle.visible = false;
      this.seatBall(w);
      this.workers.push(w);
    }
    // a cadeira do jogador começa empurrada (ele está em pé)
    this.player.ball.setCrown(false);
    this.chefe.ball.root.visible = false;
    this.x9.ball.root.visible = false;
    this.dono.ball.root.visible = false;
    const main = this.day.boss === 'x9' ? this.x9 : this.chefe;
    main.spec = this.bossSpec(this.day);
    main.reset();
    main.lastRondaEnd = 0;
    main.lastRondaStart = 0;
    main.ball.root.visible = true;
    main.setFlashlight(this.day.flashlight);
    this.bosses = [main];
    if (i === 4) {
      this.dono.reset();
      this.dono.ball.root.visible = true;
      this.bosses.push(this.dono);
      this.donoRondas = DONO.rondas.map((t) => t * k);
    }
    this.reports = [];
    const n = B.RELATORIO_PER_DAY[i];
    for (let j = 0; j < n; j++) this.reports.push({ at: (25 + j * ((this.duration / k - 70) / n)) * k, deadline: B.RELATORIO_DEADLINE, active: false, done: false });
    this.computer.resetDay(this.day.unlocked.filter((a) => a === 'tiro' || a === 'pesca' || a === 'video') as AppId[]);
    this.computer.onSwitch = (from, to) => this.onSwitch(from, to);
    this.arcadeApp.resetDay();
    this.pc.resetDay();
    this.hud.show(true);
    this.hud.setWarnings(this.warnings, B.ADVERTENCIAS_LIMITE);
    this.hud.setBanner(null);
    this.hud.ghost(null);
    this.ensureLoops();
    this.audio.startMusic('day');
    this.audio.tension = 0;
    if (this.player.bored) setTimeout(() => this.hud.popup('warn', 'TÉDIO', 'Ontem você não bateu a meta: +15 de Suspeita'), 1800);
    this.hud.popup('info', `☀ ${this.day.name.toUpperCase()}`, `meta: ${B.FUN_META[i]} FUN · bom expediente`);
    this.audio.play('bell', 0.7);
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
    this.loops.arcade ??= this.audio.loop('video', this.office.arcades[0].screenCenter);
    this.loops.hum ??= this.audio.loop('hum', null);
    this.loops.hum?.setVol(0.05);
  }

  seatBall(w: Worker) {
    const b = w.ball;
    b.setPos(w.desk.seat.x, w.desk.seat.z);
    b.yaw = w.desk.seatYaw;
    b.hoverHeight = 0.94;
    b.velocity.set(0, 0, 0);
    w.seated = true;
    w.desk.chair.position.copy(w.desk.seat).setY(0);
  }

  // ------------------------------------------------------------------ eventos dos apps
  private onAppEvent(e: AppEvent, arcade: boolean) {
    const p = this.player;
    const src = arcade ? this.office.arcades[this.pc.arcadeIdx].screenCenter : p.desk.screenCenter;
    switch (e.t) {
      case 'fun':
        this.addFun(p, e.v, e.label, arcade ? src : undefined);
        break;
      case 'sfx':
        if (e.spatial || arcade) {
          this.audio.play3D(e.name, src, arcade ? 1 : 0.7, e.param ?? 0);
          if (e.name === 'boom' || e.name === 'pew') this.noise(src, arcade ? ACT.arcade.noise : ACT.tiro.noise, p, 0.15);
        } else this.audio.play(e.name, 0.8, e.param ?? 0);
        if (e.name === 'boom') this.juice.shake(0.07);
        break;
      case 'flash':
        this.flashLight = Math.max(this.flashLight, e.v);
        this.flashColor.set(e.color);
        break;
      case 'beat':
        if (!e.hit) this.addSus(p, B.SUS_PLANILHA_MISS, 'miss');
        else if (e.perfect) this.juice.sparks(p.desk.screenCenter.clone().addScaledVector(p.desk.screenNormal, 0.05), '#3ddc97', 10, 1.5);
        break;
      case 'consume':
        if (arcade) this.stock.arcade--;
        else if (e.what === 'tiro') this.stock.tiro--;
        else if (e.what === 'pesca') this.stock.pesca--;
        break;
      case 'toast':
        this.computer.toast(e.text);
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
    if (w.act && CAPPED.includes(w.act)) {
      v = Math.min(v, this.earnedLeft(w, w.act));
      if (v <= 0) return;
      w.earned[w.act] = (w.earned[w.act] ?? 0) + v;
    }
    const before = w.fun;
    w.fun = Math.min(B.FUN_MAX, w.fun + v);
    if (!w.isPlayer || this.attract) return;
    this.funAccum += w.fun - before;
    const meta = B.FUN_META[this.dayIndex];
    if (before < meta && w.fun >= meta) {
      this.hud.popup('good', 'META BATIDA!', 'tudo a partir daqui é lucro');
      this.audio.play('fanfare', 0.7);
      this.juice.confetti(this.player.ball.headWorld().add(new THREE.Vector3(0, 0.6, 0)), 80, 4);
    }
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

  addSus(w: Worker, v: number, _why = '') {
    if (w.fired) return;
    w.sus = THREE.MathUtils.clamp(w.sus + v, 0, B.SUS_MAX);
    w.peakSus = Math.max(w.peakSus, w.sus);
  }

  teamSus() {
    const alive = this.workers.filter((w) => !w.fired);
    if (!alive.length) return 0;
    let sum = 0;
    let max = 0;
    for (const w of alive) {
      sum += w.sus;
      max = Math.max(max, w.sus);
    }
    return 0.6 * (sum / alive.length) + 0.4 * max;
  }

  /** Tela proibida aberta (mesmo que o dono não esteja sentado). */
  isForbidden(w: Worker) {
    if (w.isPlayer && !this.attract) return this.computer.forbiddenOpen;
    return w.seated && w.botScreen !== 'planilha';
  }

  noise(p: THREE.Vector3, radius: number, src: Worker | null, throttle = 0) {
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
    this.addSus(w, 15);
    if (w.isPlayer) {
      this.hud.popup('good', 'DESPISTOU!', 'ele perdeu você de vista · +15 Suspeita');
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
        if (w.isPlayer && !this.attract && b.state !== 'chase') {
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
        } else if (!w.isPlayer || this.attract) this.fire(w, b, `Flagrante: ${what}`);
      }
      return;
    }
    // em pé longe da mesa e sem álibi
    const atDesk = w.ball.pos.distanceTo(w.desk.standPos) < 2.6;
    const alibi = w.isPlayer && !!this.pc.carrying;
    if (!atDesk && !alibi) {
      this.addSus(w, SUS_WANDER_IN_CONE * dt);
      if (w.isPlayer && !this.wanderWarned && !this.attract) {
        this.wanderWarned = true;
        this.hud.popup('warn', 'PASSEANDO?', 'sem café ou relatório na mão, a Suspeita sobe');
      }
    }
  }

  // ------------------------------------------------------------------ callbacks do chefe
  bossSound(pos: THREE.Vector3, label: string) {
    this.lastSoundPos = pos.clone();
    this.lastSoundT = this.time;
    this.lastSoundLabel = label;
    if (this.time - this.lastSubT > 2.5) {
      this.lastSubT = this.time;
      this.subtitle(label, pos);
    }
  }

  subtitle(text: string, pos?: THREE.Vector3) {
    if (!this.settings.subtitles || this.attract) return;
    let t = text;
    if (pos) {
      const a = this.relAngle(pos);
      const dir = Math.abs(a) < 0.6 ? 'à frente' : Math.abs(a) > 2.4 ? 'atrás' : a > 0 ? 'à direita' : 'à esquerda';
      t = `${text} — ${dir}`;
    }
    this.hud.subtitle(t);
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
    this.audio.play('door', b.kind === 'dono' ? 0.6 : 1);
    if (b.kind === 'dono') this.audio.play('keys', 0.8);
    this.audio.duck(0.35, 6);
    this.bossSound(b.pos, b.kind === 'dono' ? '[O DONO saiu da sala]' : '[PORTA DO CHEFE]');
    this.lastSubT = -99;
    if (this.attract) return;
    this.hud.setBanner(b.kind === 'dono' ? '👑 O DONO ESTÁ ANDANDO' : b.kind === 'x9' ? '⚠ O X9 ESTÁ DE OLHO' : '⚠ CHEFE EM RONDA', b.kind === 'dono' ? 'gold' : '');
    this.juice.shake(0.18);
    this.r.u.uAberration.value = 0.012;
    this.r.u.uDanger.value = 0.9;
    this.r.fovKick = 3;
    this.firstDoor = true;
  }

  onBossBack(_b: Boss) {
    if (this.bosses.some((b) => b.busy)) return;
    this.hud.setBanner(null);
    if (this.inspection) {
      this.inspection = false;
      const team = this.teamSus();
      if (team > 0) for (const w of this.workers) w.sus *= B.SUS_INSPECAO_RESET / Math.max(team, B.SUS_INSPECAO_RESET);
    }
  }

  onCheckStart(b: Boss, w: Worker) {
    if (w.isPlayer && !this.attract && w.seated) {
      this.subtitle(b.kind === 'dono' ? '[o Dono respira atrás de você]' : '[o chefe parou ATRÁS de você]');
      this.audio.play('heartbeat', 0.9, 1);
    }
    if (!w.seated && !w.fired) {
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'cadê?', 'ft-boss', 1.4);
      this.addSus(w, 5);
    }
  }

  onIdentify(b: Boss, w: Worker, mode: 'check' | 'flagrante' | 'inspecao' | 'audit' | 'chase') {
    if (w.fired) return;
    const forbidden = this.isForbidden(w);
    if (mode === 'flagrante') {
      w.flagrante = false;
      if (w.sus >= B.SUS_MAX) return this.fire(w, b, 'Suspeita no máximo (flagrante)');
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'falso alarme', 'ft-boss', 1.5);
    }
    if (forbidden && !w.seated) {
      // mesa vazia com jogo aberto
      this.addSus(w, 25);
      w.flagged = true;
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'JOGANDO?!', 'ft-boss', 1.6);
      if (w.isPlayer) {
        this.hud.popup('warn', 'ELE VIU SEU PC!', 'jogo aberto na mesa vazia: +25 Suspeita');
        this.audio.play('warn', 1);
      }
      return;
    }
    if (mode === 'inspecao' && w.seated && (forbidden || w.sus > 50)) return this.fire(w, b, 'Inspeção geral');
    if (mode === 'chase' && w.seated && !forbidden) {
      this.addSus(w, 25);
      w.flagged = true;
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'hmmmm...', 'ft-boss', 1.6);
      if (w.isPlayer) {
        this.hud.popup('good', 'ESCAPOU!', 'por um triz · +25 de Suspeita');
        this.audio.play('clutch', 0.7);
        this.juice.confetti(w.desk.screenCenter.clone().addScaledVector(w.desk.screenNormal, 0.4), 50, 3);
        this.r.u.uFlash.value = 0.5;
      }
      return;
    }
    if (forbidden && w.seated) return this.fire(w, b, b.kind === 'dono' ? 'O Dono viu sua tela' : 'Pego com a janela aberta');
    if (w.isPlayer && !this.attract && w.seated) {
      const since = this.time - this.computer.lastSafeSwitch;
      if (since <= B.CLUTCH_WINDOW) this.clutch(b);
      else if (since < 3) this.juice.text(this.player.desk.screenCenter.clone().addScaledVector(this.player.desk.screenNormal, 0.3).setY(1.45), 'ufa...', 'ft-small', 1.2);
    }
    if (w.crumbs >= 2) {
      this.addSus(w, B.CRUMBS_PENALTY, 'migalhas');
      if (w.isPlayer) this.hud.popup('warn', 'MIGALHAS!', '+15 de Suspeita');
    }
    if (w.puddle) this.addSus(w, 10, 'poça');
    w.flagged = false;
    if (!w.isPlayer || this.attract) this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), '👍', 'ft-boss', 1.0);
  }

  onCheckHold(b: Boss, w: Worker) {
    if (w.fired) return;
    if (this.isForbidden(w) && w.seated) this.fire(w, b, 'Reabriu a janela na frente do chefe');
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
    this.addSus(p, -B.CLUTCH_SUS);
    this.juice.hitstop(0.07);
    this.juice.slowmo(0.22, 0.6);
    this.juice.shake(0.35);
    this.r.u.uFlash.value = 0.75;
    this.r.u.uFlashColor.value.set('#fff6c8');
    this.r.u.uAberration.value = 0.03;
    this.r.fovKick = -9;
    this.audio.play('clutch', 1);
    this.audio.duck(0.2, 2);
    this.hud.popup('clutch', 'CLUTCH!', `+${B.CLUTCH_FUN} FUN · −${B.CLUTCH_SUS} Suspeita`);
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
      this.pc.dropCarry();
      if (this.pc.mode === 'arcade') this.pc.leaveArcade();
      this.computer.open('planilha', this.time);
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
        this.hud.popup('fired', 'DEMITIDO', 'só por hoje — volte amanhã');
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
        w.ball.setGhost(true);
        w.ball.hoverHeight = 1.7;
        w.ball.setEye('bored');
        if (this.attract) setTimeout(() => this.unfire(w), 4000);
      }, 1500);
    }
    if (!this.attract && this.workers.every((x) => x.fired)) {
      this.allFiredT = 2.8;
      this.allFiredPending = true;
    }
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
  private rondaTargets(count = 3): BossTarget[] {
    const alive = this.workers.filter((w) => !w.fired);
    const flagged = alive.filter((w) => w.flagged);
    const ranked = alive.filter((w) => !w.flagged).sort((a, b) => b.contribution - a.contribution + (Math.random() - 0.5) * 2);
    const list = [...flagged, ...ranked.slice(0, Math.max(0, count - flagged.length))];
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

  private updateDirector(dt: number) {
    const main = this.bosses[0];
    const d = this.day;
    const k = this.duration / B.DAY_DURATION;
    if (!main.busy) {
      const since = this.time - main.lastRondaEnd;
      const sinceStart = this.time - main.lastRondaStart;
      if (this.instinct >= B.INSTINCT_THRESHOLD && since >= d.minInterval * k) {
        this.instinct = 0;
        main.startRonda(this.rondaTargets(), 'instinto');
      } else if (sinceStart >= d.clockRonda * k && since >= d.minInterval * k * 0.5) {
        main.startRonda(this.rondaTargets(), 'relógio');
      }
    }
    for (const w of this.workers) {
      if (!w.fired && w.sus >= B.SUS_MAX && !w.flagrante) {
        w.flagrante = true;
        const t: BossTarget = { kind: 'desk', w, mode: 'flagrante' };
        if (main.busy) main.prioritize(t);
        else main.startRonda([t], 'flagrante');
        if (w.isPlayer) {
          this.hud.popup('warn', 'FLAGRANTE!', 'o chefe vem direto até você — baixe a Suspeita!');
          this.audio.play('warn', 1);
        }
      }
    }
    if (!this.inspection && this.teamSus() >= B.SUS_MAX - 0.01) {
      this.inspection = true;
      const ts = this.workers.filter((w) => !w.fired).map((w): BossTarget => ({ kind: 'desk', w, mode: 'inspecao' }));
      if (main.busy) main.queue.push(...ts);
      else main.startRonda(ts, 'inspeção');
      this.hud.popup('warn', 'INSPEÇÃO GERAL', 'janela aberta ou Suspeita > 50 = rua');
      this.audio.play('gong', 0.8);
    }
    this.updateEvents(dt, k);
    for (const r of this.reports) {
      if (!r.active && !r.done && this.time >= r.at && !this.reports.some((x) => x.active)) {
        r.active = true;
        this.audio.play('warn', 0.6);
        this.hud.popup('info', '📄 RELATÓRIO', 'imprima e entregue na bandeja do chefe');
      }
      if (r.active) {
        r.deadline -= dt;
        if (r.deadline <= 0) {
          r.active = false;
          r.done = true;
          if (!this.player.fired) {
            this.addSus(this.player, B.RELATORIO_LATE);
            this.player.flagged = true;
            this.hud.popup('warn', 'RELATÓRIO ATRASADO', '+20 Suspeita e visita do chefe');
            this.audio.play('sad', 0.8);
          }
          if (this.pc.carrying === 'report') this.pc.dropCarry();
        }
      }
    }
    if (this.dayIndex === 4) {
      while (this.donoRondas.length && this.time >= this.donoRondas[0]) {
        this.donoRondas.shift();
        this.dono.startRonda(this.rondaTargets(3), 'dono');
      }
    }
  }

  private updateEvents(dt: number, k: number) {
    const ev = this.day.event;
    const main = this.bosses[0];
    if (ev === 'boasvindas' && !this.eventFired && this.time >= 90 * k) {
      this.eventFired = true;
      this.audio.play('gong', 0.8);
      this.hud.popup('info', 'BOAS-VINDAS!', 'o X9 vai passar em TODAS as mesas');
      const ts = this.workers.filter((w) => !w.fired).map((w): BossTarget => ({ kind: 'desk', w, mode: 'check' }));
      if (main.busy) main.queue.push(...ts);
      else main.startRonda(ts, 'boas-vindas');
    }
    if (ev === 'impressora') {
      if (!this.eventFired && this.time >= PRINTER_JAM.at * k) {
        this.eventFired = true;
        this.printerJam = PRINTER_JAM.alarm;
        this.loops.alarm = this.audio.loop('alarm', this.office.P.printer.clone().setY(1));
        this.loops.alarm?.setVol(0.9);
        this.setLed(this.office.printerLight, '#ff2020');
        this.hud.popup('warn', 'IMPRESSORA TRAVOU!', 'o alarme atrai o chefe — destrave (E)');
        this.subtitle('[ALARME DA IMPRESSORA]', this.office.P.printer);
        const t: BossTarget = { kind: 'point', p: this.office.P.printer.clone().add(new THREE.Vector3(0, 0, -1.6)), stay: PRINTER_JAM.bossStay, why: 'printer' };
        if (main.busy) main.prioritize(t);
        else main.startRonda([t], 'impressora');
      }
      if (this.printerJam > 0) {
        this.printerJam -= dt;
        if (this.printerJam <= 0) this.endJam(false);
      }
    }
    if (ev === 'auditoria' && !this.eventFired && this.time >= 90 * k) {
      this.eventFired = true;
      const order = this.workers.filter((w) => !w.fired).sort(() => Math.random() - 0.5);
      this.office.drawWhiteboard(['AUDITORIA', ...order.map((w, i) => `${i + 1}. ${w.name}`)]);
      this.hud.popup('warn', 'AUDITORIA!', `ordem: ${order.map((w) => w.name).join(' → ')}`);
      this.audio.play('gong', 0.9);
      const ts = order.map((w): BossTarget => ({ kind: 'desk', w, mode: 'audit' }));
      if (main.busy) main.queue.push(...ts);
      else main.startRonda(ts, 'auditoria');
    }
    if (ev === 'blecaute') {
      if (!this.eventFired && this.time >= BLACKOUT.at * k) {
        this.eventFired = true;
        this.blackout = true;
        this.blackoutT = BLACKOUT.duration;
        this.audio.play('blackout', 1);
        this.juice.shake(0.3);
        this.setLed(this.office.breakerLight, '#ff2020');
        this.hud.popup('warn', 'BLECAUTE!', 'telas acesas denunciam — disjuntor na parede da cozinha');
        this.subtitle('[a luz caiu]');
      }
      if (this.blackout) {
        this.blackoutT -= dt;
        if (this.blackoutT <= 0) this.endBlackout(false);
      }
      const target = this.blackout ? 0 : 1;
      this.lightLevel += (target - this.lightLevel) * Math.min(1, dt * (this.blackout ? 10 : 3));
      this.office.setLights(this.lightLevel);
    }
    if (ev === 'pizza') {
      if (!this.eventFired && this.time >= 90 * k) {
        this.eventFired = true;
        this.pizzaLeft = PIZZA.slices;
        this.office.pizzaGroup.visible = true;
        this.audio.play('bell', 0.8);
        this.hud.popup('good', '🍕 PIZZA DE SEXTA', '+6 FUN por fatia — cuidado com a bagunça');
      }
      if (this.pizzaLeft > 0 && this.time < 175 * k)
        for (const w of this.workers) if (!w.isPlayer && !w.fired && Math.random() < dt * 0.01) this.eatPizza(w);
      if (this.eventFired && !this.pizzaChecked && this.time >= 180 * k) {
        this.pizzaChecked = true;
        this.dono.startRonda([{ kind: 'point', p: this.office.P.pizza.clone().add(new THREE.Vector3(0, 0, -1.4)), stay: 3, why: 'kitchen' }], 'pizza');
        this.pizzaJudgePending = true;
      }
    }
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

  eatPizza(w: Worker) {
    if (this.pizzaLeft <= 0) return;
    this.pizzaLeft--;
    w.pizzaEaten++;
    const s = this.office.pizzaSlices[this.pizzaLeft];
    if (s) s.visible = false;
    this.addFun(w, ACT.pizza.fun, w.isPlayer ? 'pizza' : undefined);
    this.addSus(w, ACT.pizza.sus);
    this.instinct += ACT.pizza.instinct;
    this.audio.play3D('crunch', this.office.P.pizza, 0.8);
    this.noise(this.office.P.pizza, ACT.pizza.noise, w);
    this.juice.crumbs(this.office.P.pizza.clone().setY(1.0), 8, '#f3b23c');
  }

  private endJam(fixed: boolean) {
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

  private endBlackout(fixed: boolean) {
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
    const P = this.office.P;
    const list: Interactable[] = [];
    const rep = this.reports.find((r) => r.active);
    if (this.printerJam > 0) list.push({ id: 'jam', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: PRINTER_JAM.fixHold, label: '<kbd>E</kbd>Destravar impressora (segure)', ok: () => true, act: () => this.endJam(true) });
    else if (rep && !this.pc.carrying)
      list.push({
        id: 'print', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: B.PRINT_HOLD, label: '<kbd>E</kbd>Imprimir relatório (segure)', ok: () => true,
        act: () => {
          this.pc.carry('report');
          this.audio.play3D('printer', P.printer, 1);
          this.noise(P.printer, 6, this.player);
        },
      });
    if (this.blackout) list.push({ id: 'breaker', pos: P.breaker.clone().setX(P.breaker.x + 0.5), r: 1.5, hold: BLACKOUT.breakerHold, label: '<kbd>E</kbd>Religar disjuntor (segure)', ok: () => true, act: () => this.endBlackout(true) });
    if (this.pizzaLeft > 0 && !this.pc.carrying) list.push({ id: 'pizza', pos: P.pizza.clone().setZ(P.pizza.z - 0.8), r: 1.5, hold: PIZZA.eatTime, label: `<kbd>E</kbd>Comer pizza (${this.pizzaLeft} restantes)`, ok: () => true, act: () => this.eatPizza(this.player) });
    return list;
  }

  takeCoffee() {
    this.coffeeMachineCd = B.CAFE_MACHINE_CD;
    this.coffeePlayerCd = B.CAFE_PLAYER_CD;
    this.audio.play3D('pour', this.office.P.coffee, 1);
    this.pc.carry('coffee');
    this.juice.smoke(this.office.P.coffee.clone().setY(1.5), 6, '#ffffff', 0.5);
  }

  deliver() {
    const p = this.player;
    const pos = this.office.P.tray.clone().setY(1.2);
    if (this.pc.carrying === 'coffee') {
      const k = this.pc.spill < B.SPILL_PUDDLE_AT ? 1 : 0.5;
      this.addSus(p, -B.CAFE_DELIVER_SELF * k);
      for (const w of this.workers) if (w !== p) this.addSus(w, -B.CAFE_DELIVER_OTHERS * k);
      this.coffees++;
      this.hud.popup('good', '☕ CAFÉ ENTREGUE', `−${Math.round(B.CAFE_DELIVER_SELF * k)} Suspeita (você) · −${Math.round(B.CAFE_DELIVER_OTHERS * k)} (time)`);
      this.juice.confetti(pos, 30, 3);
    } else if (this.pc.carrying === 'report') {
      const rep = this.reports.find((r) => r.active);
      if (rep) {
        rep.active = false;
        rep.done = true;
      }
      this.reportsDone++;
      this.addSus(p, -B.RELATORIO_DELIVER);
      this.hud.popup('good', '📄 RELATÓRIO ENTREGUE', `−${B.RELATORIO_DELIVER} Suspeita`);
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
        p.physical = pc.eating > 0 || pc.aiming;
        break;
      }
      case 'arcade':
        p.physical = true;
        p.act = this.arcadeApp.state === 'play' ? 'arcade' : null;
        break;
      case 'foosball':
        p.act = 'pebolim';
        p.physical = true;
        break;
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
    for (const bo of this.bosses) if (bo.ball.root.visible && bo.out) others.push({ b: bo.ball, r: 0.42 * bo.ball.spec.scale * 0.9, heavy: true });
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
        if (o.heavy && push > 0.04 && this.time - this.bossBumpT > 4) {
          this.bossBumpT = this.time;
          this.addSus(this.player, 8);
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
      const act = w.act;
      if (act) {
        let spec = { ...ACT[act] };
        if (act === 'video' && w.isPlayer && this.headphones) spec = { ...spec, ...VIDEO_HEADPHONE };
        const botScale = w.isPlayer ? 1 : 0.45;
        const discrete = act === 'fofoca' || act === 'maquina';
        if (!discrete) {
          this.addSus(w, spec.sus * dt * (w.isPlayer ? 1 : 0.6));
          w.heat = Math.min(100, w.heat + spec.heat * dt);
          this.instinct += spec.instinct * dt * botScale;
          w.contribution += spec.instinct * dt;
        }
        if (!w.isPlayer && w.seated) this.addFun(w, (act === 'pesca' ? 0.4 : spec.fun) * dt);
        if (w.isPlayer && act === 'soneca') this.addFun(w, spec.fun * dt);
        const src = w.seated ? w.desk.seat : w.ball.pos;
        if (spec.noise > 0 && (w.isPlayer || Math.random() < dt * 2)) this.noise(src, spec.noise, w, w.isPlayer ? dt : 0);
      } else if (w.seated) {
        if (w.isPlayer && this.computer.active === 'planilha' && this.computer.planilha.inRhythm) {
          this.addSus(w, -B.SUS_PLANILHA * dt);
          w.heat = Math.max(0, w.heat - B.HEAT_DECAY_PLANILHA * dt);
        } else if (!w.isPlayer) {
          this.addSus(w, -1.2 * dt);
          w.heat = Math.max(0, w.heat - B.HEAT_DECAY_PLANILHA * dt);
        } else {
          this.addSus(w, -B.SUS_IDLE_DECAY * dt);
          w.heat = Math.max(0, w.heat - B.HEAT_DECAY_IDLE * dt);
        }
      } else w.heat = Math.max(0, w.heat - B.HEAT_DECAY_IDLE * dt);
      if (w.heat > B.HEAT_HOT) this.addSus(w, B.SUS_HOT_EXTRA * dt);
      w.contribution *= Math.exp(-dt / 30);
      w.ball.heat = w.heat;
      if (this.dayIndex >= 2 && !w.seated) {
        const cam = this.office.P.secCam;
        const v = new THREE.Vector3(w.ball.pos.x - cam.x, 0, w.ball.pos.z - cam.z);
        const dist = v.length();
        if (dist > 1.5 && dist < 9 && v.normalize().z > Math.cos(THREE.MathUtils.degToRad(25))) this.addSus(w, B.CAMERA_FIXA_SUS * dt * 0.4);
      }
      // flagrante físico sentado (lanche/basquete à vista) — em pé é tratado em onSeen
      if (w.seated && w.physical) {
        const seer = this.bosses.find((b) => b.busy && b.sees(w.ball.pos, 10));
        if (seer) this.onSeen(w, seer, dt);
      }
      if (!w.physical) w.physicalSeen = Math.max(0, w.physicalSeen - dt);
    }
    for (const pa of this.pc.papers) {
      if (pa.flying || pa.reported) continue;
      for (const b of this.bosses)
        if (b.out && b.pos.distanceTo(pa.mesh.position) < B.PAPER_EVIDENCE_RADIUS) {
          pa.reported = true;
          this.addSus(this.player, B.PAPER_EVIDENCE_SUS);
          this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'lixo?!', 'ft-boss', 1.3);
        }
    }
    for (const pu of this.pc.puddles) {
      if (pu.reported) continue;
      for (const b of this.bosses)
        if (b.out && b.pos.distanceTo(pu.mesh.position) < 3) {
          pu.reported = true;
          this.addSus(this.player, 6);
          this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'café?!', 'ft-boss', 1.3);
        }
    }
  }

  // ------------------------------------------------------------------ telas e luzes
  private updateScreens(realDt: number) {
    const pd = this.player.desk;
    const comp = this.computer;
    if (!this.attract) {
      comp.draw(pd.ctx);
      if (this.pc.mode === 'seated' && !comp.frozen && !this.pc.aiming) comp.drawCursor(pd.ctx, this.pc.mouseCanvas.x, this.pc.mouseCanvas.y);
      pd.tex.needsUpdate = true;
    }
    this.screenT -= realDt;
    if (this.screenT <= 0) {
      this.screenT = 0.1;
      for (const w of this.allWorkers) {
        if (w.isPlayer && !this.attract) continue;
        const on = w.ball.root.visible && this.workers.includes(w);
        drawBotScreen(w.desk.ctx, !on || w.fired ? 'off' : w.seated ? w.botScreen : 'planilha', this.time + w.id * 3, w.id);
        w.desk.tex.needsUpdate = true;
      }
      if (this.attract && pd.canvas.width > 256) {
        const tmp = document.createElement('canvas');
        tmp.width = 256;
        tmp.height = 160;
        drawBotScreen(tmp.getContext('2d')!, this.player.botScreen, this.time, 0);
        pd.ctx.drawImage(tmp, 0, 0, 1024, 640);
        pd.tex.needsUpdate = true;
      }
      this.office.drawTV(this.time);
      this.office.arcades.forEach((a, i) => {
        const user = this.bots.spot(`arcade${i + 1}`).busy;
        if (user && user.isPlayer && !this.attract) return;
        if (user) {
          drawBotScreen(a.ctx, 'tiro', this.time + i, i);
          a.ctx.drawImage(a.canvas, 0, 0, 256, 160, 0, 0, 512, 400);
        } else this.drawArcadeIdle(a.ctx, i);
        a.tex.needsUpdate = true;
      });
    }
    if (this.pc.mode === 'arcade' && !this.attract) {
      const a = this.office.arcades[this.pc.arcadeIdx];
      this.arcadeApp.draw(a.ctx, { x: 0, y: 0, w: 512, h: 400 }, this.time);
      a.tex.needsUpdate = true;
    }
    this.flashLight = Math.max(0, this.flashLight - realDt * 5);
    for (const w of this.allWorkers) {
      const scr = w.isPlayer && !this.attract ? comp.active : w.botScreen;
      const base = scr === 'planilha' ? '#cfe8ff' : scr === 'tiro' ? '#ff9a5a' : scr === 'video' ? '#ff5aa0' : '#5ac8ff';
      const light = w.desk.light;
      light.color.set(base);
      if (w.isPlayer && this.flashLight > 0) light.color.lerp(this.flashColor, this.flashLight);
      const on = w.ball.root.visible && !w.fired;
      light.intensity = on ? (0.5 + 3 * (1 - this.lightLevel)) * (1 + (w.isPlayer ? this.flashLight * 1.5 : 0)) : 0.05;
    }
  }

  private drawArcadeIdle(g: CanvasRenderingContext2D, i: number) {
    const t = this.time;
    g.fillStyle = i ? '#1d1030' : '#101a30';
    g.fillRect(0, 0, 512, 400);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `hsla(${(k * 37 + t * 60) % 360},90%,60%,0.8)`;
      g.fillRect((k * 97 + t * 40 * (k % 3 + 1)) % 512, (k * 53) % 400, 4, 4);
    }
    g.font = '400 64px "Darumadrop One", Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = i ? '#ffd23f' : '#ff6b9a';
    g.fillText(i ? 'BALL OPS' : 'BOLA RUN', 256, 170 + Math.sin(t * 3) * 6);
    g.font = '700 24px Fredoka, sans-serif';
    g.fillStyle = Math.sin(t * 5) > 0 ? '#ffffff' : 'rgba(255,255,255,0.3)';
    g.fillText('INSIRA FICHA', 256, 260);
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
    this.loops.cooler?.setVol(!this.attract && p.heat > B.HEAT_HOT ? 0.2 + (p.heat - 60) / 120 : 0);
    const arcadePlaying = this.pc.mode === 'arcade' && this.arcadeApp.state === 'play';
    if (this.loops.arcade) {
      this.loops.arcade.setPos(this.office.arcades[this.pc.arcadeIdx].screenCenter);
      this.loops.arcade.setVol(arcadePlaying ? 0.3 : 0);
    }
    const fishing = seated && comp.active === 'pesca';
    a.stepMul = (this.headphones ? 0.35 : 1) * (fishing ? 0.7 : 1);
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
    a.tension += ((this.bosses.some((b) => b.busy) && !this.attract ? 0.6 : 0) + danger * 0.4 - a.tension) * Math.min(1, realDt * 2);
    const risky = (comp.forbiddenOpen && this.pc.mode === 'seated') || p.physical || this.bosses.some((b) => b.chaseW === p);
    const uD = danger * (risky ? 0.9 : 0.25);
    this.r.u.uDanger.value += (uD * (0.75 + 0.25 * Math.sin(this.time * 9)) - this.r.u.uDanger.value) * Math.min(1, realDt * 8);
    if (danger > 0.15) {
      this.heartbeatT -= realDt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 1.1 - danger * 0.55;
        a.play('heartbeat', 0.5 + danger * 0.6, danger);
      }
    }
    if (p.bored && !p.fired && !this.attract) {
      this.sighT -= realDt;
      if (this.sighT <= 0) {
        this.sighT = 20;
        a.play3D('sigh', p.ball.pos, 0.6);
        this.noise(p.ball.pos, 3, p);
      }
    }
  }

  // ------------------------------------------------------------------ HUD
  private updateHUD(realDt: number) {
    const p = this.player;
    const hud = this.hud;
    const meta = B.FUN_META[this.dayIndex];
    const chased = this.bosses.some((b) => b.chaseW === p);
    if (this.chaseBanner && !chased) hud.setBanner(this.bosses.some((b) => b.busy) ? '⚠ CHEFE EM RONDA' : null);
    this.chaseBanner = chased;
    hud.setFun(p.fun, meta);
    hud.setSus(this.teamSus(), p.sus);
    const k = this.duration / B.DAY_DURATION;
    const phase = this.time < B.PHASE_MIDDAY * k ? 'manhã' : this.time < B.PHASE_AFTERNOON * k ? `meio-dia · ${this.day.eventName}` : 'tarde';
    hud.setClock(this.time / this.duration, this.day.name, phase);
    const fishing = this.pc.mode === 'seated' && this.computer.active === 'pesca';
    const age = this.time - this.lastSoundT;
    if (this.lastSoundPos && age < 3) hud.setRadar(this.relAngle(this.lastSoundPos), 1 - age / 3, this.lastSoundLabel.replace(/[[\]]/g, ''), fishing);
    else hud.setRadar(null, 0, '', fishing);
    const u = this.day.unlocked;
    const s = this.stock;
    hud.setStocks([
      { icon: '✦', v: `${s.tiro}`, off: !u.includes('tiro'), tip: 'Ball Ops (PC)' },
      { icon: '🐟', v: `${s.pesca}`, off: !u.includes('pesca'), tip: 'Pesca Zen (PC)' },
      { icon: '▶', v: `${Math.ceil(s.video)}s`, off: !u.includes('video'), tip: 'ClipClop (PC)' },
      { icon: '🍪', v: `${s.lanche}`, off: !u.includes('lanche'), tip: 'Lanche (G)' },
      { icon: '📄', v: `${s.basquete}`, off: !u.includes('basquete'), tip: 'Papel (botão dir.)' },
      { icon: '🕹', v: `${s.arcade}`, tip: 'Fichas do fliperama' },
      { icon: '🪑', v: `${s.cadeira}`, tip: 'Corridas de cadeira' },
      { icon: '🗣', v: `${s.fofoca}`, tip: 'Fofocas' },
    ]);
    hud.setHeat(p.fired ? 0 : p.heat);
    const tasks: TaskView[] = [];
    const rep = this.reports.find((r) => r.active);
    if (rep) tasks.push({ icon: '📄', label: this.pc.carrying === 'report' ? 'leve à bandeja do chefe' : 'imprimir relatório (impressora)', bar: rep.deadline / B.RELATORIO_DEADLINE, urgent: rep.deadline < 20 });
    if (this.pc.carrying === 'coffee') tasks.push({ icon: '☕', label: 'leve o café à bandeja', bar: null });
    else if (this.coffeeMachineCd > 0) tasks.push({ icon: '☕', label: `máquina de café: ${Math.ceil(this.coffeeMachineCd)} s`, bar: 1 - this.coffeeMachineCd / B.CAFE_MACHINE_CD });
    else tasks.push({ icon: '☕', label: 'café pronto na cozinha', bar: null });
    if (this.pc.mode !== 'seated' && this.computer.forbiddenOpen) tasks.push({ icon: '⚠', label: 'jogo aberto no seu PC!', bar: null, urgent: true });
    if (this.tiroCooldown > 0 && s.tiro > 0) tasks.push({ icon: '✦', label: `Ball Ops recarrega: ${Math.ceil(this.tiroCooldown)} s`, bar: 1 - this.tiroCooldown / TIRO_COOLDOWN });
    if (this.printerJam > 0) tasks.push({ icon: '🚨', label: 'impressora travada!', bar: this.printerJam / PRINTER_JAM.alarm, urgent: true });
    if (this.blackout) tasks.push({ icon: '⚡', label: 'religue o disjuntor (cozinha)', bar: this.blackoutT / BLACKOUT.duration, urgent: true });
    if (this.pizzaLeft > 0) tasks.push({ icon: '🍕', label: `pizza na cozinha: ${this.pizzaLeft} fatias`, bar: null });
    hud.setTasks(tasks);
    this.updateTips(realDt);
    hud.update(realDt);
  }

  private updateTips(realDt: number) {
    if (!this.settings.tutorial || this.dayIndex !== 0) return this.hud.tip(null);
    this.tipT += realDt;
    const c = this.computer;
    const pc = this.pc;
    const tips: [string, () => boolean][] = [
      ['Bem-vindo ao escritório! Ande com <b>WASD</b> e olhe com o mouse. Mire no <b>seu PC</b> (plaquinha amarela) e <b>clique</b> para sentar.', () => pc.mode === 'seated'],
      ['No PC, clique em <b>✦ Ball Ops</b> na barra de tarefas para enrolar. Isso enche a barra de <b>FUN</b>.', () => c.active === 'tiro' || this.tipT > 20],
      ['Quando a <b>PORTA DO CHEFE</b> ranger, aperte <b>ESPAÇO</b> para voltar à planilha antes que ele pare atrás de você!', () => this.firstDoor],
      ['Troque no último segundo = <b>CLUTCH</b>. Segure o <b>botão direito</b> para espiar para trás.', () => !this.bosses[0].busy],
      ['Na planilha, aperte <b>F</b> quando o anel fechar para baixar a <b>Suspeita</b> (o olho lá em cima).', () => c.planilha.hitsTotal >= 3 || this.tipT > 20],
      ['Aperte <b>E</b> para levantar. Na <b>sala de descompressão</b> (sul) tem fliperama, pebolim, sofá e cesta de basquete!', () => pc.mode !== 'seated' || this.tipT > 18],
      ['Diversão andando é <b>física</b>: se o chefe te VIR jogando, é flagrante. Ouça a porta e corra para a mesa!', () => this.tipT > 12],
      ['Segure o <b>botão direito</b> andando para arremessar papel em qualquer lixeira. De longe vale mais!', () => this.stock.basquete < 6 || this.tipT > 14],
      ['Bata a meta de FUN até as 18h. Boa enrolação! 😎', () => this.tipT > 8],
    ];
    if (this.tipIdx >= tips.length) return this.hud.tip(null);
    const [txt, done] = tips[this.tipIdx];
    this.hud.tip(txt);
    if (done()) {
      this.tipIdx++;
      this.tipT = 0;
      this.audio.play('hover', 1);
    }
  }

  // ------------------------------------------------------------------ loop
  update(realDt: number) {
    const dt0 = this.juice.step(Math.min(realDt, 0.05));
    const ff = this.pc.fastForward && this.pc.mode === 'ghost' ? 6 : 1;
    const dt = this.paused ? 0 : dt0 * ff;
    if (this.attract) {
      this.time += dt;
      const b = this.chefe;
      if (!b.busy && this.time - b.lastRondaEnd > 12) b.startRonda(this.rondaTargets(2), 'vitrine');
      b.update(dt);
      this.bots.update(dt);
    } else if (this.running && !this.paused) {
      this.time += dt;
      this.tiroCooldown = Math.max(0, this.tiroCooldown - dt);
      const ts = this.computer.tiro.state;
      if (this.prevTiroState === 'play' && ts === 'over') this.tiroCooldown = TIRO_COOLDOWN;
      this.prevTiroState = ts;
      this.coffeeMachineCd = Math.max(0, this.coffeeMachineCd - dt);
      this.coffeePlayerCd = Math.max(0, this.coffeePlayerCd - dt);
      this.updateDirector(dt);
      this.checkPizzaJudge();
      for (const b of this.bosses) if (b.ball.root.visible) b.update(dt);
      this.updatePlayerAct();
      this.bots.update(dt);
      this.pc.update(dt, realDt);
      this.updatePlayerAct();
      this.separateBalls();
      this.updateWorkers(dt);
      if (this.input.pressed('KeyP') && this.pc.mode !== 'cinematic') this.onPause?.();
      if (this.input.pressed('Escape') && !this.input.locked && this.pc.mode !== 'cinematic') {
        if (this.pc.mode === 'arcade') this.pc.leaveArcade();
        else this.onPause?.();
      }
      if (this.allFiredT > 0) {
        this.allFiredT -= realDt;
        if (this.allFiredT <= 0) this.endDay(true);
      } else if (this.time >= this.duration) this.endDay(false);
    }
    this.office.update(realDt, this.attract ? (this.time % 300) / 300 : this.time / this.duration, this.time);
    if (this.attract) this.updateAttractCamera(realDt);
    else this.pc.updateCamera(realDt);
    this.juice.applyShake(this.r.camera);
    this.juice.update(dt0, realDt, this.r.camera);
    this.updateScreens(realDt);
    this.updateAudio(realDt);
    if (!this.attract && this.running) this.updateHUD(realDt);
    this.audio.updateListener(this.r.camera);
    this.audio.update();
    const u = this.r.u;
    u.uFlash.value = Math.max(0, u.uFlash.value - realDt * 2.2);
    u.uAberration.value = Math.max(0.0012, u.uAberration.value - realDt * 0.05);
    this.r.fovKick += (0 - this.r.fovKick) * Math.min(1, realDt * 4);
    u.uDesat.value += (((this.pc.mode === 'ghost' || this.pc.mode === 'cinematic') && !this.attract ? 0.65 : 0) - u.uDesat.value) * Math.min(1, realDt * 3);
    if (this.attract) {
      u.uDanger.value *= 0.9;
      u.uDesat.value *= 0.9;
    }
  }

  private updateAttractCamera(realDt: number) {
    this.attractT += realDt;
    const t = this.attractT * 0.05;
    const cam = this.r.camera;
    const target = W(17 + Math.sin(t) * 5, 24.4 + Math.cos(t * 0.8) * 0.8, 2.35);
    if (this.attractT < 0.1) this.pc.camPos.copy(target);
    this.pc.camPos.lerp(target, Math.min(1, realDt * 0.8));
    const look = W(12 + Math.sin(t * 0.7) * 3, 13, 0.9);
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
    m.hoverHeight = 0.85 + Math.sin(this.attractT * 2) * 0.02;
    m.yaw = Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
    const mx = (this.input.mouseX / window.innerWidth) * 2 - 1;
    const my = -(this.input.mouseY / window.innerHeight) * 2 + 1;
    m.lookAt(new THREE.Vector3(mx, my, 0.5).unproject(cam));
    if (Math.random() < realDt * 0.4) m.impulse(0.3);
    m.update(realDt);
  }

  // ------------------------------------------------------------------ fim do dia
  private endDay(allFired: boolean) {
    if (!this.running) return;
    this.running = false;
    this.unlockingOnPurpose = true;
    this.input.unlock();
    setTimeout(() => (this.unlockingOnPurpose = false), 200);
    this.loops.alarm?.stop();
    this.loops.alarm = null;
    for (const l of ['typing', 'video', 'cooler', 'arcade']) this.loops[l]?.setVol(0);
    const p = this.player;
    const meta = B.FUN_META[this.dayIndex];
    const met = p.fun >= meta;
    if (allFired) this.warnings++;
    this.boredNext = !met;
    const score = Math.round(p.fun + this.dayClutches * 8 + (met ? 20 : 0) - (p.fired ? 15 : 0) + this.coffees * 3 + this.reportsDone * 4);
    const res: DayResult = {
      day: this.dayIndex, fun: p.fun, meta, met, clutches: this.dayClutches, peakSus: p.peakSus,
      fired: p.fired, firedReason: this.firedReason, warning: allFired,
      bots: this.workers.filter((w) => !w.isPlayer).map((w) => ({ name: w.name, fun: w.fun, fired: w.fired })),
      score, coffees: this.coffees, reports: this.reportsDone,
    };
    this.results.push(res);
    this.hud.tip(null);
    this.hud.setBanner(null);
    this.hud.prompt(null);
    this.hud.meter(null);
    this.hud.crosshair(null);
    this.r.canvas.classList.remove('nocursor');
    this.audio.play('bell', 0.9);
    this.audio.tension = 0;
    if (allFired) {
      this.hud.popup('fired', 'ADVERTÊNCIA', 'o time inteiro foi demitido hoje');
      this.audio.play('sad', 1);
    } else {
      this.hud.popup(met ? 'good' : 'info', '18:00!', met ? 'FIM DO EXPEDIENTE — meta batida 🎉' : 'fim do expediente');
      if (met) {
        this.audio.play('fanfare', 0.8);
        this.juice.confetti(this.r.camera.position.clone().add(this.r.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.2)), 120, 4);
      }
    }
    setTimeout(() => {
      this.hud.show(false);
      this.onDayEnd?.(res);
    }, 1700);
  }

  abortDay() {
    this.running = false;
    this.loops.alarm?.stop();
    this.loops.alarm = null;
    for (const l of ['typing', 'video', 'cooler', 'arcade']) this.loops[l]?.setVol(0);
    this.hud.show(false);
    this.unlockingOnPurpose = true;
    this.input.unlock();
    setTimeout(() => (this.unlockingOnPurpose = false), 200);
  }
}
