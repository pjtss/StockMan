import { describe, expect, it, vi } from "vitest";
import { LibreTranslateClient } from "./libretranslate-client";
describe("LibreTranslateClient", () => { it("falls back to original text on request failure", async () => { vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline"))); const result = await new LibreTranslateClient().translate("Market headline"); expect(result.translatedText).toBe("Market headline"); expect(result.fallback).toBe(true); vi.unstubAllGlobals(); }); });
