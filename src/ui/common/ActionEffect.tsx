import type { SkillId } from '@engine/index';
import type { CSSProperties } from 'react';

/** Every player action owns a four-frame effect strip under public/assets/effects. Keeping this
 * record exhaustive makes a newly-added SkillId fail typecheck until its visual is supplied. */
export const ACTION_EFFECT_SPRITES = {
  Slash: '/assets/effects/Slash.webp',
  PowerStrike: '/assets/effects/PowerStrike.webp',
  Guard: '/assets/effects/Guard.webp',
  CounterAttack: '/assets/effects/CounterAttack.webp',
  QuickShot: '/assets/effects/QuickShot.webp',
  SharpShooting: '/assets/effects/SharpShooting.webp',
  Trap: '/assets/effects/Trap.webp',
  MultiShot: '/assets/effects/MultiShot.webp',
  AirPush: '/assets/effects/AirPush.webp',
  Fireball: '/assets/effects/Fireball.webp',
  AuraCharge: '/assets/effects/AuraCharge.webp',
  Meteor: '/assets/effects/Meteor.webp',
  Hitting: '/assets/effects/Hitting.webp',
  AuraSmite: '/assets/effects/AuraSmite.webp',
  Blessing: '/assets/effects/Blessing.webp',
  Heal: '/assets/effects/Heal.webp',
  Tick: '/assets/effects/Tick.webp',
  HourglassShard: '/assets/effects/HourglassShard.webp',
  Haste: '/assets/effects/Haste.webp',
  Rewind: '/assets/effects/Rewind.webp',
  Shuriken: '/assets/effects/Shuriken.webp',
  TwinFang: '/assets/effects/TwinFang.webp',
  SmokeBomb: '/assets/effects/SmokeBomb.webp',
  Assassinate: '/assets/effects/Assassinate.webp',
  Drain: '/assets/effects/Drain.webp',
  SoulSiphon: '/assets/effects/SoulSiphon.webp',
  RaiseDead: '/assets/effects/RaiseDead.webp',
  DeathCoil: '/assets/effects/DeathCoil.webp',
  // ── v0.4.5 ── Each of these ships as its own file that is currently a byte-for-byte copy of the
  // strip belonging to the card it replaces. Copies rather than aliases on purpose: the file the
  // card wants already exists at the path the card names, so replacing any one of them with real
  // art is dropping a PNG in place, with no code change and nothing else affected.
  SightingShot: '/assets/effects/SightingShot.webp',
  ManaDrain: '/assets/effects/ManaDrain.webp',
  Freeze: '/assets/effects/Freeze.webp',
  AuraShield: '/assets/effects/AuraShield.webp',
  HolySmite: '/assets/effects/HolySmite.webp',
  Praying: '/assets/effects/Praying.webp',
} as const satisfies Record<SkillId, string>;

export function actionEffectSpriteUrl(skillId: SkillId): string {
  return ACTION_EFFECT_SPRITES[skillId];
}

/** Decorative four-frame pixel-art VFX. ActionFlash's changing key remounts this node for each
 * event, so its one-shot sprite animation always starts at frame zero. */
export function ActionEffect({ skillId }: { skillId: SkillId }) {
  const style = {
    '--effect-sprite': `url(${actionEffectSpriteUrl(skillId)})`,
  } as CSSProperties;

  return (
    <div className="action-effect" data-skill={skillId} aria-hidden="true">
      <div className="action-effect__sprite" style={style} />
    </div>
  );
}
