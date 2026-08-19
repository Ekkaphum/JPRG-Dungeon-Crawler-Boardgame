import type { SkillId } from '@engine/index';
import type { CSSProperties } from 'react';

export type ActionEffectKind = 'sword' | 'bow' | 'fire' | 'smash' | 'heal' | 'blessing' | 'magic' | 'trap';

const EFFECT_BY_SKILL: Partial<Record<SkillId, ActionEffectKind>> = {
  Slash: 'sword',
  PowerStrike: 'sword',
  CounterAttack: 'sword',
  QuickShot: 'bow',
  SharpShooting: 'bow',
  MultiShot: 'bow',
  Trap: 'trap',
  AirPush: 'magic',
  Fireball: 'fire',
  Meteor: 'fire',
  AuraCharge: 'magic',
  Hitting: 'smash',
  AuraSmite: 'smash',
  Blessing: 'blessing',
  Heal: 'heal',
  // v0.4.0
  Tick: 'magic',
  HourglassShard: 'magic',
  Haste: 'magic',
  Rewind: 'magic',
  Shuriken: 'bow',
  TwinFang: 'sword',
  SmokeBomb: 'magic',
  Assassinate: 'sword',
  Drain: 'magic',
  SoulSiphon: 'magic',
  RaiseDead: 'heal',
  DeathCoil: 'magic',
};

export function actionEffectKind(skillId: SkillId): ActionEffectKind | null {
  return EFFECT_BY_SKILL[skillId] ?? null;
}

/** Decorative, CSS-animated combat glyph. The SVG stays deliberately simple so it remains crisp
 * over the detailed battle painting and scales cleanly from phone to desktop. */
export function ActionEffect({ skillId }: { skillId: SkillId }) {
  const kind = actionEffectKind(skillId);
  if (!kind) return null;

  return (
    <div className={`action-effect action-effect--${kind}`} aria-hidden="true">
      <div className="action-effect__burst" />
      <svg className="action-effect__glyph" viewBox="0 0 160 160">
        {kind === 'sword' && (
          <>
            <path className="effect-stroke effect-sword" d="M31 126 116 41l13-8-8 13-85 85-17 8z" />
            <path className="effect-stroke effect-hilt" d="m36 108 17 17M25 130l8 8" />
            <path className="effect-slash" d="M14 49c42 36 83 55 134 54" />
          </>
        )}
        {kind === 'bow' && (
          <>
            <path className="effect-stroke effect-bow" d="M49 18c45 22 54 94 7 126M49 18c-25 41-22 86 7 126M51 24l3 113" />
            <path className="effect-stroke effect-arrow" d="M18 86h118m0 0-18-12m18 12-18 12" />
            <path className="effect-arrow-trail" d="M4 86h88" />
          </>
        )}
        {kind === 'fire' && (
          <>
            <path className="effect-fire-outer" d="M83 145c-37 0-58-22-52-53 4-22 22-31 30-54 10 12 14 24 12 37 19-15 27-34 23-57 28 21 43 49 34 81-7 28-23 46-47 46Z" />
            <path className="effect-fire-inner" d="M80 136c-17-2-27-13-23-29 3-12 13-18 18-31 13 12 21 27 17 42 7-5 13-12 17-21 5 21-8 41-29 39Z" />
          </>
        )}
        {kind === 'smash' && (
          <>
            <path className="effect-stroke effect-hammer" d="m61 23 64 33-19 36-66-34zM77 75l-43 68" />
            <path className="effect-impact" d="m74 125-13 21m31-17-2 24m18-33 14 21m-69-32-25 11" />
          </>
        )}
        {(kind === 'heal' || kind === 'blessing') && (
          <>
            <circle className="effect-holy-ring" cx="80" cy="80" r="48" />
            <path className="effect-holy-cross" d="M68 30h24v37h37v25H92v38H68V92H31V67h37z" />
            {kind === 'blessing' && <path className="effect-holy-rays" d="M80 5v16M80 139v16M5 80h16M139 80h16M27 27l12 12m82 82 12 12m0-106-12 12m-82 82-12 12" />}
          </>
        )}
        {kind === 'magic' && (
          <>
            <circle className="effect-magic-ring" cx="80" cy="80" r="53" />
            <path className="effect-magic-star" d="m80 22 14 39 42 2-33 25 11 40-34-23-34 23 11-40-33-25 42-2z" />
          </>
        )}
        {kind === 'trap' && (
          <>
            <circle className="effect-trap-ring" cx="80" cy="80" r="51" />
            <path className="effect-stroke effect-trap" d="m31 62 26 14-26 14m98-28-26 14 26 14M58 49l22 27 22-27M58 107l22-31 22 31" />
          </>
        )}
      </svg>
      <div className="action-effect__sparks">
        {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--spark': i } as CSSProperties} />)}
      </div>
    </div>
  );
}
