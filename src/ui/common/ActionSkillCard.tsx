import type { CSSProperties } from 'react';
import {
  DEATH_COIL_HP_COST,
  SAND_PER_REWIND,
  SHADOW_PER_ASSASSINATE,
  SOULS_PER_DEATH_COIL,
  V045_AURASHIELD_DEF_PER_MANA,
  skillDefFor,
  skillStats,
  type SkillId,
  type SkillKind,
} from '@content/characters';
import { skillEffectText } from '@content/skillText';
import type { Lang } from '@content/i18n';
import type { RulesetVersion } from '@content/rulesets';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import { actionEffectSpriteUrl } from '@ui/common/ActionEffect';

interface StatBadge {
  icon: string;
  label: string;
  tone: 'time' | 'attack' | 'defense' | 'heal' | 'other';
}

function stat(icon: string, label: string, tone: StatBadge['tone']): StatBadge {
  return { icon, label, tone };
}

function effectBadges(skillId: SkillId, kind: SkillKind, isLv2: boolean, lang: Lang, ruleset: RulesetVersion): StatBadge[] {
  const def = skillDefFor(skillId, ruleset);
  const s = skillStats(skillId, isLv2, ruleset);
  const p = s.primary ?? 0;
  const q = s.secondary ?? 0;
  const slots = lang === 'th' ? 'ช่อง' : 'slots';

  switch (kind) {
    case 'attack': {
      const badges = [stat('⚔', skillId === 'TwinFang' ? `${p} ×2` : `${p}`, 'attack')];
      if (skillId === 'Drain') badges.push(stat('✚', '1', 'heal'));
      if (skillId === 'SoulSiphon') badges.push(stat('✚', '2', 'heal'));
      if (skillId === 'SoulSiphon') badges.push(stat('☠', '+1', 'other'));
      if (skillId === 'HourglassShard') badges.push(stat('💫', '+1⏱', 'other'));
      if (skillId === 'Assassinate') badges.push(stat('◒', `-${SHADOW_PER_ASSASSINATE}`, 'other'));
      if (skillId === 'DeathCoil') badges[0] = stat('⚔', `${p} / ${q}`, 'attack');
      if (skillId === 'DeathCoil') badges.push(stat('☠', `-${SOULS_PER_DEATH_COIL}`, 'other'), stat('♥', `-${DEATH_COIL_HP_COST}`, 'other'));
      if (def.focusGain) badges.push(stat('◉', `+${def.focusGain} Focus`, 'other'));
      if (def.manaGain) badges.push(stat('◆', `+${def.manaGain} MP`, 'other'));
      if (def.selfHpCost) badges.push(stat('♥', `-${def.selfHpCost}`, 'other'));
      return badges;
    }
    case 'attackGated':
      return [stat('⚔', `${p} / ${q}`, 'attack')];
    case 'attackRoll':
      return [stat('⚔', `${p}`, 'attack'), stat('⚄', `${s.rollBaseTarget}+`, 'other')];
    case 'attackMana': {
      const badges = [stat('⚔', `${p} +${q}/MP`, 'attack')];
      if (def.slowRollTarget) badges.push(stat('⚄', `${def.slowRollTarget}+`, 'other'));
      return badges;
    }
    case 'multiHit':
      return [stat('⚔', [...(s.earlyHits ?? []).map((hit) => hit.dmg), p].join(' + '), 'attack')];
    case 'heal': {
      const badges = [stat('✚', `${p}`, 'heal')];
      if (def.manaCost) badges.push(stat('◆', `-${def.manaCost} MP`, 'other'));
      return badges;
    }
    case 'buffCounter':
      return [stat('🛡', `${p}%`, 'defense'), stat('⚔', `${q}`, 'attack')];
    case 'buffParty':
      return [stat('⚔', `+${p}`, 'attack'), stat('🛡', `+${q}`, 'defense')];
    case 'buffMana':
      return [stat('🛡', `+${q}`, 'defense'), stat('◆', '+1 MP', 'other')];
    case 'guard':
      return [stat('🛡', `${p}`, 'defense')];
    case 'trap':
      return [stat('⚔', `${p}`, 'attack'), stat('⚄', `${s.rollBaseTarget}+`, 'other')];
    case 'buffHaste':
      return [stat('«', `${p} ${slots}`, 'other')];
    case 'buffStealth':
      return [stat('◉', `${q} ${slots}`, 'other'), stat('⚔', `+${p}`, 'attack')];
    case 'raise':
      return [stat('✚', `${p}% HP`, 'heal')];
    case 'rewind':
      return [stat('↶', `${p} ${slots}`, 'other'), stat('⌛', `-${SAND_PER_REWIND}`, 'other')];
    case 'manaGain':
      return [stat('◆', `+${def.manaGain ?? 0} MP`, 'other')];
    case 'buffShield':
      return [stat('🛡', `+${q}`, 'defense'), stat('◆', `+${V045_AURASHIELD_DEF_PER_MANA}/MP`, 'other')];
  }
}

export function ActionSkillCard({
  skillId,
  isLv2,
  ruleset,
  disabled,
  landingText,
  tooSlow,
  onClick,
}: {
  skillId: SkillId;
  isLv2: boolean;
  ruleset: RulesetVersion;
  disabled: boolean;
  landingText: string;
  tooSlow: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const def = skillDefFor(skillId, ruleset);
  const stats = skillStats(skillId, isLv2, ruleset);
  const badges = [stat('⏱', `${stats.time}`, 'time'), ...effectBadges(skillId, def.kind, isLv2, lang, ruleset)];
  const tooltipId = `action-card-preview-${skillId}`;
  // Through ActionEffect's map rather than rebuilding the path here: this line was still
  // pointing at .png after every other effect URL moved to .webp, precisely because it was a
  // second copy of the same string.
  const artStyle = { '--action-art': `url('${actionEffectSpriteUrl(skillId)}')` } as CSSProperties;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-describedby={tooltipId}
      className="skill-card action-skill-card text-left"
    >
      <span className="action-skill-card__art" style={artStyle} aria-hidden="true" />
      <span className="action-skill-card__compact-stats" aria-hidden="true">
        {badges.slice(0, 3).map((badge, index) => (
          <span key={`${badge.label}-${index}`} className={`action-stat action-stat--${badge.tone}`}>
            <b>{badge.icon}</b> {badge.label}
          </span>
        ))}
      </span>
      <span className="action-skill-card__name font-display">
        {def.immediate && <span title={t('decision.immediateBadge')}>⚡</span>}
        {def.name[lang]}
        {isLv2 && <em>{t('decision.lv2')}</em>}
      </span>

      <span id={tooltipId} role="tooltip" className="action-card-preview">
        <span className="action-card-preview__art" style={artStyle} aria-hidden="true" />
        <span className="action-card-preview__body">
          <span className="action-card-preview__name font-display">
            {def.immediate && <span title={t('decision.immediateBadge')}>⚡ </span>}
            {def.name[lang]}
            {isLv2 && <em>{t('decision.lv2')}</em>}
          </span>
          <span className="action-card-preview__stats">
            {badges.map((badge, index) => (
              <span key={`${badge.label}-${index}`} className={`action-stat action-stat--${badge.tone}`}>
                <b>{badge.icon}</b> {badge.label}
              </span>
            ))}
          </span>
          <span className="action-card-preview__description">{skillEffectText(skillId, isLv2, lang, ruleset)}</span>
          <span className={`action-card-preview__landing ${tooSlow ? 'is-too-slow' : ''}`}>{landingText}</span>
        </span>
      </span>
    </button>
  );
}
