import { describe, expect, it } from "vitest";
import { classifySecEvent } from "./sec-event-classifier";

describe("SEC event classifier", () => {
  it("classifies financing and preserves mixed dilution semantics", () => expect(classifySecEvent({ form: "8-K", items: "3.02", body: "The company entered an ATM offering." })).toMatchObject({ category: "FINANCING", direction: "MIXED", score: 60 }));
  it("classifies ownership forms independently of title keywords", () => expect(classifySecEvent({ form: "SC 13D" })).toMatchObject({ category: "OWNERSHIP", direction: "POSITIVE" }));
  it("prioritizes material risk", () => expect(classifySecEvent({ form: "8-K", body: "going concern and default" })).toMatchObject({ category: "RISK", direction: "NEGATIVE", score: -75 }));
});
