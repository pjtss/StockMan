"use client";

import { useState } from "react";

const requiredFiles = ["kospi_code.mst", "kosdaq_code.mst", "NASMST.COD", "NYSMST.COD", "AMSMST.COD"];

export function AdminInstrumentUniverseImport() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function submit() {
    const form = new FormData();
    files.forEach((file) => form.append("files", file, file.name));
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/instrument-universe-import", { method: "POST", body: form });
      const responseText = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = {
          ok: false,
          error: `서버가 JSON이 아닌 응답을 반환했습니다. (HTTP ${response.status})`,
          responsePreview: responseText.slice(0, 500),
        };
      }
      setResult(payload);
    } catch (error) { setResult({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }

  const names = new Set(files.map((file) => file.name));
  const complete = requiredFiles.every((name) => names.has(name));
  return <section style={{ display: "grid", gap: 16, maxWidth: 900 }}>
    <div style={{ padding: 20, border: "1px solid var(--border, #dbe3ee)", borderRadius: 14 }}>
      <h2 style={{ marginTop: 0 }}>KIS 종목 마스터 업로드</h2>
      <p>국내·해외 유니버스 테이블에 적재하며, 상품 분류와 활성 상태를 함께 기록합니다.</p>
      <input type="file" multiple accept=".mst,.COD,.cod" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
      <ul>{requiredFiles.map((name) => <li key={name}>{names.has(name) ? "✅" : "⬜"} {name}</li>)}</ul>
      <button type="button" onClick={() => void submit()} disabled={!complete || busy} style={{ padding: "10px 16px", borderRadius: 8, cursor: complete && !busy ? "pointer" : "not-allowed" }}>
        {busy ? "적재 중..." : "유니버스에 적재"}
      </button>
    </div>
    {result !== null && <pre style={{ margin: 0, padding: 16, overflow: "auto", maxHeight: 500, borderRadius: 12, background: "#0f172a", color: "#e2e8f0" }}>{JSON.stringify(result, null, 2)}</pre>}
  </section>;
}
