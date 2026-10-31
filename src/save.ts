import { PLAYABLE, type Variant } from './characters/designs';

export interface Settings {
  name: string;
  /** Acessório da Telinha escolhido (post-it, laço ou antena). */
  variant: Variant;
  tie: string;
  color: string;
  master: number;
  sfx: number;
  music: number;
  sensitivity: number;
  quality: 'alta' | 'baixa';
  subtitles: boolean;
  tutorial: boolean;
}

export interface SaveData {
  settings: Settings;
  /** Recorde: FUN total da melhor run e o título dela. */
  bestScore: number;
  bestTitle: string;
  weeksWon: number;
  crown: boolean;
}

const KEY = 'bosskey.save.v1';

export const DEFAULT: SaveData = {
  settings: {
    name: 'Você', variant: 'voce', tie: '#2F5FA8', color: '#ff8a3d', master: 0.8, sfx: 0.9, music: 0.45, sensitivity: 1,
    quality: 'alta', subtitles: true, tutorial: true,
  },
  bestScore: 0,
  bestTitle: '',
  weeksWon: 0,
  crown: false,
};

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const d = JSON.parse(raw) as Partial<SaveData>;
    const settings = { ...DEFAULT.settings, ...(d.settings ?? {}) };
    // saves antigos guardavam o bicho em `species`: viram a Telinha padrão
    delete (settings as { species?: unknown }).species;
    if (!PLAYABLE.some((p) => p.id === settings.variant)) settings.variant = DEFAULT.settings.variant;
    return { ...structuredClone(DEFAULT), ...d, settings };
  } catch {
    return structuredClone(DEFAULT);
  }
}

const SEEN_KEY = 'bosskey.seen.v1';

/** Dica de uma vez só por navegador: true na primeira chamada com esse id. */
export function seenOnce(id: string): boolean {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
    if (seen.includes(id)) return false;
    seen.push(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    return true;
  } catch {
    return false;
  }
}

/** Teste de multiplayer (?mp): as janelas dividem o localStorage e não podem gravar por cima do save real. */
let volatile = false;
export function keepSaveOff() {
  volatile = true;
}

export function save(d: SaveData) {
  if (volatile) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* modo privado: segue sem salvar */
  }
}
