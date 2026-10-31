import * as THREE from 'three';
import { ITEMS, type ItemKind } from '../balance';
import { dq, q, type ItemState } from '../net/Protocol';
import type { Interactable } from './Player';
import type { Worker } from './Worker';
import type { Game } from './Game';

type ItemStatus = 'rest' | 'held' | 'flying' | 'stashed' | 'done';
const STATUS: ItemStatus[] = ['rest', 'held', 'flying', 'stashed', 'done'];

/** Item de missão no mundo (grampeador de ouro, aquário). Só o host decide quem segura e onde está. */
export interface MItem {
  id: string;
  kind: ItemKind;
  mesh: THREE.Object3D;
  /** Onde ele mora (volta para cá se o chefe achar largado). */
  home: THREE.Vector3;
  homeYaw: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Quem segura (o aquário tem duas alças). */
  holders: Worker[];
  status: ItemStatus;
  /** Armário onde está guardado (-1 = nenhum). */
  locker: number;
  /** Quem arremessou (não pega o próprio passe logo de cara) e há quanto tempo voa. */
  thrower: Worker | null;
  flyT: number;
  /** Aquário: água balançando (0–1; transborda em 1) e a velocidade do quadro anterior. */
  slosh: number;
  prevVel: THREE.Vector3;
  /** Último a segurar (leva a culpa se o chefe achar largado). */
  lastHolder: Worker | null;
}

/**
 * Itens de missão: pegar (E), largar (Q), passar (botão direito: carrega e solta, como a bolinha), guardar num
 * armário e — no aquário — carregar a dois (uma alça cada, presos por uma mola) ou sozinho, devagar e barulhento.
 * Visto com o item na mão: "O QUE É ISSO?!" e o chefe persegue (pego = demissão; passou ou escondeu = escapou).
 * Largado fora do lugar e visto pelo chefe: volta para o lugar e o último a segurar leva Suspeita.
 */
export class Items {
  list: MItem[] = [];
  /** Avisos de flagrante já dados (para não gritar duas vezes pelo mesmo item). */
  private shouted = new Set<Worker>();

  constructor(private g: Game) {}

  /** Novo dia: tira os de ontem e põe os de hoje (cada um no seu lugar). */
  reset(spawn: { id: string; kind: ItemKind; at: THREE.Vector3; yaw?: number }[]) {
    for (const it of this.list) it.mesh.removeFromParent();
    this.list = [];
    this.shouted.clear();
    for (const s of spawn) {
      const mesh = this.makeMesh(s.kind);
      mesh.position.copy(s.at);
      mesh.rotation.y = s.yaw ?? 0;
      this.g.r.scene.add(mesh);
      this.list.push({
        id: s.id, kind: s.kind, mesh, home: s.at.clone(), homeYaw: s.yaw ?? 0, pos: s.at.clone(), vel: new THREE.Vector3(),
        holders: [], status: 'rest', locker: -1, thrower: null, flyT: 0, slosh: 0, prevVel: new THREE.Vector3(), lastHolder: null,
      });
    }
    for (let i = 0; i < this.g.office.lockers.length; i++) this.g.office.setLocker(i, 0);
  }

  /** Item novo no meio do dia (ex.: o salgadinho comprado no térreo), direto na mão de `w`. */
  spawn(id: string, kind: ItemKind, w: Worker) {
    this.remove(id);
    const mesh = this.makeMesh(kind);
    this.g.r.scene.add(mesh);
    const at = w.ball.pos.clone().setY(0);
    this.list.push({
      id, kind, mesh, home: at.clone(), homeYaw: 0, pos: at, vel: new THREE.Vector3(),
      holders: [w], status: 'held', locker: -1, thrower: null, flyT: 0, slosh: 0, prevVel: new THREE.Vector3(), lastHolder: w,
    });
  }

  /** Some com o item (comido, entregue). */
  remove(id: string) {
    const i = this.list.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.list[i].mesh.removeFromParent();
    this.list.splice(i, 1);
  }

