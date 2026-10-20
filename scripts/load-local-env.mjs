import { resolve } from "node:path";
import { loadLocalEnv } from "./local-env.mjs";

/** Compatibility preload: local project configuration overrides inherited environment values. */
loadLocalEnv({ filePath: resolve(process.cwd(), ".env.local") });
