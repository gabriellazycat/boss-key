import * as THREE from 'three';
import { B, FIXED, PAUTA, TASK_POOL, TASKS, workGoal, type FixedKind, type PautaKind, type TaskKind } from '../balance';
import { W } from '../world/Office';
import type { Game } from './Game';
import type { Interactable } from './Player';
import type { Worker } from './Worker';
import type { TaskView } from '../ui/HUD';
import type { WorkKind } from '../apps/Trabalho';

interface Coffee {
  size: 'pequeno' | 'duplo';
  sugar: number;
}

export interface TaskInst {
  kind: TaskKind;
  icon: string;
  title: string;
  /** Passo atual (cada tipo tem os seus). */
  step: number;
  /** Segundos desde que foi atendida (a folga e a rampa contam daqui). */
  t: number;
  /** Colega que assina (assinatura) e pedido do café. */
  who?: Worker;
  coffee?: Coffee;
  /** Herdada de um colega demitido: some ao entregar, não volta a tocar. */
  extra?: boolean;
}

/** A tarefa do dia: espera, toca, vira tarefa ativa e some quando entregue. */
interface Slot {
  kind: TaskKind;
  state: 'wait' | 'ring' | 'active';
  /** Esperando: segundos até tocar. */
  t: number;
  extra?: boolean;
}

const INFO: Record<TaskKind, { icon: string; title: string }> = {
  relatorio: { icon: '📄', title: 'Relatório' },
  assinatura: { icon: '✍', title: 'Assinatura' },
  galao: { icon: '💧', title: 'Galão' },
  impressora: { icon: '🖨', title: 'Impressora' },
  cafe: { icon: '☕', title: 'Café do chefe' },
  reuniao: { icon: '🗣', title: 'Reunião' },
};

const FIXED_WORK: Record<Exclude<FixedKind, 'planilha'>, WorkKind> = { totais: 'planilha', emails: 'emails', slides: 'slides', triagem: 'triagem' };

const coffeeText = (c: Coffee) => `${c.size === 'duplo' ? 'DUPLO' : 'pequeno'}, ${c.sugar === 0 ? 'sem açúcar' : `${c.sugar} açúcar${c.sugar > 1 ? 'es' : ''}`}`;

/**
 * Trabalho do dia: uma tarefa fixa com cota (monitor) e uma tarefa do chefe sorteada (o telefone toca uma vez por dia).
 * Nenhuma tem prazo: enquanto uma tarefa do chefe espera (tocando ou atendida), a Suspeita sobe cada vez mais rápido.
 */
export class TaskDirector {
  readonly active: TaskInst[] = [];
  ringing: { slot: Slot; t: number; ringT: number } | null = null;
  /** Tarefas do chefe sorteadas hoje. */
  kinds: TaskKind[] = [];
  private slots: Slot[] = [];
  /** Tarefa fixa do dia e quanto da cota já foi feito. */
  fixed: { kind: FixedKind; prog: number; quota: number } = { kind: 'planilha', prog: 0, quota: FIXED.planilha.quota };
  done = 0;
  /** Café sendo montado na máquina (painel aberto). */
  picker: Coffee | null = null;
  /** Reunião em andamento (viva-voz). */
  meeting: { t: number; phase: number; misses: number; idle: number; pressed: boolean } | null = null;
  private galaoMesh: THREE.Object3D | null = null;
  /** Pauta do dia (v0.10): as tarefas andando, com meta, além da fixa do PC. */
  pauta: { kind: PautaKind; prog: number; goal: number }[] = [];
  /** O documento/lote na mão é de qual tarefa da pauta. */
  private carryFor: PautaKind | null = null;
  private cotaWas = false;

  constructor(private g: Game) {}

  get fixedDone() {
    return this.fixed.prog >= this.fixed.quota;
  }

  /** A cota do dia fechada: a fixa do PC e toda a pauta. */
  get cotaDone() {
    return this.fixedDone && this.pauta.every((p) => p.prog >= p.goal);
  }