  get(id: string) {
    return this.list.find((x) => x.id === id) ?? null;
  }

  /** O item que `w` segura agora. */
  heldBy(w: Worker) {
    return this.list.find((x) => x.status === 'held' && x.holders.includes(w)) ?? null;
  }

  /** Multiplicador da velocidade de quem segura algo (aquário: devagar; a dois, menos devagar). */
  speedMul(w: Worker) {
    const it = this.heldBy(w);
    if (!it) return 1;
    const s = ITEMS[it.kind];
    return it.holders.length >= 2 ? s.speedTwo : s.speedOne;
  }

  /** Aquário a dois: a mola entre as alças puxa você para perto do parceiro (a distância natural é `rope`). */
  pull(w: Worker, pos: THREE.Vector3, dt: number) {
    const it = this.heldBy(w);
    if (!it || it.holders.length < 2) return;
    const other = it.holders.find((h) => h !== w)!;
    const d = new THREE.Vector3().subVectors(other.ball.pos, pos).setY(0);
    const len = d.length();
    const A = ITEMS.aquario;
    if (len <= A.rope) return;
    // subpassos ≤ 1/60 s: a mola explícita não estoura com dt grande
    const steps = Math.max(1, Math.ceil(dt * 60));
    const h = dt / steps;
    let excess = len - A.rope;
    for (let i = 0; i < steps; i++) excess -= Math.min(excess, excess * A.spring * h);
    pos.addScaledVector(d.divideScalar(len), len - A.rope - excess);
    if (len > A.breakAt && this.g.auth) this.letGo(it, w, 'puxou demais');
  }

  // ------------------------------------------------------------------ interações (do jogador local)
  interactables(): Interactable[] {
    const g = this.g;
    const me = g.player;
    if (me.fired || g.phase !== 'play') return [];
    const list: Interactable[] = [];
    const mine = this.heldBy(me);
    const free = !mine && !g.pc.carrying && g.pc.mode === 'walk';
    for (const it of this.list) {
      const S = ITEMS[it.kind];
      if (it.status === 'rest' && free) {
        const twoHanded = it.kind === 'aquario';
        list.push({
          id: `item-${it.id}`, pos: it.pos, r: 1.6, hold: S.pickHold, obj: [it.mesh], prio: 2,
          label: `<kbd>E</kbd>${S.icon} ${twoHanded ? `Segurar o ${S.name.toLowerCase()} (sozinho, devagar)` : `Pegar o ${S.name.toLowerCase()}`}${S.pickHold ? ' (segure)' : ''}`,
          hint: twoHanded ? 'chame alguém para pegar a outra alça: a dois vai mais rápido e sem barulho' : 'visto com isso na mão = o chefe persegue · Q larga · botão direito passa',
          ok: () => true,
          act: () => this.request('pick', it.id),
        });
      }
      // segunda alça do aquário (alguém já segura)
      if (it.status === 'held' && it.kind === 'aquario' && it.holders.length === 1 && free)
        list.push({
          id: `item2-${it.id}`, pos: it.pos, r: 1.8, hold: 0.3, obj: [it.mesh], prio: 3,
          label: `<kbd>E</kbd>${S.icon} Pegar a outra alça (com ${it.holders[0].name})`,
          hint: 'a dois: mais rápido e sem chacoalhar — andem juntos',
          ok: () => true,
          act: () => this.request('pick', it.id),
        });
    }
    // armários: guardar o que você segura, ou pegar o que está guardado
    g.office.lockers.forEach((l, i) => {
      const inside = this.list.find((x) => x.status === 'stashed' && x.locker === i);
      if (mine && mine.kind !== 'aquario' && !inside)
        list.push({ id: `lock-in${i}`, pos: l.pos, r: 1.4, hold: ITEMS.stashHold, label: `<kbd>E</kbd>Guardar no ${l.label} (segure)`, hint: 'guardado, ninguém vê', ok: () => true, act: () => this.request('stash', mine.id, i) });
      else if (inside && free && inside.kind !== 'aquario')
        list.push({ id: `lock-out${i}`, pos: l.pos, r: 1.4, hold: 0.5, label: `<kbd>E</kbd>Pegar o ${ITEMS[inside.kind].name.toLowerCase()} do ${l.label}`, ok: () => true, act: () => this.request('take', inside.id, i) });
    });
    return list;
  }

