"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.stack || error.message, path: window.location.pathname }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#020617", color: "#e2e8f0" }}>
      <section style={{ width: "min(100%, 480px)", padding: 28, border: "1px solid rgba(148,163,184,.22)", borderRadius: 18, background: "rgba(15,23,42,.86)", textAlign: "center" }}>
        <p style={{ margin: "0 0 8px", color: "#00ffa3", fontWeight: 800 }}>STOCKMAN</p>
        <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>페이지를 불러오지 못했습니다</h1>
        <p style={{ margin: "0 0 22px", color: "#94a3b8", lineHeight: 1.6 }}>잠시 후 다시 시도해주세요. 문제가 계속되면 자동으로 오류 정보가 기록됩니다.</p>
        <button type="button" onClick={() => reset()} style={{ border: 0, borderRadius: 10, padding: "11px 18px", background: "#00ffa3", color: "#020617", fontWeight: 800, cursor: "pointer" }}>다시 시도</button>
      </section>
    </main>
  );
}
