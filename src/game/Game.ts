import * as THREE from 'three';
import { B, ACT, DAYS, DONO, PIZZA, PRINTER_JAM, BLACKOUT, STOCK, TIRO_COOLDOWN, VIDEO_HEADPHONE, BASQUETE_MISS_FUN, type ActivityId, type DayStock, type DaySpec } from '../balance';
import type { Renderer } from '../core/Renderer';
import type { AudioEngine, LoopSound } from '../core/Audio';
import type { Input } from '../core/Input';
import type { Juice } from '../core/Juice';
import { Office, W } from '../world/Office';
import { Nav } from '../world/Nav';
import { Ball, TIE_COLORS } from '../entities/Ball';
import { Worker } from './Worker';
import { Boss, lerpAngle, type BossTarget } from './Boss';
import { Computer, drawBotScreen } from '../apps/Computer';
import type { AppEvent, AppId, ScreenInput } from '../apps/common';
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

type Mode = 'seated' | 'standing' | 'ghost' | 'cinematic';

interface Paper {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  flying: boolean;
  owner: Worker;
  reported: boolean;
  scored: boolean;
  rimHit: boolean;
}

interface Interactable {
  id: string;
  pos: THREE.Vector3;
  r: number;
  label: string;
  hold: number;
  ok: () => boolean;
  act: () => void;
}