  /** Teclas de quem segura: Q larga. O passe vem do Player (botão direito). */
  updateLocal() {
    const g = this.g;
    const mine = this.heldBy(g.player);
    if (mine && g.input.pressed('KeyQ') && g.pc.mode === 'walk') this.request('drop', mine.id);
  }

  /** Pode passar o que segura? (o aquário não voa) */
  get canPass() {
    const mine = this.heldBy(this.g.player);
    return !!mine && mine.kind !== 'aquario';
  }

  /** Botão direito solto: arremessa o item na direção da mira. */
  pass(start: THREE.Vector3, vel: THREE.Vector3) {
    const mine = this.heldBy(this.g.player);
    if (mine) this.request('throw', mine.id, -1, start, vel);
  }

  /** Pedido do jogador local: no host/solo aplica, no convidado manda ao host. */
  private request(a: ItemAct, id: string, i = -1, p?: THREE.Vector3, v?: THREE.Vector3) {
    const g = this.g;
    if (g.auth) this.apply(g.player, a, id, i, p, v);
    else g.net?.item(a, id, i, p ? [q(p.x), q(p.y), q(p.z)] : undefined, v ? [q(v.x), q(v.y), q(v.z)] : undefined);
  }

  /** Host: aplica um pedido de `w` (validado aqui). */
  apply(w: Worker, a: ItemAct, id: string, i = -1, p?: THREE.Vector3, v?: THREE.Vector3) {
    const g = this.g;
    const it = this.get(id);
    if (!it || w.fired) return;
    const near = (pos: THREE.Vector3, r: number) => w.ball.pos.distanceTo(pos) < r;
    switch (a) {
      case 'pick': {
        if (this.heldBy(w)) return;
        const max = it.kind === 'aquario' ? 2 : 1;
        if (it.status === 'rest' && near(it.pos, 2.4)) {
          it.status = 'held';
          it.holders = [w];
        } else if (it.status === 'held' && it.holders.length < max && near(it.pos, 2.6)) it.holders.push(w);
        else return;
        it.lastHolder = w;
        it.locker = -1;
        it.slosh = 0;
        g.missions.onPicked(it, w);
        g.audio.play3D('pop', it.pos, 0.7);
        break;
      }
      case 'drop':
        if (!it.holders.includes(w)) return;
        this.letGo(it, w, '');
        break;
      case 'throw':
        if (!it.holders.includes(w) || it.kind === 'aquario' || !p || !v) return;
        it.holders = [];
        it.status = 'flying';
        it.pos.copy(p);
        it.vel.copy(v).multiplyScalar(ITEMS.passSpeed);
        it.thrower = w;
        it.flyT = 0;
        g.audio.play3D('throw', p, 0.9);
        g.noise(p, ITEMS.passNoise, null);
        break;
      case 'stash': {
        const l = g.office.lockers[i];
        if (!l || !it.holders.includes(w) || it.kind === 'aquario' || !near(l.pos, 2.2)) return;
        if (this.list.some((x) => x.status === 'stashed' && x.locker === i)) return;
        it.holders = [];
        it.status = 'stashed';
        it.locker = i;
        it.pos.copy(l.pos);
        this.unshout(w);
        g.office.setLocker(i, 1);
        setTimeout(() => g.office.setLocker(i, 0), 700);
        g.audio.play3D('door', l.pos, 0.5);
        g.missions.onStashed(it, i, w);
        break;
      }
      case 'take': {
        const l = g.office.lockers[i];
        if (!l || it.status !== 'stashed' || it.locker !== i || this.heldBy(w) || !near(l.pos, 2.2)) return;
        it.status = 'held';
        it.holders = [w];
        it.locker = -1;
        it.lastHolder = w;
        g.office.setLocker(i, 1);
        setTimeout(() => g.office.setLocker(i, 0), 700);
        break;
      }
    }
  }

