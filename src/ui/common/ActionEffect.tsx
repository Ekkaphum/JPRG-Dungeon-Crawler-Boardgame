import type { SkillId } from '@engine/index';
import type { CSSProperties } from 'react';

/** Every player action owns a four-frame effect strip under public/assets/effects. Keeping this
 * record exhaustive makes a newly-added SkillId fail typecheck until its visual is supplied. */
export const ACTION_EFFECT_SPRITES = {
  Slash: '/assets/effects/Slash.png',
  PowerStrike: '/assets/effects/PowerStrike.png',
  Guard: '/assets/effects/Guard.png',
  CounterAttack: '/assets/effects/CounterAttack.png',
  QuickShot: '/assets/effects/QuickShot.png',
  SharpShooting: '/assets/effects/SharpShooting.png',
  Trap: '/assets/effects/Trap.png',
  MultiShot: '/assets/effects/MultiShot.png',
  AirPush: '/assets/effects/AirPush.png',
  Fireball: '/assets/effects/Fireball.png',
  AuraCharge: '/assets/effects/AuraCharge.png',
  Meteor: '/assets/effects/Meteor.png',
  Hitting: '/assets/effects/Hitting.png',
  AuraSmite: '/assets/effects/AuraSmite.png',
  Blessing: '/assets/effects/Blessing.png',
  Heal: '/assets/effects/Heal.png',
  Tick: '/assets/effects/Tick.png',
  HourglassShard: '/assets/effects/HourglassShard.png',
  Haste: '/assets/effects/Haste.png',
  Rewind: '/assets/effects/Rewind.png',
  Shuriken: '/assets/effects/Shuriken.png',
  TwinFang: '/assets/effects/TwinFang.png',
  SmokeBomb: '/assets/effects/SmokeBomb.png',
  Assassinate: '/assets/effects/Assassinate.png',
  Drain: '/assets/effects/Drain.png',
  SoulSiphon: '/assets/effects/SoulSiphon.png',
  RaiseDead: '/assets/effects/RaiseDead.png',
  DeathCoil: '/assets/effects/DeathCoil.png',
  // ── v0.4.5 ── Each of these ships as its own file that is currently a byte-for-byte copy of the
  // strip belonging to the card it replaces. Copies rather than aliases on purpose: the file the
  // card wants already exists at the path the card names, so replacing any one of them with real
  // art is dropping a PNG in place, with no code change and nothing else affected.
  SightingShot: '/assets/effects/SightingShot.png',
  ManaDrain: '/assets/effects/ManaDrain.png',
  Freeze: '/assets/effects/Freeze.png',
  AuraShield: '/assets/effects/AuraShield.png',
  HolySmite: '/assets/effects/HolySmite.png',
  Praying: '/assets/effects/Praying.png',
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
