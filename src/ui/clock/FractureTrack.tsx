import type { BattleState, PlayerMeta } from '@engine/index';
import { ITEMS } from '@content/items';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import { itemImageUrl } from '@ui/common/assets';

/** Tick marks laid over the boss's HP bar, one per fracture line.
 *
 *  The bar drains left to right, so a line at 60% of max HP sits at left:60% and the fill edge
 *  reaches it exactly when the rule fires — the mark and the bar meet on screen at the same instant
 *  they meet in the rules. That is why the lines are drawn here rather than listed off to one side:
 *  a bounty the table has to look up is a bounty the table forgets about, and this rule is only
 *  interesting while everybody can see how far away it is. */
export function FractureTicks({ battle }: { battle: BattleState }) {
  if (battle.fractures.length === 0) return null;
  return (
    <>
      {battle.fractures.map((line, i) => (
        <span
          key={i}
          className={`fracture-tick ${line.crossedBy !== null ? 'fracture-tick--crossed' : ''}`}
          style={{ left: `${line.pct * 100}%` }}
        />
      ))}
    </>
  );
}

/** The at-a-glance form: just the two bounty cards' art, dimmed once their line is gone. Deliberately
 *  free of player names and status text, so it can live inside the boss figure — which is a button —
 *  without needing the game state. The full read-out is one tap away in the boss panel. */
export function FractureChips({ battle }: { battle: BattleState }) {
  const lang = useAppStore((s) => s.settings.lang);
  if (battle.fractures.length === 0) return null;
  return (
    <div className="fracture-chips">
      {battle.fractures.map((line, i) => (
        <span
          key={i}
          className={`fracture-chip ${line.crossedBy !== null ? 'fracture-chip--spent' : ''}`}
          title={`${Math.round(line.pct * 100)}% — ${ITEMS[line.itemId].name[lang]}`}
        >
          <img src={itemImageUrl(line.itemId)} alt="" draggable={false} />
          <span className="fracture-chip__pct">{Math.round(line.pct * 100)}%</span>
        </span>
      ))}
    </div>
  );
}

/** The full read-out: art, rules text, the HP the line sits at, and who has already taken it.
 *  This is what "you can tap to see what you'd get" means — everything the rule knows, in one
 *  place, at any point in the battle. */
export function FractureBounties({ battle, players }: { battle: BattleState; players: PlayerMeta[] }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  if (battle.fractures.length === 0) return null;

  const nameOf = (playerId: number) => players.find((p) => p.id === playerId)?.name ?? `P${playerId}`;

  return (
    <div className="fracture-bounties">
      {battle.fractures.map((line, i) => {
        const def = ITEMS[line.itemId];
        const status =
          line.taken === 'gems'
            ? t('fracture.takenGems', { name: nameOf(line.crossedBy!), n: line.gems })
            : line.taken === 'item'
              ? t('fracture.takenItem', { name: nameOf(line.crossedBy!) })
              : line.crossedBy !== null
                ? t('fracture.crossedBy', { name: nameOf(line.crossedBy) })
                : t('fracture.open');
        return (
          <div key={i} className={`fracture-bounty ${line.crossedBy !== null ? 'fracture-bounty--spent' : ''}`}>
            <img src={itemImageUrl(line.itemId)} alt="" className="fracture-bounty__art" draggable={false} />
            <div className="fracture-bounty__body">
              <div className="fracture-bounty__head">
                <span className="fracture-bounty__pct">{t('fracture.line', { pct: Math.round(line.pct * 100) })}</span>
                <span className="fracture-bounty__hp">{t('fracture.at', { hp: line.hp })}</span>
              </div>
              <div className="fracture-bounty__name">{def.name[lang]}</div>
              <div className="fracture-bounty__text">{def.text[lang]}</div>
              <div className="fracture-bounty__status">
                {status}
                {line.taken === null && (
                  <span className="fracture-bounty__alt"> · {t('fracture.takeGems', { n: line.gems })}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
