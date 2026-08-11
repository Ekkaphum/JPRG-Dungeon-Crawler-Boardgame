import { describe, it, expect } from 'vitest';
import { createRNG, prepareBattle, killFighter, runClockBattle, type Choice, type PendingDecision } from '@engine/index';
import { fixedDraftState } from './testUtils';

function battle() {
  const state = fixedDraftState();
  prepareBattle(state);
  return state;
}

describe('death and revival placement (GAME_DESIGN_v0_3_0.md §5.4)', () => {
  it('moves the pawn to its revival slot, 6 below where it died', () => {
    const state = battle();
    state.battle!.marker = 18;
    const f = state.battle!.fighters[0];
    f.slot = 16;
    killFighter(state, f);

    expect(f.reviveAtSlot).toBe(12);
    // The pawn must not be left behind on a slot the marker has already passed, or it could never
    // line up with the marker again and would sit out the rest of the battle.
    expect(f.slot).toBe(12);
  });

  it('leaves the pawn off the clock when fewer than 6 slots remain', () => {
    const state = battle();
    state.battle!.marker = 4;
    const f = state.battle!.fighters[0];
    killFighter(state, f);
    expect(f.reviveAtSlot).toBeNull();
  });

  it('revives on reaching the slot and gets to declare in that same visit', async () => {
    const state = battle();
    const rng = createRNG(5);
    const gen = runClockBattle(state, rng);

    const target = state.players[0].id;
    let killed = false;
    let declaredAfterRevive = false;
    let revivedAt: number | null = null;

    let res = gen.next();
    let steps = 0;
    while (!res.done) {
      if (++steps > 5000) throw new Error('did not terminate');
      const d: PendingDecision = res.value;
      if (d.kind !== 'DECLARE_ACTION') throw new Error('unexpected decision');

      // Kill the target the first time anyone acts, then watch for it coming back.
      if (!killed && d.playerId !== target) {
        const f = state.battle!.fighters.find((x) => x.playerId === target)!;
        killFighter(state, f);
        revivedAt = f.reviveAtSlot;
        killed = true;
      }
      if (killed && d.playerId === target) {
        const f = state.battle!.fighters.find((x) => x.playerId === target)!;
        // Being asked to declare at all proves it rejoined the walk order.
        expect(f.alive).toBe(true);
        expect(state.battle!.marker).toBe(revivedAt);
        declaredAfterRevive = true;
        break;
      }

      const choice: Choice = { kind: 'DECLARE_ACTION', skillId: 'Slash' };
      const player = state.players.find((p) => p.id === d.playerId)!;
      // fixedDraftState() always assigns the first 4 CHAR_IDS in order, so only these ever appear
      // here — Dax/Mira are listed purely so this lookup type-checks against the full CharId union.
      const first = { Matt: 'Slash', Kit: 'QuickShot', Vera: 'Fireball', Luna: 'Smite', Dax: 'Flurry', Mira: 'FrostBolt' }[player.charId];
      res = gen.next({ ...choice, skillId: first as never, ...(player.charId === 'Vera' ? { manaSpent: 0 } : {}) });
    }

    expect(killed).toBe(true);
    expect(declaredAfterRevive).toBe(true);
  });
});
