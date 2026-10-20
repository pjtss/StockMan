import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminObservability } from "./admin-observability";

describe("AdminObservability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows partial automation runs as warnings and includes their total", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: [{
          key: "instrument-fundamentals",
          label: "기준정보 갱신",
          scheduler: "OCI_CRON",
          coverage: "OBSERVED",
          runCount: 1,
          runs: [{
            id: 7,
            moduleKey: "instrument-fundamentals",
            status: "PARTIAL",
            startedAt: "2026-09-25T08:00:00.000Z",
            items: [{ market: "NAS", code: "AMRO", status: "FAILED", error_code: "KIS_EMPTY_OR_INVALID_PRICE", error_message: "KIS returned a zero quote" }],
            summary: {
              failureCount: 1,
              instrumentCount: 7_799,
              performance: { wallDurationMs: 120_000, fetchDurationMs: 86_000, dbWriteDurationMs: 3_500, writeQueueWaitMs: 40, instrumentsPerSecond: 64.99 },
            },
          }],
        }],
        totals: { runs: 1, partial: 1, failed: 0, skipped: 0 },
        failureCategories: [],
        coverage: {},
      }),
    }));

    render(<AdminObservability />);

    expect(await screen.findByText("PARTIAL")).toBeDefined();
    expect(screen.getByText(/부분 1 · 실패 0/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /상세 결과 보기/ }));
    expect(await screen.findByRole("list", { name: "종목별 실패 상세" })).toBeDefined();
    expect(screen.getByText("NAS · AMRO")).toBeDefined();
    expect(screen.getByText("KIS_EMPTY_OR_INVALID_PRICE")).toBeDefined();
    expect(screen.getByText("KIS returned a zero quote")).toBeDefined();
    expect(screen.getByRole("region", { name: "기본정보 갱신 성능" })).toBeDefined();
    expect(screen.getByText("전체 경과")).toBeDefined();
    expect(screen.getByText("KIS 호출 누적(병렬 합산)")).toBeDefined();
    expect(screen.getByText("120,000 ms")).toBeDefined();
    expect(screen.getByText(/전체 경과시간과 직접 합산하지 않습니다/)).toBeDefined();
  });

  it("shows localized RSS translation fallback counts in the recent-run card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: [{
          key: "market-rss",
          label: "RSS 수집·번역",
          scheduler: "OCI_CRON",
          coverage: "OBSERVED",
          runCount: 4,
          runs: [{
            id: 31,
            moduleKey: "market-rss",
            status: "PARTIAL",
            startedAt: "2026-09-25T08:00:00.000Z",
            summary: {
              partialFailureCount: 2,
              ingestFailureCount: 0,
              translationFailureCount: 2,
              translated: {
                translated: 12,
                fallback: 2,
                fallbackReasons: { target_language_not_detected: 1, translation_cache_invalidation_failed: 1 },
              },
            },
          }],
        }],
        totals: { runs: 4, partial: 1, failed: 0, skipped: 0 },
        failureCategories: [],
        coverage: {},
      }),
    }));

    render(<AdminObservability />);

    expect(await screen.findByText("RSS 수집·번역 이슈 2건 (수집 0 · 번역 2) · 번역 한국어 결과 확인 1건 · 불량 캐시 삭제 실패 1건")).toBeDefined();
  });

  it("does not label ingest-only failures as zero RSS issues", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: [{
          key: "market-rss",
          label: "RSS 수집·번역",
          scheduler: "OCI_CRON",
          coverage: "OBSERVED",
          runCount: 1,
          runs: [{
            id: 32,
            moduleKey: "market-rss",
            status: "PARTIAL",
            startedAt: "2026-09-25T08:00:00.000Z",
            summary: { partialFailureCount: 3, ingestFailureCount: 3, translationFailureCount: 0, translated: { translated: 5, fallback: 0, fallbackReasons: {} } },
          }],
        }],
        totals: { runs: 1, partial: 1, failed: 0, skipped: 0 },
        failureCategories: [],
        coverage: {},
      }),
    }));

    render(<AdminObservability />);

    expect(await screen.findByText("RSS 수집·번역 이슈 3건 (수집 3 · 번역 0)")).toBeDefined();
  });

  it("signals fallback categories omitted from the compact RSS observability card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: [{
          key: "market-rss",
          label: "RSS 수집·번역",
          scheduler: "OCI_CRON",
          coverage: "OBSERVED",
          runCount: 1,
          runs: [{
            id: 33,
            moduleKey: "market-rss",
            status: "PARTIAL",
            startedAt: "2026-09-25T08:00:00.000Z",
            summary: {
              partialFailureCount: 4,
              ingestFailureCount: 0,
              translationFailureCount: 4,
              translated: {
                translated: 5,
                fallback: 4,
                fallbackReasons: {
                  target_language_not_detected: 1,
                  translation_cache_invalidation_failed: 1,
                  translation_output_incomplete: 1,
                  provider_daily_quota_exceeded: 1,
                },
              },
            },
          }],
        }],
        totals: { runs: 1, partial: 1, failed: 0, skipped: 0 },
        failureCategories: [],
        coverage: {},
      }),
    }));

    render(<AdminObservability />);

    expect(await screen.findByText(/RSS 수집·번역 이슈 4건 \(수집 0 · 번역 4\).*외 1종 생략/)).toBeDefined();
  });

  it("does not display invalid RSS counters as a clean zero-issue run", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: [{
          key: "market-rss",
          label: "RSS 수집·번역",
          scheduler: "OCI_CRON",
          coverage: "OBSERVED",
          runCount: 1,
          runs: [{
            id: 34,
            moduleKey: "market-rss",
            status: "PARTIAL",
            startedAt: "2026-09-25T08:00:00.000Z",
            summary: { counterDataInvalid: true, partialFailureCount: 0, ingestFailureCount: 0, translationFailureCount: 0, translated: { translated: 5, fallback: 0, fallbackReasons: {} } },
          }],
        }],
        totals: { runs: 1, partial: 1, failed: 0, skipped: 0 },
        failureCategories: [],
        coverage: {},
      }),
    }));

    render(<AdminObservability />);

    expect(await screen.findByText("RSS 수집·번역 집계 오류 · 확인된 이슈 0건 · 실제 건수 확인 필요 (수집 0 · 번역 0)")).toBeDefined();
  });
});
