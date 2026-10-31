import * as THREE from 'three';
import { DISTRACT, DISTRACT_FX, INTRO, type DistractId } from '../balance';
import type { LoopSound } from '../core/Audio';
import { W } from '../world/Office';
import type { Interactable } from './Player';
import type { Worker } from './Worker';
import type { Game } from './Game';

export const DISTRACT_IDS: DistractId[] = ['impressora', 'radio', 'ramal', 'alarme'];

/** v0.10: cada distração é um minigame rápido (o ramal do chefe é o 2047, anotado no viva-voz). */
const DISTRACT_MG: Record<DistractId, NonNullable<Interactable['mg']>> = {
  impressora: { kind: 'fios', title: '🖨 Travar a impressora', hint: 'troque os fios: ela vai apitar' },
  radio: { kind: 'sintonizar', title: '📻 Ligar o rádio da copa', hint: 'mexa o mouse até a música entrar' },
  ramal: { kind: 'discar', title: '☎ Ligar para o ramal do chefe', opts: { code: '2047', show: 'ramal do chefe: 2047' } },
  alarme: { kind: 'alavanca', title: '🚨 Puxar o alarme de incêndio', hint: 'segure e puxe até embaixo' },
};

/**
 * Distrações do mapa (v0.9): o jogador CRIA a brecha. Cada uma atrai ou prende o chefe num lugar e tem recarga;
 * o alarme de incêndio vale uma vez por dia. Acionar faz barulho ali e, se uma chefia vir quem foi, dá Suspeita.
 * Só o host aplica; o convidado pede (`act`) e recebe recargas e o que está tocando no snapshot (`ds`).
 */
export class Distractions {
  /** Recarga restante (s) de cada uma; o alarme usado fica em `Infinity` até amanhã. */
  cd: Record<DistractId, number> = { impressora: 0, radio: 0, ramal: 0, alarme: 0 };
  /** Rádio tocando e alarme de incêndio tocando (s restantes). */
  radioT = 0;
  alarmT = 0;
  private radioLoop: LoopSound | null = null;
  private alarmLoop: LoopSound | null = null;

  constructor(private g: Game) {}

  resetDay() {
    for (const id of DISTRACT_IDS) this.cd[id] = 0;
    this.stopRadio();
    this.stopAlarm();
  }

  /** Onde fica cada uma (o ponto de onde se aciona). */
  spot(id: DistractId) {
    const P = this.g.office.P;
    switch (id) {
      case 'impressora':
        return P.printer.clone().setX(P.printer.x - 1.0);
      case 'radio':
        return W(16.6, 21.3);
      case 'ramal':
        return W(12.4, 11.5);
      case 'alarme':
        return W(2.85, 4.75);
    }
  }

  interactables(): Interactable[] {
    const g = this.g;
    if (g.player.fired || g.phase !== 'play' || g.dayIndex < INTRO.distractFrom) return [];
    const list: Interactable[] = [];
    for (const id of DISTRACT_IDS) {
      const d = DISTRACT[id];
      // a impressora travada por evento já é distração (e quem destrava é outro botão)
      if (id === 'impressora' && g.printerJam > 0) continue;
      const cd = this.cd[id];
      list.push({
        id: `d-${id}`, pos: this.spot(id), r: 1.5, hold: 0, mg: DISTRACT_MG[id],
        label: cd > 0 ? (cd === Infinity ? `${d.icon} ${d.name}: já usado hoje` : `${d.icon} ${d.name}: de novo em ${Math.ceil(cd)} s`) : `<kbd>E</kbd>${d.icon} ${d.verb} (segure)`,
        hint: d.hint,
        ok: () => this.cd[id] <= 0,
        act: () => this.trigger(id),
      });
    }
    return list;
  }

  /** Você acionou: o host aplica (o convidado pede e já marca a recarga para não pedir de novo). */
  trigger(id: DistractId) {
    const g = this.g;
    if (this.cd[id] > 0) return;
    g.audio.play('click', 0.7);
    if (g.auth) this.apply(id, g.player);
    else {
      this.cd[id] = id === 'alarme' ? Infinity : DISTRACT[id].cd;
      g.net?.act(`d:${id}`);
    }
  }

