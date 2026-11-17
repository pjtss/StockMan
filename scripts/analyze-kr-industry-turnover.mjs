import { Client } from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
const startDate = process.argv[2] ?? "20261001";
const endDate = process.argv[3] ?? "20261021";
const industryLabels = new Map([
  ["0000", "기타/미분류"], ["0005", "음식료"], ["0006", "섬유·의복"], ["0007", "종이·목재"],
  ["0008", "화학"], ["0009", "의약품"], ["0010", "비금속광물"], ["0011", "철강·금속"],
  ["0012", "기계"], ["0013", "전기·전자"], ["0014", "의료정밀"], ["0015", "운수장비"],
  ["0016", "유통"], ["0017", "전기·가스"], ["0018", "건설"], ["0019", "운수·창고"],
  ["0020", "통신"], ["0021", "금융"], ["0022", "은행"], ["0024", "증권"], ["0025", "보험"],
  ["0026", "서비스"], ["0027", "제조"], ["0028", "기타"], ["0029", "오락·문화"], ["0030", "농림어업"],
  ["1006", "제약"], ["1009", "기타서비스"], ["1010", "유통"], ["1011", "IT부품"],
  ["1013", "통신장비"], ["1014", "금융"], ["1015", "기타"],
]);

const kst = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const week = (s) => {
  const d = new Date(`${kst(s)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const csv = (rows, fields) => [fields.join(","), ...rows.map((row) => fields.map((field) => {
  const v = String(row[field] ?? "");
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}).join(","))].join("\n") + "\n";

try {
  await client.connect();
  const [{ rows: source }, { rows: coverage }] = await Promise.all([
    client.query(`SELECT c.market,c.code,u.name,u.industry_large_code AS industry_code,c.candle_date,c.fetched_at,c.close,c.volume FROM kr_common_stock_universe u JOIN kr_instrument_universe_candles c ON c.market=u.market AND c.code=u.code WHERE u.enabled=true AND u.instrument_type='COMMON_STOCK' AND c.timeframe='D' AND c.candle_date BETWEEN $1 AND $2 AND c.close>0 AND c.volume>0 ORDER BY c.candle_date,u.market,u.code`, [startDate, endDate]),
    client.query(`SELECT market,COUNT(*) FILTER(WHERE enabled)::int AS enabled_common FROM kr_common_stock_universe WHERE instrument_type='COMMON_STOCK' GROUP BY market`),
  ]);

  const master = new Map();
  for (const [market, file] of [["KOSPI", "kospi_code.mst"], ["KOSDAQ", "kosdaq_code.mst"]]) {
    const bytes = await readFile(path.join(root, "docs/references/kis-instrument-masters/2026-08-18", file));
    for (const line of bytes.toString("binary").split("\n")) {
      const raw = Buffer.from(line.replace(/\r$/, ""), "binary");
      if (!raw.length) continue;
      const code = raw.subarray(0, 6).toString("ascii").trim();
      const industry = raw.subarray(64, 68).toString("ascii").trim();
      if (/^\d{6}$/.test(code)) master.set(`${market}:${code}`, { industry, category: raw.subarray(61, 63).toString("ascii").trim() });
    }
  }

  const daily = new Map();
  const seen = new Set();
  const missingMaster = new Set();
  for (const row of source) {
    const key = `${row.market}:${row.code}`;
    seen.add(key);
    const classification = master.get(key);
    if (!classification) { missingMaster.add(key); continue; }
    const category = classification.category;
    if (!(["ST", "DR"].includes(category))) { missingMaster.add(key); continue; }
    const code = `${row.market}:${classification.industry}`;
    const date = row.candle_date;
    const id = `${date}:${code}`;
    let item = daily.get(id);
    const numericCode = classification.industry;
    const itemLabel = industryLabels.get(numericCode) ?? `공식 분류코드 ${numericCode}`;
    if (!item) { item = { date, industryCode: code, industry: `${row.market} ${itemLabel}`, turnover: 0, stocks: new Set(), fetchedAt: null }; daily.set(id, item); }
    item.turnover += Number(row.close) * Number(row.volume);
    item.stocks.add(key);
    if (!item.fetchedAt || row.fetchedAt > item.fetchedAt) item.fetchedAt = row.fetchedAt;
  }
  const toRows = (periodFn) => {
    const totals = new Map();
    for (const item of daily.values()) {
      const period = periodFn(item.date);
      const key = `${period}:${item.industryCode}`;
      let out = totals.get(key);
      if (!out) { out = { period, industryCode: item.industryCode, industry: item.industry, turnover: 0, stockSet: new Set(), updatedAt: null }; totals.set(key, out); }
      out.turnover += item.turnover;
      for (const s of item.stocks) out.stockSet.add(s);
      if (item.fetchedAt && (!out.updatedAt || item.fetchedAt > out.updatedAt)) out.updatedAt = item.fetchedAt;
    }
    const byPeriod = new Map();
    for (const out of totals.values()) byPeriod.set(out.period, (byPeriod.get(out.period) ?? 0) + out.turnover);
    return Array.from(totals.values()).map((out) => ({ period: out.period, industryCode: out.industryCode, industry: out.industry, tradingValueKRW: Math.round(out.turnover), sharePercent: Number((100 * out.turnover / byPeriod.get(out.period)).toFixed(4)), stockDays: out.stockSet.size, updatedAt: out.updatedAt?.toISOString() ?? "" })).sort((a,b) => String(a.period).localeCompare(String(b.period)) || b.tradingValueKRW-a.tradingValueKRW);
  };
  const dailyRows = toRows((date) => date);
  const weeklyRows = toRows(week);
  const monthlyRows = toRows((date) => `${date.slice(0, 4)}-${date.slice(4, 6)}`);
  const periodCoverage = new Map();
  for (const row of source) periodCoverage.set(row.candle_date, (periodCoverage.get(row.candle_date) ?? 0) + 1);
  const all = dailyRows.reduce((n, row) => n + row.tradingValueKRW, 0);
  const outputDir = path.join(root, "reports");
  await (await import("node:fs/promises")).mkdir(outputDir, { recursive: true });
  for (const [name, rows] of [["daily",dailyRows],["weekly",weeklyRows],["monthly",monthlyRows]]) {
    await (await import("node:fs/promises")).writeFile(path.join(outputDir, `kr-common-industry-turnover-${name}-${startDate}-${endDate}.csv`), csv(rows, ["period","industryCode","industry","tradingValueKRW","sharePercent","stockDays","updatedAt"]), "utf8");
  }
  const summary = {
    asOf: endDate,
    source: "project PostgreSQL active COMMON_STOCK daily OHLCV × close × volume; KIS domestic master bstp_larg_div_code",
    approximation: "reported turnover is unavailable in stored daily candles; turnover is estimated nominal close × volume in KRW",
    dates: Array.from(periodCoverage.keys()).sort(),
    activeCommonByMarket: coverage,
    totalObservedStockDays: source.length,
    latestAvailableDate: source.reduce((m, row) => row.candle_date > m ? row.candle_date : m, ""),
    latestDateRows: periodCoverage.get(source.reduce((m, row) => row.candle_date > m ? row.candle_date : m, "")) ?? 0,
    masterMatchedUniqueStocks: seen.size - missingMaster.size,
    masterMissingUniqueStocks: missingMaster.size,
    classificationLimitation: "KIS master bstp_larg_div_code is an index classification code, not a standardized industry taxonomy. KOSPI and KOSDAQ code spaces are distinct; same numeric codes may have different meanings. Source files do not expose standard_industry_name because migration V160 is not applied in this local database.",
    latestDailyAggregateKRW: Math.round(all),
    dailyTop: dailyRows.filter((r) => r.period === source.reduce((m, row) => row.candle_date > m ? row.candle_date : m, "")).slice(0, 8),
    weeklyTop: weeklyRows.slice(-weeklyRows.length).filter((r) => r.period === weeklyRows.reduce((m, row) => row.period > m ? row.period : m, "")).slice(0, 8),
    monthlyTop: monthlyRows.filter((r) => r.period === monthlyRows.reduce((m, row) => row.period > m ? row.period : m, "")).slice(0, 8),
    exports: ["daily", "weekly", "monthly"].map((name) => `kr-common-industry-turnover-${name}-${startDate}-${endDate}.csv`),
  };
  await (await import("node:fs/promises")).writeFile(path.join(outputDir, `kr-common-industry-turnover-summary-${startDate}-${endDate}.json`), JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(summary, null, 2));
} finally { await client.end().catch(() => {}); }
