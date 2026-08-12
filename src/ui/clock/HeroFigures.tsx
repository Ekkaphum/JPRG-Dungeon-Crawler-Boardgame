import type { BattleState, GameState } from '@engine/index';
import { charImageUrl } from '@ui/common/assets';
import { DamagePopups } from '@ui/common/DamagePopups';
import { StatusBadges } from '@ui/common/StatusBadges';
import { heroStatuses } from '@content/statuses';
import type { DamagePopup } from '@session/playback';

const EDGE_FADE = 'radial-gradient(ellipse 60% 62% at 50% 45%, #000 55%, transparent 98%)';

/** Party column on the right of the stage: each hero is a figure with its status pills floating
 *  over its head and an HP tag under its feet, and the whole thing is a button that opens the
 *  hero's detail panel. */
export function HeroFigures({
  state,
  battle,
  popups = [],
  onSelect,
}: {
  state: GameState;
  battle: BattleState;
  popups?: DamagePopup[];
  onSelect?: (playerId: number) => void;
}) {
  const offsets = ['5%', '14%', '2%', '11%'];
  return (
    <div className="hero-figures flex flex-col items-end justify-center h-full w-full gap-0.5">
      {state.players.map((p, i) => {
        const f = battle.fighters.find((x) => x.playerId === p.id)!;
        const mine = popups.filter((pop) => pop.target === p.id);
        const hpPct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
        return (
          <button
            key={p.id}
            onClick={() => onSelect?.(p.id)}
            title={p.name}
            className="hero-figure relative flex-1 min-h-0 w-full flex flex-col items-end justify-end group cursor-pointer"
            style={{ paddingRight: offsets[i % offsets.length] }}
          >
            <img
              src={charImageUrl(p.charId)}
              alt={p.charId}
              draggable={false}
              className="hero-art flex-1 min-h-0 w-auto max-w-full drop-shadow-[0_8px_12px_rgba(0,0,0,0.8)] group-hover:brightness-125 transition"
              style={{
                WebkitMaskImage: EDGE_FADE,
                maskImage: EDGE_FADE,
                opacity: f.alive ? 1 : 0.3,
                filter: f.alive ? undefined : 'grayscale(0.8)',
              }}
            />
            {/* HP tag under the figure, with status pills sitting to the left of the name. */}
            <div className="hero-hp-plate w-[132px] max-w-full bg-black/75 rounded px-1 py-[2px] border border-gold-dim/40">
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
