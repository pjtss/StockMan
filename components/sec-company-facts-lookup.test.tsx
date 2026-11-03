import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecCompanyFactsLookup } from "./sec-company-facts-lookup";

describe("SecCompanyFactsLookup", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows the company mapping update and opens the matching public metadata API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        cik: "0000320193",
        mapping: { name: "Apple Inc.", ticker: "AAPL", exchange: "NASDAQ" },
        companyMaster: { issuerCount: 1, tickerCount: 3, syncedAt: "2026-11-04T00:00:00.000Z" },
        result: { entityName: "Apple Inc.", factCount: 450, taxonomyCount: 2, fetchedAt: "2026-11-04T00:00:00.000Z", archivedId: 7 },
      }),
    }));
    render(<SecCompanyFactsLookup />);

    fireEvent.change(screen.getByLabelText("미국 종목 티커 또는 CIK"), { target: { value: "AAPL" } });
    fireEvent.click(screen.getByRole("button", { name: "조회 및 DB 저장" }));

    const apiLink = await screen.findByRole("link", { name: "AAPL 기본정보 API 열기" });
    expect(apiLink).toHaveAttribute("href", "/api/public/us-stock-metadata?ticker=AAPL");
    expect(screen.getByText("3개")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("SEC 회사 식별 매핑과 Company Facts"));
  });
});
