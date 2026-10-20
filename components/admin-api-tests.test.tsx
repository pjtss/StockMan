import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminApiTests } from "./admin-api-tests";

vi.mock("@/components/admin-page-shell", () => ({
  AdminPageShell: ({ children }: { children: React.ReactNode }) => children,
}));

const responseBody = {
  ok: true,
  mode: "FETCH_ONLY",
  translate: true,
  translationConfiguration: { requested: true, configured: true, status: "READY", provider: "Google Cloud Translation Basic v2" },
  translationUsage: { apiCalls: 2, apiFailures: 1, reservedCharacters: 80, translatedCharacters: 24, reservationReleaseFailures: 1 },
  feed: { items: [
    { source: "NASDAQ", externalId: "quota-1", title: "Quota original title", translatedTitle: "Quota original title", link: "https://example.com/quota", translationFallback: true, translationFallbackReason: "monthly_character_limit_reached" },
    { source: "SEC_EDGAR", externalId: "api-1", title: "API original title", translatedTitle: "API original title", link: "https://example.com/api", translationFallback: true, translationFallbackReason: "translation_api_error" },
  ] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AdminApiTests RSS fallback filtering", () => {
  it("surfaces quota reservation release failures in translation usage diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminApiTests />);

    const rssCard = screen.getByText("시장 RSS 번역 테스트").closest("article");
    fireEvent.click(within(rssCard!).getByRole("button", { name: "실행" }));

    expect(await screen.findByText(/Google 호출 2건\(실패 1\).*월간 한도 반영\(예약 포함\) 80자.*한도 예약 회수 실패 1건/)).toBeInTheDocument();
  });

  it("filters by fallback reason, exposes article evidence and resets the filter on rerun", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminApiTests />);

    const rssCard = screen.getByText("시장 RSS 번역 테스트").closest("article");
    expect(rssCard).not.toBeNull();
    fireEvent.click(within(rssCard!).getByRole("button", { name: "실행" }));

    const quotaFilter = await screen.findByRole("button", { name: "월간 한도 1" });
    const articleList = await screen.findByRole("list", { name: "번역 fallback 기사" });
    fireEvent.click(quotaFilter);

    expect(quotaFilter).toHaveAttribute("aria-pressed", "true");
    expect(within(articleList).getByText("Quota original title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "원문 열기" })).toHaveAttribute("href", "https://example.com/quota");
    expect(within(articleList).queryByText("API original title")).not.toBeInTheDocument();

    fireEvent.click(within(rssCard!).getByRole("button", { name: "실행" }));
    await waitFor(() => {
      const updatedList = screen.getByRole("list", { name: "번역 fallback 기사" });
      expect(within(updatedList).getByText("API original title")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "월간 한도 1" })).toHaveAttribute("aria-pressed", "false");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("separates Korean headlines from fallback when the Google key is missing", async () => {
    const missingKeyResponse = {
      ...responseBody,
      translationConfiguration: { requested: true, configured: false, status: "API_KEY_MISSING", provider: null },
      feed: { items: [
        { source: "KRX_KIND", externalId: "ko-1", title: "삼성전자 실적 증가", translatedTitle: "삼성전자 실적 증가", translationFallback: false, translationNotRequired: true },
        { source: "NASDAQ", externalId: "en-1", title: "Revenue rises", translatedTitle: "Revenue rises", translationFallback: true, translationFallbackReason: "cloud_translation_not_configured" },
      ] },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(missingKeyResponse), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminApiTests />);

    const rssCard = screen.getByText("시장 RSS 번역 테스트").closest("article");
    fireEvent.click(within(rssCard!).getByRole("button", { name: "실행" }));

    expect(await screen.findByText(/Google 키 미설정 · 번역 불필요 1건 · 원문 fallback 1건/)).toBeInTheDocument();
    expect(screen.getByText(/기사 2건 · 번역 0건 · 번역 불필요 1건 · 원문 fallback 1건/)).toBeInTheDocument();
  });

  it("localizes every validation fallback in the preview instead of exposing reason codes", async () => {
    const validationResponse = {
      ...responseBody,
      feed: { items: [
        { source: "NASDAQ", externalId: "language", title: "Revenue rises", translatedTitle: "Revenue rises", link: "https://example.com/language", translationFallback: true, translationFallbackReason: "target_language_not_detected" },
        { source: "NASDAQ", externalId: "structure", title: "Revenue rises", translatedTitle: "Revenue rises", link: "https://example.com/structure", translationFallback: true, translationFallbackReason: "translation_response_unparseable" },
        { source: "NASDAQ", externalId: "empty", title: "", translatedTitle: "", link: "https://example.com/empty", translationFallback: true, translationFallbackReason: "translation_input_empty" },
      ] },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(validationResponse), { status: 200, headers: { "content-type": "application/json" } })));
    render(<AdminApiTests />);

    const rssCard = screen.getByText("시장 RSS 번역 테스트").closest("article");
    fireEvent.click(within(rssCard!).getByRole("button", { name: "실행" }));

    expect(await screen.findByRole("button", { name: "한국어 결과 확인 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "응답 형식 확인 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RSS 제목 없음 1" })).toBeInTheDocument();
    const articleList = screen.getByRole("list", { name: "번역 fallback 기사" });
    expect(within(articleList).getByText("NASDAQ · 한국어 결과 확인")).toBeInTheDocument();
    expect(within(articleList).getByText("NASDAQ · 응답 형식 확인")).toBeInTheDocument();
    expect(within(articleList).getByText("NASDAQ · RSS 제목 없음")).toBeInTheDocument();
    for (const reason of ["target_language_not_detected", "translation_response_unparseable", "translation_input_empty"]) {
      expect(within(articleList).queryByText(new RegExp(reason))).not.toBeInTheDocument();
    }
  });
});