  /** "6/9": tudo o que a cota pede, somado (para o HUD e o relatório). */
  cotaText() {
    const have = Math.min(this.fixed.prog, this.fixed.quota) + this.pauta.reduce((a, p) => a + Math.min(p.prog, p.goal), 0);
    const need = this.fixed.quota + this.pauta.reduce((a, p) => a + p.goal, 0);
    return `${have}/${need}`;
  }

  /** Entregando um documento na mesa do chefe agora (entra na sala dele com motivo, mesmo trancada). */
  deliveringToBoss() {
    return this.carryFor === 'entregar' && this.g.pc.carrying === 'doc';
  }

  private advancePauta(kind: PautaKind) {
    const p = this.pauta.find((x) => x.kind === kind);
    if (!p || p.prog >= p.goal) return;
    p.prog++;
    this.g.workCredit(1);
    this.g.hud.toastWorld(`${PAUTA[kind].icon} ${PAUTA[kind].label}: ${p.prog}/${p.goal}`);
    this.checkCota();
  }

  private checkCota() {
    if (this.cotaDone && !this.cotaWas) {
      this.cotaWas = true;
      this.g.onCotaDone();
    }
  }

  /** Sorteia o trabalho do dia (o 1º dia com tutorial é sempre planilha + relatório). */
  resetDay() {
    const g = this.g;
    this.active.length = 0;
    this.ringing = null;
    this.closePicker();
    this.meeting = null;
    this.done = 0;
    g.computer.trabalho.cancel();
    this.showGalao(false);
    const tutorial = g.dayIndex === 0 && g.settings.tutorial && !g.net;
    const fixedKinds = Object.keys(FIXED) as FixedKind[];
    const fk = tutorial ? 'planilha' : fixedKinds[Math.floor(Math.random() * fixedKinds.length)];
    const solo = !g.net;
    this.fixed = { kind: fk, prog: 0, quota: workGoal(FIXED[fk].quota, g.dayIndex, solo) };
    // pauta: 1 tarefa andando (2 a partir do dia `twoFrom`)
    const kinds = (['arquivar', 'xerox', 'entregar'] as PautaKind[]).sort(() => Math.random() - 0.5).slice(0, g.dayIndex >= PAUTA.twoFrom ? 2 : 1);
    this.pauta = kinds.map((kind) => ({ kind, prog: 0, goal: Math.min(PAUTA.maxGoal, workGoal(PAUTA[kind].goal, g.dayIndex, solo)) }));
    this.carryFor = null;
    this.cotaWas = false;
    g.player.cotaDone = false;
    g.computer.setHome(fk === 'planilha' ? 'planilha' : 'trabalho');
    if (fk !== 'planilha') g.computer.trabalho.start(FIXED_WORK[fk]);
    // assinatura precisa de um colega bot (no multi não há bots)
    const pool = TASK_POOL.filter((k) => k !== 'assinatura' || !g.net).sort(() => Math.random() - 0.5);
    if (tutorial) {
      pool.splice(pool.indexOf('relatorio'), 1);
      pool.unshift('relatorio');
    }
    this.kinds = pool.slice(0, TASKS.perDay);
    // sem hora marcada: toca enquanto você se diverte (Game.phoneRolls)
    this.slots = this.kinds.map((kind) => ({ kind, state: 'wait', t: 0 }));
  }

  /** Multi: tarefas que ainda esperavam (passam para os colegas quando você é demitido). */
  pendingKinds(): TaskKind[] {
    return this.slots.filter((s) => s.state !== 'wait').map((s) => s.kind);
  }

  /** Multi: tarefa herdada de um colega demitido — toca logo e não se repete. */
  addExtra(kind: TaskKind) {
    if (this.g.player.fired) return;
    this.slots.push({ kind, state: 'wait', t: 1.5, extra: true });
  }

  // ------------------------------------------------------------------ telefone
  private startRing(slot: Slot) {
    slot.state = 'ring';
    this.ringing = { slot, t: 0, ringT: 0 };
    this.g.onPhoneRing();
  }

