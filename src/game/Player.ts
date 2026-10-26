import * as THREE from 'three';
import { B, ACT, CHAIR, PAPER_DIST_BONUS, BASQUETE_MISS_FUN } from '../balance';
import { MAP, type Bathroom, type RaceChair } from '../world/Office';
import type { ScreenInput } from '../apps/common';
import type { Game } from './Game';
import type { Worker } from './Worker';
import { lerpAngle } from './Boss';

export type Mode = 'walk' | 'seated' | 'chair' | 'nap' | 'hide' | 'ghost' | 'cinematic';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  r: number;
  label: string;
  /** Linha menor no prompt: o que ganha e o risco. */
  hint?: string;
  hold: number;
  ok: () => boolean;
  act: () => void;
  /** Malhas que contam como "mirar" nesse objeto. */
  obj?: THREE.Object3D[];
  /** Só vale se o objeto estiver à vista (mirando ou na frente da câmera). */
  needView?: boolean;
}

interface Paper {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  flying: boolean;
  reported: boolean;
  rimHit: boolean;
  from: THREE.Vector3;
  life: number;
}

const BOUNDS = { minX: -MAP.ox + 0.4, maxX: MAP.ox - 0.4, minZ: -MAP.oz - MAP.north + 0.4, maxZ: MAP.oz - 0.4 };

/** Controle do jogador: andar, sentar, diversões, câmera e mira. */
export class Player {
  mode: Mode = 'walk';
  camYaw = 0;
  camPitch = 0.25;
  readonly camPos = new THREE.Vector3();
  readonly camLook = new THREE.Vector3();
  peek = 0;
  private aimCam = 0;
  private throwWatch = 0;
  clutchPeek = 0;
  cine: { t: number } | null = null;
  carrying: 'coffee' | 'report' | null = null;
  private carryMesh: THREE.Object3D | null = null;
  spill = 0;
  private spilledOnce = false;
  private holdT = 0;
  private holdId = '';
  eating = 0;
  private cleaning = 0;
  aiming = false;
  private aimT = 0;
  private charging = false;
  private charge = 0;
  readonly papers: Paper[] = [];
  readonly puddles: { mesh: THREE.Mesh; reported: boolean }[] = [];
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
  private arcPreview: THREE.InstancedMesh;
  private jumpV = 0;
  private walkDist = 0;
  /** Câmera de abertura do dia (segundos restantes). */
  intro = 0;
  private bobT = 0;
  /** Grupo preso à câmera com o que você segura. */
  private readonly view = new THREE.Group();
  private readonly paperHand: THREE.Mesh;
  private hideT = 0;
  /** Banheiro onde você está escondido (na cabine). */
  private hideBath: Bathroom | null = null;
  hideCd = 0;
  private jumpY = 0;
  private lockHintShown = false;

