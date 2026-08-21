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
