import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOpenDartToday } from "./dart-opendart-client";

const originalApiKey = process.env.OPENDART_API_KEY;

beforeEach(() => {
  process.env.OPENDART_API_KEY = "test-opendart-key";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-11T03:00:00.000Z"));
});

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENDART_API_KEY;
  } else {
    process.env.OPENDART_API_KEY = originalApiKey;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchOpenDartToday", () => {
  it("fetches every official result page and deduplicates receipt numbers", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const pageNo = Number(url.searchParams.get("page_no"));
      const rowsByPage = {
        1: [{ rcept_no: "20260711000001", report_nm: "일반 공시" }],
        2: [{ rcept_no: "20260711000002", report_nm: "단일판매ㆍ공급계약체결" }],
        3: [
          { rcept_no: "20260711000001", report_nm: "일반 공시" },
          { rcept_no: "20260711000003", report_nm: "잠정 실적" },
        ],
      } as const;

      expect(url.searchParams.get("crtfc_key")).toBe("test-opendart-key");
      expect(url.searchParams.get("bgn_de")).toBe("20260711");
      expect(url.searchParams.get("end_de")).toBe("20260711");
      expect(url.searchParams.get("page_count")).toBe("100");

      return {
        ok: true,
        json: async () => ({
          status: "000",
          page_no: pageNo,
          page_count: 100,
          total_count: 3,
          total_page: 3,
          list: rowsByPage[pageNo as keyof typeof rowsByPage],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOpenDartToday();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.pagesFetched).toBe(3);
    expect(result.rows.map((row) => row.rcept_no)).toEqual([
      "20260711000001",
      "20260711000002",
      "20260711000003",
    ]);
  });

  it("returns an empty result for the official no-data status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "013", message: "조회된 데이타가 없습니다." }),
    }));

    const result = await fetchOpenDartToday();

    expect(result.pagesFetched).toBe(1);
    expect(result.totalCount).toBe(0);
    expect(result.rows).toEqual([]);
  });
});
