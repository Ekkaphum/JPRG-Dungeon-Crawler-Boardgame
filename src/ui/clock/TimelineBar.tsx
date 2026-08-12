import { resolveOrderCompare, type BattleState, type GameState } from '@engine/index';
import { CLASS_COLOR } from '@content/charColors';
import { useT } from '@content/i18n/useT';

const MAX_SLOT = 24;

/** Left-to-right countdown track: slot 24 (start of the battle) on the left, slot 0 (midnight,
 *  party wipe) on the right, with the marker sweeping toward it. Replaces the round clock dial —
 *  a straight line makes "how much time is left" and "who resolves next" readable at a glance. */
export function TimelineBar({ state, battle }: { state: GameState; battle: BattleState }) {
  const t = useT();
  const pctOf = (slot: number) => ((MAX_SLOT - slot) / MAX_SLOT) * 100;

  interface Pawn {
    key: string;
    slot: number;
    stackSeq: number;
    label: string;
    color: string;
    isBoss?: boolean;
    dead?: boolean;
  }

  const pawns: Pawn[] = [];
  for (const f of battle.fighters) {
    const player = state.players.find((p) => p.id === f.playerId)!;
    // A downed pawn already sits on its revive slot; one that can't come back this battle is off
    // the clock entirely and isn't drawn.
    if (!f.alive && f.reviveAtSlot == null) continue;
    const slot = f.slot;
    if (slot < 0 || slot > MAX_SLOT) continue;
    pawns.push({
      key: `p${f.playerId}`,
      slot,
      stackSeq: f.stackSeq,
      label: player.charId.slice(0, 2),
      color: CLASS_COLOR[player.charId],
      dead: !f.alive,
    });
  }
  if (battle.bossSlot >= 0 && battle.bossSlot <= MAX_SLOT) {
    pawns.push({ key: 'boss', slot: battle.bossSlot, stackSeq: battle.bossStackSeq, label: '☠', color: '#c0392b', isBoss: true });
  }

  // Pawns sharing a slot stack upward, earliest-to-resolve nearest the track — same rule the walk
  // loop itself uses (resolveOrderCompare), so this can never show a stack order that contradicts
  // what actually happens when the marker gets there.
  const stackIndex = new Map<string, number>();
  const bySlot = new Map<number, Pawn[]>();
  for (const p of pawns) {
    const arr = bySlot.get(p.slot) ?? [];
    arr.push(p);
    bySlot.set(p.slot, arr);
  }
  for (const arr of bySlot.values()) {
    arr.sort(resolveOrderCompare);
    arr.forEach((p, i) => stackIndex.set(p.key, i));
  }

  return (
    <div className="gold-frame rounded-lg px-4 pt-1 pb-0.5">
      <div className="flex items-center justify-between text-[10px] text-gold-dim">
        <span className="gold-text font-display text-[11px]">{t('game.clock')}</span>
        <span>{t('game.marker', { n: battle.marker })}</span>
      </div>

      <div className="relative h-[64px]">
        {/* track */}
        <div className="absolute left-0 right-0 bottom-[22px] h-[3px] bg-black/50 rounded-full overflow-hidden">
          <div className="h-full bg-gold-dim/70 transition-all duration-300" style={{ width: `${pctOf(battle.marker)}%` }} />
        </div>

        {/* slot ticks + numbers */}
        {Array.from({ length: MAX_SLOT + 1 }, (_, slot) => {
          const isTrap = battle.traps.some((tr) => tr.slot === slot);
          const passed = slot > battle.marker;
          return (
            <div key={slot} className="absolute" style={{ left: `${pctOf(slot)}%`, bottom: '16px', transform: 'translateX(-50%)' }}>
              <div
                className="rounded-full"
                style={{
                  width: isTrap ? 8 : 4,
                  height: isTrap ? 8 : 4,
                  background: isTrap ? '#c0392b' : passed ? 'rgba(138,111,47,0.35)' : 'var(--gold-dim)',
                }}
              />
              {slot % 4 === 0 && (
                <div className="absolute top-[8px] left-1/2 -translate-x-1/2 text-[9px] text-gold-dim tabular-nums">{slot}</div>
              )}
            </div>
          );
        })}

        {/* time marker */}
        <div
          className="absolute transition-all duration-300"
          style={{ left: `${pctOf(battle.marker)}%`, bottom: '14px', transform: 'translateX(-50%)' }}
        >
          <div className="w-[2px] h-[38px] bg-gold-bright/90 absolute bottom-0 left-1/2 -translate-x-1/2 shadow-[0_0_8px_rgba(240,210,122,0.8)]" />
          <div className="absolute bottom-[38px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-gold-bright" />
        </div>

        {/* pawns */}
        {pawns.map((p) => (
          <div
            key={p.key}
            className="absolute transition-all duration-300"
            style={{
              left: `${pctOf(p.slot)}%`,
              bottom: `${26 + (stackIndex.get(p.key) ?? 0) * 17}px`,
              transform: 'translateX(-50%)',
              opacity: p.dead ? 0.35 : 1,
            }}
            title={p.label}
          >
            <div
              className="rounded-full flex items-center justify-center font-bold text-[8px] border border-black/60"
              style={{ width: p.isBoss ? 19 : 16, height: p.isBoss ? 19 : 16, background: p.color, color: '#0b0e14' }}
            >
              {p.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
