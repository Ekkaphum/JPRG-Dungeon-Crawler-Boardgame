export type Difficulty = 'relaxed' | 'standard' | 'challenge';

export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  relaxed: 0.85,
  standard: 1.0,
  challenge: 1.15,
};

export const DIFFICULTY_LABEL_TH: Record<Difficulty, string> = {
  relaxed: 'ผ่อนคลาย',
  standard: 'มาตรฐาน',
  challenge: 'ท้าทาย',
};
