import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const startDate = process.argv[2] ?? "20260922";
const endDate = process.argv[3] ?? "20261023";
const scratch = resolve(process.cwd(), "scratch/kr-industry-turnover-20261025");
const reportDir = resolve(process.cwd(), "reports");
const turnoverPath = resolve(scratch, `kis-daily-turnover-${startDate}-${endDate}.jsonl`);
const classificationPath = resolve(scratch, `kis-standard-industry-${startDate}-${endDate}.jsonl`);
const summaryPath = resolve(reportDir, `kr-common-standard-industry-turnover-kis-summary-${startDate}-${endDate}.json`);

const parseJsonl = async path => (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const summary = JSON.parse(await readFile(summaryPath, "utf8"));
const [stocks, classifications] = await Promise.all([parseJsonl(turnoverPath), parseJsonl(classificationPath)]);
const expectedDates = summary.period.tradingDates;
if (stocks.length !== summary.stocks.queried || stocks.length !== summary.stocks.classified || summary.stocks.failed !== 0) {
  throw new Error(`주식 분류 커버리지 불일치: ${stocks.length}/${summary.stocks.classified}, 실패 ${summary.stocks.failed}`);
}

const classificationByStock = new Map();
const namesByIndustry = new Map();
for (const row of classifications) {
  const key = `${row.market}:${row.code}`;
  if (classificationByStock.has(key)) throw new Error(`중복 분류: ${key}`);
  const code = String(row.industryCode ?? "").trim();
  if (!/^\d{6}$/.test(code)) throw new Error(`유효하지 않은 표준산업 코드: ${key}`);
  classificationByStock.set(key, { code, name: String(row.industryName ?? "").trim() });
  if (row.industryName) {
    const nameCounts = namesByIndustry.get(code) ?? new Map();
    nameCounts.set(row.industryName, (nameCounts.get(row.industryName) ?? 0) + 1);
    namesByIndustry.set(code, nameCounts);
  }
}
if (classificationByStock.size !== stocks.length) throw new Error(`분류 원본 개수 불일치: ${classificationByStock.size}/${stocks.length}`);
const canonicalNames = new Map([...namesByIndustry].map(([code, counts]) => [code, [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))[0][0]]));

const industries = new Map();
for (const stock of stocks) {
  const key = `${stock.market}:${stock.code}`;
  const classification = classificationByStock.get(key);
  if (!classification) throw new Error(`분류 누락: ${key}`);
  if (!stock.name || !Array.isArray(stock.bars) || stock.bars.length === 0) throw new Error(`종목명 또는 거래일 데이터 누락: ${key}`);
  const barsByDate = new Map(stock.bars.map(bar => [bar.date, BigInt(bar.tradingValueKRW)]));
  if (barsByDate.size !== stock.bars.length || stock.bars.some(bar => !expectedDates.includes(bar.date))) throw new Error(`20거래일 범위 밖 데이터 또는 중복: ${key}`);
  const total = [...barsByDate.values()].reduce((sum, value) => sum + value, 0n);
  const industry = industries.get(classification.code) ?? {
    code: classification.code,
    name: canonicalNames.get(classification.code) ?? `분류명 미제공 (${classification.code})`,
    stocks: [],
  };
  industry.stocks.push({
    market: stock.market,
    code: stock.code,
    name: stock.name,
    total: total.toString(),
    average: (total / BigInt(expectedDates.length)).toString(),
    firstDay: (barsByDate.get(expectedDates[0]) ?? 0n).toString(),
    lastDay: (barsByDate.get(expectedDates.at(-1)) ?? 0n).toString(),
    daily: expectedDates.map(date => ({ date, tradingValue: (barsByDate.get(date) ?? 0n).toString(), barStatus: barsByDate.has(date) ? "REPORTED" : "NO_BAR_REPORTED", dataUpdatedAt: stock.fetchedAt })),
    fetchedAt: stock.fetchedAt,
  });
  industries.set(classification.code, industry);
}

