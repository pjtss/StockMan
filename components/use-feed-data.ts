"use client";

import { useEffect, useRef, useState } from "react";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import type { DartItem, FeedPayload } from "@/lib/types";

type FeedType = "dart";

export function useFeedData(type: FeedType) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dartData, setDartData] = useState<FeedPayload<DartItem> | null>(null);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endpoint = "/api/dart";

    async function load() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const controller = new AbortController();
      requestRef.current = controller;
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          let message = "RSS 응답을 가져오는 데 실패했습니다.";
          try {
            const body = await response.json() as { error?: string };
            if (body.error) message = body.error;
          } catch { /* non-JSON error response */ }
          throw new Error(message);
        }
        const data = (await response.json()) as FeedPayload<DartItem>;
        if (data?.source !== "DART" || !Array.isArray(data.items) || !Number.isFinite(Date.parse(data.fetchedAt))) {
          throw new Error("RSS 응답 데이터 형식이 올바르지 않습니다.");
        }
        if (!cancelled) setDartData(data);
        if (!cancelled) { setLoading(false); setError(null); }
      } catch (cause) {
        if (!cancelled && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : "알 수 없는 오류가 발생했습니다.");
        }
      } finally {
        inFlightRef.current = false;
        if (requestRef.current === controller) requestRef.current = null;
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
        try {
          const response = await fetch("/api/automation-settings", { cache: "no-store" });
          if (response.ok) {
            const data = await response.json();
            if (Number.isFinite(data.intervalSeconds)) interval = Math.min(300_000, Math.max(10_000, data.intervalSeconds * 1000));
          }
        } catch { /* default */ }
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
      requestRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, [type]);

  return { loading, error, dartData };
}
