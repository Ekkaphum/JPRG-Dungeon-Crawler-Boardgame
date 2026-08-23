import { create } from 'zustand';
import type { NewGameSetup } from '@engine/index';
import { STABLE_RULESET, type RulesetVersion } from '@content/rulesets';
import { GameSession } from './GameSession';
import {
  clearSaveFile,
  loadSaveFile,
  loadSettings,
  loadStats,
  saveSettings,
  saveStats,
  writeSaveFile,
  type Settings,
  type Stats,
} from './persistence';
import type { Difficulty } from '@content/difficulty';
import { audioEngine } from '@ui/audio/AudioEngine';
import { musicPlayer } from '@ui/audio/MusicPlayer';

export type Screen = 'menu' | 'setup' | 'game' | 'scoring' | 'allLose' | 'tutorial' | 'stats' | 'settings';

export interface PlayerFormEntry {
  name: string;
  kind: 'human' | 'bot';
  botLevel: 'easy' | 'medium' | 'hard';
}

interface AppState {
  screen: Screen;
  settings: Settings;
  stats: Stats;
  hasSave: boolean;

  /** Always exactly 4 — v0.3.0 is 4-players-only (GAME_DESIGN_v0_3_0.md §1/§12). */
  players: PlayerFormEntry[];
  difficulty: Difficulty;
  /** Which ruleset the next new game starts under. Persisted with settings so the menu can label
   *  the play button with it. */
  ruleset: RulesetVersion;
  seedText: string;
  draftMode: 'random' | 'manual';
  /** Seat indices in pick order — only used when draftMode is 'manual'. */
  draftOrder: number[];

  session: GameSession | null;

  setScreen: (s: Screen) => void;
  updateSettings: (s: Partial<Settings>) => void;
  updatePlayer: (i: number, patch: Partial<PlayerFormEntry>) => void;
  setDifficulty: (d: Difficulty) => void;
  setRuleset: (v: RulesetVersion) => void;
  setSeedText: (s: string) => void;
  setDraftMode: (m: 'random' | 'manual') => void;
  moveDraftSlot: (index: number, dir: -1 | 1) => void;
  startNewGame: () => void;
  continueGame: () => void;
  recordGameEnd: () => void;
}

