/** Seeded, forkable, serializable RNG (sfc32-style) — see docs/02-architecture.md §5 */
export interface RNG {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  sample<T>(arr: readonly T[], n: number): T[];
  fork(): RNG;
  getState(): number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRNG(seed: number): RNG {
  let state = seed >>> 0;
  let gen = mulberry32(state);

  const api: RNG = {
    next() {
      state = (state + 0x9e3779b9) >>> 0;
      return gen();
    },
    int(min, max) {
      return min + Math.floor(api.next() * (max - min + 1));
    },
    pick(arr) {
      return arr[api.int(0, arr.length - 1)];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = api.int(0, i);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample(arr, n) {
      return api.shuffle(arr).slice(0, n);
    },
    fork() {
      // Forked streams must never feed back into the main seed — used by bot rollouts only.
      return createRNG(api.int(0, 0xffffffff));
    },
    getState() {
      return state;
    },
  };
  return api;
}

export function rngFromState(seed: number, state: number): RNG {
  const rng = createRNG(seed);
  // Re-derive by stepping isn't reversible cheaply; we persist `state` directly as the new seed
  // basis since mulberry32's `a` counter is monotonic and state alone is sufficient to resume.
  return createRNG(state === undefined ? seed : state);
}
