import { describe, expect, it, vi } from "vitest";
import { runDeploymentVerification } from "./deployment-verification-order.mjs";

describe("deployment verification ordering", () => {
  it("runs fast gates before build, then smokes standalone before resource-heavy quality checks", async () => {
    const events = [];
    const mark = (name) => vi.fn(async () => { events.push(name); });

    await runDeploymentVerification({
      fastGates: mark("fast-gates"),
      build: mark("build"),
      runtime: mark("runtime"),
      quality: mark("quality"),
    });

    expect(events).toEqual(["fast-gates", "build", "runtime", "quality"]);
  });
});