function defaultPlayers(): PlayerFormEntry[] {
  return Array.from({ length: 4 }, (_, i) => ({
    name: i === 0 ? 'You' : `Bot ${i}`,
    kind: i === 0 ? 'human' : 'bot',
    botLevel: 'medium',
  }));
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

const initialSettings = loadSettings();
audioEngine.enabled = initialSettings.soundEnabled;
audioEngine.volume = initialSettings.soundVolume;
musicPlayer.setEnabled(initialSettings.musicEnabled);
musicPlayer.setVolume(initialSettings.musicVolume);

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'menu',
  settings: initialSettings,
  stats: loadStats(),
  hasSave: loadSaveFile() != null,

  players: defaultPlayers(),
  difficulty: 'standard',
  ruleset: STABLE_RULESET,
  seedText: '',
  draftMode: 'random',
  draftOrder: [0, 1, 2, 3],

  session: null,

  setScreen: (s) => set({ screen: s }),

  updateSettings: (patch) => {
    const s = { ...get().settings, ...patch };
    saveSettings(s);
    set({ settings: s });
    if (patch.animDelayMs !== undefined) get().session?.setAnimSpeed(patch.animDelayMs);
    if (patch.soundEnabled !== undefined) audioEngine.enabled = patch.soundEnabled;
    if (patch.soundVolume !== undefined) audioEngine.volume = patch.soundVolume;
    if (patch.musicEnabled !== undefined) musicPlayer.setEnabled(patch.musicEnabled);
    if (patch.musicVolume !== undefined) musicPlayer.setVolume(patch.musicVolume);
  },

  updatePlayer: (i, patch) => {
    const players = get().players.slice();
    players[i] = { ...players[i], ...patch };
    set({ players });
  },

  setDifficulty: (d) => set({ difficulty: d }),
  setRuleset: (v) => set({ ruleset: v }),
  setSeedText: (s) => set({ seedText: s }),

  setDraftMode: (m) => set({ draftMode: m }),

  moveDraftSlot: (index, dir) => {
    const order = get().draftOrder.slice();
    const to = index + dir;
    if (to < 0 || to >= order.length) return;
    [order[index], order[to]] = [order[to], order[index]];
    set({ draftOrder: order });
  },

  startNewGame: () => {
    // Must happen inside this real click handler, not later when a bot's sound first tries to
    // play — browsers refuse to start audio outside a user gesture.
    audioEngine.unlock();
    musicPlayer.unlock();
    const { players, difficulty, ruleset, seedText, draftMode, draftOrder } = get();
    const setup: NewGameSetup = {
      players: players.map((p) => ({ name: p.name || 'Player', kind: p.kind, botLevel: p.kind === 'bot' ? p.botLevel : undefined })),
      difficulty,
      draftOrder: draftMode === 'manual' ? draftOrder : null,
      ruleset,
    };
    const seed = seedText.trim() ? hashSeed(seedText.trim()) : randomSeed();
    const session = new GameSession(setup, seed, undefined, get().settings.animDelayMs);
    session.onBattleBoundary = (snapshot) => {
      writeSaveFile({ version: 1, savedAt: new Date().toISOString(), setup, seed, snapshot });
      set({ hasSave: true });
    };
    clearSaveFile();
    set({ session, screen: 'game', hasSave: false });
    runSessionToCompletion(session);
  },

  continueGame: () => {
    audioEngine.unlock();
    musicPlayer.unlock();
    const save = loadSaveFile();
    if (!save) return;
    const session = new GameSession(save.setup, save.seed, save.snapshot, get().settings.animDelayMs);
    session.onBattleBoundary = (snapshot) => {
      writeSaveFile({ version: 1, savedAt: new Date().toISOString(), setup: save.setup, seed: save.seed, snapshot });
    };
    set({ session, screen: 'game' });
    runSessionToCompletion(session);
  },

  recordGameEnd: () => {
    const session = get().session;
    const gameOver = session?.state.gameOver;
    if (!session || !gameOver) return;
    const state = session.state;
    const stats = { ...get().stats };
    stats.gamesPlayed++;
    const won = gameOver.outcome === 'win';
    if (won) stats.gamesWon++;

    const clearedCount = won ? state.bossQueue.length : state.bossIndex;
    for (let i = 0; i < clearedCount; i++) {
      const boss = state.bossQueue[i];
      stats.bossesDefeated[boss] = (stats.bossesDefeated[boss] ?? 0) + 1;
    }
    if (!won && state.bossIndex < state.bossQueue.length) {
      const boss = state.bossQueue[state.bossIndex];
      stats.bossesFailed[boss] = (stats.bossesFailed[boss] ?? 0) + 1;
    }

    for (const [playerIdStr, count] of Object.entries(state.deathCounts)) {
      const p = state.players.find((pl) => pl.id === Number(playerIdStr));
      if (p) stats.charDeaths[p.charId] = (stats.charDeaths[p.charId] ?? 0) + (count ?? 0);
    }
    // state.lastShotCounts is tallied straight off battle.finishedBy at the end of every battle
    // (walk.ts) — every character's kill counts here, not just Eric's and Liora's-via-Meteor's own
    // point conditions (eric2/liora2), which used to be the only source for this stat and silently
    // undercounted Kit, Luna, Dax, Mira, and Liora's other skills.
    for (const [playerIdStr, count] of Object.entries(state.lastShotCounts)) {
      const p = state.players.find((pl) => pl.id === Number(playerIdStr));
      if (p) stats.charLastShots[p.charId] = (stats.charLastShots[p.charId] ?? 0) + (count ?? 0);
    }

    saveStats(stats);
    set({ stats });
    if (won) clearSaveFile();
    set({ hasSave: loadSaveFile() != null });
  },
}));

function runSessionToCompletion(session: GameSession) {
  session.run().then(() => {
    useAppStore.getState().recordGameEnd();
    const outcome = session.state.gameOver?.outcome;
    if (outcome === 'win') clearSaveFile();
    useAppStore.setState({ screen: outcome === 'win' ? 'scoring' : 'allLose' });
  });
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
