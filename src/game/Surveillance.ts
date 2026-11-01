import * as THREE from 'three';
import { SURV, type BigMissionId, type SurvKind } from '../balance';
import { W, box } from '../world/Office';
import type { Interactable } from './Player';
import type { Worker } from './Worker';
import type { Game } from './Game';

interface Cam {
  group: THREE.Group;
  cone: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  lamp: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  base: number;
  /** Defasagem do ciclo (as duas câmeras não ficam vermelhas juntas). */
  phase: number;
  yaw: number;
  /** Semáforo pendurado abaixo da câmera (fixo, de frente para o salão). */
  tl: THREE.Group;
  /** Lentes do semáforo: [verde, amarela, vermelha]. */
  lenses: THREE.MeshBasicMaterial[];
  /** Brilho suave na frente da lente acesa. */
  halo: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  /** Contorno do setor no chão (mesma cor do cone, mais viva). */
  edge: THREE.Group;
  edgeMat: THREE.MeshBasicMaterial;
}

const WHITE = new THREE.Color('#ffffff');
const LENS_LIT =['#3ddc97', '#ffd23f', '#ff2a2a'];
const LENS_OFF = ['#0c2a1d', '#33290a', '#340d0d'];
/** y de cada lente no semáforo (de baixo para cima: verde, amarela, vermelha). */
const LENS_Y = [-0.14, 0, 0.14];
let haloTex: THREE.CanvasTexture | null = null;
function getHaloTex() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

/** Na rede: [sensor desligado (s), porta destrancada (s), código achado, lugares revistados (bits)]. */
export type SurvNet = [number, number, 0 | 1, number];

/**
 * Vigilância do chefe (v0.10): um equipamento novo por dia, sempre VISÍVEL, com AVISO e CONTRA-ATAQUE — perder é culpa
 * do plano, nunca de algo que não dava para ver.
 * - Câmera semáforo (dia 2+): cone no chão que varre o salão; verde = livre, amarelo pisca 1 s, vermelho = grava.
 *   Exposto (ou com item da missão) no vermelho: Suspeita; com item, o chefe vem ver. Contra: passar no verde, fita.
 * - Sensor na porta da sala dele (dia 3+): entrar com ele ligado bipa e o chefe volta de onde estiver.
 *   Contra: minigame de fios no painel ao lado da porta (desliga por `sensorOff` s).
 * - Sala trancada (dia 4+): a porta pede um código de 4 dígitos, escondido em 1 de 3 lugares. Vira uma etapa a mais
 *   das missões que entram na sala dele.
 */
export class Surveillance {
  camsOn = false;
  sensorOn = false;
  lockOn = false;
  private cams: Cam[] = [];
  private sensorOffUntil = -1;
  private unlockUntil = -1;
  codeKnown = false;
  code = '0000';
  codeSpot = 0;
  searched = 0;
  private beepT = 0;
  private sensorLed: THREE.MeshBasicMaterial;
  private lockLed: THREE.MeshBasicMaterial;
  /** Lugares onde o código da porta pode estar. */
  readonly codeSpots = [
    { name: 'embaixo da mesa de reunião', pos: W(7.6, 11.5), mark: W(8.1, 11.5, 1.2) },
    { name: 'bebedouro', pos: W(1.35, 20.4), mark: W(0.5, 20.9, 1.7) },
    { name: 'extintor do corredor', pos: W(17.6, 5.1), mark: W(17.6, 4.2, 1.6) },
  ];
  private readonly doorKeypad = W(10, 4.85);
  private readonly doorBox = { minX: W(9.1, 0).x, maxX: W(10.9, 0).x, minZ: W(0, 3.6).z, maxZ: W(0, 4.25).z };

