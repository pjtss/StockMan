import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "docs/README.md",
  "docs/architecture/code-structure.md",
  "docs/architecture/documentation-and-srp.md",
  "docs/architecture/project-architecture.md",
  "docs/architecture/feature-inventory.md",
  "docs/architecture/external-request-boundaries.md",
  "docs/development/conventions.md",
  "docs/development/delivery-lifecycle.md",
  "docs/operations/runbook.md",
  "docs/operations/deployment-checklist.md",
  "docs/operations/continuous-improvement.md",
  "docs/operations/improvement-review.md",
  "docs/references/README.md",
  "app/README.md",
  "lib/README.md",
  "db/README.md",
  "scripts/README.md",
  "DEVELOPMENT_LOG.md",
];
const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error(`Missing required documentation: ${missing.join(", ")}`);
  process.exit(1);
}

const contracts = {
  "docs/development/delivery-lifecycle.md": ["기획", "설계", "회귀 테스트", "다음 작업에 규칙 반영"],
  "docs/operations/deployment-checklist.md": ["npm run deploy:verify", "standalone", "Flyway", "배포 후"],
  "docs/operations/continuous-improvement.md": ["운영 지표 수집", "개선 과제 템플릿", "자동 감지", "남은 위험"],
  "docs/operations/improvement-review.md": ["검토 주기", "우선순위", "성과 판정", "미해결 위험"],
  "docs/architecture/external-request-boundaries.md": ["withKisRequestThrottle", "토큰 발급", "rate limit", "회귀 테스트"],
};
const contractFailures = Object.entries(contracts).flatMap(([file, phrases]) => {
  const content = readFileSync(join(root, file), "utf8");
  return phrases.filter((phrase) => !content.includes(phrase)).map((phrase) => `${file}: missing required contract '${phrase}'`);
});
if (contractFailures.length) {
  console.error(`Documentation contract failed:\n${contractFailures.join("\n")}`);
  process.exit(1);
}

const developmentLog = readFileSync(join(root, "DEVELOPMENT_LOG.md"), "utf8");
const latestEntry = developmentLog.match(/## \[[^\n]+\][\s\S]*?(?=\n## \[|\s*$)/)?.[0] ?? "";
const latestEntryContract = [
  "### 목표",
  "### 반영",
  "### 검증",
  "### 다음 개선",
  "### 개선 과제",
  "개선 과제 ID:",
  "성과 판정:",
  "근거:",
  "커밋·푸시·배포",
];
const missingLatestEntryContract = latestEntryContract
  .filter((phrase) => !latestEntry.includes(phrase))
  .map((phrase) => `DEVELOPMENT_LOG.md: latest entry missing required section '${phrase}'`);
if (!latestEntry) missingLatestEntryContract.unshift("DEVELOPMENT_LOG.md: no dated latest entry found");
const improvementId = latestEntry.match(/개선 과제 ID:\s*([^\n\r]+)/)?.[1]?.trim() ?? "";
if (!/^CI-\d{4}-\d{2}-\d{2}-\d{3,}$/.test(improvementId)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest entry has invalid improvement task ID (expected CI-YYYY-MM-DD-NNN)");
}
const outcome = latestEntry.match(/성과 판정:\s*([A-Z]+)/)?.[1] ?? "";
if (!["IMPROVED", "UNCHANGED", "REGRESSED", "UNMEASURED"].includes(outcome)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest entry has invalid outcome (expected IMPROVED|UNCHANGED|REGRESSED|UNMEASURED)");
}
const verificationSection = latestEntry.match(/### 검증[\s\S]*?(?=\n### |\s*$)/)?.[0] ?? "";
if (!/(npm\s+run|npm\.cmd\s+run|git diff|vitest|tsc|측정|ms\b|초\b|개)/i.test(verificationSection)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest verification must include an executable check or measured result");
}
const deliveryStatus = latestEntry.match(/### 커밋·푸시·배포[\s\S]*?(?=\n### |\s*$)/)?.[0] ?? "";
if (!/(미실행|완료|실패|차단)/.test(deliveryStatus)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest delivery status must be normalized");
}
if (/완료/.test(deliveryStatus) && !/\b[0-9a-f]{7,40}\b/i.test(deliveryStatus)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: completed delivery must include a commit identifier");
}
const nextImprovement = latestEntry.match(/### 다음 개선[\s\S]*?(?=\n### |\s*$)/)?.[0] ?? "";
if (!/\n\s*[-*]\s+\S+/.test(nextImprovement) || /없음|없다|해당 없음/i.test(nextImprovement)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest entry must include a concrete next improvement");
}
if (missingLatestEntryContract.length) {
  console.error(`Development log contract failed:\n${missingLatestEntryContract.join("\n")}`);
  process.exit(1);
}
const improvementIds = [...developmentLog.matchAll(/개선 과제 ID:\s*(CI-\d{4}-\d{2}-\d{2}-\d{3,})/g)].map((match) => match[1]);
const duplicateImprovementIds = improvementIds.filter((id, index) => improvementIds.indexOf(id) !== index);
if (duplicateImprovementIds.length) {
  console.error(`Duplicate improvement task IDs: ${[...new Set(duplicateImprovementIds)].join(", ")}`);
  process.exit(1);
}

const migrationDir = join(root, "db", "migration");
const migrations = readdirSync(migrationDir).filter((file) => /^V\d+__.+\.sql$/.test(file));
const versions = migrations.map((file) => Number(file.match(/^V(\d+)/)?.[1])).sort((a, b) => a - b);
const duplicateVersions = versions.filter((version, index) => versions.indexOf(version) !== index);
if (duplicateVersions.length) {
  console.error(`Duplicate migration versions: ${[...new Set(duplicateVersions)].join(", ")}`);
  process.exit(1);
}

const malformed = readdirSync(migrationDir).filter((file) => file.endsWith(".sql") && !/^V\d+__.+\.sql$/.test(file));
if (malformed.length) {
  console.error(`Malformed migration filenames: ${malformed.join(", ")}`);
  process.exit(1);
}
console.log(`Documentation OK (${required.length} entry points); migrations OK (${versions.length} files, latest V${versions.at(-1) ?? 0}).`);
