"use client";

import { useEffect, useRef, useState } from "react";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import type { DartItem, FeedPayload, SecItem } from "@/lib/types";

type FeedType = "dart" | "sec";

export function useFeedData(type: FeedType) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dartData, setDartData] = useState<FeedPayload<DartItem> | null>(null);
  const [secData, setSecData] = useState<FeedPayload<SecItem> | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endpoint = type === "dart" ? "/api/dart" : "/api/sec";

    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) {
          let message = "RSS 응답을 가져오는 데 실패했습니다.";
          try {
            const body = await response.json() as { error?: string };
            if (body.error) message = body.error;
          } catch { /* non-JSON error response */ }
          throw new Error(message);
        }
        if (type === "dart") {
          const data = (await response.json()) as FeedPayload<DartItem>;
          if (!cancelled) setDartData(data);
        } else {
          const data = (await response.json()) as FeedPayload<SecItem>;
          if (!cancelled) setSecData(data);
        }
        if (!cancelled) { setLoading(false); setError(null); }
      } catch (cause) {
        if (!cancelled) {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : "알 수 없는 오류가 발생했습니다.");
        }
      }
    }

    function stopPolling() {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    async function startPolling() {
      stopPolling();
      if (document.visibilityState === "visible") {
        let interval = GLOBAL_POLLING_INTERVAL;
        try { const response = await fetch("/api/automation-settings", { cache: "no-store" }); const data = await response.json(); if (Number.isFinite(data.intervalSeconds)) interval = data.intervalSeconds * 1000; } catch { /* default */ }
        if (!cancelled && document.visibilityState === "visible") intervalRef.current = window.setInterval(() => void load(), interval);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") { void load(); void startPolling(); }
      else stopPolling();
    }

    void load();
    void startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, [type]);

  return { loading, error, dartData, secData };
}