const industryRows = [...industries.values()].map(industry => {
  industry.stocks.sort((a, b) => {
    const av = BigInt(a.total), bv = BigInt(b.total);
    return av === bv ? a.code.localeCompare(b.code) : av > bv ? -1 : 1;
  });
  industry.totalStocks = industry.stocks.length;
  industry.totalTurnover = industry.stocks.reduce((sum, stock) => sum + BigInt(stock.total), 0n).toString();
  industry.top5 = industry.stocks.slice(0, 5).map((stock, index) => ({
    ...stock,
    rank: index + 1,
    share: industry.totalTurnover === "0" ? 0 : Number(BigInt(stock.total) * 10000n / BigInt(industry.totalTurnover)) / 100,
  }));
  return industry;
}).sort((a, b) => BigInt(a.totalTurnover) === BigInt(b.totalTurnover)
  ? a.code.localeCompare(b.code)
  : BigInt(a.totalTurnover) > BigInt(b.totalTurnover) ? -1 : 1);

if (industryRows.length !== summary.industryCount) throw new Error(`산업 수 불일치: ${industryRows.length}/${summary.industryCount}`);
const categorizedTurnover = industryRows.reduce((sum, industry) => sum + BigInt(industry.totalTurnover), 0n);
if (categorizedTurnover !== BigInt(summary.totalTurnover20dKRW)) throw new Error("분류별 합계와 원본 전체 거래대금 불일치");

const csvFields = ["periodStart", "periodEnd", "rank", "industryCode", "industry", "industryStockCount", "stockMarket", "stockCode", "stockName", "turnover20dKRW", "averageDailyKRW", "industrySharePercent", "firstDayKRW", "lastDayKRW", "dataUpdatedAt"];
const csvEscape = value => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csvRows = [csvFields.join(",")];
for (const industry of industryRows) for (const stock of industry.top5) {
  csvRows.push([
    startDate, endDate, stock.rank, industry.code, industry.name, industry.totalStocks,
    stock.market, stock.code, stock.name, stock.total, stock.average, stock.share,
    stock.firstDay, stock.lastDay, stock.fetchedAt,
  ].map(csvEscape).join(","));
}
const csvFile = `kr-common-standard-industry-stock-top5-kis-${startDate}-${endDate}.csv`;
await writeFile(resolve(reportDir, csvFile), `\uFEFF${csvRows.join("\n")}\n`, "utf8");
const dailyCsvFields = ["periodStart", "periodEnd", "rank", "industryCode", "industry", "stockMarket", "stockCode", "stockName", "barDate", "tradingValueKRW", "barStatus", "dataUpdatedAt"];
const dailyCsvRows = [dailyCsvFields.join(",")];
for (const industry of industryRows) for (const stock of industry.top5) for (const day of stock.daily) {
  dailyCsvRows.push([startDate, endDate, stock.rank, industry.code, industry.name, stock.market, stock.code, stock.name, day.date, day.tradingValue, day.barStatus, day.dataUpdatedAt].map(csvEscape).join(","));
}
const dailyCsvFile = `kr-common-standard-industry-stock-top5-daily-kis-${startDate}-${endDate}.csv`;
await writeFile(resolve(reportDir, dailyCsvFile), `\uFEFF${dailyCsvRows.join("\n")}\n`, "utf8");

