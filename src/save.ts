import type { Species } from './characters/designs';

export interface Settings {
  name: string;
  /** Personagem escolhido (bicho ou Telinha). */
  species: Species;
  tie: string;
  color: string;
  master: number;
  sfx: number;
  music: number;
  sensitivity: number;
  quality: 'alta' | 'baixa';
  subtitles: boolean;
  tutorial: boolean;
  dayLength: 'normal' | 'curto';
}

export interface SaveData {
  settings: Settings;
  bestScore: number;
  bestTitle: string;
  weeksWon: number;
  crown: boolean;
}

const KEY = 'bosskey.save.v1';

export const DEFAULT: SaveData = {
  settings: {
    name: 'Você', species: 'capivara', tie: '#2F5FA8', color: '#ff8a3d', master: 0.8, sfx: 0.9, music: 0.45, sensitivity: 1,
    quality: 'alta', subtitles: true, tutorial: true, dayLength: 'normal',
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
    return { ...structuredClone(DEFAULT), ...d, settings: { ...DEFAULT.settings, ...(d.settings ?? {}) } };
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

export function save(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* modo privado: segue sem salvar */
  }
}
