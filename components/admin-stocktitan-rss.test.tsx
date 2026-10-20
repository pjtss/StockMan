import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { AdminStockTitanRss } from "./admin-stocktitan-rss";

vi.mock("@/lib/copy-to-clipboard", () => ({ copyToClipboard: vi.fn(async () => undefined) }));

vi.mock("@/components/admin-modal", () => ({
  AdminModal: ({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) => (
    <div role="dialog" aria-label={title}><button onClick={onClose}>닫기</button>{children}</div>
  ),
}));

const row = (overrides: Record<string, unknown>) => ({
  id: 1,
  externalId: "nasdaq-article-00123",
  source: "STOCKTITAN",
  title: "삼성전자 실적 증가",
  translatedTitle: "삼성전자 실적 증가",
  summary: "요약",
  translatedSummary: "요약",
  rawPayload: null,
  detectedTicker: "005930",
  eventDirection: "POSITIVE",
  financingAmountUsd: null,
  dilutionRisk: null,
  link: "https://example.com/article",
  publishedAt: "2026-09-25T01:00:00.000Z",
  category: "EARNINGS",
  priority: 100,
  notifyEligible: true,
  isBacklog: false,
  translationStatus: "SKIPPED",
  translationProvider: null,
  translationCharCount: 0,
  translationFallback: false,
  translationError: null,
  translationSkippedReason: "already_in_target_language",
  translationAttempts: 0,
  translationAttemptedAt: "2026-09-25T01:00:00.000Z",
  notificationStatus: "PENDING",
  lastError: null,
  grade: "high",
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AdminStockTitanRss translation detail", () => {
  it("filters to the same human-review set used by the CSV exporter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [
        row({ id: 1, title: "Provider translation", translatedTitle: "공급자 번역", translationStatus: "TRANSLATED", translationFallback: false, translationSkippedReason: null }),
        row({ id: 2, title: "Quality candidate", translationCandidateTitle: "매출 25% 증가", translationStatus: "SKIPPED", translationFallback: true, translationSkippedReason: "translation_numeric_hallucination" }),
        row({ id: 3, title: "Provider error", translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error" }),
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    fireEvent.click(screen.getByText("검수 결과를 번역 회귀 사례로 반영하는 방법"));
    expect(await screen.findByText((_, element) => element?.tagName === "P" && Boolean(element.textContent?.includes("자동검사 오탐 확인")))).toBeInTheDocument();
    await screen.findByRole("heading", { name: "공급자 번역" });
    fireEvent.change(screen.getByRole("combobox", { name: "번역 상태" }), { target: { value: "REVIEW" } });

    expect(screen.getByRole("heading", { name: "공급자 번역" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quality candidate" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Provider error" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 검수 CSV 다운로드" })).toBeEnabled();
  });

  it("distinguishes translation preparation failures from provider request failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        translationStatus: "FAILED",
        translationFallback: true,
        translationSkippedReason: "translation_preparation_error",
        translationAttempts: 1,
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const article = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(article!).getByRole("button", { name: "전체 디버깅 보기" }));
    expect(await screen.findByText((_, element) => element?.tagName === "P" && element.textContent?.includes("원문 fallback · 번역 cache/quota 준비 오류") === true)).toBeInTheDocument();
    expect(screen.queryByText("원문 fallback · 공급자 오류")).not.toBeInTheDocument();
  });

  it("labels and copies the summary as source text instead of presenting it as translated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ summary: "Source-language earnings summary", translatedSummary: "Stale supposed translation" })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "원문 요약 · 미번역" })).toBeInTheDocument();
    const summarySection = within(dialog).getByRole("heading", { name: "원문 요약 · 미번역" }).parentElement!;
    expect(summarySection).toHaveTextContent("Source-language earnings summary");
    expect(summarySection).not.toHaveTextContent("Stale supposed translation");
    fireEvent.click(within(dialog).getByRole("button", { name: "원문 요약 복사" }));
    expect(copyToClipboard).toHaveBeenCalledWith("Source-language earnings summary");
  });

  it("shows a rejected incomplete candidate separately from the original fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        title: "Nvidia revenue rises sharply after earnings",
        translatedTitle: "Nvidia revenue rises sharply after earnings",
        translationCandidateTitle: "엔비디아 매출 증가",
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "translation_output_incomplete",
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "Nvidia revenue rises sharply after earnings" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("자동 길이 검사에서 부분 번역 의심으로 제외한 후보입니다. 원문 요약·링크와 대조해 오탐 여부를 확인하세요.")).toBeInTheDocument();
    expect(within(dialog).getByText("엔비디아 매출 증가")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "후보 번역 복사" }));
    expect(copyToClipboard).toHaveBeenCalledWith("엔비디아 매출 증가");
  });

  it("shows and copies a candidate rejected for adding a numeric claim", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        title: "Nvidia revenue rises",
        translatedTitle: "Nvidia revenue rises",
        translationCandidateTitle: "엔비디아 매출 +25% 증가",
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "translation_numeric_hallucination",
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "Nvidia revenue rises" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "검수할 후보 번역" })).toBeInTheDocument();
    expect(within(dialog).getByText("원문에 없는 숫자나 부호가 감지되어 제외한 provider 후보입니다. 원문 숫자·상승/하락 방향과 요약·링크를 대조하세요.")).toBeInTheDocument();
    expect(within(dialog).getByText("엔비디아 매출 +25% 증가")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "후보 번역 복사" }));
    expect(copyToClipboard).toHaveBeenCalledWith("엔비디아 매출 +25% 증가");
  });

  it("shows a cached candidate when its failed validation could not be invalidated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        title: "Nvidia revenue rises",
        translatedTitle: "Nvidia revenue rises",
        translationCandidateTitle: "매출 증가",
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "translation_cache_invalidation_failed",
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "Nvidia revenue rises" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "검수할 후보 번역" })).toBeInTheDocument();
    expect(within(dialog).getByText(/후보를 신뢰하지 말고 원문·요약과 대조하세요/)).toBeInTheDocument();
    expect(within(dialog).getByText(/캐시 DB 연결·쓰기 권한을 복구/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "후보 번역 복사" }));
    expect(copyToClipboard).toHaveBeenCalledWith("매출 증가");
  });

  it("counts malformed provider response fallbacks among exhausted automatic retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "translation_response_unparseable",
        translationAttempts: 3,
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    expect(await screen.findByText("자동 재시도 종료 1건")).toBeInTheDocument();
  });

  it("filters the RSS list to only translations whose retry backoff has elapsed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [
        row({ id: 1, title: "Retry due headline", translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error", translationAttempts: 1, translationAttemptedAt: "2020-01-01T00:00:00.000Z" }),
        row({ id: 2, title: "Retry waiting headline", translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error", translationAttempts: 1, translationAttemptedAt: new Date().toISOString() }),
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    await screen.findByRole("heading", { name: "Retry due headline" });
    expect(screen.getByRole("status", { name: "지금 재시도 가능한 번역 건수" })).toHaveTextContent("재시도 가능 1건");
    fireEvent.change(screen.getByRole("combobox", { name: "번역 상태" }), { target: { value: "RETRY_READY" } });

    expect(screen.getByRole("heading", { name: "Retry due headline" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Retry waiting headline" })).not.toBeInTheDocument();
  });

  it("shows API failure rows in the FAILED filter even though they use the original-title fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [
        row({ id: 1, title: "Provider failed headline", translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error" }),
        row({ id: 2, title: "Quality retry headline", translationStatus: "SKIPPED", translationFallback: true, translationSkippedReason: "target_language_not_detected" }),
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    await screen.findByRole("heading", { name: "Provider failed headline" });
    fireEvent.change(screen.getByRole("combobox", { name: "번역 상태" }), { target: { value: "FAILED" } });

    expect(screen.getByRole("heading", { name: "Provider failed headline" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quality retry headline" })).not.toBeInTheDocument();
  });

  it("refreshes stale RSS state when the administrator returns to the tab and shows fetch time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T00:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, articles: [row({ title: "Fresh on focus", translatedTitle: "Fresh on focus" })] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminStockTitanRss />);

    await screen.findByRole("heading", { name: "Fresh on focus" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("status", { name: "RSS 마지막 조회 시각" })).toHaveTextContent("조회 09:00:00 KST");

    vi.advanceTimersByTime(30_001);
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("aborts obsolete requests and ignores their late responses after the filter changes", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, articles: [row({ title: "Newest NASDAQ result", translatedTitle: "Newest NASDAQ result" })] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<AdminStockTitanRss />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const oldSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    fireEvent.change(screen.getByRole("combobox", { name: "RSS 출처" }), { target: { value: "NASDAQ" } });
    fireEvent.click(screen.getByRole("button", { name: "다시 조회" }));
    await screen.findByRole("heading", { name: "Newest NASDAQ result" });
    expect(oldSignal.aborted).toBe(true);

    resolveFirst(new Response(JSON.stringify({ ok: true, articles: [row({ title: "Stale StockTitan result", translatedTitle: "Stale StockTitan result" })] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "Stale StockTitan result" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Newest NASDAQ result" })).toBeInTheDocument();
    view.unmount();
  });

  it("aborts the active article request when the RSS screen unmounts", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    }));
    const view = render(<AdminStockTitanRss />);
    await waitFor(() => expect(signal).toBeDefined());

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("shows actual provider request and character counts separately from fallback counts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [
        row({ id: 1, translationStatus: "TRANSLATED", translationProvider: "google-cloud-translation", translationCharCount: 37, translationFallback: false, translationSkippedReason: null }),
        row({ id: 2, translationStatus: "SKIPPED", translationProvider: null, translationCharCount: 0, translationFallback: true, translationSkippedReason: "monthly_character_limit_reached" }),
        row({ id: 3, title: "Provider daily quota reached", translatedTitle: "Provider daily quota reached", translationStatus: "SKIPPED", translationFallback: true, translationSkippedReason: "provider_daily_quota_exceeded", translationAttempts: 1 }),
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    expect(await screen.findByText("Google 번역 요청 1건 · 입력 37자")).toBeInTheDocument();
    expect(screen.getByText("Google 일일 한도 1건")).toBeInTheDocument();
    expect(screen.getByText(/원문 fallback · Google 일일 번역 한도 도달 · Google 일일 한도/)).toBeInTheDocument();
    const cards = await screen.findAllByRole("heading", { name: "삼성전자 실적 증가" });
    const translatedCard = cards[0].closest("article");
    fireEvent.click(within(translatedCard!).getByRole("button", { name: "전체 디버깅 보기" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Google 번역 요청 · 입력 37자");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "닫기" }));
    const quotaCard = screen.getByText(/원문 fallback · 월간 한도 도달/).closest("article");
    fireEvent.click(within(quotaCard!).getByRole("button", { name: "전체 디버깅 보기" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Google 번역 API 호출 없음");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "닫기" }));
    fireEvent.click(within(screen.getByRole("heading", { name: "Provider daily quota reached" }).closest("article")!).getByRole("button", { name: "전체 디버깅 보기" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Google 일일 한도 확인 1회");
  });

  it("shows and copies the source headline when fallback data contains a stale partial translation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        title: "Nvidia revenue rises sharply",
        translatedTitle: "Nvidia revenue rises sharply 상승",
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "target_language_not_detected",
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    expect(await screen.findByRole("heading", { name: "Nvidia revenue rises sharply" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nvidia revenue rises sharply 상승" })).not.toBeInTheDocument();
    const card = screen.getByRole("heading", { name: "Nvidia revenue rises sharply" }).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("번역 결과 미사용 · 원문을 표시 중");
    expect(within(dialog).getByRole("button", { name: "사용 중인 원문 제목 복사" })).toBeInTheDocument();
  });

  it("shows unchanged provider translations as needing review directly on the article card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        title: "매출 20% 증가",
        translatedTitle: "매출 20% 증가",
        translationStatus: "TRANSLATED",
        translationFallback: false,
        translationSkippedReason: null,
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const reviewLabel = await screen.findByText("번역 결과가 원문과 동일 · 검토 필요");
    expect(reviewLabel.closest("article")).toBeInTheDocument();
  });

  it("explains an uncertain Discord send and warns against retrying before checking the channel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ notificationStatus: "UNCERTAIN", lastError: "stale_sending_outcome_unknown" })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    expect(within(card!).getByText("2026-09-25 10:00 KST")).toHaveAttribute("datetime", "2026-09-25T01:00:00.000Z");
    expect(within(card!).getByText("전송 여부 확인 필요")).toBeInTheDocument();
    expect(within(card!).getByText(/Discord가 메시지를 받았을 수 있어 자동 재전송하지 않았습니다/)).toBeInTheDocument();
  });

  it("enables a review CSV download for successful translations", async () => {
    const todayKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ title: "Revenue rises 20%", translatedTitle: "매출 20% 증가", translationStatus: "TRANSLATED", translationFallback: false, translationSkippedReason: null })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const button = await screen.findByRole("button", { name: "번역 검수 CSV 다운로드" });
    expect(screen.getByLabelText("발행일 (KST)")).toHaveAttribute("type", "date");
    expect(button).toHaveTextContent("1건");
    expect(button).toBeEnabled();

    let downloadedBlob: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => { downloadedBlob = blob; return "blob:translation-review"; });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    let downloadedName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloadedName = this.download; });
    fireEvent.click(button);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(downloadedName).toBe(`rss-translation-review-stocktitan-${todayKst}.csv`);
    const downloadedText = await downloadedBlob!.text();
    expect(downloadedText).toContain("RSS-ID:nasdaq-article-00123");
    expect(downloadedText).toContain("RSS-TICKER:005930");
    expect(downloadedText).toContain("RSS-TIME:2026-09-25T01:00:00.000Z");
    expect(downloadedText).toContain("요약");

    fireEvent.change(screen.getByRole("combobox", { name: "번역 상태" }), { target: { value: "TRANSLATED" } });
    fireEvent.click(screen.getByRole("button", { name: "번역 검수 CSV 다운로드" }));
    expect(downloadedName).toBe(`rss-translation-review-stocktitan-${todayKst}-translated.csv`);

    fireEvent.change(screen.getByRole("combobox", { name: "번역 상태" }), { target: { value: "NOT_REQUIRED" } });
    expect(screen.getByRole("button", { name: "번역 검수 CSV 다운로드" })).toHaveTextContent("0건");
    expect(screen.getByRole("button", { name: "번역 검수 CSV 다운로드" })).toBeDisabled();
  });

  it("queries an optional KST after-time and records it in the review export filename", async () => {
    const todayKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const fetchMock = vi.fn().mockImplementation((requestUrl: string) => {
      const requestQuery = new URLSearchParams(requestUrl.split("?")[1]);
      return Promise.resolve(new Response(JSON.stringify({
        ok: true,
        date: requestQuery.get("date"),
        source: requestQuery.get("source"),
        grade: requestQuery.get("grade"),
        afterTime: requestQuery.get("afterTime"),
        timezone: "Asia/Seoul",
        articles: [row({ title: "Revenue rises", translatedTitle: "매출 증가", translationStatus: "TRANSLATED", translationFallback: false, translationSkippedReason: null })],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminStockTitanRss />);
    await screen.findByRole("heading", { name: "매출 증가" });

    fireEvent.change(screen.getByLabelText("발행 시각 이후 (KST)"), { target: { value: "15:00" } });
    expect(screen.getByText(/조회 조건이 변경되어 이전 결과를 숨겼습니다/)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("heading", { name: "매출 증가" })).not.toBeInTheDocument();
    expect(screen.queryByText("기사 1건")).not.toBeInTheDocument();
    const reviewButton = screen.getByRole("button", { name: "번역 검수 CSV 다운로드" });
    expect(reviewButton).toBeDisabled();
    expect(screen.getByText(/조회 조건이 변경되어 이전 결과를 숨겼습니다/)).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const requestedUrl = new URL(fetchMock.mock.calls[1][0] as string, "http://localhost");
    expect(requestedUrl.searchParams.get("afterTime")).toBe("15:00");
    await waitFor(() => expect(reviewButton).toBeEnabled());

    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:after-time-review"), revokeObjectURL: vi.fn() });
    let downloadedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloadedName = this.download; });
    fireEvent.click(reviewButton);
    expect(downloadedName).toBe(`rss-translation-review-stocktitan-${todayKst}-after-1500.csv`);

    fireEvent.change(screen.getByLabelText("발행 시각 이후 (KST)"), { target: { value: "" } });
    expect(reviewButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const resetParams = new URLSearchParams((fetchMock.mock.calls[2][0] as string).split("?")[1]);
    expect(resetParams.has("afterTime")).toBe(false);
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    expect(downloadedName).toBe(`rss-translation-review-stocktitan-${todayKst}.csv`);
  });

  it("rejects a successful HTTP response whose KST after-time metadata differs from the request", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn((requestUrl: string) => {
      const query = new URL(requestUrl, "http://localhost").searchParams;
      calls++;
      const responseAfterTime = calls === 1 ? null : "14:00";
      return Promise.resolve(new Response(JSON.stringify({
        ok: true,
        date: query.get("date"),
        source: query.get("source"),
        grade: query.get("grade"),
        afterTime: responseAfterTime,
        timezone: "Asia/Seoul",
        articles: [row({ title: "Wrong filter result", translatedTitle: "잘못된 조건 결과", translationStatus: "TRANSLATED", translationFallback: false, translationSkippedReason: null })],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    }));
    render(<AdminStockTitanRss />);
    await screen.findByRole("heading", { name: "잘못된 조건 결과" });

    fireEvent.change(screen.getByLabelText("발행 시각 이후 (KST)"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(await screen.findByText("조회 응답 조건이 요청과 일치하지 않습니다. 다시 조회해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "잘못된 조건 결과" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 검수 CSV 다운로드" })).toBeDisabled();
  });

  it("rejects incomplete response query metadata when an after-time filter was requested", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn((requestUrl: string) => {
      const query = new URLSearchParams(requestUrl.split("?")[1]);
      calls++;
      const body = calls === 1
        ? { ok: true, articles: [row({ translatedTitle: "초기 조회" })] }
        : {
            ok: true,
            date: query.get("date"),
            source: query.get("source"),
            grade: query.get("grade"),
            afterTime: query.get("afterTime"),
            articles: [row({ title: "Incomplete metadata", translatedTitle: "메타데이터 누락" })],
          };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    }));
    render(<AdminStockTitanRss />);
    await screen.findByRole("heading", { name: "초기 조회" });

    fireEvent.change(screen.getByLabelText("발행 시각 이후 (KST)"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(await screen.findByText("조회 응답 조건이 요청과 일치하지 않습니다. 다시 조회해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "메타데이터 누락" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "번역 검수 CSV 다운로드" })).toBeDisabled();
  });

  it("explains when the current RSS result has no reviewable translation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ translationStatus: "PENDING", translatedTitle: null, translationFallback: false, translationSkippedReason: null })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const hint = await screen.findByText("현재 조건에서 검수할 번역이 없습니다. 조회 날짜·출처·필터를 넓혀 보세요.");
    expect(hint.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "번역 검수 CSV 다운로드" })).toBeDisabled();
  });

  it("counts and downloads retained incomplete translation candidates for human review", async () => {
    const todayKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        title: "Nvidia revenue rises sharply after earnings",
        translatedTitle: "Nvidia revenue rises sharply after earnings",
        translationCandidateTitle: "엔비디아 매출 증가",
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "translation_output_incomplete",
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const button = await screen.findByRole("button", { name: "번역 검수 CSV 다운로드" });
    expect(button).toHaveTextContent("1건");
    let downloadedBlob: Blob | null = null;
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { downloadedBlob = blob; return "blob:candidate-review"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(button);

    const downloadedText = await downloadedBlob!.text();
    expect(downloadedText).toContain('"Nvidia revenue rises sharply after earnings","요약","엔비디아 매출 증가"');
    expect(downloadedText).toContain("후보 번역 검수");
    expect(downloadedText).toContain("자동 검사에서 부분 번역 의심으로 fallback");
  });

  it("counts and downloads numeric hallucination candidates for human review", async () => {
    const todayKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        title: "Nvidia revenue rises",
        translatedTitle: "Nvidia revenue rises",
        translationCandidateTitle: "엔비디아 매출 25% 증가",
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "translation_numeric_hallucination",
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const button = await screen.findByRole("button", { name: "번역 검수 CSV 다운로드" });
    expect(button).toHaveTextContent("1건");
    let downloadedBlob: Blob | null = null;
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { downloadedBlob = blob; return "blob:numeric-candidate-review"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(button);

    const downloadedText = await downloadedBlob!.text();
    expect(downloadedText).toContain('"Nvidia revenue rises","요약","엔비디아 매출 25% 증가"');
    expect(downloadedText).toContain("RSS-REVIEW-CANDIDATE:numeric-hallucination");
    expect(downloadedText).toContain("원문에 없는 숫자");
  });

  it("shows matching local preview and apply commands without writing on the server", async () => {
    const todayKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ translatedTitle: "수익 증가", translationStatus: "TRANSLATED", translationFallback: false, translationSkippedReason: null })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    expect(await screen.findByRole("heading", { name: "수익 증가" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "번역 상태" }), { target: { value: "TRANSLATED" } });
    fireEvent.click(screen.getByText("검수 결과를 번역 회귀 사례로 반영하는 방법"));

    const commands = screen.getAllByText(/node scripts\/market-rss-translation-review-import\.mjs --input \$reviewCsvPath/);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toHaveTextContent(
      `Join-Path $env:USERPROFILE "Downloads\\rss-translation-review-stocktitan-${todayKst}-translated.csv"`,
    );
    expect(commands[1]).toHaveTextContent(/--apply/);
    expect(screen.getByText(/운영 서버나 DB에는 쓰지 않습니다/)).toBeInTheDocument();
    const verdictGuidance = screen.getAllByRole("listitem").map((item) => item.textContent || "").join("\n");
    expect(verdictGuidance).toMatch(/정확.*수정 번역은 비워 둡니다/);
    expect(verdictGuidance).toMatch(/부분번역.*전체 수정 번역/);
    expect(verdictGuidance).toMatch(/오역.*전체 수정 번역/);
    expect(verdictGuidance).toMatch(/보류.*fixture에 반영되지 않습니다/);
    fireEvent.click(screen.getByRole("button", { name: "미리보기 명령 복사" }));
    expect(vi.mocked(copyToClipboard)).toHaveBeenCalledWith(commands[0].textContent);
  });

  it("filters notification state and keeps uncertain count visible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ id: 1, notificationStatus: "UNCERTAIN" }), row({ id: 2, notificationStatus: "SENT" })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    expect(await screen.findByText("전송 미확정 1건")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "삼성전자 실적 증가" })).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox", { name: "알림 상태" }), { target: { value: "UNCERTAIN" } });
    expect(screen.getAllByRole("heading", { name: "삼성전자 실적 증가" })).toHaveLength(1);
    expect(screen.getByText("현재 표시 1건")).toBeInTheDocument();
    expect(screen.getAllByText("전송 여부 확인 필요")).toHaveLength(2);
  });

  it("counts exhausted target-language validation retries and shows the terminal state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ translationStatus: "SKIPPED", translationFallback: true, translationSkippedReason: "target_language_not_detected", translationAttempts: 3 })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    expect(await screen.findByText("자동 재시도 종료 1건")).toBeInTheDocument();
    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    expect(within(card!).getByText("자동 재시도 종료 (3/3)")).toBeInTheDocument();
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("3/3회");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "번역 수동 재시도" })).toBeEnabled();
  });

  it("manually queues an exhausted retry after explicit confirmation and updates the visible status", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        articles: [row({
          updatedAt: "2026-09-25T01:00:00.000Z",
          translationStatus: "SKIPPED",
          translationFallback: true,
          translationSkippedReason: "translation_output_incomplete",
          translationAttempts: 3,
          translationCandidateTitle: "매출 증가",
        })],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, status: "PENDING" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "번역 수동 재시도" }));

      expect(await within(screen.getByRole("dialog")).findByText("번역 재시도 대기열에 등록했습니다. 기존 cron 번역 worker가 처리하며, Discord 알림은 재발송하지 않습니다.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("/api/admin/stocktitan-rss");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      id: 1,
      expectedUpdatedAt: "2026-09-25T01:00:00.000Z",
      expectedTitle: "삼성전자 실적 증가",
      expectedStatus: "SKIPPED",
      expectedReason: "translation_output_incomplete",
      expectedAttempts: 3,
    });
    expect(within(screen.getByRole("dialog")).getByText("번역 대기")).toBeInTheDocument();
  });

  it("does not submit a manual retry when the confirmation is cancelled", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({ updatedAt: "2026-09-25T01:00:00.000Z", translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error", translationAttempts: 3 })],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "번역 수동 재시도" }));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "번역 수동 재시도" })).toBeInTheDocument();
  });

  it("keeps the fallback visible and explains an optimistic-concurrency conflict", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        articles: [row({ updatedAt: "2026-09-25T01:00:00.000Z", translationStatus: "FAILED", translationFallback: true, translationSkippedReason: "translation_api_error", translationAttempts: 3 })],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "ARTICLE_CHANGED_OR_NOT_RETRYABLE" }), { status: 409, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "번역 수동 재시도" }));

    expect(await within(screen.getByRole("dialog")).findByText("기사가 변경됐거나 재시도 대상이 아닙니다. 목록을 새로고침한 뒤 확인하세요.")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("원문 fallback · 공급자 오류 · 자동 재시도 종료 (3/3)")).toBeInTheDocument();
  });

  it("surfaces monthly quota counts and the same reset guidance in the card and detail view", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        translationStatus: "SKIPPED",
        translationFallback: true,
        translationSkippedReason: "monthly_character_limit_reached",
        translationAttempts: 1,
        translationAttemptedAt: new Date().toISOString(),
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    expect(await screen.findByText("월간 한도 1건")).toBeInTheDocument();
    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    expect(within(card!).getByText((_, element) => element?.tagName === "P" && /월간 한도 대기 · .* KST부터 재시도 가능/.test(element.textContent || ""))).toBeInTheDocument();

    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/월간 한도 대기 · .* KST부터 재시도 가능/);
    expect(dialog).toHaveTextContent("한도 확인 1회");
    expect(dialog).not.toHaveTextContent("1/3회");
  });

  it("opens translation details safely when the stored attempt timestamp is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        translationStatus: "FAILED",
        translationFallback: true,
        translationSkippedReason: "translation_api_error",
        translationAttempts: 1,
        translationAttemptedAt: "not-a-date",
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("번역 fallback 판정 시각 데이터 확인 필요 KST");
    expect(screen.getByRole("dialog")).toHaveTextContent("재시도 시각 데이터 확인 필요 (1/3)");
  });

  it("shows attempt count and the missing timestamp explicitly in translation details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [row({
        translationStatus: "FAILED",
        translationFallback: true,
        translationSkippedReason: "translation_api_error",
        translationAttempts: 1,
        translationAttemptedAt: null,
      })],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminStockTitanRss />);

    const card = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(card!).getByRole("button", { name: "전체 디버깅 보기" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("번역 fallback 판정 시도 시각 없음 KST · 1/3회");
    expect(screen.getByRole("dialog")).toHaveTextContent("재시도 시각 데이터 확인 필요 (1/3)");
  });

  it("does not flag an intentionally untranslated Korean title but still flags an unchanged provider result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      articles: [
        row({ id: 1, title: "삼성전자 실적 증가", translatedTitle: "삼성전자 실적 증가", translationSkippedReason: "already_in_target_language" }),
        row({ id: 2, title: "A stock rises", translatedTitle: "A stock rises", translationStatus: "TRANSLATED", translationSkippedReason: null }),
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminStockTitanRss />);

    const koreanCard = (await screen.findByRole("heading", { name: "삼성전자 실적 증가" })).closest("article");
    fireEvent.click(within(koreanCard!).getByRole("button", { name: "전체 디버깅 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/원문과 번역문이 같습니다/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("번역 불필요 · 이미 한국어")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    const englishCard = screen.getByRole("heading", { name: "A stock rises" }).closest("article");
    fireEvent.click(within(englishCard!).getByRole("button", { name: "전체 디버깅 보기" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("원문과 번역문이 같습니다");
  });
});
