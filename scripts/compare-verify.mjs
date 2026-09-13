import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [baselinePath, currentPath, thresholdArg = "0.2"] = process.argv.slice(2);
if (!baselinePath || !currentPath) {
  console.error("Usage: node scripts/compare-verify.mjs <baseline.json> <current.json> [threshold]");
  process.exit(2);
}
const threshold = Number(thresholdArg);
if (!Number.isFinite(threshold) || threshold < 0) {
  console.error("Threshold must be a non-negative number.");
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const current = JSON.parse(readFileSync(currentPath, "utf8"));
const scopeManifest = JSON.parse(readFileSync(resolve(process.cwd(), "config/verify-scope.json"), "utf8"));
const manifestValid = typeof scopeManifest.changeReason === "string" && scopeManifest.changeReason.trim() !== ""
  && typeof scopeManifest.approvedBy === "string" && scopeManifest.approvedBy.trim() !== ""
  && /^\d{4}-\d{2}-\d{2}$/.test(scopeManifest.approvedAt)
  && Array.isArray(scopeManifest.approvedStages) && scopeManifest.approvedStages.length > 0;
if (!manifestValid) {
  console.error("verify-scope.json is missing valid approval metadata.");
  process.exit(1);
}
const environmentKeys = ["node", "platform", "arch", "cpuCount"];
const environmentDifferences = environmentKeys.filter((key) => baseline.environment?.[key] !== current.environment?.[key]);
const codeDifference = baseline.metadata?.gitHead && current.metadata?.gitHead && baseline.metadata.gitHead !== current.metadata.gitHead;
const before = new Map((baseline.stages ?? []).map((stage) => [stage.name, stage.durationMs]));
const baselineNames = [...before.keys()];
const currentNames = (current.stages ?? []).map((stage) => stage.name);
const missingStages = baselineNames.filter((name) => !currentNames.includes(name));
const newStages = currentNames.filter((name) => !baselineNames.includes(name));
const approvedStages = new Set(scopeManifest.approvedStages ?? []);
const unapprovedStages = currentNames.filter((name) => !approvedStages.has(name));
const comparisons = (current.stages ?? []).map((stage) => {
  const baselineMs = before.get(stage.name);
  const changeRatio = typeof baselineMs === "number" && baselineMs > 0 ? (stage.durationMs - baselineMs) / baselineMs : null;
  return { name: stage.name, baselineMs: baselineMs ?? null, currentMs: stage.durationMs, changeRatio, status: changeRatio !== null && changeRatio > threshold ? "REGRESSED" : "OK" };
});
const result = {
  ok: comparisons.every((item) => item.status === "OK") && missingStages.length === 0 && newStages.length === 0 && unapprovedStages.length === 0,
  threshold,
  environmentStatus: environmentDifferences.length ? "ENVIRONMENT_MISMATCH" : "MATCH",
  confidence: environmentDifferences.length || codeDifference ? "LOW" : "HIGH",
  recommendation: environmentDifferences.length ? "재측정: 기준 결과와 동일한 실행 환경을 사용하세요." : codeDifference ? "기준선과 동일한 커밋에서 재측정하거나 코드 변경 영향을 별도로 검토하세요." : "현재 비교 결과를 성능 회귀 판정에 사용할 수 있습니다.",
  environmentDifferences,
  codeStatus: codeDifference ? "CODE_MISMATCH" : "MATCH",
  codeDifference,
  missingStages,
  newStages,
  unapprovedStages,
  scopeStatus: missingStages.length || newStages.length || unapprovedStages.length ? "REVIEW_REQUIRED" : "APPROVED",
  comparisons,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
