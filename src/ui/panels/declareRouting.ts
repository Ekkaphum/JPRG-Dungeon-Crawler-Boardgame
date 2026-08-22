import type { SkillId, SkillKind } from '@content/characters';

/**
 * How the declare panel routes a chosen card: straight to submit, or into a follow-up picker.
 *
 * Extracted out of DecisionPanel and made exhaustive on purpose. It used to be an inline `if` that
 * listed the "no extra input needed" kinds and fell through to `setSkillId` for everything else —
 * which meant a newly added SkillKind with no picker branch silently rendered *nothing*: the card
 * highlighted, the panel emptied, and the turn stalled with no error anywhere. That is exactly how
 * v0.4.0 shipped Haste, Smoke Bomb, Rewind and Raise Dead as dead buttons.
 *
 * Being a total function over SkillKind means TypeScript now fails the build if a kind is added
 * without deciding how it is declared, and `declareRouting.test.ts` fails if a kind claims to need
 * a picker that the panel does not actually render.
 */
export type DeclareRoute =
  /** Nothing more to ask — submit the moment the card is clicked. */
  | { kind: 'submit' }
  /** Needs a follow-up choice; `picker` names the branch the panel must render for it. */
  | { kind: 'picker'; picker: DeclarePicker };

export type DeclarePicker = 'mana' | 'guardTarget' | 'healTarget' | 'trapSlot' | 'hasteTarget' | 'raiseTarget' | 'deathCoilCost' | 'shieldTarget';

/** Every picker the panel implements. Kept next to the routing so the test can hold the two to
 *  each other rather than trusting a comment. */
export const IMPLEMENTED_PICKERS: DeclarePicker[] = [
  'mana',
  'guardTarget',
  'healTarget',
  'trapSlot',
  'hasteTarget',
  'raiseTarget',
  'deathCoilCost',
  'shieldTarget',
];

export function declareRoute(skillId: SkillId, kind: SkillKind): DeclareRoute {
  // Death Coil is the one card whose follow-up is decided by the skill rather than its kind: it is
  // an ordinary `attack`, but Morvane chooses whether to pay its HP surcharge.
  if (skillId === 'DeathCoil') return { kind: 'picker', picker: 'deathCoilCost' };

  switch (kind) {
    case 'attack':
    case 'attackGated':
    case 'attackRoll':
    case 'multiHit':
    case 'buffCounter':
    case 'buffParty':
    case 'buffMana':
    // v0.4.0: both of these are self-contained. Smoke Bomb reads who is standing with the caster,
    // and Rewind takes no target at all — neither has anything left to ask.
    case 'buffStealth':
    case 'rewind':
    // v0.4.5: Praying takes no target and no amount — the mana it grants is fixed by the card.
    case 'manaGain':
      return { kind: 'submit' };
    // v0.4.5 Aura Shield asks two things at once (who, and how much mana to pour in), so its picker
    // renders both rows together rather than being split into two steps.
    case 'buffShield':
      return { kind: 'picker', picker: 'shieldTarget' };
    case 'attackMana':
      return { kind: 'picker', picker: 'mana' };
    case 'guard':
      return { kind: 'picker', picker: 'guardTarget' };
    case 'heal':
      return { kind: 'picker', picker: 'healTarget' };
    case 'trap':
      return { kind: 'picker', picker: 'trapSlot' };
    case 'buffHaste':
      return { kind: 'picker', picker: 'hasteTarget' };
    case 'raise':
      return { kind: 'picker', picker: 'raiseTarget' };
  }
}
