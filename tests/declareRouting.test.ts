import { describe, it, expect } from 'vitest';
import { CHARACTERS, SKILLS, ALL_CHAR_IDS, type SkillId } from '@content/characters';
import { declareRoute, IMPLEMENTED_PICKERS } from '@ui/panels/declareRouting';

// Regression cover for the v0.4.0 dead-button bug: Haste, Smoke Bomb, Rewind and Raise Dead all
// shipped unclickable. The panel submitted immediately for a hardcoded list of SkillKinds and fell
// through to "open a picker" for everything else — but no picker existed for the new kinds, so the
// card highlighted, the panel rendered nothing, and the turn stalled with no error raised anywhere.
// Nothing failed loudly, which is why tests never caught it.

describe('declare routing covers every skill a player can actually be dealt', () => {
  const everySkill: SkillId[] = [...new Set(ALL_CHAR_IDS.flatMap((c) => CHARACTERS[c].skills))];

  it('routes every skill in the game to either an immediate submit or a picker that exists', () => {
    for (const sid of everySkill) {
      const route = declareRoute(sid, SKILLS[sid].kind);
      if (route.kind === 'picker') {
        expect(IMPLEMENTED_PICKERS, `${sid} asks for a picker the panel does not render`).toContain(route.picker);
      }
    }
  });

  it('covers every SkillKind that any character actually owns', () => {
    const kinds = new Set(everySkill.map((s) => SKILLS[s].kind));
    for (const kind of kinds) {
      // A missing case would be a TypeScript error at build time; this asserts it at runtime too,
      // so the guarantee survives even if the function ever stops being exhaustive by type.
      expect(declareRoute('Slash', kind)).toBeDefined();
    }
  });

  it('the four cards that shipped broken are all reachable', () => {
    expect(declareRoute('Haste', SKILLS.Haste.kind)).toEqual({ kind: 'picker', picker: 'hasteTarget' });
    expect(declareRoute('RaiseDead', SKILLS.RaiseDead.kind)).toEqual({ kind: 'picker', picker: 'raiseTarget' });
    // These two take no further input, so they must submit on the first click rather than opening
    // an empty picker.
    expect(declareRoute('SmokeBomb', SKILLS.SmokeBomb.kind)).toEqual({ kind: 'submit' });
    expect(declareRoute('Rewind', SKILLS.Rewind.kind)).toEqual({ kind: 'submit' });
  });

  it("Death Coil routes by skill, not by kind — it is a plain attack with a cost decision", () => {
    expect(SKILLS.DeathCoil.kind).toBe('attack');
    expect(declareRoute('DeathCoil', SKILLS.DeathCoil.kind)).toEqual({ kind: 'picker', picker: 'deathCoilCost' });
    // Every other attack still submits straight away.
    expect(declareRoute('Slash', SKILLS.Slash.kind)).toEqual({ kind: 'submit' });
  });
});
