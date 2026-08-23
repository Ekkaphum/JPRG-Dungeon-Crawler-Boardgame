import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSaveFile, loadStats } from '@session/persistence';
import { prepareBattle } from '@engine/index';
import { fixedDraftState, fourEasyBotSetup } from './testUtils';

afterEach(() => vi.unstubAllGlobals());

describe('save migration', () => {
  it('renames the fracture ruleset id that shipped for one release as a version', () => {
    // The fracture ruleset went out keyed as `v0.4.6` before ids and labels were separated. A save
    // made in that window still names it, and an unmigrated one would fail every hasFractures()
    // check silently — the game would load and simply have no fracture lines.
    const state = fixedDraftState();
    (state as unknown as { ruleset: string }).ruleset = 'v0.4.6';
    const save = { version: 1, savedAt: new Date(0).toISOString(), setup: fourEasyBotSetup(), seed: 1, snapshot: state };
    const storage = new Map<string, string>([['mc.save.v3', JSON.stringify(save)]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    expect(loadSaveFile()!.snapshot.ruleset).toBe('fracture');
  });

  it('splits the legacy shared Skill Improvement number into two preserved counters', () => {
    const state = fixedDraftState();
    const kit = state.players.find((player) => player.charId === 'Kit')!;
    (state.progress[kit.id] as unknown as { rollPenalty: number }).rollPenalty = 2;
    const save = { version: 1, savedAt: new Date(0).toISOString(), setup: fourEasyBotSetup(), seed: 1, snapshot: state };
    const storage = new Map<string, string>([['mc.save.v3', JSON.stringify(save)]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    const loaded = loadSaveFile()!;
    expect(loaded.snapshot.progress[kit.id].rollPenalty).toEqual({ SharpShooting: 2, Trap: 2 });
  });

  it('renames legacy character IDs without changing matching player names', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    state.players[0].name = 'Matt';
    state.players[2].name = 'Vera';
    (state.players[0] as unknown as { charId: string }).charId = 'Matt';
    (state.players[2] as unknown as { charId: string }).charId = 'Vera';
    (state.progress[0] as unknown as { charId: string }).charId = 'Matt';
    (state.progress[2] as unknown as { charId: string }).charId = 'Vera';
    (state.battle!.fighters[0] as unknown as { charId: string }).charId = 'Matt';
    (state.battle!.fighters[2] as unknown as { charId: string }).charId = 'Vera';
    const save = { version: 1, savedAt: new Date(0).toISOString(), setup: fourEasyBotSetup(), seed: 1, snapshot: state };
    const storage = new Map<string, string>([['mc.save.v3', JSON.stringify(save)]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    const loaded = loadSaveFile()!;
    expect(loaded.snapshot.players.map((player) => player.charId)).toEqual(['Eric', 'Kit', 'Liora', 'Luna']);
    expect(loaded.snapshot.players.map((player) => player.name)).toEqual(['Matt', 'P1', 'Vera', 'P3']);
    expect(loaded.snapshot.progress[0].charId).toBe('Eric');
    expect(loaded.snapshot.progress[2].charId).toBe('Liora');
    expect(loaded.snapshot.battle!.fighters.map((fighter) => fighter.charId)).toEqual(['Eric', 'Kit', 'Liora', 'Luna']);
  });

  it('merges legacy death and last-shot statistics into the renamed characters', () => {
    const storage = new Map<string, string>([
      [
        'mc.stats.v3',
        JSON.stringify({
          gamesPlayed: 2,
          gamesWon: 1,
          byBotLevel: {},
          bossesDefeated: {},
          bossesFailed: {},
          charDeaths: { Matt: 2, Eric: 1, Vera: 3 },
          charLastShots: { Matt: 1, Vera: 2, Liora: 1 },
        }),
      ],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    const stats = loadStats();
    expect(stats.charDeaths).toEqual({ Eric: 3, Liora: 3 });
    expect(stats.charLastShots).toEqual({ Eric: 1, Liora: 3 });
  });
});