const htmlFile = `kr-standard-industry-stock-top5-${startDate}-${endDate}.html`;
const data = JSON.stringify({ startDate, endDate, dates: expectedDates, industries: industryRows.map(({ stocks: _allStocks, ...industry }) => industry), totalStocks: stocks.length, totalTurnover: summary.totalTurnover20dKRW, dataUpdatedAt: summary.generatedAt, csvFile, dailyCsvFile }).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light">
<title>세부산업별 거래대금 TOP 5 · 20거래일</title>
<style>
:root{font-family:Inter,"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;color:#172b43;background:#f3f6fa;font-synthesis:none;text-rendering:optimizeLegibility;font-weight:400;font-size:15px;--ink:#172b43;--muted:#65758b;--line:#dce4ee;--accent:#087f74;--blue:#3475ad;--orange:#c17d22;--purple:#8159a8;--red:#bb5b51}*{box-sizing:border-box}body{margin:0;min-width:320px;background:#f3f6fa}.wrap{max-width:1240px;margin:auto;padding:28px 28px 48px}.hero{background:#132b46;color:#f7fbff;padding:30px clamp(20px,4vw,48px);border-radius:16px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a9c7d7}.hero h1{font-size:clamp(25px,3vw,36px);line-height:1.25;font-weight:600;margin:9px 0 8px}.hero p{margin:0;color:#d1dfeb;line-height:1.6}.meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:18px;font-size:13px;color:#c2d5e3}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0 28px}.metric{background:#fff;border:1px solid var(--line);border-radius:12px;padding:15px 18px}.metric-label{font-size:12px;color:var(--muted)}.metric-value{font-size:23px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:5px;white-space:nowrap}.section{margin-top:32px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 10px}.section h2{font-size:20px;margin:0;font-weight:600}.section-note{font-size:12px;color:var(--muted);margin:6px 0 0}.controls{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:15px 0}.field{display:grid;gap:5px}.field label{font-size:12px;color:var(--muted)}select,input{font:inherit;color:var(--ink);background:#fff;border:1px solid #cbd6e2;border-radius:8px;padding:9px 11px;min-height:40px}select{min-width:min(100%,380px)}input{width:min(100%,360px)}.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;margin-top:12px}.panel-head{display:flex;justify-content:space-between;gap:14px;align-items:start;flex-wrap:wrap}.panel h3{font-size:17px;margin:0}.muted{color:var(--muted)}.chart{display:grid;gap:11px;margin:18px 0 14px}.trend-controls{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:24px}.trend-controls h4{font-size:16px;margin:0}.trend-legend{display:flex;gap:6px 14px;flex-wrap:wrap;margin:8px 0}.trend-legend button{border:0;background:transparent;color:var(--ink);font:inherit;font-size:12px;padding:5px 2px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.trend-legend button[aria-pressed="false"]{opacity:.4;text-decoration:line-through}.trend-swatch{width:10px;height:10px;border-radius:50%;display:inline-block}.line-chart{display:block;width:100%;overflow:visible}.line-chart text{font-family:inherit;fill:var(--ink);font-size:11px}.line-chart .muted{fill:var(--muted)}.line-chart .grid{stroke:#e6ebf1;stroke-width:1}.line-chart .axis{stroke:#aab8c8;stroke-width:1}.line-chart .series{fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}.line-chart .point{stroke:#fff;stroke-width:1.2}.bar-row{display:grid;grid-template-columns:minmax(115px,190px) minmax(80px,1fr) minmax(105px,155px);gap:10px;align-items:center}.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.bar-track{height:16px;background:#edf2f7;border-radius:99px;overflow:hidden}.bar-fill{height:100%;background:var(--accent);border-radius:99px}.bar-value{text-align:right;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}.table-wrap{overflow:auto;background:#fff;border:1px solid var(--line);border-radius:12px;margin-top:14px}table{border-collapse:collapse;width:100%;min-width:760px;font-size:13px}thead{position:sticky;top:0;background:#edf2f7;z-index:1}th,td{padding:10px 12px;border-bottom:1px solid #e6ebf1;text-align:left}th{font-weight:500;color:#53647a;white-space:nowrap}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.rank{font-weight:600;color:var(--accent);text-align:right}.industry-button{border:0;background:none;color:#176d84;font:inherit;text-align:left;padding:2px;cursor:pointer}.industry-button:hover{text-decoration:underline}.download{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 13px;border:1px solid #cbd6e2;border-radius:8px;background:#fff;color:#176d84;text-decoration:none;font-size:13px}.note{font-size:12px;line-height:1.65;color:var(--muted);margin-top:13px}.foot{border-top:1px solid var(--line);padding-top:16px;margin-top:34px;color:var(--muted);font-size:12px;line-height:1.65}@media(max-width:760px){.wrap{padding:14px 14px 32px}.hero{border-radius:12px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.metric{padding:12px}.metric-value{font-size:19px}.section{margin-top:25px}.bar-row{grid-template-columns:minmax(90px,130px) minmax(60px,1fr) minmax(85px,120px);gap:7px}.bar-label,.bar-value{font-size:11px}}@media(max-width:420px){.metrics{grid-template-columns:1fr 1fr}.bar-row{grid-template-columns:minmax(75px,100px) minmax(50px,1fr) 85px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>
</head>
<body><main class="wrap">
<header class="hero"><div class="eyebrow">KIS 공식 일봉 · 국내 보통주</div><h1>세부산업별 거래대금 TOP 5</h1><p id="period-line"></p><div class="meta"><span>KIS 표준산업분류</span><span>시장: KRX+NXT 통합</span><span>순위: 산업 내 20거래일 누적 기준</span></div></header>
<section class="metrics" aria-label="집계 요약"><div class="metric"><div class="metric-label">전체 거래대금</div><div class="metric-value" id="total-value"></div></div><div class="metric"><div class="metric-label">세부 산업 분류</div><div class="metric-value" id="industry-count"></div></div><div class="metric"><div class="metric-label">대상 보통주</div><div class="metric-value" id="stock-count"></div></div><div class="metric"><div class="metric-label">산업별 TOP 5 종목</div><div class="metric-value" id="ranked-count"></div></div></section>
<section class="section" aria-labelledby="details-title"><div class="section-head"><div><h2 id="details-title">산업 선택</h2><p class="section-note">산업 안에서 20거래일 거래대금이 큰 종목부터 표시합니다.</p></div><a class="download" id="csv-link" download>전체 TOP 5 CSV</a><a class="download" id="daily-csv-link" download>종목별 일별 데이터 CSV</a></div><div class="controls"><div class="field"><label for="industry-select">세부 산업</label><select id="industry-select" aria-label="조회할 세부 산업"></select></div><div class="field"><label for="industry-search">산업 검색</label><input id="industry-search" type="search" placeholder="산업명 또는 코드" aria-controls="industry-table"></div></div><article class="panel" id="industry-panel" aria-live="polite"></article></section>
<section class="section" aria-labelledby="index-title"><div class="section-head"><div><h2 id="index-title">전체 산업 목록</h2><p class="section-note">산업명을 선택하면 해당 산업의 TOP 5가 위에 표시됩니다.</p></div></div><div class="table-wrap"><table><thead><tr><th class="num">전체 순위</th><th>분류코드</th><th>세부 산업</th><th class="num">산업 종목 수</th><th>거래대금 1위</th><th class="num">1위 거래대금</th><th class="num">TOP 5 종목 수</th></tr></thead><tbody id="industry-table"></tbody></table></div></section>
<p class="note">순위는 2026-09-22~2026-10-23 실제 거래일 20개의 종목별 KIS 보고 거래대금을 합산해 산업 내부에서 계산했습니다. 동률은 종목코드 오름차순입니다. 산업별 보유 종목이 5개 미만인 경우 존재하는 종목만 표시합니다. 산업 내 비중은 해당 산업 전체 거래대금 대비 종목별 비율입니다. 기간 전체에 보고 거래대금이 0인 산업은 동률 종목을 코드순으로 표시.</p>
<footer class="foot">원천: 한국투자증권 국내주식 일봉 FHKST03010100(acml_tr_pbmn), 주식기본조회 CTPF1002R(std_idst_clsf_cd/name). 공식 활성 보통주 2,548종목. 거래대금은 종가×거래량으로 추정하지 않았습니다. 종목별 사용 거래일과 데이터 갱신시각(UTC)은 종목별 일별 표 및 상세 CSV에서 확인할 수 있습니다. 조회·집계 기준 시각: 2026-10-26 KST.</footer>
</main><script>
const DATA = ${data};
const numberFmt = new Intl.NumberFormat("ko-KR");
const money = value => { const amount = BigInt(value); return \`₩\${(Number(amount) / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}조\`; };
const pct = value => \`\${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%\`;
const safe = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\\\"":"&quot;", "'":"&#39;" }[char]));
const formatDate = value => \`\${value.slice(0,4)}-\${value.slice(4,6)}-\${value.slice(6,8)}\`;
document.getElementById("period-line").textContent = \`\${formatDate(DATA.startDate)}~\${formatDate(DATA.endDate)} · 실제 거래일 \${DATA.dates.length}일\`;
document.getElementById("total-value").textContent = money(DATA.totalTurnover);
document.getElementById("industry-count").textContent = \`\${numberFmt.format(DATA.industries.length)}개\`;
document.getElementById("stock-count").textContent = \`\${numberFmt.format(DATA.totalStocks)}개\`;
document.getElementById("ranked-count").textContent = \`\${numberFmt.format(DATA.industries.reduce((sum, item) => sum + item.top5.length, 0))}개\`;
document.getElementById("csv-link").href = DATA.csvFile;
document.getElementById("daily-csv-link").href = DATA.dailyCsvFile;
const select = document.getElementById("industry-select");
select.innerHTML = DATA.industries.map(item => \`<option value="\${safe(item.code)}">\${safe(item.name)} (\${safe(item.code)}) · \${item.top5.length}종목</option>\`).join("");
function renderDailyTrend(item) {
  const colors = ["#087f74", "#3475ad", "#c17d22", "#8159a8", "#bb5b51"];
  const legend = document.getElementById("trend-legend");
  const scale = document.getElementById("trend-scale");
  const visible = new Set(item.top5.map((stock, index) => index));
  const draw = () => {
    const mode = scale.value;
    const series = item.top5.map((stock, index) => ({ stock, index })).filter(entry => visible.has(entry.index));
    const values = series.flatMap(({ stock }) => {
      const baseDay = stock.daily.find(day => BigInt(day.tradingValue) > 0n);
      const base = baseDay ? Number(BigInt(baseDay.tradingValue)) : 0;
      return stock.daily.map(day => mode === "index" ? (base ? Number(BigInt(day.tradingValue)) / base * 100 : 0) : Number(BigInt(day.tradingValue)) / 1e12);
    });
    const maximum = Math.max(1, ...values);
    const left = 78, right = 1025, top = 25, bottom = 317, width = right - left, height = bottom - top;
    const x = index => left + width * index / Math.max(1, DATA.dates.length - 1);
    const y = value => bottom - height * value / maximum;
    let svg = '<title>' + safe(item.name) + ' 주도주 일별 거래대금 추이</title><desc>' + safe(formatDate(DATA.startDate)) + '부터 ' + safe(formatDate(DATA.endDate)) + '까지 ' + series.length + '개 종목의 ' + (mode === "index" ? '첫 거래 보고일 기준 지수' : '조 원 단위 거래대금') + '</desc>';
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = maximum * tick / 4;
      const py = y(value);
      svg += '<line class="grid" x1="' + left + '" y1="' + py + '" x2="' + right + '" y2="' + py + '"></line>';
      svg += '<text class="muted" text-anchor="end" x="' + (left - 10) + '" y="' + (py + 4) + '">' + value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + '</text>';
    }
    svg += '<line class="axis" x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + bottom + '"></line><line class="axis" x1="' + left + '" y1="' + bottom + '" x2="' + right + '" y2="' + bottom + '"></line>';
    DATA.dates.forEach((date, index) => {
      if (index % 2 !== 0 && index !== DATA.dates.length - 1) return;
      svg += '<text class="muted" text-anchor="middle" x="' + x(index) + '" y="' + (bottom + 23) + '">' + safe(formatDate(date).slice(5)) + '</text>';
    });
    series.forEach(({ stock, index }) => {
      const baseDay = stock.daily.find(day => BigInt(day.tradingValue) > 0n);
      const base = baseDay ? Number(BigInt(baseDay.tradingValue)) : 0;
      const points = stock.daily.map((day, dayIndex) => {
        const amount = Number(BigInt(day.tradingValue));
        const value = mode === "index" ? (base ? amount / base * 100 : 0) : amount / 1e12;
        return { day, dayIndex, value, px: x(dayIndex), py: y(value) };
      });
      svg += '<polyline class="series" stroke="' + colors[index] + '" points="' + points.map(point => point.px + ',' + point.py).join(' ') + '"></polyline><g fill="' + colors[index] + '">';
      points.forEach(point => {
        const valueLabel = mode === "index" ? point.value.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + ' 지수' : money(point.day.tradingValue);
        svg += '<circle class="point" cx="' + point.px + '" cy="' + point.py + '" r="3.4"><title>' + safe(stock.name) + ' (' + safe(stock.code) + ') · ' + safe(formatDate(point.day.date)) + ' · ' + safe(valueLabel) + ' · 조회 ' + safe(point.day.dataUpdatedAt) + ' UTC' + '</title></circle>';
      });
      svg += '</g>';
    });
    const chart = document.getElementById("daily-trend");
    chart.setAttribute("aria-label", safe(item.name) + ' 산업 TOP ' + series.length + ' 종목 일별 거래대금 추이');
    chart.innerHTML = svg;
  };
  legend.innerHTML = item.top5.map((stock, index) => '<button type="button" data-series="' + index + '" aria-pressed="true"><span class="trend-swatch" style="background:' + colors[index] + '"></span>' + safe(stock.name) + ' (' + safe(stock.code) + ')</button>').join('');
  legend.addEventListener("click", event => {
    const button = event.target.closest("[data-series]");
    if (!button) return;
    const index = Number(button.dataset.series);
    if (visible.has(index)) visible.delete(index); else visible.add(index);
    button.setAttribute("aria-pressed", String(visible.has(index)));
    draw();
  });
  scale.addEventListener("change", draw);
  draw();
}
function renderIndustry(code) {
  const item = DATA.industries.find(industry => industry.code === code) ?? DATA.industries[0];
  select.value = item.code;
  const max = BigInt(item.top5[0]?.total ?? "0");
  const bars = item.top5.map(stock => {
    const width = max === 0n ? 0 : Number(BigInt(stock.total) * 10000n / max) / 100;
    return \`<div class="bar-row"><div class="bar-label" title="\${safe(stock.name)} (\${safe(stock.code)})">\${safe(stock.name)} (\${safe(stock.code)})</div><div class="bar-track" role="img" aria-label="\${safe(stock.name)} 거래대금 \${safe(money(stock.total))}"><div class="bar-fill" style="width:\${width}%"></div></div><div class="bar-value">\${safe(money(stock.total))}</div></div>\`;
  }).join("");
  const rows = item.top5.map(stock => \`<tr><td class="rank">\${stock.rank}</td><td>\${safe(stock.code)}</td><td>\${safe(stock.name)}</td><td>\${safe(stock.market)}</td><td class="num">\${safe(money(stock.total))}</td><td class="num">\${safe(money(stock.average))}</td><td class="num">\${safe(pct(stock.share))}</td><td class="num">\${safe(money(stock.firstDay))} → \${safe(money(stock.lastDay))}</td></tr>\`).join("");
  const dailyRows = item.top5.flatMap(stock => stock.daily.map(day => \`<tr><td>\${safe(formatDate(day.date))}</td><td>\${safe(stock.code)}</td><td>\${safe(stock.name)}</td><td class="num">\${safe(money(day.tradingValue))}</td><td>\${safe(day.barStatus === "REPORTED" ? "거래대금 보고" : "일봉 미보고·0 처리")}</td><td>\${safe(day.dataUpdatedAt)}</td></tr>\`).join(""));
  document.getElementById("industry-panel").innerHTML = \`<div class="panel-head"><div><h3>\${safe(item.name)} <span class="muted">(\${safe(item.code)})</span></h3><p class="section-note">산업 전체 \${numberFmt.format(item.totalStocks)}종목 · 거래대금 합계 \${safe(money(item.totalTurnover))} · 상위 \${item.top5.length}종목</p></div></div><div class="chart" role="img" aria-label="\${safe(item.name)} 거래대금 TOP \${item.top5.length}">\${bars}</div><div class="trend-controls"><div><h4>산업 주도주 일별 거래대금 추이</h4><p class="section-note">선택한 산업의 TOP 종목을 일자별로 비교합니다. 범례를 눌러 선을 켜거나 끌 수 있습니다.</p></div><div class="field"><label for="trend-scale">그래프 단위</label><select id="trend-scale"><option value="amount">거래대금 (조 원)</option><option value="index">첫 거래 보고일 = 100</option></select></div></div><div class="trend-legend" id="trend-legend" role="group" aria-label="그래프에 표시할 종목"></div><svg id="daily-trend" class="line-chart" viewBox="0 0 1050 370" role="img" aria-label="선택 산업 TOP 종목의 일별 거래대금 추이"></svg><div class="note">지수 보기는 종목별 첫 거래대금 보고일을 100으로 환산합니다. 일봉 응답에 없는 날짜는 0으로 표시합니다.</div><div class="table-wrap"><table><thead><tr><th class="num">순위</th><th>종목코드</th><th>종목명</th><th>시장</th><th class="num">20일 누적</th><th class="num">일평균</th><th class="num">산업 내 비중</th><th class="num">첫날 → 마지막날</th></tr></thead><tbody>\${rows}</tbody></table></div><details class="note"><summary>TOP \${item.top5.length} 종목별 날짜·일봉 갱신시각 (\${item.top5.length}종목 × \${DATA.dates.length}거래일)</summary><div class="table-wrap"><table><thead><tr><th>거래일</th><th>종목코드</th><th>종목명</th><th class="num">일 거래대금</th><th>봉 상태</th><th>데이터 갱신시각 (UTC)</th></tr></thead><tbody>\${dailyRows}</tbody></table></div></details>\`;
  renderDailyTrend(item);
}
function renderIndex(query = "") {
  const q = query.trim().toLocaleLowerCase("ko-KR");
  const visible = DATA.industries.filter(item => !q || \`\${item.code} \${item.name} \${item.top5.map(stock => \`\${stock.code} \${stock.name}\`).join(" ")}\`.toLocaleLowerCase("ko-KR").includes(q));
  document.getElementById("industry-table").innerHTML = visible.map(item => \`<tr><td class="num">\${DATA.industries.indexOf(item) + 1}</td><td>\${safe(item.code)}</td><td><button class="industry-button" data-industry="\${safe(item.code)}">\${safe(item.name)}</button></td><td class="num">\${numberFmt.format(item.totalStocks)}</td><td>\${safe(item.top5[0]?.name ?? "—")} (\${safe(item.top5[0]?.code ?? "—")})</td><td class="num">\${safe(money(item.top5[0]?.total ?? "0"))}</td><td class="num">\${item.top5.length}</td></tr>\`).join("");
}
select.addEventListener("change", () => renderIndustry(select.value));
document.getElementById("industry-search").addEventListener("input", event => renderIndex(event.target.value));
document.getElementById("industry-table").addEventListener("click", event => { const button = event.target.closest("[data-industry]"); if (button) { renderIndustry(button.dataset.industry); document.getElementById("industry-panel").scrollIntoView({ block:"start", behavior:"smooth" }); } });
renderIndustry(DATA.industries[0].code); renderIndex();
</script></body></html>`;
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!inlineScript) throw new Error("HTML 인라인 스크립트를 찾을 수 없습니다.");
new Function(inlineScript);
await writeFile(resolve(reportDir, htmlFile), html, "utf8");
console.log(JSON.stringify({ htmlFile, csvFile, dailyCsvFile, stockCount: stocks.length, classifiedStocks: classificationByStock.size, tradingDates: expectedDates.length, industryCount: industryRows.length, top5Rows: csvRows.length - 1, dailyRows: dailyCsvRows.length - 1, industriesUnderFiveStocks: industryRows.filter(industry => industry.totalStocks < 5).length, zeroTurnoverIndustries: industryRows.filter(industry => industry.totalTurnover === "0").length, industryTurnoverMatches: true, inlineJavaScriptSyntax: "valid" }, null, 2));
