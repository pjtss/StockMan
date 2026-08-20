export type IndicatorCandle = { date: string; close: number; high?: number; low?: number; volume?: number };

function ema(values: number[], period: number) {
  const alpha = 2 / (period + 1);
  return values.reduce<number[]>((out, value, index) => {
    out.push(index === 0 ? value : value * alpha + out[index - 1] * (1 - alpha));
    return out;
  }, []);
}

export function calculateObvAdlSignal(candles: IndicatorCandle[], obvPeriod = 9, adlPeriod = 9) {
  const rows = [...candles].filter((row) => Number.isFinite(row.close) && row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < Math.max(obvPeriod, adlPeriod) + 1) return { ready: false, obv: null, obvSignal: null, adl: null, adlSignal: null, obvAboveSignal: false, adlAboveSignal: false };
  let obvValue = 0;
  const obv = rows.map((row, index) => {
    if (index > 0) {
      const volume = Number.isFinite(row.volume) ? Number(row.volume) : 0;
      if (row.close > rows[index - 1].close) obvValue += volume;
      else if (row.close < rows[index - 1].close) obvValue -= volume;
    }
    return obvValue;
  });
  let adlValue = 0;
  const adl = rows.map((row) => {
    const high = Number.isFinite(row.high) ? Number(row.high) : row.close;
    const low = Number.isFinite(row.low) ? Number(row.low) : row.close;
    const volume = Number.isFinite(row.volume) ? Number(row.volume) : 0;
    const range = high - low;
    adlValue += (range === 0 ? 0 : ((row.close - low) - (high - row.close)) / range) * volume;
    return adlValue;
  });
  const obvLatest = obv.at(-1) ?? 0;
  const adlLatest = adl.at(-1) ?? 0;
  const obvSignal = ema(obv, obvPeriod).at(-1) ?? 0;
  const adlSignal = ema(adl, adlPeriod).at(-1) ?? 0;
  return { ready: true, obv: obvLatest, obvSignal, adl: adlLatest, adlSignal, obvAboveSignal: obvLatest > obvSignal, adlAboveSignal: adlLatest > adlSignal };
}
