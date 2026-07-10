import { spawn } from "node:child_process";

const env = { ...process.env };
env.NEXT_DIST_DIR = ".next-dev";
delete env.KIS_APPKEY;
delete env.KIS_APPSECRET;
delete env.ADMIN_DASHBOARD_PASSWORD;

const child = spawn("next", ["dev", "-p", "3000"], {
  stdio: "inherit",
  env,
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
