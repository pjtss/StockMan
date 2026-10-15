import { describe, expect, it, vi } from "vitest";
import { runDeploymentVerification } from "./deployment-verification-order.mjs";

describe("deployment verification ordering", () => {
  it("smokes the built standalone server before resource-heavy quality checks", async () => {
    const events = [];
    const mark = (name) => vi.fn(async () => { events.push(name); });

    await runDeploymentVerification({
      build: mark("build"),
      runtime: mark("runtime"),
      quality: mark("quality"),
    });

    expect(events).toEqual(["build", "runtime", "quality"]);
  });
});
