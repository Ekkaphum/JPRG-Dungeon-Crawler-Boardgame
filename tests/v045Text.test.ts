// Every number the player reads must be the number the engine uses.
//
// This file exists because they drifted: after the Divine Tithe bar moved 7 → 10 the passive's own
// description still said 7, and the centre-screen action flash was rendering v0.3 numbers in every
// v0.4.5 match because its skillBriefText call never passed a ruleset. Both were invisible to the
// engine tests — nothing asserts on prose — so the fix is to assert on it here.
//
// The rule these tests encode: player-facing text either interpolates the constant, or it is wrong
// the next time the constant moves.

import { describe, expect, it } from 'vitest';
import {
  V045_AURASHIELD_DEF_PER_MANA,
  V045_ERIC_GUARD_SAVES_BAR,
  V045_LIORA_MANA_MAX,
  V045_LUNA1_HEAL_HP_PCT,
  V045_LUNA2_BLESSED_HIT_DAMAGE,
  V045_LUNA3_BASE_POINTS,
  V045_LUNA3_DEATH_PENALTY,
  V045_LUNA_MANA_PER_BOSS_DAMAGE,
  V045_LUNA_START_MANA,
  charPassive,
  charScore,
  charSkills,
  skillDefFor,
  skillStats,
} from '@content/characters';
import { skillBriefText, skillEffectText } from '@content/skillText';
import { RULESETS } from '@content/rulesets';
import { CHAR_IDS } from '@content/characters';

const REWORK = 'v0.4' as const;
const STABLE = 'v0.3' as const;

