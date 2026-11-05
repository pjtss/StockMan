import { describe, expect, it } from "vitest";
import { getSecRssDiscordFormType, isSecRssDiscordItemAllowed } from "./sec-rss-discord-filter";

describe("SEC RSS Discord form filter", () => {
  it.each([
    ["8-K - Issuer", "8-K"],
    ["6-K - Foreign Issuer", "6-K"],
  ])("allows SEC category for %s", (title, formType) => {
    const item = { title, raw: { category: { label: "form type", term: formType } } };
    expect(getSecRssDiscordFormType(item)).toBe(formType);
    expect(isSecRssDiscordItemAllowed(item)).toBe(true);
  });

  it.each(["8-K/A", "6-K/A", "10-Q", "4"]) ("rejects SEC category %s", (formType) => {
    const item = { title: "8-K - Issuer", raw: { category: { label: "form type", term: formType } } };
    expect(getSecRssDiscordFormType(item)).toBeNull();
    expect(isSecRssDiscordItemAllowed(item)).toBe(false);
  });

  it("fails closed on new Atom items with no explicit form category", () => {
    expect(getSecRssDiscordFormType({ title: "8-K - Issuer" })).toBeNull();
  });

  it("does not let title override an explicit SEC category", () => {
    expect(getSecRssDiscordFormType({ title: "8-K - Issuer", raw: { category: { label: "form type", term: "10-Q" } } })).toBeNull();
    expect(getSecRssDiscordFormType({ title: "10-Q - Issuer", raw: { category: { label: "form type", term: "6-K" } } })).toBe("6-K");
  });

  it("supports SEC category arrays", () => {
    expect(getSecRssDiscordFormType({ title: "Issuer", raw: { category: [{ label: "act", term: "34" }, { label: "form type", term: "6-K" }] } })).toBe("6-K");
  });

  it("allows title fallback only when handling legacy stored rows", () => {
    const item = { title: "6-K - Foreign Issuer" };
    expect(getSecRssDiscordFormType(item)).toBeNull();
    expect(getSecRssDiscordFormType(item, { allowLegacyTitleFallback: true })).toBe("6-K");
  });
});