  /** Atendeu: o chefe dita a tarefa (e a folga de 5 s recomeça). */
  answer() {
    const r = this.ringing;
    if (!r) return;
    this.ringing = null;
    const g = this.g;
    const kind = r.slot.kind;
    const info = INFO[kind];
    const inst: TaskInst = { kind, icon: info.icon, title: info.title, step: 0, t: 0, extra: r.slot.extra };
    r.slot.state = 'active';
    let say = '';
    switch (kind) {
      case 'relatorio':
        say = 'Preciso do relatório impresso na minha bandeja. Pra ontem!';
        break;
      case 'assinatura': {
        inst.who = this.signer();
        say = inst.who ? `Pega o contrato na bandeja e colhe a assinatura do(a) ${inst.who.name}. Depois devolve.` : 'Pega o contrato na bandeja e me devolve assinado.';
        break;
      }
      case 'galao':
        say = 'O bebedouro secou. Tem um galão do lado da impressora: troca lá.';
        this.showGalao(true);
        break;
      case 'impressora':
        say = 'A impressora travou DE NOVO. Resolve isso.';
        g.setPrinterLed(true);
        break;
      case 'cafe':
        inst.coffee = { size: Math.random() < 0.5 ? 'pequeno' : 'duplo', sugar: Math.floor(Math.random() * 4) };
        say = `Me traz um café ${coffeeText(inst.coffee)}. E não derrama!`;
        break;
      case 'reuniao':
        say = 'Reunião relâmpago no viva-voz da mesa de reunião. Já!';
        break;
    }
    if (inst.extra) say = `${say} (era do colega demitido)`;
    this.active.push(inst);
    g.onPhoneAnswered(inst, say);
  }

