import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { kisModuleFeatureRegistry, kisModulePathRegistry, kisModuleRegistry } from "./kis-module-registry.mjs";

const root = process.cwd();
const libDir = join(root, "lib");
const moduleTests = new Map([
  ["kis-request-framework.ts", "lib/kis.test.ts"],
  ["kis-request-throttle.ts", "lib/kis-request-throttle.test.ts"],
  ["kis-token.ts", "lib/kis-token.test.ts"],
  ["kis-realtime.ts", "lib/kis-realtime.test.ts"],
  ["kis-us-trade-trend.ts", "lib/kis-us-trade-trend.test.ts"],
]);
const exceptions = new Map([
  ["kis-token.ts", { purpose: "토큰 발급", endpoint: "/oauth2/tokenP" }],
  ["kis-realtime.ts", { purpose: "Approval WebSocket", endpoint: "/oauth2/Approval" }],
]);
const violations = [];
const actualModules = new Set(readdirSync(libDir).filter((name) => /^kis.*\.ts$/.test(name) && !name.endsWith(".test.ts")));
const unregisteredModules = [...actualModules].filter((file) => !(file in kisModuleRegistry));
const missingModules = Object.keys(kisModuleRegistry).filter((file) => !actualModules.has(file));
if (unregisteredModules.length || missingModules.length) {
  if (unregisteredModules.length) console.error(`KIS boundary audit unregistered module(s): ${unregisteredModules.join(", ")}`);
  if (missingModules.length) console.error(`KIS boundary audit missing registry module(s): ${missingModules.join(", ")}`);
  process.exit(1);
}
const missingExceptions = [...exceptions.keys()].filter((file) => !existsSync(join(libDir, file)));
const boundaryDoc = readFileSync(join(root, "docs", "architecture", "external-request-boundaries.md"), "utf8");
const undocumentedExceptions = [...exceptions.entries()].filter(([file, meta]) => !boundaryDoc.includes(file) || !boundaryDoc.includes(meta.purpose) || !boundaryDoc.includes(meta.endpoint)).map(([file]) => file);
if (missingExceptions.length || undocumentedExceptions.length) {
  if (missingExceptions.length) console.error(`KIS boundary audit missing exception module(s): ${missingExceptions.join(", ")}`);
  if (undocumentedExceptions.length) console.error(`KIS boundary audit undocumented exception(s): ${undocumentedExceptions.join(", ")}`);
  process.exit(1);
}
const missingTests = [...moduleTests.entries()]
  .filter(([module, test]) => !actualModules.has(module) || !existsSync(join(root, test)))
  .map(([module, test]) => `${module} -> ${test}`);
if (missingTests.length) {
  console.error(`KIS boundary audit missing registered test(s): ${missingTests.join(", ")}`);
  process.exit(1);
}
const missingRegisteredPaths = Object.entries(kisModulePathRegistry).flatMap(([file, paths]) => {
  const source = readFileSync(join(libDir, file), "utf8");
  return paths.filter((path) => !source.includes(path)).map((path) => `${file} -> ${path}`);
});
if (missingRegisteredPaths.length) {
  console.error(`KIS boundary audit missing registered endpoint path(s): ${missingRegisteredPaths.join(", ")}`);
  process.exit(1);
}
const missingRegisteredFeatures = Object.entries(kisModuleFeatureRegistry).flatMap(([file, features]) => {
  const source = readFileSync(join(libDir, file), "utf8");
  return features.filter((feature) => !new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${feature}\\b|${feature}\\s*=`).test(source)).map((feature) => `${file} -> ${feature}`);
});
if (missingRegisteredFeatures.length) {
  console.error(`KIS boundary audit missing registered feature(s): ${missingRegisteredFeatures.join(", ")}`);
  process.exit(1);
}
for (const file of readdirSync(libDir).filter((name) => /^kis.*\.ts$/.test(name))) {
  const source = readFileSync(join(libDir, file), "utf8");
  if (exceptions.has(file)) {
    const endpoint = exceptions.get(file).endpoint;
    if (/fetch\s*\(/.test(source) && !source.includes(endpoint)) violations.push(`${file} (unexpected endpoint)`);
    continue;
  }
  if (/fetch\s*\(/.test(source) && !/(withKisRequestThrottle|kisRequest\s*\()/.test(source)) violations.push(file);
}
if (violations.length) {
  console.error(`KIS boundary audit found ${violations.length} module(s): ${violations.join(", ")}`);
  process.exit(1);
}
console.log("KIS boundary audit OK: all KIS data modules use the shared request boundary.");
