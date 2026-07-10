import { rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const nextDir = resolve(process.cwd(), process.env.NEXT_DIST_DIR || ".next");

try {
  await stat(nextDir);
  await rm(nextDir, { recursive: true, force: true });
  console.log("[dev] removed stale .next cache");
} catch {
  console.log("[dev] .next cache not found");
}
