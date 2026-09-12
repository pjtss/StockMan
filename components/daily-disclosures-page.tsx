"use client";
import { useEffect, useState } from "react";
type Item = Record<string, unknown> & { id: number; source: string };
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
  const [source, setSource] = useState("all"); const [items, setItems] = useState<Item[]>([]); const [status, setStatus] = useState("");
  useEffect(() => { setStatus("불러오는 중…"); void fetch(`/api/disclosures?date=${date}&source=${source}&limit=500`, { cache: "no-store" }).then((r) => r.json()).then((body) => setItems(Array.isArray(body.items) ? body.items : [])).catch(() => setStatus("조회에 실패했습니다.")).finally(() => setStatus("")); }, [date, source]);
  async function copyJson() { const value = JSON.stringify({ date, source, total: items.length, items }, null, 2); let result = "failed"; try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value); else throw new Error("clipboard unavailable"); setStatus("전체 JSON을 복사했습니다."); result = "success"; } catch { const area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); setStatus(copied ? "전체 JSON을 복사했습니다." : "복사에 실패했습니다."); result = copied ? "success" : "failed"; area.remove(); } void fetch("/api/user-activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: "news", action: "copy_json", resource: `${date}:${source}`, result }) }).catch(() => undefined); window.setTimeout(() => setStatus(""), 2000); }
  return <section className="disclosureBoard disclosureSurface"><div className="disclosureBoardHead"><div className="disclosureTitle"><span className="disclosureEyebrow">RAW DATA EXPORT</span><h2>JSON 내보내기</h2><p>{items.length}건 · 선택 조건의 전체 원본 데이터</p></div><div className="disclosureControls disclosureControlsModern"><label><span>기준일</span><input aria-label="기준일" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label><span>출처</span><select aria-label="출처" value={source} onChange={(e) => setSource(e.target.value)}><option value="all">전체 출처</option>{SOURCES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="disclosureCopyButton" onClick={() => void copyJson()}>전체 JSON 복사</button></div></div>{status && <p role="status" className="disclosureStatus">{status}</p>}<div className="disclosureJsonHint">화면에는 목록을 표시하지 않습니다. 현재 조건으로 조회된 전체 JSON만 클립보드에 복사합니다.</div></section>;
}
