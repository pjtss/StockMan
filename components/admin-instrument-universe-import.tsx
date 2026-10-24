"use client";

import { useState } from "react";

const requiredFiles = ["kospi_code.mst", "kosdaq_code.mst", "NASMST.COD", "NYSMST.COD", "AMSMST.COD"];
const domesticMasterFiles = ["kospi_code.mst", "kosdaq_code.mst"];

export function AdminInstrumentUniverseImport() {
  const [files, setFiles] = useState<File[]>([]);
  const [domesticFiles, setDomesticFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [industryProgress, setIndustryProgress] = useState<{ processed: number; total: number } | null>(null);

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

  async function syncDomesticIndustryCodes() {
    setBusy(true);
    setResult(null);
    setIndustryProgress({ processed: 0, total: 0 });
    try {
      const statusResponse = await fetch("/api/admin/domestic-industry-sync", { cache: "no-store" });
      const status = await statusResponse.json();
      if (!statusResponse.ok || status.ok !== true) throw new Error(status.error || `상태 조회 실패 (HTTP ${statusResponse.status})`);
      const total = Number(status.total);
      if (!Number.isSafeInteger(total) || total < 1) throw new Error("운영 보통주 대상 목록을 확인할 수 없습니다.");
      setIndustryProgress({ processed: Number(status.completed) || 0, total });
      let processed = 0;
      while (processed < total) {
        const response = await fetch("/api/admin/domestic-industry-sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offset: processed, expectedTotal: total, batchSize: 10 }),
        });
        const payload = await response.json();
        if (!response.ok || payload.ok !== true) throw new Error(`${payload.error || `갱신 실패 (HTTP ${response.status})`}${payload.failedCode ? `: ${payload.failedCode}` : ""}`);
        processed = Number(payload.nextOffset);
        setIndustryProgress({ processed, total });
      }
      const finalResponse = await fetch("/api/admin/domestic-industry-sync", { cache: "no-store" });
      const finalStatus = await finalResponse.json();
      if (!finalResponse.ok || finalStatus.ok !== true || Number(finalStatus.missing) !== 0) throw new Error(`갱신 후 미확인 종목이 남았습니다: ${finalStatus.missing ?? "확인 불가"}`);
      setResult({ ok: true, source: "KIS 주식기본조회 CTPF1002R", ...finalStatus });
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error), progress: industryProgress });
    } finally {
      setBusy(false);
    }
  }

  async function importDomesticMasters() {
    const form = new FormData();
    domesticFiles.forEach((file) => form.append("files", file, file.name));
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/domestic-universe-import", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || `국내 마스터 적재 실패 (HTTP ${response.status})`);
      setResult(payload);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
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
        {busy ? "적재 중..." : "전체 유니버스 적재"}
      </button>
    </div>
    <div style={{ padding: 20, border: "1px solid var(--border, #dbe3ee)", borderRadius: 14 }}>
      <h2 style={{ marginTop: 0 }}>국내 KIS 종목 마스터만 적재</h2>
      <p>공식 KIS 종목 마스터 ZIP을 받아 압축을 풀고 두 파일을 선택해 국내 유니버스만 준비합니다. 미국 유니버스는 변경하지 않습니다. <a href="https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip">KOSPI 마스터</a> · <a href="https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip">KOSDAQ 마스터</a></p>
      <input type="file" multiple accept=".mst" onChange={(event) => setDomesticFiles(Array.from(event.target.files ?? []))} />
      <ul>{domesticMasterFiles.map((name) => <li key={name}>{domesticFiles.some((file) => file.name.toLowerCase() === name) ? "✅" : "⬜"} {name}</li>)}</ul>
      <button type="button" onClick={() => void importDomesticMasters()} disabled={busy || domesticMasterFiles.some((name) => !domesticFiles.some((file) => file.name.toLowerCase() === name))} style={{ padding: "10px 16px", borderRadius: 8 }}>
        {busy ? "국내 종목 마스터 적재 중..." : "국내 종목 마스터만 적재"}
      </button>
    </div>
    <div style={{ padding: 20, border: "1px solid var(--border, #dbe3ee)", borderRadius: 14 }}>
      <h2 style={{ marginTop: 0 }}>국내 보통주 표준산업분류 코드 조회·저장</h2>
      <p>운영 서버의 활성 COMMON_STOCK 목록을 기준으로 KIS 주식기본조회 API를 호출해 표준산업분류코드를 저장합니다. KIS가 분류명을 제공하면 함께 저장하며, 분류명 없이 유효한 코드를 제공한 종목은 코드를 저장하고 이름은 비워 둡니다. 10종목씩 처리하며 코드·종목 식별 검증이나 API 오류가 나면 해당 묶음은 저장하지 않고 중단합니다.</p>
      <button type="button" onClick={() => void syncDomesticIndustryCodes()} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8 }}>
        {busy ? "KIS 조회·저장 중..." : "전체 국내 보통주 업종 코드 갱신"}
      </button>
      {industryProgress && <p>진행: {industryProgress.processed.toLocaleString()} / {industryProgress.total.toLocaleString()}</p>}
    </div>
    {result !== null && <pre style={{ margin: 0, padding: 16, overflow: "auto", maxHeight: 500, borderRadius: 12, background: "#0f172a", color: "#e2e8f0" }}>{JSON.stringify(result, null, 2)}</pre>}
  </section>;
}
