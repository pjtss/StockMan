import { describe, expect, it } from "vitest";
import { getAutomationRunResultStatus } from "./automation-run-result-status";

describe("getAutomationRunResultStatus", () => {
  it("marks explicitly partial workflows as PARTIAL even when remaining stages finish", () => {
    expect(getAutomationRunResultStatus({ partialFailureCount: 2 })).toEqual({
      runStatus: "PARTIAL",
      notificationStatus: "PARTIAL",
    });
  });

  it("fails closed as PARTIAL when RSS stage counters are invalid", () => {
    expect(getAutomationRunResultStatus({ counterDataInvalid: true, partialFailureCount: 0 })).toEqual({
      runStatus: "PARTIAL",
      notificationStatus: "PARTIAL",
    });
  });

  it("marks successful per-instrument workflows as SUCCESS", () => {
    expect(getAutomationRunResultStatus({ failureCount: 0, instrumentCount: 5 })).toEqual({
      runStatus: "SUCCESS",
      notificationStatus: "SUCCESS",
    });
  });

  it("marks a workflow with some instrument failures as PARTIAL", () => {
    expect(getAutomationRunResultStatus({ failureCount: 1, instrumentCount: 5 })).toEqual({
      runStatus: "PARTIAL",
      notificationStatus: "PARTIAL",
    });
  });

  it("marks a workflow with all instruments failed as FAILED", () => {
    expect(getAutomationRunResultStatus({ failureCount: 5, instrumentCount: 5 })).toEqual({
      runStatus: "FAILED",
      notificationStatus: "FAILED",
    });
  });
});
