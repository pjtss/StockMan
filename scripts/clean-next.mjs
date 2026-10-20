import { rm, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveNextOutputDir({ cwd = process.cwd(), cliDir, envDir } = {}) {
  const requestedDir = cliDir || envDir || ".next";
  if (
    isAbsolute(requestedDir) ||
    requestedDir !== basename(requestedDir) ||
    !/^\.next(?:-[A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(requestedDir)
  ) {
    throw new Error("Next.js output cleanup only accepts a .next or .next-* directory name.");
  }
  return resolve(cwd, requestedDir);
}

export async function cleanNextOutput({ cwd = process.cwd(), cliDir = process.argv[2], envDir = process.env.NEXT_DIST_DIR } = {}) {
  const nextDir = resolveNextOutputDir({ cwd, cliDir, envDir });
  try {
    await stat(nextDir);
    await rm(nextDir, { recursive: true, force: true });
    console.log(`[dev] removed stale Next.js output (${cliDir || envDir || ".next"})`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.log(`[dev] Next.js output not found (${cliDir || envDir || ".next"})`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cleanNextOutput();
}
