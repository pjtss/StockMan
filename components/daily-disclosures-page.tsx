"use client";
import { useEffect, useState } from "react";
type Item = Record<string, unknown> & { id: number; source: string };
type WindowInfo = { hours: number; from: string; to: string } | null;
const SOURCES = [
  { value: "DART", label: "DART 공시" },
  { value: "KRX_KIND", label: "KIND 거래소 공시 RSS" },
  { value: "NEWSIS", label: "뉴시스 RSS" },
  { value: "MK", label: "매일경제 RSS" },
  { value: "HANKYUNG", label: "한국경제 RSS" },
  { value: "ETODAY", label: "이투데이 RSS" },
  { value: "SEC_EDGAR", label: "SEC EDGAR RSS" },
  { value: "STOCKTITAN", label: "StockTitan RSS" },
  { value: "NASDAQ", label: "Nasdaq RSS" },
  { value: "NASDAQ_TRADER", label: "Nasdaq Trader RSS" },
  { value: "GLOBENEWSWIRE", label: "GlobeNewswire RSS" },
];
export function DailyDisclosuresPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rangeMode, setRangeMode] = useState<"hours" | "date">("hours");
  const [hours, setHours] = useState(1);
  const [source, setSource] = useState("all"); const [items, setItems] = useState<Item[]>([]); const [windowInfo, setWindowInfo] = useState<WindowInfo>(null); const [status, setStatus] = useState("");
  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setStatus("불러오는 중…");
    void (async () => {
      const params = new URLSearchParams({ source, ...(rangeMode === "hours" ? { hours: String(hours) } : { date }) });
      const response = await fetch(`/api/disclosures?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.items)) throw new Error("Invalid disclosure response");
      if (!cancelled) { setItems(body.items as Item[]); setWindowInfo(body.window ?? null); setStatus(`${Number(body.total ?? body.items.length).toLocaleString()}건 전체 조회 완료`); }
    })().catch(() => { if (!cancelled) setStatus("조회에 실패했습니다."); });
    return () => { cancelled = true; };
  }, [date, hours, rangeMode, source]);
  const rangeMetadata = rangeMode === "hours" ? { hours, window: windowInfo } : { date };
  async function copyJson() { const value = JSON.stringify({ ...rangeMetadata, source, total: items.length, items }, null, 2); let result = "failed"; try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value); else throw new Error("clipboard unavailable"); setStatus("전체 JSON을 복사했습니다."); result = "success"; } catch { const area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); setStatus(copied ? "전체 JSON을 복사했습니다." : "복사에 실패했습니다."); result = copied ? "success" : "failed"; area.remove(); } void fetch("/api/user-activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: "news", action: "copy_json", resource: `${rangeMode === "hours" ? `${hours}h` : date}:${source}`, result }) }).catch(() => undefined); window.setTimeout(() => setStatus(""), 2000); }
  function downloadJson() { const value = JSON.stringify({ ...rangeMetadata, source, total: items.length, items }, null, 2); const blobUrl = URL.createObjectURL(new Blob([value], { type: "application/json;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = blobUrl; anchor.download = `disclosures-${rangeMode === "hours" ? `last-${hours}-hours` : date}-${source.toLowerCase()}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); }
  return <section className="disclosureBoard disclosureSurface"><div className="disclosureBoardHead"><div className="disclosureTitle"><span className="disclosureEyebrow">RAW DATA EXPORT</span><h2>JSON 내보내기</h2><p>{items.length.toLocaleString()}건 · 선택 조건의 전체 원본 데이터</p></div><div className="disclosureControls disclosureControlsModern"><label><span>조회 기준</span><select aria-label="조회 기준" value={rangeMode} onChange={(e) => setRangeMode(e.target.value as "hours" | "date")}><option value="hours">최근 시간</option><option value="date">기준일</option></select></label>{rangeMode === "hours" ? <label><span>기간</span><select aria-label="최근 시간" value={hours} onChange={(e) => setHours(Number(e.target.value))}>{Array.from({ length: 24 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>최근 {value}시간</option>)}</select></label> : <label><span>기준일</span><input aria-label="기준일" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}<label><span>출처</span><select aria-label="출처" value={source} onChange={(e) => setSource(e.target.value)}><option value="all">전체 출처</option>{SOURCES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="disclosureCopyButton" onClick={() => void copyJson()} disabled={Boolean(status.includes("불러오는 중"))}>전체 JSON 복사</button><button type="button" className="disclosureCopyButton" onClick={downloadJson} disabled={!items.length || Boolean(status.includes("불러오는 중"))}>JSON 파일 저장</button></div></div>{status && <p role="status" className="disclosureStatus">{status}</p>}<div className="disclosureJsonHint">{rangeMode === "hours" ? <>현재 시각 기준 최근 {hours}시간의 저장 데이터입니다. 1~24시간 단위로 선택할 수 있습니다.{windowInfo && <> 조회 구간: {new Date(windowInfo.from).toLocaleString()} ~ {new Date(windowInfo.to).toLocaleString()}</>}</> : "선택한 날짜(KST)의 저장 데이터를 조회합니다."} 결과는 전체 복사 또는 JSON 파일로 저장할 수 있습니다.</div></section>;
}