  /** `w` solta o item ali mesmo (no chão, na frente dele). */
  letGo(it: MItem, w: Worker, why: string) {
    it.holders = it.holders.filter((h) => h !== w);
    this.unshout(w);
    if (it.holders.length) {
      if (why) this.g.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.6, 0)), '💦', 'ft-emote', 1.2);
      return;
    }
    it.status = 'rest';
    const f = new THREE.Vector3(Math.sin(w.ball.yaw), 0, Math.cos(w.ball.yaw));
    it.pos.copy(w.ball.pos).addScaledVector(f, 0.6).setY(0);
    this.g.office.collide(it.pos, 0.25);
    this.g.audio.play3D('thud', it.pos, 0.5);
  }

  /** O dono do item foi demitido ou o dia acabou: o item cai onde ele estava. */
  dropAll(w: Worker) {
    for (const it of this.list) if (it.holders.includes(w)) this.letGo(it, w, '');
  }

  /** Demitido segurando: o chefe toma o item de volta (o grampeador volta à gaveta, o aquário à sala dele). */
  confiscate(w: Worker) {
    for (const it of this.list) {
      if (!it.holders.includes(w)) continue;
      it.holders = [];
      it.pos.copy(it.home);
      it.slosh = 0;
      it.lastHolder = null;
      it.status = it.kind === 'grampeador' ? 'done' : 'rest';
      this.g.missions.onConfiscated(it);
    }
    this.unshout(w);
  }

  private unshout(w: Worker) {
    this.shouted.delete(w);
  }

  // ------------------------------------------------------------------ simulação (host)
  update(dt: number) {
    const g = this.g;
    for (const it of this.list) {
      if (it.status === 'flying') this.fly(it, dt);
      if (it.status === 'held') this.carryTick(it, dt);
      if (it.status === 'rest' && it.pos.distanceTo(it.home) > 0.6 && it.lastHolder) this.lookForEvidence(it);
    }
    // visto com o item na mão: "O QUE É ISSO?!" e a perseguição de demissão
    for (const it of this.list) {
      if (it.status !== 'held') continue;
      for (const w of it.holders) {
        if (this.shouted.has(w) || w.hidden) continue;
        const b = g.bosses.find((x) => x.ball.root.visible && x.sees(w.ball.pos));
        if (!b) continue;
        this.shouted.add(w);
        g.caughtWithItem(w, b, it);
      }
    }
  }

  private fly(it: MItem, dt: number) {
    const g = this.g;
    it.flyT += dt;
    it.vel.y -= 9.8 * dt;
    it.pos.addScaledVector(it.vel, dt);
    const before = it.pos.clone();
    g.office.collideBall(it.pos, 0.12);
    if (before.distanceToSquared(it.pos) > 1e-6) it.vel.set(0, Math.min(0, it.vel.y), 0);
    // pega no ar: um colega (de mãos livres) perto da trajetória
    for (const w of g.workers) {
      if (w.fired || (w === it.thrower && it.flyT < 0.6) || this.heldBy(w)) continue;
      if (!(w.isPlayer || w.remote)) continue;
      const head = w.ball.pos.clone().setY(1.1);
      if (head.distanceTo(it.pos) < ITEMS.catchR) {
        it.status = 'held';
        it.holders = [w];
        it.lastHolder = w;
        g.audio.play3D('pop', it.pos, 0.9);
        g.juice.text(w.ball.headWorld().add(new THREE.Vector3(0, 0.7, 0)), '🙌', 'ft-emote', 1.2);
        // a perseguição troca de alvo: o chefe vai atrás de quem pegou
        for (const b of g.bosses) if (b.chaseW === it.thrower) b.startChase(w, true);
        if (it.thrower) this.unshout(it.thrower);
        return;
      }
    }
    if (it.pos.y <= 0.05) {
      it.pos.y = 0;
      it.status = 'rest';
      it.vel.set(0, 0, 0);
      g.audio.play3D('thud', it.pos, 0.7);
      g.noise(it.pos, ITEMS.landNoise, null);
    }
  }

  /** Aquário: chacoalhar transborda (barulho e poça). Sozinho ele chacoalha sempre um pouco; a dois, só nos trancos. */
  private carryTick(it: MItem, dt: number) {
    const g = this.g;
    const hs = it.holders;
    it.pos.copy(hs.length >= 2 ? hs[0].ball.pos.clone().add(hs[1].ball.pos).multiplyScalar(0.5) : hs[0].ball.pos).setY(0);
    if (it.kind !== 'aquario') return;
    const A = ITEMS.aquario;
    const v = hs[0].ball.velocity;
    const jerk = v.clone().sub(it.prevVel).length() / Math.max(dt, 1e-3);
    it.prevVel.copy(v);
    const solo = hs.length < 2;
    it.slosh += dt * ((solo ? A.sloshSolo : 0) + Math.max(0, jerk - A.jerkFree) * A.sloshPerJerk) - dt * A.calm;
    it.slosh = THREE.MathUtils.clamp(it.slosh, 0, 1);
    if (it.slosh >= 1) {
      it.slosh = 0.35;
      g.juice.text(it.pos.clone().setY(1.2), '💦 SPLASH', 'ft-sus', 1.2);
      g.audio.play3D('splash', it.pos, 1);
      g.noise(it.pos, A.splashNoise, null);
      g.spillEvidence(it.pos, hs[0]);
    }
  }

  /** Item largado fora do lugar e visto pelo chefe: volta para o lugar e o último a segurar leva Suspeita. */
  private lookForEvidence(it: MItem) {
    const g = this.g;
    const b = g.bosses.find((x) => x.ball.root.visible && x.out && x.sees(it.pos.clone().setY(0.4)));
    if (!b) return;
    const who = it.lastHolder!;
    g.bossSus(who, ITEMS.evidenceSus, `largou o ${ITEMS[it.kind].name.toLowerCase()} por aí`, it.pos);
    g.subtitle(`[chefe: "ué, o que o meu ${ITEMS[it.kind].name.toLowerCase()} faz aqui?"]`, b.pos);
    it.pos.copy(it.home);
    it.lastHolder = null;
    it.slosh = 0;
    g.missions.onEvidence(it);
  }

  // ------------------------------------------------------------------ visual (todo mundo)
  render(dt: number) {
    const g = this.g;
    // o que cabe na mão vai preso nas suas patinhas (o Player cuida); o resto é desenhado no mundo
    const mine = this.heldBy(g.player);
    g.pc.holdItem(mine && mine.kind !== 'aquario' ? mine.kind : null, mine?.kind === 'aquario');
    for (const it of this.list) {
      const m = it.mesh;
      // o grampeador "feito" está trancado (na gaveta ou no armário); o aquário feito fica na bancada da copa
      m.visible = it.status !== 'stashed' && !(it.status === 'done' && it.kind === 'grampeador') && !(it === mine && it.kind !== 'aquario');
      if (!m.visible) continue;
      if (it.status === 'held') {
        const hs = it.holders;
        const front = (w: Worker) => w.ball.pos.clone().add(new THREE.Vector3(Math.sin(w.ball.yaw), 0, Math.cos(w.ball.yaw)).multiplyScalar(0.5));
        const target = hs.length >= 2 ? hs[0].ball.pos.clone().add(hs[1].ball.pos).multiplyScalar(0.5) : front(hs[0]);
        target.y = it.kind === 'aquario' ? 0.62 : 1.0;
        m.position.lerp(target, Math.min(1, dt * 14));
        if (hs.length >= 2) m.rotation.y = Math.atan2(hs[1].ball.pos.x - hs[0].ball.pos.x, hs[1].ball.pos.z - hs[0].ball.pos.z) + Math.PI / 2;
        else m.rotation.y = hs[0].ball.yaw;
        // a água balança
        if (it.kind === 'aquario') m.rotation.z = Math.sin(g.time * 7) * 0.08 * it.slosh;
      } else {
        const y = it.status === 'rest' ? (it.pos.distanceTo(it.home) < 0.05 ? it.home.y : 0.02) : it.pos.y;
        m.position.set(it.pos.x, y, it.pos.z);
        if (it.status === 'flying') m.rotation.x += dt * 9;
        else {
          m.rotation.x = 0;
          m.rotation.z = 0;
          if (it.pos.distanceTo(it.home) < 0.05) m.rotation.y = it.homeYaw;
        }
      }
    }
  }

  private makeMesh(kind: ItemKind) {
    const grp = new THREE.Group();
    if (kind === 'banquinho') {
      const wood = new THREE.MeshStandardMaterial({ color: '#b8743a', roughness: 0.7 });
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 18), wood);
      seat.position.y = 0.45;
      grp.add(seat);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.45, 8), wood);
        leg.position.set(Math.cos(a) * 0.14, 0.22, Math.sin(a) * 0.14);
        grp.add(leg);
      }
    } else if (kind === 'salgadinho') {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: '#ffb000', roughness: 0.4 }));
      bag.position.y = 0.11;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.05, 0.065), new THREE.MeshStandardMaterial({ color: '#e5484d', roughness: 0.4 }));
      band.position.y = 0.12;
      grp.add(bag, band);
    } else if (kind === 'grampeador') {
      const gold = new THREE.MeshStandardMaterial({ color: '#ffcf3f', metalness: 0.9, roughness: 0.22, emissive: '#3a2a00', emissiveIntensity: 0.4 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.22), gold);
      base.position.y = 0.018;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.2), gold);
      top.position.set(0, 0.06, -0.01);
      top.rotation.x = -0.12;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.05), new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.7 }));
      pad.position.set(0, 0.082, 0.07);
      grp.add(base, top, pad);
    } else {
      const glass = new THREE.MeshStandardMaterial({ color: '#bfe8ff', roughness: 0.05, transparent: true, opacity: 0.35 });
      const water = new THREE.MeshStandardMaterial({ color: '#3fa9e0', roughness: 0.2, transparent: true, opacity: 0.6 });
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.4), glass);
      tank.position.y = 0.21;
      const wat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.32, 0.36), water);
      wat.position.y = 0.17;
      const sand = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.36), new THREE.MeshStandardMaterial({ color: '#f2d79a', roughness: 0.9 }));
      sand.position.y = 0.02;
      const fish = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshStandardMaterial({ color: '#ff8a3d', roughness: 0.4 }));
      fish.scale.set(1.5, 1, 0.6);
      fish.position.set(0.1, 0.2, 0);
      const handleMat = new THREE.MeshStandardMaterial({ color: '#2b3246', roughness: 0.5 });
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), handleMat);
        h.position.set(s * 0.37, 0.36, 0);
        h.rotation.y = Math.PI / 2;
        grp.add(h);
      }
      grp.add(tank, wat, sand, fish);
    }
    grp.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return grp;
  }

  // ------------------------------------------------------------------ multi
  netStates(): ItemState[] {
    return this.list.map((it) => [it.id, it.holders.map((h) => this.g.net?.peerOf(h) ?? '').join(','), q(it.pos.x), q(it.pos.y), q(it.pos.z), STATUS.indexOf(it.status) * 10 + (it.locker + 1)]);
  }

  applyNet(states: ItemState[]) {
    const g = this.g;
    for (const [id, hs, x, y, z, st] of states) {
      const it = this.get(id);
      if (!it) continue;
      it.status = STATUS[Math.floor(st / 10)] ?? 'rest';
      it.locker = (st % 10) - 1;
      it.holders = hs ? hs.split(',').map((p) => g.net?.workerOf(p)).filter((w): w is Worker => !!w) : [];
      it.pos.set(dq(x), dq(y), dq(z));
    }
  }
}

export type ItemAct = 'pick' | 'drop' | 'throw' | 'stash' | 'take';
