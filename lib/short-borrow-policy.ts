/** Feature-specific scoring policy. Keep this separate from common module operations. */
export type ShortBorrowScorePolicy = {
  notShortablePoints: number;
  htbPoints: number;
  quantityDropTiers: Array<{ threshold: number; points: number }>;
  feeTiers: Array<{ threshold: number; points: number }>;
  locatePriceTiers: Array<{ threshold: number; points: number }>;
  highLevelScore: number;
  extremeLevelScore: number;
};

export const DEFAULT_SHORT_BORROW_POLICY: ShortBorrowScorePolicy = {
  notShortablePoints: 35,
  htbPoints: 20,
  quantityDropTiers: [{ threshold: -90, points: 30 }, { threshold: -70, points: 20 }, { threshold: -40, points: 10 }, { threshold: -20, points: 5 }],
  feeTiers: [{ threshold: 10, points: 30 }, { threshold: 5, points: 20 }, { threshold: 2, points: 10 }, { threshold: 0.5, points: 5 }],
  locatePriceTiers: [{ threshold: 300, points: 15 }, { threshold: 100, points: 10 }, { threshold: 30, points: 5 }],
  highLevelScore: 50,
  extremeLevelScore: 75,
};
