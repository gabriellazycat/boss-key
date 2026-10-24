import * as THREE from 'three';
import { B, ACT, CHAIR, PEBOLIM_GOAL_FUN, PAPER_DIST_BONUS, BASQUETE_MISS_FUN } from '../balance';
import { MAP, type RaceChair } from '../world/Office';
import type { ScreenInput } from '../apps/common';
import type { Game } from './Game';
import type { Worker } from './Worker';
import { lerpAngle } from './Boss';

export type Mode = 'walk' | 'seated' | 'arcade' | 'foosball' | 'chair' | 'nap' | 'ghost' | 'cinematic';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  r: number;
  label: string;
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

const BOUNDS = { minX: -MAP.ox + 0.4, maxX: MAP.ox - 0.4, minZ: -MAP.oz + 0.4, maxZ: MAP.oz - 0.4 };

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
  private arcadeMouse = { x: 256, y: 200 };
  arcadeIdx = 0;
  private chairRide: { chair: RaceChair; t: number; earned: number } | null = null;
  chairCd = 0;
  private foos = { x: 0, v: 0, z: 0, rally: 0, you: 0, bot: 0, state: 'serve' as 'serve' | 'play' | 'goal', t: 0, kick: 0 };
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
    this.camYaw = d.seatYaw + Math.PI - 0.75 * Math.sign(d.screenNormal.x);
    this.camPitch = 0.3;
    this.intro = 2.4;
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
        this.camPitch = 0.25;
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
    } else if (m === 'arcade') {
      g.input.unlock();
      g.hud.controls('arcade');
    } else if (m === 'foosball') {
      g.input.lock();
      g.hud.controls('foosball');
    } else if (m === 'chair') {
      g.input.lock();
      g.hud.controls('chair');
    } else if (m === 'nap') {
      g.input.lock();
      g.hud.controls('nap');
    } else if (m === 'cinematic') g.hud.controls('none');
    g.r.canvas.classList.toggle('nocursor', m === 'seated' || m === 'arcade');
    g.hud.crosshair(m === 'walk' ? 'idle' : null);
    if (m !== 'walk') g.hud.prompt(null);
  }

  /** Atividade física atual (para o flagrante). */
  get physicalAct(): string | null {
    if (this.mode === 'arcade') return 'arcade';
    if (this.mode === 'foosball') return 'pebolim';
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
    this.ball.carryAnchor.add(m);
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
        ok: () => !this.carrying,
        act: () => {
          this.setMode('seated');
          g.audio.play('click', 0.6);
        },
      },
      {
        id: 'coffee', pos: P.coffee.clone().setZ(P.coffee.z - 0.6), r: 1.4, hold: 1.2,
        label: this.carrying ? 'mãos ocupadas' : g.coffeeMachineCd > 0 ? `☕ esquentando… ${Math.ceil(g.coffeeMachineCd)} s` : g.coffeePlayerCd > 0 ? `☕ você pegou há pouco (${Math.ceil(g.coffeePlayerCd)} s)` : '<kbd>E</kbd>Pegar café (segure)',
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
        label: '<kbd>E</kbd>Beber água (esfria a cabeça)', ok: () => p.heat > 5,
        act: () => {
          p.heat = Math.max(0, p.heat - 40);
          g.audio.play('plop', 0.8);
          g.juice.text(this.ball.headWorld().add(new THREE.Vector3(0, 0.7, 0)), '💧 refrescado', 'ft-small', 1);
        },
      },
    ];
    // fliperamas
    o.arcades.forEach((a, i) => {
      const spot = g.bots.spot(`arcade${i + 1}`);
      list.push({
        id: `arcade${i}`, pos: a.stand, r: 1.5, hold: 0, obj: a.click,
        label: spot.busy ? `${spot.busy.name} está jogando` : st.arcade > 0 || g.arcadeApp.state === 'play' ? `<kbd>E</kbd>Jogar fliperama (${st.arcade} fichas)` : 'sem fichas hoje',
        ok: () => !spot.busy && !this.carrying && (st.arcade > 0 || g.arcadeApp.state === 'play'),
        act: () => {
          this.arcadeIdx = i;
          spot.busy = p;
          this.setMode('arcade');
          g.audio.play('confirm', 0.6);
        },
      });
    });
    // pebolim
    list.push({
      id: 'foos', pos: o.foosball.stands[0], r: 1.4, hold: 0,
      label: g.earnedLeft(p, 'pebolim') > 0 ? '<kbd>E</kbd>Jogar pebolim' : 'cansou do pebolim por hoje',
      ok: () => !this.carrying && g.earnedLeft(p, 'pebolim') > 0,
      act: () => {
        this.foos = { x: 0, v: 0, z: 0, rally: 0, you: 0, bot: 0, state: 'serve', t: 0.8, kick: 0 };
        this.setMode('foosball');
      },
    });
    // cadeiras de corrida
    for (const rc of o.raceChairs) {
      list.push({
        id: `chair${rc.group.id}`, pos: rc.group.position, r: 1.2, hold: 0, obj: [rc.group],
        label: st.cadeira <= 0 ? 'sem corridas por hoje' : this.chairCd > 0 ? `cadeira esfriando (${Math.ceil(this.chairCd)} s)` : '<kbd>E</kbd>Corrida de cadeira!',
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
      ok: () => !sofaSpot.busy && !this.carrying && g.earnedLeft(p, 'soneca') > 0,
      act: () => {
        sofaSpot.busy = p;
        this.napT = 0;
        this.ball.setPos(o.couch.seat.x, o.couch.seat.z);
        this.setMode('nap');
        g.audio.play('sigh', 0.8);
      },
    });
    // máquina de lanche
    list.push({
      id: 'vend', pos: g.bots.spot('maquina').pos, r: 1.3, hold: 0,
      label: st.maquina > 0 ? `<kbd>E</kbd>Comprar lanche (${st.maquina})` : 'máquina sem troco',
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
    this.chairCd = Math.max(0, this.chairCd - dt);
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
      case 'arcade':
        this.updateArcade(dt);
        break;
      case 'foosball':
        this.updateFoosball(dt);
        break;
      case 'chair':
        this.updateChair(dt);
        break;
      case 'nap':
        this.updateNap(dt);
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
      this.camPitch = clampPitch ? THREE.MathUtils.clamp(this.camPitch + inp.dy * 0.002, -0.35, 1.0) : this.camPitch + inp.dy * 0.002;
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
    if (rate > 3 && Math.random() < dt * 8) g.juice.crumbs(b.carryAnchor.getWorldPosition(new THREE.Vector3()), 2, '#5a3418');
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
    g.hud.prompt(best.label, this.holdId === best.id ? this.holdT / best.hold : 0);
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
    const start = this.ball.headWorld().add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(dir.clone().setY(0).normalize(), 0.3);
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

  // ------------------------------------------------------------------ fliperama
  private updateArcade(dt: number) {
    const g = this.g;
    const inp = g.input;
    const a = g.office.arcades[this.arcadeIdx];
    const scr = a.click[0];
    this.screenRay(scr, 512, 400, this.arcadeMouse);
    const app = g.arcadeApp;
    app.update(dt, {
      x: this.arcadeMouse.x, y: this.arcadeMouse.y,
      down: inp.isDown('Mouse0'), pressed: inp.pressed('Mouse0'), released: inp.released('Mouse0'),
      key: (c) => inp.isDown(c), keyPressed: (c) => inp.pressed(c),
    });
    this.ball.setPos(a.stand.x, a.stand.z);
    this.ball.yaw = a.yaw - Math.PI;
    if (app.state === 'play' && Math.random() < dt * 4) this.ball.impulse(0.12);
    this.ball.update(dt);
    if (inp.pressed('KeyE')) this.leaveArcade();
  }

  leaveArcade() {
    const g = this.g;
    g.bots.spot(`arcade${this.arcadeIdx + 1}`).busy = null;
    if (g.arcadeApp.state === 'play') g.arcadeApp.abort();
    this.setMode('walk');
  }

  // ------------------------------------------------------------------ pebolim
  private updateFoosball(dt: number) {
    const g = this.g;
    const inp = g.input;
    const f = this.foos;
    const fb = g.office.foosball;
    const b = this.ball;
    b.setPos(fb.stands[0].x, fb.stands[0].z);
    b.yaw = Math.PI;
    f.t -= dt;
    f.kick = Math.max(0, f.kick - dt * 5);
    const kickNow = inp.pressed('Mouse0') || inp.pressed('Space');
    // você defende o lado +x (direita)
    if (f.state === 'serve' && f.t <= 0) {
      f.state = 'play';
      f.x = 0;
      f.v = (Math.random() < 0.5 ? 1 : -1) * 0.55;
      f.z = 0;
    }
    if (f.state === 'play') {
      f.x += f.v * dt;
      f.z = Math.sin(f.x * 9 + f.rally) * 0.22;
      const zoneMin = 0.42;
      const zoneMax = 0.6;
      if (kickNow) {
        f.kick = 1;
        if (f.v > 0 && f.x > zoneMin - 0.06 && f.x < zoneMax) {
          const perfect = f.x > 0.47 && f.x < 0.56;
          f.v = -(0.6 + f.rally * 0.06 + (perfect ? 0.35 : 0));
          f.rally++;
          g.addFun(this.w, ACT.pebolim.fun * (perfect ? 2 : 1), undefined, fb.center);
          g.audio.play3D('thud', fb.center, 0.9);
          g.juice.sparks(this.foosWorld(f.x, f.z), perfect ? '#ffd23f' : '#ffffff', perfect ? 16 : 6, 2);
          if (perfect) g.juice.text(fb.center.clone().add(new THREE.Vector3(0, 0.5, 0)), 'CHUTAÇO!', 'ft-small', 0.8);
        }
      }
      // bot devolve
      if (f.v < 0 && f.x < -0.5) {
        const chance = 0.82 - f.rally * 0.04;
        if (Math.random() < chance) {
          f.v = 0.55 + f.rally * 0.05 + Math.random() * 0.2;
          g.audio.play3D('thud', fb.center, 0.8);
        } else f.v *= 1.15;
      }
      if (f.x < -0.68) this.foosGoal(true);
      if (f.x > 0.68) this.foosGoal(false);
    }
    // visual: bola e varetas
    fb.ball.position.set(f.state === 'play' ? f.x : 0, 1.0, f.state === 'play' ? f.z : 0);
    fb.rods.forEach((r, i) => {
      const mine = i % 2 === 1;
      r.rotation.z = mine ? -f.kick * 1.4 : Math.sin(g.time * 6 + i) * 0.3;
      r.position.z = mine ? THREE.MathUtils.clamp(f.z, -0.2, 0.2) * 0.8 : Math.sin(g.time * 2 + i) * 0.1;
    });
    g.hud.meter(`⚽ ${f.you} × ${f.bot} — clique quando a bola chegar na faixa`, THREE.MathUtils.clamp((f.x + 0.68) / 1.36, 0, 1), [0.81, 0.94]);
    if (Math.random() < dt * 3) b.impulse(0.1);
    b.update(dt);
    if (inp.pressed('KeyE') || g.earnedLeft(this.w, 'pebolim') <= 0) {
      g.hud.meter(null);
      fb.ball.position.set(0, 1.0, 0);
      this.setMode('walk');
    }
  }

  private foosWorld(x: number, z: number) {
    const c = this.g.office.foosball.center;
    return new THREE.Vector3(c.x + x, c.y, c.z + z);
  }

  private foosGoal(you: boolean) {
    const g = this.g;
    const f = this.foos;
    f.state = 'goal';
    f.t = 1.2;
    f.rally = 0;
    if (you) {
      f.you++;
      g.addFun(this.w, PEBOLIM_GOAL_FUN, 'GOL!', g.office.foosball.center);
      g.juice.confetti(g.office.foosball.center.clone().add(new THREE.Vector3(0, 0.3, 0)), 50, 3);
      g.audio.play('fanfare', 0.5);
      g.noise(g.office.foosball.center, 8, this.w);
    } else {
      f.bot++;
      g.audio.play('miss', 0.6);
    }
    setTimeout(() => {
      if (this.mode === 'foosball') f.state = 'serve';
      f.t = 0.4;
    }, 900);
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
  updateCamera(realDt: number) {
    const g = this.g;
    const cam = g.r.camera;
    const p = this.w;
    const b = this.ball;
    const k = Math.min(1, realDt * 10);
    if (this.mode === 'cinematic' && this.cine) {
      const boss = g.bosses.find((x) => x.ball.root.visible && x.busy) ?? g.bosses[0];
      const look = boss.ball.headWorld();
      const mid = look.clone().lerp(b.headWorld(), 0.45);
      const side = new THREE.Vector3().subVectors(look, b.pos).setY(0).normalize();
      const perp = new THREE.Vector3(-side.z, 0, side.x);
      // escolhe o lado com visão livre
      const cands = [3.2, -3.2, 2.2, -2.2].map((s) => mid.clone().addScaledVector(perp, s).add(new THREE.Vector3(0, 0.9, 0)));
      const free = (q: THREE.Vector3) =>
        Math.abs(q.x) < MAP.ox - 0.4 && Math.abs(q.z) < MAP.oz - 0.4 && g.office.lineOfSight(q, mid) && !g.office.tallColliders.some((c) => q.x > c.minX - 0.3 && q.x < c.maxX + 0.3 && q.z > c.minZ - 0.3 && q.z < c.maxZ + 0.3);
      const from = cands.find(free) ?? cands[0];
      this.camPos.lerp(from, k * 0.5);
      this.camLook.lerp(mid, k);
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      g.r.baseFov = 52 - (1 - this.cine.t / 2.8) * 12;
      b.root.visible = true;
      return;
    }
    b.root.visible = true;
    if (this.mode === 'seated') {
      const d = p.desk;
      const screenPos = d.screenCenter.clone().addScaledVector(d.screenNormal, 0.8);
      screenPos.y = d.screenCenter.y + 0.02;
      const peekPos = d.screenCenter.clone().addScaledVector(d.screenNormal, 1.05).setY(1.75);
      const roomLook = d.screenCenter.clone().addScaledVector(d.screenNormal, 6).setY(0.4);
      this.aimCam += ((this.aiming || this.throwWatch > 0 ? 1 : 0) - this.aimCam) * Math.min(1, realDt * 8);
      const look = d.screenCenter.clone().lerp(roomLook, this.peek).lerp(d.bin.clone(), this.aimCam * (1 - this.peek));
      const aimPos = d.seat.clone().addScaledVector(new THREE.Vector3().subVectors(d.seat, d.bin).setY(0).normalize(), 0.7).setY(1.85);
      const pos = screenPos.clone().lerp(peekPos, this.peek).lerp(aimPos, this.aimCam * (1 - this.peek));
      this.camPos.lerp(pos, Math.min(1, realDt * 9));
      this.camLook.lerp(look, Math.min(1, realDt * 9));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      g.r.baseFov = 55;
      b.root.visible = this.camPos.distanceTo(screenPos) > 1.2 && this.peek < 0.5;
      return;
    }
    if (this.mode === 'arcade') {
      const a = g.office.arcades[this.arcadeIdx];
      const pos = a.screenCenter.clone().addScaledVector(a.screenNormal, 0.95).add(new THREE.Vector3(0, 0.12, 0));
      this.camPos.lerp(pos, Math.min(1, realDt * 7));
      this.camLook.lerp(a.screenCenter.clone().add(new THREE.Vector3(0, -0.08, 0)), Math.min(1, realDt * 9));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      g.r.baseFov = 55;
      b.root.visible = false;
      return;
    }
    if (this.mode === 'foosball') {
      const c = g.office.foosball.center;
      const pos = c.clone().add(new THREE.Vector3(0.0, 1.35, 1.25));
      this.camPos.lerp(pos, Math.min(1, realDt * 6));
      this.camLook.lerp(c, Math.min(1, realDt * 8));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      g.r.baseFov = 55;
      return;
    }
    if (this.mode === 'nap') {
      const t = g.time * 0.15;
      const c = b.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
      const pos = c.clone().add(new THREE.Vector3(Math.sin(this.camYaw) * 2.6, 1.5, Math.cos(this.camYaw) * 2.6 - 0.5));
      void t;
      this.camPos.lerp(pos, Math.min(1, realDt * 4));
      this.camLook.lerp(c, Math.min(1, realDt * 6));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      g.r.baseFov = 58;
      return;
    }
    // 3ª pessoa por cima do ombro (andar, cadeira, fantasma)
    const head = b.pos.clone().add(new THREE.Vector3(0, this.mode === 'ghost' ? 1.75 : 1.3, 0));
    const dist = this.mode === 'chair' ? 3.8 : 3.5;
    const cp = Math.cos(this.camPitch);
    const back = new THREE.Vector3(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const pivot = head.clone().addScaledVector(right, this.mode === 'walk' ? 0.62 : 0).add(new THREE.Vector3(0, 0.2, 0));
    let want = pivot.clone().addScaledVector(back, dist);
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const q = pivot.clone().lerp(want, i / steps);
      if (g.office.tallColliders.some((c) => q.x > c.minX - 0.22 && q.x < c.maxX + 0.22 && q.z > c.minZ - 0.22 && q.z < c.maxZ + 0.22) || q.y > MAP.wallH - 0.2) {
        want = pivot.clone().lerp(want, Math.max(0.12, (i - 1.5) / steps));
        break;
      }
    }
    want.y = THREE.MathUtils.clamp(want.y, 0.35, MAP.wallH - 0.15);
    want.x = THREE.MathUtils.clamp(want.x, -MAP.ox + 0.25, MAP.ox - 0.25);
    want.z = THREE.MathUtils.clamp(want.z, -MAP.oz + 0.25, MAP.oz - 0.25);
    const lookAt = pivot.clone().addScaledVector(back, -6);
    if (this.intro > 0) {
      // abertura: desce do alto do salão até atrás do jogador
      this.intro = Math.max(0, this.intro - realDt);
      const t = 1 - this.intro / 2.4;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const from = new THREE.Vector3(0, 2.2, 1.5);
      const fromLook = b.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
      this.camPos.copy(from.lerp(want, e));
      this.camLook.copy(fromLook.lerp(lookAt, e * e));
    } else {
      this.camPos.lerp(want, Math.min(1, realDt * 16));
      this.camLook.lerp(lookAt, Math.min(1, realDt * 20));
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    g.r.baseFov = this.mode === 'chair' ? 66 + this.chairSpeed * 1.5 : 62;
    // não deixa a própria bola tapar a visão
    b.root.visible = this.camPos.distanceTo(head) > 0.75;
  }
}
