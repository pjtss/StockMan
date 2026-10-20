import { describe, expect, it } from "vitest";
import { matchesMarketRssNotificationFilter } from "./market-rss-notification-filter";

describe("matchesMarketRssNotificationFilter", () => {
  it("includes every status for all and only exact status otherwise", () => {
    expect(matchesMarketRssNotificationFilter({ notificationStatus: "UNCERTAIN" }, "all")).toBe(true);
    expect(matchesMarketRssNotificationFilter({ notificationStatus: "UNCERTAIN" }, "UNCERTAIN")).toBe(true);
    expect(matchesMarketRssNotificationFilter({ notificationStatus: "SENT" }, "UNCERTAIN")).toBe(false);
  });
});