const BOT_NAMES = ['Você', 'Bia', 'Caio', 'Duda', 'Edu', 'Fê'];
const ACTIVE_BOTS = [2, 3, 5];

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
  stock: DayStock = { ...STOCK };
  tiroCooldown = 0;
  headphones = false;
  mode: Mode = 'seated';
  onDayEnd: ((r: DayResult) => void) | null = null;
  onPause: (() => void) | null = null;

  // câmera
  private camYaw = 0;
  private camPitch = 0.35;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private peek = 0;
  private aimCam = 0;
  private sitBlend = 1;
  private cine: { t: number; look: THREE.Vector3; from: THREE.Vector3 } | null = null;
  private clutchPeek = 0;
  private attractT = 0;

  // estado do dia
  private fastForward = false;
  private carrying: 'coffee' | 'report' | null = null;
  private carryMesh: THREE.Object3D | null = null;
  private spill = 0;
  private spilledOnce = false;
  private coffeeMachineCd = 0;
  private coffeePlayerCd = 0;
  private holdT = 0;
  private holdId = '';
  private eating = 0;
  private cleaning = 0;
  private aiming = false;
  private aimT = 0;
  private papers: Paper[] = [];
  private puddles: { mesh: THREE.Mesh; reported: boolean }[] = [];
  private reports: { at: number; deadline: number; active: boolean; done: boolean; late: boolean }[] = [];
  private printerJam = 0;
  private blackoutT = 0;
  private pizzaLeft = 0;
  private pizzaChecked = false;
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
  private botScreenT = 0;
  private flashLight = 0;
  private flashColor = new THREE.Color();
  private tipIdx = 0;
  private tipT = 0;
  private firstDoor = false;
  private inspection = false;
  private prevVel = new THREE.Vector3();
  private loops: { typing?: LoopSound | null; video?: LoopSound | null; cooler?: LoopSound | null; alarm?: LoopSound | null; hum?: LoopSound | null } = {};
  private raycaster = new THREE.Raycaster();
  private mouseCanvas = { x: 512, y: 320 };
  private physicalWarned = false;
  private throwWatch = 0;

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
      const ball = new Ball('employee', i === 0 ? settings.tie : TIE_COLORS[(i + 1) % TIE_COLORS.length]);
      const w = new Worker(i, BOT_NAMES[i], i === 0, d, ball);
      this.allWorkers.push(w);
      r.scene.add(ball.root);
    });
    this.player = this.allWorkers[0];
    this.chefe = new Boss('chefe', this.bossSpec(DAYS[1]), this, W(15, 1.15));
    this.x9 = new Boss('x9', this.bossSpec(DAYS[0]), this, W(15, 1.15));
    this.dono = new Boss('dono', { speed: DONO.speed, identify: 0.5, check: 3, warn: DONO.warn }, this, W(18.3, 2.9));
    for (const b of [this.chefe, this.x9, this.dono]) r.scene.add(b.ball.root);
    this.computer = new Computer(this.hostAdapter());
    this.input.onBlur = () => {
      if (this.running && this.computer.forbiddenOpen) {
        this.computer.open('planilha', this.time);
        this.computer.lastSafeSwitch = -99; // não conta como clutch
      }
    };
  }

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
    };
  }

  private bossSpec(d: DaySpec) {
    return { speed: d.speed, identify: d.identify, check: d.check, warn: d.warn };
  }

  // ------------------------------------------------------------------ modo vitrine (menu)
  startAttract() {
    this.attract = true;
    this.running = false;
    this.workers.length = 0;
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
    this.chefe.lastRondaEnd = -20;
    this.office.setLights(1);
    this.office.pizzaGroup.visible = false;
    this.office.secCam.visible = false;
    this.time = 0;
    this.hud.show(false);
    this.attractT = 0;
    this.audio.startMusic('menu');
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
    this.dayIndex = i;
    this.day = DAYS[i];
    const k = this.settings.dayLength === 'curto' ? 0.6 : 1;
    this.duration = B.DAY_DURATION * k;
    this.time = 0;
    this.instinct = 0;
    this.running = true;
    this.paused = false;
    this.fastForward = false;
    this.stock = { ...STOCK };
    this.tiroCooldown = 0;
    this.headphones = false;
    this.player.ball.setHeadphones(false);
    this.audio.stepMul = 1;
    this.audio.doorMul = 1;
    this.carrying = null;
    this.dropCarry();
    this.spill = 0;
    this.coffeeMachineCd = 0;
    this.coffeePlayerCd = 0;
    this.eating = 0;
    this.cleaning = 0;
    this.aiming = false;
    for (const p of this.papers) this.r.scene.remove(p.mesh);
    this.papers = [];
    for (const p of this.puddles) this.r.scene.remove(p.mesh);
    this.puddles = [];
    this.printerJam = 0;
    this.blackout = false;
    this.blackoutT = 0;
    this.lightLevel = 1;
    this.office.setLights(1);
    this.pizzaLeft = 0;
    this.pizzaChecked = false;
    this.office.pizzaGroup.visible = false;
    this.office.pizzaSlices.forEach((s) => (s.visible = true));
    this.office.secCam.visible = i >= 2;
    this.eventFired = false;
    this.firedReason = '';
    this.allFiredT = -1;
    this.dayClutches = 0;
    this.coffees = 0;
    this.reportsDone = 0;
    this.inspection = false;
    this.tipIdx = 0;
    this.tipT = 0;
    this.firstDoor = false;
    this.physicalWarned = false;
    this.lastSoundPos = null;
    this.office.printerLight.material = new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false });
    this.office.breakerLight.material = new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false });
    this.office.drawWhiteboard(['BOSS KEY S.A.', `${this.day.name}`, `Meta: ${B.FUN_META[i]} FUN (rs)`, `Evento: ${this.day.eventName}`]);

    // funcionários
    this.workers.length = 0;
    for (const w of this.allWorkers) {
      const active = w.isPlayer || ACTIVE_BOTS.includes(w.id);
      w.ball.root.visible = active;
      if (!active) continue;
      w.resetDay(w.isPlayer && this.boredNext ? B.TEDIO_SUS_START : 0);
      w.bored = w.isPlayer && this.boredNext;
      w.ball.setGhost(false);
      w.ball.setEye(w.bored ? 'bored' : 'normal');
      w.desk.crumbs.visible = false;
      w.desk.puddle.visible = false;
      this.seatBall(w);
      this.workers.push(w);
    }
    this.player.ball.setCrown(false);
    // chefes
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
    // relatórios
    this.reports = [];
    const n = B.RELATORIO_PER_DAY[i];
    for (let j = 0; j < n; j++) {
      const at = (25 + j * ((this.duration / k - 70) / n)) * k;
      this.reports.push({ at, deadline: B.RELATORIO_DEADLINE, active: false, done: false, late: false });
    }
    this.computer.resetDay(this.day.unlocked.filter((a) => a === 'tiro' || a === 'pesca' || a === 'video') as AppId[]);
    this.computer.onSwitch = (from, to) => this.onSwitch(from, to);
    this.setMode('seated');
    this.peek = 0;
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

  private ensureLoops() {
    if (!this.audio.ready) return;
    const seat = this.player.desk.screenCenter;
    this.loops.typing ??= this.audio.loop('typing', seat);
    this.loops.video ??= this.audio.loop('video', seat);
    this.loops.cooler ??= this.audio.loop('cooler', this.player.desk.seat.clone().setY(0.6));
    this.loops.hum ??= this.audio.loop('hum', null);
    this.loops.hum?.setVol(0.05);
  }

  private seatBall(w: Worker) {
    const b = w.ball;
    b.setPos(w.desk.seat.x, w.desk.seat.z);
    b.yaw = w.desk.seatYaw;
    b.hoverHeight = 0.94;
    b.velocity.set(0, 0, 0);
    w.seated = true;
    w.desk.chair.position.copy(w.desk.seat).setY(0);
  }

  // ------------------------------------------------------------------ eventos do computador
  private onAppEvent(e: AppEvent) {
    const p = this.player;
    switch (e.t) {
      case 'fun':
        this.addFun(p, e.v, e.label);
        break;
      case 'sfx':
        if (e.name === 'boom') this.juice.shake(0.07);
        if (e.spatial) {
          this.audio.play3D(e.name, this.player.desk.screenCenter, 0.7, e.param ?? 0);
          if (e.name === 'boom' || e.name === 'pew') this.noise(p.desk.seat, ACT.tiro.noise, p, 0.15);
        } else this.audio.play(e.name, 0.8, e.param ?? 0);
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
        if (e.what === 'tiro') this.stock.tiro--;
        if (e.what === 'pesca') this.stock.pesca--;
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
      // ALT-TAB de pânico: pequeno "whoosh" visual
      this.r.u.uAberration.value = Math.max(this.r.u.uAberration.value, 0.006);
      this.player.ball.impulse(0.25);
    }
  }

  // ------------------------------------------------------------------ números
  addFun(w: Worker, v: number, label?: string) {
    if (w.fired || v <= 0) return;
    const before = w.fun;
    w.fun = Math.min(B.FUN_MAX, w.fun + v);
    if (!w.isPlayer) return;
    this.funAccum += w.fun - before;
    const meta = B.FUN_META[this.dayIndex];
    if (before < meta && w.fun >= meta) {
      this.hud.popup('good', 'META BATIDA!', 'tudo a partir daqui é lucro');
      this.audio.play('fanfare', 0.7);
      this.juice.confetti(this.player.desk.screenCenter.clone().addScaledVector(this.player.desk.screenNormal, 0.3), 70, 4);
    }
    if (this.funAccum >= 1 || label) {
      const shown = label ? `+${v.toFixed(0)} ${label}` : `+${Math.floor(this.funAccum)}`;
      const pos = this.player.desk.screenCenter.clone().addScaledVector(this.player.desk.screenNormal, 0.25);
      pos.y += 0.25;
      pos.z += (Math.random() - 0.5) * 0.5;
      this.juice.text(pos, shown, 'ft-fun', 0.9);
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

  isForbidden(w: Worker) {
    if (w.isPlayer) return this.computer.forbiddenOpen;
    return w.botScreen !== 'planilha';
  }

  private activityOf(w: Worker): ActivityId | null {
    if (w.fired) return null;
    if (w.isPlayer) {
      if (!w.seated) return null;
      const app = this.computer.app;
      if (!app.forbidden || !app.running) return null;
      return app.id as ActivityId;
    }
    return w.botScreen === 'planilha' ? null : (w.botScreen as ActivityId);
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
    if (w.isPlayer && !this.attract) {
      this.subtitle(b.kind === 'dono' ? '[o Dono respira atrás de você]' : '[o chefe parou ATRÁS de você]');
      this.audio.play('heartbeat', 0.9, 1);
    }
    if (!w.seated && !w.fired) {
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'cadê?', 'ft-boss', 1.4);
      this.addSus(w, 5);
    }
  }

  onIdentify(b: Boss, w: Worker, mode: 'check' | 'flagrante' | 'inspecao' | 'audit') {
    if (w.fired) return;
    const forbidden = this.isForbidden(w) && w.seated;
    if (mode === 'flagrante') {
      w.flagrante = false;
      if (w.sus >= B.SUS_MAX) return this.fire(w, b, 'Suspeita no máximo (flagrante)');
      this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'falso alarme', 'ft-boss', 1.5);
    }
    if (mode === 'inspecao' && (forbidden || w.sus > 50)) return this.fire(w, b, 'Inspeção geral');
    if (forbidden) return this.fire(w, b, b.kind === 'dono' ? 'O Dono viu sua tela' : 'Pego com a janela aberta');
    // seguro!
    if (w.isPlayer && !this.attract) {
      const since = this.time - this.computer.lastSafeSwitch;
      if (since <= B.CLUTCH_WINDOW) this.clutch(b);
      else if (since < 3) {
        this.juice.text(this.player.desk.screenCenter.clone().addScaledVector(this.player.desk.screenNormal, 0.3).setY(1.45), 'ufa...', 'ft-small', 1.2);
      }
    }
    if (w.crumbs >= 2) {
      this.addSus(w, B.CRUMBS_PENALTY, 'migalhas');
      if (w.isPlayer) this.hud.popup('warn', 'MIGALHAS!', '+15 de Suspeita');
    }
    if (w.puddle) this.addSus(w, 10, 'poça');
    w.flagged = false;
    const head = b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0));
    if (!w.isPlayer || this.attract) this.juice.text(head, '👍', 'ft-boss', 1.0);
  }

  onCheckHold(b: Boss, w: Worker) {
    if (w.fired) return;
    if (this.isForbidden(w) && w.seated) this.fire(w, b, 'Reabriu a janela na frente do chefe');
  }

  onCheckEnd(_b: Boss, w: Worker) {
    if (w.isPlayer && !w.fired && !this.attract) this.audio.play('bell', 0.15);
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
    const c = this.player.desk.screenCenter.clone().addScaledVector(this.player.desk.screenNormal, 0.35);
    this.juice.confetti(c, 80, 4);
    this.juice.sparks(c, '#ffd23f', 30, 3);
    b.ball.impulse(0.7);
    this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), '?!', 'ft-boss', 1.6);
    this.clutchPeek = 1.5;
  }

  fire(w: Worker, b: Boss, reason: string) {
    if (w.fired) return;
    w.fired = true;
    w.ball.setEye('caught');
    w.ball.impulse(1.2);
    b.ball.setEye('alert');
    b.ball.impulse(0.8);
    const head = b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0));
    this.juice.text(head, 'DEMITIDO!', 'ft-boss', 1.8);
    if (w.isPlayer && !this.attract) {
      this.firedReason = reason;
      this.dropCarry();
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
      this.cine = { t: 2.8, look: b.ball.headWorld(), from: this.r.camera.position.clone() };
      this.setMode('cinematic');
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
    if (!this.attract && this.workers.every((x) => x.fired)) this.allFiredT = 2.8;
  }

  private unfire(w: Worker) {
    w.fired = false;
    w.sus = 10;
    w.ball.setGhost(false);
    w.ball.setEye('normal');
    this.seatBall(w);
  }

  // ------------------------------------------------------------------ rondas
  private rondaTargets(count = 3): BossTarget[] {
    const alive = this.workers.filter((w) => !w.fired);
    const flagged = alive.filter((w) => w.flagged);
    const ranked = alive.filter((w) => !w.flagged).sort((a, b) => b.contribution - a.contribution + (Math.random() - 0.5) * 2);
    const list = [...flagged, ...ranked.slice(0, Math.max(0, count - flagged.length))];
    const t: BossTarget[] = [];
    for (const w of list) {
      if (Math.random() < 0.35) {
        const ring = this.office.P.ring[Math.floor(Math.random() * 4)];
        t.push({ kind: 'point', p: ring.clone(), stay: 0.8, why: 'patrol' });
      }
      t.push({ kind: 'desk', w, mode: 'check' });
    }
    return t;
  }

  private updateDirector(dt: number) {
    const main = this.bosses[0];
    const d = this.day;
    const k = this.duration / B.DAY_DURATION;
    // Instinto
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
    // flagrante individual
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
    // inspeção geral
    if (!this.inspection && this.teamSus() >= B.SUS_MAX - 0.01) {
      this.inspection = true;
      const ts = this.workers.filter((w) => !w.fired).map((w): BossTarget => ({ kind: 'desk', w, mode: 'inspecao' }));
      if (main.busy) main.queue.push(...ts);
      else main.startRonda(ts, 'inspeção');
      this.hud.popup('warn', 'INSPEÇÃO GERAL', 'janela aberta ou Suspeita > 50 = rua');
      this.audio.play('gong', 0.8);
    }
    // eventos do meio-dia
    this.updateEvents(dt, k);
    // relatórios
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
          r.late = true;
          if (!this.player.fired) {
            this.addSus(this.player, B.RELATORIO_LATE);
            this.player.flagged = true;
            this.hud.popup('warn', 'RELATÓRIO ATRASADO', '+20 Suspeita e visita do chefe');
            this.audio.play('sad', 0.8);
          }
          if (this.carrying === 'report') this.dropCarry();
        }
      }
    }
    // Dono (sexta)
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
        this.office.printerLight.material = new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false });
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
        this.office.breakerLight.material = new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false });
        this.hud.popup('warn', 'BLECAUTE!', 'telas acesas denunciam — disjuntor na cozinha');
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
      // bots comem
      if (this.pizzaLeft > 0 && this.time < 175 * k) {
        for (const w of this.workers)
          if (!w.isPlayer && !w.fired && Math.random() < dt * 0.012) this.eatPizza(w);
      }
      if (this.eventFired && !this.pizzaChecked && this.time >= 180 * k) {
        this.pizzaChecked = true;
        this.dono.startRonda([{ kind: 'point', p: this.office.P.pizza.clone().add(new THREE.Vector3(0, 0, -1.4)), stay: 3, why: 'kitchen' }], 'pizza');
        setTimeout(() => this.judgePizza(), 100);
      }
    }
  }
  private lightLevel = 1;
  private pizzaJudgePending = false;

  private judgePizza() {
    this.pizzaJudgePending = true;
  }

  private checkPizzaJudge() {
    if (!this.pizzaJudgePending) return;
    if (this.dono.state !== 'stay') return;
    this.pizzaJudgePending = false;
    const eaten = PIZZA.slices - this.pizzaLeft;
    if (eaten >= PIZZA.messLimit) {
      const alive = this.workers.filter((w) => !w.fired && w.pizzaEaten > 0);
      const max = Math.max(...alive.map((w) => w.pizzaEaten), 0);
      const top = alive.filter((w) => w.pizzaEaten === max);
      const who = top[Math.floor(Math.random() * top.length)];
      if (who) this.fire(who, this.dono, `Comeu ${who.pizzaEaten} fatias de pizza`);
    } else {
      this.juice.text(this.dono.ball.headWorld().add(new THREE.Vector3(0, 1.4, 0)), 'cozinha limpa.', 'ft-boss', 1.6);
    }
  }

  private eatPizza(w: Worker) {
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
    this.office.printerLight.material = new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false });
    for (const b of this.bosses) {
      b.queue = b.queue.filter((q) => !(q.kind === 'point' && q.why === 'printer'));
      if (b.cur?.kind === 'point' && b.cur.why === 'printer' && b.state === 'stay') b.endStay();
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
    this.office.breakerLight.material = new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false });
    if (fixed) {
      this.addSus(this.player, -BLACKOUT.heroSus);
      this.hud.popup('good', 'LUZ!', 'disjuntor religado · −10 Suspeita');
      this.juice.sparks(this.office.P.breaker.clone().setY(1.5), '#ffd23f', 40, 4);
    }
  }

  // ------------------------------------------------------------------ bots
  private updateBots(dt: number) {
    const anyOut = this.bosses.some((b) => b.busy && b.ball.root.visible);
    for (const w of this.workers) {
      if (w.isPlayer) continue;
      const b = w.ball;
      if (w.fired) {
        b.update(dt);
        continue;
      }
      w.botTimer -= dt;
      const unlocked = this.day.unlocked.filter((a) => a === 'tiro' || a === 'video' || a === 'pesca') as AppId[];
      if (anyOut) {
        if (w.botScreen !== 'planilha') {
          if (w.botReact < 0) {
            w.botReact = B.BOT_REACT_MIN + Math.random() * (B.BOT_REACT_MAX - B.BOT_REACT_MIN);
            w.botFailRonda = Math.random() < B.BOT_FAIL_CHANCE;
          }
          w.botReact -= dt;
          if (w.botReact <= 0 && !w.botFailRonda) {
            w.botScreen = 'planilha';
            b.impulse(0.4);
            b.setEye('alert');
            setTimeout(() => !w.fired && b.setEye('normal'), 1200);
          }
        }
      } else {
        w.botReact = -1;
        if (w.botTimer <= 0) {
          if (w.botScreen === 'planilha' && unlocked.length && Math.random() < 0.55) {
            w.botScreen = unlocked[Math.floor(Math.random() * unlocked.length)];
            w.botTimer = 6 + Math.random() * 10;
          } else {
            w.botScreen = 'planilha';
            w.botTimer = 8 + Math.random() * 16;
          }
        }
      }
      // atuação
      const playing = w.botScreen !== 'planilha';
      if (playing) {
        if (Math.random() < dt * 3) b.impulse(0.12);
        b.lookAt(w.desk.screenCenter);
      } else {
        if (Math.random() < dt * 5) b.impulse(-0.05);
        b.lookAt(w.desk.screenCenter.clone().setY(1.0));
      }
      for (const boss of this.bosses) {
        if (boss.busy && boss.pos.distanceTo(b.pos) < 5) {
          b.lookAt(boss.ball.headWorld());
          if (b.eye === 'normal' && playing) b.setEye('alert');
        }
      }
      b.yaw = w.desk.seatYaw;
      b.update(dt);
    }
  }

  // ------------------------------------------------------------------ números contínuos
  private updateWorkers(dt: number) {
    const p = this.player;
    for (const w of this.workers) {
      if (w.fired) continue;
      const act = this.activityOf(w);
      if (act) {
        let spec = { ...ACT[act] };
        if (act === 'video' && w.isPlayer && this.headphones) spec = { ...spec, ...VIDEO_HEADPHONE };
        const botScale = w.isPlayer ? 1 : 0.45;
        this.addSus(w, spec.sus * dt * (w.isPlayer ? 1 : 0.6));
        w.heat = Math.min(100, w.heat + spec.heat * dt);
        this.instinct += spec.instinct * dt * botScale;
        w.contribution += spec.instinct * dt;
        if (!w.isPlayer) {
          const rate = act === 'pesca' ? 0.4 : spec.fun;
          this.addFun(w, rate * dt);
        }
        if (spec.noise > 0 && (w.isPlayer || Math.random() < dt * 2)) this.noise(w.desk.seat, spec.noise, w, w.isPlayer ? dt : 0);
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
      } else {
        w.heat = Math.max(0, w.heat - B.HEAT_DECAY_IDLE * dt);
      }
      if (w.heat > B.HEAT_HOT) this.addSus(w, B.SUS_HOT_EXTRA * dt);
      w.contribution *= Math.exp(-dt / 30);
      w.ball.heat = w.heat;
      // câmera fixa (quarta em diante): em pé no cone do corredor
      if (this.dayIndex >= 2 && !w.seated) {
        const cam = this.office.P.secCam;
        const v = new THREE.Vector3(w.ball.pos.x - cam.x, 0, w.ball.pos.z - cam.z);
        const dist = v.length();
        if (dist > 1.5 && dist < 9 && v.normalize().z > Math.cos(THREE.MathUtils.degToRad(25))) this.addSus(w, B.CAMERA_FIXA_SUS * dt * 0.4);
      }
    }
    // flagrante físico do jogador (lanche/basquete à vista)
    if (!p.fired && (this.eating > 0 || this.aiming)) {
      const seen = this.bosses.some((b) => b.busy && b.sees(p.ball.pos, 10));
      if (seen) {
        p.physicalSeen += dt;
        if (!this.physicalWarned) {
          this.physicalWarned = true;
          this.hud.popup('warn', 'ELE ESTÁ VENDO!', 'pare a atividade física!');
        }
        if (p.physicalSeen > 1) {
          const b = this.bosses.find((x) => x.busy && x.sees(p.ball.pos, 10))!;
          this.fire(p, b, 'Flagrante físico');
        }
      }
    } else p.physicalSeen = Math.max(0, p.physicalSeen - dt);
    // evidências no chão
    for (const pa of this.papers) {
      if (pa.flying || pa.reported) continue;
      for (const b of this.bosses)
        if (b.out && b.pos.distanceTo(pa.mesh.position) < B.PAPER_EVIDENCE_RADIUS) {
          pa.reported = true;
          this.addSus(pa.owner, B.PAPER_EVIDENCE_SUS);
          this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'lixo?!', 'ft-boss', 1.3);
        }
    }
    for (const pu of this.puddles) {
      if (pu.reported) continue;
      for (const b of this.bosses)
        if (b.out && b.pos.distanceTo(pu.mesh.position) < 3) {
          pu.reported = true;
          this.addSus(this.player, 6);
          this.juice.text(b.ball.headWorld().add(new THREE.Vector3(0, 1.3, 0)), 'café?!', 'ft-boss', 1.3);
        }
    }
  }

  // ------------------------------------------------------------------ jogador
  setMode(m: Mode) {
    this.mode = m;
    const p = this.player;
    if (m === 'seated') {
      p.seated = true;
      this.seatBall(p);
      this.input.unlock();
      this.hud.controls('seated');
    } else if (m === 'standing') {
      p.seated = false;
      p.ball.hoverHeight = 0.78;
      this.input.lock();
      this.hud.controls('standing');
      this.camYaw = p.desk.seatYaw;
      this.camPitch = 0.42;
    } else if (m === 'ghost') {
      p.seated = false;
      p.ball.setGhost(true);
      p.ball.hoverHeight = 1.4;
      p.ball.setEye('bored');
      this.input.lock();
      this.hud.controls('ghost');
      this.hud.ghost('👻 <b>DEMITIDO HOJE</b> — você é um fantasma.<br>Assista os colegas ou aperte <b>ENTER</b> para acelerar o tempo.');
    } else {
      this.hud.controls('none');
    }
    this.r.canvas?.classList.toggle('nocursor', m === 'seated');
  }

  private standUp() {
    if (this.computer.forbiddenOpen) this.computer.open('planilha', this.time);
    this.computer.lastSafeSwitch = -99;
    const p = this.player;
    p.ball.setPos(p.desk.standPos.x, p.desk.standPos.z);
    p.ball.yaw = p.desk.seatYaw + Math.PI;
    this.setMode('standing');
    this.audio.play('click', 0.5);
    p.ball.impulse(0.5);
    // cadeira afasta
    p.desk.chair.position.lerp(p.desk.standPos, 0.25);
  }

  private interactables(): Interactable[] {
    const p = this.player;
    const P = this.office.P;
    const list: Interactable[] = [
      { id: 'sit', pos: p.desk.standPos, r: 1.3, label: '<kbd>E</kbd>Sentar na sua mesa', hold: 0, ok: () => !this.carrying, act: () => this.setMode('seated') },
      {
        id: 'coffee', pos: P.coffee.clone().setZ(P.coffee.z - 0.6), r: 1.4, hold: 1.2,
        label: this.carrying ? 'mãos ocupadas' : this.coffeeMachineCd > 0 ? `☕ máquina esquentando… ${Math.ceil(this.coffeeMachineCd)} s` : this.coffeePlayerCd > 0 ? `☕ você pegou café há pouco (${Math.ceil(this.coffeePlayerCd)} s)` : '<kbd>E</kbd>Pegar café (segure)',
        ok: () => !this.carrying && this.coffeeMachineCd <= 0 && this.coffeePlayerCd <= 0,
        act: () => this.takeCoffee(),
      },
      {
        id: 'tray', pos: P.tray.clone().setZ(P.tray.z + 0.6), r: 1.4, hold: 0,
        label: this.carrying === 'coffee' ? '<kbd>E</kbd>Entregar café ao chefe' : this.carrying === 'report' ? '<kbd>E</kbd>Entregar relatório' : 'bandeja do chefe',
        ok: () => !!this.carrying,
        act: () => this.deliver(),
      },
    ];
    const rep = this.reports.find((r) => r.active);
    if (this.printerJam > 0) list.push({ id: 'jam', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: PRINTER_JAM.fixHold, label: '<kbd>E</kbd>Destravar impressora (segure)', ok: () => true, act: () => this.endJam(true) });
    else if (rep && !this.carrying)
      list.push({
        id: 'print', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: B.PRINT_HOLD, label: '<kbd>E</kbd>Imprimir relatório (segure)', ok: () => true,
        act: () => {
          this.carry('report');
          this.audio.play3D('printer', P.printer, 1);
          this.noise(P.printer, 6, this.player);
        },
      });
    if (this.blackout) list.push({ id: 'breaker', pos: P.breaker.clone().setZ(P.breaker.z - 0.7), r: 1.4, hold: BLACKOUT.breakerHold, label: '<kbd>E</kbd>Religar disjuntor (segure)', ok: () => true, act: () => this.endBlackout(true) });
    if (this.pizzaLeft > 0 && !this.carrying) list.push({ id: 'pizza', pos: P.pizza.clone().setZ(P.pizza.z - 0.8), r: 1.5, hold: PIZZA.eatTime, label: `<kbd>E</kbd>Comer pizza (${this.pizzaLeft} restantes)`, ok: () => true, act: () => this.eatPizza(this.player) });
    for (const pa of this.papers)
      if (!pa.flying && pa.owner === p)
        list.push({
          id: `paper${pa.mesh.id}`, pos: pa.mesh.position, r: 1.0, hold: 0, label: '<kbd>E</kbd>Recolher bolinha de papel', ok: () => true,
          act: () => {
            this.r.scene.remove(pa.mesh);
            this.papers.splice(this.papers.indexOf(pa), 1);
            this.stock.basquete++;
            this.audio.play('pop', 0.6);
          },
        });
    return list;
  }

  private takeCoffee() {
    this.coffeeMachineCd = B.CAFE_MACHINE_CD;
    this.coffeePlayerCd = B.CAFE_PLAYER_CD;
    this.audio.play3D('pour', this.office.P.coffee, 1);
    this.carry('coffee');
    this.spill = 0;
    this.spilledOnce = false;
    this.juice.smoke(this.office.P.coffee.clone().setY(1.5), 6, '#ffffff', 0.5);
  }

  private carry(what: 'coffee' | 'report') {
    this.dropCarry();
    this.carrying = what;
    const m = what === 'coffee' ? this.office.coffeeCupProto.clone() : this.office.reportProto.clone();
    this.player.ball.carryAnchor.add(m);
    this.carryMesh = m;
    this.player.ball.impulse(0.3);
  }

  private dropCarry() {
    if (this.carryMesh) this.carryMesh.removeFromParent();
    this.carryMesh = null;
    this.carrying = null;
  }

  private deliver() {
    const p = this.player;
    const pos = this.office.P.tray.clone().setY(1.2);
    if (this.carrying === 'coffee') {
      const k = this.spill < B.SPILL_PUDDLE_AT ? 1 : 0.5;
      this.addSus(p, -B.CAFE_DELIVER_SELF * k);
      for (const w of this.workers) if (w !== p) this.addSus(w, -B.CAFE_DELIVER_OTHERS * k);
      this.coffees++;
      this.hud.popup('good', '☕ CAFÉ ENTREGUE', `−${Math.round(B.CAFE_DELIVER_SELF * k)} Suspeita (você) · −${Math.round(B.CAFE_DELIVER_OTHERS * k)} (time)`);
      this.juice.confetti(pos, 30, 3);
    } else if (this.carrying === 'report') {
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
    this.dropCarry();
  }

  private updatePlayer(dt: number, realDt: number) {
    const p = this.player;
    const inp = this.input;
    if (this.mode === 'cinematic') {
      p.ball.update(dt);
      if (this.cine) {
        this.cine.t -= realDt;
        if (this.cine.t <= 0) {
          this.cine = null;
          if (this.running && this.allFiredT < 0) this.setMode('ghost');
        }
      }
      return;
    }
    if (this.mode === 'seated') return this.updateSeated(dt, realDt);
    // ----- em pé / fantasma
    if (inp.locked) {
      this.camYaw -= inp.dx * 0.0025;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.dy * 0.0022, -0.2, 1.1);
    } else if (inp.pressed('Mouse0')) inp.lock();
    const fwd = new THREE.Vector3(Math.sin(this.camYaw + Math.PI), 0, Math.cos(this.camYaw + Math.PI));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3()
      .addScaledVector(fwd, inp.axis('KeyS', 'KeyW'))
      .addScaledVector(right, inp.axis('KeyA', 'KeyD'));
    if (mv.lengthSq() > 1) mv.normalize();
    const ghost = this.mode === 'ghost';
    const careful = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const maxSp = ghost ? 6 : careful ? 2.0 : B.PLAYER_SPEED;
    const desired = mv.multiplyScalar(maxSp);
    const v = p.ball.velocity;
    const accel = B.PLAYER_ACCEL * dt;
    const dv = desired.sub(v);
    if (dv.length() > accel) dv.setLength(accel);
    v.add(dv);
    p.ball.pos.addScaledVector(v, dt);
    if (!ghost) this.office.collide(p.ball.pos, 0.38);
    p.ball.pos.x = THREE.MathUtils.clamp(p.ball.pos.x, -14.6, 14.6);
    p.ball.pos.z = THREE.MathUtils.clamp(p.ball.pos.z, -9.6, 9.6);
    if (v.lengthSq() > 0.05) p.ball.yaw = lerpAngle(p.ball.yaw, Math.atan2(v.x, v.z), Math.min(1, dt * 10));
    // derramar café
    if (this.carrying === 'coffee') {
      const acc = new THREE.Vector3().subVectors(v, this.prevVel).length() / Math.max(dt, 1e-4);
      const sp = v.length();
      const rate = Math.max(0, sp - 2.3) * 7 + Math.max(0, acc - 6) * 0.25;
      this.spill = Math.min(100, this.spill + rate * dt);
      if (rate > 3 && Math.random() < dt * 8) this.juice.crumbs(p.ball.carryAnchor.getWorldPosition(new THREE.Vector3()), 2, '#5a3418');
      if (!this.spilledOnce && this.spill >= B.SPILL_PUDDLE_AT) {
        this.spilledOnce = true;
        this.makePuddle(p.ball.pos);
        this.audio.play3D('splash', p.ball.pos, 1);
        this.hud.popup('warn', 'DERRAMOU!', 'a poça vai chamar a atenção');
        this.noise(p.ball.pos, 30, null);
      }
      if (this.spill >= 100) {
        this.makePuddle(p.ball.pos.clone().add(new THREE.Vector3(0.3, 0, 0.2)));
        this.dropCarry();
        this.hud.popup('caught', 'CAFÉ NO CHÃO', 'devagar com o andor (SHIFT)');
        this.audio.play('sad', 0.8);
      }
    }
    this.prevVel.copy(v);
    if (!ghost) {
      // interações
      const list = this.interactables();
      let best: Interactable | null = null;
      let bd = Infinity;
      for (const it of list) {
        const d = Math.hypot(it.pos.x - p.ball.pos.x, it.pos.z - p.ball.pos.z);
        if (d < it.r && d < bd) {
          bd = d;
          best = it;
        }
      }
      if (best) {
        const ok = best.ok();
        if (ok && best.hold > 0 && inp.isDown('KeyE')) {
          if (this.holdId !== best.id) {
            this.holdId = best.id;
            this.holdT = 0;
          }
          this.holdT += dt;
          if (this.holdT >= best.hold) {
            this.holdT = 0;
            this.holdId = '';
            best.act();
          }
        } else if (!inp.isDown('KeyE')) {
          this.holdT = 0;
          this.holdId = '';
        }
        if (ok && best.hold === 0 && inp.pressed('KeyE')) best.act();
        this.hud.prompt(best.label, this.holdId === best.id ? this.holdT / best.hold : 0);
      } else this.hud.prompt(null);
      this.hud.meter(this.carrying === 'coffee' ? `☕ derramando ${Math.floor(this.spill)}%  (SHIFT = andar com cuidado)` : null, this.spill / 100);
    } else {
      this.hud.prompt(null);
      if (inp.pressed('Enter')) {
        this.fastForward = !this.fastForward;
        this.hud.ghost(this.fastForward ? '⏩ <b>TEMPO ACELERADO ×6</b> — ENTER para voltar ao normal' : '👻 <b>DEMITIDO HOJE</b> — você é um fantasma.<br>Aperte <b>ENTER</b> para acelerar o tempo.');
      }
    }
    p.ball.update(dt);
  }

  private makePuddle(pos: THREE.Vector3) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), (this.player.desk.puddle.material as THREE.Material).clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.015, pos.z);
    m.scale.setScalar(0.1);
    m.userData.grow = 1;
    this.r.scene.add(m);
    this.puddles.push({ mesh: m, reported: false });
    this.player.puddle = true;
  }

  private updateSeated(dt: number, realDt: number) {
    const p = this.player;
    const inp = this.input;
    const comp = this.computer;
    // espiar
    const peeking = inp.isDown('Mouse2') || this.clutchPeek > 0;
    this.peek += ((peeking ? 1 : 0) - this.peek) * Math.min(1, realDt * (peeking ? 9 : 12));
    this.clutchPeek = Math.max(0, this.clutchPeek - realDt);
    comp.frozen = this.peek > 0.5;
    // mouse → canvas
    if (!comp.frozen && !this.aiming) {
      const ndc = new THREE.Vector2((inp.mouseX / window.innerWidth) * 2 - 1, -(inp.mouseY / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.r.camera);
      const hit = this.raycaster.intersectObject(p.desk.screen, false)[0];
      if (hit?.uv) {
        this.mouseCanvas.x = hit.uv.x * 1024;
        this.mouseCanvas.y = (1 - hit.uv.y) * 640;
      }
    }
    const sInp: ScreenInput = {
      x: this.mouseCanvas.x,
      y: this.mouseCanvas.y,
      down: inp.isDown('Mouse0'),
      pressed: inp.pressed('Mouse0'),
      released: inp.released('Mouse0'),
      key: (c) => inp.isDown(c),
      keyPressed: (c) => inp.pressed(c),
    };
    if (inp.pressed('Space') && !comp.frozen) comp.altTab(this.time);
    comp.update(dt, this.time, sInp);
    if (inp.pressed('KeyH')) {
      this.headphones = !this.headphones;
      p.ball.setHeadphones(this.headphones);
      this.audio.play('click', 0.6);
      this.computer.toast(this.headphones ? '🎧 fones colocados — você ouve menos!' : '🔊 fones fora');
    }
    // lanche
    if (inp.pressed('KeyG') && this.eating <= 0 && !this.aiming) {
      if (this.stock.lanche > 0) {
        this.stock.lanche--;
        this.eating = 1.2;
        this.audio.play3D('crunch', p.desk.seat, 0.9);
      } else comp.toast('🍪 gaveta vazia');
    }
    if (this.eating > 0) {
      this.eating -= dt;
      if (Math.random() < dt * 12) p.ball.impulse(0.08);
      if (Math.random() < dt * 10) this.juice.crumbs(p.desk.screenCenter.clone().addScaledVector(p.desk.screenNormal, 0.45).setY(0.95), 2);
      if (this.eating <= 0) {
        this.addFun(p, ACT.lanche.fun, 'lanche');
        this.addSus(p, ACT.lanche.sus);
        this.instinct += ACT.lanche.instinct;
        p.contribution += ACT.lanche.instinct;
        p.crumbs++;
        p.desk.crumbs.visible = true;
        this.noise(p.desk.seat, ACT.lanche.noise, p);
        if (p.crumbs >= 2) comp.toast('🧹 migalhas na mesa! segure C para limpar');
      }
    }
    // limpar migalhas
    if (inp.isDown('KeyC') && p.crumbs > 0) {
      this.cleaning += dt;
      if (this.cleaning >= 1.5) {
        this.cleaning = 0;
        p.crumbs = 0;
        p.desk.crumbs.visible = false;
        this.audio.play('swish', 0.4);
        comp.toast('✨ mesa limpinha');
      }
    } else this.cleaning = 0;
    // basquete
    if (inp.pressed('KeyB') && !this.aiming && this.eating <= 0) {
      if (!this.day.unlocked.includes('basquete')) comp.toast('🔒 basquete bloqueado hoje');
      else if (this.stock.basquete <= 0) comp.toast('📄 sem folhas para amassar');
      else {
        this.aiming = true;
        this.aimT = Math.random() * 3;
      }
    }
    if (this.aiming) {
      this.aimT += dt;
      const pw = 0.5 - 0.5 * Math.cos(this.aimT * 2.8);
      this.hud.meter('🏀 solte B na zona verde', pw, [0.43, 0.57]);
      if (!inp.isDown('KeyB')) {
        this.aiming = false;
        this.throwPaper(pw);
      }
    } else this.hud.meter(null);
    // levantar
    if (inp.pressed('KeyE') && this.peek < 0.3 && !this.aiming) this.standUp();
    // prompt
    const hint = this.cleaning > 0 ? '🧹 limpando…' : null;
    this.hud.prompt(hint, this.cleaning / 1.5);
    p.ball.update(dt);
  }

  private throwPaper(power: number) {
    const p = this.player;
    this.stock.basquete--;
    const mesh = this.office.paperProto.clone();
    const start = this.r.camera.position.clone().add(new THREE.Vector3(0, -0.15, 0));
    mesh.position.copy(start);
    this.r.scene.add(mesh);
    const bin = p.desk.bin.clone();
    const dir = new THREE.Vector3().subVectors(bin, start).setY(0).normalize();
    const err = (power - 0.5) * 3.2;
    const target = bin.clone().addScaledVector(dir, err).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08));
    const T = 0.8;
    const g = new THREE.Vector3(0, -9.8, 0);
    const vel = new THREE.Vector3().subVectors(target, start).sub(g.clone().multiplyScalar(0.5 * T * T)).divideScalar(T);
    this.papers.push({ mesh, vel, flying: true, owner: p, reported: false, scored: false, rimHit: false });
    this.throwWatch = 1.7;
    this.audio.play('throw', 0.7);
    p.ball.impulse(0.4);
    this.addSus(p, ACT.basquete.sus);
    this.instinct += ACT.basquete.instinct;
    p.contribution += ACT.basquete.instinct;
    this.noise(p.desk.seat, ACT.basquete.noise, p);
  }

  private updatePapers(dt: number) {
    for (const pa of this.papers) {
      if (!pa.flying) continue;
      pa.vel.y -= 9.8 * dt;
      pa.mesh.position.addScaledVector(pa.vel, dt);
      pa.mesh.rotation.x += dt * 9;
      pa.mesh.rotation.z += dt * 6;
      const bin = pa.owner.desk.bin;
      const hd = Math.hypot(pa.mesh.position.x - bin.x, pa.mesh.position.z - bin.z);
      if (pa.vel.y < 0 && pa.mesh.position.y <= bin.y && pa.mesh.position.y > bin.y - 0.25) {
        if (hd < 0.16 && !pa.scored) {
          pa.scored = true;
          pa.flying = false;
          this.r.scene.remove(pa.mesh);
          const perfect = !pa.rimHit;
          this.addFun(pa.owner, ACT.basquete.fun, perfect ? 'SWISH!' : 'cesta');
          this.audio.play3D('swish', bin, 1);
          this.juice.confetti(bin.clone().setY(0.6), perfect ? 60 : 30, 3.5);
          this.juice.ring(bin.clone().setY(0.47), '#ffd23f', 20, 3);
          this.juice.text(bin.clone().setY(1.0), perfect ? 'SWISH!' : 'CESTA!', 'ft-big', 1.2);
          this.juice.shake(0.12);
          continue;
        }
        if (hd < 0.27 && !pa.rimHit) {
          pa.rimHit = true;
          const out = new THREE.Vector3(pa.mesh.position.x - bin.x, 0, pa.mesh.position.z - bin.z).normalize();
          pa.vel.set(out.x * 1.2 + pa.vel.x * 0.2, 1.6, out.z * 1.2 + pa.vel.z * 0.2);
          if (Math.random() < 0.45) pa.vel.set(-out.x * 0.6, 1.4, -out.z * 0.6);
          this.audio.play3D('thud', bin, 0.6);
          continue;
        }
      }
      if (pa.mesh.position.y <= 0.06) {
        pa.mesh.position.y = 0.06;
        if (Math.abs(pa.vel.y) > 1.2) {
          pa.vel.y *= -0.35;
          pa.vel.x *= 0.5;
          pa.vel.z *= 0.5;
        } else {
          pa.flying = false;
          this.office.collide(pa.mesh.position, 0.08);
          this.addFun(pa.owner, BASQUETE_MISS_FUN);
          this.audio.play3D('thud', pa.mesh.position, 0.7);
          this.juice.text(pa.mesh.position.clone().setY(0.7), 'errou!', 'ft-bad', 1.0);
        }
      }
      this.office.collide(pa.mesh.position, 0.06);
    }
  }

  // ------------------------------------------------------------------ câmera
  private updateCamera(realDt: number) {
    const cam = this.r.camera;
    const p = this.player;
    const k = Math.min(1, realDt * 10);
    if (this.attract) {
      this.attractT += realDt;
      const t = this.attractT * 0.06;
      const target = new THREE.Vector3(3 + Math.sin(t) * 3, 2.45, 8.2 + Math.cos(t * 0.7) * 0.5);
      if (this.attractT < 0.1) this.camPos.copy(target);
      this.camPos.lerp(target, Math.min(1, realDt * 0.8));
      const look = this.chefe.pos.clone().multiplyScalar(0.3).add(new THREE.Vector3(-3, 0.6, -2.5));
      if (this.attractT < 0.1) this.camLook.copy(look);
      this.camLook.lerp(look, Math.min(1, realDt * 1.2));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      this.r.baseFov = 58;
      return;
    }
    if (this.mode === 'cinematic' && this.cine) {
      const boss = this.bosses.find((b) => b.ball.root.visible && b.busy) ?? this.bosses[0];
      const look = boss.ball.headWorld();
      // de lado: enquadra a bola demitida e o chefe
      const side = new THREE.Vector3(-p.desk.screenNormal.z, 0, p.desk.screenNormal.x);
      const sgn = p.desk.seat.z > 0 ? -1 : 1;
      const from = p.desk.seat.clone().addScaledVector(side, 1.5 * sgn).addScaledVector(p.desk.screenNormal, 0.2).setY(1.55);
      const zoom = 1 - this.cine.t / 2.8;
      const mid = look.clone().lerp(p.ball.headWorld(), 0.45);
      this.camPos.lerp(from, k * 0.6);
      this.camLook.lerp(mid, k);
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      this.r.baseFov = 58 - zoom * 14;
      p.ball.root.visible = true;
      return;
    }
    if (this.mode === 'seated') {
      const d = p.desk;
      const screenPos = d.screenCenter.clone().addScaledVector(d.screenNormal, 0.8);
      screenPos.y = d.screenCenter.y + 0.02;
      const peekPos = d.screenCenter.clone().addScaledVector(d.screenNormal, 1.05).setY(1.75);
      const roomLook = d.screenCenter.clone().addScaledVector(d.screenNormal, 6).setY(0.4);
      // mira do basquete
      this.throwWatch = Math.max(0, this.throwWatch - realDt);
      this.aimCam += ((this.aiming || this.throwWatch > 0 ? 1 : 0) - this.aimCam) * Math.min(1, realDt * 8);
      const binLook = d.bin.clone();
      const look = d.screenCenter.clone().lerp(roomLook, this.peek).lerp(binLook, this.aimCam * (1 - this.peek));
      const pos = screenPos.clone().lerp(peekPos, this.peek).lerp(d.seat.clone().addScaledVector(new THREE.Vector3().subVectors(d.seat, d.bin).setY(0).normalize(), 0.7).setY(1.85), this.aimCam * (1 - this.peek));
      const blend = this.sitBlend;
      this.camPos.lerp(pos, blend < 1 ? Math.min(1, realDt * 8) : 1);
      this.camLook.lerp(look, blend < 1 ? Math.min(1, realDt * 8) : 1);
      this.sitBlend = Math.min(1, this.sitBlend + realDt * 2.5);
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      this.r.baseFov = 55;
      p.ball.root.visible = false;
      return;
    }
    // em pé / fantasma: 3ª pessoa
    this.sitBlend = 0;
    p.ball.root.visible = true;
    const head = p.ball.pos.clone().add(new THREE.Vector3(0, this.mode === 'ghost' ? 1.6 : 1.15, 0));
    const dist = 3.4;
    const off = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch)).multiplyScalar(dist);
    let want = head.clone().add(off);
    // colisão da câmera com paredes
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const q = head.clone().lerp(want, i / steps);
      if (this.office.tallColliders.some((c) => q.x > c.minX - 0.2 && q.x < c.maxX + 0.2 && q.z > c.minZ - 0.2 && q.z < c.maxZ + 0.2)) {
        want = head.clone().lerp(want, Math.max(0.15, (i - 1.5) / steps));
        break;
      }
    }
    want.y = Math.min(want.y, 2.85);
    want.x = THREE.MathUtils.clamp(want.x, -14.75, 14.75);
    want.z = THREE.MathUtils.clamp(want.z, -9.75, 9.75);
    this.camPos.lerp(want, Math.min(1, realDt * 14));
    this.camLook.lerp(head, Math.min(1, realDt * 20));
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    this.r.baseFov = 62;
  }

  // ------------------------------------------------------------------ telas e luzes
  private updateScreens(realDt: number) {
    const pd = this.player.desk;
    const comp = this.computer;
    const g = pd.ctx;
    if (!this.attract) {
      comp.draw(g);
      if (this.mode === 'seated' && !comp.frozen && !this.aiming) comp.drawCursor(g, this.mouseCanvas.x, this.mouseCanvas.y);
      pd.tex.needsUpdate = true;
    }
    this.botScreenT -= realDt;
    if (this.botScreenT <= 0) {
      this.botScreenT = 0.12;
      for (const w of this.allWorkers) {
        if (w.isPlayer && !this.attract) continue;
        const on = w.ball.root.visible && (this.attract || this.workers.includes(w));
        drawBotScreen(w.desk.ctx, !on ? 'off' : w.fired ? 'off' : w.botScreen, this.time + w.id * 3, w.id);
        w.desk.tex.needsUpdate = true;
      }
      if (this.attract && this.player.desk.canvas.width > 256) {
        // vitrine: a tela grande do jogador mostra a planilha dos bots
        const tmp = document.createElement('canvas');
        tmp.width = 256;
        tmp.height = 160;
        drawBotScreen(tmp.getContext('2d')!, this.player.botScreen, this.time, 0);
        g.drawImage(tmp, 0, 0, 1024, 640);
        pd.tex.needsUpdate = true;
      }
    }
    // luz das telas
    this.flashLight = Math.max(0, this.flashLight - realDt * 5);
    for (const w of this.allWorkers) {
      const scr = w.isPlayer && !this.attract ? comp.active : w.botScreen;
      const base = scr === 'planilha' ? '#cfe8ff' : scr === 'tiro' ? '#ff9a5a' : scr === 'video' ? '#ff5aa0' : '#5ac8ff';
      const light = w.desk.light;
      light.color.set(base);
      if (w.isPlayer && this.flashLight > 0) light.color.lerp(this.flashColor, this.flashLight);
      const on = w.ball.root.visible && !w.fired;
      const lv = this.lightLevel ?? 1;
      light.intensity = on ? (0.6 + 2.6 * (1 - lv)) * (1 + (w.isPlayer ? this.flashLight * 1.5 : 0)) : 0.05;
    }
  }

  // ------------------------------------------------------------------ áudio e HUD
  private updateAudio(realDt: number) {
    const a = this.audio;
    if (!a.ready) return;
    this.ensureLoops();
    const p = this.player;
    const comp = this.computer;
    const seated = this.mode === 'seated' && !this.attract;
    this.loops.typing?.setVol(seated && comp.active === 'planilha' && comp.planilha.inRhythm ? 0.25 : 0);
    this.loops.video?.setVol(seated && comp.active === 'video' && comp.video.playing && !this.headphones ? 0.35 : seated && comp.active === 'video' && comp.video.playing ? 0.05 : 0);
    this.loops.cooler?.setVol(!this.attract && p.heat > B.HEAT_HOT ? 0.2 + (p.heat - 60) / 120 : 0);
    const fishing = seated && comp.active === 'pesca';
    a.stepMul = (this.headphones ? 0.35 : 1) * (fishing ? 0.7 : 1);
    a.doorMul = this.headphones ? 0.5 : 1;
    // tensão + batimento
    let danger = 0;
    if (!this.attract && !p.fired) {
      for (const b of this.bosses) {
        if (!b.busy || !b.ball.root.visible) continue;
        const d = b.pos.distanceTo(p.ball.pos);
        const targeting = b.cur?.kind === 'desk' && b.cur.w === p;
        danger = Math.max(danger, THREE.MathUtils.clamp(1 - d / (targeting ? 9 : 6), 0, 1));
      }
    }
    a.tension += ((this.bosses.some((b) => b.busy) && !this.attract ? 0.6 : 0) + danger * 0.4 - a.tension) * Math.min(1, realDt * 2);
    const forb = comp.forbiddenOpen && this.mode === 'seated';
    const uD = danger * (forb ? 0.9 : 0.25);
    this.r.u.uDanger.value += (uD * (0.75 + 0.25 * Math.sin(this.time * 9)) - this.r.u.uDanger.value) * Math.min(1, realDt * 8);
    if (danger > 0.15) {
      this.heartbeatT -= realDt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 1.1 - danger * 0.55;
        a.play('heartbeat', 0.5 + danger * 0.6, danger);
      }
    }
    // tédio: suspiros
    if (p.bored && !p.fired && !this.attract) {
      this.sighT -= realDt;
      if (this.sighT <= 0) {
        this.sighT = 20;
        a.play3D('sigh', p.ball.pos, 0.6);
        this.noise(p.ball.pos, 3, p);
      }
    }
  }

  private updateHUD(realDt: number) {
    const p = this.player;
    const hud = this.hud;
    const meta = B.FUN_META[this.dayIndex];
    hud.setFun(p.fun, meta);
    hud.setSus(this.teamSus(), p.sus);
    const t01 = this.time / this.duration;
    const phase = this.time < B.PHASE_MIDDAY * (this.duration / B.DAY_DURATION) ? 'manhã' : this.time < B.PHASE_AFTERNOON * (this.duration / B.DAY_DURATION) ? `meio-dia · ${this.day.eventName}` : 'tarde';
    hud.setClock(t01, this.day.name, phase);
    // radar
    const fishing = this.mode === 'seated' && this.computer.active === 'pesca';
    const age = this.time - this.lastSoundT;
    if (this.lastSoundPos && age < 3) hud.setRadar(this.relAngle(this.lastSoundPos), 1 - age / 3, this.lastSoundLabel.replace(/[[\]]/g, ''), fishing);
    else hud.setRadar(null, 0, '', fishing);
    // estoques
    const u = this.day.unlocked;
    hud.setStocks([
      { icon: '✦', v: `${this.stock.tiro}`, off: !u.includes('tiro') },
      { icon: '🐟', v: `${this.stock.pesca}`, off: !u.includes('pesca') },
      { icon: '▶', v: `${Math.ceil(this.stock.video)}s`, off: !u.includes('video') },
      { icon: '🍪', v: `${this.stock.lanche}`, off: !u.includes('lanche') },
      { icon: '📄', v: `${this.stock.basquete}`, off: !u.includes('basquete') },
      { icon: '🎧', v: this.headphones ? 'on' : 'off' },
    ]);
    hud.setHeat(p.fired ? 0 : p.heat);
    // tarefas
    const tasks: TaskView[] = [];
    const rep = this.reports.find((r) => r.active);
    if (rep) tasks.push({ icon: '📄', label: this.carrying === 'report' ? 'leve à bandeja do chefe' : 'imprimir relatório (impressora)', bar: rep.deadline / B.RELATORIO_DEADLINE, urgent: rep.deadline < 20 });
    if (this.carrying === 'coffee') tasks.push({ icon: '☕', label: 'leve o café à bandeja', bar: null });
    else if (this.coffeeMachineCd > 0) tasks.push({ icon: '☕', label: `máquina de café: ${Math.ceil(this.coffeeMachineCd)} s`, bar: 1 - this.coffeeMachineCd / B.CAFE_MACHINE_CD });
    else tasks.push({ icon: '☕', label: 'café pronto na cozinha', bar: null });
    if (this.tiroCooldown > 0 && this.stock.tiro > 0) tasks.push({ icon: '✦', label: `Ball Ops recarrega: ${Math.ceil(this.tiroCooldown)} s`, bar: 1 - this.tiroCooldown / TIRO_COOLDOWN });
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
    const tips: [string, () => boolean][] = [
      ['Você está na sua mesa. Clique em <b>✦ Ball Ops</b> na barra de tarefas do monitor para começar a enrolar.', () => c.active === 'tiro'],
      ['Jogar enche a barra de <b>FUN</b>. Mas ouça: quando a <b>PORTA DO CHEFE</b> ranger, aperte <b>ESPAÇO</b> para voltar à planilha!', () => this.firstDoor],
      ['ELE SAIU! Volte para a planilha (<b>ESPAÇO</b>) antes que ele pare atrás de você. Trocar no último segundo = <b>CLUTCH</b>.', () => !this.bosses[0].busy],
      ['Na planilha, aperte <b>F</b> quando o anel fechar para baixar a <b>Suspeita</b> (o olho vermelho lá em cima).', () => c.planilha.hitsTotal >= 3],
      ['Segure o <b>botão direito</b> para espiar para trás. O radar à esquerda mostra de onde veio o último passo.', () => this.peek > 0.8 || this.tipT > 14],
      ['<b>G</b> come um lanche e <b>B</b> (segure e solte) arremessa papel na lixeira. Dão FUN, mas fazem barulho.', () => this.stock.lanche < 3 || this.stock.basquete < 6 || this.tipT > 14],
      ['Aperte <b>E</b> para levantar. Leve <b>café</b> da cozinha até a bandeja do chefe: baixa a Suspeita de todos. <b>SHIFT</b> = andar sem derramar.', () => this.coffees > 0 || this.tipT > 25],
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
    const ff = this.fastForward && this.mode === 'ghost' ? 6 : 1;
    const dt = this.paused ? 0 : dt0 * ff;

    if (this.attract) {
      this.time += dt;
      this.attractUpdate(dt);
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
      this.updateBots(dt);
      this.updateWorkers(dt);
      this.updatePlayer(dt, realDt);
      this.updatePapers(dt);
      if (this.input.pressed('Escape') || (this.input.pressed('KeyP') && this.mode !== 'cinematic')) this.onPause?.();
      if (this.allFiredT > 0) {
        this.allFiredT -= realDt;
        if (this.allFiredT <= 0) this.endDay(true);
      } else if (this.time >= this.duration) this.endDay(false);
    }
    // puddles crescem
    for (const pu of this.puddles) if (pu.mesh.userData.grow) {
      const s = Math.min(1.1, pu.mesh.scale.x + realDt * 3);
      pu.mesh.scale.setScalar(s);
      if (s >= 1.1) pu.mesh.userData.grow = 0;
    }
    this.office.update(realDt, this.attract ? (this.time % 300) / 300 : this.time / this.duration, this.time);
    this.updateCamera(realDt);
    this.juice.applyShake(this.r.camera);
    this.juice.update(dt0, realDt, this.r.camera);
    this.updateScreens(realDt);
    this.updateAudio(realDt);
    if (!this.attract && this.running) this.updateHUD(realDt);
    this.audio.updateListener(this.r.camera);
    this.audio.update();
    // pós-processo relaxa
    const u = this.r.u;
    u.uFlash.value = Math.max(0, u.uFlash.value - realDt * 2.2);
    u.uAberration.value = Math.max(0.0012, u.uAberration.value - realDt * 0.05);
    this.r.fovKick += (0 - this.r.fovKick) * Math.min(1, realDt * 4);
    u.uDesat.value += ((this.mode === 'ghost' || this.mode === 'cinematic' ? 0.65 : 0) - u.uDesat.value) * Math.min(1, realDt * 3);
    if (this.attract) u.uDanger.value *= 0.9;
  }
  private prevTiroState = 'menu';

  private attractUpdate(dt: number) {
    const b = this.chefe;
    if (!b.busy && this.time - b.lastRondaEnd > 14) b.startRonda(this.rondaTargets(2), 'vitrine');
    b.update(dt);
    // na vitrine todos são bots (inclusive a mesa do jogador)
    this.updateBotsAttract(dt);
  }

  private updateBotsAttract(dt: number) {
    for (const w of this.workers) {
      const b = w.ball;
      if (w.fired) {
        b.update(dt);
        continue;
      }
      w.botTimer -= dt;
      const out = this.chefe.busy;
      if (out && w.botScreen !== 'planilha') {
        if (w.botReact < 0) {
          w.botReact = 1 + Math.random() * 2;
          w.botFailRonda = Math.random() < 0.12;
        }
        w.botReact -= dt;
        if (w.botReact <= 0 && !w.botFailRonda) {
          w.botScreen = 'planilha';
          b.impulse(0.4);
        }
      } else if (!out) {
        w.botReact = -1;
        if (w.botTimer <= 0) {
          const apps: AppId[] = ['tiro', 'video', 'pesca'];
          w.botScreen = w.botScreen === 'planilha' && Math.random() < 0.6 ? apps[Math.floor(Math.random() * 3)] : 'planilha';
          w.botTimer = 4 + Math.random() * 8;
        }
      }
      if (Math.random() < dt * 4) b.impulse(w.botScreen === 'planilha' ? -0.05 : 0.12);
      b.lookAt(w.desk.screenCenter);
      if (out && this.chefe.pos.distanceTo(b.pos) < 5) b.lookAt(this.chefe.ball.headWorld());
      b.yaw = w.desk.seatYaw;
      b.update(dt);
    }
  }

  // ------------------------------------------------------------------ fim do dia
  private endDay(allFired: boolean) {
    if (!this.running) return;
    this.running = false;
    this.input.unlock();
    this.loops.alarm?.stop();
    this.loops.alarm = null;
    for (const l of [this.loops.typing, this.loops.video, this.loops.cooler]) l?.setVol(0);
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
    this.r.canvas?.classList.remove('nocursor');
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
    for (const l of [this.loops.typing, this.loops.video, this.loops.cooler]) l?.setVol(0);
    this.hud.show(false);
    this.input.unlock();
  }
}
