export type DmiCandle = { date: string; high: number; low: number; close: number };
export type DmiPoint = { date: string; plusDi: number; minusDi: number; adx: number };

export function calculateDmi(candles: DmiCandle[], period = 14): DmiPoint[] {
  if (!Number.isInteger(period) || period <= 0) throw new Error("DMI period must be a positive integer");
  const rows = [...candles].filter((c) => c.high > 0 && c.low > 0 && c.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const tr: number[] = [], plus: number[] = [], minus: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) { tr.push(rows[i].high - rows[i].low); plus.push(0); minus.push(0); continue; }
    const up = rows[i].high - rows[i - 1].high;
    const down = rows[i - 1].low - rows[i].low;
    tr.push(Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close)));
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  return rows.map((row, i) => {
    if (i < period) return { date: row.date, plusDi: 0, minusDi: 0, adx: 0 };
    const sum = (values: number[]) => values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    const trSum = sum(tr), plusDi = trSum ? sum(plus) / trSum * 100 : 0, minusDi = trSum ? sum(minus) / trSum * 100 : 0;
    const dx = plusDi + minusDi ? Math.abs(plusDi - minusDi) / (plusDi + minusDi) * 100 : 0;
    const adxValues = [] as number[];
    for (let j = Math.max(period, i - period + 1); j <= i; j++) {
      const t = sumAt(tr, j, period), p = sumAt(plus, j, period), m = sumAt(minus, j, period);
      const pd = t ? p / t * 100 : 0, md = t ? m / t * 100 : 0;
      adxValues.push(pd + md ? Math.abs(pd - md) / (pd + md) * 100 : 0);
    }
    return { date: row.date, plusDi: Number(plusDi.toFixed(4)), minusDi: Number(minusDi.toFixed(4)), adx: Number((adxValues.reduce((a, b) => a + b, 0) / adxValues.length || dx).toFixed(4)) };
  });
}

function sumAt(values: number[], index: number, period: number) { return values.slice(Math.max(0, index - period + 1), index + 1).reduce((a, b) => a + b, 0); }
export function latestDmi(candles: DmiCandle[], period = 14) { return calculateDmi(candles, period).at(-1) ?? null; }
