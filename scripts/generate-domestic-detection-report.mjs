import { writeFile } from "node:fs/promises";

const endpoint = process.env.DETECTION_ENDPOINT ?? "http://localhost:3000/api/scan/kr-accumulation";
const output = process.env.DETECTION_REPORT ?? "domestic-detection-report-2026-09-08.html";

const response = await fetch(endpoint, { headers: { accept: "application/json" } });
const body = await response.json();
if (!response.ok || !body?.ok) throw new Error(`Detection failed: HTTP ${response.status}`);

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const formatNumber = (value, digits = 2) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: digits }) : "-";
const results = Array.isArray(body.results) ? body.results : [];
const rows = results.map((item, index) => `<tr>
  <td>${index + 1}</td><td><strong>${escapeHtml(item.name)}</strong><br><code>${escapeHtml(item.code)}</code></td>
  <td>${escapeHtml(item.market)}<br>${escapeHtml(item.candleDate)}</td><td>${formatNumber(item.score, 0)}</td>
  <td>${formatNumber(item.rvol)}x</td><td>${formatNumber(item.close)}원</td>
  <td>${formatNumber(item.marketCap / 100000000, 1)}억</td><td>${escapeHtml(item.candleFetchedAt)}</td>
  <td><details><summary>근거 ${item.scoreBreakdown?.filter((signal) => signal.passed).length ?? 0}개</summary><ul>${(item.scoreBreakdown ?? []).map((signal) => `<li class="${signal.passed ? "pass" : "fail"}">${escapeHtml(signal.label)}: ${signal.passed ? `통과 (+${signal.points})` : `미통과 (${signal.points})`}</li>`).join("")}</ul></details></td>
</tr>`).join("\n");
const json = escapeHtml(JSON.stringify(body, null, 2));
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>국내 종목 탐지 보고서</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:32px;line-height:1.5}main{max-width:1600px;margin:auto}h1{margin-bottom:4px}h2{margin-top:32px}.muted{color:#9ca3af}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:22px 0}.card{background:#111c30;border:1px solid #263957;border-radius:12px;padding:16px}.value{font-size:24px;font-weight:800;color:#67e8f9}.table-wrap{overflow:auto;border:1px solid #263957;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1100px;background:#0f192b}th,td{padding:10px 12px;border-bottom:1px solid #263957;text-align:left;vertical-align:top}th{background:#17253c;position:sticky;top:0}code{color:#93c5fd}.pass{color:#86efac}.fail{color:#9ca3af}details{min-width:230px}pre{white-space:pre-wrap;overflow:auto;background:#07101e;border:1px solid #263957;border-radius:12px;padding:16px;font-size:12px}.warning{background:#2a2110;border:1px solid #80651f;border-radius:10px;padding:12px;margin:8px 0}.note{background:#102c2c;border:1px solid #1f7777;border-radius:10px;padding:12px;margin:16px 0}</style></head><body><main>
<h1>국내 종목 탐지 보고서</h1><p class="muted">프로젝트 DB 일봉 캐시 기반 · 생성 시각 ${escapeHtml(new Date().toISOString())}</p>
<div class="note">이 보고서는 KIS 직결 순위 API가 아니라 프로젝트에 저장된 국내 일봉 캐시를 사용한 실제 탐지 결과입니다. 투자 권유가 아닌 규칙 기반 후보 탐지입니다.</div>
<div class="cards"><div class="card">최신 기준일<div class="value">${escapeHtml(body.cache?.latestDateByMarket?.KOSPI ?? "-")} / ${escapeHtml(body.cache?.latestDateByMarket?.KOSDAQ ?? "-")}</div></div><div class="card">적격 종목<div class="value">${formatNumber(body.summary?.eligible, 0)}</div></div><div class="card">평가 종목<div class="value">${formatNumber(body.summary?.evaluated, 0)}</div></div><div class="card">탐지 종목<div class="value">${formatNumber(body.summary?.matched, 0)}</div></div><div class="card">최소 시가총액<div class="value">300억 원</div></div></div>
<h2>사용된 탐지 데이터와 메타데이터</h2><ul><li>원천: ${escapeHtml(body.source)}</li><li>로직 버전: ${escapeHtml(body.logicVersion)}</li><li>봉 기준: 일봉, 최신일 ${escapeHtml(results[0]?.candleDate ?? "-")}</li><li>캐시 저장 최신일: KOSPI ${escapeHtml(body.cache?.storedDateByMarket?.KOSPI ?? "-")}, KOSDAQ ${escapeHtml(body.cache?.storedDateByMarket?.KOSDAQ ?? "-")}</li><li>필요 최소 봉 수: ${escapeHtml(body.policy?.minimumBars)}</li><li>RVOL 기준: ${escapeHtml(body.policy?.rvol)}</li><li>지표: OBV, ADL, RVOL, EMA9/20, 골든크로스, 거래량 균형, 거래량 확장, 흡수, 변동성</li></ul>
${(body.warnings ?? []).map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("")}
<h2>탐지 종목 ${results.length}개</h2><div class="table-wrap"><table><thead><tr><th>순위</th><th>종목</th><th>시장·봉</th><th>점수</th><th>RVOL</th><th>종가</th><th>시총</th><th>봉 캐시 갱신</th><th>탐지 근거</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>전체 원본 응답(JSON)</h2><details><summary>원본 데이터 펼치기</summary><pre>${json}</pre></details>
</main></body></html>`;
await writeFile(output, html, "utf8");
console.log(`Wrote ${output} (${results.length} results)`);
