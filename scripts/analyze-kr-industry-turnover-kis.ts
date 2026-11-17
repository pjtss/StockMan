import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { readLocalEnvFile } from "./local-env.mjs";
import { isValidCompactCalendarDateRange } from "../lib/calendar-date-quality.mjs";
import { getAccessToken } from "../lib/kis-token.ts";

async function main() {
const root = process.cwd();
Object.assign(process.env, readLocalEnvFile(resolve(root, ".env.local")));
const startDate = process.argv[2] ?? "20261001";
const endDate = process.argv[3] ?? "20261023";
if (!isValidCompactCalendarDateRange(startDate, endDate)) throw new Error("날짜는 실제 YYYYMMDD 형식이어야 하며 시작일은 종료일보다 늦을 수 없습니다.");
const masterDir = resolve(root, "docs/references/kis-instrument-masters/2026-10-24");
const outDir = resolve(root, "reports");
const rawDir = resolve(root, "scratch/kr-industry-turnover-20261025");
await mkdir(outDir, { recursive: true });
await mkdir(rawDir, { recursive: true });
const suffix = `${startDate}-${endDate}`;
const rawFile = resolve(rawDir, `kis-daily-turnover-${suffix}.jsonl`);
const errorFile = resolve(rawDir, `kis-daily-turnover-${suffix}-errors.jsonl`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
await client.connect();
await client.query("SET default_transaction_read_only = on");
const { rows: universe } = await client.query(`
  SELECT market, code, name, standard_code, industry_large_code
  FROM kr_common_stock_universe
  WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK'
  ORDER BY market, code
`);
await client.end();
if (!universe.length) throw new Error("활성 COMMON_STOCK 유니버스가 비어 있습니다.");

const decoder = new TextDecoder("euc-kr");
const master = new Map();
for (const [market, file, etpOffset, preferredOffset] of [["KOSPI", "kospi_code.mst", 83, 220], ["KOSDAQ", "kosdaq_code.mst", 79, 215]]) {
  const bytes = await readFile(resolve(masterDir, file));
  for (const line of bytes.toString("binary").split(/\r?\n/).filter(Boolean)) {
    const row = Buffer.from(line, "binary");
    const field = (offset, length) => decoder.decode(row.subarray(offset, offset + length)).replace(/\0/g, "").trim();
    const code = field(0, 6);
    if (!/^[0-9A-Z]{6}$/.test(code)) continue;
    master.set(`${market}:${code}`, {
      name: field(21, 40), securityGroup: field(61, 2), standardCode: field(9, 12), industryLargeCode: field(64, 4),
      etpProductClass: field(etpOffset, 1), preferredClass: field(preferredOffset, 1),
    });
  }
}
const localKeys = new Set(universe.map((item) => `${item.market}:${item.code}`));
const excludedMasterCodes = [];
const mapped = [...master.entries()].flatMap(([key, current]) => {
  const [market, code] = key.split(":");
  const preferredName = /(?:우선주|우(?:\(|$)|\d우B(?:\(|$))/i.test(current.name);
  const specialName = /(?:스팩|SPAC|전환|신주인수권|권리주)/i.test(current.name);
  const nonCommon = !["ST", "FS"].includes(current.securityGroup)
    || ["1", "2", "3", "4", "5"].includes(current.etpProductClass)
    || ["1", "2"].includes(current.preferredClass)
    || preferredName || specialName;
  if (nonCommon) {
    excludedMasterCodes.push({ market, code, officialSecurityGroup: current.securityGroup });
    return [];
  }
  return [{ market, code, name: current.name, standard_code: current.standardCode, industryCode: current.industryLargeCode }];
});
const localNotInMaster = universe.filter((item) => !master.has(`${item.market}:${item.code}`)).map((item) => `${item.market}:${item.code}`);
if (localNotInMaster.length) throw new Error(`최신 공식 KIS 마스터에 없는 로컬 COMMON_STOCK ${localNotInMaster.length}건: ${localNotInMaster.slice(0, 10).join(",")}`);
const officialMasterNotInLocalCount = mapped.filter((item) => !localKeys.has(`${item.market}:${item.code}`)).length;
const uniqueCodes = [...new Set(mapped.map((item) => `${item.market}:${item.industryCode}`).filter((value) => !value.endsWith(":0000")))];
const token = await getAccessToken();
if (!token) throw new Error("KIS 토큰을 가져오지 못했습니다.");
const appkey = process.env.KIS_APPKEY;
const appsecret = process.env.KIS_APPSECRET;
if (!appkey || !appsecret) throw new Error("KIS 자격증명이 설정되지 않았습니다.");

let nextRequestAt = 0;
async function kisGet(path, trId, params, label) {
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    nextRequestAt = Date.now() + 150;
    const url = new URL(`https://openapi.koreainvestment.com:9443${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, { headers: {
        "content-type": "application/json; charset=utf-8", Authorization: `Bearer ${token}`,
        appkey, appsecret, tr_id: trId, custtype: "P",
      } });
      const data = await response.json();
      if (response.ok && data.rt_cd === "0") return data;
      last = { label, status: response.status, rtCd: data.rt_cd, msgCd: data.msg_cd, msg1: data.msg1 };
      const isRateLimit = /EGW00201|초당|호출 제한|조회 건수/i.test(`${data.msg_cd} ${data.msg1}`);
      await new Promise((resolve) => setTimeout(resolve, isRateLimit ? 1500 * (attempt + 1) : 300 * (attempt + 1)));
    } catch (error) {
      last = { label, error: String(error) };
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error(`KIS 조회 실패: ${JSON.stringify(last)}`);
}

const industryNames = new Map([["0000", "분류 없음"]]);
const kospiCodes = uniqueCodes.filter((value) => value.startsWith("KOSPI:")).map((value) => value.split(":")[1]);
if (kospiCodes.length) {
  const category = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-index-category-price", "FHPUP02140000", {
    FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: "0001", FID_COND_SCR_DIV_CODE: "20214",
    FID_MRKT_CLS_CODE: "K", FID_BLNG_CLS_CODE: "0",
  }, "KOSPI 업종 코드명");
  for (const row of category.output2 ?? []) if (row.bstp_cls_code && row.hts_kor_isnm) industryNames.set(`${"KOSPI"}:${row.bstp_cls_code}`, row.hts_kor_isnm);
}
for (const key of uniqueCodes.filter((value) => value.startsWith("KOSDAQ:"))) {
  const code = key.split(":")[1];
  const data = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice", "FHKUP03500100", {
    FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code, FID_INPUT_DATE_1: endDate, FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: "D", FID_COND_SCR_DIV_CODE: "20214", FID_MRKT_CLS_CODE: "Q", FID_BLNG_CLS_CODE: "0",
  }, `KOSDAQ 업종 코드명 ${code}`);
  const name = data.output1?.hts_kor_isnm;
  if (name) industryNames.set(key, name);
}
for (const key of uniqueCodes.filter((value) => value.startsWith("KOSPI:"))) {
  const code = key.split(":")[1];
  if (industryNames.has(key)) continue;
  const data = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice", "FHKUP03500100", {
    FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code, FID_INPUT_DATE_1: endDate, FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: "D", FID_COND_SCR_DIV_CODE: "20214", FID_MRKT_CLS_CODE: "K", FID_BLNG_CLS_CODE: "0",
  }, `KOSPI 업종 코드명 ${code}`);
  const name = data.output1?.hts_kor_isnm;
  if (name) industryNames.set(key, name);
}
for (const item of mapped) {
  const key = `${item.market}:${item.industryCode}`;
  item.industryName = industryNames.get(key) ?? (item.industryCode === "0000" ? "분류 없음" : `KIS 업종 ${item.industryCode}`);
}

const existing = new Map();
try {
  for (const line of (await readFile(rawFile, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    existing.set(`${row.market}:${row.code}`, row);
  }
} catch { /* first run */ }
let completed = 0;
let failures = 0;
for (const item of mapped) {
  const key = `${item.market}:${item.code}`;
  if (existing.has(key)) { completed++; continue; }
  try {
    const data = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice", "FHKST03010100", {
      FID_COND_MRKT_DIV_CODE: "UN", FID_INPUT_ISCD: item.code, FID_INPUT_DATE_1: startDate,
      FID_INPUT_DATE_2: endDate, FID_PERIOD_DIV_CODE: "D", FID_ORG_ADJ_PRC: "1",
    }, `${item.market}:${item.code}`);
    const bars = (data.output2 ?? []).filter((bar) => bar.stck_bsop_date >= startDate && bar.stck_bsop_date <= endDate).map((bar) => {
      if (!/^\d{8}$/.test(bar.stck_bsop_date) || !/^\d+$/.test(String(bar.acml_tr_pbmn ?? ""))) throw new Error(`거래일 또는 거래대금 필드 오류: ${item.code}`);
      return { date: bar.stck_bsop_date, tradingValueKRW: String(BigInt(bar.acml_tr_pbmn)) };
    });
    const row = { market: item.market, code: item.code, name: item.name, standardCode: item.standard_code, industryCode: item.industryCode, industryName: item.industryName, fetchedAt: new Date().toISOString(), bars };
    await appendFile(rawFile, JSON.stringify(row) + "\n", "utf8");
    existing.set(key, row);
    completed++;
    if (completed % 50 === 0 || completed === mapped.length) console.log(JSON.stringify({ event: "progress", completed, total: mapped.length, failures }));
  } catch (error) {
    failures++;
    await appendFile(errorFile, JSON.stringify({ market: item.market, code: item.code, error: String(error), at: new Date().toISOString() }) + "\n", "utf8");
    if (failures % 10 === 0) console.log(JSON.stringify({ event: "errors", completed, total: mapped.length, failures }));
  }
}
if (failures) throw new Error(`KIS 종목별 데이터 실패 ${failures}건. errors.jsonl을 확인하고 재실행해 누락을 재시도하세요.`);
if (existing.size !== mapped.length) throw new Error(`수집 유니버스 불일치: expected=${mapped.length} fetched=${existing.size}`);

const daily = new Map();
const dateSet = new Set();
for (const row of existing.values()) {
  for (const bar of row.bars) {
    dateSet.add(bar.date);
    const key = `${bar.date}:${row.industryName}`;
    const item = daily.get(key) ?? { date: bar.date, industry: row.industryName, codes: new Set(), stockSet: new Set(), turnover: 0n, fetchedAt: "", dates: new Set() };
    item.turnover += BigInt(bar.tradingValueKRW);
    item.dates.add(bar.date);
    if (!item.fetchedAt || row.fetchedAt > item.fetchedAt) item.fetchedAt = row.fetchedAt;
    item.codes.add(`${row.market}:${row.industryCode}`);
    item.stockSet.add(`${row.market}:${row.code}`);
    daily.set(key, item);
  }
}
const dates = [...dateSet].sort();
if (!dates.length) throw new Error("조회 기간에 거래일 데이터가 없습니다.");
const periodRows = (periodOf) => {
  const totals = new Map();
  for (const row of daily.values()) {
    const period = periodOf(row.date);
    const key = `${period}:${row.industry}`;
    const out = totals.get(key) ?? { period, industry: row.industry, codes: new Set(), stockSet: new Set(), turnover: 0n, fetchedAt: "", dates: new Set() };
    out.turnover += row.turnover;
    for (const date of row.dates) out.dates.add(date);
    if (!out.fetchedAt || row.fetchedAt > out.fetchedAt) out.fetchedAt = row.fetchedAt;
    for (const code of row.codes) out.codes.add(code);
    for (const code of row.stockSet) out.stockSet.add(code);
    totals.set(key, out);
  }
  const denominator = new Map();
  for (const item of totals.values()) denominator.set(item.period, (denominator.get(item.period) ?? 0n) + item.turnover);
  return [...totals.values()].map((item) => ({
    period: item.period, industry: item.industry,
    industryCodes: [...item.codes].sort().join("|"),
    tradingValueKRW: item.turnover.toString(),
    sharePercent: Number(item.turnover * 1000000n / (denominator.get(item.period) || 1n)) / 10000,
    stockCount: item.stockSet.size,
    tradingDates: [...item.dates].sort().join("|"),
    dataUpdatedAt: item.fetchedAt,
    source: "KIS inquire-daily-itemchartprice FHKST03010100; FID_COND_MRKT_DIV_CODE=UN",
  })).sort((a, b) => {
    const byPeriod = a.period.localeCompare(b.period);
    if (byPeriod) return byPeriod;
    const av = BigInt(a.tradingValueKRW), bv = BigInt(b.tradingValueKRW);
    return av === bv ? a.industry.localeCompare(b.industry) : av > bv ? -1 : 1;
  });
};
const csv = (rows) => ["period,industry,industryCodes,tradingValueKRW,sharePercent,stockCount,tradingDates,dataUpdatedAt,source", ...rows.map((row) => [row.period,row.industry,row.industryCodes,row.tradingValueKRW,row.sharePercent,row.stockCount,row.tradingDates,row.dataUpdatedAt,row.source].map((value) => { const s = String(value ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }).join(","))].join("\n") + "\n";
const dailyRows = periodRows((date) => date);
const weeklyRows = periodRows((date) => { const d = new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10); });
const monthlyRows = periodRows((date) => `${date.slice(0,4)}-${date.slice(4,6)}`);
const outputNames = {};
for (const [name, rows] of [["daily",dailyRows],["weekly",weeklyRows],["monthly",monthlyRows]]) {
  outputNames[name] = `kr-common-industry-turnover-kis-${name}-${suffix}.csv`;
  await writeFile(resolve(outDir, outputNames[name]), csv(rows), "utf8");
}
const latestDate = dates.at(-1);
const latestDaily = dailyRows.filter((row) => row.period === latestDate).sort((a,b) => Number(b.sharePercent)-Number(a.sharePercent));
const summary = {
  generatedAt: new Date().toISOString(), period: { startDate, endDate, tradingDates: dates },
  source: "KIS official domestic daily item chart FHKST03010100; actual acml_tr_pbmn; market=UN (integrated KRX+NXT); original price flag=1",
  universe: { officialMasterCommonStockCount: mapped.length, retrievedStockCount: existing.size, groupSTCount: mapped.filter((item) => master.get(`${item.market}:${item.code}`).securityGroup === "ST").length, groupFSCount: mapped.filter((item) => master.get(`${item.market}:${item.code}`).securityGroup === "FS").length, localEnabledCommonStockCount: universe.length, localUniverseNotInCurrentMaster: localNotInMaster.length, officialMasterCommonNotInLocalUniverse: officialMasterNotInLocalCount, operatingDatabaseReportedEnabledCommonStockCount: 2358, masterClassificationExclusions: excludedMasterCodes.length, missingBars: [...existing.values()].filter((row) => row.bars.length === 0).length, industryClassification: "KIS official domestic master: listed common security groups ST (주권) and FS (외국주권), excluding DR, ETP, warrants, rights and preferred issues; bstp_larg_div_code (large sector), 2026-10-24 master; same KIS sector names consolidated across KOSPI and KOSDAQ; code 0000 is unclassified" },
  aggregation: { daily: "daily sum of each eligible current KIS-master common stock's reported trading value", weekly: "sum of daily turnover, Monday-start weeks", monthly: "sum of daily turnover by calendar month", share: "industry turnover divided by the sum of reported turnover across the same full official KIS-master common-stock universe and period" },
  latestTradingDate: latestDate,
  latestTradingDateTotalKRW: dailyRows.filter((row) => row.period === latestDate).reduce((sum,row)=>sum+BigInt(row.tradingValueKRW),0n).toString(),
  latestTradingDateTop: latestDaily.slice(0,12),
  exports: outputNames,
  rawSourceFile: `scratch/kr-industry-turnover-20261025/kis-daily-turnover-${suffix}.jsonl`,
};
await writeFile(resolve(outDir, `kr-common-industry-turnover-kis-summary-${suffix}.json`), JSON.stringify(summary,null,2)+"\n", "utf8");
console.log(JSON.stringify(summary,null,2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
