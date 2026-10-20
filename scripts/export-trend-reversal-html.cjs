const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const outputDir = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads');

function avg(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function ema(values, period) {
  if (values.length < period) return null;
  let value = avg(values.slice(0, period));
  const k = 2 / (period + 1);
  for (const item of values.slice(period)) value = item * k + value * (1 - k);
  return value;
}
function money(value) { return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 }); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x])); }

function calculate(candles) {
  const close = candles.map(x => Number(x.close));
  const volume = candles.map(x => Number(x.volume));
  const last = candles.at(-1), previous = candles.at(-2);
  const e9 = ema(close, 9), e20 = ema(close, 20);
  const macd = [], signal = [];
  for (let i = 0; i < close.length; i++) {
    const fast = ema(close.slice(0, i + 1), 12), slow = ema(close.slice(0, i + 1), 26);
    macd.push(fast == null || slow == null ? null : fast - slow);
    const usable = macd.filter(x => x != null);
    signal.push(usable.length >= 9 ? ema(usable, 9) : null);
  }
  const m = macd.at(-1), ms = signal.at(-1), pm = macd.at(-2), pms = signal.at(-2);
  const macdCross = pm != null && pms != null && m != null && ms != null && pm <= pms && m > ms;
  const typical = candles.map(x => (Number(x.high) + Number(x.low) + Number(x.close)) / 3);
  const positiveFlow = [], negativeFlow = [];
  for (let i = 1; i < typical.length; i++) {
    const flow = typical[i] * Number(candles[i].volume);
    positiveFlow.push(typical[i] > typical[i - 1] ? flow : 0);
    negativeFlow.push(typical[i] < typical[i - 1] ? flow : 0);
  }
  let mfi = null, previousMfi = null;
  if (positiveFlow.length >= 14) {
    const pos = positiveFlow.slice(-14).reduce((a, b) => a + b, 0), neg = negativeFlow.slice(-14).reduce((a, b) => a + b, 0);
    mfi = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    const ppos = positiveFlow.slice(-15, -1).reduce((a, b) => a + b, 0), pneg = negativeFlow.slice(-15, -1).reduce((a, b) => a + b, 0);
    previousMfi = pneg === 0 ? 100 : 100 - 100 / (1 + ppos / pneg);
  }
  let obv = 0; const obvValues = [0];
  for (let i = 1; i < close.length; i++) { if (close[i] > close[i - 1]) obv += volume[i]; else if (close[i] < close[i - 1]) obv -= volume[i]; obvValues.push(obv); }
  const obvRising = obvValues.at(-1) > obvValues.at(-2);
  let adl = 0; const adlValues = [0];
  for (const candle of candles) {
    const high = Number(candle.high), low = Number(candle.low), c = Number(candle.close), v = Number(candle.volume);
    const multiplier = high > low ? ((c - low) - (high - c)) / (high - low) : 0;
    adl += multiplier * v; adlValues.push(adl);
  }
  const adlRising = adlValues.at(-1) > adlValues.at(-2);
  const avgVolume20 = avg(volume.slice(-21, -1));
  const rvol = avgVolume20 > 0 ? volume.at(-1) / avgVolume20 : 0;
  const bullish = Number(last.close) > Number(last.open);
  const closePosition = Number(last.high) > Number(last.low) ? (Number(last.close) - Number(last.low)) / (Number(last.high) - Number(last.low)) : 0.5;
  const score = (macdCross ? 35 : (m != null && ms != null && m > ms ? 18 : 0)) + (mfi != null && mfi >= 50 && mfi > (previousMfi ?? -Infinity) ? 20 : 0) + (obvRising ? 20 : 0) + (adlRising ? 10 : 0) + (rvol >= 1 ? 15 : 0) + (e9 != null && Number(last.close) > e9 ? 10 : 0);
  const qualifies = rvol >= 1 && e9 != null && Number(last.close) > e9 && obvRising && adlRising && mfi != null && mfi >= 50 && mfi > (previousMfi ?? -Infinity) && ((macdCross) || (m != null && ms != null && m > ms));
  return { date: last.date, close: Number(last.close), volume: volume.at(-1), avgVolume20, rvol, ema9: e9, ema20: e20, macd: m, macdSignal: ms, macdCross, mfi, previousMfi, obvRising, adlRising, bullish, closePosition, score, qualifies };
}

