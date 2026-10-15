import { spawn as defaultSpawn } from "node:child_process";

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

export function waitForProcessExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    let finished = false;
    const finish = (exited) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const onError = () => finish(true);
    child.once("exit", onExit);
    child.once("error", onError);
    timer = setTimeout(() => finish(false), timeoutMs);
    if (hasExited(child)) finish(true);
  });
}

export async function stopChildProcess(child, {
  platform = process.platform,
  spawnProcess = defaultSpawn,
  taskkillTimeoutMs = 10_000,
  gracefulTimeoutMs = 5_000,
  forcedTimeoutMs = 5_000,
} = {}) {
  if (hasExited(child)) return;

  const killWindowsTree = async () => {
    const killer = spawnProcess("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      shell: false,
    });
    if (await waitForProcessExit(killer, taskkillTimeoutMs)) return true;
    killer.kill();
    if (!(await waitForProcessExit(killer, 1_000))) {
      throw new Error("taskkill helper process did not exit after termination was requested.");
    }
    return false;
  };

  if (platform === "win32") {
    try {
      await killWindowsTree();
    } catch {
      // Fall through to direct termination if taskkill cannot be started.
    }
    if (hasExited(child)) return;
  }

  if (hasExited(child)) return;
  child.kill(platform === "win32" ? undefined : "SIGTERM");
  if (await waitForProcessExit(child, gracefulTimeoutMs)) return;
  if (hasExited(child)) return;

  if (platform === "win32") {
    try {
      await killWindowsTree();
    } catch {
      // The final direct kill below is still attempted.
    }
    if (hasExited(child)) return;
    child.kill();
  } else {
    if (hasExited(child)) return;
    child.kill("SIGKILL");
  }
  if (!(await waitForProcessExit(child, forcedTimeoutMs))) {
    throw new Error("Child process did not exit after termination was requested.");
  }
}