  constructor(private g: Game) {
    const mk = (x: number, z: number, base: number, phase: number) => {
      // câmera de segurança: placa no teto, haste, cabeça giratória (corpo + quebra-sol + lente de vidro escuro)
      const group = new THREE.Group();
      const white = new THREE.MeshStandardMaterial({ color: '#eceff3', roughness: 0.4, metalness: 0.1 });
      const dark = new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.45, metalness: 0.3 });
      const glass = new THREE.MeshStandardMaterial({ color: '#0a1020', roughness: 0.05, metalness: 0.8 });
      const lamp = new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false });
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.025, 16), dark);
      plate.position.y = 0.16;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), dark);
      stem.position.y = 0.09;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), dark);
      const body = box(0.15, 0.14, 0.36, white, 0.045);
      body.position.set(0, -0.06, 0.12);
      const shade = box(0.19, 0.018, 0.34, white, 0.008);
      shade.position.set(0, 0.025, 0.15);
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.1, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }));
      hood.rotation.x = Math.PI / 2;
      hood.position.set(0, -0.06, 0.34);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.065, 18), glass);
      lens.position.set(0, -0.06, 0.296);
      const shine = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8), new THREE.MeshBasicMaterial({ color: '#7fb8ff', toneMapped: false }));
      shine.position.set(-0.025, -0.035, 0.298);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), lamp);
      led.position.set(0.05, -0.005, 0.27);
      group.add(plate, stem, ball, body, shade, hood, lens, shine, led);
      group.position.copy(W(x, z, 2.85));
      g.r.scene.add(group);
      // semáforo: caixa escura pendurada na mesma haste, virada para o centro do salão (não gira com a câmera)
      const tl = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), dark);
      rod.position.y = 0.33;
      const housing = box(0.2, 0.46, 0.1, new THREE.MeshStandardMaterial({ color: '#1b1e25', roughness: 0.5, metalness: 0.2 }), 0.03);
      tl.add(rod, housing);
      const lenses: THREE.MeshBasicMaterial[] = [];
      const ringM = new THREE.MeshStandardMaterial({ color: '#0d0f14', roughness: 0.6, side: THREE.DoubleSide });
      LENS_Y.forEach((ly, i) => {
        const lm = new THREE.MeshBasicMaterial({ color: LENS_OFF[i], toneMapped: false });
        lenses.push(lm);
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), lm);
        l.position.set(0, ly, 0.052);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.044, 0.06, 16), ringM);
        ring.position.set(0, ly, 0.051);
        const brow = box(0.12, 0.012, 0.05, new THREE.MeshStandardMaterial({ color: '#0d0f14', roughness: 0.6 }), 0.004);
        brow.position.set(0, ly + 0.055, 0.075);
        tl.add(l, ring, brow);
      });
      const haloMat = new THREE.MeshBasicMaterial({ map: getHaloTex(), color: '#3ddc97', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), haloMat);
      halo.position.set(0, LENS_Y[0], 0.07);
      halo.renderOrder = 6;
      halo.userData.noAO = true;
      tl.add(halo);
      // grande o bastante para ler a cor de qualquer mesa do salão
      tl.scale.setScalar(1.6);
      tl.position.copy(W(x, z, 2.3));
      tl.lookAt(W(10, 12, 2.38));
      g.r.scene.add(tl);
      // cone no chão + contorno (arco e as duas bordas radiais)
      const mat = new THREE.MeshBasicMaterial({ color: '#3ddc97', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
      const cone = new THREE.Mesh(new THREE.CircleGeometry(SURV.camRange, 28, -SURV.camFov / 2, SURV.camFov), mat);
      cone.rotation.x = -Math.PI / 2;
      cone.position.copy(W(x, z, 0.03));
      cone.userData.noAO = true;
      cone.renderOrder = 3;
      const edgeMat = new THREE.MeshBasicMaterial({ color: '#7dffc0', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const edge = new THREE.Group();
      const R = SURV.camRange;
      const lw = 0.08;
      edge.add(new THREE.Mesh(new THREE.RingGeometry(R - lw, R, 40, 1, -SURV.camFov / 2, SURV.camFov), edgeMat));
      for (const a of [-SURV.camFov / 2, SURV.camFov / 2]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(R, lw), edgeMat);
        s.position.set((Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, 0);
        s.rotation.z = a;
        edge.add(s);
      }
      edge.position.z = 0.004;
      edge.traverse((m) => {
        m.renderOrder = 4;
        m.userData.noAO = true;
      });
      cone.add(edge);
      g.r.scene.add(cone);
      this.cams.push({ group, cone, mat, lamp, pos: W(x, z), base, phase, yaw: base, tl, lenses, halo, haloMat, edge, edgeMat });
    };
    // cantos opostos do salão, varrendo para dentro
    mk(1.0, 5.4, Math.PI * 0.25, 0);
    mk(19.0, 18.6, Math.PI * 1.25, 0.5);
    // sensor e fechadura: luzinhas ao lado da porta do chefe
    this.sensorLed = new THREE.MeshBasicMaterial({ color: '#333', toneMapped: false });
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), this.sensorLed);
    s.position.copy(W(11.2, 4.1, 1.45));
    g.r.scene.add(s);
    this.lockLed = new THREE.MeshBasicMaterial({ color: '#333', toneMapped: false });
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.04), this.lockLed);
    k.position.copy(W(9.0, 4.1, 1.35));
    g.r.scene.add(k);
    this.setVisible();
  }

  /** O que vale hoje (introdução gradual: um equipamento por dia). */
  /** Equipamentos de hoje (sorteados com a semente da run: `survKinds`). */
  resetDay(_day: number, kinds: SurvKind[]) {
    this.camsOn = kinds.includes('cam');
    this.sensorOn = kinds.includes('sensor');
    this.lockOn = kinds.includes('lock');
    this.sensorOffUntil = -1;
    this.unlockUntil = -1;
    this.codeKnown = false;
    this.searched = 0;
    if (this.g.auth) {
      this.code = String(1000 + Math.floor(Math.random() * 9000));
      this.codeSpot = Math.floor(Math.random() * this.codeSpots.length);
    }
    this.setVisible();
  }

  private setVisible() {
    for (const c of this.cams) {
      c.group.visible = this.camsOn;
      c.cone.visible = this.camsOn;
      c.tl.visible = this.camsOn;
    }
    this.sensorLed.color.set(this.sensorOn ? '#e5484d' : '#333');
    this.lockLed.color.set(this.lockOn ? '#ffd23f' : '#333');
  }

  /** Novidade do dia para o briefing do elevador (só no dia em que entra). */
  /** O que está ligado hoje, para o briefing do elevador (todo dia: a vigilância é sorteada). */
  briefing(): string | null {
    const say: string[] = [];
    if (this.camsOn) say.push('as <b>câmeras do salão</b> estão ligadas (luz vermelha: gravando)');
    if (this.sensorOn) say.push('a minha porta tem <b>sensor</b>');
    if (this.lockOn) say.push('a minha sala está com <b>fechadura de código</b>');
    return say.length ? `Hoje ${say.join(' e ')}. 😇` : null;
  }

  get sensorArmed() {
    return this.sensorOn && this.g.time >= this.sensorOffUntil;
  }
  get unlocked() {
    return !this.lockOn || this.g.time < this.unlockUntil;
  }

  /** Dá para entrar na sala do chefe agora (porta destrancada, ou você já está lá dentro)? */
  canEnterBossRoom() {
    return this.unlocked || this.g.office.inBossRoom(this.g.player.ball.pos);
  }

  /** Etapa extra das missões que entram na sala do chefe, com a sala trancada. */
  lockStep(big: BigMissionId): { at: number; label: string; solved: boolean } | null {
    if (!this.lockOn) return null;
    const at = big === 'grampeador' || big === 'papel' ? 1 : big === 'aquario' ? 0 : -1;
    if (at < 0) return null;
    return { at, label: 'achar o código da porta do chefe 🔒', solved: this.codeKnown };
  }

  codeMarkers() {
    const me = this.g.player.ball.pos;
    return this.codeSpots
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !(this.searched & (1 << i)))
      .map(({ s }) => ({ pos: s.mark, icon: '🔒', text: `${s.name} · ${Math.round(me.distanceTo(s.pos))} m` }));
  }

  /** Cenário: a porta trancada bloqueia o jogador (o chefe, clientes e quem entrega têm a chave). */
  collidePlayer(p: THREE.Vector3) {
    if (this.unlocked || this.g.tasks.deliveringToBoss()) return;
    const b = this.doorBox;
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ - 0.4 || p.z > b.maxZ + 0.4) return;
    // empurra para fora pelo lado mais perto
    p.z = p.z < (b.minZ + b.maxZ) / 2 ? Math.min(p.z, b.minZ - 0.4) : Math.max(p.z, b.maxZ + 0.4);
  }

  // ------------------------------------------------------------------ interações (local)
  interactables(): Interactable[] {
    const g = this.g;
    if (g.player.fired || g.phase !== 'play') return [];
    const list: Interactable[] = [];
    if (this.lockOn && !this.codeKnown)
      this.codeSpots.forEach((s, i) => {
        if (this.searched & (1 << i)) return;
        list.push({
          id: `sv-code${i}`, pos: s.pos, r: 1.4, hold: 0, prio: 1,
          mg: { kind: 'revirar', title: `🔎 Revistar: ${s.name}`, hint: 'o código da porta do chefe', opts: { found: i === this.codeSpot, icon: '🔢' } },
          label: `<kbd>E</kbd>🔒 Procurar o código no ${s.name}`, ok: () => true,
          act: (found) => this.request(found ? `sv:found${i}` : `sv:empty${i}`),
        });
      });
    if (this.lockOn && !this.unlocked && !g.office.inBossRoom(g.player.ball.pos))
      list.push({
        id: 'sv-keypad', pos: this.doorKeypad, r: 1.5, hold: 0, prio: 2,
        mg: { kind: 'digitar', title: '🔒 Fechadura da sala do chefe', opts: { code: this.code, show: this.codeKnown ? `código: ${this.code}` : 'código: ????' } },
        label: '<kbd>E</kbd>🔒 Digitar o código da porta', hint: this.codeKnown ? `você sabe: ${this.code}` : 'procure o código pelo escritório', ok: () => true,
        act: () => this.request('sv:unlock'),
      });
    // painel da porta: primeiro o código (se trancada); aberta, o mesmo painel desliga o sensor
    if (this.sensorOn && this.sensorArmed && this.unlocked)
      list.push({
        id: 'sv-sensor', pos: this.doorKeypad, r: 1.5, hold: 0, prio: 2,
        mg: { kind: 'fios', title: '📡 Desligar o sensor da porta', hint: `fica desligado ${SURV.sensorOff} s` },
        label: '<kbd>E</kbd>📡 Desligar o sensor da porta', hint: 'à vista de quem passa', ok: () => true,
        act: () => this.request('sv:sensor'),
      });
    return list;
  }

  private request(a: string) {
    const g = this.g;
    if (g.auth) this.hostAct(g.player, a);
    else g.net?.act(a as `m:${string}`);
  }

  hostAct(w: Worker, a: string) {
    const g = this.g;
    const pop = (k: 'good' | 'info', t: string, s: string) => (w.isPlayer ? g.hud.popup(k, t, s) : g.net?.pop(w, k, t, s));
    if (a.startsWith('sv:found') || a.startsWith('sv:empty')) {
      const i = Number(a.slice(8));
      this.searched |= 1 << i;
      if (a.startsWith('sv:found') && i === this.codeSpot) {
        this.codeKnown = true;
        pop('good', `🔢 CÓDIGO: ${this.code}`, 'a porta da sala do chefe abre com ele');
      } else pop('info', 'NADA AQUI', 'o código está em outro lugar');
    }
    if (a === 'sv:unlock') {
      this.unlockUntil = g.time + SURV.unlockTime;
      g.audio.play3D('click', this.doorKeypad, 1);
      pop('good', '🔓 ABERTA', `por ${SURV.unlockTime} s`);
    }
    if (a === 'sv:sensor') {
      this.sensorOffUntil = g.time + SURV.sensorOff;
      pop('good', '📡 SENSOR DESLIGADO', `por ${SURV.sensorOff} s`);
    }
  }

  /** Código descoberto por outro caminho (a entrega na mesa do chefe dá uma espiada). */
  reveal() {
    if (!this.lockOn || this.codeKnown) return;
    this.codeKnown = true;
    this.g.hud.popup('good', `🔢 VOCÊ VIU O CÓDIGO: ${this.code}`, 'espiando a agenda do chefe enquanto entregava');
  }

  // ------------------------------------------------------------------ simulação
  update(dt: number) {
    const g = this.g;
    this.sensorLed.color.set(!this.sensorOn ? '#333' : this.sensorArmed ? '#e5484d' : '#3ddc97');
    this.lockLed.color.set(!this.lockOn ? '#333' : this.unlocked ? '#3ddc97' : '#ffd23f');
    if (this.camsOn) this.updateCams(dt);
    // sensor: alguém entrou na sala com ele fora (e no andar) → bipa e ele volta correndo
    if (g.auth && this.sensorArmed) {
      const main = g.bosses[0];
      const intruder = g.workers.find((w) => (w.isPlayer || w.remote) && !w.fired && g.office.inBossRoom(w.ball.pos));
      this.beepT -= dt;
      if (intruder && main && main.out && !main.away && main.state !== 'chase' && this.beepT <= 0 && !g.tasks.deliveringToBoss()) {
        this.beepT = 6;
        g.audio.play3D('warn', W(10, 4, 2), 1);
        g.subtitle('[BIP BIP — sensor da porta do chefe]', W(10, 4));
        main.callBack();
        if (intruder.isPlayer) g.hud.popup('caught', '📡 SENSOR!', 'o chefe está voltando para a sala — saia já');
        else g.net?.pop(intruder, 'caught', '📡 SENSOR!', 'o chefe está voltando para a sala');
      }
    }
  }

  private updateCams(dt: number) {
    const g = this.g;
    const cyc = SURV.camGreen + SURV.camWarn + SURV.camRed;
    for (const c of this.cams) {
      c.yaw = c.base + Math.sin(g.time * SURV.camSweep + c.phase * 4) * SURV.camArc;
      c.cone.rotation.z = c.yaw - Math.PI / 2;
      c.group.rotation.y = c.yaw;
      const t = (g.time + c.phase * cyc) % cyc;
      const state = t < SURV.camGreen ? 'green' : t < SURV.camGreen + SURV.camWarn ? 'warn' : 'red';
      const col = state === 'green' ? '#3ddc97' : state === 'warn' ? (Math.floor(g.time * 8) % 2 ? '#ffd23f' : '#3ddc97') : '#ff2020';
      const blinkOff = state === 'warn' && Math.floor(g.time * 8) % 2 === 0;
      // lente acesa: 0 verde, 1 amarela, 2 vermelha (a amarela pisca)
      const lit = state === 'green' ? 0 : state === 'warn' ? (blinkOff ? -1 : 1) : 2;
      const shown = state === 'warn' ? '#ffd23f' : col;
      c.mat.color.set(shown);
      c.mat.opacity = state === 'red' ? 0.36 : blinkOff ? 0.16 : 0.3;
      c.edgeMat.color.set(shown).lerp(WHITE, 0.4);
      c.edgeMat.opacity = blinkOff ? 0.5 : 0.9;
      c.lamp.color.set(blinkOff ? '#33290a' : shown);
      for (let i = 0; i < 3; i++) c.lenses[i].color.set(i === lit ? LENS_LIT[i] : LENS_OFF[i]);
      c.halo.visible = lit >= 0;
      if (lit >= 0) {
        c.halo.position.y = LENS_Y[lit];
        c.haloMat.color.set(LENS_LIT[lit]);
      }
      if (state !== 'red' || g.shop.has('fita')) continue;
      // jogador local: exposto ou com item da missão dentro do cone vermelho
      const p = g.player;
      if (!p.fired && this.inCone(c, p.ball.pos)) {
        const item = g.items.heldBy(p);
        // v0.11: a mesma conta da chefia (taxa que dobra com a visão contínua); com item é grave
        if (g.cover === 'exposto' || item) g.seeing(p, null, item ? 'grave' : 'media', 'câmera do salão gravou', dt, c.group.position);
      }
      // host: alguém com item da missão no vermelho → o chefe vem ver
      if (g.auth)
        for (const w of g.workers) {
          if (!(w.isPlayer || w.remote) || w.fired || !g.items.heldBy(w) || !this.inCone(c, w.ball.pos)) continue;
          const main = g.bosses[0];
          if (main && !main.busy && !main.away) {
            main.startRonda([{ kind: 'point', p: w.ball.pos.clone(), stay: 2.5, why: 'evidence' }], 'câmera');
            g.subtitle('[alto-falante: "O QUE É ISSO NA CÂMERA?!"]', c.group.position);
          }
        }
    }
  }

  private inCone(c: Cam, p: THREE.Vector3) {
    const d = new THREE.Vector3(p.x - c.pos.x, 0, p.z - c.pos.z);
    const dist = d.length();
    if (dist > SURV.camRange || dist < 0.3) return false;
    const a = Math.atan2(d.z, d.x);
    const yawDir = -c.yaw + Math.PI / 2;
    const diff = Math.atan2(Math.sin(a - yawDir), Math.cos(a - yawDir));
    return Math.abs(diff) < SURV.camFov / 2 && this.g.office.lineOfSight(c.group.position, p.clone().setY(1));
  }

  // ------------------------------------------------------------------ multi
  netState(): SurvNet {
    const t = this.g.time;
    return [Math.max(0, Math.ceil(this.sensorOffUntil - t)), Math.max(0, Math.ceil(this.unlockUntil - t)), this.codeKnown ? 1 : 0, this.searched];
  }

  applyNet(s: SurvNet) {
    const t = this.g.time;
    this.sensorOffUntil = s[0] > 0 ? t + s[0] : -1;
    this.unlockUntil = s[1] > 0 ? t + s[1] : -1;
    if (s[2] && !this.codeKnown) this.codeKnown = true;
    this.searched = s[3];
  }

  plan(): [string, number] {
    return [this.code, this.codeSpot];
  }

  applyPlan(p: [string, number]) {
    this.code = p[0];
    this.codeSpot = p[1];
  }
}
