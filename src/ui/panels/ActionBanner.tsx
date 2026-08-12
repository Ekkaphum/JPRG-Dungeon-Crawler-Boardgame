import type { ClockLogEvent, GameState } from '@engine/index';
import { describeEventWithNames } from '@content/eventText';

/** "What is happening right now" window — shows only the event currently being animated, replaced
 *  by the next one as the battle advances (the scrolling history lives in LogPanel). */
export function ActionBanner({ state, event }: { state: GameState; event: ClockLogEvent | null }) {
  const nameOf = (id: number) => state.players.find((p) => p.id === id)?.name ?? `P${id}`;
  const text = event ? describeEventWithNames(event, nameOf) : null;

  const tone =
    event?.t === 'DEATH'
      ? 'text-boss'
      : event?.t === 'SCORE'
      ? 'text-gold-bright'
      : event?.t === 'REVIVE' || event?.t === 'RESOLVE_HEAL'
      ? 'popup-heal'
      : event?.t === 'RESOLVE_ATTACK' || event?.t === 'RESOLVE_TRAP_TRIGGER'
      ? 'popup-dmg'
      : 'gold-text';

  return (
    <div className="action-banner-board gold-frame rounded-lg px-4 py-2 min-h-[46px] flex items-center justify-center">
      {text ? (
        // key on the event identity so the pop-in animation replays for each new line
        <div key={`${state.bossIndex}-${text}`} className={`pop-in text-center text-sm font-display ${tone}`}>
          {text}
        </div>
      ) : (
        <div className="text-center text-xs text-gold-dim">—</div>
      )}
    </div>
  );
}
