import * as THREE from 'three';
import { B, ACT, CHAIR, PAPER, PAPER_DIST_BONUS, BASQUETE_MISS_FUN, ITEMS, type ItemKind } from '../balance';
import { MAP, LOBBY, LOBBY_DZ, type Bathroom, type RaceChair } from '../world/Office';
import type { ScreenInput } from '../apps/common';
import type { Game } from './Game';
import type { Worker } from './Worker';
import { lerpAngle } from './Boss';
import { ThrowPreview } from './ThrowPreview';
import { Paws, type PawPose } from '../entities/Paws';
import type { MgKind } from '../ui/Minigame';
import { outlineMat } from '../characters/rig';

/** Contorno amarelo do que você está mirando e dá para usar. */
const HL_MAT = outlineMat('#ffd23f', 0.018);
/** Silhueta branca do que você mira sentado (telefone, monte de bolinhas). */
const HL_WHITE = outlineMat('#ffffff', 0.014);

/** Girar na cadeira: o mouse olha igual a andar, e a mira no centro da vista é o cursor da tela. */
const SEAT_LOOK = {
  /** Inclinação (rad, > 0 = para baixo) que mira o centro do monitor. */
  screenPitch: -0.12,
  /** Sensibilidade olhando o monitor (1 = a de andar): mais fina para acertar botões pequenos. */
  screenSens: 0.4,
  /** Ângulo (rad) entre a mira e o centro do monitor: até `awayFrom` é a tela, a partir de `awayTo` é a sala. */
  awayFrom: 0.6,
  awayTo: 0.95,
};

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export type Mode = 'walk' | 'seated' | 'chair' | 'nap' | 'hide' | 'ghost' | 'cinematic' | 'meeting';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  r: number;
  label: string;
  /** Linha menor no prompt: o que ganha e o risco. */
  hint?: string;
  /** Segurar E (v0.10: só a fofoca, que é uma conversa; o resto é toque ou minigame). */
  hold: number;
  ok: () => boolean;
  /** Ação; com `mg`, só roda quando o minigame termina (e recebe o resultado dele). */
  act: (result?: unknown) => void;
  /** v0.10: a ação é um minigame rápido no painel do centro (estilo Among Us). */
  mg?: { kind: MgKind; title: string; hint?: string; opts?: Record<string, unknown> };
  /** Malhas que contam como "mirar" nesse objeto. */
  obj?: THREE.Object3D[];
  /** Só vale se o objeto estiver à vista (mirando ou na frente da câmera). */
  needView?: boolean;
  /** Prioridade extra na escolha (telefone tocando ganha da cadeira). */
  prio?: number;
}

interface Paper {
  mesh: THREE.Mesh;
  /** Quem jogou (null = você). */
  owner: Worker | null;
  bonked: boolean;
  vel: THREE.Vector3;
  flying: boolean;
  reported: boolean;
  rimHit: boolean;
  from: THREE.Vector3;
  life: number;
}

const BOUNDS = { minX: -MAP.ox + 0.4, maxX: MAP.ox - 0.4, minZ: -MAP.oz - MAP.north + 0.4, maxZ: MAP.oz - 0.4 };
/** Térreo (hall + cabine do elevador de baixo). */
const LOBBY_BOUNDS = { minX: LOBBY.west - MAP.ox + 0.4, maxX: LOBBY.east - MAP.ox - 0.4, minZ: LOBBY_DZ - MAP.oz + 0.4, maxZ: LOBBY.south - MAP.oz - 0.4 };

/** Controle do jogador: andar, sentar, diversões, câmera e mira. */
export class Player {
  mode: Mode = 'walk';
  camYaw = 0;
  camPitch = 0.25;
  readonly camPos = new THREE.Vector3();  readonly camLook = new THREE.Vector3();
  /** 0 = olhando o monitor, 1 = olhando a sala (suavizado: a cabeça recua da tela). */
  peek = 0;
  /** O mesmo sem suavizar: congela a tela e afina o mouse perto do monitor. */
  private away = 0;
  /** Susto do clutch: a cabeça vira para a sala por um instante. */
  clutchPeek = 0;
  private clutchW = 0;
  /** Logo depois de sentar a cabeça encara o monitor sem brigar com o mouse. */
  private seatSettle = 0;
  /** Direção do olhar sentado (já com a mira do cesto e o susto), calculada em updateSeated. */
  private readonly seatDir = new THREE.Vector3(0, 0, -1);
  private readonly tmpV = new THREE.Vector3();
  cine: { t: number } | null = null;
  carrying: 'coffee' | 'report' | 'doc' | 'galao' | null = null;
  /** Item de missão na mão (o `Items` decide; aqui só a malha nas patinhas) e se é o aquário (pose pesada). */
  private heldItem: Exclude<ItemKind, 'aquario'> | null = null;
  private heldItemMesh: THREE.Object3D | null = null;
  private heldHeavy = false;
  /** O café na mão é o que o chefe pediu (tarefa). */
  bossCoffee = false;
  /** Painel aberto (receita do café): não anda nem interage. */
  lockMove = false;
  private carryMesh: THREE.Object3D | null = null;
  /** Item largado na mesa ao sentar (volta para a mão ao levantar). */
  private stash: { what: 'coffee' | 'report' | 'doc' | 'galao'; mesh: THREE.Object3D; boss: boolean; spill: number } | null = null;
  spill = 0;
  private spilledOnce = false;
  private holdT = 0;
  private holdId = '';
  eating = 0;
  private cleaning = 0;
  private charging = false;
  private charge = 0;
  /** Segurando o botão direito para arremessar uma bolinha. */
  get throwing() {
    return this.charging;
  }
  readonly papers: Paper[] = [];
  readonly puddles: { mesh: THREE.Mesh; reported: boolean; who: Worker; what: string }[] = [];
  private prevVel = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  readonly mouseCanvas = { x: 512, y: 320 };
  private chairRide: { chair: RaceChair; t: number; earned: number } | null = null;
  chairCd = 0;
  private napT = 0;
  private snoreT = 0;
  private gossipBot: Worker | null = null;
  private vendT = 0;
  fastForward = false;
  /** Hora do dia em que levantou da cadeira (o esbarrão no chefe que confere a tela não conta logo ao levantar). */
  standAt = -99;
  /** Digitando e-mail: há quanto tempo o E está seguro (segurar levanta; tocar é a letra). */
  private typeStandT = 0;
  private readonly aim: ThrowPreview;
  /** Bolinhas de papel na mão (pegas do monte ou do chão). */
  paperHeld = 0;
  private jumpV = 0;
  private walkDist = 0;
  /** Câmera de abertura do dia (segundos restantes). */
  intro = 0;
  private bobT = 0;
  /** Grupo preso à câmera com o que você segura. */
  private readonly view = new THREE.Group();
  private readonly paperHand: THREE.Mesh;
  private paws: Paws | null = null;
  /** Fone do telefone na mão durante a ligação. */
  private readonly handset: THREE.Mesh;
  /** Cascas de contorno visíveis agora e as já criadas por objeto. */
  private hl: THREE.Mesh[] = [];
  private readonly hlCache = new WeakMap<THREE.Object3D, THREE.Mesh[]>();
  /** Pose extra por alguns instantes (apertar botão etc.). */
  private pawOverride: { pose: PawPose; t: number } | null = null;
  private hideT = 0;
  /** Banheiro onde você está escondido (na cabine). */
  private hideBath: Bathroom | null = null;
  hideCd = 0;
  private jumpY = 0;
  private lockHintShown = false;

