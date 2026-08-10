// Shared tie-break rule for every "highest/lowest X" targeting decision in the game — see
// docs/10-v0.3.0-rulings.md §3. Rule: a higher clock slot always counts as "more"; if pawns are
// stacked on the exact same slot, whoever was placed there first (lower stackSeq) wins.

export interface Ranked {
  slot: number;
  stackSeq: number;
}

/**
 * Picks the extreme (max or min) of `items` by `statFn`, breaking ties per the house rule above.
 * Throws on an empty array — callers must filter to eligible/alive targets first.
 */
export function pickExtreme<T extends Ranked>(items: T[], statFn: (item: T) => number, direction: 'max' | 'min'): T {
  if (items.length === 0) throw new Error('pickExtreme: no eligible items');
  const sorted = [...items].sort((a, b) => {
    const diff = statFn(a) - statFn(b);
    const statCmp = direction === 'max' ? -diff : diff;
    if (statCmp !== 0) return statCmp;
    if (a.slot !== b.slot) return b.slot - a.slot; // higher slot = "more"
    return a.stackSeq - b.stackSeq; // placed first (bottom of stack) wins
  });
  return sorted[0];
}

/** Same rule, but returns the top N distinct items (used by Somnivar's "2 lowest slot" move). */
export function pickExtremeN<T extends Ranked>(items: T[], statFn: (item: T) => number, direction: 'max' | 'min', n: number): T[] {
  const sorted = [...items].sort((a, b) => {
    const diff = statFn(a) - statFn(b);
    const statCmp = direction === 'max' ? -diff : diff;
    if (statCmp !== 0) return statCmp;
    if (a.slot !== b.slot) return b.slot - a.slot;
    return a.stackSeq - b.stackSeq;
  });
  return sorted.slice(0, n);
}
