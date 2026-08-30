import { describe, expect, it } from "vitest";
import { validateCommentInput, validateInquiryInput } from "./inquiry-validation";

describe("inquiry validation edge cases", () => {
  it("rejects missing, null, and whitespace-only values", () => {
    expect(validateInquiryInput("", "body").ok).toBe(false);
    expect(validateInquiryInput(null, "body").ok).toBe(false);
    expect(validateInquiryInput("title", "   ").ok).toBe(false);
    expect(validateInquiryInput(undefined, undefined).ok).toBe(false);
  });
  it("accepts exact maximum lengths and rejects overflow", () => {
    expect(validateInquiryInput("t".repeat(100), "c".repeat(5000)).ok).toBe(true);
    expect(validateInquiryInput("t".repeat(101), "c").ok).toBe(false);
    expect(validateInquiryInput("t", "c".repeat(5001)).ok).toBe(false);
    expect(validateCommentInput("c".repeat(2000)).ok).toBe(true);
    expect(validateCommentInput("c".repeat(2001)).ok).toBe(false);
  });
  it("keeps special characters as text for React escaping", () => {
    const result = validateInquiryInput("<script>alert(1)</script>", "<img src=x onerror=alert(1)>");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toContain("<img");
  });
});
