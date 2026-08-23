import type { BattleState } from '@engine/index';
import { BOSSES } from '@content/bosses3';
import { bossStatuses } from '@content/statuses';
import { landSlotDisplay } from '@content/eventText';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import { DamagePopups } from '@ui/common/DamagePopups';
import { StatusBadges } from '@ui/common/StatusBadges';
import type { ActionFlash, DamagePopup } from '@session/playback';
import { BossSprite } from './BossSprite';
import { FractureChips, FractureTicks } from './FractureTrack';
import { latestDamagePopupId } from './spriteHit';

/** Boss standing large on the left of the stage — status pills over its head, HP plate at its
 *  feet, whole figure clickable for the full detail panel. */
export function BossFigure({
  battle,
  popups = [],
  actionFlash,
  onSelect,
}: {
  battle: BattleState;
  popups?: DamagePopup[];
  actionFlash?: ActionFlash | null;
  onSelect?: () => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const def = BOSSES[battle.bossId];
  const hpPct = Math.max(0, Math.min(100, (battle.bossHp / battle.bossHpMax) * 100));
  const activeFlash = actionFlash?.source === 'boss' ? actionFlash : null;
  const hitId = latestDamagePopupId(popups);

  return (
    <button onClick={onSelect} className="boss-figure relative w-full h-full flex flex-col items-center justify-center group cursor-pointer" title={def.name[lang]}>
      {/* flex-1 lets .boss-sprite's height:100% clamp between its min/max against real available
          space. min-h/max-h (matching .boss-sprite's own 175/245px) bound this wrap to what the
          sprite actually needs — a bare min-h-0 would let the wrap shrink past the sprite's own
          min-height on a very short stage, overflowing into the HP plate below, and max-content
          isn't used for the ceiling because a percentage height inside a max-content computation
          resolves as if it were auto, which collapsed the sprite to its min-height instead of
          growing it. Real pixels keep leftover column space splitting evenly above/below via
          justify-center instead of the boss being pinned to one edge or stuck at its floor size. */}
      <div className="boss-sprite-wrap flex-1 min-h-[175px] max-h-[245px] w-full flex items-end justify-center">
        <BossSprite bossId={battle.bossId} moveKey={activeFlash?.moveKey ?? null} actionId={activeFlash?.id} hitId={hitId} />
      </div>
      <div className="boss-hp-plate w-[92%] max-w-[260px] gold-frame rounded px-2 py-1 bg-black/75 flex-shrink-0">
        <div className="flex items-center gap-1">
          <StatusBadges statuses={bossStatuses(battle)} />
          <span className="font-display gold-text text-xs leading-tight truncate">{def.name[lang]}</span>
          <span className="text-[9px] text-gold-dim flex-shrink-0 ml-auto">{def.sin[lang]}</span>
        </div>
        {/* relative: the fracture ticks are absolutely placed against this track, so a line at
            60% of max HP sits where the draining fill actually reaches it. */}
        <div className="mt-1 h-2 bg-black/50 rounded overflow-hidden relative">
          <div className="h-full bg-boss transition-all" style={{ width: `${hpPct}%` }} />
          <FractureTicks battle={battle} />
        </div>
        <div className="text-[10px] text-gold-dim mt-0.5 flex justify-between gap-2">
          <span className="font-mono">
            {battle.bossHp}/{battle.bossHpMax}
          </span>
          {/* v0.3.14: the boss telegraphs *when*, never *what* — so this shows its next action
              slot and nothing about which move is coming. */}
          <span className="truncate">→ {landSlotDisplay(battle.bossSlot)}</span>
        </div>
        <FractureChips battle={battle} />
      </div>
      <DamagePopups popups={popups} />
      <span className="sr-only">{t('detail.open')}</span>
    </button>
  );
}
