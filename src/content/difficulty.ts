export type Difficulty = 'relaxed' | 'standard' | 'challenge';

export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  relaxed: 0.85,
  standard: 1.0,
  challenge: 1.15,
};

