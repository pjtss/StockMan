"use client";

import { useState } from "react";

type Result = {
  symbol: string; borrowStatus: string; quoteStatus: string; availableQty: number | null;
  availableQtyChangePercent: number | null; locatePricePerShare: number | null; locateFeeRatePercent: number | null;
  locatePriceChangePercent: number | null; pressureScore: number; pressureLevel: string; reasons: string[];
  quotedAt: string | null; fetchedAt: string; scope: string;
};

const levelClass: Record<string, string> = { LOW: "low", MEDIUM: "medium", HIGH: "high", EXTREME: "extreme" };

export function ShortBorrowDashboard() {
  const [symbol, setSymbol] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function search(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setResult(null);
    try {
      const params = currentPrice ? `?currentPrice=${encodeURIComponent(currentPrice)}` : "";
      const response = await fetch(`/api/short-borrow/${encodeURIComponent(symbol)}${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.code || "조회에 실패했습니다.");
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  return <main className="shortBorrowPage">
    <section className="shortBorrowHero"><p className="shortBorrowEyebrow">ALPACA SHORT BORROW</p><h1>공매도 대차 압박 조회</h1><p>티커를 입력하면 Alpaca 계정에 제공되는 대차 견적과 변화 기반 압박 점수를 확인합니다.</p></section>
    <form className="shortBorrowForm" onSubmit={search}><input aria-label="티커" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="예: TSLA" required /><input aria-label="현재가" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} placeholder="현재가(선택)" inputMode="decimal" /><button disabled={loading}>{loading ? "조회 중..." : "조회"}</button></form>
    {error && <p className="shortBorrowError">{error}</p>}
    {result && <section className="shortBorrowCard"><div className="shortBorrowCardHeader"><div><strong>{result.symbol}</strong><span>{result.borrowStatus} · {result.quoteStatus}</span></div><b className={`shortBorrowLevel ${levelClass[result.pressureLevel] || ""}`}>{result.pressureLevel} {result.pressureScore}</b></div><div className="shortBorrowGrid"><div><small>대차 가능 수량</small><strong>{result.availableQty?.toLocaleString() ?? "-"}</strong></div><div><small>수량 변화</small><strong>{result.availableQtyChangePercent === null ? "-" : `${result.availableQtyChangePercent.toFixed(2)}%`}</strong></div><div><small>주당 Locate</small><strong>{result.locatePricePerShare === null ? "-" : `$${result.locatePricePerShare}`}</strong></div><div><small>Locate 비용률</small><strong>{result.locateFeeRatePercent === null ? "-" : `${result.locateFeeRatePercent.toFixed(2)}%`}</strong></div><div><small>Locate 가격 변화</small><strong>{result.locatePriceChangePercent === null ? "-" : `${result.locatePriceChangePercent.toFixed(2)}%`}</strong></div><div><small>견적 시각</small><strong>{result.quotedAt ? new Date(result.quotedAt).toLocaleString("ko-KR") : "-"}</strong></div></div><ul>{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="shortBorrowNotice">이 값은 미국 시장 전체가 아닌 현재 Alpaca 계정에 제공되는 대차 견적입니다. 실제 Locate 신청이나 공매도 주문은 수행하지 않습니다.</p></section>}
  </main>;
}
