"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";
import styles from "@/app/watchlist/page.module.css";

type Market = "KR" | "US";
type WatchItem = { market: Market; code: string; name?: string };

function normalizeCode(value: string, market: Market) {
  const code = value.trim().toUpperCase();
  return market === "KR" && /^\d+$/.test(code) ? code.padStart(6, "0") : code;
}

export function WatchlistWorkbench() {
  const [market, setMarket] = useState<Market>("KR");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<WatchItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<WatchItem | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/watchlist").then(response => response.ok ? response.json() : Promise.reject(new Error("unauthorized")))
      .then(body => setItems((body.items ?? []).map((item: WatchItem) => ({ market: item.market, code: item.code }))))
      .catch(() => setMessage("관심종목을 사용하려면 로그인해 주세요."));
  }, []);

  const grouped = useMemo(() => ({ KR: items.filter(item => item.market === "KR"), US: items.filter(item => item.market === "US") }), [items]);
  const chartItems = useMemo(() => items.map(item => ({
    ...item,
    name: names[`${item.market}:${item.code}`] ?? names[item.code] ?? item.name ?? item.code,
  })), [items, names]);
  const selectedChartIndex = selected
    ? chartItems.findIndex(item => item.market === selected.market && item.code === selected.code)
    : -1;
  const adjacentChartItems = selectedChartIndex >= 0
    ? chartItems
      .slice(Math.max(0, selectedChartIndex - 1), selectedChartIndex + 2)
      .filter(item => item.code !== selected?.code || item.market !== selected?.market)
      .map(item => ({ code: item.market === "US" ? `US:${item.code}` : item.code, company: item.name }))
    : [];

  useEffect(() => {
    if (!items.length) return;
    const byMarket = (key: Market) => items.filter(item => item.market === key).map(item => item.code);
    Promise.all((["KR", "US"] as Market[]).map(async key => {
      const codes = byMarket(key); if (!codes.length) return {};
      const response = await fetch(`/api/stock/lookup?market=${key}&codes=${encodeURIComponent(codes.join(","))}`);
      if (!response.ok) return {};
      return await response.json() as { names?: Record<string, string> };
    })).then(results => {
      const merged: Record<string, string> = {};
      results.forEach(result => Object.assign(merged, result.names ?? {}));
      setNames(merged);
    }).catch(() => undefined);
  }, [items]);

  async function addItems() {
    const codes = [...new Set(input.split(/[,,\n\s]+/).map(value => normalizeCode(value, market)).filter(Boolean))];
    if (!codes.length) { setMessage("티커를 입력하세요."); return; }
    const existing = new Set(items.map(item => `${item.market}:${item.code}`));
    const added = codes.filter(code => !existing.has(`${market}:${code}`)).map(code => ({ market, code }));
    const saved: WatchItem[] = [];
    for (const item of added) { const response = await fetch("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) }); if (response.ok) saved.push(item); }
    setItems(current => [...current, ...saved]); setInput(""); setMessage(saved.length ? `${saved.length}개 종목을 등록했습니다.` : added.length ? "등록할 수 없습니다. 로그인 상태를 확인해 주세요." : "이미 등록된 종목입니다.");
  }

  const itemKey = (item: WatchItem) => `${item.market}:${item.code}`;
  function toggleChecked(item: WatchItem) { setChecked(current => { const next = new Set(current); const key = itemKey(item); next.has(key) ? next.delete(key) : next.add(key); return next; }); }
  function toggleGroup(group: WatchItem[]) { setChecked(current => { const next = new Set(current); const all = group.every(item => next.has(itemKey(item))); group.forEach(item => all ? next.delete(itemKey(item)) : next.add(itemKey(item))); return next; }); }
  async function removeItems(targets: WatchItem[]) { if (!targets.length || deleting) return; setDeleting(true); const results = await Promise.all(targets.map(item => fetch("/api/watchlist", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(item) }))); const removed = new Set(targets.filter((_, index) => results[index]?.ok).map(itemKey)); if (removed.size) { setItems(current => current.filter(item => !removed.has(itemKey(item)))); setChecked(current => { const next = new Set(current); removed.forEach(key => next.delete(key)); return next; }); if (selected && removed.has(itemKey(selected))) setSelected(null); setMessage(`${removed.size}개 종목을 삭제했습니다.`); } if (removed.size < targets.length) setMessage("일부 종목 삭제에 실패했습니다."); setDeleting(false); }
  async function removeItem(item: WatchItem) { await removeItems([item]); }
  function renderGroup(label: string, group: WatchItem[]) {
 return <section className={styles.watchGroup}><div className={styles.feedHeader}><h2 className={styles.cardTitle}>{label} <span className={styles.count}>{group.length}</span></h2>{group.length > 0 && <label className={styles.selectAll}><input type="checkbox" checked={group.every(item => checked.has(itemKey(item)))} onChange={() => toggleGroup(group)} /> 전체 선택</label>}{group.some(item => checked.has(itemKey(item))) && <button type="button" className={styles.removeBtn} onClick={() => { void removeItems(group.filter(item => checked.has(itemKey(item)))); }}>선택 삭제</button>}</div>{!group.length ? <p className={styles.emptyState}>등록된 종목이 없습니다.</p> : <div className={styles.watchGrid}>{group.map(item => { const displayName = names[`${item.market}:${item.code}`] ?? names[item.code] ?? item.name ?? item.code; const key = itemKey(item); return <article className={`${styles.watchCard} ${checked.has(key) ? styles.watchCardSelected : ""}`} key={key}><label className={styles.watchCheck}><input type="checkbox" checked={checked.has(key)} onChange={() => toggleChecked(item)} aria-label={`${item.code} 선택`} /></label><div><strong title={displayName}>{displayName}</strong><small>{item.code} · {item.market === "KR" ? "국내" : "해외"}</small></div><div className={styles.watchActions}><button type="button" onClick={() => setSelected({ ...item, name: displayName })}>차트 보기</button><button type="button" className={styles.removeBtn} onClick={() => removeItem(item)} aria-label={`${item.code} 삭제`}>삭제</button></div></article>; })}</div>}</section>;
  }

  return <section className={styles.watchLayout}><div className={styles.addCard}><h2 className={styles.cardTitle}>관심종목 등록</h2><div className={styles.modes} role="group" aria-label="시장 선택"><button type="button" className={market === "KR" ? styles.modeActive : styles.mode} onClick={() => setMarket("KR")}>국내</button><button type="button" className={market === "US" ? styles.modeActive : styles.mode} onClick={() => setMarket("US")}>해외</button></div><input className={styles.watchInput} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addItems(); }} placeholder={market === "KR" ? "예: 005930, 000660" : "예: AAPL, MSFT"} aria-label="관심종목 티커" /><button type="button" className={styles.addBtn} onClick={addItems}>관심종목 등록</button>{message && <p className={styles.statusMessage} role="status">{message}</p>}<p className={styles.hint}>쉼표·공백·줄바꿈으로 여러 티커를 등록할 수 있습니다.</p></div><div className={styles.watchMain}>{renderGroup("국내 종목", grouped.KR)}{renderGroup("해외 종목", grouped.US)}</div>{selected && <ChartModal code={selected.market === "US" ? `US:${selected.code}` : selected.code} company={selected.name || selected.code} position={selectedChartIndex >= 0 ? { current: selectedChartIndex + 1, total: chartItems.length } : undefined} prefetchCodes={adjacentChartItems} onPrevious={selectedChartIndex > 0 ? () => { const item = chartItems[selectedChartIndex - 1]; setSelected(item); } : undefined} onNext={selectedChartIndex >= 0 && selectedChartIndex < chartItems.length - 1 ? () => { const item = chartItems[selectedChartIndex + 1]; setSelected(item); } : undefined} onClose={() => setSelected(null)} />}</section>;
}
