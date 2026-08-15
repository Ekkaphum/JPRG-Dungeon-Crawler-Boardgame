import type { BossId, CharId, NewGameSetup, GameState } from '@engine/index';
import type { Lang } from '@content/i18n';

// v0.3.0 "clock" ruleset save/stats keys — bumped from v0.2.0's .v2 because GameState's shape
// changed completely (24-slot clock instead of Speed-order rounds). See
// docs/10-v0.3.0-rulings.md / PLAN_v0.3.0.md M0 for why each archived version keeps its own keys.
const SAVE_KEY = 'mc.save.v3';
const SETTINGS_KEY = 'mc.settings.v1';
const STATS_KEY = 'mc.stats.v3';

/** Per-event playback delay in milliseconds. 0 resolves the whole battle instantly. */
export const ANIM_DELAY_OPTIONS = [0, 500, 1000, 1500, 2000] as const;

export type VisualMode = 'classic' | 'tabletop';

/** Visual modes actually offered to the player. 'tabletop' (board-game mode) is complete and its
 *  ~200 lines of styling in index.css stay exactly where they are — it is *frozen, not removed*
 *  (2026-08-15): it receives no further work, and every rules change since it was built (⚡ immediate
 *  skills, the ⚡ badges, passives, the v0.3.7 score-condition rebuild) would need a styling pass
 *  before it is presentable again. Same pattern as Dax/Mira in @content/characters: the content and
 *  all its code paths keep working, one list decides whether it is reachable. Re-enabling it later is
 *  this line and nothing else — `['classic', 'tabletop']`. */
export const SELECTABLE_VISUAL_MODES: VisualMode[] = ['classic'];

export interface Settings {
  lang: Lang;
  animDelayMs: number;
  showBotIntents: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  visualMode: VisualMode;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'th',
  animDelayMs: 1000,
  showBotIntents: false,
  soundEnabled: true,
  soundVolume: 0.5,
  visualMode: 'classic',
};

export interface SaveFile {
  version: 1;
  savedAt: string;
  setup: NewGameSetup;
  seed: number;
  snapshot: GameState;
}

export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  byBotLevel: Record<string, { played: number; won: number }>;
  bossesDefeated: Partial<Record<BossId, number>>;
  bossesFailed: Partial<Record<BossId, number>>;
  charDeaths: Partial<Record<CharId, number>>;
  charLastShots: Partial<Record<CharId, number>>;
}

export function emptyStats(): Stats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    byBotLevel: {},
    bossesDefeated: {},
    bossesFailed: {},
    charDeaths: {},
    charLastShots: {},
  };
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  const s = safeParse(localStorage.getItem(SETTINGS_KEY), DEFAULT_SETTINGS);
  // Saved settings predating the numeric delay carry a string speed name — fall back to default.
  if (!ANIM_DELAY_OPTIONS.includes(s.animDelayMs as (typeof ANIM_DELAY_OPTIONS)[number])) {
    s.animDelayMs = DEFAULT_SETTINGS.animDelayMs;
  }
  // Also migrates anyone whose saved setting points at a mode that has since been disabled — a
  // player who last picked board-game mode comes back to the default instead of a frozen screen.
  if (!SELECTABLE_VISUAL_MODES.includes(s.visualMode)) {
    s.visualMode = DEFAULT_SETTINGS.visualMode;
  }
  return s;
}
export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadStats(): Stats {
  if (typeof localStorage === 'undefined') return emptyStats();
  return safeParse(localStorage.getItem(STATS_KEY), emptyStats());
}
export function saveStats(s: Stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

export function loadSaveFile(): SaveFile | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const save = JSON.parse(raw) as SaveFile;
    // v0.3.5 and earlier stored Kit's Skill Improvement as one shared number. Preserve the earned
    // improvement when loading that save, but split it into the two independent counters now used.
    for (const progress of Object.values(save.snapshot.progress)) {
      const legacy = progress.rollPenalty as unknown;
      if (typeof legacy === 'number') {
        progress.rollPenalty = { SharpShooting: legacy, Trap: legacy };
      } else if (!legacy || typeof legacy !== 'object') {
        progress.rollPenalty = {};
      }
    }
    return save;
  } catch {
    return null;
  }
}
export function writeSaveFile(save: SaveFile) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
export function clearSaveFile() {
  localStorage.removeItem(SAVE_KEY);
}
