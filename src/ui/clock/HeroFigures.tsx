import type { BattleState, GameState } from '@engine/index';
import { charImageUrl } from '@ui/common/assets';
import { DamagePopups } from '@ui/common/DamagePopups';
import { StatusBadges } from '@ui/common/StatusBadges';
import { heroStatuses } from '@content/statuses';
import type { DamagePopup } from '@session/playback';
import type { ActionFlash } from '@session/playback';
import { HeroSprite, hasSpriteSheet, isCastingSkill } from './HeroSprite';
import { latestDamagePopupId } from './spriteHit';

const EDGE_FADE = 'radial-gradient(ellipse 60% 62% at 50% 45%, #000 55%, transparent 98%)';

// A flex item's default min-height:auto does not propagate down through nested flex containers —
// without explicit min-heights at every level below, the outer 50% cap on the group would shrink
// each wrap past what .hero-sprite's own min-height allows, and the sprite would overflow its
// wrap and overlap the next hero instead of the group simply exceeding the cap.
/** .hero-hp-plate's own rendered height. */
const HERO_PLATE_H = 20;
/** One hero slot's natural bounds: .hero-sprite's own min/max-height (80/112) plus the plate. */
const HERO_SLOT_MIN = 80 + HERO_PLATE_H;
const HERO_SLOT_MAX = 112 + HERO_PLATE_H;
/** The floor the whole 4-hero column needs (gap-0.5 = 2px between the 4 slots) — exported so
 *  GameScreen can size .battle-stage tall enough that this never gets clipped by its
 *  overflow-hidden. */
export const HERO_GROUP_MIN = HERO_SLOT_MIN * 4 + 2 * 3;

/** Party front line: four heroes stand in equal top-to-bottom slots with an HP plate locked below
 *  each sprite. The group is capped at half the available column height (`max-h-[50%]` below) —
 *  on a tall/portrait viewport that keeps the four heroes clustered in the middle with margin
 *  above and below, shrinking them (down to .hero-sprite's own min-height floor) rather than
 *  spreading them across the whole column. The whole figure remains a button that opens the hero
 *  detail panel. */
export function HeroFigures({
  state,
  battle,
  popups = [],
  actionFlash,
  onSelect,
}: {
  state: GameState;
  battle: BattleState;
  popups?: DamagePopup[];
  actionFlash?: ActionFlash | null;
  onSelect?: (playerId: number) => void;
}) {
  return (
    <div
      className="hero-figures flex flex-col items-end justify-center w-full flex-1 max-h-[50%] gap-0.5"
      style={{ minHeight: HERO_GROUP_MIN }}
    >
      {state.players.map((p) => {
        const f = battle.fighters.find((x) => x.playerId === p.id)!;
        const mine = popups.filter((pop) => pop.target === p.id);
        const hitId = latestDamagePopupId(mine);
        const hpPct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
        const activeFlash = actionFlash?.source === 'skill' && actionFlash.playerId === p.id ? actionFlash : null;
        const pendingSkillId = f.pending?.skillId ?? null;
        const castingSkillId = !activeFlash && isCastingSkill(pendingSkillId) ? pendingSkillId : null;
        return (
          <button
            key={p.id}
            onClick={() => onSelect?.(p.id)}
            title={p.name}
            className="hero-figure relative flex-1 w-full flex flex-col items-center justify-end group cursor-pointer"
            style={{ minHeight: HERO_SLOT_MIN, maxHeight: HERO_SLOT_MAX }}
          >
            {!hasSpriteSheet(p.charId) ? (
              <img
                src={charImageUrl(p.charId)}
                alt={p.charId}
                draggable={false}
                className="hero-art flex-1 min-h-[80px] max-h-[112px] w-auto max-w-full drop-shadow-[0_8px_12px_rgba(0,0,0,0.8)] group-hover:brightness-125 transition"
                style={{ WebkitMaskImage: EDGE_FADE, maskImage: EDGE_FADE, opacity: f.alive ? 1 : 0.3, filter: f.alive ? undefined : 'grayscale(0.8)' }}
              />
            ) : (
              <div className="hero-sprite-wrap flex-1 min-h-[80px] max-h-[112px] w-full flex items-end justify-center">
                <HeroSprite
                  charId={p.charId}
                  skillId={activeFlash?.skillId ?? castingSkillId}
                  actionId={activeFlash?.id}
                  hitId={hitId}
                  casting={castingSkillId !== null}
                  alive={f.alive}
                />
              </div>
            )}
            {/* HP tag under the figure, with status pills sitting to the left of the name. */}
            <div className="hero-hp-plate w-full max-w-[118px] flex-shrink-0 bg-black/75 rounded px-1 py-[2px] border border-gold-dim/40">
              <div className="flex items-center gap-1 leading-none">
                <StatusBadges statuses={heroStatuses(battle, f)} />
                <span className="text-[9px] gold-text truncate">{p.name}</span>
                <span className="text-[9px] font-mono text-gold-bright flex-shrink-0 ml-auto">
                  {f.hp}/{f.maxHp}
                </span>
              </div>
              <div className="mt-[2px] h-[3px] bg-black/60 rounded overflow-hidden">
                <div className="h-full bg-front transition-all" style={{ width: `${hpPct}%` }} />
              </div>
            </div>
            <DamagePopups popups={mine} />
          </button>
        );
      })}
    </div>
  );
}
