import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv({ filePath: resolve(process.cwd(), ".env.local") });
const result = spawnSync(process.execPath, [resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs"), resolve(process.cwd(), "scripts/us-daily-1200-backfill.ts")], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