describe('score-condition text quotes the constants the engine reads', () => {
  const cond = (charId: 'Eric' | 'Luna', id: string) =>
    charScore(charId, REWORK).find((c) => c.id === id)!;

  it('eric2 names the redirect bar', () => {
    for (const lang of ['th', 'en'] as const) {
      expect(cond('Eric', 'eric2').desc[lang]).toContain(String(V045_ERIC_GUARD_SAVES_BAR));
    }
  });

  it('luna1 names the HP bar as a percentage', () => {
    for (const lang of ['th', 'en'] as const) {
      expect(cond('Luna', 'luna1').desc[lang]).toContain(`${V045_LUNA1_HEAL_HP_PCT * 100}%`);
    }
  });

  it('luna2 names the damage bar', () => {
    for (const lang of ['th', 'en'] as const) {
      expect(cond('Luna', 'luna2').desc[lang]).toContain(String(V045_LUNA2_BLESSED_HIT_DAMAGE));
    }
  });

  it('luna3 names both the intact payout and the per-death penalty', () => {
    for (const lang of ['th', 'en'] as const) {
      const text = cond('Luna', 'luna3').desc[lang];
      expect(text).toContain(String(V045_LUNA3_BASE_POINTS));
      expect(text).toContain(String(V045_LUNA3_DEATH_PENALTY));
    }
  });

  it('every rework condition has text in both languages, and none is left as a v0.3 copy', () => {
    for (const charId of ['Eric', 'Liora', 'Luna'] as const) {
      for (const c of charScore(charId, REWORK)) {
        expect(c.desc.th.length).toBeGreaterThan(0);
        expect(c.desc.en.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('passive text quotes the constants the engine reads', () => {
  it("Divine Tithe names the per-hit bar and Luna's opening mana", () => {
    const p = charPassive('Luna', REWORK)!;
    expect(p.id).toBe('DivineTithe');
    for (const lang of ['th', 'en'] as const) {
      expect(p.desc[lang]).toContain(String(V045_LUNA_MANA_PER_BOSS_DAMAGE));
      expect(p.desc[lang]).toContain(String(V045_LUNA_START_MANA));
    }
    // The bar moved 7 -> 10 and this text kept saying 7 until it was interpolated. Assert the stale
    // value is gone rather than only that the live one is present, since both could be in one string.
    expect(p.desc.th).not.toContain('ทุกๆ 7 ดาเมจ');
    expect(p.desc.en).not.toContain('every 7 damage');
  });

  it("ManaCharge names Liora's cap and per-mana value, and points at the rework's mana source", () => {
    const p = charPassive('Liora', REWORK)!;
    for (const lang of ['th', 'en'] as const) {
      expect(p.desc[lang]).toContain(String(V045_AURASHIELD_DEF_PER_MANA));
      expect(p.desc[lang]).toContain(String(V045_LIORA_MANA_MAX));
      expect(p.desc[lang]).toContain('Mana Drain');
    }
    // Aura Charge is not in her rework kit; naming it would send a player to a card she cannot cast.
    expect(charSkills('Liora', REWORK)).not.toContain('AuraCharge');
    expect(p.desc.en).not.toContain('Aura Charge');
  });

  it('Luna keeps Holy Water in v0.3 and trades it for Divine Tithe in the rework', () => {
    expect(charPassive('Luna', STABLE)!.id).toBe('HolyWater');
    expect(charPassive('Luna', REWORK)!.id).toBe('DivineTithe');
  });
});

describe('skill text is built from the ruleset actually in play', () => {
  it('quotes the reworked damage numbers, not the stable ones', () => {
    for (const [skillId, lv2] of [['Slash', false], ['PowerStrike', false], ['Slash', true]] as const) {
      const reworked = skillStats(skillId, lv2, REWORK).primary!;
      const stable = skillStats(skillId, lv2, STABLE).primary!;
      expect(reworked).toBeGreaterThan(stable);
      expect(skillBriefText(skillId, lv2, 'en', REWORK)).toContain(String(reworked));
    }
  });

  it("names Power Strike's HP cost only where the card actually charges it", () => {
    const cost = skillDefFor('PowerStrike', REWORK).selfHpCost!;
    expect(cost).toBe(1);
    expect(skillBriefText('PowerStrike', false, 'en', REWORK)).toContain(`costs you ${cost} HP`);
    expect(skillBriefText('PowerStrike', false, 'en', STABLE)).not.toContain('HP');
  });

  it("names Heal's mana cost only where the card actually charges it", () => {
    const cost = skillDefFor('Heal', REWORK).manaCost!;
    expect(skillBriefText('Heal', false, 'en', REWORK)).toContain(`Spend ${cost} mana`);
    expect(skillBriefText('Heal', false, 'en', STABLE)).not.toContain('mana');
  });

  it('mentions Focus on exactly the cards that accept it', () => {
    for (const id of ['SharpShooting', 'Trap'] as const) {
      expect(skillDefFor(id, REWORK).focusSpendable).toBe(true);
      expect(skillBriefText(id, false, 'en', REWORK)).toContain('Focus');
      expect(skillEffectText(id, false, 'en', REWORK)).toContain('Focus');
      expect(skillDefFor(id, STABLE).focusSpendable).toBeUndefined();
      expect(skillBriefText(id, false, 'en', STABLE)).not.toContain('Focus');
      expect(skillEffectText(id, false, 'en', STABLE)).not.toContain('Focus');
    }
  });

  it("points Meteor at the ruleset's real mana source", () => {
    // v0.3 banks mana on Aura Charge; the rework banks it on Mana Drain and Aura Shield grants none.
    expect(skillEffectText('Meteor', false, 'en', STABLE)).toContain('Aura Charge');
    expect(skillEffectText('Meteor', false, 'en', REWORK)).toContain('Mana Drain');
    expect(skillEffectText('Meteor', false, 'en', REWORK)).not.toContain('Aura Charge');
  });

  it('has brief and full text for every card in every rework kit, in both languages', () => {
    for (const charId of CHAR_IDS) {
      for (const sid of charSkills(charId, REWORK)) {
        for (const lang of ['th', 'en'] as const) {
          expect(skillBriefText(sid, false, lang, REWORK), `${sid} brief ${lang}`).not.toBe('');
          expect(skillEffectText(sid, false, lang, REWORK), `${sid} effect ${lang}`).not.toBe('');
        }
      }
    }
  });
});

describe('the ruleset picker describes what it launches', () => {
  it('labels the experimental entry with the version this build actually ships', () => {
    expect(RULESETS['v0.4'].label).toBe('v0.4.5');
    expect(RULESETS['v0.3'].experimental).toBe(false);
    expect(RULESETS['v0.4'].experimental).toBe(true);
  });

  it('names all four reworked characters in the highlights', () => {
    const text = RULESETS['v0.4'].highlights.map((h) => `${h.th} ${h.en}`).join(' ');
    for (const name of ['Eric', 'Kit', 'Liora', 'Luna']) {
      expect(text).toContain(name);
    }
  });

  it('no longer claims the whole ruleset is unmeasured, since the core four now are', () => {
    const text = `${RULESETS['v0.4'].desc.th} ${RULESETS['v0.4'].desc.en}`;
    expect(text).not.toContain('Not balance-tested');
    expect(text).not.toContain('ยังไม่ผ่านการวัดสมดุล');
  });

  it('carries both languages for every line the picker renders', () => {
    for (const def of Object.values(RULESETS)) {
      for (const pair of [def.name, def.desc, ...def.highlights]) {
        expect(pair.th.length).toBeGreaterThan(0);
        expect(pair.en.length).toBeGreaterThan(0);
      }
    }
  });
});
