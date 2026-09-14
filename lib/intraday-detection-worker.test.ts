import { describe, expect, it } from "vitest";
import { getIntradayWorkerSnapshot, intradaySessionDate, orderIntradayPoints, stopIntradayDetectionWorker } from "./intraday-detection-worker";

describe("intraday detection worker lifecycle", () => {
  it("uses exchange-local session dates so US midnight UTC does not reset a session", () => {
    const at = Date.parse("2026-09-14T00:30:00.000Z");
    expect(intradaySessionDate("NAS", at)).toBe("2026-09-13");
    expect(intradaySessionDate("KOSPI", at)).toBe("2026-09-14");
  });
  it("starts stopped and can be stopped idempotently", async () => {
    await stopIntradayDetectionWorker();
    expect(getIntradayWorkerSnapshot().status).toBe("STOPPED");
    await stopIntradayDetectionWorker();
    expect(getIntradayWorkerSnapshot().status).toBe("STOPPED");
  });
  it("selects the newest point when the provider returns descending candles", () => {
    expect(orderIntradayPoints([{ date: "20260913", time: "101000" }, { date: "20260913", time: "100000" }]).at(-1)?.time).toBe("101000");
  });
});