  /** Host/solo: efeito da distração acionada por `by`. */
  apply(id: DistractId, by: Worker) {
    const g = this.g;
    const d = DISTRACT[id];
    if (this.cd[id] > 0) return;
    this.cd[id] = id === 'alarme' ? Infinity : d.cd;
    const at = this.spot(id);
    const main = g.bosses[0];
    // quem foi visto mexendo leva a culpa (a distração funciona do mesmo jeito)
    if (g.bosses.some((b) => b.ball.root.visible && b.sees(by.ball.pos))) g.bossSus(by, d.seenSus, `mexendo n${d.article} ${d.name.toLowerCase()}`, by.ball.pos);
    const lure = (p: THREE.Vector3, stay: number, why: 'printer' | 'noise' | 'patrol', reason: string) => {
      const t = { kind: 'point' as const, p, stay, why };
      if (main.busy) main.prioritize(t);
      else main.startRonda([t], reason);
    };
    switch (id) {
      case 'impressora':
        g.jamPrinter(`${by.isPlayer ? 'você travou' : `${by.name} travou`} a impressora`);
        break;
      case 'radio':
        this.radioT = DISTRACT_FX.radio.on;
        this.startRadio();
        lure(W(16.0, 21.4), DISTRACT_FX.radio.bossStay, 'noise', 'rádio');
        g.subtitle('[rádio da copa: 🎶 MÚSICA ALTA]', at);
        break;
      case 'ramal':
        g.applyRamal();
        break;
      case 'alarme':
        this.alarmT = DISTRACT_FX.alarme.on;
        this.startAlarm();
        // todo mundo para o hall do elevador; o chefe fica lá conferindo e depois passa nas mesas
        lure(W(15, 6.6), DISTRACT_FX.alarme.on, 'patrol', 'alarme');
        main.queue.push(...g.rondaTargets(4));
        g.bots.evacuate(W(15, 7.4), DISTRACT_FX.alarme.on);
        g.hud.popup('warn', '🚨 ALARME DE INCÊNDIO!', `todo mundo para o elevador · ${DISTRACT_FX.alarme.on} s`);
        g.net?.announce('alarme');
        break;
    }
    g.noise(at, d.noise, null);
  }

  update(dt: number) {
    for (const id of DISTRACT_IDS) if (this.cd[id] !== Infinity) this.cd[id] = Math.max(0, this.cd[id] - dt);
    if (this.radioT > 0) {
      this.radioT -= dt;
      if (this.radioT <= 0) this.stopRadio();
    }
    if (this.alarmT > 0) {
      this.alarmT -= dt;
      if (this.alarmT <= 0) this.stopAlarm();
    }
  }

  // ------------------------------------------------------------------ som e luz
  private startRadio() {
    if (this.radioLoop) return;
    this.radioLoop = this.g.audio.loop('video', W(16.6, 20.55, 0.7));
    this.radioLoop?.setVol(1);
    this.g.office.setRadio(true);
  }
  private stopRadio() {
    this.radioT = 0;
    this.radioLoop?.stop();
    this.radioLoop = null;
    this.g.office.setRadio(false);
  }
  private startAlarm() {
    if (this.alarmLoop) return;
    this.alarmLoop = this.g.audio.loop('alarm', W(10, 10, 2.5));
    this.alarmLoop?.setVol(1);
    this.g.office.setFireAlarm(true);
  }
  private stopAlarm() {
    this.alarmT = 0;
    this.alarmLoop?.stop();
    this.alarmLoop = null;
    this.g.office.setFireAlarm(false);
  }

  // ------------------------------------------------------------------ multi
  /** Snapshot: recargas (alarme usado = -1) e o que está tocando. */
  netState(): number[] {
    return [...DISTRACT_IDS.map((id) => (this.cd[id] === Infinity ? -1 : Math.ceil(this.cd[id]))), Math.ceil(this.radioT), Math.ceil(this.alarmT)];
  }

  applyNet(s: number[]) {
    DISTRACT_IDS.forEach((id, i) => {
      const v = s[i] ?? 0;
      this.cd[id] = v < 0 ? Infinity : v;
    });
    const radio = s[4] ?? 0;
    const alarm = s[5] ?? 0;
    if (radio > 0 && !this.radioLoop) this.startRadio();
    if (radio <= 0 && this.radioLoop) this.stopRadio();
    this.radioT = radio;
    if (alarm > 0 && !this.alarmLoop) this.startAlarm();
    if (alarm <= 0 && this.alarmLoop) this.stopAlarm();
    this.alarmT = alarm;
  }
}
