import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSaveFile } from '@session/persistence';
import { fixedDraftState, fourEasyBotSetup } from './testUtils';

afterEach(() => vi.unstubAllGlobals());

describe('save migration', () => {
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
});