  private signer() {
    const pool = this.g.workers.filter((w) => !w.isPlayer && !w.remote && !w.fired);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ------------------------------------------------------------------ andamento
  /** Rampa da Suspeita de uma tarefa esperando há `t` s (0 durante a folga). */
  ramp(t: number) {
    const over = t - TASKS.grace;
    if (over <= 0) return 0;
    return TASKS.rampBase * Math.min(TASKS.rampMaxMul, 1 + over / TASKS.rampAccel);
  }

  update(dt: number) {
    const g = this.g;
    if (g.player.fired) {
      this.ringing = null;
      return;
    }
    let rate = 0;
    if (this.ringing) {
      const r = this.ringing;
      r.t += dt;
      r.ringT -= dt;
      if (r.ringT <= 0) {
        r.ringT = 2;
        g.audio.play3D('ring', g.player.desk.screenCenter, 1.2, 0, 30);
      }
      rate += this.ramp(r.t);
    } else if (!this.meeting) {
      const next = this.slots.find((s) => s.state === 'wait' && s.t <= 0);
      // a herdada de um colega demitido toca logo; a do dia, só enquanto você se diverte
      if (next && (next.extra || g.phoneRolls(dt))) this.startRing(next);
    }
    for (const s of this.slots) if (s.state === 'wait') s.t -= dt;
    for (const t of this.active) {
      // o colega da assinatura foi demitido: o chefe aponta outro (ou aceita sem assinatura)
      if (t.kind === 'assinatura' && t.who?.fired && t.step < 2) {
        t.who = this.signer();
        if (!t.who) t.step = 2;
      }
      // fazendo a tarefa (na reunião, com o item na mão, escolhendo o café): a rampa para
      if (this.working(t)) continue;
      t.t += dt;
      rate += this.ramp(t.t);
    }
    if (rate > 0) g.addSus(g.player, rate * g.mul * dt, 'tarefa', `${this.active[0]?.title ?? 'tarefa'} esperando`);
    if (this.meeting) this.updateMeeting(dt);
  }

  /** O jogador está executando a tarefa agora: a rampa de Suspeita dela fica parada. */
  private working(t: TaskInst) {
    const c = this.g.pc.carrying;
    switch (t.kind) {
      case 'reuniao':
        return !!this.meeting;
      case 'relatorio':
        return t.step === 1 && c === 'report';
      case 'galao':
        return t.step === 1 && c === 'galao';
      case 'assinatura':
        return t.step > 0 && c === 'doc';
      case 'cafe':
        return !!this.picker || (t.step === 1 && c === 'coffee' && this.g.pc.bossCoffee);
      default:
        return false;
    }
  }

  private complete(t: TaskInst, msg = '') {
    const i = this.active.indexOf(t);
    if (i < 0) return;
    this.active.splice(i, 1);
    this.done++;
    if (t.kind === 'galao') this.showGalao(false);
    if (t.kind === 'impressora') this.g.setPrinterLed(false);
    // o telefone toca uma vez só por dia: entregue, a tarefa não volta
    const slot = this.slots.find((s) => s.kind === t.kind && s.state === 'active' && !!s.extra === !!t.extra);
    if (slot) this.slots.splice(this.slots.indexOf(slot), 1);
    this.g.onTaskDone(t, msg);
  }

  /** Resposta errada num puzzle (planilha, slides, receita do café, reunião). */
  wrong(why: string) {
    this.g.onTaskWrong(why);
  }

  /** Linha completa na planilha (conta na cota se ela for a fixa de hoje). */
  onBeat(hit: boolean) {
    if (this.fixed.kind !== 'planilha') return;
    if (!hit) return;
    this.advanceFixed(1);
  }

  /** O app Trabalho terminou/errou uma rodada da tarefa fixa. */
  onWork(result: 'done' | 'wrong') {
    const fk = this.fixed.kind;
    if (fk === 'planilha') return;
    if (result === 'wrong') return this.wrong(fk === 'slides' ? 'ordem errada' : 'conta errada');
    this.advanceFixed(FIXED[fk].perRound);
    if (!this.fixedDone) this.g.computer.trabalho.start(FIXED_WORK[fk]);
  }

  private advanceFixed(n: number) {
    if (this.fixedDone) return;
    this.fixed.prog = Math.min(this.fixed.quota, this.fixed.prog + n);
    if (this.fixedDone) this.g.onFixedDone();
    this.checkCota();
  }

  private find(kind: TaskKind) {
    return this.active.find((a) => a.kind === kind);
  }

  // ------------------------------------------------------------------ objetos do mundo
  private showGalao(on: boolean) {
    const g = this.g;
    if (on && !this.galaoMesh) {
      this.galaoMesh = g.makeGalao();
      this.galaoMesh.position.copy(W(5.5, 19.45));
      g.r.scene.add(this.galaoMesh);
    }
    if (!on && this.galaoMesh) {
      this.galaoMesh.removeFromParent();
      this.galaoMesh = null;
    }
  }

  /** Bandeja do chefe: o que fazer com ela agora (entregar ou pegar documento). */
  trayAction(): { label: string; ok: boolean; act: () => void } | null {
    const g = this.g;
    const pc = g.pc;
    const ent = this.pauta.find((p) => p.kind === 'entregar' && p.prog < p.goal);
    if (ent && !pc.carrying && !pc.holdingMission)
      return { label: '<kbd>E</kbd>📨 Pegar o documento para a mesa do chefe', ok: true, act: () => { pc.carry('doc'); this.carryFor = 'entregar'; g.audio.play('crumple', 0.4); } };
    const sig = this.find('assinatura');
    if (sig && sig.step === 0 && !pc.carrying)
      return { label: '<kbd>E</kbd>Pegar o contrato para assinar', ok: true, act: () => { pc.carry('doc'); sig.step = sig.who ? 1 : 2; g.audio.play('crumple', 0.4); } };
    if (sig && sig.step === 2 && pc.carrying === 'doc')
      return { label: '<kbd>E</kbd>Devolver o contrato assinado', ok: true, act: () => { pc.dropCarry(); this.complete(sig); } };
    const rep = this.find('relatorio');
    if (rep && rep.step === 1 && pc.carrying === 'report') return { label: '<kbd>E</kbd>Entregar o relatório', ok: true, act: () => { pc.dropCarry(); this.complete(rep); } };
    const cafe = this.find('cafe');
    if (cafe && cafe.step === 1 && pc.carrying === 'coffee' && pc.bossCoffee)
      return {
        label: '<kbd>E</kbd>Entregar o café do chefe', ok: true,
        act: () => {
          const spilled = pc.spill >= B.SPILL_PUDDLE_AT;
          pc.dropCarry();
          this.complete(cafe, spilled ? 'derramou um pouco…' : '');
        },
      };
    return null;
  }

  /** Interações das tarefas (impressora, galão, colega, bebedouro, café, reunião). */
  interactables(): Interactable[] {
    const g = this.g;
    const pc = g.pc;
    const P = g.office.P;
    const list: Interactable[] = [];
    // pauta (v0.10): trabalho andando — minigames rápidos
    const free = !pc.carrying && !pc.holdingMission;
    for (const p of this.pauta) {
      if (p.prog >= p.goal) continue;
      if (p.kind === 'arquivar') {
        if (free)
          list.push({ id: 'w-lote', pos: W(1.5, 18.6), r: 1.5, hold: 0, prio: 2, label: '<kbd>E</kbd>🗂 Pegar um lote de pastas nas caixas', hint: 'leve até o arquivo · com o lote na mão você está trabalhando', ok: () => true, act: () => { pc.carry('doc'); this.carryFor = 'arquivar'; g.audio.play('crumple', 0.4); } });
        if (pc.carrying === 'doc' && this.carryFor === 'arquivar')
          list.push({
            id: 'w-arquivo', pos: g.office.filePos, r: 1.6, hold: 0, prio: 3,
            mg: { kind: 'arrastar', title: '🗂 Arquivar as pastas', hint: 'cada pasta na gaveta da cor dela', opts: { mode: 'pastas', n: 4 } },
            label: '<kbd>E</kbd>🗂 Arquivar o lote', ok: () => true,
            act: (errors) => {
              pc.dropCarry();
              this.carryFor = null;
              if (Number(errors) > 0) g.addSus(g.player, PAUTA.errSus * Number(errors) * g.mul, 'erro', 'pasta no lugar errado');
              this.advancePauta('arquivar');
            },
          });
      }
      if (p.kind === 'xerox' && free && !g.printerBusy)
        list.push({
          id: 'w-xerox', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: 0, prio: 2,
          mg: { kind: 'ritmo', title: '🖨 Xerox em lote', hint: 'longe da sua mesa — ouça a porta', opts: { n: 6 } },
          label: '<kbd>E</kbd>🖨 Tirar o xerox do lote', ok: () => true,
          act: (misses) => {
            if (Number(misses) > 3) g.addSus(g.player, PAUTA.errSus * g.mul, 'erro', 'xerox torto');
            g.audio.play3D('printer', P.printer, 0.8);
            this.advancePauta('xerox');
          },
        });
      if (p.kind === 'entregar' && this.deliveringToBoss())
        list.push({
          id: 'w-entrega', pos: W(10, 2.75), r: 1.6, hold: 0, prio: 3, label: '<kbd>E</kbd>📨 Deixar o documento na mesa do chefe',
          hint: 'de passagem dá para espiar a agenda dele', ok: () => true,
          act: () => {
            pc.dropCarry();
            this.carryFor = null;
            g.surv.reveal();
            this.advancePauta('entregar');
          },
        });
    }
    for (const t of this.active) {
      if (t.kind === 'relatorio' && t.step === 0 && !pc.carrying && !g.printerBusy)
        list.push({
          id: 'print', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: 0, mg: { kind: 'ritmo', title: '🖨 Imprimir o relatório', opts: { n: 3 } }, label: '<kbd>E</kbd>Imprimir relatório', ok: () => true,
          act: () => {
            pc.carry('report');
            t.step = 1;
            g.audio.play3D('printer', P.printer, 1);
            g.noise(P.printer, 6, g.player);
          },
        });
      if (t.kind === 'impressora')
        list.push({ id: 'taskJam', pos: P.printer.clone().setZ(P.printer.z - 0.8), r: 1.5, hold: 0, mg: { kind: 'fios', title: '🖨 Destravar a impressora' }, label: '<kbd>E</kbd>Destravar a impressora (segure)', ok: () => true, act: () => { g.audio.play3D('printer', P.printer, 1); this.complete(t); } });
      if (t.kind === 'assinatura' && t.step === 1 && pc.carrying === 'doc' && t.who && !t.who.fired) {
        const who = t.who;
        list.push({
          id: 'sign', pos: who.ball.pos, r: 1.7, hold: 1.6, label: `<kbd>E</kbd>Pedir a assinatura de ${who.name} (segure)`, ok: () => true,
          act: () => {
            t.step = 2;
            who.ball.impulse(0.5);
            g.juice.text(who.ball.headWorld().add(new THREE.Vector3(0, 0.75, 0)), '✍', 'ft-emote', 1.4);
            g.audio.play('crumple', 0.4);
          },
        });
      }
      if (t.kind === 'galao') {
        if (t.step === 0 && !pc.carrying && this.galaoMesh)
          list.push({ id: 'galaoPick', pos: this.galaoMesh.position, r: 1.3, hold: 0.6, label: '<kbd>E</kbd>Pegar o galão (pesado!)', ok: () => true, act: () => { this.showGalao(false); pc.carry('galao'); t.step = 1; } });
        if (t.step === 1 && pc.carrying === 'galao')
          list.push({
            id: 'galaoSwap', pos: P.coffee.clone().set(P.coffee.x - 3.4, 0, P.coffee.z - 0.75), r: 1.4, hold: 0, mg: { kind: 'alavanca', title: '💧 Encaixar o galão', hint: 'puxe para baixo até travar' }, label: '<kbd>E</kbd>Trocar o galão do bebedouro (segure)', ok: () => true,
            act: () => {
              pc.dropCarry();
              g.audio.play3D('pour', P.coffee.clone().setX(P.coffee.x - 3.6), 1);
              this.complete(t);
            },
          });
      }
      if (t.kind === 'cafe' && t.step === 0 && !pc.carrying && !this.picker)
        list.push({ id: 'cafeMake', pos: P.coffee.clone().setZ(P.coffee.z - 0.6), r: 1.4, hold: 0, prio: 1, label: '<kbd>E</kbd>Fazer o café do chefe', hint: `ele pediu: ${coffeeText(t.coffee!)}`, ok: () => true, act: () => this.openPicker() });
      if (t.kind === 'reuniao' && !this.meeting)
        list.push({ id: 'meeting', pos: g.office.P.meetingSeat, r: 1.4, hold: 0.6, label: '<kbd>E</kbd>Sentar para a reunião (viva-voz)', ok: () => !pc.carrying, act: () => this.joinMeeting() });
    }
    return list;
  }

  // ------------------------------------------------------------------ café: escolher a receita
  private openPicker() {
    this.picker = { size: 'pequeno', sugar: 0 };
    this.g.pc.lockMove = true;
    this.g.audio.play('click', 0.6);
  }

  /** Painel do café: A/D tamanho, W/S açúcar, E serve, Q cancela. */
  /** Fecha o painel do café (e solta o jogador). Também no fim do dia e na demissão: ele chegou a ir aberto até o hall e prender o jogador lá. */
  closePicker() {
    if (!this.picker) return;
    this.picker = null;
    this.g.pc.lockMove = false;
    this.g.hud.picker(null);
  }

  updatePicker() {
    const p = this.picker;
    const g = this.g;
    if (!p) return;
    const inp = g.input;
    if (inp.pressed('KeyA') || inp.pressed('KeyD') || inp.pressed('ArrowLeft') || inp.pressed('ArrowRight')) {
      p.size = p.size === 'pequeno' ? 'duplo' : 'pequeno';
      g.audio.play('tick', 0.5);
    }
    if (inp.pressed('KeyW') || inp.pressed('ArrowUp')) p.sugar = Math.min(3, p.sugar + 1);
    if (inp.pressed('KeyS') || inp.pressed('ArrowDown')) p.sugar = Math.max(0, p.sugar - 1);
    if (inp.pressed('KeyQ') || inp.pressed('Escape')) return this.closePicker();
    const t = this.find('cafe');
    if (!t || !t.coffee) return this.closePicker();
    if (inp.pressed('KeyE') || inp.pressed('Enter')) {
      this.closePicker();
      if (p.size !== t.coffee.size || p.sugar !== t.coffee.sugar) {
        this.wrong('café errado');
        return;
      }
      g.takeCoffee(true);
      t.step = 1;
      return;
    }
    g.hud.picker(
      `<div class="pk-h">☕ CAFÉ DO CHEFE</div>
       <div class="pk-row"><span>Tamanho <kbd>A</kbd><kbd>D</kbd></span><b>${p.size === 'duplo' ? 'DUPLO' : 'pequeno'}</b></div>
       <div class="pk-row"><span>Açúcar <kbd>W</kbd><kbd>S</kbd></span><b>${'🍬'.repeat(p.sugar) || 'nenhum'}</b></div>
       <div class="pk-foot"><kbd>E</kbd> servir · <kbd>Q</kbd> cancelar · <i>lembra o que ele pediu?</i></div>`,
    );
  }

  // ------------------------------------------------------------------ reunião (viva-voz)
  private joinMeeting() {
    // phase = segundos até o chefe olhar para você; idle = tempo que ainda resta para assentir (0 = não está olhando)
    this.meeting = { t: TASKS.meetingTime, phase: 2.5, misses: 0, idle: 0, pressed: false };
    this.g.pc.enterMeeting();
    this.g.audio.play('blah', 0.8, 0);
  }

  leaveMeeting() {
    this.meeting = null;
    this.g.hud.meter(null);
    if (this.g.pc.mode === 'meeting') this.g.pc.setMode('walk');
  }

  /** Reunião é tédio puro: de vez em quando o chefe olha para você e é só assentir (F) — sem ritmo, com folga. */
  private updateMeeting(dt: number) {
    const m = this.meeting!;
    const g = this.g;
    const t = this.find('reuniao');
    if (!t) return this.leaveMeeting();
    m.t -= dt;
    if (Math.random() < dt * 0.8) g.audio.play('blah', 0.5, 0);
    const speaker = g.office.P.speaker.clone().add(new THREE.Vector3(0, 0.5, 0));
    if (m.idle > 0) {
      // ele está olhando: assinta antes da folga acabar
      m.idle -= dt;
      g.hud.meter(`👀 o chefe olhou para você — aperte F para assentir`, m.idle / TASKS.meetingNod, null);
      if (g.input.pressed('KeyF')) {
        m.idle = 0;
        m.phase = TASKS.meetingLook[0] + Math.random() * (TASKS.meetingLook[1] - TASKS.meetingLook[0]);
        g.player.ball.impulse(0.35);
        g.audio.play('tick', 0.5, 0);
        g.juice.text(speaker, '👍', 'ft-emote', 0.8);
      } else if (m.idle <= 0) {
        m.phase = TASKS.meetingLook[0] + Math.random() * (TASKS.meetingLook[1] - TASKS.meetingLook[0]);
        g.addSus(g.player, TASKS.meetingDoze * g.mul, 'erro', 'cochilou na reunião', g.office.P.speaker);
        g.juice.text(speaker, 'ESTÁ DORMINDO?!', 'ft-boss', 1.2);
        g.audio.play('suspicious', 0.8);
      }
    } else {
      m.phase -= dt;
      g.hud.meter(`🗣 o chefe fala… (${Math.ceil(m.t)} s)`, 1 - m.t / TASKS.meetingTime, null);
      if (m.phase <= 0) {
        m.idle = TASKS.meetingNod;
        g.audio.play('hover', 0.8);
        g.juice.text(speaker, '👀', 'ft-emote', 1.0);
      }
    }
    if (m.t <= 0) {
      this.leaveMeeting();
      this.complete(t, 'reunião encerrada');
    }
  }

  // ------------------------------------------------------------------ HUD
  /** Etiqueta do passo atual (post-it e marcador). */
  stepLabel(t: TaskInst): string {
    switch (t.kind) {
      case 'relatorio':
        return t.step === 0 ? 'imprima na impressora' : 'leve à bandeja do chefe';
      case 'assinatura':
        return t.step === 0 ? 'pegue o contrato na bandeja' : t.step === 1 ? `assinatura de ${t.who?.name}` : 'devolva na bandeja';
      case 'galao':
        return t.step === 0 ? 'pegue o galão (impressora)' : 'troque no bebedouro';
      case 'impressora':
        return 'destrave a impressora';
      case 'cafe':
        return t.step === 0 ? `café ${coffeeText(t.coffee!)}` : 'leve sem derramar à bandeja';
      case 'reuniao':
        return this.meeting ? 'assinta (F) quando ele olhar' : 'sente na mesa de reunião';
    }
  }

  /** Onde fazer o passo atual (marcador 3D). */
  stepPos(t: TaskInst): THREE.Vector3 | null {
    const g = this.g;
    const P = g.office.P;
    const tray = P.tray.clone().setY(1.6);
    switch (t.kind) {
      case 'relatorio':
        return t.step === 0 ? P.printer.clone().setY(1.8) : tray;
      case 'assinatura':
        return t.step === 1 && t.who ? t.who.ball.headWorld().add(new THREE.Vector3(0, 0.9, 0)) : tray;
      case 'galao':
        return t.step === 0 ? W(5.5, 19.45, 1.3) : P.coffee.clone().set(P.coffee.x - 3.6, 1.9, P.coffee.z - 0.9);
      case 'impressora':
        return P.printer.clone().setY(1.8);
      case 'cafe':
        return t.step === 0 ? P.coffee.clone().setY(1.9) : tray;
      case 'reuniao':
        return this.meeting ? null : g.office.P.speaker.clone().setY(1.5);
    }
  }

  /** Alguma tarefa já está subindo a Suspeita? */
  get ramping() {
    return (!!this.ringing && this.ringing.t > TASKS.grace) || this.active.some((t) => t.t > TASKS.grace);
  }

  /** Linha da tarefa no painel: folga (barra encolhendo) ou "Suspeita subindo". */
  private waitLabel(t: number) {
    return t < TASKS.grace ? { bar: 1 - t / TASKS.grace, urgent: false, tail: '' } : { bar: null, urgent: true, tail: ' · <b>⏫ Suspeita subindo</b>' };
  }

  views(): TaskView[] {
    const out: TaskView[] = [];
    if (this.ringing) {
      const w = this.waitLabel(this.ringing.t);
      out.push({ icon: '📞', label: `<b>TELEFONE!</b> atenda na sua mesa${w.tail}`, bar: w.bar, urgent: true });
    }
    for (const t of this.active) {
      const w = this.waitLabel(t.t);
      out.push({ icon: t.icon, label: `<b>${t.title}:</b> ${this.stepLabel(t)}${w.tail}`, bar: w.bar, urgent: w.urgent });
    }
    const f = FIXED[this.fixed.kind];
    out.push({ icon: this.fixedDone ? '✅' : f.icon, label: `<b>${f.label}:</b> ${this.fixed.prog}/${this.fixed.quota} ${f.unit}`, bar: this.fixed.prog / this.fixed.quota });
    for (const p of this.pauta) {
      const s = PAUTA[p.kind];
      out.push({ icon: p.prog >= p.goal ? '✅' : s.icon, label: `<b>${s.label}:</b> ${p.prog}/${p.goal} ${s.unit}`, bar: p.prog / p.goal });
    }
    return out;
  }
}
