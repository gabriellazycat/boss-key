import * as THREE from 'three';
import { INTRO, MISSIONS, type BigMissionId, type MissionFamily } from '../balance';
import { W, LOBBY_DZ } from '../world/Office';
import type { Interactable } from './Player';
import type { Worker } from './Worker';
import type { Game } from './Game';
import type { MItem } from './Items';

/** Lugar para revistar (chave extra, senha do PC). */
interface Spot {
  name: string;
  /** Onde se fica de pé para revistar e onde o marcador aparece. */
  pos: THREE.Vector3;
  mark: THREE.Vector3;
}

/** Lugar de pôster: parede (ponto no mundo), virado para dentro da sala. */
interface PosterSpot {
  at: THREE.Vector3;
  yaw: number;
  stand: THREE.Vector3;
}

/** Na rede (host → todos): [missão, etapa, feita, revistados (bits), contador, flags (bits)]. */
export type MissionNet = [number, number, 0 | 1, number, number, number];
/** No plano do dia: [missão, lugar certo, 3 candidatos, código/senha, pôsteres sorteados]. */
export type MissionPlan = [number, number, number[], string, number[]];

const IDS: BigMissionId[] = ['grampeador', 'aquario', 'papel', 'salgadinho', 'lan', 'relogio', 'posteres'];
/** Flags do dia (bits): relógio já adiantado, salgadinho comprado. */
const F = { clock: 4, bought: 8 } as const;

/**
 * Missão grande do dia (v0.10): uma por dia, do time no multi, com SUBTAREFAS na lista. Três famílias, para nem tudo
 * ser "entrar na sala do chefe":
 * - roubo: grampeador (chave extra → escrivaninha → sua mesa), aquário (a dois → copa), salgadinho (moedas → térreo →
 *   balcão → subir → comer na mesa), papel de parede (senha → PC do chefe);
 * - farra: campeonato de Ball Ops (abates do time, só com a tela aberta);
 * - escritório: adiantar o relógio (banquinho → relógio → ponteiros → devolver), colar pôsteres (minigame difícil).
 * Só o host decide as etapas; o convidado pede (`act` com `m:`) e segue o estado do snapshot.
 */
export class Missions {
  big: BigMissionId = 'grampeador';
  step = 0;
  done = false;
  private paid = false;
  /** Lugar certo (chave/senha), os 3 candidatos e o que já foi revistado (bits). */
  keySpot = 0;
  cands: number[] = [];
  searched = 0;
  /** Senha do PC do chefe (papel de parede). */
  code = '0000';
  /** Contador da etapa (abates do campeonato, pôsteres colados). */
  count = 0;
  flags = 0;
  /** Pôsteres de hoje: índices em `posterSpots` e o estado de cada um (0 nada, 1 torto, 2 colado). */
  posters: number[] = [];
  posterState: number[] = [];
  private posterMeshes: THREE.Mesh[] = [];
  /** Quem deixou o pôster torto (leva a culpa se o chefe achar). */
  private posterBy: (Worker | null)[] = [];
  /** Família de ontem (o sorteio não repete). */
  private lastFamily: MissionFamily | null = null;
  /** Meme no monitor do chefe (papel de parede feito). */
  private meme: THREE.Mesh | null = null;
  readonly spots: Spot[];
  readonly posterSpots: PosterSpot[];
  /** Bancada da copa (destino do aquário) e onde o banquinho mora. */
  readonly copaTarget = W(6.0, 22.55, 0.93);
  private readonly copaStand = W(6.0, 21.55);
  private readonly stoolHome = W(11.2, 21.0);
  /** Relógio do salão (parede da sala do chefe, alto) e onde o banquinho tem que ficar. */
  private readonly clockSpot = W(12.5, 4.85);
  private readonly drawer = W(10, 2.75);
  private readonly bossPc = W(9.3, 2.95);
  /** Balcão da lojinha do térreo (salgadinho). */
  private readonly counter = W(8.1, -27.3);