  constructor(private g: Game) {
    this.aim = new ThrowPreview(g.r.scene, g.office);
    this.paperHand = g.office.paperProto.clone();
    this.paperHand.scale.setScalar(1.15);
    this.paperHand.visible = false;
    this.handset = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: '#2f3650', roughness: 0.4 }));
    this.handset.visible = false;
  }

  get w() {
    return this.g.player;
  }
  get ball() {
    return this.g.player.ball;
  }

  get pile() {
    return this.w.desk.pile!;
  }

  /** Coloca o jogador em pé num ponto, olhando para `yaw` (câmera). */
  placeAt(p: THREE.Vector3, yaw: number) {
    this.ball.setPos(p.x, p.z);
    this.ball.yaw = yaw + Math.PI;
    this.ball.velocity.set(0, 0, 0);
    this.camYaw = yaw;
    this.camPitch = -0.12;
    this.camPos.set(p.x, 1.3, p.z);
  }

  /** Mostra uma pose das patinhas por alguns segundos (ex.: apertar um botão). */
  pawGesture(pose: PawPose, t = 0.5) {
    this.pawOverride = { pose, t };
  }

  /** Recria as patinhas com a cor/espécie atual do jogador. */
  private ensurePaws() {
    const look = this.g.playerLook();
    const key = `${look.species}|${look.color}`;
    if (this.paws && this.paws.key === key) return this.paws;
    this.paws?.root.removeFromParent();
    this.paws = new Paws(look);
    this.view.add(this.paws.root);
    this.paws.r.socket.add(this.paperHand, this.handset);
    this.handset.position.set(0, 0.02, -0.02);
    this.handset.rotation.set(0.3, 0, 0);
    if (this.carryMesh) this.attachCarry(this.carryMesh, this.carrying!);
    return this.paws;
  }

  resetDay() {
    this.dropCarry();
    this.lockMove = false;
    this.ensurePaws();
    this.paperHeld = 0;
    this.g.office.setPile(this.w.desk, this.g.paperPileSize());
    this.aim.hide();
    this.spill = 0;
    this.eating = 0;
    this.cleaning = 0;
    this.charging = false;
    this.fastForward = false;
    this.chairRide = null;
    this.chairCd = 0;
    this.napT = 0;
    this.gossipBot = null;
    this.vendT = 0;
    this.cine = null;
    this.peek = 0;
    for (const p of this.papers) this.g.r.scene.remove(p.mesh);
    this.papers.length = 0;
    for (const p of this.puddles) this.g.r.scene.remove(p.mesh);
    this.puddles.length = 0;
    for (const rc of this.g.office.raceChairs) {
      rc.group.position.copy(rc.home);
      rc.group.rotation.y = rc.homeYaw;
    }
    // começa o dia em pé ao lado da mesa
    const d = this.w.desk;
    this.mode = 'walk';
    this.setMode('walk');
    this.ball.setPos(d.standPos.x + d.screenNormal.x * 0.4, d.standPos.z + d.screenNormal.z * 0.4);
    this.ball.yaw = d.seatYaw;
    d.chairYaw = d.seatYaw + Math.PI;
    d.chair.rotation.y = d.chairYaw;
    this.camYaw = d.seatYaw + Math.PI - 0.5;
    this.camPitch = 0.12;
    // "abrindo os olhos" no começo do expediente
    this.g.r.u.uFlashColor.value.set('#000000');
    this.g.r.u.uFlash.value = 1;
    this.camPos.copy(this.ball.pos).add(new THREE.Vector3(-d.screenNormal.x * 3, 2.2, -d.screenNormal.z * 3));
  }

  // ------------------------------------------------------------------ modos
  setMode(m: Mode) {
    const g = this.g;
    const prev = this.mode;
    this.mode = m;
    const p = this.w;
    const b = this.ball;
    b.lying = 0;
    b.setSleeping(false);
    p.hidden = m === 'hide';
    if (m === 'seated') {
      p.seated = true;
      g.seatBall(p);
      g.input.lock();
      g.hud.controls('seated');
      this.peek = 0;
      this.away = 0;
      this.clutchW = 0;
      this.seatSettle = 0.35;
      g.r.camera.getWorldDirection(this.seatDir);
    } else {
      p.seated = false;
      if (prev === 'seated') {
        // de frente para o monitor ao levantar → fica de frente para a sala; olhando a sala, mantém o olhar
        const facingScreen = Math.abs(wrapAngle(this.camYaw - (p.desk.seatYaw + Math.PI))) < Math.PI / 2;
        p.desk.chairYaw = p.desk.seatYaw + Math.PI;
        b.setPos(p.desk.standPos.x, p.desk.standPos.z);
        b.yaw = p.desk.seatYaw + Math.PI;
        this.standAt = g.time;
        this.takeStash();
        if (facingScreen) {
          this.camYaw = p.desk.seatYaw;
          this.camPitch = 0.08;
        }
      }
      b.hoverHeight = 0.78;
    }
    if (m === 'walk') {
      g.input.lock();
      g.hud.controls('walk');
    } else if (m === 'ghost') {
      b.setGhost(true);
      b.hoverHeight = 1.4;
      b.setEye('bored');
      g.input.lock();
      g.hud.controls(g.net ? 'ghostNet' : 'ghost');
      g.hud.meter(null);
      g.hud.ghost(g.net ? '👻 <b>DEMITIDO HOJE</b> — você vê o chefe através das paredes.<br>Aperte <b>F</b> para avisar a sala onde ele está.' : '👻 <b>DEMITIDO HOJE</b> — você é um fantasma.<br>Passeie ou aperte <b>ENTER</b> para acelerar o tempo.');
    } else if (m === 'chair') {
      g.input.lock();
      g.hud.controls('chair');
    } else if (m === 'nap') {
      g.input.lock();
      g.hud.controls('nap');
    } else if (m === 'hide') {
      g.input.lock();
      g.hud.controls('hide');
    } else if (m === 'meeting') {
      g.input.lock();
      g.hud.controls('meeting');
    } else if (m === 'cinematic') g.hud.controls('none');
    g.r.canvas.classList.toggle('nocursor', m === 'seated');
    g.hud.crosshair(m === 'walk' ? 'idle' : null);
    if (m !== 'walk') this.highlight(null);
    if (m !== 'walk') g.hud.prompt(null);
  }

  /** Larga a diversão na hora (perseguição). */
  bail() {
    const g = this.g;
    if (this.mode === 'nap') {
      g.bots.spot('sofa').busy = null;
      this.ball.setPos(g.office.couch.stand.x, g.office.couch.stand.z);
      this.setMode('walk');
    } else if (this.mode === 'chair') {
      this.chairCd = CHAIR.cooldown;
      this.chairRide = null;
      this.setMode('walk');
    }
    this.gossipBot = null;
    this.vendT = 0;
    this.eating = 0;
    this.charging = false;
    this.aim.hide();
    g.hud.meter(null);
    this.ball.impulse(0.8);
    this.ball.setEye('alert');
    setTimeout(() => this.ball.eye === 'alert' && !this.w.fired && this.ball.setEye('normal'), 2500);
  }

  /** Atividade física atual (para o flagrante). */
  get physicalAct(): string | null {
    if (this.mode === 'chair') return 'cadeira';
    if (this.mode === 'nap') return 'soneca';
    if (this.gossipBot) return 'fofoca';
    if (this.vendT > 0) return 'maquina';
    if (this.eating > 0 || this.charging) return 'lanche';
    return null;
  }

  // ------------------------------------------------------------------ carregar coisas
  /** Mostra (ou tira) o item de missão nas patinhas; `heavy` = segurando uma alça do aquário. */
  holdItem(kind: Exclude<ItemKind, 'aquario'> | null, heavy = false) {
    this.heldHeavy = heavy;
    if (kind === this.heldItem) return;
    this.heldItemMesh?.removeFromParent();
    this.heldItemMesh = null;
    this.heldItem = kind;
    if (!kind) return;
    const m = this.g.items.list.find((x) => x.kind === kind)?.mesh.clone();
    if (!m) return;
    m.visible = true;
    m.position.set(0, -0.02, -0.04);
    m.rotation.set(0.5, Math.PI / 2, 0);
    m.scale.setScalar(1.3);
    this.ensurePaws().both.add(m);
    this.heldItemMesh = m;
    this.paws?.crumple();
  }

  /** O painel aberto é de trabalho (xerox, arquivo): conta como trabalhando. */
  workPanel = false;

  /** Mãos ocupadas com item de missão (não senta, não pula, não pega outra coisa). */
  get holdingMission() {
    return !!this.heldItem || this.heldHeavy;
  }

  carry(what: 'coffee' | 'report' | 'doc' | 'galao') {
    this.dropCarry();
    this.carrying = what;
    this.bossCoffee = false;
    const o = this.g.office;
    const m = what === 'coffee' ? o.coffeeCupProto.clone() : what === 'galao' ? this.g.makeGalao() : o.reportProto.clone();
    this.attachCarry(m, what);
    this.carryMesh = m;
    this.ball.impulse(0.3);
    this.spill = 0;
    this.spilledOnce = false;
  }

  /** Prende o item na patinha certa (café numa mão; papel com as duas). */
  private attachCarry(m: THREE.Object3D, what: 'coffee' | 'report' | 'doc' | 'galao') {
    const paws = this.ensurePaws();
    if (what === 'coffee') {
      m.position.set(0, 0.035, -0.02);
      m.rotation.set(-0.15, 0, 0);
      m.scale.setScalar(1.0);
      paws.r.socket.add(m);
    } else if (what === 'galao') {
      m.position.set(0, -0.2, -0.12);
      m.rotation.set(-0.35, 0, 0);
      m.scale.setScalar(0.85);
      paws.both.add(m);
    } else {
      m.position.set(0, 0, 0);
      m.rotation.set(0.6, 0, 0);
      m.scale.setScalar(1.15);
      paws.both.add(m);
    }
    paws.crumple();
  }

  dropCarry() {
    if (this.carryMesh) this.carryMesh.removeFromParent();
    this.carryMesh = null;
    this.carrying = null;
    this.stash?.mesh.removeFromParent();
    this.stash = null;
  }

  /** Sentar com algo na mão: o item fica na mesa (não perde a tarefa) e volta para a mão ao levantar. */
  private stashOnDesk() {
    if (!this.carrying || !this.carryMesh) return;
    const m = this.carryMesh;
    const d = this.w.desk;
    m.removeFromParent();
    m.position.copy(d.screenCenter).addScaledVector(d.screenNormal, 0.38).setY(0.8);
    m.position.z += 0.38;
    m.rotation.set(0, 0, 0);
    this.g.r.scene.add(m);
    this.stash = { what: this.carrying, mesh: m, boss: this.bossCoffee, spill: this.spill };
    this.carryMesh = null;
    this.carrying = null;
  }

  private takeStash() {
    const s = this.stash;
    if (!s) return;
    this.stash = null;
    s.mesh.removeFromParent();
    this.attachCarry(s.mesh, s.what);
    this.carryMesh = s.mesh;
    this.carrying = s.what;
    this.bossCoffee = s.boss;
    this.spill = s.spill;
  }

  /** Poça no chão (café derramado; água do aquário): vira evidência se o chefe passar perto. */
  makePuddle(pos: THREE.Vector3, who: Worker = this.w, what = 'café no chão') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), (this.w.desk.puddle.material as THREE.Material).clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.015, pos.z);
    m.scale.setScalar(0.1);
    m.userData.grow = 1;
    m.userData.noAO = true;
    this.g.r.scene.add(m);
    this.puddles.push({ mesh: m, reported: false, who, what });
    if (who === this.w) this.w.puddle = true;
  }

  // ------------------------------------------------------------------ interações andando
  private interactables(): Interactable[] {
    const g = this.g;
    const o = g.office;
    const P = o.P;
    const p = this.w;
    const st = g.stock;
    // fora do expediente (hall, saída das 18h) só valem as interações da fase: nada de sentar ou se divertir
    if (g.phase !== 'play' && g.phase !== 'elevator') return g.eventInteractables();
    const list: Interactable[] = [
      {
        id: 'sit', pos: p.desk.standPos, r: 2.2, hold: 0, obj: p.desk.click, needView: true,
        label: this.holdingMission ? '🙅 mãos ocupadas: guarde num armário ou largue (Q)' : this.carrying ? '<kbd>CLIQUE</kbd>Sentar no seu PC (larga o item na mesa)' : '<kbd>CLIQUE</kbd>Sentar no seu PC',
        hint: 'jogos no PC dão FUN · ESPAÇO esconde o jogo',
        ok: () => !this.holdingMission,
        act: () => {
          this.stashOnDesk();
          this.setMode('seated');
          g.audio.play('click', 0.6);
        },
      },
      {
        id: 'coffee', pos: P.coffee.clone().setZ(P.coffee.z - 0.6), r: 1.4, hold: 1.2,
        label: this.carrying ? 'mãos ocupadas' : g.coffeeMachineCd > 0 ? `☕ esquentando… ${Math.ceil(g.coffeeMachineCd)} s` : g.coffeePlayerCd > 0 ? `☕ você pegou há pouco (${Math.ceil(g.coffeePlayerCd)} s)` : '<kbd>E</kbd>Pegar café (segure)',
        hint: 'café na mão = álibi · entregue na bandeja do chefe para baixar a Suspeita',
        ok: () => !this.carrying && g.coffeeMachineCd <= 0 && g.coffeePlayerCd <= 0,
        act: () => g.takeCoffee(),
      },
      ((): Interactable => {
        const job = g.tasks.trayAction();
        return {
          id: 'tray', pos: P.tray.clone().setZ(P.tray.z + 0.6), r: 1.4, hold: 0,
          label: job ? job.label : this.carrying === 'coffee' ? '<kbd>E</kbd>Entregar café ao chefe' : 'bandeja do chefe',
          ok: () => (job ? job.ok : this.carrying === 'coffee'),
          act: () => (job ? job.act() : g.deliver()),
        };
      })(),
      {
        id: 'water', pos: o.P.coffee.clone().set(o.P.coffee.x - 3.6, 0, o.P.coffee.z - 0.6), r: 1.2, hold: 0.8,
        label: '<kbd>E</kbd>Beber água', ok: () => true,
        act: () => {
          g.audio.play('plop', 0.8);
          g.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 0.7, 0)), '💧 ahh', 'ft-small', 1);
        },
      },
    ];
    /** Diversão que não saiu no sorteio de hoje fica travada. */
    const notToday = 'não é diversão de hoje';
    // telefone tocando na sua mesa
    if (g.tasks.ringing)
      list.push({ id: 'phone', pos: p.desk.standPos, r: 2.8, hold: 0, prio: 3, obj: [p.desk.phone.group], label: '<kbd>E</kbd>📞 Atender o telefone', hint: 'o chefe vai pedir uma tarefa (trabalho baixa a Suspeita)', ok: () => true, act: () => g.tasks.answer() });
    // banheiros (esconderijo na cabine)
    o.baths.forEach((bath, i) => {
      list.push({
        id: `wc${i}`, pos: bath.stallFront, r: 1.0, hold: 0,
        label: this.hideCd > 0 ? `cabine ocupada… (${Math.ceil(this.hideCd)} s)` : '<kbd>E</kbd>Esconder na cabine (8 s)',
        hint: 'despista o chefe se ele estiver te perseguindo',
        ok: () => this.hideCd <= 0 && !this.carrying,
        act: () => {
          this.hideT = B.BATHROOM_HIDE;
          this.hideBath = bath;
          this.camYaw = Math.PI;
          this.camPitch = 0.05;
          this.ball.setPos(bath.hidePos.x, bath.hidePos.z);
          this.setMode('hide');
          g.audio.play3D('thud', bath.stallDoorPos, 0.8);
          g.hud.popup('info', '🚽 ESCONDIDO', 'o chefe não te vê aqui · E para sair');
        },
      });
    });
    // cadeiras de corrida
    for (const rc of o.raceChairs) {
      list.push({
        id: `chair${rc.group.id}`, pos: rc.group.position, r: 1.2, hold: 0, obj: [rc.group],
        label: !g.canFun('cadeira') ? `🔒 corrida de cadeira: ${notToday}` : st.cadeira <= 0 ? 'sem corridas por hoje' : this.chairCd > 0 ? `cadeira esfriando (${Math.ceil(this.chairCd)} s)` : `<kbd>E</kbd>Corrida de cadeira! (${st.cadeira} restantes)`,
        hint: '10 s de FUN · faz barulho',
        ok: () => g.canFun('cadeira') && !this.carrying && st.cadeira > 0 && this.chairCd <= 0,
        act: () => {
          st.cadeira--;
          this.chairRide = { chair: rc, t: CHAIR.ride, earned: 0 };
          this.ball.setPos(rc.group.position.x, rc.group.position.z);
          this.ball.velocity.set(0, 0, 0);
          this.setMode('chair');
          g.audio.play('confirm', 0.7);
          g.hud.popup('info', '🪑 CORRIDA!', 'WASD pilota · 10 s · faz barulho');
        },
      });
    }
    // sofá
    const sofaSpot = g.bots.spot('sofa');
    list.push({
      id: 'sofa', pos: o.couch.stand, r: 1.5, hold: 0,
      label: !g.canFun('soneca') ? `🔒 soneca: ${notToday}` : sofaSpot.busy ? `${sofaSpot.busy.name} está cochilando` : g.earnedLeft(p, 'soneca') > 0 ? '<kbd>E</kbd>Tirar uma soneca' : 'sem sono',
      hint: 'FUN devagar · o ronco faz barulho',
      ok: () => g.canFun('soneca') && !sofaSpot.busy && !this.carrying && g.earnedLeft(p, 'soneca') > 0,
      act: () => {
        sofaSpot.busy = p;
        this.napT = 0;
        this.camYaw = 0;
        this.camPitch = -0.15;
        this.ball.setPos(o.couch.seat.x, o.couch.seat.z);
        this.setMode('nap');
        g.audio.play('sigh', 0.8);
      },
    });
    // máquina de lanche
    list.push({
      id: 'vend', pos: g.bots.spot('maquina').pos, r: 1.3, hold: 0,
      label: !g.canFun('maquina') ? `🔒 máquina de lanche: ${notToday}` : st.maquina > 0 ? `<kbd>E</kbd>Comprar lanche (${st.maquina} restantes)` : 'máquina sem troco',
      hint: 'FUN rápida · faz barulho',
      ok: () => g.canFun('maquina') && st.maquina > 0 && this.vendT <= 0 && !this.carrying,
      act: () => {
        st.maquina--;
        this.vendT = 1.6;
        g.audio.play3D('thud', o.P.vending, 1);
        g.noise(o.P.vending, 4, p);
      },
    });
    // fofoca com quem estiver na cozinha
    for (const id of ['fofoca1', 'fofoca2']) {
      const s = g.bots.spot(id);
      const bot = s.busy;
      if (!bot || bot.isPlayer || bot.botState !== 'atSpot') continue;
      list.push({
        id: `gossip${id}`, pos: bot.ball.pos, r: 1.6, hold: 4,
        label: !g.canFun('fofoca') ? `🔒 fofoca: ${notToday}` : st.fofoca > 0 ? `<kbd>E</kbd>Fofocar com ${bot.name} (segure)` : 'chega de fofoca hoje',
        hint: `muita FUN para os dois · ${st.fofoca} restantes · faz barulho`,
        ok: () => g.canFun('fofoca') && st.fofoca > 0,
        act: () => {
          st.fofoca--;
          g.addFun(p, ACT.fofoca.fun, 'fofoca');
          g.addFun(bot, ACT.fofoca.fun);
          g.funProgress('fofoca');
          g.instinct += ACT.fofoca.instinct * 2;
          this.gossipBot = null;
          g.audio.play('happyChat', 0.8);
        },
      });
    }
    // monte de bolinhas ao lado do seu PC
    const pile = this.pile;
    const full = this.paperHeld >= PAPER.handMax;
    list.push({
      id: 'pile', pos: p.desk.standPos, r: 2.4, hold: 0, obj: [pile.group], needView: true,
      label: !g.paperAllowed ? `🔒 bolinhas de papel: ${notToday}` : pile.count <= 0 ? 'monte vazio · recolha as do chão' : full ? `mão cheia (${this.paperHeld})` : `<kbd>E</kbd>Pegar bolinha de papel (${pile.count} no monte)`,
      hint: 'segure o botão direito para mirar e solte para arremessar',
      ok: () => g.paperAllowed && pile.count > 0 && !full && !this.carrying,
      act: () => {
        g.office.setPile(p.desk, pile.count - 1);
        this.paperHeld++;
        g.audio.play('crumple', 0.7);
        this.onGrab();
      },
    });
    // papéis no chão
    for (const pa of this.papers)
      if (!pa.flying)
        list.push({
          id: `paper${pa.mesh.id}`, pos: pa.mesh.position, r: 1.0, hold: 0, obj: [pa.mesh],
          label: full ? `mão cheia (${this.paperHeld})` : '<kbd>E</kbd>Recolher bolinha de papel',
          ok: () => !full && !this.carrying,
          act: () => {
            g.r.scene.remove(pa.mesh);
            this.papers.splice(this.papers.indexOf(pa), 1);
            this.paperHeld++;
            g.audio.play('pop', 0.6);
            this.onGrab();
          },
        });
    return list.concat(g.eventInteractables());
  }

  // ------------------------------------------------------------------ atualização
  update(dt: number, realDt: number) {
    const atDesk = this.mode === 'seated' || this.mode === 'cinematic';
    this.g.office.updateBaths(realDt, atDesk ? null : this.ball.pos, this.mode === 'hide' ? this.hideBath : null, this.g.r.camera.position);
    this.chairCd = Math.max(0, this.chairCd - dt);
    this.hideCd = Math.max(0, this.hideCd - dt);
    switch (this.mode) {
      case 'cinematic':
        this.ball.update(dt);
        if (this.cine) {
          this.cine.t -= realDt;
          if (this.cine.t <= 0) {
            this.cine = null;
            if (this.g.running && !this.g.allFiredPending) this.g.afterFired();
          }
        }
        break;
      case 'seated':
        this.updateSeated(dt, realDt);
        break;
      case 'chair':
        this.updateChair(dt);
        break;
      case 'nap':
        this.updateNap(dt);
        break;
      case 'hide':
        this.updateHide(dt);
        break;
      case 'meeting':
        this.updateMeeting(dt);
        break;
      default:
        this.updateWalk(dt);
    }
    this.updatePapers(dt);
    for (const pu of this.puddles)
      if (pu.mesh.userData.grow) {
        const s = Math.min(1.1, pu.mesh.scale.x + realDt * 3);
        pu.mesh.scale.setScalar(s);
        if (s >= 1.1) pu.mesh.userData.grow = 0;
      }
  }

  private lookMouse(clampPitch = true, sens = 1) {
    const inp = this.g.input;
    // com o painel de minigame aberto o mouse é do cursor do painel
    if (inp.locked && !this.g.minigame.open) {
      this.camYaw -= inp.dx * 0.0024 * sens;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.dy * 0.002 * sens, clampPitch ? -1.2 : -1.4, clampPitch ? 1.25 : 1.4);
    }
  }

  private moveInput(maxSp: number, accel: number) {
    const inp = this.g.input;
    const fwd = new THREE.Vector3(Math.sin(this.camYaw + Math.PI), 0, Math.cos(this.camYaw + Math.PI));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3().addScaledVector(fwd, inp.axis('KeyS', 'KeyW')).addScaledVector(right, inp.axis('KeyA', 'KeyD'));
    if (mv.lengthSq() > 1) mv.normalize();
    const v = this.ball.velocity;
    const dv = mv.multiplyScalar(maxSp).sub(v);
    const a = accel * (dv.dot(v) < 0 ? 1.4 : 1);
    if (dv.length() > a) dv.setLength(a);
    v.add(dv);
    return v;
  }

  private clampBounds(p: THREE.Vector3) {
    const bd = this.g.office.inLobby(p) ? LOBBY_BOUNDS : BOUNDS;
    p.x = THREE.MathUtils.clamp(p.x, bd.minX, bd.maxX);
    p.z = THREE.MathUtils.clamp(p.z, bd.minZ, bd.maxZ);
  }

  private updateWalk(dt: number) {
    const g = this.g;
    const inp = g.input;
    const b = this.ball;
    const ghost = this.mode === 'ghost';
    if (!inp.locked) {
      g.hud.crosshair(null);
      if (!this.lockHintShown) g.hud.prompt('<kbd>CLIQUE</kbd>para controlar a câmera', 0);
      if (inp.pressed('Mouse0')) inp.lock();
      b.velocity.multiplyScalar(0.8);
      b.update(dt);
      return;
    }
    this.lookMouse();
    if (this.lockMove) {
      b.velocity.multiplyScalar(0.7);
      g.hud.prompt(null);
      b.update(dt);
      return;
    }
    const careful = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight') || this.carrying === 'galao';
    const v = this.moveInput((ghost ? 6 : careful ? 2.0 : B.PLAYER_SPEED) * (ghost ? 1 : g.items.speedMul(this.w)), B.PLAYER_ACCEL * dt);
    b.pos.addScaledVector(v, dt);
    // aquário a dois: a mola entre as alças puxa para perto do parceiro
    if (!ghost) g.items.pull(this.w, b.pos, dt);
    if (!ghost) g.office.collide(b.pos, 0.38);
    // sala do chefe trancada (vigilância): a porta segura o jogador
    if (!ghost) g.surv.collidePlayer(b.pos);
    this.clampBounds(b.pos);
    if (v.lengthSq() > 0.05) b.yaw = lerpAngle(b.yaw, Math.atan2(v.x, v.z), Math.min(1, dt * 10));
    // passinhos (som baixo) e poeirinha correndo
    if (!ghost && this.jumpY <= 0.001) {
      this.walkDist += v.length() * dt;
      if (this.walkDist > 0.85) {
        this.walkDist = 0;
        g.audio.play3D('step', b.pos, 0.18, 1, 12);
        if (v.length() > 3.2) g.juice.smoke(b.pos.clone().setY(0.08), 2, '#efe6d6', 0.35);
      }
    }
    else b.yaw = lerpAngle(b.yaw, this.camYaw + Math.PI, Math.min(1, dt * 3));
    // pulinho (ESPAÇO)
    if (!ghost && inp.pressed('Space') && this.jumpY <= 0.001 && !this.carrying && !this.holdingMission) {
      this.jumpV = 3.6;
      b.impulse(-0.35);
      g.audio.play('plop', 0.4);
    }
    if (this.jumpV !== 0 || this.jumpY > 0) {
      this.jumpV -= 12 * dt;
      this.jumpY = Math.max(0, this.jumpY + this.jumpV * dt);
      if (this.jumpY === 0 && this.jumpV < 0) {
        b.impulse(0.45);
        g.juice.smoke(b.pos.clone().setY(0.08), 6, '#efe6d6', 0.8);
        g.audio.play3D('thud', b.pos, 0.3);
        this.jumpV = 0;
      }
    }
    b.hoverHeight = (ghost ? 1.4 : 0.78) + this.jumpY;
    // café derramando
    if (this.carrying === 'coffee') this.updateSpill(dt, v);
    this.prevVel.copy(v);
    if (ghost) {
      g.hud.prompt(null);
      g.hud.crosshair(null);
      if (inp.pressed('Enter') && !g.net) {
        this.fastForward = !this.fastForward;
        g.hud.ghost(this.fastForward ? '⏩ <b>TEMPO ACELERADO ×6</b> — ENTER para voltar ao normal' : '👻 <b>DEMITIDO HOJE</b> — passeie ou aperte <b>ENTER</b> para acelerar o tempo.');
      }
      // multi: o fantasma vê o chefe através das paredes e avisa a sala
      if (inp.pressed('KeyF') && g.net) g.ghostPing();
      b.update(dt);
      return;
    }
    // máquina de lanche (comendo)
    if (this.vendT > 0) {
      this.vendT -= dt;
      if (Math.random() < dt * 12) b.impulse(0.08);
      if (this.vendT <= 0) {
        g.addFun(this.w, ACT.maquina.fun, 'lanche');
        g.funProgress('maquina');
        g.instinct += ACT.maquina.instinct;
        g.audio.play3D('crunch', b.pos, 0.9);
        g.juice.crumbs(b.headWorld(), 10);
      }
    }
    // arremesso de papel (segure botão direito)
    this.updateThrowCharge(dt);
    // interações
    this.updateInteract(dt);
    b.update(dt);
  }

  private updateSpill(dt: number, v: THREE.Vector3) {
    const g = this.g;
    const b = this.ball;
    const acc = new THREE.Vector3().subVectors(v, this.prevVel).length() / Math.max(dt, 1e-4);
    const rate = Math.max(0, v.length() - 2.3) * 7 + Math.max(0, acc - 6) * 0.25 + (this.jumpY > 0.05 ? 25 : 0);
    this.spill = Math.min(100, this.spill + rate * dt);
    if (rate > 3 && Math.random() < dt * 8 && this.carryMesh) g.juice.crumbs(this.carryMesh.getWorldPosition(new THREE.Vector3()), 2, '#5a3418');
    if (!this.spilledOnce && this.spill >= B.SPILL_PUDDLE_AT) {
      this.spilledOnce = true;
      this.makePuddle(b.pos);
      g.audio.play3D('splash', b.pos, 1);
      g.hud.popup('warn', 'DERRAMOU!', 'a poça vai chamar a atenção');
      g.noise(b.pos, 30, null);
    }
    if (this.spill >= 100) {
      this.makePuddle(b.pos.clone().add(new THREE.Vector3(0.3, 0, 0.2)));
      this.dropCarry();
      g.hud.popup('caught', 'CAFÉ NO CHÃO', 'devagar com o andor (SHIFT)');
      g.audio.play('sad', 0.8);
    }
  }

  /** Liga o contorno nos objetos mirados (cria as cascas uma vez e guarda). */
  private highlight(objs: THREE.Object3D[] | null, mat: THREE.Material = HL_MAT) {
    for (const m of this.hl) m.visible = false;
    this.hl = [];
    if (!objs) return;
    for (const o of objs) {
      if (!o.parent) continue;
      let hulls = this.hlCache.get(o);
      if (!hulls) {
        const meshes: THREE.Mesh[] = [];
        o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh && !m.userData.outline && !m.userData.hl && m.geometry.attributes.normal && !(m.material as THREE.Material & { isShaderMaterial?: boolean }).isShaderMaterial) meshes.push(m);
        });
        hulls = meshes.map((m) => {
          const h = new THREE.Mesh(m.geometry, mat);
          h.userData.hl = true;
          h.userData.noAO = true;
          h.raycast = () => {};
          m.add(h);
          return h;
        });
        this.hlCache.set(o, hulls);
      }
      for (const h of hulls) {
        h.material = mat;
        h.visible = true;
      }
      this.hl.push(...hulls);
    }
  }

  private updateInteract(dt: number) {
    const g = this.g;
    const inp = g.input;
    const cam = g.r.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const fwdXZ = fwd.clone().setY(0).normalize();
    this.raycaster.set(cam.position, fwd);
    this.raycaster.far = 6;
    // Sprites (rostos e balões dos bonecos) só sabem se testar com a câmera do raio
    this.raycaster.camera = cam;
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.interactables()) {
      const d = Math.hypot(it.pos.x - this.ball.pos.x, it.pos.z - this.ball.pos.z);
      if (d > it.r) continue;
      let score = d;
      const hit = !!it.obj && this.raycaster.intersectObjects(it.obj, true).length > 0;
      if (hit) score -= 2;
      const target = it.obj?.[0] ? it.obj[0].getWorldPosition(new THREE.Vector3()) : it.pos;
      const dir = new THREE.Vector3(target.x - cam.position.x, 0, target.z - cam.position.z).normalize();
      const facing = fwdXZ.dot(dir);
      if (it.needView && !hit && facing < 0.55) continue;
      score -= facing * 0.8 + (it.prio ?? 0);
      // quem não pode ser usado agora não rouba o E de quem pode (cadeira largada na frente da máquina de lanche)
      if (!it.ok()) score += 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.highlight(best && best.obj && best.ok() ? best.obj : null);
    if (!best) {
      g.hud.prompt(this.carrying === 'coffee' ? null : null);
      g.hud.crosshair(this.charging ? 'aim' : 'idle');
      this.holdId = '';
      this.holdT = 0;
      if (this.carrying === 'coffee') g.hud.meter(`☕ derramando ${Math.floor(this.spill)}%  (SHIFT = andar com cuidado)`, this.spill / 100);
      else if (!this.charging) g.hud.meter(null);
      return;
    }
    const ok = best.ok();
    const trigger = inp.pressed('KeyE') || (inp.pressed('Mouse0') && inp.locked);
    const holding = inp.isDown('KeyE') || (inp.isDown('Mouse0') && inp.locked);
    // v0.10: segurar E só na fofoca; o resto é toque (e o que é tarefa abre um minigame)
    const isHold = best.hold > 0 && best.id.startsWith('gossip');
    if (ok && isHold && holding) {
      if (this.holdId !== best.id) {
        this.holdId = best.id;
        this.holdT = 0;
      }
      this.holdT += dt;
      if (best.id.startsWith('gossip')) {
        const bot = g.workers.find((w) => w.ball.pos === best!.pos) ?? null;
        this.gossipBot = bot;
        if (Math.random() < dt * 2.5) {
          const who = Math.random() < 0.5 ? this.ball : bot?.ball ?? this.ball;
          g.juice.text(who.headWorld().add(new THREE.Vector3(0, 0.65, 0)), ['bla bla', 'sério?!', 'kkkk', 'nem te conto', '😱', '👀'][Math.floor(Math.random() * 6)], 'ft-small', 1.1);
          g.audio.play('chat', 0.5);
        }
        g.noise(this.ball.pos, ACT.fofoca.noise, this.w, dt);
      }
      if (this.holdT >= best.hold) {
        this.holdT = 0;
        this.holdId = '';
        best.act();
        if (this.mode !== 'walk') return;
      }
    } else if (!holding) {
      this.holdT = 0;
      this.holdId = '';
      this.gossipBot = null;
    }
    if (ok && !isHold && trigger) {
      const b = best;
      this.workPanel = b.id.startsWith('w-');
      if (b.mg)
        g.minigame.start({
          ...b.mg,
          onDone: (r) => b.act(r),
          // largar o pôster no meio deixa torto (evidência)
          onCancel: () => b.id.startsWith('m-poster') && g.missions.posterCancelled(Number(b.id.slice(8))),
        });
      else b.act();
      if (this.mode !== 'walk') return;
    }
    const label = best.label.replace(/ \(segure\)/g, '') + (best.mg ? ' 🎮' : '');
    g.hud.prompt(label, isHold && this.holdId === best.id ? this.holdT / best.hold : 0, best.hint);
    g.hud.crosshair(ok ? 'target' : 'idle');
    if (this.carrying === 'coffee') g.hud.meter(`☕ derramando ${Math.floor(this.spill)}%`, this.spill / 100);
    else if (!this.charging) g.hud.meter(null);
  }

  // ------------------------------------------------------------------ papel
  private updateThrowCharge(dt: number) {
    const g = this.g;
    const inp = g.input;
    const want = inp.isDown('Mouse2') && !this.carrying && !this.heldHeavy;
    // com o item de missão na mão o botão direito é o passe (carrega e solta, igual à bolinha)
    if (this.heldItem) {
      if (want && !this.charging) {
        this.charging = true;
        this.charge = 0;
      }
      if (!this.charging) return;
      this.charge = Math.min(1, this.charge + dt * 0.9);
      const { start, vel } = this.throwParams();
      this.aim.show(start.clone(), vel.clone().multiplyScalar(ITEMS.passSpeed), dt);
      g.hud.meter('🙌 solte o botão direito para passar', this.charge);
      g.hud.crosshair('aim');
      if (!inp.isDown('Mouse2')) {
        this.charging = false;
        this.aim.hide();
        g.hud.meter(null);
        this.paws?.throwSwing();
        g.items.pass(start, vel);
      }
      return;
    }
    if (want && !this.charging) {
      if (!g.paperAllowed) {
        if (inp.pressed('Mouse2')) g.hud.toastWorld('🔒 bolinhas de papel não são diversão de hoje');
        return;
      }
      if (this.paperHeld <= 0) {
        if (inp.pressed('Mouse2')) g.hud.toastWorld(this.pile.count > 0 ? '📄 pegue uma bolinha no monte da sua mesa' : '📄 sem bolinhas — recolha as do chão');
        return;
      }
      this.charging = true;
      this.charge = 0;
    }
    if (this.charging) {
      this.charge = Math.min(1, this.charge + dt * 0.9);
      const { start, vel } = this.throwParams();
      this.aim.show(start, vel, dt);
      g.hud.meter('🏀 solte o botão direito para arremessar', this.charge);
      g.hud.crosshair('aim');
      if (!inp.isDown('Mouse2')) {
        this.charging = false;
        this.aim.hide();
        g.hud.meter(null);
        this.paperHeld--;
        this.throwPaper(start, vel);
      }
    }
  }

  private throwParams() {
    const cam = this.g.r.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const start = cam.position.clone().addScaledVector(dir, 0.45).add(new THREE.Vector3(0, -0.08, 0));
    const speed = 3.5 + this.charge * 7.5;
    const vel = dir.multiplyScalar(speed);
    vel.y += 1.6 + this.charge * 1.4;
    return { start, vel };
  }

  /** Chamado quando uma bolinha vai para a mão (animação das patinhas). */
  private onGrab() {
    this.ball.impulse(0.15);
    this.paws?.crumple();
  }

  throwPaper(start: THREE.Vector3, vel: THREE.Vector3, owner: Worker | null = null) {
    const g = this.g;
    if (!owner) g.net?.throwPaper(start, vel);
    const mesh = g.office.paperProto.clone();
    mesh.position.copy(start);
    g.r.scene.add(mesh);
    this.papers.push({ mesh, owner, bonked: false, vel: vel.clone(), flying: true, reported: false, rimHit: false, from: start.clone(), life: 0 });
    if (owner) {
      g.audio.play3D('throw', start, 0.8);
      return;
    }
    g.audio.play('throw', 0.7);
    this.ball.impulse(0.4);
    this.paws?.throwSwing();
    g.instinct += ACT.basquete.instinct;
    this.w.contribution += ACT.basquete.instinct;
    g.noise(this.ball.pos, ACT.basquete.noise, this.w);
  }

  private updatePapers(dt: number) {
    const g = this.g;
    for (const pa of this.papers) {
      if (!pa.flying) continue;
      pa.life += dt;
      const prevY = pa.mesh.position.y;
      pa.vel.y -= 9.8 * dt;
      pa.mesh.position.addScaledVector(pa.vel, dt);
      pa.mesh.rotation.x += dt * 9;
      pa.mesh.rotation.z += dt * 6;
      // bolinha na cabeça de alguém (bonk)
      if (!pa.bonked && pa.life > 0.08) {
        const hit = g.bonkTarget(pa.mesh.position, pa.owner);
        if (hit) {
          pa.bonked = true;
          pa.vel.set(-pa.vel.x * 0.25, 1.5, -pa.vel.z * 0.25);
          g.onBonk(hit, pa.from, pa.owner);
        }
      }
      let done = false;
      for (const bin of pa.owner ? [] : g.office.bins) {
        if (pa.vel.y >= 0 || !(prevY >= bin.rim.y && pa.mesh.position.y <= bin.rim.y)) continue;
        const hd = Math.hypot(pa.mesh.position.x - bin.rim.x, pa.mesh.position.z - bin.rim.z);
        if (hd < bin.r) {
          done = true;
          pa.flying = false;
          g.r.scene.remove(pa.mesh);
          this.papers.splice(this.papers.indexOf(pa), 1);
          const dist = Math.hypot(pa.from.x - bin.rim.x, pa.from.z - bin.rim.z);
          const perfect = !pa.rimHit;
          // cesta só vale FUN se for diversão de hoje (a bolinha também serve para o bonk)
          if (g.canFun('cestas')) {
            const fun = (ACT.basquete.fun + dist * PAPER_DIST_BONUS) * (bin.hoop ? 1.5 : 1);
            g.addFun(this.w, fun, perfect ? (dist > 6 ? 'DE LONGE!' : 'SWISH!') : 'cesta', bin.rim);
            g.funProgress('cestas');
          }
          g.audio.play3D('swish', bin.rim, 1);
          g.juice.confetti(bin.rim.clone().add(new THREE.Vector3(0, 0.15, 0)), perfect ? 70 : 35, 3.5);
          g.juice.ring(bin.rim.clone(), '#ffd23f', 22, 3);
          g.juice.text(bin.rim.clone().add(new THREE.Vector3(0, 0.6, 0)), dist > 6 ? `${dist.toFixed(1)} m!` : perfect ? 'SWISH!' : 'CESTA!', 'ft-big', 1.2);
          g.juice.shake(0.12);
          break;
        }
        if (hd < bin.r + 0.1 && !pa.rimHit) {
          pa.rimHit = true;
          const out = new THREE.Vector3(pa.mesh.position.x - bin.rim.x, 0, pa.mesh.position.z - bin.rim.z).normalize();
          pa.vel.set(out.x * 1.2 + pa.vel.x * 0.2, 1.6, out.z * 1.2 + pa.vel.z * 0.2);
          if (Math.random() < 0.45) pa.vel.set(-out.x * 0.6, 1.4, -out.z * 0.6);
          g.audio.play3D('thud', bin.rim, 0.6);
        }
      }
      if (done) break;
      const pos = pa.mesh.position;
      if (pos.y > MAP.wallH - 0.1) {
        pos.y = MAP.wallH - 0.1;
        pa.vel.y = -Math.abs(pa.vel.y) * 0.3;
      }
      const before = pos.clone();
      g.office.collideBall(pos, 0.07);
      if (before.distanceToSquared(pos) > 1e-6) {
        pa.vel.x *= -0.4;
        pa.vel.z *= -0.4;
      }
      if (pos.y <= 0.06) {
        pos.y = 0.06;
        if (Math.abs(pa.vel.y) > 1.2) {
          pa.vel.y *= -0.35;
          pa.vel.x *= 0.5;
          pa.vel.z *= 0.5;
        } else {
          pa.flying = false;
          g.audio.play3D('thud', pos, 0.7);
          if (!pa.owner && !pa.bonked) {
            if (g.canFun('cestas')) g.addFun(this.w, BASQUETE_MISS_FUN);
            g.juice.text(pos.clone().setY(0.7), 'errou!', 'ft-bad', 1.0);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ sentado
  private updateSeated(dt: number, realDt: number) {
    const g = this.g;
    const p = this.w;
    const inp = g.input;
    const comp = g.computer;
    // o mouse gira a cabeça (e a cadeira) igual a andar; sem o cursor travado o clique só trava de novo
    const screenYaw = p.desk.seatYaw + Math.PI;
    if (!inp.locked) {
      g.hud.prompt('<kbd>CLIQUE</kbd>para controlar a câmera', 0);
      if (inp.pressed('Mouse0')) inp.lock();
    } else if (this.seatSettle > 0) {
      this.seatSettle -= realDt;
      const k = Math.min(1, realDt * 12);
      this.camYaw = lerpAngle(this.camYaw, screenYaw, k);
      this.camPitch += (SEAT_LOOK.screenPitch - this.camPitch) * k;
    } else this.lookMouse(true, SEAT_LOOK.screenSens + (1 - SEAT_LOOK.screenSens) * this.away);
    const lookAng = Math.hypot(wrapAngle(this.camYaw - screenYaw) * Math.cos(this.camPitch), this.camPitch - SEAT_LOOK.screenPitch);
    this.away = THREE.MathUtils.smoothstep(lookAng, SEAT_LOOK.awayFrom, SEAT_LOOK.awayTo);
    this.peek += (this.away - this.peek) * Math.min(1, realDt * 10);
    this.clutchW += ((this.clutchPeek > 0 ? 1 : 0) - this.clutchW) * Math.min(1, realDt * 9);
    this.clutchPeek = Math.max(0, this.clutchPeek - realDt);
    this.updateSeatedView(realDt, screenYaw);
    // olhando para a sala a atividade congela (a janela continua visível para o chefe)
    comp.frozen = this.away > 0.5 || this.clutchW > 0.5;
    // mira: telefone tocando e monte de bolinhas ganham silhueta branca; clicar usa
    this.raycaster.set(this.camPos, this.seatDir);
    this.raycaster.far = 3;
    const phoneHit = !!g.tasks.ringing && this.raycaster.intersectObject(p.desk.phone.group, true).length > 0;
    const pileHit = !phoneHit && !this.charging && g.paperAllowed && this.paperHeld < PAPER.handMax && this.pile.count > 0 && this.raycaster.intersectObject(this.pile.group, true).length > 0;
    this.highlight(phoneHit ? [p.desk.phone.group] : pileHit ? [this.pile.group] : null, HL_WHITE);
    const onObj = phoneHit || pileHit;
    if (onObj && inp.locked && inp.pressed('Mouse0')) {
      if (phoneHit) g.tasks.answer();
      else {
        g.office.setPile(p.desk, this.pile.count - 1);
        this.paperHeld++;
        g.audio.play('crumple', 0.7);
        this.onGrab();
      }
    }
    const live = inp.locked && !comp.frozen && !onObj;
    if (live) this.screenAim(p.desk.screen, 1024, 640, this.mouseCanvas);
    const sInp: ScreenInput = {
      x: this.mouseCanvas.x, y: this.mouseCanvas.y,
      down: live && inp.isDown('Mouse0'), pressed: live && inp.pressed('Mouse0'), released: inp.released('Mouse0'),
      key: (c) => inp.isDown(c), keyPressed: (c) => inp.pressed(c),
    };
    // digitando e-mail no app Trabalho: as letras são do texto, não atalhos
    const typing = comp.typing;
    if (inp.pressed('Space') && !comp.frozen && !typing) comp.altTab(g.time);
    comp.update(dt, g.time, sInp);
    if (inp.pressed('KeyH') && !typing) g.toggleHeadphones();
    if (inp.pressed(typing ? 'Enter' : 'KeyT') && g.tasks.ringing) g.tasks.answer();
    if (inp.pressed('KeyG') && !typing && this.eating <= 0 && !this.charging) {
      if (!g.canFun('lanche')) comp.toast('🔒 lanche na mesa não é diversão de hoje');
      else if (g.stock.lanche > 0) {
        g.stock.lanche--;
        this.eating = 1.2;
        g.audio.play3D('crunch', p.desk.seat, 0.9);
      } else comp.toast('🍪 gaveta vazia');
    }
    if (this.eating > 0) {
      this.eating -= dt;
      if (Math.random() < dt * 12) this.ball.impulse(0.08);
      if (Math.random() < dt * 10) g.juice.crumbs(p.desk.screenCenter.clone().addScaledVector(p.desk.screenNormal, 0.45).setY(0.95), 2);
      if (this.eating <= 0) {
        g.addFun(p, ACT.lanche.fun, 'lanche');
        g.funProgress('lanche');
        g.instinct += ACT.lanche.instinct;
        p.contribution += ACT.lanche.instinct;
        g.addCrumbs(p);
        g.noise(p.desk.seat, ACT.lanche.noise, p);
        if (p.crumbs >= 2) comp.toast('🧹 migalhas na mesa! segure C para limpar');
      }
    }
    if (inp.isDown('KeyC') && !typing && p.crumbs > 0) {
      this.cleaning += dt;
      if (this.cleaning >= 1.5) {
        this.cleaning = 0;
        p.crumbs = 0;
        p.desk.crumbs.visible = false;
        g.audio.play('swish', 0.4);
        comp.toast('✨ mesa limpinha');
      }
    } else this.cleaning = 0;
    this.updateThrowCharge(dt);
    // nos e-mails o E é letra (e um "e" errado não pode te tirar da cadeira): segurar o E levanta
    this.typeStandT = typing && inp.isDown('KeyE') ? this.typeStandT + realDt : 0;
    const stand = typing ? this.typeStandT >= 0.5 : inp.pressed('KeyE');
    if (stand && this.clutchW < 0.3 && !this.charging) {
      this.typeStandT = 0;
      this.setMode('walk');
      g.audio.play('click', 0.5);
      this.ball.impulse(0.5);
      if (comp.forbiddenOpen) g.hud.popup('warn', 'JOGO ABERTO NA MESA!', 'se o chefe passar, ele vê');
    }
    if (inp.locked) {
      const held = this.paperHeld > 0 ? `🗒️ ${this.paperHeld} na mão · segure o botão direito e solte para arremessar` : null;
      if (phoneHit) g.hud.prompt('<kbd>CLIQUE</kbd>📞 Atender o telefone', 0);
      else if (pileHit) g.hud.prompt(`<kbd>CLIQUE</kbd>Pegar bolinha de papel (${this.pile.count} no monte)`, 0);
      else g.hud.prompt(this.cleaning > 0 ? '🧹 limpando…' : held, this.cleaning / 1.5);
      // fora do monitor a mira vira o ponto branco
      g.hud.crosshair(this.charging ? 'aim' : onObj ? 'target' : this.away > 0.3 ? 'idle' : null);
    }
    this.ball.update(dt);
  }

  /** Cabeça sentado: posição na cadeira e direção do olhar. O mouse manda; o susto do clutch puxa a vista. */
  private updateSeatedView(realDt: number, screenYaw: number) {
    const g = this.g;
    const d = this.w.desk;
    const head = d.seat.clone().setY(1.12);
    let yaw = this.camYaw;
    let pitch = this.camPitch;
    if (this.clutchW > 0.001) {
      yaw = lerpAngle(yaw, screenYaw + Math.PI, this.clutchW);
      pitch += (0.05 - pitch) * this.clutchW;
    }
    // a cadeira gira junto com a cabeça (o encosto não tapa a vista)
    d.chairYaw = d.seatYaw + wrapAngle(yaw - screenYaw);
    // sem zoom: a cabeça fica na cadeira, de onde se vê o monitor, o telefone e a sala
    head.y += Math.sin(g.time * 1.3) * 0.004;
    this.camPos.lerp(head, Math.min(1, realDt * 9));
    const cp = Math.cos(pitch);
    this.seatDir.set(-Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  /** Onde a mira (centro da vista) toca a tela, em pixels do canvas; preso às bordas se passar do monitor. */
  private screenAim(mesh: THREE.Mesh, w: number, h: number, out: { x: number; y: number }) {
    const n = this.w.desk.screenNormal;
    const dn = this.seatDir.dot(n);
    if (dn > -0.05) return;
    mesh.updateWorldMatrix(true, false);
    const c = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const hit = mesh.worldToLocal(this.tmpV.copy(this.camPos).addScaledVector(this.seatDir, n.dot(c.sub(this.camPos)) / dn));
    const size = (mesh.geometry as THREE.PlaneGeometry).parameters;
    out.x = THREE.MathUtils.clamp(hit.x / size.width + 0.5, 0, 1) * w;
    out.y = (1 - THREE.MathUtils.clamp(hit.y / size.height + 0.5, 0, 1)) * h;
  }

  // ------------------------------------------------------------------ corrida de cadeira
  private updateChair(dt: number) {
    const g = this.g;
    const ride = this.chairRide!;
    this.lookMouse();
    const v = this.moveInput(CHAIR.speed, 7 * dt);
    v.multiplyScalar(1 - dt * 0.4);
    const b = this.ball;
    b.pos.addScaledVector(v, dt);
    const before = b.pos.clone();
    g.office.collide(b.pos, 0.42);
    if (before.distanceToSquared(b.pos) > 1e-5 && v.length() > 3) {
      g.audio.play3D('thud', b.pos, 0.8);
      g.juice.shake(0.15);
      b.impulse(0.6);
      v.multiplyScalar(-0.4);
    }
    this.clampBounds(b.pos);
    const sp = v.length();
    ride.chair.group.position.set(b.pos.x, 0, b.pos.z);
    if (sp > 0.3) ride.chair.group.rotation.y = lerpAngle(ride.chair.group.rotation.y, Math.atan2(v.x, v.z), Math.min(1, dt * 4));
    if (sp > 2 && Math.random() < dt * 5) g.audio.play3D('squeak', b.pos, 0.35);
    b.yaw = lerpAngle(b.yaw, Math.atan2(v.x, v.z), Math.min(1, dt * 6));
    b.hoverHeight = 0.94;
    ride.t -= dt;
    if (sp > 2.5 && ride.earned < ACT.cadeira.funMax) {
      const v2 = Math.min(ACT.cadeira.fun * dt, ACT.cadeira.funMax - ride.earned);
      ride.earned += v2;
      g.addFun(this.w, v2);
      g.funProgress('cadeira', v2);
      if (Math.random() < dt * 6) g.juice.smoke(b.pos.clone().setY(0.1), 1, '#e8e2d8', 0.4);
    }
    g.hud.meter(`🪑 corrida: ${Math.ceil(ride.t)} s`, ride.t / CHAIR.ride);
    b.update(dt);
    if (ride.t <= 0 || g.input.pressed('KeyE')) {
      this.chairCd = CHAIR.cooldown;
      g.hud.meter(null);
      b.setPos(b.pos.x + 0.5, b.pos.z);
      this.chairRide = null;
      this.setMode('walk');
    }
  }

  get chairSpeed() {
    return this.mode === 'chair' ? this.ball.velocity.length() : 0;
  }

  // ------------------------------------------------------------------ banheiro
  private updateHide(dt: number) {
    const g = this.g;
    this.lookMouse();
    this.hideT -= dt;
    g.hud.meter(`🚽 escondido: ${Math.ceil(this.hideT)} s`, this.hideT / B.BATHROOM_HIDE);
    if (this.hideT <= 0 || g.input.pressed('KeyE')) {
      this.hideCd = B.BATHROOM_HIDE_CD;
      g.hud.meter(null);
      const bath = this.hideBath!;
      this.hideBath = null;
      this.ball.setPos(bath.stallFront.x, bath.stallFront.z);
      this.ball.impulse(0.8);
      g.audio.play3D('flush', bath.hidePos, 1);
      g.noise(bath.hidePos, 5, this.w);
      g.subtitle('[descarga]', bath.hidePos);
      this.setMode('walk');
    }
  }

  // ------------------------------------------------------------------ reunião relâmpago
  enterMeeting() {
    const s = this.g.office.P.meetingSeat;
    this.ball.setPos(s.x, s.z);
    this.ball.yaw = Math.PI;
    this.ball.velocity.set(0, 0, 0);
    this.setMode('meeting');
    this.ball.hoverHeight = 0.94;
  }

  private updateMeeting(dt: number) {
    const s = this.g.office.P.meetingSeat;
    this.lookMouse();
    this.ball.setPos(s.x, s.z);
    this.ball.hoverHeight = 0.94;
    if (this.g.input.pressed('KeyE')) {
      this.g.tasks.leaveMeeting();
      this.ball.setPos(s.x, s.z + 0.7);
      this.g.hud.toastWorld('saiu da reunião (a tarefa continua)');
    }
    this.ball.update(dt);
  }

  // ------------------------------------------------------------------ soneca
  private updateNap(dt: number) {
    const g = this.g;
    const b = this.ball;
    const o = g.office;
    this.lookMouse(false);
    b.setPos(o.couch.seat.x, o.couch.seat.z);
    b.yaw = Math.PI;
    b.lying = 1;
    b.hoverHeight = 0.7;
    b.setSleeping(true);
    this.napT += dt;
    this.snoreT -= dt;
    if (this.snoreT <= 0) {
      this.snoreT = 2.6;
      g.audio.play3D('snore', b.pos, 0.8);
      g.noise(b.pos, ACT.soneca.noise, this.w);
    }
    b.update(dt);
    if (g.input.pressed('KeyE') || g.input.pressed('Space') || g.earnedLeft(this.w, 'soneca') <= 0) {
      g.bots.spot('sofa').busy = null;
      b.setPos(o.couch.stand.x, o.couch.stand.z);
      b.impulse(0.8);
      this.setMode('walk');
    }
  }

  // ------------------------------------------------------------------ câmera
  /** Altura dos olhos: o centro da cabeça do próprio personagem, igual à dos colegas. */
  private eyePos(out = new THREE.Vector3()) {
    const b = this.ball;
    return out.set(b.pos.x, b.eyeY(), b.pos.z);
  }

  /** Direção do olhar a partir de yaw/pitch (pitch > 0 = olhando para baixo). */
  private lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.camPitch);
    return out.set(-Math.sin(this.camYaw) * cp, -Math.sin(this.camPitch), -Math.cos(this.camYaw) * cp);
  }

  /** Primeira pessoa em todos os modos. */
  updateCamera(realDt: number) {
    const g = this.g;
    const cam = g.r.camera;
    const b = this.ball;
    const k = Math.min(1, realDt * 10);
    b.root.visible = false;
    // o corpo some da câmera, mas os espelhos o desenham (menos fantasma, esconderijo e cinemática)
    g.office.reflectBody = this.mode === 'ghost' || this.mode === 'hide' || this.mode === 'cinematic' ? null : b.root;
    this.updateViewModel(realDt);
    g.hud.crack(this.mode === 'hide');
    g.r.u.uVignette.value += ((this.mode === 'hide' ? 0.75 : this.mode === 'nap' ? 0.6 : 0.28) - g.r.u.uVignette.value) * Math.min(1, realDt * 5);
    if (this.mode === 'cinematic' && this.cine) {
      // olhando o chefe nos olhos, com a câmera "afundando"
      const boss = g.bosses.find((x) => x.ball.root.visible && x.busy) ?? g.bosses[0];
      const look = boss.ball.headWorld().add(new THREE.Vector3(0, 0.22 * boss.ball.spec.scale, 0));
      const away = this.eyePos().sub(look).setY(0).normalize();
      // recua um passo, assustado, e afunda um pouco
      const eye = this.eyePos().addScaledVector(away, 0.6 * (1 - this.cine.t / 2.8)).add(new THREE.Vector3(0, -0.1 * (1 - this.cine.t / 2.8), 0));
      this.camPos.lerp(eye, k);
      this.camLook.lerp(look, k * 0.8);
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      cam.rotation.z += Math.sin(g.time * 3) * 0.02 * (1 - this.cine.t / 2.8);
      g.r.baseFov = 62 - (1 - this.cine.t / 2.8) * 10;
      return;
    }
    if (this.mode === 'seated') {
      // posição e direção vêm de updateSeatedView (o cursor da tela usa a mesma pose)
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook.copy(this.camPos).add(this.seatDir));
      g.r.baseFov = 62;
      return;
    }
    // andar, cadeira, soneca, banheiro, fantasma: olhar livre com o mouse
    let eye: THREE.Vector3;
    if (this.mode === 'nap') eye = b.pos.clone().setY(0.92);
    else if (this.mode === 'meeting') eye = b.pos.clone().setY(1.12);
    else if (this.mode === 'hide') eye = this.hideBath!.peek.clone();
    else if (this.mode === 'chair') eye = b.pos.clone().setY(1.3);
    else eye = this.eyePos();
    // balanço da cabeça ao andar
    const sp = this.mode === 'walk' || this.mode === 'ghost' ? new THREE.Vector2(b.velocity.x, b.velocity.z).length() : 0;
    this.bobT += realDt * (5 + sp * 2.2);
    const bobAmt = Math.min(1, sp / 4) * (this.jumpY > 0.01 ? 0 : 1);
    eye.y += Math.abs(Math.sin(this.bobT)) * 0.022 * bobAmt;
    const sideBob = Math.sin(this.bobT) * 0.01 * bobAmt;
    if (this.intro > 0) this.intro = 0;
    const dir = this.lookDir();
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    eye.addScaledVector(right, sideBob);
    this.camPos.copy(eye);
    this.camLook.copy(eye).add(dir);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    if (this.mode === 'chair') {
      // inclina nas curvas
      const lat = b.velocity.dot(right);
      cam.rotation.z += -lat * 0.03;
    }
    g.r.baseFov = this.mode === 'chair' ? 72 + this.chairSpeed * 1.6 : this.mode === 'hide' ? 48 : 70;
  }

  // ------------------------------------------------------------------ itens na mão (1ª pessoa)
  private updateViewModel(realDt: number) {
    const g = this.g;
    if (!this.view.parent) {
      g.r.scene.add(g.r.camera);
      g.r.camera.add(this.view);
    }
    const walkish = this.mode === 'walk';
    this.view.visible = walkish;
    const sp = new THREE.Vector2(this.ball.velocity.x, this.ball.velocity.z).length();
    const bob = Math.min(1, sp / 4);
    const paws = this.ensurePaws();
    if (this.pawOverride) {
      this.pawOverride.t -= realDt;
      if (this.pawOverride.t <= 0) this.pawOverride = null;
    }
    paws.pose = this.pawOverride?.pose
      ?? (this.heldHeavy ? 'heavy' : this.heldItem ? (this.charging ? 'charge' : 'two') : this.carrying === 'coffee' ? 'coffee' : this.carrying === 'galao' ? 'heavy' : this.carrying ? 'two' : this.charging ? 'charge' : this.paperHeld > 0 ? 'paper' : 'none');
    this.handset.visible = paws.pose === 'phone';
    paws.update(realDt, bob, this.bobT);
    // café balança conforme derrama
    if (this.carryMesh) {
      this.carryMesh.rotation.z = Math.sin(g.time * 9) * this.spill * 0.002 + (this.ball.velocity.x - this.prevVel.x) * 0.02;
    }
    // bolinha de papel na palma (a pose 'charge' já puxa a mão para trás)
    this.paperHand.visible = this.paperHeld > 0 && !this.carrying && !this.holdingMission;
  }
}
