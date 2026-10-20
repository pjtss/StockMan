import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { readLocalEnvFile } from "./local-env.mjs";

const env = {
  ...process.env,
  ...readLocalEnvFile(resolve(process.cwd(), ".env.local")),
};
env.NEXT_DIST_DIR = ".next-dev";
delete env.ADMIN_DASHBOARD_PASSWORD;
const port = process.env.DEV_SERVER_PORT || process.env.PORT || "3000";

const nextBin = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  stdio: "inherit",
  env,
  shell: false,
});

child.on("error", (error) => {
  console.error(`[dev] failed to start Next.js: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
