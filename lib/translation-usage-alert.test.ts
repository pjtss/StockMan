import { describe, expect, it, vi } from "vitest";
import { sendClaimedTranslationUsageAlert } from "./translation-usage-alert";

describe("translation usage alert delivery claims", () => {
  it("does not deliver when another run already owns the alert claim", async () => {
    const claim = vi.fn(async () => false);
    const deliver = vi.fn(async () => true);
    const release = vi.fn(async () => undefined);

    await expect(sendClaimedTranslationUsageAlert(claim, deliver, release)).resolves.toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("keeps the claim after successful delivery", async () => {
    const claim = vi.fn(async () => true);
    const deliver = vi.fn(async () => true);
    const release = vi.fn(async () => undefined);

    await expect(sendClaimedTranslationUsageAlert(claim, deliver, release)).resolves.toBe(true);
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    ["negative delivery response", async () => false],
    ["delivery exception", async () => { throw new Error("webhook timeout"); }],
  ])("releases the claim after %s so a later run can retry", async (_case, deliverImpl) => {
    const claim = vi.fn(async () => true);
    const deliver = vi.fn(deliverImpl);
    const release = vi.fn(async () => undefined);

    await expect(sendClaimedTranslationUsageAlert(claim, deliver, release)).resolves.toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });
});
