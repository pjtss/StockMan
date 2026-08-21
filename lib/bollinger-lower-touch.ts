export type LowerBandPoint = { date?: string; close: number; lower: number };
export function isLowerBandTouch(point: LowerBandPoint | undefined): boolean {
  return Boolean(point && Number.isFinite(point.close) && Number.isFinite(point.lower) && point.close <= point.lower);
}
export function findRecentLowerBandTouch<T extends LowerBandPoint>(points: T[]) {
  const latest = points.at(-1);
  const previous = points.at(-2);
  const point = isLowerBandTouch(latest) ? latest : isLowerBandTouch(previous) ? previous : null;
  return { qualifies: point !== null, point, isCurrent: point !== null && point === latest };
}