  constructor(private g: Game) {
    this.spots = [
      { name: 'casaco do cabideiro', pos: W(12.4, 5.25), mark: W(12.4, 4.6, 2.1) },
      { name: 'caixas do canto', pos: W(18.45, 18.6), mark: W(19.4, 18.6, 1.3) },
      { name: 'geladeira da copa', pos: W(1.45, 23.1), mark: W(0.47, 23.48, 2.2) },
      { name: 'lixeira da impressora', pos: W(8.5, 18.2), mark: W(8.3, 18.8, 1.2) },
    ];
    const wall = (x: number, z: number, face: 1 | -1): PosterSpot => ({ at: W(x, z, 1.7), yaw: face > 0 ? Math.PI / 2 : -Math.PI / 2, stand: W(x + face * 0.9, z) });
    this.posterSpots = [wall(0.07, 11.0, 1), wall(19.93, 11.5, -1), wall(0.07, 6.2, 1), wall(19.93, 16.2, -1), wall(0.07, 19.2, 1)];
  }

  get spec() {
    return MISSIONS[this.big];
  }

  // ------------------------------------------------------------------ sorteio (host)
  /** Host: sorteia a missão de hoje entre as liberadas, sem repetir a família de ontem. */
  roll(day: number, unlocked: BigMissionId[]) {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    // introdução gradual: nos primeiros dias só roubo e relógio
    const allowed = day < INTRO.anyMissionFrom ? unlocked.filter((id) => INTRO.early.includes(id)) : unlocked;
    const pool = allowed.filter((id) => MISSIONS[id].family !== this.lastFamily);
    // 1º dia: o grampeador (o tutorial do loop); depois, o sorteio
    this.big = day === 0 ? 'grampeador' : pick(pool.length ? pool : allowed.length ? allowed : unlocked);
    this.lastFamily = MISSIONS[this.big].family;
    const all = this.spots.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.cands = all.slice(0, 3).sort((a, b) => a - b);
    this.keySpot = pick(this.cands);
    this.code = String(1000 + Math.floor(Math.random() * 9000));
    this.posters = this.posterSpots.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, MISSIONS.posters);
    this.begin();
  }

  plan(): MissionPlan {
    return [IDS.indexOf(this.big), this.keySpot, this.cands, this.code, this.posters];
  }

  applyPlan(p: MissionPlan) {
    this.big = IDS[p[0]] ?? 'grampeador';
    this.keySpot = p[1];
    this.cands = p[2];
    this.code = p[3];
    this.posters = p[4];
    this.begin();
  }

  /** Começa o dia da missão: zera as etapas e põe os itens no lugar. */
  private begin() {
    this.step = 0;
    this.done = false;
    this.paid = false;
    this.searched = 0;
    this.count = 0;
    this.flags = 0;
    const g = this.g;
    this.meme?.removeFromParent();
    this.meme = null;
    for (const m of this.posterMeshes) m.removeFromParent();
    this.posterMeshes = [];
    const nPost = this.big === 'posteres' ? this.posters.length : 0;
    this.posterState = Array.from({ length: nPost }, () => 0);
    this.posterBy = Array.from({ length: nPost }, () => null);
    const spawn: Parameters<Game['items']['reset']>[0] = [];
    if (this.big === 'grampeador') spawn.push({ id: 'gramp', kind: 'grampeador', at: W(10, 2.0, 0.78) });
    if (this.big === 'aquario') spawn.push({ id: 'aqua', kind: 'aquario', at: g.office.aquariumStand.clone(), yaw: Math.PI / 2 });
    if (this.big === 'relogio') spawn.push({ id: 'banco', kind: 'banquinho', at: this.stoolHome.clone() });
    g.items.reset(spawn);
    // o grampeador começa trancado na gaveta (aparece quando alguém abre)
    const gr = g.items.get('gramp');
    if (gr) gr.status = 'done';
    if (this.big === 'posteres')
      this.posters.forEach((i) => {
        const s = this.posterSpots[i];
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.85), new THREE.MeshStandardMaterial({ map: posterTex(i), roughness: 0.8 }));
        m.position.copy(s.at);
        m.rotation.y = s.yaw;
        m.visible = false;
        g.r.scene.add(m);
        this.posterMeshes.push(m);
      });
  }

  // ------------------------------------------------------------------ o que mostrar
  /** Subtarefas da missão grande: [texto, estado] — ✓ feita, ▸ a atual, ○ depois. */
  steps(): [string, 'ok' | 'now' | 'todo'][] {
    const list = this.labels();
    // a sala trancada (vigilância) põe uma etapa a mais antes de entrar na sala do chefe
    const lock = this.g.surv.lockStep(this.big);
    let cur = this.done ? 99 : this.step;
    if (lock) {
      list.splice(lock.at, 0, lock.label);
      if (cur > lock.at || (cur === lock.at && lock.solved)) cur++;
    }
    return list.map((l, i): [string, 'ok' | 'now' | 'todo'] => [l, i < cur ? 'ok' : i === cur ? 'now' : 'todo']);
  }

  private labels(): string[] {
    switch (this.big) {
      case 'grampeador':
        return ['pegar uma chave extra', 'pegar o grampeador na escrivaninha do chefe', 'esconder na sua mesa'];
      case 'aquario':
        return ['pegar o aquário (a dois é melhor)', 'levar até a bancada da copa'];
      case 'papel':
        return ['achar a senha do PC do chefe', 'trocar o papel de parede dele'];
      case 'salgadinho':
        return ['pegar moedas na sua mesa', 'descer ao térreo (elevador)', 'comprar no balcão da lojinha', 'subir de volta', 'comer escondido na sua mesa'];
      case 'lan':
        return ['abrir o Ball Ops no PC (campeonato)', `fazer ${this.lanGoal} abates em equipe (${this.count}/${this.lanGoal})`];
      case 'relogio':
        return ['pegar o banquinho na copa', 'pôr o banquinho embaixo do relógio', 'adiantar o relógio', 'devolver o banquinho à copa'];
      case 'posteres':
        return ['pegar o rolo de pôsteres na sua mesa', `colar os pôsteres (${this.posterState.filter((x) => x === 2).length}/${this.posters.length})`];
    }
  }

  get lanGoal() {
    const humans = this.g.net ? Math.max(1, this.g.workers.filter((w) => w.isPlayer || w.remote).length) : 1;
    return MISSIONS.lanKills(this.g.dayIndex, humans);
  }

  /** Campeonato de hoje: o Ball Ops vira arena. */
  get lanOn() {
    return this.big === 'lan' && !this.done && this.g.phase === 'play';
  }

  /** Título e instrução da etapa atual (cartão de objetivo). */
  stepText(): [string, string] {
    const S = this.spec;
    if (this.done) return [`✅ ${S.name}`, 'Missão do dia feita! Agora é fechar a <b>cota</b> e a ganância: as pequenas.'];
    const now = this.steps().find((x) => x[1] === 'now');
    return [`${S.icon} ${S.name.toUpperCase()}`, `▸ <b>${now?.[0] ?? ''}</b>`];
  }

  /** Onde está o próximo passo (marcadores no mundo). */
  markers(): { pos: THREE.Vector3; icon: string; text: string }[] {
    if (this.done) return [];
    const g = this.g;
    const me = g.player.ball.pos;
    const m = (pos: THREE.Vector3, icon: string, text: string) => ({ pos, icon, text: `${text} · ${Math.round(me.distanceTo(pos.clone().setY(0)))} m` });
    const desk = g.player.desk.standPos.clone().setY(1.8);
    const lock = g.surv.lockStep(this.big);
    if (lock && !lock.solved && this.step >= lock.at) return g.surv.codeMarkers();
    const searchMarks = () => this.cands.filter((i) => !(this.searched & (1 << i))).map((i) => m(this.spots[i].mark, '🔎', this.spots[i].name));
    const dropped = (id: string) => {
      const it = g.items.get(id);
      return it && it.status === 'rest' && it.pos.distanceTo(it.home) > 0.3 ? [m(it.pos.clone().setY(0.9), MISSIONS[this.big].icon, 'largado aqui')] : [];
    };
    switch (this.big) {
      case 'grampeador':
        if (this.step === 0) return searchMarks();
        if (this.step === 1) return [m(W(10, 1.6, 1.6), '📎', 'escrivaninha do chefe')];
        return [m(desk, '🗄', 'sua mesa'), ...dropped('gramp')];
      case 'aquario': {
        const it = g.items.get('aqua');
        if (this.step === 0 || !it || it.status !== 'held') return it ? [m(it.pos.clone().setY(1.2), '🐠', 'aquário')] : [];
        return [m(this.copaTarget.clone().setY(1.6), '🍽', 'bancada da copa')];
      }
      case 'papel':
        return this.step === 0 ? searchMarks() : [m(this.bossPc.clone().setY(1.9), '🖥', 'PC do chefe')];
      case 'salgadinho':
        if (this.step === 0 || this.step === 4) return [m(desk, this.step ? '🥨' : '🪙', 'sua mesa')];
        if (this.step === 1) return [m(g.office.P.elevatorOut.clone().setY(2.6), '⬇', 'elevador')];
        if (this.step === 2) return [m(this.counter.clone().setY(2.2), '🥨', 'balcão')];
        return [m(g.office.lobby.elevMark, '⬆', 'elevador')];
      case 'lan':
        return [m(desk, '🎮', 'seu PC')];
      case 'relogio': {
        const it = g.items.get('banco');
        if (this.step === 0) return it ? [m(it.pos.clone().setY(1.2), '🪑', 'banquinho')] : [];
        if (this.step === 1 || this.step === 2) return [m(this.clockSpot.clone().setY(2.9), '🕰', 'relógio'), ...dropped('banco')];
        return [m(this.stoolHome.clone().setY(1.2), '↩', 'devolver o banquinho'), ...dropped('banco')];
      }
      case 'posteres':
        if (this.step === 0) return [m(desk, '🖼', 'sua mesa')];
        return this.posters.filter((_, k) => this.posterState[k] !== 2).map((i) => m(this.posterSpots[i].at.clone().setY(2.3), '🖼', 'pôster'));
    }
  }

  // ------------------------------------------------------------------ interações (jogador local)
  interactables(): Interactable[] {
    const g = this.g;
    if (g.player.fired || g.phase !== 'play' || this.done) return [];
    const list: Interactable[] = [];
    const held = g.items.heldBy(g.player);
    const free = !g.pc.carrying && !held;
    const desk = g.player.desk.standPos;
    const req = (a: string) => () => this.request(`m:${a}`);
    const search = (icon: string, what: string) => {
      for (const i of this.cands) {
        if (this.searched & (1 << i)) continue;
        const s = this.spots[i];
        list.push({
          id: `m-search${i}`, pos: s.pos, r: 1.5, hold: 0, prio: 1,
          mg: { kind: 'revirar', title: `🔎 Revistar: ${s.name}`, hint: `procurando ${what}`, opts: { found: i === this.keySpot, icon } },
          label: `<kbd>E</kbd>🔎 Revistar ${s.name}`, hint: 'você fica parado e à toa enquanto procura',
          ok: () => free,
          act: (found) => this.request(found ? `m:found${i}` : `m:empty${i}`),
        });
      }
    };
    const roomOk = g.surv.canEnterBossRoom();
    switch (this.big) {
      case 'grampeador':
        if (this.step === 0) search('🔑', 'a chave extra');
        if (this.step === 1 && roomOk)
          list.push({ id: 'm-drawer', pos: this.drawer, r: 1.5, hold: 0, prio: 2, mg: { kind: 'fechadura', title: '🗝 Gaveta da escrivaninha', hint: 'a chave extra gira devagar…' }, label: '<kbd>E</kbd>🗝 Abrir a gaveta do chefe', hint: 'o grampeador vai para a sua mão', ok: () => free, act: req('drawer') });
        if (held?.kind === 'grampeador')
          list.push({ id: 'm-hide', pos: desk, r: 2.2, hold: 0, prio: 0, label: '<kbd>E</kbd>📎 Esconder o grampeador na sua gaveta', hint: 'missão do dia!', ok: () => true, act: req('hide') });
        break;
      case 'aquario': {
        const it = g.items.get('aqua');
        if (it && it.status === 'held' && it.holders.includes(g.player))
          list.push({ id: 'm-deliver', pos: this.copaStand, r: 1.6, hold: 0, prio: 3, label: '<kbd>E</kbd>🐠 Colocar o aquário na bancada', hint: 'missão do dia!', ok: () => true, act: req('deliver') });
        break;
      }
      case 'papel':
        if (this.step === 0) search('🔐', 'a senha do PC');
        if (this.step === 1 && roomOk)
          list.push({
            id: 'm-pc', pos: this.bossPc, r: 1.4, hold: 0, prio: 2,
            mg: { kind: 'digitar', title: '🖥 PC do chefe: senha', opts: { code: this.code, show: `senha achada: ${this.code}` } },
            label: '<kbd>E</kbd>🖥 Entrar no PC do chefe', hint: 'troca o fundo por um meme', ok: () => free, act: req('pc'),
          });
        break;
      case 'salgadinho': {
        if (this.step === 0) list.push({ id: 'm-coins', pos: desk, r: 2.2, hold: 0, prio: 0, label: '<kbd>E</kbd>🪙 Pegar moedas na gaveta', hint: 'olhe para a gaveta (para o monitor você senta)', ok: () => free, act: req('coins') });
        const inCabin = g.office.inElevator(g.player.ball.pos);
        const inLobbyCabin = g.office.inLobbyCabin(g.player.ball.pos);
        if (this.step >= 1 && this.step <= 3 && inCabin) list.push({ id: 'm-down', pos: g.office.P.elevator, r: 2.6, hold: 0, prio: 3, label: '<kbd>E</kbd>⬇ Descer ao térreo', hint: 'fora da mesa: o chefe pode notar a cadeira vazia (casaco ajuda)', ok: () => true, act: () => g.rideMidday(true) });
        if (inLobbyCabin) list.push({ id: 'm-up', pos: g.office.P.elevator.clone().setZ(g.office.P.elevator.z + LOBBY_DZ), r: 2.6, hold: 0, prio: 3, label: '<kbd>E</kbd>⬆ Subir ao 12º', ok: () => true, act: () => g.rideMidday(false) });
        if (this.step === 2)
          list.push({ id: 'm-buy', pos: this.counter, r: 2.4, hold: 0, prio: 3, mg: { kind: 'balcao', title: '🥨 Lojinha do térreo', opts: { price: MISSIONS.salgadinhoPrice } }, label: '<kbd>E</kbd>🥨 Comprar um salgadinho', ok: () => free, act: req('buy') });
        if (held?.kind === 'salgadinho' && this.step === 4)
          list.push({ id: 'm-eat', pos: desk, r: 2.2, hold: 0, prio: 0, mg: { kind: 'comer', title: '🥨 Comer escondido', hint: 'devagar: CRUNCH chama atenção' }, label: '<kbd>E</kbd>🥨 Comer escondido na mesa', ok: () => true, act: (r) => this.request(r === 'barulho' ? 'm:eatLoud' : 'm:eat') });
        break;
      }
      case 'lan':
        break;
      case 'relogio':
        if (this.step === 1 && held?.kind === 'banquinho')
          list.push({ id: 'm-stool', pos: this.clockSpot, r: 1.6, hold: 0, prio: 3, label: '<kbd>E</kbd>🪑 Pôr o banquinho embaixo do relógio', ok: () => true, act: req('stool') });
        if (this.step === 2)
          list.push({ id: 'm-clock', pos: this.clockSpot, r: 1.6, hold: 0, prio: 3, mg: { kind: 'ponteiros', title: '🕰 Adiantar o relógio', hint: 'em cima do banquinho, à vista do salão' }, label: '<kbd>E</kbd>🕰 Subir e adiantar o relógio', ok: () => free, act: req('clock') });
        if (this.step === 3 && held?.kind === 'banquinho')
          list.push({ id: 'm-return', pos: this.stoolHome, r: 1.8, hold: 0, prio: 3, label: '<kbd>E</kbd>↩ Devolver o banquinho', hint: 'missão do dia!', ok: () => true, act: req('return') });
        break;
      case 'posteres':
        if (this.step === 0) list.push({ id: 'm-roll', pos: desk, r: 2.2, hold: 0, prio: 0, label: '<kbd>E</kbd>🖼 Pegar o rolo de pôsteres', hint: 'olhe para a gaveta (para o monitor você senta)', ok: () => free, act: req('roll') });
        if (this.step === 1)
          this.posters.forEach((i, k) => {
            if (this.posterState[k] === 2) return;
            list.push({
              id: `m-poster${k}`, pos: this.posterSpots[i].stand, r: 1.4, hold: 0, prio: 3,
              mg: { kind: 'poster', title: '🖼 Colar o pôster', hint: 'alinhe na moldura e alise as bolhas — difícil!', opts: { onCancel: k } },
              label: this.posterState[k] === 1 ? '<kbd>E</kbd>🖼 Arrumar o pôster torto' : '<kbd>E</kbd>🖼 Colar um pôster aqui',
              hint: 'largar no meio deixa torto (o chefe acha)', ok: () => free,
              act: () => this.request(`m:poster${k}`),
            });
          });
        break;
    }
    return list;
  }

  /** O lugar `i` ainda está para ser revistado hoje (o cabideiro não oferece casaco enquanto isso). */
  spotPending(i: number) {
    return (this.big === 'grampeador' || this.big === 'papel') && this.step === 0 && this.cands.includes(i) && !(this.searched & (1 << i));
  }

  /** O minigame do pôster foi cancelado no meio: fica torto (o Game chama pelo `onCancel` do painel). */
  posterCancelled(k: number) {
    this.request(`m:torto${k}`);
  }

  /** Campeonato: um abate do time (o Ball Ops avisa). */
  lanKill() {
    this.request('m:kill');
  }

  /** Campeonato: alguém entrou na arena (a 1ª etapa). */
  lanOpened() {
    if (this.step === 0) this.request('m:lanOpen');
  }

  private request(a: string) {
    const g = this.g;
    if (g.auth) this.hostAct(g.player, a);
    else g.net?.act(a as `m:${string}`);
  }

  /** Host: um pedido de missão de `w`. */
  hostAct(w: Worker, a: string) {
    const g = this.g;
    if (this.done || w.fired) return;
    // convidado: a posição dele chega com atraso (rede), então o host dá uma folga
    const near = (p: THREE.Vector3, r: number) => w.ball.pos.distanceTo(p) < r + (w.remote ? 1.5 : 0);
    const advance = (to: number, kind: 'good' | 'info', head: string, sub: string) => {
      this.step = to;
      this.pop(w, kind, head, sub);
    };
    // revistar (chave extra / senha do PC)
    if ((a.startsWith('m:found') || a.startsWith('m:empty')) && this.step === 0 && (this.big === 'grampeador' || this.big === 'papel')) {
      const i = Number(a.slice(7));
      if (!this.cands.includes(i) || !near(this.spots[i].pos, 2.6)) return;
      this.searched |= 1 << i;
      if (a.startsWith('m:found') && i === this.keySpot) {
        advance(1, 'good', this.big === 'papel' ? `🔐 SENHA: ${this.code}` : '🔑 ACHOU A CHAVE EXTRA!', this.big === 'papel' ? 'agora o PC dele, com ele fora da sala' : 'agora a escrivaninha dele, com ele fora da sala');
        g.audio.play3D('coin', this.spots[i].pos, 0.8);
      } else this.pop(w, 'info', 'NADA AQUI', 'está em outro lugar');
      return;
    }
    switch (this.big) {
      case 'grampeador':
        if (a === 'm:drawer' && this.step === 1 && near(this.drawer, 2.4) && !g.items.heldBy(w)) {
          const it = g.items.get('gramp')!;
          it.status = 'held';
          it.holders = [w];
          it.lastHolder = w;
          it.pos.copy(w.ball.pos);
          g.noise(this.drawer, MISSIONS.drawerNoise, null);
          g.audio.play3D('door', this.drawer, 0.5);
          advance(2, 'good', '📎 GRAMPEADOR DE OURO!', 'agora esconda na gaveta da SUA mesa');
        }
        if (a === 'm:hide' && this.step === 2) {
          const it = g.items.get('gramp');
          if (!it || !it.holders.includes(w) || !near(w.desk.standPos, 2.6)) return;
          it.holders = [];
          it.status = 'done';
          this.complete(w);
        }
        return;
      case 'aquario':
        if (a === 'm:deliver' && this.step >= 1) {
          const it = g.items.get('aqua');
          if (!it || !it.holders.includes(w) || !near(this.copaStand, 2.4)) return;
          for (const h of [...it.holders]) g.items.dropAll(h);
          it.status = 'done';
          it.pos.copy(this.copaTarget);
          it.home.copy(this.copaTarget);
          it.homeYaw = 0;
          this.complete(w);
        }
        return;
      case 'papel':
        if (a === 'm:pc' && this.step === 1 && near(this.bossPc, 2.4)) this.complete(w);
        return;
      case 'salgadinho':
        if (a === 'm:coins' && this.step === 0) advance(1, 'good', '🪙 MOEDAS', 'agora desça pelo elevador (o chefe pode notar a mesa vazia)');
        if (a === 'm:buy' && this.step === 2 && near(this.counter, 3.2)) {
          g.items.spawn('salg', 'salgadinho', w);
          this.flags |= F.bought;
          advance(3, 'good', '🥨 COMPRADO!', 'suba e coma escondido na sua mesa — com isso na mão, o chefe estranha');
        }
        if ((a === 'm:eat' || a === 'm:eatLoud') && this.step === 4) {
          const it = g.items.get('salg');
          if (!it || !it.holders.includes(w)) return;
          g.items.remove('salg');
          if (a === 'm:eatLoud') g.noise(w.desk.seat, 8, w);
          g.addCrumbs(w);
          this.complete(w);
        }
        return;
      case 'lan':
        if (a === 'm:kill') {
          this.count++;
          if (this.step === 0) this.step = 1;
          if (this.count >= this.lanGoal) this.complete(w);
        }
        if (a === 'm:lanOpen' && this.step === 0) this.step = 1;
        return;
      case 'relogio': {
        const it = g.items.get('banco');
        if (!it) return;
        if (a === 'm:stool' && this.step === 1 && it.holders.includes(w) && near(this.clockSpot, 2.2)) {
          g.items.dropAll(w);
          it.pos.copy(this.clockSpot);
          advance(2, 'info', '🪑 BANQUINHO NO LUGAR', 'suba e adiante o relógio (à vista do salão!)');
        }
        if (a === 'm:clock' && this.step === 2 && near(this.clockSpot, 2.2)) {
          this.flags |= F.clock;
          this.applyClock();
          advance(3, 'good', `🕰 +${MISSIONS.clockGain} s DE FOLGA!`, 'o expediente acaba mais cedo · agora devolva o banquinho');
        }
        if (a === 'm:return' && this.step === 3 && it.holders.includes(w) && near(this.stoolHome, 2.4)) {
          g.items.dropAll(w);
          it.pos.copy(it.home);
          this.complete(w);
        }
        return;
      }
      case 'posteres':
        if (a === 'm:roll' && this.step === 0) advance(1, 'good', '🖼 ROLO DE PÔSTERES', `cole os ${this.posters.length} nos lugares marcados`);
        if (a.startsWith('m:poster') && this.step === 1) {
          const k = Number(a.slice(8));
          if (this.posterState[k] === undefined || !near(this.posterSpots[this.posters[k]].stand, 2.2)) return;
          this.posterState[k] = 2;
          this.posterBy[k] = null;
          this.count = this.posterState.filter((x) => x === 2).length;
          g.audio.play3D('stamp', this.posterSpots[this.posters[k]].at, 0.6);
          if (this.posterState.every((x) => x === 2)) this.complete(w);
        }
        if (a.startsWith('m:torto') && this.step === 1) {
          const k = Number(a.slice(7));
          if (this.posterState[k] !== 0) return;
          this.posterState[k] = 1;
          this.posterBy[k] = w;
        }
        return;
    }
  }

  /** Relógio adiantado: o expediente acaba `clockGain` s antes (uma vez por dia). */
  private applyClock() {
    const g = this.g;
    if (g.clockGained) return;
    g.clockGained = true;
    g.duration -= MISSIONS.clockGain;
    g.audio.play3D('tick', this.clockSpot, 1);
  }

  /** Avisos de etapa: para quem fez. */
  private pop(w: Worker, kind: 'good' | 'info', a: string, s: string) {
    const g = this.g;
    if (w.isPlayer) g.hud.popup(kind, a, s);
    else g.net?.pop(w, kind, a, s);
  }

  onPicked(it: MItem, _w: Worker) {
    if (it.kind === 'aquario' && this.step === 0) this.step = 1;
    if (it.kind === 'banquinho' && this.step === 0) this.step = 1;
    // o banquinho tirado de baixo do relógio antes de adiantar: volta uma etapa
    if (it.kind === 'banquinho' && this.step === 2) this.step = 1;
  }

  /** O chefe tomou o item de volta: a missão volta uma etapa (a chave achada continua achada). */
  onConfiscated(it: MItem) {
    if (this.done) return;
    if (it.kind === 'grampeador' && this.step === 2) this.step = 1;
    if (it.kind === 'aquario') this.step = 0;
    if (it.kind === 'banquinho') this.step = this.step >= 3 ? 3 : 0;
    if (it.kind === 'salgadinho') this.step = 1;
  }

  /** Item da missão largado e achado pelo chefe (voltou para o lugar). */
  onEvidence(it: MItem) {
    if (this.done) return;
    if (it.kind === 'banquinho') this.step = this.step >= 3 ? 3 : 0;
    if (it.kind === 'grampeador' && this.step === 2) {
      it.status = 'done';
      this.step = 1;
    }
    if (it.kind === 'salgadinho') {
      this.g.items.remove('salg');
      this.step = 1;
    }
  }

  onStashed(_it: MItem, _locker: number, _w: Worker) {}

  private complete(w: Worker) {
    const g = this.g;
    this.done = true;
    g.audio.play('fanfare', 0.8);
    g.juice.confetti(w.ball.headWorld().add(new THREE.Vector3(0, 0.4, 0)), 60, 4);
    g.net?.announce('missao');
  }

  /** Todo quadro: o que se vê (pôsteres, meme, relógio) e, quando a missão fecha, cada um soma a sua parte do FUN. */
  update() {
    const g = this.g;
    this.posterMeshes.forEach((m, k) => {
      const st = this.posterState[k];
      m.visible = st > 0;
      m.rotation.z = st === 1 ? 0.35 : 0;
    });
    // pôster torto à vista do chefe: ele arranca e alguém leva a culpa
    if (g.auth)
      this.posterState.forEach((st, k) => {
        if (st !== 1) return;
        const at = this.posterSpots[this.posters[k]].at;
        if (!g.bosses.some((b) => b.ball.root.visible && b.out && b.sees(at))) return;
        this.posterState[k] = 0;
        g.bossSus(this.posterBy[k] ?? g.player, 8, 'pôster torto na parede', at);
        g.subtitle('[chefe: "quem colou ISSO aqui?!"]', at);
      });
    if (this.big === 'papel' && this.done && !this.meme) {
      this.meme = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.5), new THREE.MeshBasicMaterial({ map: posterTex(9), toneMapped: false }));
      this.meme.position.copy(W(9.3, 2.265, 1.5));
      this.meme.rotation.y = Math.PI;
      g.r.scene.add(this.meme);
      g.subtitle('[chefe: "QUEM MEXEU NO MEU COMPUTADOR?!"]', this.meme.position);
    }
    if (this.flags & F.clock) this.applyClock();
    // salgadinho: descer e subir avançam sozinhos (o host vê onde cada um está)
    if (g.auth && this.big === 'salgadinho' && !this.done) {
      const humans = g.workers.filter((x) => (x.isPlayer || x.remote) && !x.fired);
      if (this.step === 1 && humans.some((x) => g.office.inLobby(x.ball.pos))) this.step = 2;
      if (this.step === 3) {
        const h = g.items.get('salg')?.holders[0];
        if (h && !g.office.inLobby(h.ball.pos) && !g.office.inLobbyCabin(h.ball.pos)) this.step = 4;
      }
    }
    if (!this.done || this.paid) return;
    this.paid = true;
    if (g.player.fired) return;
    const humans = g.net ? Math.max(1, g.workers.filter((w) => (w.isPlayer || w.remote) && !w.fired).length) : 1;
    const bonus = g.shop.count('gula') * MISSIONS.gulaBonus;
    const share = Math.round((g.goal * MISSIONS.bigShare) / humans) + bonus;
    g.missionFun(share, this.spec.name);
    g.missionVale(MISSIONS.bigVale);
    g.career.missionDone();
    g.hud.popup('good', `🎉 ${this.spec.name.toUpperCase()}!`, `missão do dia feita · +${share} FUN · +${MISSIONS.bigVale} de vale`);
  }

  // ------------------------------------------------------------------ multi
  net(): MissionNet {
    const posters = this.posterState.reduce((a, s, k) => a | (s << (8 + 2 * k)), 0);
    return [IDS.indexOf(this.big), this.step, this.done ? 1 : 0, this.searched, this.count, this.flags | posters];
  }

  applyNet(s: MissionNet) {
    const big = IDS[s[0]];
    if (big && big !== this.big) return; // o plano do dia ainda não chegou
    this.step = s[1];
    this.searched = s[3];
    this.count = s[4];
    this.flags = s[5] & 0xff;
    this.posterState = this.posterState.map((_, k) => (s[5] >> (8 + 2 * k)) & 3);
    if (s[2] && !this.done) this.done = true;
  }
}

/** Pôster colado (ou o meme do PC do chefe): textura de canvas simples. */
function posterTex(i: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 350;
  const g = c.getContext('2d')!;
  const looks = [
    ['#ff8a3d', 'SEXTA', 'EXISTE?'],
    ['#3e8cff', 'CAFÉ', 'É VIDA'],
    ['#3ddc97', 'SINERGIA', '???'],
    ['#b07cff', 'META', 'É MITO'],
    ['#e5484d', 'FUGA', '18:00'],
  ];
  const [bg, a, b] = i === 9 ? ['#ffd23f', '😎 MEME', 'DO DIA'] : looks[i % looks.length];
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 350);
  g.fillStyle = '#fff';
  g.font = '800 46px Fredoka, sans-serif';
  g.textAlign = 'center';
  g.fillText(a, 128, 150);
  g.fillText(b, 128, 215);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