function page(title, market, rows, asOf) {
  const body = rows.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.code)}</b></td><td>${esc(x.name)}</td><td>${esc(x.market)}</td><td>${esc(x.date)}</td><td>${money(x.close)}</td><td>${money(x.rvol.toFixed(2))}x</td><td>${money(x.ema9.toFixed(2))}</td><td>${money(x.macd.toFixed(4))}</td><td>${money(x.macdSignal.toFixed(4))}</td><td>${x.macdCross ? '골든크로스' : '상회'}</td><td>${x.mfi.toFixed(2)}</td><td>${x.obvRising ? '상승' : '-'}</td><td>${x.adlRising ? '상승' : '-'}</td><td>${money(x.score)}</td></tr>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#172033}h1{margin-bottom:6px}small{color:#667085}.box{background:#f6f8fb;padding:14px;border-radius:8px;margin:18px 0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #d9dee8;padding:7px;text-align:right;white-space:nowrap}th{background:#eef2f7}th:nth-child(2),th:nth-child(3),th:nth-child(4),td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:left}</style></head><body><h1>${esc(title)}</h1><small>로컬 PostgreSQL 일봉 캐시 · 기준일 ${esc(asOf)} · 생성 ${new Date().toISOString()}</small><div class="box"><b>조건</b><br>RVOL(SMA20) ≥ 1 · 종가 > EMA9 · MACD가 Signal 상회 또는 최신 골든크로스 · MFI14 ≥ 50이며 상승 · OBV·ADL 최신 봉 상승<br><b>점수</b>: MACD 골든크로스 35, MACD 상회 18, MFI 상승 20, OBV 상승 20, ADL 상승 10, RVOL 1 이상 15, EMA9 상회 10</div><p>조건 충족 ${rows.length}개. 점수 내림차순, 동점은 RVOL 내림차순입니다.</p><table><thead><tr><th>#</th><th>티커</th><th>종목</th><th>시장</th><th>거래일</th><th>종가</th><th>RVOL</th><th>EMA9</th><th>MACD</th><th>Signal</th><th>MACD 상태</th><th>MFI14</th><th>OBV</th><th>ADL</th><th>점수</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  const configs = [
    { key: 'KR', table: 'kr_instrument_universe_candles', universe: 'kr_common_stock_universe', title: '국내 일봉 거래량 동반 추세 전환 후보' },
    { key: 'US', table: 'us_instrument_universe_candles', universe: 'us_common_stock_universe', title: '해외 일봉 거래량 동반 추세 전환 후보' },
  ];
  fs.mkdirSync(outputDir, { recursive: true });
  for (const config of configs) {
    const fundamentalJoin = config.key === 'KR' ? "JOIN LATERAL (SELECT market_cap FROM instrument_fundamental_snapshots f WHERE f.market=u.market AND f.code=u.code ORDER BY f.observed_at DESC NULLS LAST, f.fetched_at DESC NULLS LAST LIMIT 1) f ON f.market_cap > 30000000000" : '';
    const q = await client.query(`SELECT u.market,u.code,u.name,c.candle_date AS date,c.open,c.high,c.low,c.close,c.volume FROM ${config.universe} u ${fundamentalJoin} JOIN ${config.table} c ON c.market=u.market AND c.code=u.code AND c.timeframe='D' WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND c.volume>0 ORDER BY u.market,u.code,c.candle_date`);
    const groups = new Map(); for (const row of q.rows) { const key = `${row.market}:${row.code}`; if (!groups.has(key)) groups.set(key, { market: row.market, code: row.code, name: row.name, candles: [] }); groups.get(key).candles.push(row); }
    const rows = []; for (const item of groups.values()) { if (item.candles.length < 35) continue; const result = calculate(item.candles); if (result.qualifies) rows.push({ ...item, ...result }); }
    rows.sort((a, b) => b.score - a.score || b.rvol - a.rvol); const asOf = rows[0]?.date ?? q.rows.at(-1)?.date ?? 'N/A';
    const filename = `${config.key === 'KR' ? 'domestic' : 'overseas'}-trend-reversal-${asOf}.html`; fs.writeFileSync(path.join(outputDir, filename), page(config.title, config.key, rows, asOf), 'utf8'); console.log(JSON.stringify({ market: config.key, asOf, count: rows.length, file: path.join(outputDir, filename) }));
  }
  await client.end();
})().catch(error => { console.error(error.message); process.exit(1); });
