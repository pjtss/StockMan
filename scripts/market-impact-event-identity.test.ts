import { describe, expect, it } from "vitest";

import {
  effectiveMarketImpactEventKey,
  findDuplicateMarketImpactEventIdentities,
  marketImpactEventIdentity,
} from "./market-impact-event-identity.mjs";

const event = (overrides: Record<string, string> = {}) => ({
  eventId: "SEC:0000000000-26-000001:EARNINGS",
  market: "US",
  sourceType: "SEC",
  sourceId: "0000000000-26-000001",
  ticker: "TEST",
  eventType: "EARNINGS_RELEASE",
  ...overrides,
});

describe("market impact event identity", () => {
  it("uses a default key and treats alternate IDs for the same filing event as duplicates", () => {
    const events = [event(), event({ eventId: "SEC:0000000000-26-000001:EARNINGS_2" })];

    expect(effectiveMarketImpactEventKey(events[0])).toBe("DEFAULT");
    expect(findDuplicateMarketImpactEventIdentities(events)).toEqual([{
      firstIndex: 0,
      duplicateIndex: 1,
      eventId: events[0].eventId,
      duplicateEventId: events[1].eventId,
      eventKey: "DEFAULT",
    }]);
  });

  it("allows distinct independent events from one filing when their event keys differ", () => {
    const first = event({ eventKey: "TRIAL_A" });
    const second = event({ eventId: "SEC:0000000000-26-000001:TRIAL_B", eventKey: "TRIAL_B" });

    expect(marketImpactEventIdentity(first)).not.toBe(marketImpactEventIdentity(second));
    expect(findDuplicateMarketImpactEventIdentities([first, second])).toEqual([]);
  });

  it("keeps market and source identity as part of the deduplication boundary", () => {
    const sourceId = event();
    const otherMarket = event({ market: "KR", ticker: "000001" });
    const otherSource = event({ sourceId: "0000000000-26-000002" });

    expect(findDuplicateMarketImpactEventIdentities([sourceId, otherMarket, otherSource])).toEqual([]);
  });
});
