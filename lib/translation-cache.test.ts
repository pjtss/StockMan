import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  poolQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./db", () => ({ getPool: () => ({ connect: dbMocks.connect, query: dbMocks.poolQuery }) }));

import { countTranslationCharacters, recordTranslatedCharacters, releaseTranslationCharacters, releaseTranslationLimitAlert, releaseTranslationThresholdAlert, reserveTranslationCharacters, translationHash } from "./translation-cache";

beforeEach(() => {
  dbMocks.clientQuery.mockReset();
  dbMocks.poolQuery.mockReset();
  dbMocks.release.mockReset();
  dbMocks.connect.mockReset().mockResolvedValue({ query: dbMocks.clientQuery, release: dbMocks.release });
});

describe("translation cache", () => {
  it("creates a stable UTF-8 content hash", () => {
    expect(translationHash("Title with spaces ")).toHaveLength(64);
    expect(translationHash("제목")).toBe(translationHash("제목"));
    expect(translationHash("제목")).not.toBe(translationHash("제목 "));
  });

  it("counts Google Unicode code points and Azure UTF-16 code units including spaces", () => {
    expect(countTranslationCharacters("🚀 한국어 A")).toBe(7);
    expect(countTranslationCharacters("𠮷")).toBe(1);
    expect(countTranslationCharacters("𠮷", "azure-translator")).toBe(2);
  });

  it("reports actual reserved usage after a reservation is denied instead of pretending the cap was reached", async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ used: "0" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ reserved: 299_900 }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(reserveTranslationCharacters(200, "2026-09", 300_000)).resolves.toEqual({
      allowed: false,
      used: 299_900,
      limitReached: true,
      reason: "monthly_character_limit_reached",
    });
    expect(dbMocks.clientQuery).toHaveBeenNthCalledWith(6,
      "SELECT reserved_characters AS reserved FROM translation_usage_monthly WHERE provider=$1 AND usage_month=$2",
      ["google-cloud-translation", "2026-09"],
    );
    expect(dbMocks.release).toHaveBeenCalledOnce();
  });

  it("does not insert a first reservation larger than the monthly limit", async () => {
    dbMocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ used: "0" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(reserveTranslationCharacters(300_001, "2026-09", 300_000)).resolves.toEqual({
      allowed: false,
      used: 0,
      limitReached: true,
      reason: "monthly_character_limit_reached",
    });
    expect(dbMocks.clientQuery.mock.calls[4][0]).toContain("SELECT $1,$2,$3,NOW() WHERE $3 <= $4");
  });

  it("treats a missing monthly reservation row as a failed release instead of silent success", async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 0, rows: [] });

    await expect(releaseTranslationCharacters(120, "2026-09"))
      .rejects.toThrow("Translation quota reservation row missing for 2026-09");
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      "UPDATE translation_usage_monthly SET reserved_characters=GREATEST(0,reserved_characters-$1),updated_at=NOW() WHERE provider=$3 AND usage_month=$2",
      [120, "2026-09", "google-cloud-translation"],
    );
  });

  it("accepts a successful one-row quota reservation release", async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(releaseTranslationCharacters(120, "2026-09")).resolves.toBeUndefined();
  });

  it("treats a missing monthly usage row as a failed translated-character record", async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 0, rows: [] });

    await expect(recordTranslatedCharacters(120, "2026-09"))
      .rejects.toThrow("Translation usage row missing for 2026-09");
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      "UPDATE translation_usage_monthly SET translated_characters=translated_characters+$1,updated_at=NOW() WHERE provider=$3 AND usage_month=$2",
      [120, "2026-09", "google-cloud-translation"],
    );
  });

  it("accepts exactly one updated monthly usage row for translated characters", async () => {
    dbMocks.poolQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(recordTranslatedCharacters(120, "2026-09")).resolves.toBeUndefined();
  });

  it("releases failed-delivery claims only for the originating usage month", async () => {
    await releaseTranslationLimitAlert("2026-09");
    await releaseTranslationThresholdAlert(100_000, "2026-09");

    expect(dbMocks.poolQuery).toHaveBeenNthCalledWith(1,
      "UPDATE translation_usage_monthly SET limit_alerted=FALSE,updated_at=NOW() WHERE provider=$2 AND usage_month=$1",
      ["2026-09", "google-cloud-translation"],
    );
    expect(dbMocks.poolQuery).toHaveBeenNthCalledWith(2,
      "UPDATE translation_usage_monthly SET alerted_thresholds=array_remove(alerted_thresholds,$1),updated_at=NOW() WHERE usage_month=$2 AND provider=$3",
      [100_000, "2026-09", "google-cloud-translation"],
    );
  });
});
