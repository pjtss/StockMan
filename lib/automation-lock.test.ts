import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const release = vi.fn();
const connect = vi.fn(async () => ({ query, release }));

vi.mock("./db", () => ({ getPool: () => ({ connect }) }));

import { withAutomationLock } from "./automation-lock";

describe("withAutomationLock", () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    query.mockResolvedValue({ rows: [{ locked: true }] });
  });

  it("runs the task while holding a session advisory lock and releases it", async () => {
    const task = vi.fn(async () => "done");

    await expect(withAutomationLock("market-rss-pipeline", task)).resolves.toBe("done");

    expect(query).toHaveBeenNthCalledWith(1, "SELECT pg_try_advisory_lock(hashtext($1)) AS locked", ["market-rss-pipeline"]);
    expect(task).toHaveBeenCalledOnce();
    expect(query).toHaveBeenNthCalledWith(2, "SELECT pg_advisory_unlock(hashtext($1))", ["market-rss-pipeline"]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not run the task when another process owns the lock", async () => {
    query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    const task = vi.fn(async () => "must not run");

    await expect(withAutomationLock("market-rss-pipeline", task)).resolves.toBeNull();

    expect(task).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the lock when the task fails", async () => {
    const task = vi.fn(async () => { throw new Error("pipeline failed"); });

    await expect(withAutomationLock("market-rss-pipeline", task)).rejects.toThrow("pipeline failed");

    expect(query).toHaveBeenNthCalledWith(2, "SELECT pg_advisory_unlock(hashtext($1))", ["market-rss-pipeline"]);
    expect(release).toHaveBeenCalledOnce();
  });
});