  constructor(private g: Game) {
    this.arcPreview = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.04, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
      28,
    );
    this.arcPreview.visible = false;
    this.arcPreview.frustumCulled = false;
    this.arcPreview.userData.noAO = true;
    g.r.scene.add(this.arcPreview);
    this.paperHand = g.office.paperProto.clone();
    this.paperHand.scale.setScalar(1.4);
    this.paperHand.visible = false;
    this.view.add(this.paperHand);
  }

  get w() {
    return this.g.player;
  }
  get ball() {
    return this.g.player.ball;
  }

  resetDay() {
    this.dropCarry();
    this.spill = 0;
    this.eating = 0;
    this.cleaning = 0;
    this.aiming = false;
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
    this.ball.setPos(d.standPos.x + d.screenNormal.x * 0.4, d.standPos.z);
    this.ball.yaw = d.seatYaw;
    this.camYaw = d.seatYaw + Math.PI - 0.5 * Math.sign(d.screenNormal.x);
    this.camPitch = 0.12;
    // "abrindo os olhos" no começo do expediente
    this.g.r.u.uFlashColor.value.set('#000000');
    this.g.r.u.uFlash.value = 1;
    this.camPos.copy(this.ball.pos).add(new THREE.Vector3(-d.screenNormal.x * 3, 2.2, 0));
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
      g.input.unlock();
      g.hud.controls('seated');
      this.peek = 0;
    } else {
      p.seated = false;
      if (prev === 'seated') {
        b.setPos(p.desk.standPos.x, p.desk.standPos.z);
        b.yaw = p.desk.seatYaw + Math.PI;
        this.camYaw = p.desk.seatYaw;
        this.camPitch = 0.08;
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
      g.hud.controls('ghost');
      g.hud.ghost('👻 <b>DEMITIDO HOJE</b> — você é um fantasma.<br>Passeie ou aperte <b>ENTER</b> para acelerar o tempo.');
    } else if (m === 'chair') {
      g.input.lock();
      g.hud.controls('chair');
    } else if (m === 'nap') {
      g.input.lock();
      g.hud.controls('nap');
    } else if (m === 'hide') {
      g.input.lock();
      g.hud.controls('hide');
    } else if (m === 'cinematic') g.hud.controls('none');
    g.r.canvas.classList.toggle('nocursor', m === 'seated');
    g.hud.crosshair(m === 'walk' ? 'idle' : null);
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
    this.charging = false;
    this.arcPreview.visible = false;
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
    if (this.eating > 0 || this.aiming || this.charging) return 'lanche';
    return null;
  }

  // ------------------------------------------------------------------ carregar coisas
  carry(what: 'coffee' | 'report') {
    this.dropCarry();
    this.carrying = what;
    const o = this.g.office;
    const m = what === 'coffee' ? o.coffeeCupProto.clone() : o.reportProto.clone();
    // na mão, no canto da tela (primeira pessoa)
    if (what === 'coffee') {
      m.position.set(0.27, -0.27, -0.52);
      m.scale.setScalar(1.05);
    } else {
      m.position.set(0.24, -0.26, -0.48);
      m.rotation.set(0.9, -0.3, 0);
      m.scale.setScalar(1.2);
    }
    this.view.add(m);
    this.carryMesh = m;
    this.ball.impulse(0.3);
    this.spill = 0;
    this.spilledOnce = false;
  }

  dropCarry() {
    if (this.carryMesh) this.carryMesh.removeFromParent();
    this.carryMesh = null;
    this.carrying = null;
  }

  private makePuddle(pos: THREE.Vector3) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), (this.w.desk.puddle.material as THREE.Material).clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.015, pos.z);
    m.scale.setScalar(0.1);
    m.userData.grow = 1;
    m.userData.noAO = true;
    this.g.r.scene.add(m);
    this.puddles.push({ mesh: m, reported: false });
    this.w.puddle = true;
  }

  // ------------------------------------------------------------------ interações andando
  private interactables(): Interactable[] {
    const g = this.g;
    const o = g.office;
    const P = o.P;
    const p = this.w;
    const st = g.stock;
    const list: Interactable[] = [
      {
        id: 'sit', pos: p.desk.standPos, r: 2.2, hold: 0, obj: p.desk.click, needView: true,
        label: this.carrying ? 'mãos ocupadas' : '<kbd>CLIQUE</kbd>Sentar no seu PC',
        hint: 'jogos no PC dão FUN · ESPAÇO esconde o jogo',
        ok: () => !this.carrying,
        act: () => {
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
      {
        id: 'tray', pos: P.tray.clone().setZ(P.tray.z + 0.6), r: 1.4, hold: 0,
        label: this.carrying === 'coffee' ? '<kbd>E</kbd>Entregar café ao chefe' : this.carrying === 'report' ? '<kbd>E</kbd>Entregar relatório' : 'bandeja do chefe',
        ok: () => !!this.carrying,
        act: () => g.deliver(),
      },
      {
        id: 'water', pos: o.P.coffee.clone().set(o.P.coffee.x - 3.6, 0, o.P.coffee.z - 0.6), r: 1.2, hold: 0.8,
        label: p.heat > 5 ? '<kbd>E</kbd>Beber água' : 'bebedouro', hint: p.heat > 5 ? 'esfria o superaquecimento' : 'use quando estiver superaquecendo 🔥', ok: () => p.heat > 5,
        act: () => {
          p.heat = Math.max(0, p.heat - 40);
          g.audio.play('plop', 0.8);
          g.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 0.7, 0)), '💧 refrescado', 'ft-small', 1);
        },
      },
    ];
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
        label: st.cadeira <= 0 ? 'sem corridas por hoje' : this.chairCd > 0 ? `cadeira esfriando (${Math.ceil(this.chairCd)} s)` : `<kbd>E</kbd>Corrida de cadeira! (${st.cadeira} restantes)`,
        hint: '10 s de FUN · faz barulho',
        ok: () => !this.carrying && st.cadeira > 0 && this.chairCd <= 0,
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
      label: sofaSpot.busy ? `${sofaSpot.busy.name} está cochilando` : g.earnedLeft(p, 'soneca') > 0 ? '<kbd>E</kbd>Tirar uma soneca' : 'sem sono',
      hint: 'FUN devagar · o ronco faz barulho',
      ok: () => !sofaSpot.busy && !this.carrying && g.earnedLeft(p, 'soneca') > 0,
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
      label: st.maquina > 0 ? `<kbd>E</kbd>Comprar lanche (${st.maquina} restantes)` : 'máquina sem troco',
        hint: 'FUN rápida · deixa migalhas',
      ok: () => st.maquina > 0 && this.vendT <= 0 && !this.carrying,
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
        label: st.fofoca > 0 ? `<kbd>E</kbd>Fofocar com ${bot.name} (segure)` : 'chega de fofoca hoje',
        hint: `muita FUN para os dois · ${st.fofoca} restantes · faz barulho`,
        ok: () => st.fofoca > 0,
        act: () => {
          st.fofoca--;
          g.addFun(p, ACT.fofoca.fun, 'fofoca');
          g.addFun(bot, ACT.fofoca.fun);
          g.addSus(p, ACT.fofoca.sus);
          g.instinct += ACT.fofoca.instinct * 2;
          this.gossipBot = null;
          g.audio.play('happyChat', 0.8);
        },
      });
    }
    // papéis no chão
    for (const pa of this.papers)
      if (!pa.flying)
        list.push({
          id: `paper${pa.mesh.id}`, pos: pa.mesh.position, r: 1.0, hold: 0, label: '<kbd>E</kbd>Recolher bolinha de papel', ok: () => true,
          act: () => {
            g.r.scene.remove(pa.mesh);
            this.papers.splice(this.papers.indexOf(pa), 1);
            st.basquete++;
            g.audio.play('pop', 0.6);
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
    this.throwWatch = Math.max(0, this.throwWatch - realDt);
    switch (this.mode) {
      case 'cinematic':
        this.ball.update(dt);
        if (this.cine) {
          this.cine.t -= realDt;
          if (this.cine.t <= 0) {
            this.cine = null;
            if (this.g.running && !this.g.allFiredPending) this.setMode('ghost');
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

  private lookMouse(clampPitch = true) {
    const inp = this.g.input;
    if (inp.locked) {
      this.camYaw -= inp.dx * 0.0024;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.dy * 0.002, clampPitch ? -1.2 : -1.4, clampPitch ? 1.25 : 1.4);
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
    p.x = THREE.MathUtils.clamp(p.x, BOUNDS.minX, BOUNDS.maxX);
    p.z = THREE.MathUtils.clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ);
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
    const careful = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const v = this.moveInput(ghost ? 6 : careful ? 2.0 : B.PLAYER_SPEED, B.PLAYER_ACCEL * dt);
    b.pos.addScaledVector(v, dt);
    if (!ghost) g.office.collide(b.pos, 0.38);
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
    if (!ghost && inp.pressed('Space') && this.jumpY <= 0.001 && !this.carrying) {
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
      if (inp.pressed('Enter')) {
        this.fastForward = !this.fastForward;
        g.hud.ghost(this.fastForward ? '⏩ <b>TEMPO ACELERADO ×6</b> — ENTER para voltar ao normal' : '👻 <b>DEMITIDO HOJE</b> — passeie ou aperte <b>ENTER</b> para acelerar o tempo.');
      }
      b.update(dt);
      return;
    }
    // máquina de lanche (comendo)
    if (this.vendT > 0) {
      this.vendT -= dt;
      if (Math.random() < dt * 12) b.impulse(0.08);
      if (this.vendT <= 0) {
        g.addFun(this.w, ACT.maquina.fun, 'lanche');
        g.addSus(this.w, ACT.maquina.sus);
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

  private updateInteract(dt: number) {
    const g = this.g;
    const inp = g.input;
    const cam = g.r.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const fwdXZ = fwd.clone().setY(0).normalize();
    this.raycaster.set(cam.position, fwd);
    this.raycaster.far = 6;
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
      score -= facing * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
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
    if (ok && best.hold > 0 && holding) {
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
    if (ok && best.hold === 0 && trigger) {
      best.act();
      if (this.mode !== 'walk') return;
    }
    g.hud.prompt(best.label, this.holdId === best.id ? this.holdT / best.hold : 0, best.hint);
    g.hud.crosshair(ok ? 'target' : 'idle');
    if (this.carrying === 'coffee') g.hud.meter(`☕ derramando ${Math.floor(this.spill)}%`, this.spill / 100);
    else if (!this.charging) g.hud.meter(null);
  }

  // ------------------------------------------------------------------ papel
  private updateThrowCharge(dt: number) {
    const g = this.g;
    const inp = g.input;
    const want = inp.isDown('Mouse2') && !this.carrying;
    if (want && !this.charging) {
      if (!g.day.unlocked.includes('basquete')) {
        if (inp.pressed('Mouse2')) g.hud.toastWorld('🔒 basquete bloqueado hoje');
        return;
      }
      if (g.stock.basquete <= 0) {
        if (inp.pressed('Mouse2')) g.hud.toastWorld('📄 sem folhas — recolha as do chão');
        return;
      }
      this.charging = true;
      this.charge = 0;
    }
    if (this.charging) {
      this.charge = Math.min(1, this.charge + dt * 0.9);
      const { start, vel } = this.throwParams();
      // prévia da trajetória
      const m = new THREE.Matrix4();
      const pos = start.clone();
      const v = vel.clone();
      for (let i = 0; i < 28; i++) {
        for (let k = 0; k < 3; k++) {
          v.y -= 9.8 * 0.016;
          pos.addScaledVector(v, 0.016);
        }
        m.makeTranslation(pos.x, Math.max(0.03, pos.y), pos.z);
        this.arcPreview.setMatrixAt(i, m);
      }
      this.arcPreview.instanceMatrix.needsUpdate = true;
      this.arcPreview.visible = true;
      g.hud.meter('🏀 solte o botão direito para arremessar', this.charge);
      g.hud.crosshair('aim');
      if (!inp.isDown('Mouse2')) {
        this.charging = false;
        this.arcPreview.visible = false;
        g.hud.meter(null);
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

  throwPaper(start: THREE.Vector3, vel: THREE.Vector3) {
    const g = this.g;
    g.stock.basquete--;
    const mesh = g.office.paperProto.clone();
    mesh.position.copy(start);
    g.r.scene.add(mesh);
    this.papers.push({ mesh, vel: vel.clone(), flying: true, reported: false, rimHit: false, from: start.clone(), life: 0 });
    g.audio.play('throw', 0.7);
    this.ball.impulse(0.4);
    g.addSus(this.w, ACT.basquete.sus);
    g.instinct += ACT.basquete.instinct;
    this.w.contribution += ACT.basquete.instinct;
    g.noise(this.ball.pos, ACT.basquete.noise, this.w);
    this.throwWatch = this.mode === 'seated' ? 1.7 : 0;
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
      let done = false;
      for (const bin of g.office.bins) {
        if (pa.vel.y >= 0 || !(prevY >= bin.rim.y && pa.mesh.position.y <= bin.rim.y)) continue;
        const hd = Math.hypot(pa.mesh.position.x - bin.rim.x, pa.mesh.position.z - bin.rim.z);
        if (hd < bin.r) {
          done = true;
          pa.flying = false;
          g.r.scene.remove(pa.mesh);
          this.papers.splice(this.papers.indexOf(pa), 1);
          const dist = Math.hypot(pa.from.x - bin.rim.x, pa.from.z - bin.rim.z);
          const perfect = !pa.rimHit;
          const fun = (ACT.basquete.fun + dist * PAPER_DIST_BONUS) * (bin.hoop ? 1.5 : 1);
          g.addFun(this.w, fun, perfect ? (dist > 6 ? 'DE LONGE!' : 'SWISH!') : 'cesta', bin.rim);
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
      g.office.collide(pos, 0.07);
      if (before.distanceToSquared(pos) > 1e-6 && pos.y < 1.2) {
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
          g.addFun(this.w, BASQUETE_MISS_FUN);
          g.audio.play3D('thud', pos, 0.7);
          g.juice.text(pos.clone().setY(0.7), 'errou!', 'ft-bad', 1.0);
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
    const peeking = inp.isDown('Mouse2') || this.clutchPeek > 0;
    this.peek += ((peeking ? 1 : 0) - this.peek) * Math.min(1, realDt * (peeking ? 9 : 12));
    this.clutchPeek = Math.max(0, this.clutchPeek - realDt);
    comp.frozen = this.peek > 0.5;
    if (!comp.frozen && !this.aiming) this.screenRay(p.desk.screen, 1024, 640, this.mouseCanvas);
    const sInp: ScreenInput = {
      x: this.mouseCanvas.x, y: this.mouseCanvas.y,
      down: inp.isDown('Mouse0'), pressed: inp.pressed('Mouse0'), released: inp.released('Mouse0'),
      key: (c) => inp.isDown(c), keyPressed: (c) => inp.pressed(c),
    };
    if (inp.pressed('Space') && !comp.frozen) comp.altTab(g.time);
    comp.update(dt, g.time, sInp);
    if (inp.pressed('KeyH')) g.toggleHeadphones();
    if (inp.pressed('KeyG') && this.eating <= 0 && !this.aiming) {
      if (g.stock.lanche > 0) {
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
        g.addSus(p, ACT.lanche.sus);
        g.instinct += ACT.lanche.instinct;
        p.contribution += ACT.lanche.instinct;
        p.crumbs++;
        p.desk.crumbs.visible = true;
        g.noise(p.desk.seat, ACT.lanche.noise, p);
        if (p.crumbs >= 2) comp.toast('🧹 migalhas na mesa! segure C para limpar');
      }
    }
    if (inp.isDown('KeyC') && p.crumbs > 0) {
      this.cleaning += dt;
      if (this.cleaning >= 1.5) {
        this.cleaning = 0;
        p.crumbs = 0;
        p.desk.crumbs.visible = false;
        g.audio.play('swish', 0.4);
        comp.toast('✨ mesa limpinha');
      }
    } else this.cleaning = 0;
    if (inp.pressed('KeyB') && !this.aiming && this.eating <= 0) {
      if (!g.day.unlocked.includes('basquete')) comp.toast('🔒 basquete bloqueado hoje');
      else if (g.stock.basquete <= 0) comp.toast('📄 sem folhas para amassar');
      else {
        this.aiming = true;
        this.aimT = Math.random() * 3;
      }
    }
    if (this.aiming) {
      this.aimT += dt;
      const pw = 0.5 - 0.5 * Math.cos(this.aimT * 2.8);
      g.hud.meter('🏀 solte B na zona verde', pw, [0.43, 0.57]);
      if (!inp.isDown('KeyB')) {
        this.aiming = false;
        g.hud.meter(null);
        this.deskThrow(pw);
      }
    }
    if (inp.pressed('KeyE') && this.peek < 0.3 && !this.aiming) {
      this.setMode('walk');
      g.audio.play('click', 0.5);
      this.ball.impulse(0.5);
      if (comp.forbiddenOpen) g.hud.popup('warn', 'JOGO ABERTO NA MESA!', 'se o chefe passar, ele vê');
    }
    g.hud.prompt(this.cleaning > 0 ? '🧹 limpando…' : null, this.cleaning / 1.5);
    this.ball.update(dt);
  }

  private deskThrow(power: number) {
    const p = this.w;
    const start = this.g.r.camera.position.clone().add(new THREE.Vector3(0, -0.15, 0));
    const bin = p.desk.bin.clone();
    const dir = new THREE.Vector3().subVectors(bin, start).setY(0).normalize();
    const target = bin.clone().addScaledVector(dir, (power - 0.5) * 3.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08));
    const T = 0.8;
    const vel = new THREE.Vector3().subVectors(target, start).sub(new THREE.Vector3(0, -9.8 * 0.5 * T * T, 0)).divideScalar(T);
    this.throwPaper(start, vel);
  }

  /** Raio do mouse até uma tela (uv → pixels do canvas). */
  private screenRay(mesh: THREE.Object3D, w: number, h: number, out: { x: number; y: number }) {
    const inp = this.g.input;
    const ndc = new THREE.Vector2((inp.mouseX / window.innerWidth) * 2 - 1, -(inp.mouseY / window.innerHeight) * 2 + 1);
    this.raycaster.far = 20;
    this.raycaster.setFromCamera(ndc, this.g.r.camera);
    const hit = this.raycaster.intersectObject(mesh, false)[0];
    if (hit?.uv) {
      out.x = hit.uv.x * w;
      out.y = (1 - hit.uv.y) * h;
    }
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
    if (sp > 0.3) ride.chair.group.rotation.y = lerpAngle(ride.chair.group.rotation.y, Math.atan2(v.x, v.z) + Math.PI, Math.min(1, dt * 4));
    if (sp > 2 && Math.random() < dt * 5) g.audio.play3D('squeak', b.pos, 0.35);
    b.yaw = lerpAngle(b.yaw, Math.atan2(v.x, v.z), Math.min(1, dt * 6));
    b.hoverHeight = 0.94;
    ride.t -= dt;
    if (sp > 2.5 && ride.earned < ACT.cadeira.funMax) {
      const v2 = Math.min(ACT.cadeira.fun * dt, ACT.cadeira.funMax - ride.earned);
      ride.earned += v2;
      g.addFun(this.w, v2);
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
  /** Altura dos olhos (centro da bola + visor). */
  private eyePos(out = new THREE.Vector3()) {
    const b = this.ball;
    return out.set(b.pos.x, b.hover.position.y * b.root.scale.y + 0.47, b.pos.z);
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
    const p = this.w;
    const b = this.ball;
    const k = Math.min(1, realDt * 10);
    b.root.visible = false;
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
      const d = p.desk;
      const head = d.seat.clone().setY(1.12);
      const screenPos = d.screenCenter.clone().addScaledVector(d.screenNormal, 0.8);
      screenPos.y = d.screenCenter.y + 0.02;
      const roomLook = head.clone().addScaledVector(d.screenNormal, 6).setY(1.0);
      this.aimCam += ((this.aiming || this.throwWatch > 0 ? 1 : 0) - this.aimCam) * Math.min(1, realDt * 8);
      const look = d.screenCenter.clone().lerp(roomLook, this.peek).lerp(d.bin.clone(), this.aimCam * (1 - this.peek));
      const calm = (1 - this.peek) * (1 - this.aimCam);
      const side = new THREE.Vector3(-d.screenNormal.z, 0, d.screenNormal.x);
      const mx = (g.input.mouseX / window.innerWidth - 0.5) * 2;
      const my = (g.input.mouseY / window.innerHeight - 0.5) * 2;
      screenPos.addScaledVector(side, mx * 0.025 * calm).add(new THREE.Vector3(0, -my * 0.015 * calm + Math.sin(g.time * 1.3) * 0.006 * calm, 0));
      // espiar/mirar: a cabeça volta para trás na cadeira e gira
      const pos = screenPos.clone().lerp(head, Math.max(this.peek, this.aimCam));
      this.camPos.lerp(pos, Math.min(1, realDt * 9));
      this.camLook.lerp(look, Math.min(1, realDt * 9));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      g.r.baseFov = 55 + this.peek * 12;
      return;
    }
    // andar, cadeira, soneca, banheiro, fantasma: olhar livre com o mouse
    let eye: THREE.Vector3;
    if (this.mode === 'nap') eye = b.pos.clone().setY(0.92);
    else if (this.mode === 'hide') eye = this.hideBath!.peek.clone();
    else if (this.mode === 'chair') eye = b.pos.clone().setY(1.3);
    else eye = this.eyePos();
    // balanço da cabeça ao andar
    const sp = this.mode === 'walk' || this.mode === 'ghost' ? new THREE.Vector2(b.velocity.x, b.velocity.z).length() : 0;
    this.bobT += realDt * (5 + sp * 2.2);
    const bobAmt = Math.min(1, sp / 4) * (this.jumpY > 0.01 ? 0 : 1);
    eye.y += Math.abs(Math.sin(this.bobT)) * 0.045 * bobAmt;
    const sideBob = Math.sin(this.bobT) * 0.02 * bobAmt;
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
    this.view.position.set(Math.sin(this.bobT) * 0.012 * bob, -Math.abs(Math.cos(this.bobT)) * 0.012 * bob, 0);
    // café balança conforme derrama
    if (this.carryMesh) {
      this.carryMesh.rotation.z = Math.sin(g.time * 9) * this.spill * 0.002 + (this.ball.velocity.x - this.prevVel.x) * 0.02;
    }
    // bolinha de papel na mão enquanto carrega o arremesso
    this.paperHand.visible = this.charging;
    if (this.charging) this.paperHand.position.set(0.24, -0.2 + this.charge * 0.05, -0.45 + this.charge * 0.12);
    void realDt;
  }
}
