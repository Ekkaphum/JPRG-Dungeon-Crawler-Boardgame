import type { BattleState } from '@engine/index';
import { BOSSES } from '@content/bosses3';
import { bossStatuses } from '@content/statuses';
import { landSlotDisplay } from '@content/eventText';
import { bossImageUrl } from '@ui/common/assets';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import { DamagePopups } from '@ui/common/DamagePopups';
import { StatusBadges } from '@ui/common/StatusBadges';
import type { DamagePopup } from '@session/playback';

const EDGE_FADE = 'radial-gradient(ellipse 62% 68% at 50% 42%, #000 60%, transparent 100%)';

/** Boss standing large on the left of the stage — status pills over its head, HP plate at its
 *  feet, whole figure clickable for the full detail panel. */
export function BossFigure({ battle, popups = [], onSelect }: { battle: BattleState; popups?: DamagePopup[]; onSelect?: () => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const def = BOSSES[battle.bossId];
  const hpPct = Math.max(0, Math.min(100, (battle.bossHp / battle.bossHpMax) * 100));
  const move = battle.bossPending ? def.moves.find((m) => m.key === battle.bossPending!.moveKey) : null;

  return (
    <button onClick={onSelect} className="relative w-full h-full flex flex-col items-center justify-end group cursor-pointer" title={def.name[lang]}>
      <img
        src={bossImageUrl(battle.bossId)}
        alt={def.name.th}
        draggable={false}
        className="flex-1 min-h-0 w-auto max-w-full drop-shadow-[0_12px_20px_rgba(0,0,0,0.7)] group-hover:brightness-125 transition"
        style={{ WebkitMaskImage: EDGE_FADE, maskImage: EDGE_FADE }}
      />
      <div className="w-[92%] max-w-[260px] gold-frame rounded px-2 py-1 bg-black/75 flex-shrink-0">
        <div className="flex items-center gap-1">
          <StatusBadges statuses={bossStatuses(battle)} />
          <span className="font-display gold-text text-xs leading-tight truncate">{def.name[lang]}</span>
          <span className="text-[9px] text-gold-dim flex-shrink-0 ml-auto">{def.sin[lang]}</span>
        </div>
        <div className="mt-1 h-2 bg-black/50 rounded overflow-hidden">
          <div className="h-full bg-boss transition-all" style={{ width: `${hpPct}%` }} />
        </div>
        <div className="text-[10px] text-gold-dim mt-0.5 flex justify-between gap-2">
          <span className="font-mono">
            {battle.bossHp}/{battle.bossHpMax}
          </span>
          {move && (
            <span className="truncate">
              ⏱{move.time} → {landSlotDisplay(battle.bossPending!.landedAtSlot)}
            </span>
          )}
        </div>
      </div>
      <DamagePopups popups={popups} />
      <span className="sr-only">{t('detail.open')}</span>
    </button>
  );
}
