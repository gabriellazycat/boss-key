import { CAREER, MISSIONS, type BigMissionId } from '../balance';

const KEY = 'bosskey.career.v1';
const IDS = Object.keys(MISSIONS).filter((k) => typeof (MISSIONS as Record<string, unknown>)[k] === 'object') as BigMissionId[];

/**
 * Carreira entre runs (v0.10): perder faz parte. Cada dia sobrevivido e cada missão grande feita somam XP, que fica
 * salvo de uma run para a outra e desbloqueia missões novas no sorteio (mais variedade, não mais facilidade).
 */
export class Career {
  xp = 0;
  /** Avisa quando algo desbloqueia (o Game mostra o popup). */
  onUnlock: ((names: string[]) => void) | null = null;

  constructor() {
    try {
      this.xp = Math.max(0, Number(JSON.parse(localStorage.getItem(KEY) ?? '{}').xp) || 0);
    } catch {
      this.xp = 0;
    }
  }

  /** Missões que entram no sorteio. */
  unlocked(): BigMissionId[] {
    return IDS.filter((id) => MISSIONS[id].unlock <= this.xp);
  }

  /** A próxima a desbloquear e quanto XP falta. */
  next(): { name: string; left: number } | null {
    const n = IDS.filter((id) => MISSIONS[id].unlock > this.xp).sort((a, b) => MISSIONS[a].unlock - MISSIONS[b].unlock)[0];
    return n ? { name: MISSIONS[n].name, left: MISSIONS[n].unlock - this.xp } : null;
  }

  dayDone() {
    this.add(CAREER.xpDay);
  }

  missionDone() {
    this.add(CAREER.xpMission);
  }

  private add(v: number) {
    const before = this.unlocked();
    this.xp += v;
    try {
      localStorage.setItem(KEY, JSON.stringify({ xp: this.xp }));
    } catch {
      /* sem armazenamento: a carreira vale só nesta aba */
    }
    const fresh = this.unlocked().filter((id) => !before.includes(id));
    if (fresh.length) this.onUnlock?.(fresh.map((id) => MISSIONS[id].name));
  }
}
