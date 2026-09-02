"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";
import styles from "@/app/watchlist/page.module.css";

type Market = "KR" | "US";
type WatchItem = { market: Market; code: string; name?: string };
const STORAGE_KEY = "stockman_chart_watchlist";

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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setItems(saved.filter((item): item is WatchItem => Boolean(item?.market && item?.code)));
    } catch { setItems([]); }
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items]);

  const grouped = useMemo(() => ({ KR: items.filter(item => item.market === "KR"), US: items.filter(item => item.market === "US") }), [items]);

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

  function addItems() {
    const codes = [...new Set(input.split(/[,,\n\s]+/).map(value => normalizeCode(value, market)).filter(Boolean))];
    if (!codes.length) { setMessage("티커를 입력하세요."); return; }
    const existing = new Set(items.map(item => `${item.market}:${item.code}`));
    const added = codes.filter(code => !existing.has(`${market}:${code}`)).map(code => ({ market, code }));
    setItems(current => [...current, ...added]); setInput(""); setMessage(added.length ? `${added.length}개 종목을 등록했습니다.` : "이미 등록된 종목입니다.");
  }

  function removeItem(item: WatchItem) { setItems(current => current.filter(value => !(value.market === item.market && value.code === item.code))); if (selected?.code === item.code && selected.market === item.market) setSelected(null); }
  function renderGroup(label: string, group: WatchItem[]) {
    return <section className={styles.watchGroup}><div className={styles.feedHeader}><h2 className={styles.cardTitle}>{label} <span className={styles.count}>{group.length}</span></h2></div>{!group.length ? <p className={styles.emptyState}>등록된 종목이 없습니다.</p> : <div className={styles.watchGrid}>{group.map(item => <article className={styles.watchCard} key={`${item.market}:${item.code}`}><div><strong>{names[item.code] ?? item.name ?? "회사명 확인 중"}</strong><small>{item.code} · {item.market === "KR" ? "국내" : "해외"}</small></div><div className={styles.watchActions}><button type="button" onClick={() => setSelected({ ...item, name: names[item.code] ?? item.name })}>차트 보기</button><button type="button" className={styles.removeBtn} onClick={() => removeItem(item)} aria-label={`${item.code} 삭제`}>삭제</button></div></article>)}</div>}</section>;
  }

  return <section className={styles.watchLayout}><div className={styles.addCard}><h2 className={styles.cardTitle}>관심종목 등록</h2><div className={styles.modes} role="group" aria-label="시장 선택"><button type="button" className={market === "KR" ? styles.modeActive : styles.mode} onClick={() => setMarket("KR")}>국내</button><button type="button" className={market === "US" ? styles.modeActive : styles.mode} onClick={() => setMarket("US")}>해외</button></div><input className={styles.watchInput} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addItems(); }} placeholder={market === "KR" ? "예: 005930, 000660" : "예: AAPL, MSFT"} aria-label="관심종목 티커" /><button type="button" className={styles.addBtn} onClick={addItems}>관심종목 등록</button>{message && <p className={styles.statusMessage} role="status">{message}</p>}<p className={styles.hint}>쉼표·공백·줄바꿈으로 여러 티커를 등록할 수 있습니다.</p></div><div className={styles.watchMain}>{renderGroup("국내 종목", grouped.KR)}{renderGroup("해외 종목", grouped.US)}</div>{selected && <ChartModal code={selected.market === "US" ? `US:${selected.code}` : selected.code} company={selected.name || names[selected.code] || selected.code} onClose={() => setSelected(null)} />}</section>;
}
