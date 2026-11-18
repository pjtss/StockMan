import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { createHash, createHmac } from "node:crypto";
import { findMissingForwardOperationalColumns, findMissingForwardOperationalIndexes, findMissingForwardOperationalTables, findMissingOperationalColumnTables, findMissingOperationalRelations, parseOperationalSchemaTables, parseOperationalSchemaViews } from "./operational-schema-migration-audit.mjs";
import { decisionLedgerRecordHash, jcsStringify as decisionLedgerJcsStringify, parseJsonRejectingDuplicateKeys, renderDecisionEvidenceLedger, validateDecisionLedger } from "./disclosure-decision-ledger.mjs";

const root = process.cwd();
function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectSourceFiles(path) : entry.isFile() ? [path] : [];
  });
}
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
  "docs/api/README.md",
  "docs/api/route-inventory.json",
  "docs/api/document-catalog.mjs",
  "app/api/public/document-catalog/route.ts",
  "app/api/public/api-manual/route.ts",
  "scripts/api-surface.mjs",
  "public/api-reference.md",
  "public/openapi.json",
  "public/llms.txt",
  "public/document-catalog.json",
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
  "docs/api/README.md": ["OpenAPI 3.1.1", "service-bearer", "signed-link", "npm run audit:api-surface", "응답 DTO"],
  "public/api-reference.md": ["OpenAPI Specification 3.1.1", "Retry-After", "별도 인증 없이 호출", "read-with-side-effect", "외부 AI 호출 절차"],
  "public/llms.txt": ["/openapi.json", "/api-reference.md", "Do not call"],
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
const datedHeadings = [...developmentLog.matchAll(/^## \[[^\r\n]+\]/gm)];
// The log is newest-first. Inspect only the first dated entry and bound it at
// the next dated entry so historical notes cannot satisfy today's checklist.
const latestEntryStart = datedHeadings[0]?.index ?? -1;
const latestEntryEnd = developmentLog.indexOf("\n## [", latestEntryStart + 1) >= 0 ? developmentLog.indexOf("\n## [", latestEntryStart + 1) : developmentLog.length;
const latestEntry = latestEntryStart >= 0 ? developmentLog.slice(latestEntryStart, latestEntryEnd) : "";
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
if (!["IMPROVED", "PARTIAL", "UNCHANGED", "REGRESSED", "UNMEASURED"].includes(outcome)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest entry has invalid outcome (expected IMPROVED|PARTIAL|UNCHANGED|REGRESSED|UNMEASURED)");
}
const verificationSection = latestEntry.match(/### 검증[\s\S]*?(?=\r?\n### |\s*$)/)?.[0] ?? "";
if (!/(npm\s+run|npm\.cmd\s+(?:run|exec)|git diff|vitest|tsc|측정|ms\b|초\b|개)/i.test(verificationSection)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest verification must include an executable check or measured result");
}
const deliveryStatus = latestEntry.match(/### 커밋·푸시·배포[\s\S]*?(?=\r?\n#{1,6}\s|\s*$)/)?.[0] ?? "";
if (!/(미실행|완료|실패|차단)/.test(deliveryStatus)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: latest delivery status must be normalized");
}
const completedDelivery = deliveryStatus.split(/\r?\n/).some((line) =>
  /^\s*[-*]\s*(?!미실행|미완료|미진행)(?:.*\s)?완료(?:\s|$|:)/.test(line),
);
if (completedDelivery && !/\b[0-9a-f]{7,40}\b/i.test(deliveryStatus)) {
  missingLatestEntryContract.push("DEVELOPMENT_LOG.md: completed delivery must include a commit identifier");
}
const nextImprovementStart = latestEntry.indexOf("### 다음 개선");
const nextImprovementEnd = latestEntry.indexOf("\r\n### ", nextImprovementStart + 1) >= 0
  ? latestEntry.indexOf("\r\n### ", nextImprovementStart + 1)
  : latestEntry.indexOf("\n### ", nextImprovementStart + 1) >= 0 ? latestEntry.indexOf("\n### ", nextImprovementStart + 1) : latestEntry.length;
const nextImprovement = nextImprovementStart >= 0 ? latestEntry.slice(nextImprovementStart, nextImprovementEnd) : "";
if (!/\r?\n\s*[-*]\s+\S+/.test(nextImprovement) || /^\s*[-*]\s+(?:없음|없다|해당 없음)\s*$/m.test(nextImprovement)) {
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

const krArchitecturePath = join(root, "docs", "architecture", "kr-disclosure-event-architecture.md");
if (existsSync(krArchitecturePath)) {
  const architecture = readFileSync(krArchitecturePath, "utf8");
  const section = (start, end) => {
    const startIndex = architecture.indexOf(start);
    const endIndex = architecture.indexOf(end, startIndex);
    if (startIndex < 0 || endIndex < 0) throw new Error(`missing architecture section: ${start} -> ${end}`);
    return architecture.slice(startIndex, endIndex);
  };
  const tableNames = (body) => [...body.matchAll(/^\| `(disclosure_[a-z0-9_]+)` \|/gm)].map((match) => match[1]);
  let conceptual;
  let minimum;
  try {
    conceptual = tableNames(section("## 저장·보존·정합성", "### 최소 필드와 정규화 경계"));
    minimum = tableNames(section("### 최소 필드와 정규화 경계", "### 원문·파생 데이터 보존 계층"));
  } catch (error) {
    console.error(`Korean disclosure architecture audit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const uniqueConceptual = new Set(conceptual);
  const uniqueMinimum = new Set(minimum);
  const missingMinimum = [...uniqueConceptual].filter((name) => !uniqueMinimum.has(name));
  const missingConceptual = [...uniqueMinimum].filter((name) => !uniqueConceptual.has(name));
  const duplicates = conceptual.length !== uniqueConceptual.size || minimum.length !== uniqueMinimum.size;
  if (missingMinimum.length || missingConceptual.length || duplicates) {
    console.error("Korean disclosure architecture schema inventory mismatch:");
    if (missingMinimum.length) console.error(`  missing from minimum-fields table: ${missingMinimum.join(", ")}`);
    if (missingConceptual.length) console.error(`  missing from conceptual schema: ${missingConceptual.join(", ")}`);
    if (duplicates) console.error("  duplicate table names found");
    process.exit(1);
  }
  const rightsMatrix = section("#### Rights gate operation matrix", "#### Rights gate acceptance");
  const rightsScenarioRows = [...rightsMatrix.matchAll(/^\| (?!---)[^\n]+\|$/gm)].length;
  const rightsAcceptance = section("#### Rights gate acceptance", "### Cardinality와 중복/정합성 제약");
  if (rightsScenarioRows < 4 || !rightsMatrix.includes("transient 처리") || !rightsMatrix.includes("NEEDS_REVIEW") || !rightsAcceptance.includes("metadata-only right")) {
    console.error("Korean disclosure architecture rights gate contract is incomplete.");
    process.exit(1);
  }
  const sourceUx = section("#### 공식 원문 열기 및 접근 상태 UX 제안", "#### API snapshot 및 페이지 일관성 수용 계약");
  const sourceUxRequired = ["SOURCE_LINK_AVAILABLE", "SOURCE_METADATA_ONLY", "SOURCE_FETCH_FAILED", "SOURCE_NO_DATA_IN_RESPONSE", "SOURCE_RIGHTS_UNRESOLVED", "SOURCE_NOT_DISPLAYABLE", "SOURCE_REVISION_CHANGED", "P6-SOURCE-01", "P6-SOURCE-08", "013", "KR-DOCUMENT-UX-01"];
  const missingSourceUx = sourceUxRequired.filter((value) => !sourceUx.includes(value));
  if (missingSourceUx.length || !sourceUx.includes("공시검색 가이드") || !sourceUx.includes("원본파일 가이드")) {
    console.error(`Korean disclosure source document UX contract is incomplete: ${missingSourceUx.join(", ")}`);
    process.exit(1);
  }
  const rightsLicenseScope = section("##### 공공데이터포털 라이선스의 적용 범위 검토 메모", "#### 증거 manifest 최소 행 계약");
  const rightsLicenseRequired = ["3075133", "`LINK`", "공공누리 제1유형", "2020-06-09", "product-to-endpoint", "`document.xml`", "`UNRESOLVED`"];
  const missingRightsLicenseScope = rightsLicenseRequired.filter((value) => !rightsLicenseScope.includes(value));
  if (missingRightsLicenseScope.length) {
    console.error(`Korean disclosure rights license applicability contract is incomplete: ${missingRightsLicenseScope.join(", ")}`);
    process.exit(1);
  }
  const sourceAttributionFixturePath = join(root, "docs", "fixtures", "disclosure", "source-attribution-projection.v0.json");
  let sourceAttributionFixture;
  try {
    sourceAttributionFixture = JSON.parse(readFileSync(sourceAttributionFixturePath, "utf8"));
  } catch (error) {
    console.error(`Source attribution projection fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const sourceAttributionIds = [
    "SAP-01-REQUIRED-CREDIT-TRAVELS-WITH-CLAIM",
    "SAP-02-MULTIPLE-SOURCES-KEEP-SEPARATE-CREDITS",
    "SAP-03-UNRESOLVED-CREDIT-WITHHOLDS-DERIVATIVE",
    "SAP-04-ATTRIBUTION-DOES-NOT-GRANT-REDISTRIBUTION",
    "SAP-05-NOTIFICATION-USES-SURFACE-SPECIFIC-CREDIT",
    "SAP-06-API-EXPORT-CANNOT-STRIP-REQUIRED-CREDIT",
    "SAP-07-CORRECTION-PINS-NEW-EVIDENCE-CREDIT-REVISION",
    "SAP-08-CATALOG-LICENSE-DOES-NOT-CROSS-SOURCE-CLASS",
    "SAP-09-REQUIRED-CREDIT-IS-NEVER-TRUNCATED-TO-FIT",
    "SAP-10-PROVIDER-ACCEPTANCE-IS-NOT-DEVICE-DELIVERY",
    "SAP-11-ATTEMPT-PRESERVES-EXACT-CREDIT-PROJECTION-HASH",
    "SAP-12-POLICY-REVISION-FENCES-STALE-RETRY",
    "SAP-13-CORRECTION-RECONCILES-CREDIT-IMPACT-PER-CHANNEL",
    "SAP-14-CREDIT-TEXT-HASH-USES-EXACT-RENDERED-UTF8",
    "SAP-15-NFC-NFD-CREDIT-TEXTS-REMAIN-DISTINCT",
    "SAP-16-RENDERER-OR-LOCALE-CHANGE-REBUILDS-ATTEMPT",
    "SAP-17-CHANNEL-ESCAPING-DOES-NOT-REWRITE-CANONICAL-CREDIT",
    "SAP-18-LINEBREAK-OR-CONTROL-CHARACTER-CHANGE-INVALIDATES-ATTEMPT",
    "SAP-19-SAFE-LINK-CHANGE-CHANGES-PAYLOAD-NOT-CREDIT-TEXT-HASH",
    "SAP-20-CHANNEL-RENDERER-REVISION-IS-PINNED-PER-ATTEMPT",
  ];
  const sourceAttributionCaseIds = sourceAttributionFixture?.cases?.map((item) => item.id) ?? [];
  const sourceAttributionById = new Map((sourceAttributionFixture?.cases ?? []).map((item) => [item.id, item]));
  const sourceAttributionCoreValid = sourceAttributionFixture?.contractVersion === "source-attribution-projection.v0"
    && sourceAttributionFixture?.dataPolicy?.rightsDecisionsAreUnapproved === true
    && sourceAttributionCaseIds.length === new Set(sourceAttributionCaseIds).size
    && sourceAttributionIds.every((id) => sourceAttributionById.has(id))
    && sourceAttributionFixture?.requiredProjectionFields?.includes("rightsDecisionRevision")
    && sourceAttributionFixture?.requiredProjectionFields?.includes("attributionPolicyRevision")
    && sourceAttributionFixture?.deliveryAttemptFields?.includes("payloadHash")
    && sourceAttributionFixture?.deliveryAttemptFields?.includes("creditManifestHash")
    && sourceAttributionFixture?.deliveryAttemptFields?.includes("creditComponents")
    && sourceAttributionFixture?.creditComponentFields?.includes("sourceAttributionProjectionId")
    && sourceAttributionFixture?.creditComponentFields?.includes("creditTextHash")
    && sourceAttributionById.get("SAP-09-REQUIRED-CREDIT-IS-NEVER-TRUNCATED-TO-FIT")?.expected?.truncateRequiredCredit === false
    && sourceAttributionById.get("SAP-10-PROVIDER-ACCEPTANCE-IS-NOT-DEVICE-DELIVERY")?.expected?.deviceState === "DEVICE_DELIVERY_UNOBSERVED"
    && sourceAttributionById.get("SAP-12-POLICY-REVISION-FENCES-STALE-RETRY")?.expected?.blindDuplicateRetry === false
    && sourceAttributionById.get("SAP-13-CORRECTION-RECONCILES-CREDIT-IMPACT-PER-CHANNEL")?.expected?.correctionState === "DELIVERY_SCOPE_UNRESOLVED"
    && sourceAttributionById.get("SAP-04-ATTRIBUTION-DOES-NOT-GRANT-REDISTRIBUTION")?.expected?.creditIsPermission === false
    && sourceAttributionById.get("SAP-06-API-EXPORT-CANNOT-STRIP-REQUIRED-CREDIT")?.expected?.response === "BLOCKED"
    && sourceAttributionById.get("SAP-08-CATALOG-LICENSE-DOES-NOT-CROSS-SOURCE-CLASS")?.expected?.inheritance === false;
  const sourceAttributionContract = section("#### 근거별 출처 표시와 attribution projection 제안", "#### API snapshot 및 페이지 일관성 수용 계약");
  if (!sourceAttributionCoreValid || !sourceAttributionContract.includes("attribution obligation") || !sourceAttributionContract.includes("SourceAttributionProjection") || !sourceAttributionContract.includes("SAP-01`–`SAP-20") || !sourceAttributionContract.includes("payloadHash") || !sourceAttributionContract.includes("SAP-14–SAP-20") || !sourceAttributionContract.includes("공식 가이드") || !sourceAttributionContract.includes("officialSourceLinkVectors") || !sourceAttributionContract.includes("UNRESOLVED_SUPPRESS_LINK")) {
    console.error("Source attribution projection contract/fixture is incomplete or has duplicate/missing acceptance IDs.");
    process.exit(1);
  }
  const codeFence = "```json";
  const fenceStart = architecture.indexOf(codeFence);
  const fenceBodyStart = architecture.indexOf("\n", fenceStart) + 1;
  const fenceEnd = architecture.indexOf("```", fenceBodyStart);
  const assertUniqueJsonObjectKeys = (source) => {
    let index = 0;
    const skipWhitespace = () => { while (/\s/.test(source[index] ?? "")) index += 1; };
    const parseString = () => {
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === '"') { index += 1; return JSON.parse(source.slice(start, index)); }
        index += 1;
      }
      throw new Error("unterminated JSON string");
    };
    const parseValue = () => {
      skipWhitespace();
      if (source[index] === "{") {
        index += 1;
        const keys = new Set();
        skipWhitespace();
        if (source[index] === "}") { index += 1; return; }
        while (index < source.length) {
          skipWhitespace();
          if (source[index] !== '"') throw new Error("object key must be a string");
          const key = parseString();
          if (keys.has(key)) throw new Error(`duplicate JSON object key: ${key}`);
          keys.add(key);
          skipWhitespace();
          if (source[index++] !== ":") throw new Error("missing colon after JSON object key");
          parseValue();
          skipWhitespace();
          const delimiter = source[index++];
          if (delimiter === "}") return;
          if (delimiter !== ",") throw new Error("invalid JSON object delimiter");
        }
        throw new Error("unterminated JSON object");
      }
      if (source[index] === "[") {
        index += 1;
        skipWhitespace();
        if (source[index] === "]") { index += 1; return; }
        while (index < source.length) {
          parseValue();
          skipWhitespace();
          const delimiter = source[index++];
          if (delimiter === "]") return;
          if (delimiter !== ",") throw new Error("invalid JSON array delimiter");
        }
        throw new Error("unterminated JSON array");
      }
      if (source[index] === '"') { parseString(); return; }
      const primitive = source.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/)?.[0];
      if (!primitive) throw new Error("invalid JSON value");
      index += primitive.length;
    };
    parseValue();
    skipWhitespace();
    if (index !== source.length) throw new Error("trailing data after JSON value");
  };
  let example;
  try {
    if (fenceStart < 0 || fenceBodyStart <= 0 || fenceEnd < 0) throw new Error("JSON example code fence missing");
    const jsonSource = architecture.slice(fenceBodyStart, fenceEnd);
    assertUniqueJsonObjectKeys(jsonSource);
    example = JSON.parse(jsonSource);
  } catch (error) {
    console.error(`Korean disclosure architecture JSON example invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const jcsStringify = (value) => {
    if (value === null || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "string") {
      for (let index = 0; index < value.length; index += 1) {
        const unit = value.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
          const next = value.charCodeAt(index + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("JCS input contains an unpaired high surrogate");
          index += 1;
        } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("JCS input contains an unpaired low surrogate");
      }
      return JSON.stringify(value);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("JCS input contains a non-finite number");
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map((item) => jcsStringify(item)).join(",")}]`;
    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${jcsStringify(key)}:${jcsStringify(value[key])}`).join(",")}}`;
    }
    throw new Error(`JCS input contains unsupported value type: ${typeof value}`);
  };
  const jcsSha256 = (domain, value) => createHash("sha256").update(Buffer.from(`${domain}\0`, "utf8")).update(Buffer.from(jcsStringify(value), "utf8")).digest("hex");
  const jcsGoldenVectors = [
    { name: "RFC8785-3.2.2-number-format", value: { numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 1e-27] }, canonical: '{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}' },
    {
      name: "RFC8785-3.2.3-property-sort",
      value: { "€": "Euro Sign", "\r": "Carriage Return", "דּ": "Hebrew Letter Dalet With Dagesh", "1": "One", "😀": "Emoji: Grinning Face", "\u0080": "Control", "ö": "Latin Small Letter O With Diaeresis" },
      canonical: `{"${String.fromCharCode(92)}r":"Carriage Return","1":"One","${String.fromCharCode(128)}":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}`
    },
    { name: "IEEE754-integral-valued-number", value: { value: 1e20 }, canonical: '{"value":100000000000000000000}' },
    { name: "Unicode-no-normalization", value: { composed: "é", decomposed: "e\u0301" }, canonical: '{"composed":"é","decomposed":"é"}' },
  ];
  const invalidGoldenVector = jcsGoldenVectors.find(({ value, canonical }) => jcsStringify(value) !== canonical);
  const invalidDecisionLedgerGoldenVector = jcsGoldenVectors.find(({ value, canonical }) => decisionLedgerJcsStringify(value) !== canonical);
  let duplicateLedgerKeyRejected = false;
  try { parseJsonRejectingDuplicateKeys('{"outer":{"x":1,"x":2}}'); } catch (error) { duplicateLedgerKeyRejected = /duplicate JSON object key/.test(error.message); }
  if (invalidGoldenVector || invalidDecisionLedgerGoldenVector || !duplicateLedgerKeyRejected) {
    console.error(`JCS/decision-ledger canonicalization gate failed: ${invalidGoldenVector?.name ?? invalidDecisionLedgerGoldenVector?.name ?? (duplicateLedgerKeyRejected ? "unknown" : "duplicate JSON keys were accepted")}; actual=${invalidGoldenVector ? jcsStringify(invalidGoldenVector.value) : invalidDecisionLedgerGoldenVector ? decisionLedgerJcsStringify(invalidDecisionLedgerGoldenVector.value) : "n/a"}`);
    process.exit(1);
  }
  const creditManifestGoldenVector = sourceAttributionFixture?.creditManifestGoldenVector;
  const creditManifestExpectedHash = creditManifestGoldenVector?.components
    ? `sha256:${jcsSha256(creditManifestGoldenVector.domainSeparator, creditManifestGoldenVector.components)}`
    : null;
  if (creditManifestGoldenVector?.canonicalization !== "RFC8785-JCS"
    || creditManifestGoldenVector?.domainSeparator !== "KR-DISCLOSURE-CREDIT-MANIFEST-v1"
    || creditManifestExpectedHash !== creditManifestGoldenVector?.expectedHash
    || creditManifestGoldenVector?.components?.some((component, index) => component.deliveryOrder !== index || !/^sha256:[a-f0-9]{64}$/.test(component.creditTextHash ?? ""))) {
    console.error("Source attribution credit manifest JCS golden vector invalid or non-deterministic.");
    process.exit(1);
  }
  const creditTextHashContract = sourceAttributionFixture?.creditTextHashContract;
  const creditTextGoldenVectors = sourceAttributionFixture?.creditTextHashGoldenVectors ?? [];
  const creditTextGoldenHashes = creditTextGoldenVectors.map(({ text }) => `sha256:${createHash("sha256").update(Buffer.from(creditTextHashContract?.domainSeparator ?? "", "utf8")).update(Buffer.from([0])).update(Buffer.from(text ?? "", "utf8")).digest("hex")}`);
  if (creditTextHashContract?.domainSeparator !== "KR-DISCLOSURE-CREDIT-TEXT-v1"
    || creditTextHashContract?.unicodeNormalization !== "NONE_PRESERVE_CODE_POINTS"
    || creditTextHashContract?.canonicalization !== "RFC8785-JCS"
    || creditTextGoldenVectors.length !== 3
    || creditTextGoldenVectors.some((vector, index) => vector.expectedHash !== creditTextGoldenHashes[index])
    || creditTextGoldenVectors[1]?.expectedHash === creditTextGoldenVectors[2]?.expectedHash
    || sourceAttributionById.get("SAP-14-CREDIT-TEXT-HASH-USES-EXACT-RENDERED-UTF8")?.expected?.linkIncludedInCreditTextHash !== false
    || sourceAttributionById.get("SAP-14-CREDIT-TEXT-HASH-USES-EXACT-RENDERED-UTF8")?.expected?.linkCoveredByPayloadHash !== true
    || sourceAttributionById.get("SAP-15-NFC-NFD-CREDIT-TEXTS-REMAIN-DISTINCT")?.expected?.nfcNfdHashesEqual !== false
    || sourceAttributionById.get("SAP-16-RENDERER-OR-LOCALE-CHANGE-REBUILDS-ATTEMPT")?.expected?.priorPayloadReusable !== false
    || sourceAttributionFixture?.channelSerializerContract?.contractStatus !== "PROPOSED_NOT_CURRENT_DISCLOSURE_ATTRIBUTION_RUNTIME"
    || !["WEB_PUSH", "DISCORD", "PUBLIC_API"].every((channel) => sourceAttributionFixture?.channelSerializerContract?.renderers?.some((renderer) => renderer.channel === channel))
    || !["rights_and_surface_decision", "locale_selection", "canonical_credit_text_hash", "typed_safe_link_resolution", "channel_rendering", "logical_payload_hash", "transport_encoding"].every((step) => sourceAttributionFixture?.channelSerializerContract?.transformationOrder?.includes(step))
    || sourceAttributionById.get("SAP-17-CHANNEL-ESCAPING-DOES-NOT-REWRITE-CANONICAL-CREDIT")?.expected?.payloadHashCoversEscapedOutput !== true
    || sourceAttributionById.get("SAP-18-LINEBREAK-OR-CONTROL-CHARACTER-CHANGE-INVALIDATES-ATTEMPT")?.expected?.priorPayloadReusable !== false
    || sourceAttributionById.get("SAP-19-SAFE-LINK-CHANGE-CHANGES-PAYLOAD-NOT-CREDIT-TEXT-HASH")?.expected?.priorPayloadReusable !== false
    || sourceAttributionById.get("SAP-20-CHANNEL-RENDERER-REVISION-IS-PINNED-PER-ATTEMPT")?.expected?.receiptReferencesRendererRevision !== true
    || sourceAttributionFixture?.channelSerializerContract?.canonicalCredit?.stage !== "AFTER_LOCALE_SELECTION_BEFORE_CHANNEL_ESCAPING"
    || sourceAttributionFixture?.referenceRendererVectors?.length !== 4) {
    console.error("Source attribution exact UTF-8 credit text hash contract/golden vectors invalid.");
    process.exit(1);
  }
  const renderReferenceVector = (vector) => {
    if (vector.channel === "DISCORD") {
      if (/[\u0000-\u001f\u007f]/.test(vector.canonicalCreditText)) return { disposition: "REJECT_CONTROL_CHARACTER", payload: null };
      const content = vector.canonicalCreditText.replace(/([\\`*_~|>\[\]()])/g, "\\$1");
      return { disposition: "RENDER", payload: { channel: vector.channel, rendererRevision: vector.rendererRevision, content } };
    }
    if (vector.channel === "WEB_PUSH") return { disposition: "RENDER", payload: { channel: vector.channel, rendererRevision: vector.rendererRevision, creditText: vector.canonicalCreditText } };
    if (vector.channel === "PUBLIC_API") return { disposition: "RENDER", payload: { channel: vector.channel, rendererRevision: vector.rendererRevision, creditText: vector.canonicalCreditText, sourceUrl: vector.safeUrl } };
    return { disposition: "REJECT_UNKNOWN_CHANNEL", payload: null };
  };
  const invalidReferenceRendererVector = sourceAttributionFixture.referenceRendererVectors.find((vector) => {
    const rendered = renderReferenceVector(vector);
    if (rendered.disposition !== vector.expectedDisposition) return true;
    if (rendered.disposition !== "RENDER") return vector.expectedRenderedContent !== null;
    const expectedContent = vector.channel === "DISCORD" ? vector.expectedRenderedContent : vector.channel === "WEB_PUSH" ? vector.expectedRenderedContent : null;
    if (expectedContent !== null && (rendered.payload.content ?? rendered.payload.creditText) !== expectedContent) return true;
    if (!isDeepStrictEqual(rendered.payload, vector.canonicalPayload)) return true;
    return `sha256:${jcsSha256(vector.payloadHashDomainSeparator, rendered.payload)}` !== vector.expectedPayloadHash;
  });
  if (invalidReferenceRendererVector) {
    console.error(`Channel reference renderer vector invalid: ${invalidReferenceRendererVector.id}`);
    process.exit(1);
  }
  const resolveOfficialSourceLink = (source, candidate) => {
    if (source !== "DART") return { disposition: "UNRESOLVED_SUPPRESS_LINK", canonicalUrl: null };
    let url;
    try { url = new URL(candidate); } catch { return { disposition: "REJECT_MALFORMED_URL", canonicalUrl: null }; }
    if (url.protocol !== "https:") return { disposition: "REJECT_SCHEME", canonicalUrl: null };
    if (url.username || url.password) return { disposition: "REJECT_USERINFO", canonicalUrl: null };
    if (url.hostname !== "dart.fss.or.kr") return { disposition: "REJECT_HOST", canonicalUrl: null };
    if (url.port) return { disposition: "REJECT_PORT", canonicalUrl: null };
    if (url.pathname !== "/dsaf001/main.do") return { disposition: "REJECT_PATH", canonicalUrl: null };
    if (url.hash) return { disposition: "REJECT_FRAGMENT", canonicalUrl: null };
    const rawReceiptMatch = url.search.match(/^\?rcpNo=([^&]*)$/);
    if (!rawReceiptMatch) return { disposition: "REJECT_QUERY", canonicalUrl: null };
    if (/%[0-9a-f]{2}/i.test(rawReceiptMatch[1])) return { disposition: "REJECT_QUERY", canonicalUrl: null };
    const receipt = rawReceiptMatch[1];
    if (!/^[0-9]{14}$/.test(receipt)) return { disposition: "REJECT_RECEIPT", canonicalUrl: null };
    return { disposition: "ALLOW_CANONICAL", canonicalUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receipt}` };
  };
  const officialSourceLinkVectors = sourceAttributionFixture.officialSourceLinkVectors ?? [];
  const requiredOfficialSourceLinkVectorIds = [
    "URL-01-DART-CANONICAL", "URL-02-HTTP-SCHEME", "URL-03-USERINFO", "URL-04-HOST-SUFFIX", "URL-05-NONDEFAULT-PORT", "URL-06-UNEXPECTED-PATH",
    "URL-07-REDIRECT-QUERY", "URL-08-DUPLICATE-RECEIPT", "URL-09-ENCODED-RECEIPT", "URL-10-FRAGMENT", "URL-11-MALFORMED-RECEIPT", "URL-12-KIND-TEMPLATE-UNRESOLVED",
  ];
  const invalidOfficialSourceLinkVector = officialSourceLinkVectors.length !== 12
    || new Set(officialSourceLinkVectors.map((vector) => vector.id)).size !== officialSourceLinkVectors.length
    || requiredOfficialSourceLinkVectorIds.some((id) => !officialSourceLinkVectors.some((vector) => vector.id === id))
    || officialSourceLinkVectors.some((vector) => {
      const result = resolveOfficialSourceLink(vector.source ?? "DART", vector.input);
      return result.disposition !== vector.expectedDisposition
        || (vector.expectedDisposition === "ALLOW_CANONICAL" ? result.canonicalUrl !== vector.expectedCanonicalUrl : result.canonicalUrl !== null);
    })
    || sourceAttributionFixture?.officialSourceLinkPolicy?.status !== "PROPOSED_DART_VIEWER_ONLY_KIND_VIEWER_TEMPLATE_UNRESOLVED"
    || sourceAttributionFixture?.officialSourceLinkPolicy?.allowed?.hostname !== "dart.fss.or.kr"
    || sourceAttributionFixture?.officialSourceLinkPolicy?.allowed?.pathname !== "/dsaf001/main.do"
    || sourceAttributionFixture?.officialSourceLinkPolicy?.handling?.validation !== "parse only; do not fetch or follow redirects"
    || sourceAttributionFixture?.officialSourceLinkPolicy?.handling?.unknownSource !== "UNRESOLVED_SUPPRESS_LINK";
  if (invalidOfficialSourceLinkVector) {
    console.error("Official source link allowlist/canonicalization vectors invalid.");
    process.exit(1);
  }
  const summaryHashPayload = (segment) => ({
    analysisRevisionId: segment.analysisRevisionId,
    segmentId: segment.segmentId,
    kind: segment.kind,
    locale: segment.locale,
    text: segment.text,
    claimIds: segment.claimIds,
  });
  const summaryHashById = new Map((example.analysis?.summary ?? []).map((segment) => [segment.segmentId, `sha256:${jcsSha256("KR-DISCLOSURE-SUMMARY-OUTPUT-v1", summaryHashPayload(segment))}`]));
  const analysisHashPayload = { ...example.analysis, summary: (example.analysis?.summary ?? []).map((segment) => ({ ...summaryHashPayload(segment), outputHash: segment.outputHash })) };
  delete analysisHashPayload.outputHash;
  delete analysisHashPayload.review;
  const expectedAnalysisOutputHash = `sha256:${jcsSha256("KR-DISCLOSURE-ANALYSIS-OUTPUT-v1", analysisHashPayload)}`;
  const stripApprovalEnvelopes = (value, parentKey = "") => {
    if (Array.isArray(value)) return value.map((item) => stripApprovalEnvelopes(item, parentKey));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["review", "reviewDecision", "publicationAuthorization", "summaryUseAuthorization"].includes(key) && !(key === "contentHash" && parentKey === "")).map(([key, item]) => [key, stripApprovalEnvelopes(item, key)]));
    return value;
  };
  const expectedEventContentHash = `sha256:${jcsSha256("KR-DISCLOSURE-EVENT-CONTENT-v1", stripApprovalEnvelopes(example))}`;
  const invalidCanonicalHashes = summaryHashById.size !== (example.analysis?.summary ?? []).length || (example.analysis?.summary ?? []).some((segment) => segment.outputHash !== summaryHashById.get(segment.segmentId)) || example.analysis?.outputHash !== expectedAnalysisOutputHash || example.contentHash !== expectedEventContentHash;
  const claimIds = new Set((example.analysis?.claims ?? []).map((claim) => claim.claimId));
  const summarySegments = example.analysis?.summary ?? [];
  const dateIds = new Set((example.dates ?? []).map((date) => date.dateId));
  const claims = example.analysis?.claims ?? [];
  const claimById = new Map(claims.map((claim) => [claim.claimId, claim]));
  const sourceFilings = example.sources ?? [];
  const documentRevisions = example.documentRevisions ?? [];
  const rightsDecisions = example.rightsDecisions ?? [];
  const filingIds = new Set(sourceFilings.map((filing) => filing.filingId));
  const documentRevisionById = new Map(documentRevisions.map((revision) => [revision.documentRevisionId, revision]));
  const rightsDecisionById = new Map(rightsDecisions.map((decision) => [decision.rightsDecisionId, decision]));
  const dependencyTuple = (dependencyKind, stableId, revision, actionScope, value) => ({
    dependencyKind,
    stableId,
    revision,
    contentHash: `sha256:${jcsSha256(`KR-DISCLOSURE-${dependencyKind}-VALUE-v1`, value)}`,
    actionScope,
  });
  const canonicalDependencyList = (dependencies) => dependencies.sort((left, right) => Buffer.compare(
    Buffer.from([left.dependencyKind, left.stableId, left.revision, left.contentHash, left.actionScope].join("\0"), "utf8"),
    Buffer.from([right.dependencyKind, right.stableId, right.revision, right.contentHash, right.actionScope].join("\0"), "utf8"),
  ));
  const subjectKey = example.subjects?.[0]?.instrumentId;
  const projectionCommitSHA = `sha256:${jcsSha256("KR-DISCLOSURE-EXAMPLE-PROJECTION-v1", { eventId: example.eventId, eventRevisionId: example.eventRevisionId, contentHash: example.contentHash })}`;
  const analysisDependencies = canonicalDependencyList([
    ...documentRevisions.map((revision) => dependencyTuple("DOCUMENT_REVISION", revision.documentRevisionId, "1", "ANALYSIS", revision)),
    ...(example.analysis?.claims ?? []).map((claim) => dependencyTuple("CLAIM", claim.claimId, "1", "ANALYSIS", claim)),
    ...[...new Set((example.analysis?.claims ?? []).flatMap((claim) => (claim.evidenceRefs ?? []).map((evidence) => evidence.sourceRef?.rightsDecisionId)).concat(example.analysis?.rightsDecisionRef ?? []))]
      .map((rightsDecisionId) => {
        const decision = rightsDecisionById.get(rightsDecisionId);
        return decision ? dependencyTuple("RIGHTS_DECISION", rightsDecisionId, "1", "ANALYZE", decision) : null;
      }).filter(Boolean),
    dependencyTuple("ANALYSIS_INPUT", example.analysis?.analysisRevisionId ?? "", "1", "ANALYSIS", { schemaVersion: example.analysis?.schemaVersion, promptVersion: example.analysis?.promptVersion, inputHash: example.analysis?.inputHash, parserVersion: example.analysis?.parserVersion }),
  ]);
  const summaryFingerprintInputs = (summarySegment) => ({
    approval: summarySegment?.reviewDecision,
    targetRevisionId: summarySegment?.segmentId,
    targetContentHash: summarySegment?.outputHash,
    dependencies: canonicalDependencyList([
      dependencyTuple("ANALYSIS_REVISION", example.analysis?.analysisRevisionId ?? "", "1", "SUMMARY", { outputHash: example.analysis?.outputHash }),
      ...(summarySegment?.claimIds ?? []).map((claimId) => {
        const claim = (example.analysis?.claims ?? []).find((item) => item.claimId === claimId);
        return claim ? dependencyTuple("CLAIM", claimId, "1", "SUMMARY", claim) : null;
      }).filter(Boolean),
      ...(summarySegment?.summaryUseAuthorization?.rightsDecisionIds ?? []).map((rightsDecisionId) => {
        const decision = rightsDecisionById.get(rightsDecisionId);
        return decision ? dependencyTuple("RIGHTS_DECISION", rightsDecisionId, "1", "STORE_DERIVATIVE+DISPLAY_PUBLIC_API", decision) : null;
      }).filter(Boolean),
    ]),
  });
  const eventDependencies = canonicalDependencyList([
    dependencyTuple("ANALYSIS_REVISION", example.analysis?.analysisRevisionId ?? "", "1", "EVENT", { outputHash: example.analysis?.outputHash }),
    dependencyTuple("EVENT_DATES", example.eventRevisionId ?? "", String(example.eventRevision ?? ""), "EVENT", example.dates ?? []),
    dependencyTuple("EVENT_PARTIES", example.eventRevisionId ?? "", String(example.eventRevision ?? ""), "EVENT", example.parties ?? []),
    dependencyTuple("EVENT_SUBJECTS", example.eventRevisionId ?? "", String(example.eventRevision ?? ""), "EVENT", example.subjects ?? []),
    dependencyTuple("EVENT_TAXONOMY", example.eventRevisionId ?? "", String(example.eventRevision ?? ""), "EVENT", { eventType: example.eventType, dateTaxonomies: (example.dates ?? []).map((date) => date.kindTaxonomyVersion) }),
    ...sourceFilings.map((filing) => dependencyTuple("SOURCE_FILING", filing.filingId, "1", "EVENT", filing)),
    ...rightsDecisions.map((decision) => dependencyTuple("RIGHTS_DECISION", decision.rightsDecisionId, "1", "EVENT_PUBLICATION", decision)),
  ]);
  const expectedDependencyFingerprints = [
    ...(example.analysis?.summary ?? []).map((segment) => ({ approvalKind: "SUMMARY_SEGMENT", ...summaryFingerprintInputs(segment) })),
    { approvalKind: "ANALYSIS", approval: example.analysis?.review, dependencies: analysisDependencies, targetRevisionId: example.analysis?.analysisRevisionId, targetContentHash: example.analysis?.outputHash },
    { approvalKind: "EVENT", approval: example.review, dependencies: eventDependencies, targetRevisionId: example.eventRevisionId, targetContentHash: example.contentHash },
  ];
  const dependencyFingerprintResults = expectedDependencyFingerprints.map((value) => {
    const { approvalKind } = value;
    const dependencyGraphHash = `sha256:${jcsSha256("KR-DISCLOSURE-DEPENDENCY-GRAPH-v1", value.dependencies)}`;
    const transitiveClosureHash = `sha256:${jcsSha256("KR-DISCLOSURE-DEPENDENCY-CLOSURE-v1", { approvalKind, subjectKey, dependencies: value.dependencies })}`;
    const fingerprint = { fingerprintSchemaVersion: "kr-disclosure-review-dependency.v1", approvalKind, market: "KR", subjectKey, projectionCommitSHA, projectionGeneration: example.eventRevision, eventRevisionHash: example.contentHash, dependencyGraphHash, transitiveClosureHash, dependencies: value.dependencies };
    return { approvalKind, targetRevisionId: value.targetRevisionId, expectedHash: `sha256:${jcsSha256("KR-DISCLOSURE-REVIEW-DEPENDENCY-v1", fingerprint)}`, recordedHash: value.approval?.dependencyFingerprintHash, approval: value.approval, targetContentHash: value.targetContentHash, fingerprint };
  });
  const approvalKindSchema = {
    SUMMARY_SEGMENT: { required: ["ANALYSIS_REVISION", "CLAIM", "RIGHTS_DECISION"], conditional: [] },
    ANALYSIS: { required: ["ANALYSIS_INPUT", "DOCUMENT_REVISION", "CLAIM", "RIGHTS_DECISION"], conditional: ["PARSE_REVISION", "EVIDENCE_SET", "EVENT_TAXONOMY"] },
    EVENT: { required: ["ANALYSIS_REVISION", "EVENT_TAXONOMY", "SOURCE_FILING"], conditional: ["EVENT_DATES", "EVENT_PARTIES", "EVENT_SUBJECTS", "CLAIM", "EVIDENCE_SET", "RIGHTS_DECISION", "SOURCE_DISPOSITION"] },
    DATE: { required: ["EVENT_REVISION", "DATE_ASSERTION", "CLAIM", "EVIDENCE_SET", "DOCUMENT_REVISION", "RIGHTS_DECISION", "EVENT_TAXONOMY", "SOURCE_FILING"], conditional: ["SOURCE_DISPOSITION"] },
    SUBJECT: { required: ["EVENT_REVISION", "EVENT_SUBJECT", "EVENT_PARTY", "CLAIM", "EVIDENCE_SET", "ENTITY_CROSSWALK", "INSTRUMENT_MASTER", "CAP_ASSERTION", "DOCUMENT_REVISION", "RIGHTS_DECISION", "SOURCE_FILING"], conditional: ["SOURCE_DISPOSITION"] },
    PUBLICATION: { required: ["EVENT_REVISION", "PUBLICATION_TARGET", "SOURCE_COVERAGE", "FRESHNESS_POLICY", "CONSUMER_PROJECTION", "PUBLICATION_EPOCH", "RIGHTS_DECISION"], conditional: ["EVENT_DATES", "EVENT_PARTIES", "EVENT_SUBJECTS", "DATE_ASSERTION", "EVENT_SUBJECT", "CLAIM", "EVIDENCE_SET", "ENTITY_CROSSWALK", "INSTRUMENT_MASTER", "CAP_ASSERTION", "SOURCE_FILING", "SOURCE_DISPOSITION"] },
  };
  const requiredDependencyKinds = Object.fromEntries(Object.entries(approvalKindSchema).map(([kind, schema]) => [kind, schema.required]));
  const allowedDependencyKinds = Object.fromEntries(Object.entries(approvalKindSchema).map(([kind, schema]) => [kind, [...schema.required, ...schema.conditional]]));
  const dependencyFingerprintFailures = dependencyFingerprintResults.flatMap((value) => {
    const { fingerprint } = value;
    const uniqueTupleKeys = fingerprint.dependencies.map((dependency) => jcsStringify(dependency));
    const dependencyKinds = new Set(fingerprint.dependencies.map((dependency) => dependency.dependencyKind));
    const uniqueDependencyIdentities = fingerprint.dependencies.map((dependency) => [dependency.dependencyKind, dependency.stableId, dependency.actionScope].join("\0"));
    const failures = [];
    if (!fingerprint.subjectKey) failures.push("subjectKey");
    if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint.projectionCommitSHA)) failures.push("projectionCommitSHA");
    if (!Number.isSafeInteger(fingerprint.projectionGeneration) || fingerprint.projectionGeneration <= 0) failures.push("projectionGeneration");
    if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint.eventRevisionHash)) failures.push("eventRevisionHash");
    if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint.dependencyGraphHash)) failures.push("dependencyGraphHash");
    if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint.transitiveClosureHash)) failures.push("transitiveClosureHash");
    if (value.targetRevisionId == null || !/^sha256:[a-f0-9]{64}$/.test(value.targetContentHash ?? "")) failures.push("target");
    if (value.approval?.approvalKind !== value.approvalKind) failures.push("approvalKind");
    if (fingerprint.dependencies.length === 0) failures.push("empty dependencies");
    if (new Set(uniqueTupleKeys).size !== uniqueTupleKeys.length) failures.push("duplicate tuple");
    if (new Set(uniqueDependencyIdentities).size !== uniqueDependencyIdentities.length) failures.push("duplicate dependency identity");
    if (requiredDependencyKinds[value.approvalKind].some((kind) => !dependencyKinds.has(kind))) failures.push("missing required dependency kind");
    if ([...dependencyKinds].some((kind) => !allowedDependencyKinds[value.approvalKind].includes(kind))) failures.push("unknown dependency kind");
    if (!isDeepStrictEqual(fingerprint.dependencies, canonicalDependencyList([...fingerprint.dependencies]))) failures.push("non-canonical dependency order");
    if (fingerprint.dependencies.some((dependency) => !dependency.dependencyKind || !dependency.stableId || !dependency.revision || !dependency.actionScope || !/^sha256:[a-f0-9]{64}$/.test(dependency.contentHash))) failures.push("invalid dependency tuple");
    if (!/^sha256:[a-f0-9]{64}$/.test(value.recordedHash ?? "") || value.recordedHash !== value.expectedHash) failures.push("recorded hash mismatch");
    return failures.map((failure) => `${value.approvalKind}:${failure}`);
  });
  const invalidDependencyFingerprints = dependencyFingerprintFailures.length > 0 || dependencyFingerprintResults.length !== summarySegments.length + 2;
  const parseUtcMillis = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
    const millis = Date.parse(value);
    return Number.isFinite(millis) && new Date(millis).toISOString().replace(".000Z", "Z") === value ? millis : null;
  };
  const rightsDecisionAllows = (decision, filingId, documentRevisionId, purpose, channel, requiredActions, checkedAt) => {
    const checkedAtMillis = parseUtcMillis(checkedAt);
    const effectiveFromMillis = parseUtcMillis(decision?.effectiveFrom);
    const effectiveUntilMillis = parseUtcMillis(decision?.effectiveUntil);
    return Boolean(decision && decision.filingId === filingId && decision.documentRevisionId === documentRevisionId && decision.purpose === purpose && decision.channel === channel && decision.status === "APPROVED" && decision.reviewerId && checkedAtMillis !== null && effectiveFromMillis !== null && effectiveUntilMillis !== null && effectiveFromMillis < effectiveUntilMillis && effectiveFromMillis <= checkedAtMillis && checkedAtMillis < effectiveUntilMillis && Array.isArray(decision.allowedActions) && requiredActions.every((action) => decision.allowedActions.includes(action)));
  };
  const sourceTupleKeys = sourceFilings.map((filing) => `${filing.source}:${filing.externalId}`);
  const sourceRefs = [
    ...(example.dates ?? []).map((date) => date.sourceRef),
    ...(example.analysis?.claims ?? []).flatMap((claim) => (claim.evidenceRefs ?? []).map((evidence) => evidence.sourceRef)),
  ];
  const invalidSourceCatalog = sourceFilings.some((filing) => !filing.filingId || !filing.source || !filing.externalId) || filingIds.size !== sourceFilings.length || new Set(sourceTupleKeys).size !== sourceTupleKeys.length;
  const invalidDocumentRevisionCatalog = documentRevisions.some((revision) => !revision.documentRevisionId || !revision.filingId || !filingIds.has(revision.filingId) || !revision.documentHash) || documentRevisionById.size !== documentRevisions.length;
  const invalidRightsDecisionCatalog = rightsDecisions.some((decision) => !decision.rightsDecisionId || !decision.filingId || !filingIds.has(decision.filingId) || !documentRevisionById.has(decision.documentRevisionId) || documentRevisionById.get(decision.documentRevisionId)?.filingId !== decision.filingId || !decision.decisionSnapshotHash || !decision.purpose || !decision.channel || decision.status !== "APPROVED" || !parseUtcMillis(decision.effectiveFrom) || !parseUtcMillis(decision.effectiveUntil) || !decision.reviewerId || !Array.isArray(decision.allowedActions) || decision.allowedActions.length === 0 || new Set(decision.allowedActions).size !== decision.allowedActions.length) || rightsDecisionById.size !== rightsDecisions.length;
  const invalidSourceLineage = sourceRefs.some((sourceRef) => {
    const documentRevision = documentRevisionById.get(sourceRef?.documentRevisionId);
    const rightsDecision = rightsDecisionById.get(sourceRef?.rightsDecisionId);
    return !sourceRef?.filingId || !filingIds.has(sourceRef.filingId) || !documentRevision || documentRevision.filingId !== sourceRef.filingId || documentRevision.documentHash !== sourceRef.documentHash || !rightsDecisionAllows(rightsDecision, sourceRef.filingId, sourceRef.documentRevisionId, "ANALYSIS", "INTERNAL_ANALYSIS", ["ANALYZE"], example.analysis?.execution?.executedAt);
  });
  const hasScopedRights = (authorization, sourceRef, requiredActions, purpose, channel) => Array.isArray(authorization?.rightsDecisionIds) && authorization.rightsDecisionIds.some((id) => rightsDecisionAllows(rightsDecisionById.get(id), sourceRef?.filingId, sourceRef?.documentRevisionId, purpose, channel, requiredActions, authorization.checkedAt));
  const invalidSummary = summarySegments.some((segment) => {
    if (!Array.isArray(segment.claimIds) || segment.claimIds.length === 0 || segment.claimIds.some((id) => !claimIds.has(id))) return true;
    if (!segment.reviewDecision || segment.reviewDecision.status !== "APPROVED" || !segment.reviewDecision.reviewerId || !segment.reviewDecision.decidedAt) return true;
    const requiredActions = ["STORE_DERIVATIVE", "DISPLAY_PUBLIC_API"];
    const auth = segment.summaryUseAuthorization;
    if (!auth || !Array.isArray(auth.requiredActions) || requiredActions.some((action) => !auth.requiredActions.includes(action)) || !Array.isArray(auth.rightsDecisionIds)) return true;
    return segment.claimIds.some((id) => {
      const claim = claimById.get(id);
      if (!claim) return true;
      if (segment.kind === "FACTUAL" && (claim.claimType !== "FACT" || claim.verificationStatus !== "SUPPORTED")) return true;
      if (segment.kind === "INTERPRETIVE") {
        if (claim.claimType !== "INTERPRETATION" || !Array.isArray(claim.basedOnClaimIds) || claim.basedOnClaimIds.length === 0 || !claim.authoredBy || !claim.analysisRevisionId) return true;
        if (claim.basedOnClaimIds.some((baseId) => claimById.get(baseId)?.claimType !== "FACT" || claimById.get(baseId)?.verificationStatus !== "SUPPORTED")) return true;
      } else if (segment.kind !== "FACTUAL") return true;
      return auth.purpose !== "SUMMARY" || auth.channel !== "PUBLIC_API" || !["STORE_DERIVATIVE", "DISPLAY_PUBLIC_API"].every((action) => auth.requiredActions.includes(action)) || (claim.evidenceRefs ?? []).some((evidence) => !hasScopedRights(auth, evidence.sourceRef, requiredActions, "SUMMARY", "PUBLIC_API"));
    });
  });
  const analysisApproval = example.analysis?.review;
  const eventApproval = example.review;
  const approvalIds = [eventApproval?.decisionId, analysisApproval?.decisionId, ...summarySegments.map((segment) => segment.reviewDecision?.decisionId)].filter(Boolean);
  const invalidApprovalBindings = !example.eventRevisionId || !example.analysis?.analysisRevisionId || !eventApproval || eventApproval.approvalKind !== "EVENT" || eventApproval.status !== "APPROVED" || eventApproval.targetRevisionId !== example.eventRevisionId || eventApproval.targetContentHash !== example.contentHash || !eventApproval.dependencyFingerprintHash || !eventApproval.reviewedBy || !eventApproval.reviewedAt || !analysisApproval || analysisApproval.approvalKind !== "ANALYSIS" || analysisApproval.status !== "APPROVED" || analysisApproval.targetRevisionId !== example.analysis.analysisRevisionId || analysisApproval.targetContentHash !== example.analysis.outputHash || !analysisApproval.dependencyFingerprintHash || !analysisApproval.reviewedBy || !analysisApproval.reviewedAt || summarySegments.some((segment) => segment.analysisRevisionId !== example.analysis.analysisRevisionId || !segment.outputHash || !segment.locale || segment.reviewDecision?.approvalKind !== "SUMMARY_SEGMENT" || segment.reviewDecision.status !== "APPROVED" || segment.reviewDecision.targetRevisionId !== segment.segmentId || segment.reviewDecision.targetContentHash !== segment.outputHash || !segment.reviewDecision.dependencyFingerprintHash || !segment.reviewDecision.reviewerId || !segment.reviewDecision.decidedAt) || approvalIds.length !== new Set(approvalIds).size;
  const invalidDates = [
    ...(example.analysis?.confirmedDates ?? []),
    ...(example.analysis?.estimatedDates ?? []),
  ].some((id) => !dateIds.has(id));
  const invalidDateBasis = (example.dates ?? []).some((date) => {
    const basisClaimIds = date.certaintyBasisClaimIds;
    if (!Array.isArray(basisClaimIds) || basisClaimIds.length === 0 || new Set(basisClaimIds).size !== basisClaimIds.length) return true;
    return basisClaimIds.some((claimId) => {
      const claim = claimById.get(claimId);
      if (!claim || !claim.normalizedValue || claim.normalizedValue.valueKind !== date.valueKind || !isDeepStrictEqual(claim.normalizedValue.value, date.value)) return true;
      const sameSourceSupport = (claim.evidenceRefs ?? []).some((evidence) => evidence.role === "SUPPORTS" && evidence.sourceRef?.filingId === date.sourceRef?.filingId && evidence.sourceRef?.documentRevisionId === date.sourceRef?.documentRevisionId && evidence.sourceRef?.documentHash === date.sourceRef?.documentHash);
      if (!sameSourceSupport) return true;
      if (date.certainty === "OFFICIAL_CONFIRMED" && (claim.claimType !== "FACT" || claim.verificationStatus !== "SUPPORTED")) return true;
      return !["FACT", "INTERPRETATION"].includes(claim.claimType);
    });
  });
  const invalidDateValueKinds = (example.dates ?? []).some((date) => !["DATE", "LOCAL_DATE_TIME", "OFFSET_DATE_TIME", "MONTH", "QUARTER", "DATE_RANGE", "UNKNOWN"].includes(date.valueKind));
  const facts = claims;
  const evidenceIds = facts.flatMap((claim) => (claim.evidenceRefs ?? []).map((evidence) => evidence.evidenceId));
  const invalidFact = facts.some((claim) => {
    if (claim.claimType !== "FACT") return false;
    const refs = claim.evidenceRefs;
    if (!Array.isArray(refs) || refs.length === 0 || !["SUPPORTED", "CONTESTED", "UNSUPPORTED", "UNRESOLVED"].includes(claim.verificationStatus)) return true;
    const invalidEvidence = refs.some((evidence) => !evidence.evidenceId || !["SUPPORTS", "CONTRADICTS", "CONTEXT"].includes(evidence.role) || !evidence.sourceRef?.filingId || !evidence.sourceRef?.documentRevisionId || !evidence.sourceRef?.documentHash || !evidence.sourceRef?.rightsDecisionId || typeof evidence.sourceRef?.locator !== "string" || !evidence.sourceRef.locator.trim());
    const hasSupport = refs.some((evidence) => evidence.role === "SUPPORTS");
    const hasContradiction = refs.some((evidence) => evidence.role === "CONTRADICTS");
    return invalidEvidence || !hasSupport || (hasContradiction && !["CONTESTED", "UNRESOLVED"].includes(claim.verificationStatus)) || (claim.verificationStatus === "SUPPORTED" && hasContradiction);
  });
  const duplicateClaimIds = facts.some((claim) => typeof claim.claimId !== "string" || !claim.claimId.trim()) || facts.length !== claimIds.size;
  const duplicateEvidenceIds = evidenceIds.length !== new Set(evidenceIds).size;
  const invalidDateSources = (example.dates ?? []).some((date) => !date.sourceRef?.filingId || !date.sourceRef?.documentRevisionId || !date.sourceRef?.documentHash || !date.sourceRef?.rightsDecisionId || typeof date.sourceRef?.locator !== "string" || !date.sourceRef.locator.trim());
  const invalidDateOutputRights = (example.dates ?? []).some((date) => {
    const auth = date.publicationAuthorization;
    const requiredActions = ["STORE_DERIVATIVE", "DISPLAY_EVENT_DATE"];
    return !auth || !Array.isArray(auth.requiredActions) || auth.purpose !== "EVENT_DATE" || auth.channel !== "PUBLIC_API" || requiredActions.some((action) => !auth.requiredActions.includes(action)) || !hasScopedRights(auth, date.sourceRef, requiredActions, "EVENT_DATE", "PUBLIC_API");
  });
  if (invalidCanonicalHashes || invalidSummary || invalidApprovalBindings || invalidDependencyFingerprints || invalidDates || invalidDateBasis || invalidDateValueKinds || invalidFact || duplicateClaimIds || duplicateEvidenceIds || invalidDateSources || invalidDateOutputRights || invalidSourceCatalog || invalidDocumentRevisionCatalog || invalidRightsDecisionCatalog || invalidSourceLineage) {
    const failedChecks = Object.entries({ invalidCanonicalHashes, invalidSummary, invalidApprovalBindings, invalidDependencyFingerprints, invalidDates, invalidDateBasis, invalidDateValueKinds, invalidFact, duplicateClaimIds, duplicateEvidenceIds, invalidDateSources, invalidDateOutputRights, invalidSourceCatalog, invalidDocumentRevisionCatalog, invalidRightsDecisionCatalog, invalidSourceLineage }).filter(([, failed]) => failed).map(([name]) => name);
    console.error(`Korean disclosure architecture JSON example failed semantic checks: ${failedChecks.join(", ")}`);
    if (invalidCanonicalHashes) console.error(`Expected canonical hash fixtures: summaries=${JSON.stringify(Object.fromEntries(summaryHashById))}, analysis=${expectedAnalysisOutputHash}, event=${expectedEventContentHash}`);
    if (invalidDependencyFingerprints) console.error(`Dependency fingerprint failures: ${dependencyFingerprintFailures.join(", ")}; expected=${JSON.stringify(Object.fromEntries(dependencyFingerprintResults.map(({ approvalKind, expectedHash }) => [approvalKind, expectedHash])))}`);
    process.exit(1);
  }
  const followUpFixturePath = join(root, "docs", "fixtures", "disclosure", "follow-up-equity-raise.v0.json");
  const requiredFollowUpVectorIds = [
    "FUER-01-PLAN-ONLY", "FUER-02-ALLOTMENT-PARTIAL", "FUER-03-PAYMENT-NOT-ISSUANCE", "FUER-04-BASIS-MISMATCH",
    "FUER-05-UNRESOLVED-CORRECTION", "FUER-06-VALID-EMPTY", "FUER-07-PARTIAL-COVERAGE", "FUER-08-ISSUANCE-CONFIRMED-LISTING-UNKNOWN",
    "FUER-09-OTHER-STOCK-ONLY", "FUER-10-RIGHTS-BLOCKED", "FUER-11-MASTER-CAP-STALE", "FUER-12-SNAPSHOT-MISMATCH",
  ];
  let followUpFixture;
  try {
    const fixtureSource = readFileSync(followUpFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    followUpFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Korean disclosure follow-up fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const fixtureVectors = followUpFixture?.vectors;
  const actualFollowUpVectorIds = Array.isArray(fixtureVectors) ? fixtureVectors.map((vector) => vector?.id) : [];
  const vectorById = new Map(Array.isArray(fixtureVectors) ? fixtureVectors.map((vector) => [vector?.id, vector]) : []);
  const requiredEnvelopeKeys = followUpFixture?.requiredEnvelopeKeys;
  const invalidFollowUpVectorStructure = followUpFixture?.contractVersion !== "follow-up-equity-raise.v0"
    || followUpFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || followUpFixture?.dataPolicy?.containsRealFiling !== false
    || followUpFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || followUpFixture?.dataPolicy?.containsSourceBody !== false
    || followUpFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || !Array.isArray(requiredEnvelopeKeys)
    || ["contractVersion", "caseRevisionId", "snapshotId", "asOf", "publicationDisposition", "stageComparisons", "coverage", "allowedPublicTextKeys", "forbiddenPublicText", "sourceClaimBindings"].some((key) => !requiredEnvelopeKeys.includes(key))
    || actualFollowUpVectorIds.length !== requiredFollowUpVectorIds.length
    || new Set(actualFollowUpVectorIds).size !== actualFollowUpVectorIds.length
    || requiredFollowUpVectorIds.some((id) => !vectorById.has(id))
    || fixtureVectors?.some((vector) => !vector?.input || !vector?.expected || typeof vector.expected.publicationDisposition !== "string" || typeof vector.expected.stageStatuses !== "object" || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const planOnly = vectorById.get("FUER-01-PLAN-ONLY")?.expected;
  const allotmentOnly = vectorById.get("FUER-02-ALLOTMENT-PARTIAL")?.expected;
  const paymentNotIssuance = vectorById.get("FUER-03-PAYMENT-NOT-ISSUANCE")?.expected;
  const validEmpty = vectorById.get("FUER-06-VALID-EMPTY")?.expected;
  const partialCoverage = vectorById.get("FUER-07-PARTIAL-COVERAGE")?.expected;
  const issuanceListingGap = vectorById.get("FUER-08-ISSUANCE-CONFIRMED-LISTING-UNKNOWN")?.expected;
  const snapshotMismatch = vectorById.get("FUER-12-SNAPSHOT-MISMATCH")?.expected;
  const requiredVectorAssertions = {
    "FUER-01-PLAN-ONLY": (vector) => vector.input.planCommonShares === "1000000" && vector.input.allotment === null && vector.input.payment === null && vector.input.issuance === null && vector.expected.stageStatuses.PLAN === "EVIDENCE_OBSERVED" && vector.expected.stageStatuses.ISSUANCE === "UNVERIFIABLE",
    "FUER-02-ALLOTMENT-PARTIAL": (vector) => vector.input.planCommonShares === "1000000" && vector.input.allottedCommonShares === "700000" && vector.expected.comparison === "VALUE_CHANGED" && vector.expected.stageStatuses.ALLOTMENT === "CONFIRMED_FOR_STAGE" && vector.expected.stageStatuses.PAYMENT === "NOT_REPORTED" && vector.expected.stageStatuses.ISSUANCE === "NOT_REPORTED",
    "FUER-03-PAYMENT-NOT-ISSUANCE": (vector) => vector.input.originalPlan === "1000000" && vector.input.correctedPlan === "800000" && vector.input.allotted === "700000" && vector.input.paid === "650000" && vector.input.issued === null && vector.expected.stageStatuses.PAYMENT === "CONFIRMED_FOR_STAGE" && vector.expected.stageStatuses.ISSUANCE === "NOT_REPORTED",
    "FUER-04-BASIS-MISMATCH": (vector) => vector.input.plan?.class === "COMMON" && vector.input.observed?.class === "OTHER" && vector.input.plan?.unit === vector.input.observed?.unit && vector.input.plan?.basisDate !== vector.input.observed?.basisDate && vector.expected.comparison === "NOT_COMPARABLE",
    "FUER-05-UNRESOLVED-CORRECTION": (vector) => vector.input.marker === "rm=정" && vector.input.relation === "UNRESOLVED" && vector.expected.publicationDisposition === "SUPPRESSED_REVIEW" && vector.expected.stageStatuses.PLAN === "CONFLICTED",
    "FUER-06-VALID-EMPTY": (vector) => vector.input.queryStatus === "VALID_EMPTY" && vector.input.requiredHistoricalScope === "INCOMPLETE" && vector.expected.coverage === "VALID_EMPTY_SCOPE_ONLY" && vector.expected.stageStatuses.OUTCOME === "UNVERIFIABLE",
    "FUER-07-PARTIAL-COVERAGE": (vector) => vector.input.pagesSucceeded < vector.input.pagesExpected && vector.input.providerStatus === "QUOTA_ERROR" && vector.expected.coverage === "PARTIAL" && vector.expected.publicationDisposition === "SUPPRESSED_SOURCE_COVERAGE",
    "FUER-08-ISSUANCE-CONFIRMED-LISTING-UNKNOWN": (vector) => vector.input.issuedCommonShares !== null && vector.input.listingEvidence === null && vector.input.followupFilingRead === true && vector.input.listingClaimPresentInReadFiling === false && vector.input.separateListingSearch === "NOT_RUN" && vector.expected.stageStatuses.ISSUANCE === "CONFIRMED_FOR_STAGE" && vector.expected.stageStatuses.LISTING === "NOT_REPORTED" && vector.expected.stageStatuses.OUTCOME === "OUTCOME_NOT_VERIFIED",
    "FUER-09-OTHER-STOCK-ONLY": (vector) => vector.input.observedOtherShares !== null && vector.input.observedCommonShares === null && vector.input.masterCommonSubject === "UNRESOLVED" && vector.expected.stageStatuses.COMMON_ISSUANCE === "NOT_REPORTED" && vector.expected.publicationDisposition === "SUPPRESSED_SUBJECT",
    "FUER-10-RIGHTS-BLOCKED": (vector) => vector.input.listMetadataRights === "APPROVED" && vector.input.structuredFieldRights === "UNRESOLVED" && vector.input.bodyRights === "NOT_APPROVED" && vector.expected.publicationDisposition === "PUBLISHED_METADATA_ONLY" && vector.expected.stageStatuses.ALLOTMENT === "UNVERIFIABLE",
    "FUER-11-MASTER-CAP-STALE": (vector) => vector.input.masterAssertion === "EXPIRED" && vector.input.capEligibility === "STALE" && vector.expected.publicationDisposition === "SUPPRESSED_SUBJECT" && vector.expected.stageStatuses.SUBJECT === "UNVERIFIABLE",
    "FUER-12-SNAPSHOT-MISMATCH": (vector) => vector.input.planSnapshot !== vector.input.allotmentSnapshot && vector.input.uiRecomputesStatus === true && vector.expected.publicationDisposition === "REJECT_RESPONSE" && Object.keys(vector.expected.stageStatuses).length === 0,
  };
  const failedFollowUpVectorAssertions = requiredFollowUpVectorIds.filter((id) => !vectorById.get(id) || !requiredVectorAssertions[id](vectorById.get(id)));
  const invalidFollowUpSafetyAssertions = failedFollowUpVectorAssertions.length > 0
    || planOnly?.forbiddenPublicText?.includes("발행 완료") !== true
    || planOnly?.stageStatuses?.ISSUANCE !== "UNVERIFIABLE"
    || allotmentOnly?.stageStatuses?.ALLOTMENT !== "CONFIRMED_FOR_STAGE"
    || allotmentOnly?.stageStatuses?.PAYMENT !== "NOT_REPORTED"
    || paymentNotIssuance?.stageStatuses?.PAYMENT !== "CONFIRMED_FOR_STAGE"
    || paymentNotIssuance?.stageStatuses?.ISSUANCE !== "NOT_REPORTED"
    || validEmpty?.coverage !== "VALID_EMPTY_SCOPE_ONLY"
    || validEmpty?.forbiddenPublicText?.includes("미실행") !== true
    || partialCoverage?.publicationDisposition !== "SUPPRESSED_SOURCE_COVERAGE"
    || issuanceListingGap?.stageStatuses?.ISSUANCE !== "CONFIRMED_FOR_STAGE"
    || issuanceListingGap?.stageStatuses?.LISTING !== "NOT_REPORTED"
    || issuanceListingGap?.stageStatuses?.OUTCOME !== "OUTCOME_NOT_VERIFIED"
    || snapshotMismatch?.publicationDisposition !== "REJECT_RESPONSE"
    || snapshotMismatch?.forbiddenPublicText?.length === 0;
  const followUpArchitecture = section("##### 합성 DTO golden vector v0 제안", "#### 후속 item·구독 계약");
  const missingFollowUpVectorIds = requiredFollowUpVectorIds.filter((id) => !followUpArchitecture.includes(id));
  if (invalidFollowUpVectorStructure || invalidFollowUpSafetyAssertions || missingFollowUpVectorIds.length) {
    console.error(`Korean disclosure follow-up fixture contract incomplete: ${[...(invalidFollowUpVectorStructure ? ["fixture version/data policy/vector IDs/envelope structure"] : []), ...(invalidFollowUpSafetyAssertions ? ["stage separation/coverage/snapshot fail-closed assertions"] : []), ...failedFollowUpVectorAssertions, ...missingFollowUpVectorIds].join(", ")}`);
    process.exit(1);
  }
  const convertibleFixturePath = join(root, "docs", "fixtures", "disclosure", "convertible-securities.v0.json");
  const requiredConvertibleVectorIds = [
    "FUCS-01-CB-TERMS-ONLY", "FUCS-02-CB-PARTIAL-CONVERSION", "FUCS-03-CB-RESET-TERMS-UNRESOLVED", "FUCS-04-CB-UNDERLYING-CLASS-UNKNOWN",
    "FUCS-05-BW-BOND-WARRANT-SEPARATE", "FUCS-06-BW-EXERCISE-NOT-ISSUANCE", "FUCS-07-BW-RESET-FLOOR-UNKNOWN", "FUCS-08-EB-EXISTING-SHARES",
    "FUCS-09-EB-TARGET-OWNERSHIP-UNKNOWN", "FUCS-10-TERMS-CORRECTION-UNRESOLVED", "FUCS-11-VALID-EMPTY-NO-OUTCOME", "FUCS-12-PARTIAL-COVERAGE",
    "FUCS-13-MATURITY-NOT-SETTLEMENT", "FUCS-14-SECURITY-TRANCHE-MISMATCH", "FUCS-15-SNAPSHOT-MISMATCH",
  ];
  let convertibleFixture;
  try {
    const fixtureSource = readFileSync(convertibleFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    convertibleFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Korean convertible securities fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const convertibleVectors = convertibleFixture?.vectors;
  const convertibleIds = Array.isArray(convertibleVectors) ? convertibleVectors.map((vector) => vector?.id) : [];
  const convertibleById = new Map(Array.isArray(convertibleVectors) ? convertibleVectors.map((vector) => [vector?.id, vector]) : []);
  const invalidConvertibleStructure = convertibleFixture?.contractVersion !== "convertible-securities.v0"
    || convertibleFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || convertibleFixture?.dataPolicy?.containsRealFiling !== false
    || convertibleFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || convertibleFixture?.dataPolicy?.containsSourceBody !== false
    || convertibleFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || convertibleIds.length !== requiredConvertibleVectorIds.length
    || new Set(convertibleIds).size !== convertibleIds.length
    || requiredConvertibleVectorIds.some((id) => !convertibleById.has(id))
    || convertibleVectors?.some((vector) => !vector?.input || !vector?.expected || typeof vector.expected.publicationDisposition !== "string" || typeof vector.expected.stageStatuses !== "object" || typeof vector.expected.dilution !== "string" || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const failedConvertibleAssertions = requiredConvertibleVectorIds.filter((id) => !convertibleById.has(id));
  const cbTermsInput = convertibleById.get("FUCS-01-CB-TERMS-ONLY")?.input;
  const cbPartial = convertibleById.get("FUCS-02-CB-PARTIAL-CONVERSION");
  const bwExercise = convertibleById.get("FUCS-06-BW-EXERCISE-NOT-ISSUANCE");
  const ebExistingInput = convertibleById.get("FUCS-08-EB-EXISTING-SHARES")?.input;
  const emptyScope = convertibleById.get("FUCS-11-VALID-EMPTY-NO-OUTCOME");
  const partialSource = convertibleById.get("FUCS-12-PARTIAL-COVERAGE");
  const snapshotMismatchVector = convertibleById.get("FUCS-15-SNAPSHOT-MISMATCH");
  const invalidConvertibleSafety = cbTermsInput?.conversionEvidence !== null
    || convertibleById.get("FUCS-01-CB-TERMS-ONLY")?.expected?.dilution !== "CONDITIONAL_ONLY"
    || cbPartial?.input?.convertedShares === cbPartial?.input?.potentialShares
    || cbPartial?.expected?.dilution !== "ACTUAL_CONVERTED_SHARES_ONLY"
    || bwExercise?.input?.paymentEvidence !== null
    || bwExercise?.input?.issuedShares !== null
    || bwExercise?.expected?.stageStatuses?.ISSUANCE !== "NOT_REPORTED"
    || ebExistingInput?.exchangeTarget !== "EXISTING_ISSUER_HELD_SHARES"
    || convertibleById.get("FUCS-08-EB-EXISTING-SHARES")?.expected?.dilution !== "NO_NEW_ISSUANCE_INFERRED"
    || emptyScope?.input?.historicalScope !== "INCOMPLETE"
    || emptyScope?.expected?.stageStatuses?.REDEMPTION !== "UNVERIFIABLE"
    || partialSource?.input?.pagesSucceeded >= partialSource?.input?.pagesExpected
    || partialSource?.expected?.publicationDisposition !== "SUPPRESSED_SOURCE_COVERAGE"
    || snapshotMismatchVector?.input?.termsSnapshot === snapshotMismatchVector?.input?.conversionSnapshot
    || snapshotMismatchVector?.expected?.publicationDisposition !== "REJECT_RESPONSE";
  const convertibleArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingConvertibleVectorIds = requiredConvertibleVectorIds.filter((id) => !convertibleArchitecture.includes(id));
  const cbTermsOnly = convertibleById.get("FUCS-01-CB-TERMS-ONLY")?.expected;
  const ebExistingShares = convertibleById.get("FUCS-08-EB-EXISTING-SHARES")?.expected;
  if (invalidConvertibleStructure || failedConvertibleAssertions.length || missingConvertibleVectorIds.length || invalidConvertibleSafety || cbTermsOnly?.forbiddenPublicText?.includes("희석 확정") !== true || ebExistingShares?.dilution !== "NO_NEW_ISSUANCE_INFERRED") {
    console.error(`Korean convertible securities fixture contract incomplete: ${[...(invalidConvertibleStructure ? ["fixture version/data policy/vector IDs/envelope structure"] : []), ...failedConvertibleAssertions, ...missingConvertibleVectorIds, ...(invalidConvertibleSafety ? ["terms/actual result/BW separation/EB dilution/coverage/snapshot fail-closed assertions"] : []), ...(cbTermsOnly?.forbiddenPublicText?.includes("희석 확정") !== true ? ["terms-only CB dilution wording"] : []), ...(ebExistingShares?.dilution !== "NO_NEW_ISSUANCE_INFERRED" ? ["EB existing-share issuance separation"] : [])].join(", ")}`);
    process.exit(1);
  }
  const convertibleOutcomeFixturePath = join(root, "docs", "fixtures", "disclosure", "convertible-outcome-evidence.v0.json");
  const requiredConvertibleOutcomeIds = [
    "FUEV-01-CB-EXERCISE-VS-LISTING", "FUEV-02-CB-CURRENT-NOTICE-DEDUP", "FUEV-03-BW-EXERCISE-RESIDUAL", "FUEV-04-BW-CASH-VS-BOND-OFFSET",
    "FUEV-05-EB-TREASURY-DELIVERY", "FUEV-06-EB-THIRD-PARTY-UNDERLYING", "FUEV-07-CORRECTED-LISTING-DATE", "FUEV-08-ADDITIONAL-LISTING-CONFIRMED",
    "FUEV-09-NOTICE-CUMULATIVE-EXCLUDES-PRIOR-FILINGS", "FUEV-10-ISSUED-SHARES-DENOMINATOR-INCLUSION-IS-RECEIPT-SPECIFIC",
    "FUEV-11-PARTIAL-ONE-TO-MANY-LISTING-KEEPS-UNMATCHED-SHARES-UNRESOLVED", "FUEV-12-AGGREGATE-LISTING-NOTICE-DOES-NOT-INVENT-LINE-ALLOCATION",
    "FUEV-13-QUANTITY-MISMATCH-OR-UNRESOLVED-RELATION-DOES-NOT-CREATE-REMAINDER-FACT", "FUEV-14-CORRECTED-LISTING-NOTICE-SUPERSEDES-DATE-WITHOUT-ADDING-SHARES",
    "FUEV-15-VALID-EMPTY-LISTING-SEARCH-IS-SCOPE-LIMITED", "FUEV-16-PARTIAL-OR-UNAUTHORIZED-LISTING-SEARCH-IS-UNVERIFIABLE",
  ];
  let convertibleOutcomeFixture;
  try {
    const fixtureSource = readFileSync(convertibleOutcomeFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    convertibleOutcomeFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Korean convertible outcome evidence fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const outcomeVectors = convertibleOutcomeFixture?.vectors;
  const outcomeIds = Array.isArray(outcomeVectors) ? outcomeVectors.map((vector) => vector?.id) : [];
  const outcomeById = new Map(Array.isArray(outcomeVectors) ? outcomeVectors.map((vector) => [vector?.id, vector]) : []);
  const invalidOutcomeStructure = convertibleOutcomeFixture?.contractVersion !== "convertible-outcome-evidence.v0"
    || convertibleOutcomeFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || convertibleOutcomeFixture?.dataPolicy?.containsRealFiling !== false
    || convertibleOutcomeFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || convertibleOutcomeFixture?.dataPolicy?.containsSourceBody !== false
    || convertibleOutcomeFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || !convertibleOutcomeFixture?.sourceShapes?.CB_EXERCISE_NOTICE
    || !convertibleOutcomeFixture?.sourceShapes?.BW_EXERCISE_NOTICE
    || !convertibleOutcomeFixture?.sourceShapes?.EB_EXCHANGE_NOTICE
    || !["sourceSurfaceAndEventCategory", "issuerIdentity", "securityClassAndSeriesWhenAvailable", "declaredDateWindow", "paginationAndProviderStatus", "correctionAndLateArrivalPass", "rightsDecisionScope", "asOfAndQueryManifest"].every((dimension) => convertibleOutcomeFixture?.listingSearchPolicy?.requiredCoverageDimensions?.includes(dimension))
    || convertibleOutcomeFixture?.listingSearchPolicy?.validEmptyDisposition !== "NOT_FOUND_IN_SCOPE_DOES_NOT_PROVE_UNLISTED"
    || convertibleOutcomeFixture?.listingSearchPolicy?.partialOrUnauthorizedDisposition !== "UNVERIFIABLE"
    || convertibleOutcomeFixture?.listingSearchPolicy?.overallOutcomeWhenListingNotFound !== "OUTCOME_NOT_VERIFIED"
    || convertibleOutcomeFixture?.listingSearchPolicy?.implicitNegativeFact !== false
    || convertibleOutcomeFixture?.listingSearchPolicy?.unapprovedLookbackOrQuotaThreshold !== "NOT_SET"
    || outcomeIds.length !== requiredConvertibleOutcomeIds.length
    || new Set(outcomeIds).size !== outcomeIds.length
    || requiredConvertibleOutcomeIds.some((id) => !outcomeById.has(id))
    || outcomeVectors?.some((vector) => !vector?.input || !vector?.expected || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const cbNoticeVsListing = outcomeById.get("FUEV-01-CB-EXERCISE-VS-LISTING");
  const dedupNotice = outcomeById.get("FUEV-02-CB-CURRENT-NOTICE-DEDUP");
  const bwResidual = outcomeById.get("FUEV-03-BW-EXERCISE-RESIDUAL");
  const bwSettlement = outcomeById.get("FUEV-04-BW-CASH-VS-BOND-OFFSET");
  const ebTreasury = outcomeById.get("FUEV-05-EB-TREASURY-DELIVERY");
  const ebThirdParty = outcomeById.get("FUEV-06-EB-THIRD-PARTY-UNDERLYING");
  const correctedListing = outcomeById.get("FUEV-07-CORRECTED-LISTING-DATE");
  const separateListing = outcomeById.get("FUEV-08-ADDITIONAL-LISTING-CONFIRMED");
  const noticeCumulative = outcomeById.get("FUEV-09-NOTICE-CUMULATIVE-EXCLUDES-PRIOR-FILINGS");
  const receiptDenominator = outcomeById.get("FUEV-10-ISSUED-SHARES-DENOMINATOR-INCLUSION-IS-RECEIPT-SPECIFIC");
  const partialListing = outcomeById.get("FUEV-11-PARTIAL-ONE-TO-MANY-LISTING-KEEPS-UNMATCHED-SHARES-UNRESOLVED");
  const aggregateListing = outcomeById.get("FUEV-12-AGGREGATE-LISTING-NOTICE-DOES-NOT-INVENT-LINE-ALLOCATION");
  const unresolvedListing = outcomeById.get("FUEV-13-QUANTITY-MISMATCH-OR-UNRESOLVED-RELATION-DOES-NOT-CREATE-REMAINDER-FACT");
  const correctedAdditionalListing = outcomeById.get("FUEV-14-CORRECTED-LISTING-NOTICE-SUPERSEDES-DATE-WITHOUT-ADDING-SHARES");
  const validEmptyListingSearch = outcomeById.get("FUEV-15-VALID-EMPTY-LISTING-SEARCH-IS-SCOPE-LIMITED");
  const partialListingSearch = outcomeById.get("FUEV-16-PARTIAL-OR-UNAUTHORIZED-LISTING-SEARCH-IS-UNVERIFIABLE");
  const sumShareClaims = (rows, field) => rows.reduce((sum, row) => sum + BigInt(row?.[field] ?? "0"), 0n);
  const partialListingInputs = partialListing?.input?.listingNotices ?? [];
  const aggregateExerciseInputs = aggregateListing?.input?.exerciseLines ?? [];
  const unresolvedExerciseShares = BigInt(unresolvedListing?.input?.exerciseLine?.shares ?? "0");
  const unresolvedListingShares = BigInt(unresolvedListing?.input?.listingNotice?.shares ?? "0");
  const invalidOutcomeSafety = cbNoticeVsListing?.input?.listingDateKind !== "PROPOSED"
    || cbNoticeVsListing?.expected?.exercise !== "CONFIRMED_FOR_NOTICE"
    || cbNoticeVsListing?.expected?.listing !== "NOT_REPORTED"
    || dedupNotice?.input?.sameNoticeRowsRepeated !== true
    || dedupNotice?.expected?.priorNoticeSharesAddedAgain !== false
    || bwResidual?.input?.residualWarrantShares === "0"
    || bwResidual?.expected?.remainingWarrant !== "POST_NOTICE_OBSERVED"
    || bwResidual?.expected?.listing !== "NOT_REPORTED"
    || bwSettlement?.input?.cashPaymentProof !== null
    || bwSettlement?.input?.bondCancellationProof !== null
    || bwSettlement?.expected?.cashInflow !== "UNVERIFIABLE"
    || ebTreasury?.input?.newShareIssuance !== false
    || ebTreasury?.expected?.newShareDilution !== "NONE_FROM_THIS_EXCHANGE"
    || ebTreasury?.expected?.marketSupply !== "MAY_INCREASE"
    || ebThirdParty?.input?.targetIssuer === ebThirdParty?.input?.bondIssuer
    || ebThirdParty?.expected?.bondEventSubject === ebThirdParty?.expected?.underlyingExposureSubject
    || ebThirdParty?.input?.masterStatusTargetIssuer !== "UNRESOLVED"
    || !ebThirdParty?.expected?.commonStockRecommendation?.startsWith("SUPPRESSED")
    || correctedListing?.input?.correctionRelation !== "RESOLVED"
    || correctedListing?.expected?.recountExerciseShares !== false
    || correctedListing?.expected?.listingDate !== "CORRECTED_PROPOSED"
    || separateListing?.input?.additionalListingEvidence !== undefined
    || separateListing?.input?.additionalListingShares !== separateListing?.input?.exerciseReportedShares
    || separateListing?.expected?.listing !== "CONFIRMED_FOR_MATCHED_QUANTITY"
    || noticeCumulative?.input?.aggregateQualifier !== "CUMULATIVE_EXCLUDING_PREVIOUSLY_REPORTED_SHARES"
    || noticeCumulative?.expected?.currentNoticeShares !== noticeCumulative?.input?.noticeAggregateShares
    || noticeCumulative?.expected?.dailyRowsReconcileToNotice !== true
    || noticeCumulative?.expected?.priorNoticeSharesAddedAgain !== false
    || noticeCumulative?.expected?.lifetimeTotal !== null
    || new Set((receiptDenominator?.input?.reports ?? []).map((report) => report.denominatorQualifier)).size !== 2
    || new Set((receiptDenominator?.input?.reports ?? []).filter((report) => report.receipt.startsWith("SYN-RECEIPT-BW-")).map((report) => report.denominatorQualifier)).size !== 2
    || receiptDenominator?.expected?.denominatorBasis !== "RECEIPT_SPECIFIC_SOURCE_QUALIFIER_REQUIRED"
    || receiptDenominator?.expected?.issuerWideDefaultQualifier !== null
    || receiptDenominator?.expected?.familyWideDefaultQualifier !== null
    || receiptDenominator?.expected?.sameFamilyHasConflictingQualifiers !== true
    || receiptDenominator?.expected?.reportedPercentageMayBePreservedAsSourceClaim !== true
    || receiptDenominator?.expected?.recomputedPercentage !== null
    || receiptDenominator?.expected?.calculationStatus !== "NOT_COMPUTABLE_DISPLAY_POLICY_OR_INPUT_BASIS_UNAPPROVED"
    || partialListing?.expected?.matchCardinality !== "ONE_EXERCISE_LINE_TO_MULTIPLE_LISTING_NOTICES"
    || partialListing?.expected?.reconciledListedShares !== "100000"
    || sumShareClaims(partialListing?.input?.exerciseLines ?? [], "shares") !== sumShareClaims(partialListingInputs, "shares")
    || partialListingInputs.some((row) => row.relationStatus !== "RESOLVED" || !row.linkedExerciseLineIds?.includes("EX-SYN-1"))
    || partialListing?.expected?.exerciseSharesCountedOnce !== true
    || partialListing?.expected?.listingSharesCountedOnce !== true
    || aggregateListing?.expected?.matchCardinality !== "MULTIPLE_EXERCISE_LINES_TO_ONE_AGGREGATE_LISTING_NOTICE"
    || sumShareClaims(aggregateExerciseInputs, "shares") !== BigInt(aggregateListing?.input?.listingNotices?.[0]?.shares ?? "0")
    || aggregateExerciseInputs.some((row) => !aggregateListing?.input?.listingNotices?.[0]?.linkedExerciseLineIds?.includes(row.lineId))
    || aggregateListing?.expected?.perLineListedShares !== null
    || aggregateListing?.expected?.listedAggregateMayBeConfirmed !== true
    || unresolvedListing?.input?.listingSearchCoverage !== "PARTIAL"
    || unresolvedExerciseShares <= unresolvedListingShares
    || unresolvedListing?.expected?.listingRelation !== "UNRESOLVED"
    || unresolvedListing?.expected?.unmatchedExerciseShares !== "NOT_ESTABLISHED"
    || correctedAdditionalListing?.input?.correctedListingNotice?.relation !== "CORRECTS_DATE_ONLY"
    || correctedAdditionalListing?.input?.listingNotice?.listingId !== correctedAdditionalListing?.input?.correctedListingNotice?.listingId
    || correctedAdditionalListing?.input?.listingNotice?.shares !== correctedAdditionalListing?.input?.correctedListingNotice?.shares
    || correctedAdditionalListing?.expected?.sharesAddedByCorrection !== false
    || correctedAdditionalListing?.expected?.listingQuantityCountedOnce !== true
    || validEmptyListingSearch?.input?.listingSearch?.status !== "VALID_EMPTY"
    || !validEmptyListingSearch?.input?.listingSearch?.queryManifestId
    || !validEmptyListingSearch?.input?.listingSearch?.resultDigest
    || !validEmptyListingSearch?.input?.listingSearch?.asOf
    || !validEmptyListingSearch?.input?.listingSearch?.declaredDateWindow
    || validEmptyListingSearch?.input?.listingSearch?.pagination?.expectedPages !== validEmptyListingSearch?.input?.listingSearch?.pagination?.successfulPages
    || validEmptyListingSearch?.expected?.listingStageStatus !== "NOT_FOUND_IN_SCOPE"
    || validEmptyListingSearch?.expected?.overallOutcome !== "OUTCOME_NOT_VERIFIED"
    || validEmptyListingSearch?.expected?.negativeFact !== null
    || partialListingSearch?.input?.listingSearch?.pagination?.expectedPages <= partialListingSearch?.input?.listingSearch?.pagination?.successfulPages
    || partialListingSearch?.input?.listingSearch?.rightsDecisionScope !== "UNRESOLVED"
    || partialListingSearch?.input?.listingSearch?.queryManifestId !== null
    || partialListingSearch?.input?.listingSearch?.resultDigest !== null
    || partialListingSearch?.expected?.listingStageStatus !== "UNVERIFIABLE"
    || partialListingSearch?.expected?.queryResultDisposition !== "PARTIAL"
    || partialListingSearch?.expected?.overallOutcome !== "OUTCOME_NOT_VERIFIED"
    || partialListingSearch?.expected?.negativeFact !== null;
  const outcomeArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingOutcomeIdsInArchitecture = requiredConvertibleOutcomeIds.filter((id) => !outcomeArchitecture.includes(id));
  const requiredOutcomeTerms = ["분모 기준", "FUEV-09-NOTICE-CUMULATIVE-EXCLUDES-PRIOR-FILINGS", "FUEV-10-ISSUED-SHARES-DENOMINATOR-INCLUSION-IS-RECEIPT-SPECIFIC", "FUEV-11-PARTIAL-ONE-TO-MANY-LISTING-KEEPS-UNMATCHED-SHARES-UNRESOLVED", "FUEV-12-AGGREGATE-LISTING-NOTICE-DOES-NOT-INVENT-LINE-ALLOCATION", "FUEV-13-QUANTITY-MISMATCH-OR-UNRESOLVED-RELATION-DOES-NOT-CREATE-REMAINDER-FACT", "FUEV-14-CORRECTED-LISTING-NOTICE-SUPERSEDES-DATE-WITHOUT-ADDING-SHARES", "FUEV-15-VALID-EMPTY-LISTING-SEARCH-IS-SCOPE-LIMITED", "FUEV-16-PARTIAL-OR-UNAUTHORIZED-LISTING-SEARCH-IS-UNVERIFIABLE", "2026-11-04", "발행주식 총수 분모", "lifetime 합계", "수량 reconciliation 제안", "1:N", "aggregate listing notice", "NOT_FOUND_IN_SCOPE", "OUTCOME_NOT_VERIFIED", "paginationAndProviderStatus", "rightsDecisionScope"];
  const missingOutcomeTerms = requiredOutcomeTerms.filter((term) => !outcomeArchitecture.includes(term));
  if (invalidOutcomeStructure || invalidOutcomeSafety || missingOutcomeIdsInArchitecture.length || missingOutcomeTerms.length) {
    console.error(`Korean convertible outcome evidence fixture contract incomplete: ${[...(invalidOutcomeStructure ? ["fixture version/source shape/data policy/vector IDs"] : []), ...(invalidOutcomeSafety ? ["exercise/listing/dedup/settlement/EB supply/correction/denominator safety assertions"] : []), ...missingOutcomeIdsInArchitecture, ...missingOutcomeTerms].join(", ")}`);
    process.exit(1);
  }
  const capitalImpactFixturePath = join(root, "docs", "fixtures", "disclosure", "capital-impact-separation.v0.json");
  const requiredCapitalImpactIds = [
    "CIP-01-CB-CONVERSION-NONCASH", "CIP-02-BW-CASH-EXERCISE", "CIP-03-BW-BOND-OFFSET", "CIP-04-EB-TREASURY-EXCHANGE",
    "CIP-05-EB-THIRD-PARTY-SHARES", "CIP-06-EB-TREASURY-LOCKUP", "CIP-07-CB-POTENTIAL-NOT-ACTUAL", "CIP-08-RATIO-BASIS-STALE",
    "CIP-09-RATIO-TYPED-DENOMINATOR", "CIP-10-CASH-ZERO-VS-UNKNOWN", "CIP-11-ORIGINAL-PROCEEDS-NOT-CONVERSION-CASH", "CIP-12-UNRESOLVED-CORRECTION-SUPPRESSES-METRICS",
  ];
  let capitalImpactFixture;
  try {
    const fixtureSource = readFileSync(capitalImpactFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    capitalImpactFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Korean capital impact fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const capitalImpactVectors = capitalImpactFixture?.vectors;
  const capitalImpactIds = Array.isArray(capitalImpactVectors) ? capitalImpactVectors.map((vector) => vector?.id) : [];
  const capitalImpactById = new Map(Array.isArray(capitalImpactVectors) ? capitalImpactVectors.map((vector) => [vector?.id, vector]) : []);
  const invalidCapitalImpactStructure = capitalImpactFixture?.contractVersion !== "capital-impact-separation.v0"
    || capitalImpactFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || capitalImpactFixture?.dataPolicy?.containsRealFiling !== false
    || capitalImpactFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || capitalImpactFixture?.dataPolicy?.containsSourceBody !== false
    || capitalImpactFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || !["CASH_RECEIVED_GROSS", "NON_CASH_DEBT_SETTLEMENT", "NEW_SHARES_ISSUED", "TREASURY_SHARES_RELEASED", "PUBLIC_SUPPLY_POTENTIAL"].every((kind) => capitalImpactFixture?.impactKinds?.includes(kind))
    || capitalImpactIds.length !== requiredCapitalImpactIds.length
    || new Set(capitalImpactIds).size !== capitalImpactIds.length
    || requiredCapitalImpactIds.some((id) => !capitalImpactById.has(id))
    || capitalImpactVectors?.some((vector) => !vector?.input || !vector?.expected || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const noncashConversion = capitalImpactById.get("CIP-01-CB-CONVERSION-NONCASH");
  const bwCash = capitalImpactById.get("CIP-02-BW-CASH-EXERCISE");
  const bwOffset = capitalImpactById.get("CIP-03-BW-BOND-OFFSET");
  const ebTreasuryImpact = capitalImpactById.get("CIP-04-EB-TREASURY-EXCHANGE");
  const ebThirdPartyImpact = capitalImpactById.get("CIP-05-EB-THIRD-PARTY-SHARES");
  const ebLockup = capitalImpactById.get("CIP-06-EB-TREASURY-LOCKUP");
  const potentialCb = capitalImpactById.get("CIP-07-CB-POTENTIAL-NOT-ACTUAL");
  const staleRatio = capitalImpactById.get("CIP-08-RATIO-BASIS-STALE");
  const typedRatio = capitalImpactById.get("CIP-09-RATIO-TYPED-DENOMINATOR");
  const zeroVersusUnknown = capitalImpactById.get("CIP-10-CASH-ZERO-VS-UNKNOWN");
  const datedProceeds = capitalImpactById.get("CIP-11-ORIGINAL-PROCEEDS-NOT-CONVERSION-CASH");
  const unresolvedCapital = capitalImpactById.get("CIP-12-UNRESOLVED-CORRECTION-SUPPRESSES-METRICS");
  const invalidCapitalImpactSafety = noncashConversion?.input?.conversionSettlementCash !== "0"
    || noncashConversion?.expected?.cashReceivedGross?.value !== "0"
    || noncashConversion?.expected?.debtDerecognized?.value !== noncashConversion?.input?.convertedPrincipal
    || bwCash?.expected?.cashReceivedGross?.value !== bwCash?.input?.cashReceived
    || bwCash?.expected?.cashReceivedNet?.status !== "UNVERIFIABLE"
    || bwOffset?.expected?.cashReceivedGross?.value !== "0"
    || bwOffset?.expected?.nonCashDebtSettlement?.value !== bwOffset?.input?.exerciseAmount
    || ebTreasuryImpact?.expected?.newSharesIssued?.value !== "0"
    || ebTreasuryImpact?.expected?.treasurySharesReleased?.value !== ebTreasuryImpact?.input?.exchangedShares
    || ebTreasuryImpact?.expected?.publicSupplyPotential?.status !== "CONFIRMED_TRANSFER_NOT_MARKET_SALE"
    || ebThirdPartyImpact?.input?.bondIssuer === ebThirdPartyImpact?.input?.underlyingIssuer
    || ebThirdPartyImpact?.expected?.subjectBRecommendation !== "SUPPRESSED_MASTER_UNRESOLVED"
    || ebLockup?.expected?.publiclyTradableNow?.value !== "0"
    || ebLockup?.expected?.publicSupplyPotential?.status !== "CONDITIONAL_AFTER_RESTRICTION"
    || potentialCb?.expected?.newSharesIssued?.status !== "NOT_REPORTED"
    || potentialCb?.expected?.conditionalShares?.status !== "CONDITIONAL_ONLY"
    || staleRatio?.expected?.issuedShareIncreaseRatio?.status !== "NOT_COMPUTABLE"
    || typedRatio?.expected?.issuedShareIncreaseRatio?.label !== "신주 수 / 증자 전 발행주식수"
    || typedRatio?.expected?.ownershipDilutionRatio?.status !== "NOT_COMPUTABLE_WITHOUT_HOLDER_AND_TREASURY_BASIS"
    || zeroVersusUnknown?.expected?.cashReceivedGross?.value !== "0"
    || zeroVersusUnknown?.expected?.cashReceivedNet?.status !== "UNVERIFIABLE"
    || datedProceeds?.expected?.originalIssueProceeds?.asOf === datedProceeds?.expected?.conversionDateCashReceived?.asOf
    || datedProceeds?.expected?.conversionDateCashReceived?.value !== "0"
    || unresolvedCapital?.expected?.publicationDisposition !== "SUPPRESSED_REVIEW"
    || unresolvedCapital?.expected?.cashReceivedGross?.status !== "UNVERIFIABLE"
    || unresolvedCapital?.expected?.newSharesIssued?.status !== "UNVERIFIABLE";
  const capitalImpactArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingCapitalImpactIdsInArchitecture = requiredCapitalImpactIds.filter((id) => !capitalImpactArchitecture.includes(id));
  if (invalidCapitalImpactStructure || invalidCapitalImpactSafety || missingCapitalImpactIdsInArchitecture.length) {
    console.error(`Korean capital impact separation contract incomplete: ${[...(invalidCapitalImpactStructure ? ["fixture version/impact kind/data policy/vector IDs"] : []), ...(invalidCapitalImpactSafety ? ["cash/debt/share/supply/ratio/as-of separation assertions"] : []), ...missingCapitalImpactIdsInArchitecture].join(", ")}`);
    process.exit(1);
  }
  const financingTimelineFixturePath = join(root, "docs", "fixtures", "disclosure", "financing-timeline-scenarios.v0.json");
  const requiredFinancingTimelineIds = [
    "FTS-01-ISSUE-DATE-VS-CASH-DATE", "FTS-02-CB-WINDOW-VS-CONVERSION", "FTS-03-BW-DETACHED-RIGHT-TIMELINE",
    "FTS-04-EB-EXCHANGE-DELIVERY-RESTRICTION", "FTS-05-PROPOSED-LISTING-NOT-ACTUAL", "FTS-06-FULL-EXERCISE-CONDITIONAL-SCENARIO",
    "FTS-07-BW-CASH-OR-OFFSET-EXCLUSIVE", "FTS-08-PUT-REDEMPTION-FUTURE-OUTFLOW", "FTS-09-MATURITY-DATE-NO-SETTLEMENT",
    "FTS-10-CORRECTED-DATE-ONLY", "FTS-11-EVENT-SUBJECT-VS-UNDERLYING-SUBJECT", "FTS-12-SNAPSHOT-DATE-IMPACT-MISMATCH",
  ];
  let financingTimelineFixture;
  try {
    const fixtureSource = readFileSync(financingTimelineFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    financingTimelineFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Korean financing timeline fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const financingTimelineVectors = financingTimelineFixture?.vectors;
  const financingTimelineIds = Array.isArray(financingTimelineVectors) ? financingTimelineVectors.map((vector) => vector?.id) : [];
  const financingTimelineById = new Map(Array.isArray(financingTimelineVectors) ? financingTimelineVectors.map((vector) => [vector?.id, vector]) : []);
  const invalidFinancingTimelineStructure = financingTimelineFixture?.contractVersion !== "financing-timeline-scenarios.v0"
    || financingTimelineFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || financingTimelineFixture?.dataPolicy?.containsRealFiling !== false
    || financingTimelineFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || financingTimelineFixture?.dataPolicy?.containsSourceBody !== false
    || financingTimelineFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || financingTimelineIds.length !== requiredFinancingTimelineIds.length
    || new Set(financingTimelineIds).size !== financingTimelineIds.length
    || requiredFinancingTimelineIds.some((id) => !financingTimelineById.has(id))
    || financingTimelineVectors?.some((vector) => !vector?.input || !vector?.expected || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const issueCashDates = financingTimelineById.get("FTS-01-ISSUE-DATE-VS-CASH-DATE");
  const cbWindow = financingTimelineById.get("FTS-02-CB-WINDOW-VS-CONVERSION");
  const bwDetached = financingTimelineById.get("FTS-03-BW-DETACHED-RIGHT-TIMELINE");
  const ebRestriction = financingTimelineById.get("FTS-04-EB-EXCHANGE-DELIVERY-RESTRICTION");
  const proposedListing = financingTimelineById.get("FTS-05-PROPOSED-LISTING-NOT-ACTUAL");
  const fullExercise = financingTimelineById.get("FTS-06-FULL-EXERCISE-CONDITIONAL-SCENARIO");
  const bwBranches = financingTimelineById.get("FTS-07-BW-CASH-OR-OFFSET-EXCLUSIVE");
  const putRedemption = financingTimelineById.get("FTS-08-PUT-REDEMPTION-FUTURE-OUTFLOW");
  const maturity = financingTimelineById.get("FTS-09-MATURITY-DATE-NO-SETTLEMENT");
  const correctedDate = financingTimelineById.get("FTS-10-CORRECTED-DATE-ONLY");
  const splitSubjects = financingTimelineById.get("FTS-11-EVENT-SUBJECT-VS-UNDERLYING-SUBJECT");
  const mixedSnapshot = financingTimelineById.get("FTS-12-SNAPSHOT-DATE-IMPACT-MISMATCH");
  const invalidFinancingTimelineSafety = issueCashDates?.input?.issueResolutionDate === issueCashDates?.input?.paymentDate
    || issueCashDates?.expected?.cashImpactAsOf !== issueCashDates?.input?.cashReceiptDateEvidence
    || cbWindow?.input?.conversionWindowStart === cbWindow?.input?.actualExerciseDate
    || cbWindow?.expected?.windowStartIsNotExercise !== true
    || bwDetached?.input?.exerciseReportedDate !== null
    || bwDetached?.expected?.exercise !== "NOT_REPORTED"
    || ebRestriction?.expected?.publicSupplyPotentialDate !== ebRestriction?.input?.restrictionEnd
    || proposedListing?.expected?.listing !== "NOT_REPORTED"
    || proposedListing?.expected?.listingDateCertainty !== "ESTIMATED_OR_PROPOSED"
    || fullExercise?.expected?.actualShares?.value === fullExercise?.expected?.scenarioShares?.value
    || fullExercise?.expected?.scenarioShares?.status !== "CONDITIONAL"
    || bwBranches?.expected?.branchesAreMutuallyExclusive !== true
    || bwBranches?.expected?.cashReceivedActual !== "NOT_REPORTED"
    || putRedemption?.expected?.actualRedemption !== "NOT_REPORTED"
    || putRedemption?.expected?.cashOutflow?.status !== "CONDITIONAL_LIABILITY_SCENARIO"
    || maturity?.expected?.terminalStatus !== "OUTCOME_NOT_VERIFIED"
    || correctedDate?.expected?.sharesAddedAgain !== false
    || correctedDate?.expected?.exerciseSharesRemain !== correctedDate?.input?.exerciseShares
    || splitSubjects?.input?.bondIssuer === splitSubjects?.input?.underlyingIssuer
    || splitSubjects?.expected?.underlyingRecommendation !== "SUPPRESSED_MASTER_UNRESOLVED"
    || mixedSnapshot?.input?.dateSnapshot === mixedSnapshot?.input?.impactSnapshot
    || mixedSnapshot?.expected?.publicationDisposition !== "REJECT_RESPONSE"
    || mixedSnapshot?.expected?.timeline?.length !== 0
    || mixedSnapshot?.expected?.scenarioMetrics?.length !== 0;
  const financingTimelineArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingFinancingTimelineIdsInArchitecture = requiredFinancingTimelineIds.filter((id) => !financingTimelineArchitecture.includes(id));
  if (invalidFinancingTimelineStructure || invalidFinancingTimelineSafety || missingFinancingTimelineIdsInArchitecture.length) {
    console.error(`Korean financing timeline fixture contract incomplete: ${[...(invalidFinancingTimelineStructure ? ["fixture version/data policy/vector IDs"] : []), ...(invalidFinancingTimelineSafety ? ["dated cash, exercise, supply, conditional branch and snapshot safety assertions"] : []), ...missingFinancingTimelineIdsInArchitecture].join(", ")}`);
    process.exit(1);
  }
  const ds005FinancingFixturePath = join(root, "docs", "fixtures", "disclosure", "ds005-financing-field-acceptance.v0.json");
  const requiredDs005FinancingIds = [
    "DS5F-01-RECEIPT-EXACT-JOIN", "DS5F-02-BOARD-DATE-IS-NOT-CASH", "DS5F-03-PLANNED-PAYMENT-NOT-CASH-PROOF",
    "DS5F-04-MATURITY-NOT-SETTLEMENT", "DS5F-05-EXERCISE-CAPACITY-NOT-ACTUAL-SHARES", "DS5F-06-BW-SETTLEMENT-METHOD-NOT-OBSERVED-BRANCH",
    "DS5F-07-EB-EXCHANGE-NOT-DELIVERY-OR-SALE", "DS5F-08-ABSENT-FIELD-IS-NOT-ZERO", "DS5F-09-EXPLICIT-EMPTY-DIFFERS-FROM-OMITTED",
    "DS5F-10-STRUCTURED-VS-BODY-CONFLICT", "DS5F-11-CORRECTION-REVISION-NOT-DOUBLE-COUNT", "DS5F-12-DETAIL-RECEIPT-NOT-IN-DISCOVERY-DENOMINATOR",
  ];
  let ds005FinancingFixture;
  try {
    const fixtureSource = readFileSync(ds005FinancingFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    ds005FinancingFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Korean DS005 financing fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const ds005FinancingVectors = ds005FinancingFixture?.vectors;
  const ds005FinancingIds = Array.isArray(ds005FinancingVectors) ? ds005FinancingVectors.map((vector) => vector?.id) : [];
  const ds005FinancingById = new Map(Array.isArray(ds005FinancingVectors) ? ds005FinancingVectors.map((vector) => [vector?.id, vector]) : []);
  const ds005OfficialGuides = ds005FinancingFixture?.officialGuides;
  const invalidDs005FinancingStructure = ds005FinancingFixture?.contractVersion !== "ds005-financing-field-acceptance.v0"
    || ds005FinancingFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || ds005FinancingFixture?.dataPolicy?.containsRealFiling !== false
    || ds005FinancingFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || ds005FinancingFixture?.dataPolicy?.containsSourceBody !== false
    || ds005FinancingFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || ds005OfficialGuides?.CB?.guide !== "DS005/2020033" || ds005OfficialGuides?.CB?.api !== "cvbdIsDecsn.json"
    || ds005OfficialGuides?.BW?.guide !== "DS005/2020034" || ds005OfficialGuides?.BW?.api !== "bdwtIsDecsn.json"
    || ds005OfficialGuides?.EB?.guide !== "DS005/2020035" || ds005OfficialGuides?.EB?.api !== "exbdIsDecsn.json"
    || !["PRESENT", "EXPLICIT_EMPTY", "NOT_IN_RESPONSE_VERSION", "NOT_RETURNED", "PARSE_ERROR", "CONFLICT_WITH_BODY", "NOT_APPLICABLE"].every((state) => ds005FinancingFixture?.missingFieldStates?.includes(state))
    || ds005FinancingIds.length !== requiredDs005FinancingIds.length
    || new Set(ds005FinancingIds).size !== ds005FinancingIds.length
    || requiredDs005FinancingIds.some((id) => !ds005FinancingById.has(id))
    || ds005FinancingVectors?.some((vector) => !vector?.input || !vector?.expected || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const ds005ExactJoin = ds005FinancingById.get("DS5F-01-RECEIPT-EXACT-JOIN");
  const ds005BoardCash = ds005FinancingById.get("DS5F-02-BOARD-DATE-IS-NOT-CASH");
  const ds005PlannedCash = ds005FinancingById.get("DS5F-03-PLANNED-PAYMENT-NOT-CASH-PROOF");
  const ds005Maturity = ds005FinancingById.get("DS5F-04-MATURITY-NOT-SETTLEMENT");
  const ds005Capacity = ds005FinancingById.get("DS5F-05-EXERCISE-CAPACITY-NOT-ACTUAL-SHARES");
  const ds005BwSettlement = ds005FinancingById.get("DS5F-06-BW-SETTLEMENT-METHOD-NOT-OBSERVED-BRANCH");
  const ds005EbExchange = ds005FinancingById.get("DS5F-07-EB-EXCHANGE-NOT-DELIVERY-OR-SALE");
  const ds005AbsentField = ds005FinancingById.get("DS5F-08-ABSENT-FIELD-IS-NOT-ZERO");
  const ds005ExplicitEmpty = ds005FinancingById.get("DS5F-09-EXPLICIT-EMPTY-DIFFERS-FROM-OMITTED");
  const ds005Conflict = ds005FinancingById.get("DS5F-10-STRUCTURED-VS-BODY-CONFLICT");
  const ds005Correction = ds005FinancingById.get("DS5F-11-CORRECTION-REVISION-NOT-DOUBLE-COUNT");
  const ds005Coverage = ds005FinancingById.get("DS5F-12-DETAIL-RECEIPT-NOT-IN-DISCOVERY-DENOMINATOR");
  const invalidDs005FinancingSafety = ds005ExactJoin?.input?.listReceipt !== ds005ExactJoin?.input?.structuredReceipt
    || ds005ExactJoin?.input?.listCorpCode !== ds005ExactJoin?.input?.structuredCorpCode
    || ds005ExactJoin?.expected?.join !== "EXACT_RECEIPT_AND_ISSUER"
    || ds005BoardCash?.expected?.termsDate === ds005BoardCash?.expected?.cashImpactAsOf
    || ds005BoardCash?.expected?.cashReceived !== "NOT_REPORTED"
    || ds005PlannedCash?.expected?.cashReceived !== "NOT_REPORTED"
    || ds005Maturity?.expected?.terminalOutcome !== "NOT_VERIFIED"
    || ds005Capacity?.expected?.actualShares !== "NOT_REPORTED"
    || ds005BwSettlement?.expected?.settlement !== "NOT_REPORTED"
    || ds005EbExchange?.expected?.treasuryDelivered !== "NOT_REPORTED"
    || ds005EbExchange?.expected?.actualSale !== "NOT_REPORTED"
    || ds005AbsentField?.expected?.fieldState !== "NOT_RETURNED"
    || ds005AbsentField?.expected?.numericValue !== null
    || ds005ExplicitEmpty?.expected?.fieldState !== "EXPLICIT_EMPTY"
    || ds005Conflict?.expected?.fieldState !== "CONFLICT_WITH_BODY"
    || ds005Conflict?.expected?.cashEffect !== "SUPPRESSED_REVIEW"
    || ds005Correction?.expected?.actualCashReceived !== "NOT_REPORTED"
    || ds005Correction?.expected?.countedCash !== "0"
    || ds005Coverage?.expected?.coverage !== "PARTIAL"
    || ds005Coverage?.expected?.publication !== "SUPPRESS_ACTIVE_TIMELINE";
  const ds005Architecture = readFileSync(krArchitecturePath, "utf8");
  const missingDs005FinancingIdsInArchitecture = requiredDs005FinancingIds.filter((id) => !ds005Architecture.includes(id));
  const requiredDs005MappingTerms = ["structured field와 timeline claim 대조 contract 제안", "EXPLICIT_EMPTY", "NOT_RETURNED", "CONFLICT_WITH_BODY", "discovery coverage", "exact `rcept_no`", "2015년 이후"];
  const missingDs005MappingTerms = requiredDs005MappingTerms.filter((term) => !ds005Architecture.includes(term));
  if (invalidDs005FinancingStructure || invalidDs005FinancingSafety || missingDs005FinancingIdsInArchitecture.length || missingDs005MappingTerms.length) {
    console.error(`Korean DS005 financing field acceptance contract incomplete: ${[...(invalidDs005FinancingStructure ? ["fixture version/official guide map/data policy/vector IDs"] : []), ...(invalidDs005FinancingSafety ? ["exact receipt join/date-stage/missing-field/conflict/correction/coverage safety assertions"] : []), ...missingDs005FinancingIdsInArchitecture, ...missingDs005MappingTerms].join(", ")}`);
    process.exit(1);
  }
  const financingAdjudicationFixturePath = join(root, "docs", "fixtures", "disclosure", "financing-adjudication-package.v0.json");
  const requiredFinancingAdjudicationIds = [
    "FAP-01-SAMPLE-DENOMINATOR-KEEPS-UNAVAILABLE", "FAP-02-EXPLICIT-ZERO-REQUIRES-LOCATOR", "FAP-03-REVIEW-DISAGREEMENT-NEEDS-ADJUDICATOR",
    "FAP-04-UNRELATED-SAME-ISSUER-NOT-CORRECTION", "FAP-05-RIGHTS-BLOCKED-IS-NOT-CONTENT-PASS", "FAP-06-APPROVAL-STALE-AFTER-GUIDE-SHAPE-CHANGE",
    "FAP-07-RECEIPT-CARDINALITY-MISMATCH-INCOMPLETE", "FAP-08-PARTIAL-SCOPE-REVIEW-PRESERVES-UNRELATED-CLAIMS",
  ];
  let financingAdjudicationFixture;
  try {
    const fixtureSource = readFileSync(financingAdjudicationFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    financingAdjudicationFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Financing adjudication package fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const financingAdjudicationVectors = financingAdjudicationFixture?.vectors;
  const financingAdjudicationIds = Array.isArray(financingAdjudicationVectors) ? financingAdjudicationVectors.map((vector) => vector?.id) : [];
  const financingAdjudicationById = new Map(Array.isArray(financingAdjudicationVectors) ? financingAdjudicationVectors.map((vector) => [vector?.id, vector]) : []);
  const invalidFinancingAdjudicationStructure = financingAdjudicationFixture?.contractVersion !== "financing-adjudication-package.v0"
    || financingAdjudicationFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || financingAdjudicationFixture?.dataPolicy?.containsRealFiling !== false
    || financingAdjudicationFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || financingAdjudicationFixture?.dataPolicy?.containsSourceBody !== false
    || financingAdjudicationFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || !["RESOLVED_FOR_SCOPE", "PARTIAL", "UNRESOLVED", "RIGHTS_BLOCKED", "SOURCE_UNAVAILABLE", "REOPENED"].every((state) => financingAdjudicationFixture?.caseStates?.includes(state))
    || financingAdjudicationIds.length !== requiredFinancingAdjudicationIds.length
    || new Set(financingAdjudicationIds).size !== financingAdjudicationIds.length
    || requiredFinancingAdjudicationIds.some((id) => !financingAdjudicationById.has(id))
    || financingAdjudicationVectors?.some((vector) => !vector?.input || !vector?.expected || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const denominatorFap = financingAdjudicationById.get("FAP-01-SAMPLE-DENOMINATOR-KEEPS-UNAVAILABLE");
  const zeroLocatorFap = financingAdjudicationById.get("FAP-02-EXPLICIT-ZERO-REQUIRES-LOCATOR");
  const reviewerDisputeFap = financingAdjudicationById.get("FAP-03-REVIEW-DISAGREEMENT-NEEDS-ADJUDICATOR");
  const unrelatedCorrectionFap = financingAdjudicationById.get("FAP-04-UNRELATED-SAME-ISSUER-NOT-CORRECTION");
  const rightsBlockedFap = financingAdjudicationById.get("FAP-05-RIGHTS-BLOCKED-IS-NOT-CONTENT-PASS");
  const staleApprovalFap = financingAdjudicationById.get("FAP-06-APPROVAL-STALE-AFTER-GUIDE-SHAPE-CHANGE");
  const cardinalityFap = financingAdjudicationById.get("FAP-07-RECEIPT-CARDINALITY-MISMATCH-INCOMPLETE");
  const partialScopeFap = financingAdjudicationById.get("FAP-08-PARTIAL-SCOPE-REVIEW-PRESERVES-UNRELATED-CLAIMS");
  const invalidFinancingAdjudicationSafety = denominatorFap?.input?.selected !== denominatorFap?.input?.reviewed + denominatorFap?.input?.sourceUnavailable + denominatorFap?.input?.rightsBlocked + denominatorFap?.input?.notYetReviewed
    || denominatorFap?.expected?.selectedEqualsDispositionSum !== true
    || denominatorFap?.expected?.caseState !== "INCOMPLETE"
    || zeroLocatorFap?.expected?.zeroMeaning !== "SOURCE_EXPLICIT_ZERO_ONLY"
    || reviewerDisputeFap?.expected?.reviewState !== "DISPUTED"
    || reviewerDisputeFap?.expected?.caseState !== "UNRESOLVED"
    || unrelatedCorrectionFap?.expected?.relationDecision !== "UNRESOLVED"
    || unrelatedCorrectionFap?.expected?.correctionEdgeCreated !== false
    || rightsBlockedFap?.expected?.caseState !== "RIGHTS_BLOCKED"
    || rightsBlockedFap?.expected?.contentJudgment !== "NOT_RUN"
    || staleApprovalFap?.expected?.priorApproval !== "EXPIRED_FOR_AFFECTED_SCOPE"
    || staleApprovalFap?.expected?.newReviewRequired !== true
    || cardinalityFap?.expected?.caseState !== "INCOMPLETE"
    || partialScopeFap?.expected?.unrelatedSuppression !== false
    || partialScopeFap?.expected?.claimB !== "SUPPRESSED";
  const adjudicationArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingFinancingAdjudicationIdsInArchitecture = requiredFinancingAdjudicationIds.filter((id) => !adjudicationArchitecture.includes(id));
  const requiredAdjudicationTerms = ["실제 filing adjudication package 제안", "samplingManifest", "sourceObservation", "fieldJudgment[]", "relationJudgment[]", "reviewRound[]", "caseDisposition", "N_rights_blocked", "작성자 자기승인"];
  const missingAdjudicationTerms = requiredAdjudicationTerms.filter((term) => !adjudicationArchitecture.includes(term));
  if (invalidFinancingAdjudicationStructure || invalidFinancingAdjudicationSafety || missingFinancingAdjudicationIdsInArchitecture.length || missingAdjudicationTerms.length) {
    console.error(`Financing adjudication package contract incomplete: ${[...(invalidFinancingAdjudicationStructure ? ["fixture version/data policy/state/vector IDs"] : []), ...(invalidFinancingAdjudicationSafety ? ["denominator/zero/disagreement/relation/rights/staleness/cardinality/scope assertions"] : []), ...missingFinancingAdjudicationIdsInArchitecture, ...missingAdjudicationTerms].join(", ")}`);
    process.exit(1);
  }
  const financingTraceFixturePath = join(root, "docs", "fixtures", "disclosure", "financing-claim-review-trace.v0.json");
  const requiredFinancingTraceIds = [
    "FCT-01-COMPLETE-DATE-TRACE", "FCT-02-MISSING-EDGE-SUPPRESSES-DEPENDENTS", "FCT-03-REVOCATION-INVALIDATES-CASH-MEASURE",
    "FCT-04-CLASS-CHANGE-INVALIDATES-SHARE-CHILD", "FCT-05-SCENARIO-INPUT-STALE-RECOMPUTE", "FCT-06-UI-API-CANONICAL-PARITY",
    "FCT-07-BODY-NOT-RETAINABLE-REQUIRES-REACQUIRE", "FCT-08-MIXED-EPOCH-REJECTS-RESPONSE",
    "FCT-09-NUMERIC-EFFECT-REPRODUCES-FROM-CLAIM-REVISIONS", "FCT-10-BASIS-MISMATCH-BLOCKS-NUMERIC-EFFECT-TRACE",
    "FCT-11-REVIEWED-FORMULA-OUTPUT-MUST-MATCH-UI-AND-API-HASH",
    "FCT-12-ROUNDED-DISPLAY-REQUIRES-APPROVED-POLICY", "FCT-13-CURRENCY-MIX-REQUIRES-EXPLICIT-FX-CLAIM",
    "FCT-14-NONPOSITIVE-DENOMINATOR-BLOCKS-RATIO", "FCT-15-MISSING-COST-IS-NOT-ZERO-NET-CASH",
    "FCT-16-ARITHMETIC-OVERFLOW-DOES-NOT-PUBLISH-PARTIAL-OR-STALE-RESULT",
    "FCT-17-EPS-REQUIRES-PERIOD-WEIGHTED-AVERAGE-SHARES", "FCT-18-PLANNED-ISSUED-AND-LISTED-SHARES-ARE-DIFFERENT-STAGES",
    "FCT-19-FX-CONVERSION-REQUIRES-METRIC-PURPOSE-AND-RATE-DATE",
  ];
  let financingTraceFixture;
  try {
    const fixtureSource = readFileSync(financingTraceFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    financingTraceFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Financing claim review trace fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const financingTraceVectors = financingTraceFixture?.vectors;
  const financingTraceIds = Array.isArray(financingTraceVectors) ? financingTraceVectors.map((vector) => vector?.id) : [];
  const financingTraceById = new Map(Array.isArray(financingTraceVectors) ? financingTraceVectors.map((vector) => [vector?.id, vector]) : []);
  const requiredTraceStages = ["SOURCE_REVISION", "FIELD_OR_RELATION_JUDGMENT", "REVIEWER_DECISION", "CLAIM_REVISION", "CALCULATION_FORMULA_REVISION", "EFFECT_OR_ANALYSIS_REVISION", "IMPACT_CONSUMER", "ELIGIBILITY_AND_RIGHTS", "PUBLICATION_SNAPSHOT"];
  const invalidFinancingTraceStructure = financingTraceFixture?.contractVersion !== "financing-claim-review-trace.v0"
    || financingTraceFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || financingTraceFixture?.dataPolicy?.containsRealFiling !== false
    || financingTraceFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || financingTraceFixture?.dataPolicy?.containsSourceBody !== false
    || financingTraceFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || financingTraceFixture?.numericPolicy?.representation !== "DECIMAL_STRING_OR_EXACT_RATIONAL"
    || financingTraceFixture?.numericPolicy?.binaryFloatForFinancialCalculation !== "FORBIDDEN"
    || financingTraceFixture?.numericPolicy?.missingBlankAndExplicitZero !== "DISTINCT_STATES"
    || financingTraceFixture?.numericPolicy?.currencyConversion !== "EXPLICIT_FX_CLAIM_AND_AS_OF_REQUIRED"
    || financingTraceFixture?.numericPolicy?.aggregation !== "EXACT_BEFORE_DISPLAY_ROUNDING"
    || financingTraceFixture?.numericPolicy?.displayRounding !== "OWNER_APPROVED_VERSIONED_POLICY_ONLY"
    || financingTraceFixture?.numericPolicy?.ratioDenominator !== "FORMULA_TYPED_DENOMINATOR_DOMAIN_REQUIRED"
    || financingTraceFixture?.numericPolicy?.epsDenominator !== "PERIOD_WEIGHTED_AVERAGE_ORDINARY_SHARES_AND_DILUTION_BASIS_REQUIRED"
    || financingTraceFixture?.numericPolicy?.shareQuantityStage !== "PLANNED_ISSUED_LISTED_SETTLED_ARE_SEPARATE_CLAIMS"
    || financingTraceFixture?.numericPolicy?.fxPurposeAndRateDate !== "METRIC_PURPOSE_AND_RATE_DATE_REQUIRED"
    || financingTraceFixture?.numericPolicy?.overflow !== "CALCULATION_OVERFLOW_NO_PARTIAL_OR_STALE_FALLBACK"
    || financingTraceFixture?.numericPolicy?.numericRangeThreshold !== "NOT_SET_UNTIL_OWNER_APPROVAL"
    || !requiredTraceStages.every((stage) => financingTraceFixture?.traceStages?.includes(stage))
    || financingTraceIds.length !== requiredFinancingTraceIds.length
    || new Set(financingTraceIds).size !== financingTraceIds.length
    || requiredFinancingTraceIds.some((id) => !financingTraceById.has(id))
    || financingTraceVectors?.some((vector) => !vector?.input || !vector?.expected || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const completeTrace = financingTraceById.get("FCT-01-COMPLETE-DATE-TRACE");
  const missingTraceEdge = financingTraceById.get("FCT-02-MISSING-EDGE-SUPPRESSES-DEPENDENTS");
  const rightsRevokedTrace = financingTraceById.get("FCT-03-REVOCATION-INVALIDATES-CASH-MEASURE");
  const unresolvedInstrumentTrace = financingTraceById.get("FCT-04-CLASS-CHANGE-INVALIDATES-SHARE-CHILD");
  const staleScenarioTrace = financingTraceById.get("FCT-05-SCENARIO-INPUT-STALE-RECOMPUTE");
  const parityTrace = financingTraceById.get("FCT-06-UI-API-CANONICAL-PARITY");
  const unretainedBodyTrace = financingTraceById.get("FCT-07-BODY-NOT-RETAINABLE-REQUIRES-REACQUIRE");
  const mixedEpochTrace = financingTraceById.get("FCT-08-MIXED-EPOCH-REJECTS-RESPONSE");
  const reproducibleNumericTrace = financingTraceById.get("FCT-09-NUMERIC-EFFECT-REPRODUCES-FROM-CLAIM-REVISIONS");
  const mismatchedBasisNumericTrace = financingTraceById.get("FCT-10-BASIS-MISMATCH-BLOCKS-NUMERIC-EFFECT-TRACE");
  const mismatchedOutputHashTrace = financingTraceById.get("FCT-11-REVIEWED-FORMULA-OUTPUT-MUST-MATCH-UI-AND-API-HASH");
  const unapprovedRoundingTrace = financingTraceById.get("FCT-12-ROUNDED-DISPLAY-REQUIRES-APPROVED-POLICY");
  const currencyMismatchTrace = financingTraceById.get("FCT-13-CURRENCY-MIX-REQUIRES-EXPLICIT-FX-CLAIM");
  const nonpositiveDenominatorTrace = financingTraceById.get("FCT-14-NONPOSITIVE-DENOMINATOR-BLOCKS-RATIO");
  const missingNetCostTrace = financingTraceById.get("FCT-15-MISSING-COST-IS-NOT-ZERO-NET-CASH");
  const arithmeticOverflowTrace = financingTraceById.get("FCT-16-ARITHMETIC-OVERFLOW-DOES-NOT-PUBLISH-PARTIAL-OR-STALE-RESULT");
  const epsDenominatorTrace = financingTraceById.get("FCT-17-EPS-REQUIRES-PERIOD-WEIGHTED-AVERAGE-SHARES");
  const shareStageTrace = financingTraceById.get("FCT-18-PLANNED-ISSUED-AND-LISTED-SHARES-ARE-DIFFERENT-STAGES");
  const fxPurposeTrace = financingTraceById.get("FCT-19-FX-CONVERSION-REQUIRES-METRIC-PURPOSE-AND-RATE-DATE");
  const numericTraceClaims = new Map((reproducibleNumericTrace?.input?.claimSet ?? []).map((claim) => [claim?.claimId, claim]));
  const numericS0 = BigInt(numericTraceClaims.get("CLAIM-S0")?.value ?? "0");
  const numericT0 = BigInt(numericTraceClaims.get("CLAIM-T0")?.value ?? "0");
  const numericN = BigInt(numericTraceClaims.get("CLAIM-N")?.value ?? "0");
  const numericDenominator = numericS0 - numericT0 + numericN;
  const gcd = (left, right) => { let a = left < 0n ? -left : left; let b = right < 0n ? -right : right; while (b !== 0n) [a, b] = [b, a % b]; return a; };
  const numericDivisor = gcd(numericN, numericDenominator);
  const numericExactValue = numericDivisor > 0n ? `${numericN / numericDivisor}/${numericDenominator / numericDivisor}` : null;
  const numericInputsShareBasis = new Set((reproducibleNumericTrace?.input?.claimSet ?? []).map((claim) => `${claim?.unit}|${claim?.securityClass}|${claim?.basisAsOf}`)).size === 1;
  const invalidFinancingTraceSafety = !isDeepStrictEqual(completeTrace?.input?.linkedStages, requiredTraceStages)
    || completeTrace?.expected?.traceGap !== false
    || missingTraceEdge?.expected?.dependentPublication !== "SUPPRESSED"
    || missingTraceEdge?.expected?.unrelatedConsumerRetained !== true
    || rightsRevokedTrace?.expected?.cashMeasure !== "SUPPRESSED"
    || unresolvedInstrumentTrace?.expected?.issuerASharePublication !== "SUPPRESSED"
    || staleScenarioTrace?.expected?.scenarioPublication !== "SUPPRESSED_UNTIL_NEW_REVISION"
    || parityTrace?.expected?.parity !== "PASS_FOR_FIXTURE"
    || unretainedBodyTrace?.expected?.sourceDisposition !== "SOURCE_REACQUIRE_REQUIRED"
    || mixedEpochTrace?.expected?.response !== "REJECT_RESPONSE"
    || mixedEpochTrace?.expected?.fallbackToOldApprovedBody !== false
    || reproducibleNumericTrace?.input?.formula?.expression !== "N / ((S0 - T0) + N)"
    || reproducibleNumericTrace?.expected?.intermediate?.preEventOutstandingExcludingTreasury !== "9000000"
    || !numericInputsShareBasis
    || numericS0 - numericT0 !== 9000000n
    || numericDenominator !== 10000000n
    || numericExactValue !== "1/10"
    || reproducibleNumericTrace?.expected?.measure?.numerator !== "1000000"
    || reproducibleNumericTrace?.expected?.measure?.denominator !== "10000000"
    || reproducibleNumericTrace?.expected?.measure?.exactValue !== numericExactValue
    || reproducibleNumericTrace?.expected?.calculationStatus !== "CONDITIONAL_SCENARIO"
    || reproducibleNumericTrace?.expected?.calculationOutputHash !== reproducibleNumericTrace?.expected?.reviewedOutputHash
    || reproducibleNumericTrace?.expected?.reviewedOutputHash !== reproducibleNumericTrace?.expected?.uiOutputHash
    || reproducibleNumericTrace?.expected?.uiOutputHash !== reproducibleNumericTrace?.expected?.apiOutputHash
    || mismatchedBasisNumericTrace?.input?.claimSet?.find((claim) => claim.claimId === "CLAIM-S0")?.basisAsOf === mismatchedBasisNumericTrace?.input?.claimSet?.find((claim) => claim.claimId === "CLAIM-T0")?.basisAsOf
    || mismatchedBasisNumericTrace?.expected?.calculationStatus !== "NOT_COMPUTABLE"
    || mismatchedBasisNumericTrace?.expected?.dependentPublication !== "SUPPRESSED"
    || mismatchedOutputHashTrace?.expected?.response !== "REJECT_RESPONSE"
    || mismatchedOutputHashTrace?.expected?.fallbackToPriorApprovedOutput !== false
    || unapprovedRoundingTrace?.expected?.exactValue !== "1/3"
    || unapprovedRoundingTrace?.expected?.roundedDisplay !== "WITHHELD_POLICY_UNAPPROVED"
    || unapprovedRoundingTrace?.expected?.eventPublication !== "MAY_PROCEED_WITHOUT_THIS_METRIC"
    || currencyMismatchTrace?.expected?.calculationStatus !== "NOT_COMPUTABLE"
    || currencyMismatchTrace?.expected?.fxRateInferred !== false
    || nonpositiveDenominatorTrace?.expected?.blockedDenominators?.join(",") !== "0,-1"
    || nonpositiveDenominatorTrace?.expected?.ratio !== null
    || missingNetCostTrace?.expected?.missingFeeCoercedToZero !== false
    || missingNetCostTrace?.expected?.explicitZeroTaxPreserved !== true
    || missingNetCostTrace?.expected?.netValue !== null
    || arithmeticOverflowTrace?.expected?.calculationStatus !== "CALCULATION_OVERFLOW"
    || arithmeticOverflowTrace?.expected?.partialIntermediatePublished !== false
    || arithmeticOverflowTrace?.expected?.priorOutputFallback !== false
    || epsDenominatorTrace?.input?.metricFamily !== "EPS"
    || epsDenominatorTrace?.input?.requestedShortcut !== "ENDING_SHARES"
    || epsDenominatorTrace?.expected?.calculationStatus !== "NOT_COMPUTABLE"
    || epsDenominatorTrace?.expected?.endingSharesSubstituted !== false
    || epsDenominatorTrace?.expected?.weightedAverageOrdinaryShares !== null
    || shareStageTrace?.expected?.plannedEqualsIssued !== false
    || shareStageTrace?.expected?.issuedEqualsListed !== false
    || shareStageTrace?.expected?.partialStageQuantitiesRetainedSeparately !== true
    || fxPurposeTrace?.input?.fxClaim?.rateAsOf !== null
    || fxPurposeTrace?.expected?.calculationStatus !== "NOT_COMPUTABLE"
    || fxPurposeTrace?.expected?.fxClaimAccepted !== false
    || fxPurposeTrace?.expected?.spotRateInferredFromCurrentQuote !== false;
  const traceArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingFinancingTraceIdsInArchitecture = requiredFinancingTraceIds.filter((id) => !traceArchitecture.includes(id));
  const requiredTraceTerms = ["Claim-to-review traceability matrix 제안", "sourceRevisionHash", "reviewer decision revision", "publication epoch/snapshot", "canonical payload hash", "권리 승인", "CALCULATION_FORMULA_REVISION", "source observation/revision hash/locator", "formula ID/revision", "가정 및 `AS_FILED_FACT/CONDITIONAL_SCENARIO` 구분", "exactOutputHash", "N/O1=1/10", "BASIS_DATE_MISMATCH", "input/reviewer/output/eligibility/rights/publication hash 중 하나라도 다르면 전체 response를 거부", "exactOutputHash", "immutable reviewed output/snapshot", "IEEE-754 binary floating point를 금융 산식/합계에 쓰지 않는다", "명시 FX claim", "명시한 zero는 zero claim으로 보존", "전체 exact input에 수행한 다음 화면에서만 rounding", "Denominator 검사는 formula registry의 typed domain", "engine range/scale threshold는 owner가 별도로 정하기 전 임의 숫자를 사용하지 않는다", "CALCULATION_OVERFLOW", "IAS 33", "IAS 21", "IAS 32", "기간가중평균 보통주 denominator", "PLANNED_NOT_ISSUED", "FCT-12-ROUNDED-DISPLAY-REQUIRES-APPROVED-POLICY", "FCT-13-CURRENCY-MIX-REQUIRES-EXPLICIT-FX-CLAIM", "FCT-14-NONPOSITIVE-DENOMINATOR-BLOCKS-RATIO", "FCT-15-MISSING-COST-IS-NOT-ZERO-NET-CASH", "FCT-16-ARITHMETIC-OVERFLOW-DOES-NOT-PUBLISH-PARTIAL-OR-STALE-RESULT", "FCT-17-EPS-REQUIRES-PERIOD-WEIGHTED-AVERAGE-SHARES", "FCT-18-PLANNED-ISSUED-AND-LISTED-SHARES-ARE-DIFFERENT-STAGES", "FCT-19-FX-CONVERSION-REQUIRES-METRIC-PURPOSE-AND-RATE-DATE"];
  const missingTraceTerms = requiredTraceTerms.filter((term) => !traceArchitecture.includes(term));
  if (invalidFinancingTraceStructure || invalidFinancingTraceSafety || missingFinancingTraceIdsInArchitecture.length || missingTraceTerms.length) {
    console.error(`Financing claim review trace contract incomplete: ${[...(invalidFinancingTraceStructure ? ["fixture version/data policy/stage IDs/vector IDs"] : []), ...(invalidFinancingTraceSafety ? ["lineage/invalidation/rights/eligibility/scenario/parity/snapshot assertions"] : []), ...missingFinancingTraceIdsInArchitecture, ...missingTraceTerms].join(", ")}`);
    process.exit(1);
  }
  const factCorrectionRemediationFixturePath = join(root, "docs", "fixtures", "disclosure", "fact-correction-remediation.v0.json");
  const disclosureRightsSurfaceInventoryPath = join(root, "docs", "fixtures", "disclosure", "disclosure-rights-surface-inventory.v0.json");
  let disclosureRightsSurfaceInventory;
  try {
    const source = readFileSync(disclosureRightsSurfaceInventoryPath, "utf8");
    assertUniqueJsonObjectKeys(source);
    disclosureRightsSurfaceInventory = JSON.parse(source);
  } catch (error) {
    console.error(`Disclosure rights surface inventory invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredRightsSurfaceIds = ["DART_RSS_TODAY_FEED", "OPENDART_LIST_AUTOMATION", "OPENDART_VIEWER_LINK", "OPENDART_CONTRACT_DETAIL", "KIND_PUBLIC_RSS"];
  const rightsSurfaceById = new Map((disclosureRightsSurfaceInventory?.surfaces ?? []).map((surface) => [surface?.surfaceId, surface]));
  const invalidRightsSurfaceInventory = disclosureRightsSurfaceInventory?.contractVersion !== "disclosure-rights-surface-inventory.v0"
    || disclosureRightsSurfaceInventory?.classification !== "REPOSITORY_CALL_GRAPH_INVENTORY_NOT_LEGAL_PERMISSION"
    || disclosureRightsSurfaceInventory?.sourcePolicy?.rightsApproval !== "NONE"
    || disclosureRightsSurfaceInventory?.sourcePolicy?.unmappedActionsDefault !== "UNRESOLVED_AND_BLOCKED"
    || disclosureRightsSurfaceInventory?.sourcePolicy?.sourceProductsDoNotInheritRights !== true
    || !isDeepStrictEqual([...rightsSurfaceById.keys()].sort(), [...requiredRightsSurfaceIds].sort())
    || (disclosureRightsSurfaceInventory?.surfaces ?? []).some((surface) => !surface.codeEvidence?.length
      || !surface.product
      || !surface.officialLocator
      || Object.values(surface.actions ?? {}).some((state) => state !== "UNRESOLVED"));
  if (invalidRightsSurfaceInventory) {
    console.error("Disclosure rights surface inventory must cover the registered repository surfaces without granting rights.");
    process.exit(1);
  }
  const openDartOfficialEvidencePath = join(root, "docs", "fixtures", "disclosure", "opendart-official-evidence.v0.json");
  let openDartOfficialEvidence;
  try {
    const source = readFileSync(openDartOfficialEvidencePath, "utf8");
    assertUniqueJsonObjectKeys(source);
    openDartOfficialEvidence = JSON.parse(source);
  } catch (error) {
    console.error(`OpenDART official evidence snapshot invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredOpenDartEvidenceIds = ["ODART-TERMS-10-16-23", "ODART-LIST-GUIDE-2019001", "ODART-OVERVIEW-ORIGINAL-XML"];
  const openDartEvidenceById = new Map((openDartOfficialEvidence?.observations ?? []).map((item) => [item?.id, item]));
  const invalidOpenDartOfficialEvidence = openDartOfficialEvidence?.contractVersion !== "opendart-official-evidence.v0"
    || openDartOfficialEvidence?.classification !== "OFFICIAL_SOURCE_OBSERVATION_NOT_RIGHTS_DECISION"
    || openDartOfficialEvidence?.dataPolicy?.containsSourceBody !== false
    || openDartOfficialEvidence?.dataPolicy?.containsCredential !== false
    || openDartOfficialEvidence?.dataPolicy?.grantsAnyAction !== false
    || openDartOfficialEvidence?.dataPolicy?.rightsDecision !== "UNRESOLVED"
    || !isDeepStrictEqual([...openDartEvidenceById.keys()].sort(), [...requiredOpenDartEvidenceIds].sort())
    || (openDartOfficialEvidence?.observations ?? []).some((item) => !item.officialLocator
      || !item.observedFacts?.length
      || !item.notEstablished?.length
      || item.rightsState !== "UNRESOLVED")
    || openDartEvidenceById.get("ODART-LIST-GUIDE-2019001")?.observedEndpoint !== "GET /api/list.json or /api/list.xml"
    || !openDartEvidenceById.get("ODART-LIST-GUIDE-2019001")?.observedFields?.includes("rcept_no");
  if (invalidOpenDartOfficialEvidence) {
    console.error("OpenDART official evidence must retain source facts without granting rights.");
    process.exit(1);
  }
  const disclosureInvestmentEvidenceGatePath = join(root, "docs", "fixtures", "disclosure", "disclosure-investment-evidence-gate.v0.json");
  let disclosureInvestmentEvidenceGate;
  try {
    const source = readFileSync(disclosureInvestmentEvidenceGatePath, "utf8");
    assertUniqueJsonObjectKeys(source);
    disclosureInvestmentEvidenceGate = JSON.parse(source);
  } catch (error) {
    console.error(`Disclosure investment evidence gate invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredInvestmentEvidenceVectorIds = [
    "DIEG-01-TITLE-ONLY-POSITIVE-IS-NOT-CLAIM", "DIEG-02-BODY-FETCH-DENIED-KEEPS-METADATA-AND-ANALYSIS-SEPARATE",
    "DIEG-03-UNLOCATABLE-BODY-ASSERTION-IS-UNVERIFIED", "DIEG-04-REPORTED-ZERO-AND-MISSING-DATA-DIFFER",
    "DIEG-05-QUANTIFIED-EFFECT-REQUIRES-BASIS-AND-DENOMINATOR", "DIEG-06-POSITIVE-CONTRACT-FACT-COEXISTS-WITH-TERMINATION-RISK",
    "DIEG-07-SUBMITTER-AND-AFFECTED-ISSUER-ARE-SEPARATE", "DIEG-08-CORRECTION-INVALIDATES-DEPENDENT-APPROVAL",
    "DIEG-09-PRICE-MOVE-IS-NOT-CAUSAL-EVIDENCE", "DIEG-10-SECURITY-CLASS-AND-DILUTION-RISK-ARE-EXPLICIT",
    "DIEG-11-REVIEWED-EFFECT-REQUIRES-ALL-DEPENDENCY-GATES",
    "DIEG-12-ONE-RECEIPT-MULTIPLE-EVENTS-KEEP-SEPARATE-EVIDENCE-GROUPS",
    "DIEG-13-LEGACY-TITLE-JUDGMENT-IS-NOT-PROMOTED-TO-REVIEW",
    "DIEG-14-COMPANY-WATCHLIST-DOES-NOT-CREATE-EVENT-SUBSCRIPTION",
  ];
  const disclosureInvestmentEvidenceVectorIds = (disclosureInvestmentEvidenceGate?.vectors ?? []).map((vector) => vector?.id);
  const invalidDisclosureInvestmentEvidenceGate = disclosureInvestmentEvidenceGate?.contractVersion !== "disclosure-investment-evidence-gate.v0"
    || disclosureInvestmentEvidenceGate?.classification !== "SYNTHETIC_PRODUCT_ACCEPTANCE_NOT_RUNTIME_EVIDENCE_OR_INVESTMENT_ADVICE"
    || disclosureInvestmentEvidenceGate?.dataPolicy?.containsRealFiling !== false
    || disclosureInvestmentEvidenceGate?.dataPolicy?.containsRealIssuerOrTicker !== false
    || disclosureInvestmentEvidenceGate?.dataPolicy?.containsRealPricesOrFinancialValues !== false
    || disclosureInvestmentEvidenceGate?.dataPolicy?.containsSourceBody !== false
    || !isDeepStrictEqual([...disclosureInvestmentEvidenceVectorIds].sort(), [...requiredInvestmentEvidenceVectorIds].sort())
    || new Set(disclosureInvestmentEvidenceVectorIds).size !== requiredInvestmentEvidenceVectorIds.length
    || Object.values(disclosureInvestmentEvidenceGate?.invariants ?? {}).some((value) => value !== true)
    || !disclosureInvestmentEvidenceGate?.requiredClaimDimensions?.includes("evidenceLocator")
    || !disclosureInvestmentEvidenceGate?.requiredClaimDimensions?.includes("counterEvidenceRefs")
    || !disclosureInvestmentEvidenceGate?.requiredQuantitativeDimensions?.includes("denominatorClaimRef")
    || disclosureInvestmentEvidenceGate?.invariants?.oneReceiptMayContainMultipleEventAndHorizonScopedClaimGroups !== true
    || disclosureInvestmentEvidenceGate?.invariants?.legacyTitleJudgmentIsNotInvestmentReview !== true
    || disclosureInvestmentEvidenceGate?.invariants?.companyWatchlistDoesNotImplyEventSubscription !== true
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-12-ONE-RECEIPT-MULTIPLE-EVENTS-KEEP-SEPARATE-EVIDENCE-GROUPS")?.expected?.eventScopedEvidenceGroups !== 2
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-12-ONE-RECEIPT-MULTIPLE-EVENTS-KEEP-SEPARATE-EVIDENCE-GROUPS")?.expected?.eventClaimsMerged !== false
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-12-ONE-RECEIPT-MULTIPLE-EVENTS-KEEP-SEPARATE-EVIDENCE-GROUPS")?.expected?.singleNetDirection !== "NOT_INFERRED"
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-12-ONE-RECEIPT-MULTIPLE-EVENTS-KEEP-SEPARATE-EVIDENCE-GROUPS")?.expected?.sourceReceiptCountUsedAsEventCount !== false
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-13-LEGACY-TITLE-JUDGMENT-IS-NOT-PROMOTED-TO-REVIEW")?.expected?.analysisStatus !== "NOT_CREATED"
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-13-LEGACY-TITLE-JUDGMENT-IS-NOT-PROMOTED-TO-REVIEW")?.expected?.historicalRevisionRewritten !== false
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-14-COMPANY-WATCHLIST-DOES-NOT-CREATE-EVENT-SUBSCRIPTION")?.expected?.eventSubscriptionCreated !== false
    || disclosureInvestmentEvidenceGate?.vectors?.find((vector) => vector?.id === "DIEG-14-COMPANY-WATCHLIST-DOES-NOT-CREATE-EVENT-SUBSCRIPTION")?.expected?.eventNotificationEligible !== false
    || !disclosureInvestmentEvidenceGate?.sourceBasis?.some((item) => item.url === "https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001")
    || !disclosureInvestmentEvidenceGate?.sourceBasis?.some((item) => item.url === "https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003");
  if (invalidDisclosureInvestmentEvidenceGate) {
    console.error("Disclosure investment evidence gate must keep all 14 title/body/claim/risk/multi-event/legacy/watchlist cases and required evidence dimensions.");
    process.exit(1);
  }
  const disclosureInvestmentEvidenceArchitecture = readFileSync(join(root, "docs", "architecture", "kr-disclosure-event-architecture.md"), "utf8");
  if (!disclosureInvestmentEvidenceArchitecture.includes("disclosure-investment-evidence-gate.v0.json")
    || !disclosureInvestmentEvidenceArchitecture.includes("`DIEG-01`–`DIEG-14`")
    || !disclosureInvestmentEvidenceArchitecture.includes("`TITLE_SIGNAL_ONLY`")) {
    console.error("Disclosure investment evidence gate must be linked to the architecture and title-only signal contract.");
    process.exit(1);
  }
  const disclosureInvestmentGoldSetProtocolPath = join(root, "docs", "fixtures", "disclosure", "disclosure-investment-gold-set-protocol.v0.json");
  let disclosureInvestmentGoldSetProtocol;
  try {
    const source = readFileSync(disclosureInvestmentGoldSetProtocolPath, "utf8");
    assertUniqueJsonObjectKeys(source);
    disclosureInvestmentGoldSetProtocol = JSON.parse(source);
  } catch (error) {
    console.error(`Disclosure investment gold set protocol invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredGoldSetProtocolVectorIds = [
    "DIGSP-01-RIGHTS-UNRESOLVED-BLOCKS-BODY-REVIEW", "DIGSP-02-UNAVAILABLE-ROW-REMAINS-IN-DENOMINATOR",
    "DIGSP-03-OPEN-DART-PAGINATION-IS-NOT-SNAPSHOT-PROOF", "DIGSP-04-SAMPLING-SEED-AND-FRAME-FROZEN-BEFORE-OUTPUT",
    "DIGSP-05-REVIEWER-DISAGREEMENT-REQUIRES-ADJUDICATOR", "DIGSP-06-MAJORITY-VOTE-DOES-NOT-REPLACE-ADJUDICATION",
    "DIGSP-07-SAMPLE-SIZE-AND-THRESHOLD-ARE-OWNER-DECISIONS", "DIGSP-08-EXPLICIT-OUT-OF-SCOPE-STAYS-COUNTED",
    "DIGSP-09-CORRECTION-REVISION-STALES-GOLD-LABEL", "DIGSP-10-GOLD-LABELS-DO-NOT-LEAK-COPYRIGHTED-BODY",
    "DIGSP-11-MULTI-EVENT-FILING-IS-LABELED-PER-EVENT-AND-PARTY-ROLE", "DIGSP-12-CONTRADICTORY-EVENTS-ON-ONE-INSTRUMENT-ARE-NOT-NETTED",
  ];
  const goldSetProtocolVectorIds = (disclosureInvestmentGoldSetProtocol?.vectors ?? []).map((vector) => vector?.id);
  const invalidGoldSetProtocol = disclosureInvestmentGoldSetProtocol?.contractVersion !== "disclosure-investment-gold-set-protocol.v0"
    || disclosureInvestmentGoldSetProtocol?.classification !== "SYNTHETIC_REVIEW_PROTOCOL_NOT_REAL_SAMPLE_OR_ACCEPTANCE_RESULT"
    || disclosureInvestmentGoldSetProtocol?.dataPolicy?.containsRealFiling !== false
    || disclosureInvestmentGoldSetProtocol?.dataPolicy?.containsSourceBody !== false
    || disclosureInvestmentGoldSetProtocol?.ownerDecisions?.sampleSizePerStratum !== "NOT_SET_BY_OWNER"
    || disclosureInvestmentGoldSetProtocol?.ownerDecisions?.acceptanceThresholds !== "NOT_SET_BY_OWNER"
    || !isDeepStrictEqual([...goldSetProtocolVectorIds].sort(), [...requiredGoldSetProtocolVectorIds].sort())
    || new Set(goldSetProtocolVectorIds).size !== requiredGoldSetProtocolVectorIds.length
    || Object.values(disclosureInvestmentGoldSetProtocol?.acceptanceRules ?? {}).some((value) => value !== true)
    || disclosureInvestmentGoldSetProtocol?.vectors?.find((vector) => vector?.id === "DIGSP-11-MULTI-EVENT-FILING-IS-LABELED-PER-EVENT-AND-PARTY-ROLE")?.expected?.filingLevelSingleTicker !== false
    || disclosureInvestmentGoldSetProtocol?.vectors?.find((vector) => vector?.id === "DIGSP-11-MULTI-EVENT-FILING-IS-LABELED-PER-EVENT-AND-PARTY-ROLE")?.expected?.submitterRolePromotedToAffectedIssuer !== false
    || disclosureInvestmentGoldSetProtocol?.vectors?.find((vector) => vector?.id === "DIGSP-12-CONTRADICTORY-EVENTS-ON-ONE-INSTRUMENT-ARE-NOT-NETTED")?.expected?.singleNetDirection !== "NOT_INFERRED"
    || disclosureInvestmentGoldSetProtocol?.vectors?.find((vector) => vector?.id === "DIGSP-12-CONTRADICTORY-EVENTS-ON-ONE-INSTRUMENT-ARE-NOT-NETTED")?.expected?.buySellInstruction !== "NONE"
    || !disclosureInvestmentGoldSetProtocol?.samplingFrame?.officialMetadataFieldsForStratification?.includes("pblntf_ty")
    || !disclosureInvestmentGoldSetProtocol?.samplingFrame?.officialMetadataFieldsForStratification?.includes("pblntf_detail_ty")
    || disclosureInvestmentGoldSetProtocol?.evidenceRetention?.ifRightsUnresolvedOrDenied?.includes("Do not fetch or inspect body") !== true;
  if (invalidGoldSetProtocol) {
    console.error("Disclosure investment gold set protocol must preserve its 12 review cases, owner-controlled thresholds, and rights/denominator gates.");
    process.exit(1);
  }
  const goldSetProtocolArchitecturePath = join(root, "docs", "architecture", "kr-disclosure-event-architecture.md");
  const goldSetProtocolArchitecture = readFileSync(goldSetProtocolArchitecturePath, "utf8");
  if (!goldSetProtocolArchitecture.includes("disclosure-investment-gold-set-protocol.v0.json")
    || !goldSetProtocolArchitecture.includes("`DIGSP-01`–`DIGSP-12`")) {
    console.error("Disclosure investment gold set protocol must be linked from the architecture.");
    process.exit(1);
  }
  const disclosureInvestmentDossierProjectionPath = join(root, "docs", "fixtures", "disclosure", "disclosure-investment-dossier-projection.v0.json");
  let disclosureInvestmentDossierProjection;
  try {
    const source = readFileSync(disclosureInvestmentDossierProjectionPath, "utf8");
    assertUniqueJsonObjectKeys(source);
    disclosureInvestmentDossierProjection = JSON.parse(source);
  } catch (error) {
    console.error(`Disclosure investment dossier projection invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredDossierProjectionVectorIds = [
    "DIDP-01-TITLE-SIGNAL-ONLY-SHOWS-NO-INVESTMENT-CLAIM", "DIDP-02-RISK-NOT-ASSESSED-IS-NOT-NO-RISK",
    "DIDP-03-NO-RISK-FOUND-REQUIRES-DECLARED-COVERAGE", "DIDP-04-RIGHTS-BLOCKED-DISTINCT-FROM-SOURCE-UNAVAILABLE",
    "DIDP-05-COUNTEREVIDENCE-IS-NOT-HIDDEN-IN-FOOTNOTE", "DIDP-06-CONFLICT-DOES-NOT-PICK-LATEST-VALUE",
    "DIDP-07-UNRESOLVED-ISSUER-DOES-NOT-SHOW-TICKER", "DIDP-08-DERIVED-PERCENT-REQUIRES-DENOMINATOR-BASIS",
    "DIDP-09-PUBLICATION-SUPPRESSION-DOES-NOT-PARTIALLY-RETURN-DOSSIER", "DIDP-10-REVISION-AND-SNAPSHOT-MIX-REJECTED",
    "DIDP-11-CONFIDENCE-IS-NOT-EVENT-PROBABILITY", "DIDP-12-ACCESSIBLE-STATUS-DOES-NOT-RELY-ON-COLOR",
    "DIDP-13-CAPITAL-MOVEMENT-AND-EXCHANGE-ACTION-ARE-SEPARATE", "DIDP-14-AUDIT-SIGNAL-DOES-NOT-BECOME-CAPITAL-CHANGE",
    "DIDP-15-INCOMPLETE-ISSUER-STATUS-COVERAGE-BLOCKS-CLEAR-HEADLINE", "DIDP-16-DOSSIER-REQUIRES-CAPITAL-AND-STATUS-SNAPSHOT-PARITY",
    "DIDP-17-RESOLUTION-DOES-NOT-ERASE-HISTORIC-RISK-OR-CAPITAL", "DIDP-18-NONCOMMON-INSTRUMENT-DOES-NOT-LEAK-INTO-COMMON-STOCK-DOSSIER",
    "DIDP-19-ISSUER-FACT-IS-LABELED-CONTEXT-ON-INSTRUMENT-DOSSIER", "DIDP-20-SERIES-CAPITAL-STATE-DOES-NOT-APPEAR-ON-ALL-ISSUER-SERIES",
    "DIDP-21-ISSUER-WIDE-AUDIT-OPINION-DOES-NOT-PROPAGATE-TO-SUBSIDIARY", "DIDP-22-INSTRUMENT-FILTER-AND-ISSUER-CONTEXT-ARE-EXPLICIT",
    "DIDP-23-OVERLAPPING-TEMPORAL-ALIASES-SUPPRESS-ONLY-AFFECTED-SUBJECT", "DIDP-24-MULTI-INSTRUMENT-RESPONSE-DECLARES-SUBJECT-COVERAGE",
    "DIDP-25-CONFLICT-AND-UNKNOWN-HAVE-DISTINCT-USER-STATUS", "DIDP-26-CLAIM-STATUS-CARD-EXPOSES-WHY-CONCLUSION-IS-HELD",
    "DIDP-27-FILER-ONLY-CLAIM-REMAINS-ISSUER-CONTEXT", "DIDP-28-UNRESOLVED-ATTRIBUTION-DOES-NOT-LOOK-LIKE-NO-RESULT",
    "DIDP-29-RIGHTS-BLOCKED-ATTRIBUTION-WITHHOLDS-CONTENT", "DIDP-30-POLICY-AND-REVIEW-QUEUE-DETAILS-ARE-NOT-PUBLIC",
    "DIDP-31-STALE-OR-INCOMPLETE-ATTRIBUTION-SUPPRESSES-SUMMARY", "DIDP-32-API-AND-UI-USE-SAME-PROJECTION-SNAPSHOT",
    "DIDP-33-EXPORT-PRESERVES-WITHHELD-AND-COVERAGE-STATE", "DIDP-34-NOTIFICATION-REVALIDATES-CURRENT-EPOCH-AND-OPT-IN",
    "DIDP-35-CACHE-AND-CURSOR-REJECT-REVOKED-PROJECTION", "DIDP-36-LEGACY-EXPORT-ALERTS-ARE-NOT-V2-DOSSIER-PROJECTIONS",
    "DIDP-37-EXPORT-COVERAGE-REFERENCES-EXACT-SOURCE-SCOPE-MANIFESTS", "DIDP-38-EMPTY-SOURCE-SCOPE-REQUIRES-CURRENT-RECONCILIATION-MANIFEST",
    "DIDP-39-RIGHTS-OR-IDENTITY-REVISION-INVALIDATES-COVERAGE-CLAIM", "DIDP-40-PUBLIC-COVERAGE-MESSAGES-DO-NOT-OVERSTATE-SCOPE",
    "DIDP-41-MASTER-CLASS-CORRECTION-INVALIDATES-ELIGIBILITY-AND-REOPENS-DOSSIER", "DIDP-42-CAP-FRESHNESS-OR-FX-SCOPE-FAILURE-SUPPRESSES-DOMESTIC-ELIGIBILITY",
    "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS",
    "DIDP-44-REPLAY-RECOVERY-REQUIRES-NEW-APPROVAL-AND-CONSUMER-SNAPSHOT",
    "DIDP-45-CONCURRENT-REPLAY-PUBLICATION-USES-ONE-IDEMPOTENT-SNAPSHOT",
    "DIDP-46-RIGHTS-REVOCATION-BEFORE-DISPATCH-SUPPRESSES-ALL-CURRENT-SURFACES",
    "DIDP-47-RIGHTS-REGRANT-REQUIRES-NEW-ANALYSIS-REVIEW-AND-SUBSCRIPTION-GATES",

  ];
  const dossierProjectionVectorIds = (disclosureInvestmentDossierProjection?.vectors ?? []).map((vector) => vector?.id);
  const dossierRenderingRules = disclosureInvestmentDossierProjection?.renderingRules ?? {};
  const requiredAttributionHoldProjectionReasons = ["FILER_ONLY", "PARTY_ROLE_UNRESOLVED", "DIRECT_IMPACT_EVIDENCE_MISSING", "CLAIM_LOCATOR_UNAVAILABLE", "ENTITY_CROSSWALK_UNRESOLVED", "INSTRUMENT_CROSSWALK_UNRESOLVED", "POLICY_DECISION_OPEN", "ASSERTION_REVIEW_PENDING", "CONFLICTING_PARTIES_OR_CLAIMS", "SOURCE_RIGHTS_UNRESOLVED", "ELIGIBILITY_UNRESOLVED", "DEPENDENCY_SNAPSHOT_STALE", "IMPACT_DENOMINATOR_INCOMPLETE"];
  const attributionHoldProjection = disclosureInvestmentDossierProjection?.claimAttributionHoldProjection ?? {};
  const consumerSurfaceParity = disclosureInvestmentDossierProjection?.consumerSurfaceParity ?? {};
  const sourceCoverageBinding = disclosureInvestmentDossierProjection?.sourceCoverageBinding ?? {};
  const expectedDossierConsumerSurfaces = ["PUBLIC_API", "DOSSIER_UI", "USER_EXPORT", "NOTIFICATION", "CACHE_OR_CURSOR"];
  const dossierConsumerSurfaceById = new Map((consumerSurfaceParity?.surfaces ?? []).map((surface) => [surface?.id, surface]));
  const requiredDossierSurfaceBindings = {
    PUBLIC_API: ["snapshotId", "publicationEpoch", "rightsDecisionSetHash"],
    DOSSIER_UI: ["projectionSnapshotId", "publicationEpoch", "rightsDecisionSetHash"],
    USER_EXPORT: ["projectionSnapshotId", "publicationEpoch", "rightsDecisionSetHash", "sourceCoverage"],
    NOTIFICATION: ["eventRevisionId", "subscriptionRevision", "notificationPolicyRevision", "publicationEpoch"],
    CACHE_OR_CURSOR: ["snapshotId", "cursorScopeHash", "publicationEpoch", "rightsDecisionSetHash"],
  };
  const invalidDossierProjection = disclosureInvestmentDossierProjection?.contractVersion !== "disclosure-investment-dossier-projection.v0"
    || disclosureInvestmentDossierProjection?.classification !== "SYNTHETIC_USER_DOSSIER_PROJECTION_NOT_RUNTIME_DTO_OR_INVESTMENT_ADVICE"
    || disclosureInvestmentDossierProjection?.dataPolicy?.containsRealFiling !== false
    || disclosureInvestmentDossierProjection?.dataPolicy?.containsSourceBody !== false
    || !isDeepStrictEqual([...dossierProjectionVectorIds].sort(), [...requiredDossierProjectionVectorIds].sort())
    || new Set(dossierProjectionVectorIds).size !== requiredDossierProjectionVectorIds.length
    || Object.values(dossierRenderingRules).some((value) => value !== true)
    || requiredAttributionHoldProjectionReasons.some((reason) => !attributionHoldProjection[reason]
      || typeof attributionHoldProjection[reason]?.publicStatus !== "string"
      || typeof attributionHoldProjection[reason]?.subjectProjection !== "string"
      || attributionHoldProjection[reason]?.exposeInternalReasonCode !== false
      || attributionHoldProjection[reason]?.exposeReviewerOrPolicyIdentity !== false)
    || Object.keys(attributionHoldProjection).length !== requiredAttributionHoldProjectionReasons.length
    || consumerSurfaceParity?.statusSource !== "claimAttributionHoldProjection"
    || consumerSurfaceParity?.legacyDisposition !== "LEGACY_SURFACES_ARE_NOT_V2_DOSSIER_CONSUMERS"
    || !isDeepStrictEqual((consumerSurfaceParity?.surfaces ?? []).map((surface) => surface?.id).sort(), [...expectedDossierConsumerSurfaces].sort())
    || (consumerSurfaceParity?.surfaces ?? []).some((surface) => surface?.revalidateAtUse !== true || surface?.internalHoldCodesExposed !== false || surface?.staleFallback !== false || !Array.isArray(surface?.bindingFields) || surface.bindingFields.length === 0)
    || Object.entries(requiredDossierSurfaceBindings).some(([surfaceId, fields]) => fields.some((field) => !dossierConsumerSurfaceById.get(surfaceId)?.bindingFields?.includes(field)))
    || dossierConsumerSurfaceById.get("PUBLIC_API")?.contractRef !== "disclosure-dossier-public-read.v0"
    || dossierConsumerSurfaceById.get("NOTIFICATION")?.contractRef !== "disclosure-user-event-subscription.v0"
    || dossierConsumerSurfaceById.get("CACHE_OR_CURSOR")?.contractRef !== "disclosure-dossier-public-read.v0"
    || !disclosureInvestmentDossierProjection?.canonicalClaimFieldCrosswalk?.claimText?.includes("FactClaim.text")
    || !disclosureInvestmentDossierProjection?.canonicalClaimFieldCrosswalk?.evidenceRelation?.includes("SUPPORTS | CONTRADICTS | CONTEXT")
    || !disclosureInvestmentDossierProjection?.emptyAndBlockedStateMap?.RIGHTS_BLOCKED?.includes("content judgment is NOT_RUN")
    || !disclosureInvestmentDossierProjection?.projectionEnvelope?.requiredSameSnapshotFields?.includes("publicationEpoch")
    || !disclosureInvestmentDossierProjection?.sections?.some((section) => section.id === "SUPPORTING_AND_CONTRADICTING_EVIDENCE")
    || !disclosureInvestmentDossierProjection?.sections?.some((section) => section.id === "RISKS_AND_UNKNOWNS")
    || !disclosureInvestmentDossierProjection?.sections?.some((section) => section.id === "ISSUER_CAPITAL_STATE")
    || !disclosureInvestmentDossierProjection?.projectionEnvelope?.requiredSameSnapshotFields?.includes("issuerRiskStateRevisionId")
    || disclosureInvestmentDossierProjection?.renderingRules?.capitalMovementDoesNotImplyFinancialDistressOrExchangeAction !== true
    || disclosureInvestmentDossierProjection?.renderingRules?.currentIssuerStatusRequiresAuthorityAndCoverage !== true
    || disclosureInvestmentDossierProjection?.sections?.filter((section) => ["ISSUER_CAPITAL_STATE", "ISSUER_RISK_AND_MARKET_STATUS"].includes(section.id)).length !== 2
    || !disclosureInvestmentDossierProjection?.projectionEnvelope?.requiredSameSnapshotFields?.includes("subjectApplicabilityRevisionId")
    || disclosureInvestmentDossierProjection?.applicabilityContract?.levels?.length !== 4
    || disclosureInvestmentDossierProjection?.applicabilityContract?.scopeRule?.includes("never implies instrument applicability") !== true
    || disclosureInvestmentDossierProjection?.renderingRules?.issuerContextIsNeverRenderedAsInstrumentClaim !== true
    || disclosureInvestmentDossierProjection?.renderingRules?.everyRenderedClaimDeclaresApplicabilityScope !== true
    || disclosureInvestmentDossierProjection?.renderingRules?.conflictAndCoverageUnknownRenderAsDistinctStatuses !== true
    || disclosureInvestmentDossierProjection?.renderingRules?.conflictOrUnknownSuppressesDirectionalSummary !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-25-CONFLICT-AND-UNKNOWN-HAVE-DISTINCT-USER-STATUS")?.expected?.statusesDiffer !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-25-CONFLICT-AND-UNKNOWN-HAVE-DISTINCT-USER-STATUS")?.expected?.directionalSummary !== "NOT_PUBLISHED"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-25-CONFLICT-AND-UNKNOWN-HAVE-DISTINCT-USER-STATUS")?.expected?.netScore !== "NOT_COMPUTED"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-26-CLAIM-STATUS-CARD-EXPOSES-WHY-CONCLUSION-IS-HELD")?.expected?.priorAnalysisFallback !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-26-CLAIM-STATUS-CARD-EXPOSES-WHY-CONCLUSION-IS-HELD")?.expected?.buySellInstruction !== "NONE"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-27-FILER-ONLY-CLAIM-REMAINS-ISSUER-CONTEXT")?.expected?.affectedTickerPublished !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-28-UNRESOLVED-ATTRIBUTION-DOES-NOT-LOOK-LIKE-NO-RESULT")?.expected?.notFoundInScope !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-28-UNRESOLVED-ATTRIBUTION-DOES-NOT-LOOK-LIKE-NO-RESULT")?.expected?.negativeConclusion !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-29-RIGHTS-BLOCKED-ATTRIBUTION-WITHHOLDS-CONTENT")?.expected?.contentJudgment !== "NOT_RUN"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-29-RIGHTS-BLOCKED-ATTRIBUTION-WITHHOLDS-CONTENT")?.expected?.priorRevisionFallback !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-30-POLICY-AND-REVIEW-QUEUE-DETAILS-ARE-NOT-PUBLIC")?.expected?.reviewerIdentityExposed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-30-POLICY-AND-REVIEW-QUEUE-DETAILS-ARE-NOT-PUBLIC")?.expected?.policyDecisionIdentityExposed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-31-STALE-OR-INCOMPLETE-ATTRIBUTION-SUPPRESSES-SUMMARY")?.expected?.completenessClaim !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-31-STALE-OR-INCOMPLETE-ATTRIBUTION-SUPPRESSES-SUMMARY")?.expected?.directionalSummary !== "NOT_PUBLISHED"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-32-API-AND-UI-USE-SAME-PROJECTION-SNAPSHOT")?.expected?.projectionParity !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-32-API-AND-UI-USE-SAME-PROJECTION-SNAPSHOT")?.expected?.staleFallback !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-33-EXPORT-PRESERVES-WITHHELD-AND-COVERAGE-STATE")?.expected?.omittedSubjectsTreatedAsNoResult !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-33-EXPORT-PRESERVES-WITHHELD-AND-COVERAGE-STATE")?.expected?.internalReasonCodeExposed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-34-NOTIFICATION-REVALIDATES-CURRENT-EPOCH-AND-OPT-IN")?.expected?.dispatchAllowed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-34-NOTIFICATION-REVALIDATES-CURRENT-EPOCH-AND-OPT-IN")?.expected?.affectedTickerIncluded !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-35-CACHE-AND-CURSOR-REJECT-REVOKED-PROJECTION")?.expected?.cacheUsedAsCurrent !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-35-CACHE-AND-CURSOR-REJECT-REVOKED-PROJECTION")?.expected?.http304Allowed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-36-LEGACY-EXPORT-ALERTS-ARE-NOT-V2-DOSSIER-PROJECTIONS")?.expected?.legacyDataPromotedToApprovedDossier !== false
    || sourceCoverageBinding?.status !== "PROPOSED_SYNTHETIC_BINDING_NOT_RUNTIME_DTO"
    || sourceCoverageBinding?.contractRef !== "disclosure-source-coverage.v0.json#/coverageAssertionManifestContract"
    || sourceCoverageBinding?.queryScopeNormalizationRef !== "disclosure-source-coverage.v0.json#/queryScopeNormalizationContract"
    || sourceCoverageBinding?.publicStatusMappingRef !== "disclosure-dossier-public-read.v0.json#/negativeEvidenceContract/publicCoverageStatusMapping"
    || sourceCoverageBinding?.publicVocabularyRef !== "disclosure-dossier-public-read.v0.json#/negativeEvidenceContract/publicCoverageMessageKo"
    || sourceCoverageBinding?.notRuntimeProof !== true
    || !sourceCoverageBinding?.requiredFields?.includes("manifestDigest")
    || !sourceCoverageBinding?.requiredFields?.includes("rightsDecisionSetHash")
    || !sourceCoverageBinding?.requiredFields?.includes("subjectApplicabilityRevisionId")
    || !sourceCoverageBinding?.requiredFields?.includes("correctionWatermarkAsOf")
    || !sourceCoverageBinding?.negativeEvidenceRule?.includes("exact requested source/query/window/subject scope")
    || !sourceCoverageBinding?.publicStatusRule?.includes("publicCoverageStatusMapping")
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-37-EXPORT-COVERAGE-REFERENCES-EXACT-SOURCE-SCOPE-MANIFESTS")?.expected?.overallCoverage !== "PARTIAL"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-37-EXPORT-COVERAGE-REFERENCES-EXACT-SOURCE-SCOPE-MANIFESTS")?.expected?.omittedSubjectsTreatedAsNoResult !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-38-EMPTY-SOURCE-SCOPE-REQUIRES-CURRENT-RECONCILIATION-MANIFEST")?.expected?.publicNegativeEvidence !== "UNVERIFIABLE"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-38-EMPTY-SOURCE-SCOPE-REQUIRES-CURRENT-RECONCILIATION-MANIFEST")?.expected?.repeatObservedStablePromotedToProviderComplete !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-39-RIGHTS-OR-IDENTITY-REVISION-INVALIDATES-COVERAGE-CLAIM")?.expected?.coverageCurrent !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-39-RIGHTS-OR-IDENTITY-REVISION-INVALIDATES-COVERAGE-CLAIM")?.expected?.staleDossierFallback !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-40-PUBLIC-COVERAGE-MESSAGES-DO-NOT-OVERSTATE-SCOPE")?.expected?.publicStatus !== "UNVERIFIABLE"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-40-PUBLIC-COVERAGE-MESSAGES-DO-NOT-OVERSTATE-SCOPE")?.expected?.notFoundInScope !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-40-PUBLIC-COVERAGE-MESSAGES-DO-NOT-OVERSTATE-SCOPE")?.expected?.internalStateExposed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-41-MASTER-CLASS-CORRECTION-INVALIDATES-ELIGIBILITY-AND-REOPENS-DOSSIER")?.expected?.currentEligibility !== "INELIGIBLE"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-41-MASTER-CLASS-CORRECTION-INVALIDATES-ELIGIBILITY-AND-REOPENS-DOSSIER")?.expected?.currentPublicDescendantActive !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-41-MASTER-CLASS-CORRECTION-INVALIDATES-ELIGIBILITY-AND-REOPENS-DOSSIER")?.expected?.historicalAssertionMutated !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-42-CAP-FRESHNESS-OR-FX-SCOPE-FAILURE-SUPPRESSES-DOMESTIC-ELIGIBILITY")?.expected?.domesticCapEligibility !== "UNVERIFIED"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-42-CAP-FRESHNESS-OR-FX-SCOPE-FAILURE-SUPPRESSES-DOMESTIC-ELIGIBILITY")?.expected?.tickerOrDossierPublicationAllowed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-42-CAP-FRESHNESS-OR-FX-SCOPE-FAILURE-SUPPRESSES-DOMESTIC-ELIGIBILITY")?.expected?.fxConvertedValuePublished !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS")?.expected?.analysisLineageState !== "STALE_INPUT_REVISION"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS")?.expected?.priceResultCurrentView !== "SUPPRESSED"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS")?.expected?.directionalSummaryOrInvestmentScore !== "NOT_PUBLISHED"
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS")?.expected?.allConsumersRevalidateSameLineageAndEpoch !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS")?.expected?.notificationDispatchAllowed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS")?.expected?.unrelatedRawFactRunInvalidated !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-43-PRICE-REVISION-INVALIDATES-DEPENDENT-DOSSIER-RESULTS-ACROSS-CONSUMERS")?.expected?.priorProjectionUsedAsCurrentFallback !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-44-REPLAY-RECOVERY-REQUIRES-NEW-APPROVAL-AND-CONSUMER-SNAPSHOT")?.expected?.priorRunAndApprovalMutatedOrInherited !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-44-REPLAY-RECOVERY-REQUIRES-NEW-APPROVAL-AND-CONSUMER-SNAPSHOT")?.expected?.currentProjectionBindsNewRunAndReview !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-44-REPLAY-RECOVERY-REQUIRES-NEW-APPROVAL-AND-CONSUMER-SNAPSHOT")?.expected?.allConsumersShareSnapshotAndEpoch !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-44-REPLAY-RECOVERY-REQUIRES-NEW-APPROVAL-AND-CONSUMER-SNAPSHOT")?.expected?.publicationEpochAdvanceExactlyOnce !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-44-REPLAY-RECOVERY-REQUIRES-NEW-APPROVAL-AND-CONSUMER-SNAPSHOT")?.expected?.duplicateLogicalNotification !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-44-REPLAY-RECOVERY-REQUIRES-NEW-APPROVAL-AND-CONSUMER-SNAPSHOT")?.expected?.staleFallbackOrPartialConsumerPublication !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-45-CONCURRENT-REPLAY-PUBLICATION-USES-ONE-IDEMPOTENT-SNAPSHOT")?.expected?.oneCurrentProjectionSnapshot !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-45-CONCURRENT-REPLAY-PUBLICATION-USES-ONE-IDEMPOTENT-SNAPSHOT")?.expected?.oneEpochAdvance !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-45-CONCURRENT-REPLAY-PUBLICATION-USES-ONE-IDEMPOTENT-SNAPSHOT")?.expected?.allConsumersObserveSameSnapshotAndEpoch !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-45-CONCURRENT-REPLAY-PUBLICATION-USES-ONE-IDEMPOTENT-SNAPSHOT")?.expected?.oneLogicalNotification !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-45-CONCURRENT-REPLAY-PUBLICATION-USES-ONE-IDEMPOTENT-SNAPSHOT")?.expected?.lastWriteWins !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-46-RIGHTS-REVOCATION-BEFORE-DISPATCH-SUPPRESSES-ALL-CURRENT-SURFACES")?.expected?.currentApiUiExportCacheProjectionSuppressed !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-46-RIGHTS-REVOCATION-BEFORE-DISPATCH-SUPPRESSES-ALL-CURRENT-SURFACES")?.expected?.queuedNotificationDispatch !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-46-RIGHTS-REVOCATION-BEFORE-DISPATCH-SUPPRESSES-ALL-CURRENT-SURFACES")?.expected?.priorDeliveryExposureAssumedRetracted !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-46-RIGHTS-REVOCATION-BEFORE-DISPATCH-SUPPRESSES-ALL-CURRENT-SURFACES")?.expected?.deliveryReconciliationRequired !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-46-RIGHTS-REVOCATION-BEFORE-DISPATCH-SUPPRESSES-ALL-CURRENT-SURFACES")?.expected?.oldSnapshotFallbackOr304Allowed !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-47-RIGHTS-REGRANT-REQUIRES-NEW-ANALYSIS-REVIEW-AND-SUBSCRIPTION-GATES")?.expected?.priorProjectionOrApprovalResurrected !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-47-RIGHTS-REGRANT-REQUIRES-NEW-ANALYSIS-REVIEW-AND-SUBSCRIPTION-GATES")?.expected?.newAnalysisReviewAndProjectionRequired !== true
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-47-RIGHTS-REGRANT-REQUIRES-NEW-ANALYSIS-REVIEW-AND-SUBSCRIPTION-GATES")?.expected?.notificationDispatchWithoutCurrentOptIn !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-47-RIGHTS-REGRANT-REQUIRES-NEW-ANALYSIS-REVIEW-AND-SUBSCRIPTION-GATES")?.expected?.priorDeliveryRecordRewrittenAsRetracted !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-47-RIGHTS-REGRANT-REQUIRES-NEW-ANALYSIS-REVIEW-AND-SUBSCRIPTION-GATES")?.expected?.regrantSatisfiesIndependentOpenGates !== false
    || disclosureInvestmentDossierProjection?.vectors?.find((vector) => vector?.id === "DIDP-36-LEGACY-EXPORT-ALERTS-ARE-NOT-V2-DOSSIER-PROJECTIONS")?.expected?.silentLegacyRouteMutation !== false;
  const dossierProjectionArchitecturePath = join(root, "docs", "architecture", "kr-disclosure-event-architecture.md");
  const dossierProjectionArchitecture = readFileSync(dossierProjectionArchitecturePath, "utf8");
  if (invalidDossierProjection
    || !dossierProjectionArchitecture.includes("disclosure-investment-dossier-projection.v0.json")
    || !dossierProjectionArchitecture.includes("`DIDP-01`–`DIDP-47`")
    || !dossierProjectionArchitecture.includes("Dossier consumer surface parity")
    || !dossierProjectionArchitecture.includes("DIDP-32~36")
    || !dossierProjectionArchitecture.includes("DIDP-37–DIDP-39")
    || !dossierProjectionArchitecture.includes("DIDP-40")
    || !dossierProjectionArchitecture.includes("DIDP-41")
    || !dossierProjectionArchitecture.includes("DIDP-42")
    || !dossierProjectionArchitecture.includes("DIDP-43")
    || !dossierProjectionArchitecture.includes("DIDP-44")
    || !dossierProjectionArchitecture.includes("DIDP-45")
    || !dossierProjectionArchitecture.includes("DIDP-46")
    || !dossierProjectionArchitecture.includes("DIDP-47")
    || !dossierProjectionArchitecture.includes("Query scope 정규화와 공개 coverage 문구")
    || !dossierProjectionArchitecture.includes("source/query/window/subject 범위")
    || !dossierProjectionArchitecture.includes("`OBSERVED_STABLE`")
    || !dossierProjectionArchitecture.includes("기존 raw-data export와 분리")
    || !dossierProjectionArchitecture.includes("v2 parity를 증명하지 않음")
    || !dossierProjectionArchitecture.includes("stale-if-error fallback을 허용하지 않는다")) {
    console.error("Disclosure investment dossier projection must align with canonical claim/evidence fields and all 43 explicit-rendering cases.");
    process.exit(1);
  }
  const evidenceGapFollowupPath = join(root, "docs", "fixtures", "disclosure", "investment-evidence-gap-followup.v0.json");
  let evidenceGapFollowup;
  try {
    const source = readFileSync(evidenceGapFollowupPath, "utf8");
    assertUniqueJsonObjectKeys(source);
    evidenceGapFollowup = JSON.parse(source);
  } catch (error) {
    console.error(`Investment evidence gap follow-up contract invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredEvidenceGapVectorIds = [
    "EGA-01-KNOWN-DENOMINATOR-GAP-SHOWS-RESOLUTION-CONDITION",
    "EGA-02-PARTIAL-COVERAGE-DOES-NOT-PROMISE-NEGATIVE-ANSWER",
    "EGA-03-UNRESOLVED-RIGHTS-WITHHOLDS-SOURCE-ACTION",
    "EGA-04-NO-VERIFIED-SOURCE-DOES-NOT-INVENT-A-FOLLOWUP",
    "EGA-05-DEPENDENCY-REVISION-SUPERSEDES-OLD-GAP-PLAN",
    "EGA-06-GAP-CARD-DOES-NOT-IMPLY-NOTIFICATION-OPT-IN",
  ];
  const evidenceGapVectorIds = (evidenceGapFollowup?.vectors ?? []).map((vector) => vector?.id);
  const invalidEvidenceGapFollowup = evidenceGapFollowup?.contractVersion !== "investment-evidence-gap-followup.v0"
    || evidenceGapFollowup?.classification !== "SYNTHETIC_PRODUCT_ACCEPTANCE_NOT_RUNTIME_EVIDENCE_OR_INVESTMENT_ADVICE"
    || evidenceGapFollowup?.dataPolicy?.containsRealFiling !== false
    || evidenceGapFollowup?.dataPolicy?.containsRealIssuerOrTicker !== false
    || evidenceGapFollowup?.dataPolicy?.containsSourceBody !== false
    || !isDeepStrictEqual([...evidenceGapVectorIds].sort(), [...requiredEvidenceGapVectorIds].sort())
    || new Set(evidenceGapVectorIds).size !== requiredEvidenceGapVectorIds.length
    || !["gapId", "blockedClaimRefs", "questionKey", "declaredScopeRef", "rightsDisposition", "coverageDisposition", "resolutionPredicate", "planState", "notificationOptInRef"].every((field) => evidenceGapFollowup?.requiredGapFields?.includes(field))
    || Object.values(evidenceGapFollowup?.invariants ?? {}).some((value) => value !== true)
    || evidenceGapFollowup?.vectors?.find((vector) => vector?.id === "EGA-02-PARTIAL-COVERAGE-DOES-NOT-PROMISE-NEGATIVE-ANSWER")?.expected?.notFoundInScope !== false
    || evidenceGapFollowup?.vectors?.find((vector) => vector?.id === "EGA-03-UNRESOLVED-RIGHTS-WITHHOLDS-SOURCE-ACTION")?.expected?.actionableSourceLink !== false
    || evidenceGapFollowup?.vectors?.find((vector) => vector?.id === "EGA-04-NO-VERIFIED-SOURCE-DOES-NOT-INVENT-A-FOLLOWUP")?.expected?.futureDateInvented !== false
    || evidenceGapFollowup?.vectors?.find((vector) => vector?.id === "EGA-05-DEPENDENCY-REVISION-SUPERSEDES-OLD-GAP-PLAN")?.expected?.priorPlanState !== "SUPERSEDED"
    || evidenceGapFollowup?.vectors?.find((vector) => vector?.id === "EGA-06-GAP-CARD-DOES-NOT-IMPLY-NOTIFICATION-OPT-IN")?.expected?.notificationScheduled !== false;
  if (invalidEvidenceGapFollowup
    || !dossierProjectionArchitecture.includes("investment-evidence-gap-followup.v0.json")
    || !dossierProjectionArchitecture.includes("검증 공백 카드")
    || !dossierProjectionArchitecture.includes("`EGA-01`–`EGA-06`")) {
    console.error("Investment evidence gap follow-up must preserve rights, coverage, revision, and opt-in boundaries in all six vectors.");
    process.exit(1);
  }
  let dossierPublicReadContract;
  try {
    const source = readFileSync(join(root, "docs", "fixtures", "disclosure", "disclosure-dossier-public-read.v0.json"), "utf8");
    assertUniqueJsonObjectKeys(source);
    dossierPublicReadContract = JSON.parse(source);
  } catch (error) {
    console.error(`Disclosure dossier public read contract invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredDossierPublicReadVectorIds = [
    "DPR-01-PUBLIC-GET-IS-READ-ONLY-AND-UNAUTHENTICATED", "DPR-02-LEGACY-V1-CONTRACT-IS-UNCHANGED",
    "DPR-03-INSTRUMENT-FILTER-EXCLUDES-ISSUER-CONTEXT-BY-DEFAULT", "DPR-04-EXPLICIT-ISSUER-CONTEXT-IS-LABELED-AND-COUNTED-SEPARATELY",
    "DPR-05-SERIES-MOVEMENT-DOES-NOT-LEAK-ACROSS-TRANCHE", "DPR-06-PARTIAL-SUBJECT-ELIGIBILITY-REPORTS-WITHHELD-DENOMINATOR",
    "DPR-07-SAME-ISSUER-ID-DOES-NOT-PROVE-INSTRUMENT-APPLICABILITY", "DPR-08-UNKNOWN-OR-EXTRA-QUERY-PARAMETER-IS-REJECTED",
    "DPR-09-CURSOR-CANNOT-REPLAY-ANOTHER-FILTER-OR-ROUTE", "DPR-10-MUTATION-DURING-PAGING-KEEPS-SNAPSHOT-OR-RESTARTS",
    "DPR-11-REVOCATION-SUPPRESSES-ROWS-AND-304", "DPR-12-STALE-MASTER-OR-CAP-IS-NOT-ELIGIBLE",
    "DPR-13-PARTIAL-SOURCE-COVERAGE-IS-NOT-EMPTY", "DPR-14-MULTI-INSTRUMENT-RESPONSE-KEEPS-PER-SUBJECT-STATUS",
    "DPR-15-ERROR-BODY-DOES-NOT-EXPOSE-INTERNAL-DIAGNOSTICS", "DPR-16-ETAG-304-REQUIRES-UNCHANGED-APPROVED-SNAPSHOT",
    "DPR-17-OPEN-DART-TERMS-DO-NOT-BECOME-BLANKET-FIELD-REDISTRIBUTION-RIGHT", "DPR-18-KOGL-CATALOG-LABEL-DOES-NOT-INHERIT-TO-ZIP-ATTACHMENT-OR-DIRECT-API",
    "DPR-19-REQUIRED-CREDIT-IS-BOUND-TO-CLAIM-AND-SURFACE-REVISION", "DPR-20-MIXED-SOURCE-RESPONSE-KEEPS-PER-CLAIM-CREDIT-AND-WITHHELD-DENOMINATOR",
    "DPR-21-OPENDART-013-IS-EMPTY-ONLY-IN-ITS-EXACT-COMPLETED-DATE-SCOPE", "DPR-22-PAGE-GAP-OR-COUNT-MISMATCH-IS-UNVERIFIABLE-NOT-EMPTY",
    "DPR-23-EMPTY-SEARCH-DOES-NOT-CLAIM-ABSENCE-OUTSIDE-WINDOW-OR-SOURCE", "DPR-24-NOT-REPORTED-IS-DOCUMENT-SCOPED-NOT-SUBJECT-WIDE-ABSENCE",
    "DPR-25-STALE-CORRECTION-COVERAGE-DOES-NOT-CLOSE-NEGATIVE-RESULT",
  ];
  if (dossierPublicReadContract?.contractVersion !== "disclosure-dossier-public-read.v0"
    || dossierPublicReadContract?.classification !== "SYNTHETIC_PUBLIC_READ_API_PROPOSAL_NOT_RUNTIME_CONTRACT"
    || dossierPublicReadContract?.status !== "PROPOSED_UNAPPROVED"
    || dossierPublicReadContract?.dataPolicy?.containsRealFiling !== false
    || dossierPublicReadContract?.dataPolicy?.containsRealIssuerOrTicker !== false
    || dossierPublicReadContract?.accessContract?.authentication !== "PUBLIC_UNAUTHENTICATED_READ_ONLY"
    || dossierPublicReadContract?.compatibilityBoundary?.legacySchema !== "market-impact-events.v1"
    || dossierPublicReadContract?.compatibilityBoundary?.legacyBehavior !== "UNCHANGED_BY_THIS_PROPOSAL"
    || dossierPublicReadContract?.queryContract?.unknownParameters !== "REJECT"
    || dossierPublicReadContract?.scopeSemantics?.issuerFacts?.includes("CONTEXT_ONLY") !== true
    || dossierPublicReadContract?.snapshotContract?.readIsolation !== "ONE_READ_ONLY_REPEATABLE_READ_TRANSACTION_PER_REQUEST"
    || dossierPublicReadContract?.sourceRightsAttributionBoundary?.noPermissionGrantedByThisFixture !== true
    || dossierPublicReadContract?.sourceRightsAttributionBoundary?.decisionRules?.permissionStatesRemainUnresolvedUntilOwnerDecision !== true
    || dossierPublicReadContract?.sourceRightsAttributionBoundary?.decisionRules?.sourceAndLicenseInheritance?.includes("NO_INHERITANCE") !== true
    || dossierPublicReadContract?.sourceRightsAttributionBoundary?.evidenceRefs?.length !== 4
    || !["attributionPolicyRevisionRefs", "creditState", "creditText", "safeSourceUrl"].every((field) => dossierPublicReadContract?.requiredItemFields?.includes(field))
    || !dossierPublicReadContract?.publicationGates?.includes("EXACT_SURFACE_ATTRIBUTION_POLICY_AND_RENDERED_CREDIT")
    || !["NOT_FOUND_IN_SCOPE", "NOT_REPORTED", "UNVERIFIABLE", "CONFLICT_UNRESOLVED", "SUPPRESSED_RIGHTS", "NOT_SEARCHED"].every((state) => dossierPublicReadContract?.negativeEvidenceContract?.statusVocabulary?.includes(state))
    || dossierPublicReadContract?.negativeEvidenceContract?.currentRepositoryCollectorObservation?.sourcePath !== "lib/dart-opendart-client.ts"
    || dossierPublicReadContract?.negativeEvidenceContract?.currentRepositoryCollectorObservation?.isDossierCoverageProof !== false
    || dossierPublicReadContract?.negativeEvidenceContract?.validEmptyRequirements?.length !== 8
    || !dossierPublicReadContract?.negativeEvidenceContract?.forbiddenInference?.some((rule) => rule.includes("013"))
    || dossierPublicReadContract?.negativeEvidenceContract?.partialResultRule?.includes("Do not call an incomplete scan empty") !== true
    || !isDeepStrictEqual(dossierPublicReadContract?.vectors?.map((vector) => vector?.id), requiredDossierPublicReadVectorIds)
    || dossierPublicReadContract?.vectors?.some((vector) => !vector?.expected)
    || Object.values(dossierPublicReadContract?.unapprovedChoices ?? {}).some((value) => value !== null)) {
    console.error("Disclosure dossier public read contract is incomplete or silently approves an undecided choice.");
    process.exit(1);
  }
  const legacyPublicReadBaseline = dossierPublicReadContract?.legacyImplementationBaseline;
  const routeInventory = JSON.parse(readFileSync(join(root, "docs", "api", "route-inventory.json"), "utf8"));
  const openApiDocument = JSON.parse(readFileSync(join(root, "public", "openapi.json"), "utf8"));
  const legacyRoutePath = "/api/public/market-impact-events";
  const legacyRouteSourcePath = join(root, "app", "api", "public", "market-impact-events", "route.ts");
  const legacyRouteSource = readFileSync(legacyRouteSourcePath, "utf8");
  const legacyRouteEntry = (routeInventory?.routes ?? []).find((route) => route?.path === legacyRoutePath);
  const legacyOperation = openApiDocument?.paths?.[legacyRoutePath]?.get;
  const legacyQueryNames = [...legacyOperation?.parameters?.filter((parameter) => parameter?.in === "query").map((parameter) => parameter?.name) ?? []].sort();
  const legacyBodyQueryNames = [...legacyRouteSource.matchAll(/params\.get\("([^\"]+)"\)/g)].map((match) => match[1]).sort();
  if (legacyPublicReadBaseline?.sourcePath !== "app/api/public/market-impact-events/route.ts"
    || legacyPublicReadBaseline?.access !== "public-read-candidate"
    || legacyPublicReadBaseline?.authentication !== "NONE"
    || !isDeepStrictEqual(legacyPublicReadBaseline?.queryParameters, ["date", "from", "to", "market", "ticker", "status", "eventType", "cursor", "limit"])
    || !isDeepStrictEqual(legacyQueryNames, [...legacyPublicReadBaseline.queryParameters].sort())
    || !isDeepStrictEqual(legacyBodyQueryNames, [...legacyPublicReadBaseline.queryParameters].sort())
    || legacyRouteEntry?.methods?.includes("GET") !== true
    || legacyRouteEntry?.access !== "public-read-candidate"
    || legacyOperation?.operationId !== "getPublicMarketImpactEvents"
    || legacyOperation?.security?.length !== 0
    || legacyPublicReadBaseline?.successSchemaVersion !== "market-impact-events.v1"
    || legacyPublicReadBaseline?.unknownParameterBehavior !== "IGNORED"
    || legacyPublicReadBaseline?.issuerInstrumentApplicabilityGate !== false
    || legacyPublicReadBaseline?.rightsMasterCapCoverageSnapshotGate !== false
    || !legacyRouteSource.includes('schemaVersion: "market-impact-events.v1"')
    || !legacyRouteSource.includes('"cache-control": "no-store"')) {
    console.error("Disclosure dossier public read legacy baseline must match the current route source, route inventory, and unauthenticated OpenAPI operation.");
    process.exit(1);
  }
  const dossierPublicReadArchitecture = readFileSync(krArchitecturePath, "utf8");
  if (!dossierPublicReadArchitecture.includes("disclosure-dossier-public-read.v0.json") || !dossierPublicReadArchitecture.includes("`DPR-01`–`DPR-25`")) {
    console.error("Disclosure dossier public read contract must be linked from the architecture with the complete 25-vector range.");
    process.exit(1);
  }
  const investmentEffectProjectionBridgePath = join(root, "docs", "fixtures", "disclosure", "investment-effect-projection-bridge.v0.json");
  let investmentEffectProjectionBridge;
  try {
    const source = readFileSync(investmentEffectProjectionBridgePath, "utf8");
    assertUniqueJsonObjectKeys(source);
    investmentEffectProjectionBridge = JSON.parse(source);
  } catch (error) {
    console.error(`Investment effect projection bridge invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredInvestmentEffectProjectionBridgeIds = [
    "IEPB-01-TITLE-SIGNAL-STOPS-BEFORE-SOURCE-CLAIM", "IEPB-02-SUPPORTED-FACT-DOES-NOT-IMPLY-QUANTIFIED-EFFECT", "IEPB-03-BASIS-MISMATCH-BLOCKS-DOWNSTREAM-EFFECT",
    "IEPB-04-CONDITIONAL-SCENARIO-REMAINS-NONACTUAL", "IEPB-05-REPRODUCIBLE-CALCULATION-DOES-NOT-APPROVE-DIRECTION", "IEPB-06-PENDING-COUNTEREVIDENCE-REVIEW-BLOCKS-DIRECTION-PUBLICATION",
    "IEPB-07-SUPPORT-AND-COUNTEREVIDENCE-COEXIST-WITHOUT-NET-SCORE", "IEPB-08-ANALYSIS-RIGHTS-DO-NOT-GRANT-DERIVATIVE-DISPLAY", "IEPB-09-UNRESOLVED-AFFECTED-INSTRUMENT-BLOCKS-TICKER-EFFECT",
    "IEPB-10-DEPENDENCY-REVISION-CHANGE-STALES-APPROVAL-CHAIN", "IEPB-11-UI-API-SNAPSHOT-OR-OUTPUT-HASH-MISMATCH-REJECTS-PROJECTION", "IEPB-12-PASSED-INVESTMENT-EFFECT-IS-NOT-TRADE-INSTRUCTION",
    "IEPB-13-POST-FILING-PRICE-MOVE-DOES-NOT-BECOME-CAUSAL-EFFECT", "IEPB-14-UNVERIFIED-DENOMINATOR-BLOCKS-CROSS-ISSUER-COMPARISON",
    "IEPB-15-ONE-RECEIPT-MULTI-EVENT-CLAIMS-REMAIN-SCOPED",
  ];
  const investmentEffectProjectionBridgeIds = (investmentEffectProjectionBridge?.vectors ?? []).map((vector) => vector?.id);
  const investmentEffectProjectionBridgeById = new Map((investmentEffectProjectionBridge?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidInvestmentEffectProjectionBridge = investmentEffectProjectionBridge?.contractVersion !== "investment-effect-projection-bridge.v0"
    || investmentEffectProjectionBridge?.classification !== "SYNTHETIC_CROSS_FIXTURE_NOT_RUNTIME_ACCEPTANCE_OR_INVESTMENT_ADVICE"
    || investmentEffectProjectionBridge?.dataPolicy?.containsRealFiling !== false
    || investmentEffectProjectionBridge?.dataPolicy?.containsRealIssuerOrTicker !== false
    || investmentEffectProjectionBridge?.dataPolicy?.containsRealFinancialValues !== false
    || investmentEffectProjectionBridge?.dataPolicy?.containsSourceBody !== false
    || investmentEffectProjectionBridge?.dataPolicy?.containsCredentials !== false
    || investmentEffectProjectionBridge?.dataPolicy?.identitiesAreSynthetic !== true
    || !isDeepStrictEqual(investmentEffectProjectionBridge?.upstreamContracts, { claimEvidenceGate: "disclosure-investment-evidence-gate.v0", quantitativeTrace: "financing-claim-review-trace.v0", userProjection: "disclosure-investment-dossier-projection.v0" })
    || !isDeepStrictEqual(investmentEffectProjectionBridge?.workflowStages, ["DISCOVERY_SIGNAL", "SOURCE_CLAIM_REVIEW", "QUANTITATIVE_CALCULATION", "INTERPRETATION_REVIEW", "PUBLIC_PROJECTION"])
    || !["sourceReceiptId", "documentRevisionId", "documentRevisionHash", "claimRevisionIds", "rightsDecisionRevisionByAction", "instrumentId", "eligibilityAssertionId", "formulaRevision", "calculationOutputHash", "interpretationReviewRevision", "publicationSnapshotId", "publicationEpoch", "projectionOutputHash"].every((field) => investmentEffectProjectionBridge?.requiredDependencyBindings?.includes(field))
    || Object.values(investmentEffectProjectionBridge?.invariants ?? {}).some((value) => value !== true)
    || investmentEffectProjectionBridge?.invariants?.sameReceiptDoesNotMergeDifferentEventOrHorizonClaimGroups !== true
    || !isDeepStrictEqual([...investmentEffectProjectionBridgeIds].sort(), [...requiredInvestmentEffectProjectionBridgeIds].sort())
    || new Set(investmentEffectProjectionBridgeIds).size !== requiredInvestmentEffectProjectionBridgeIds.length
    || !disclosureInvestmentEvidenceGate
    || disclosureInvestmentEvidenceGate?.vectors?.length !== 14
    || !financingTraceFixture
    || financingTraceFixture?.vectors?.length !== 19
    || !disclosureInvestmentDossierProjection
    || disclosureInvestmentDossierProjection?.vectors?.length !== 47;
  const bridgeTitleSignal = investmentEffectProjectionBridgeById.get("IEPB-01-TITLE-SIGNAL-STOPS-BEFORE-SOURCE-CLAIM");
  const bridgeFactOnly = investmentEffectProjectionBridgeById.get("IEPB-02-SUPPORTED-FACT-DOES-NOT-IMPLY-QUANTIFIED-EFFECT");
  const bridgeBasisMismatch = investmentEffectProjectionBridgeById.get("IEPB-03-BASIS-MISMATCH-BLOCKS-DOWNSTREAM-EFFECT");
  const bridgeConditionalScenario = investmentEffectProjectionBridgeById.get("IEPB-04-CONDITIONAL-SCENARIO-REMAINS-NONACTUAL");
  const bridgeCalculation = investmentEffectProjectionBridgeById.get("IEPB-05-REPRODUCIBLE-CALCULATION-DOES-NOT-APPROVE-DIRECTION");
  const bridgeCounterEvidence = investmentEffectProjectionBridgeById.get("IEPB-06-PENDING-COUNTEREVIDENCE-REVIEW-BLOCKS-DIRECTION-PUBLICATION");
  const bridgeRights = investmentEffectProjectionBridgeById.get("IEPB-08-ANALYSIS-RIGHTS-DO-NOT-GRANT-DERIVATIVE-DISPLAY");
  const bridgeInstrument = investmentEffectProjectionBridgeById.get("IEPB-09-UNRESOLVED-AFFECTED-INSTRUMENT-BLOCKS-TICKER-EFFECT");
  const bridgeStale = investmentEffectProjectionBridgeById.get("IEPB-10-DEPENDENCY-REVISION-CHANGE-STALES-APPROVAL-CHAIN");
  const bridgeSnapshotMismatch = investmentEffectProjectionBridgeById.get("IEPB-11-UI-API-SNAPSHOT-OR-OUTPUT-HASH-MISMATCH-REJECTS-PROJECTION");
  const bridgeNoAdvice = investmentEffectProjectionBridgeById.get("IEPB-12-PASSED-INVESTMENT-EFFECT-IS-NOT-TRADE-INSTRUCTION");
  const bridgeCausality = investmentEffectProjectionBridgeById.get("IEPB-13-POST-FILING-PRICE-MOVE-DOES-NOT-BECOME-CAUSAL-EFFECT");
  const bridgeDenominator = investmentEffectProjectionBridgeById.get("IEPB-14-UNVERIFIED-DENOMINATOR-BLOCKS-CROSS-ISSUER-COMPARISON");
  const bridgeMultiEvent = investmentEffectProjectionBridgeById.get("IEPB-15-ONE-RECEIPT-MULTI-EVENT-CLAIMS-REMAIN-SCOPED");
  const unsafeInvestmentEffectProjectionTransition = bridgeTitleSignal?.expected?.investmentClaim !== false
    || bridgeFactOnly?.expected?.quantifiedEffect !== null
    || bridgeBasisMismatch?.expected?.priorOutputReused !== false
    || bridgeConditionalScenario?.expected?.scenarioLabel !== "CONDITIONAL_SCENARIO"
    || bridgeConditionalScenario?.expected?.actualIssuedShares !== null
    || bridgeConditionalScenario?.expected?.holderDilutionClaim !== false
    || bridgeCalculation?.expected?.direction !== "NOT_ASSESSED"
    || bridgeCounterEvidence?.expected?.directionPublished !== false
    || bridgeCounterEvidence?.expected?.counterEvidenceHidden !== false
    || bridgeRights?.expected?.derivedClaimPublic !== false
    || bridgeInstrument?.expected?.tickerAsAffectedSubject !== false
    || bridgeStale?.expected?.priorApproval !== "STALE"
    || bridgeSnapshotMismatch?.expected?.projection !== "REJECT_RESPONSE"
    || bridgeSnapshotMismatch?.expected?.partialFallback !== false
    || bridgeNoAdvice?.expected?.tradeInstruction !== "NONE"
    || bridgeNoAdvice?.expected?.returnGuarantee !== false
    || bridgeCausality?.expected?.causalAttribution !== "NOT_ESTABLISHED"
    || bridgeDenominator?.expected?.ranking !== "NOT_AVAILABLE"
    || bridgeMultiEvent?.expected?.eventGroupsPreserved !== 2
    || bridgeMultiEvent?.expected?.horizonsMerged !== false
    || bridgeMultiEvent?.expected?.singleNetDirection !== "NOT_INFERRED"
    || bridgeMultiEvent?.expected?.receiptCountAsEventCount !== false;
  const investmentEffectProjectionBridgeArchitecture = readFileSync(krArchitecturePath, "utf8");
  const requiredInvestmentEffectProjectionBridgeTerms = ["investment-effect-projection-bridge.v0.json", "`IEPB-01`–`IEPB-15`", "재현 가능한 계산도 별도 interpretation review를 대체하지 않는다", "`ANALYZE` 권리는 `DISPLAY_PUBLIC_API` 권리를 포함하지 않는다"];
  const missingInvestmentEffectProjectionBridgeTerms = requiredInvestmentEffectProjectionBridgeTerms.filter((term) => !investmentEffectProjectionBridgeArchitecture.includes(term));
  if (invalidInvestmentEffectProjectionBridge || unsafeInvestmentEffectProjectionTransition || missingInvestmentEffectProjectionBridgeTerms.length) {
    console.error(`Investment effect projection bridge incomplete: ${[...(invalidInvestmentEffectProjectionBridge ? ["cross-fixture versions/stages/dependency bindings/invariants/vector IDs"] : []), ...(unsafeInvestmentEffectProjectionTransition ? ["claim/calculation/interpretation/rights/subject/revision/snapshot/advice/causality/denominator fail-closed states"] : []), ...missingInvestmentEffectProjectionBridgeTerms].join(", ")}`);
    process.exit(1);
  }
  const investmentRightsPropagationPath = join(root, "docs", "fixtures", "disclosure", "investment-rights-action-propagation.v0.json");
  let investmentRightsPropagation;
  try {
    const source = readFileSync(investmentRightsPropagationPath, "utf8");
    assertUniqueJsonObjectKeys(source);
    investmentRightsPropagation = JSON.parse(source);
  } catch (error) {
    console.error(`Investment rights action propagation fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredInvestmentRightsPropagationIds = [
    "IRAP-01-PUBLIC-DISPLAY-REVOCATION-PRESERVES-VALID-INTERNAL-ANALYSIS", "IRAP-02-DERIVATIVE-PERSISTENCE-REVOCATION-QUARANTINES-STORED-OUTPUTS",
    "IRAP-03-ANALYSIS-REVOCATION-INVALIDATES-DERIVED-APPROVALS", "IRAP-04-UNRELATED-ACTION-REVISION-DOES-NOT-STALE-INDEPENDENT-APPROVAL",
    "IRAP-05-PUBLICATION-REVOCATION-SUPPRESSES-ALL-PUBLIC-DERIVATIVE-SURFACES", "IRAP-06-PUSH-REVOCATION-USES-DELIVERY-EVIDENCE",
    "IRAP-07-DELETE-REQUIRES-SEPARATE-RETENTION-DISPOSITION", "IRAP-08-INCOMPLETE-DESCENDANT-SET-KEEPS-PUBLICATION-SUPPRESSED",
    "IRAP-09-CURRENT-ALLOW-AFTER-REMEDIATION-DOES-NOT-RESURRECT-STALE-APPROVAL", "IRAP-10-TERMS-REVISION-DURING-PUBLICATION-FINALIZATION-FAILS-CLOSED",
  ];
  const investmentRightsPropagationIds = (investmentRightsPropagation?.vectors ?? []).map((vector) => vector?.id);
  const investmentRightsPropagationById = new Map((investmentRightsPropagation?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidInvestmentRightsPropagation = investmentRightsPropagation?.contractVersion !== "investment-rights-action-propagation.v0"
    || investmentRightsPropagation?.classification !== "SYNTHETIC_CROSS_FIXTURE_NOT_RUNTIME_AUTHORIZATION_OR_LEGAL_ADVICE"
    || investmentRightsPropagation?.dataPolicy?.containsRealFiling !== false
    || investmentRightsPropagation?.dataPolicy?.containsRealIssuerOrTicker !== false
    || investmentRightsPropagation?.dataPolicy?.containsSourceBody !== false
    || investmentRightsPropagation?.dataPolicy?.containsCredentials !== false
    || investmentRightsPropagation?.dataPolicy?.identitiesAreSynthetic !== true
    || !isDeepStrictEqual(investmentRightsPropagation?.upstreamContracts, { rightsDecision: "rights-action-decision.v0", investmentProjection: "investment-effect-projection-bridge.v0", correctionRemediation: "fact-correction-remediation.v0", deliveryReconciliation: "correction-delivery-reconciliation.v0" })
    || !isDeepStrictEqual((investmentRightsPropagation?.decisionGateBindings ?? []).map((binding) => binding?.decisionId), ["KR-DART-RIGHTS-01", "KR-RETENTION-01", "KR-OPERATIONAL-SECURITY-01", "KR-API-UI-CONSISTENCY-01", "KR-END-TO-END-ACCEPTANCE-01"])
    || investmentRightsPropagation?.decisionGateBindings?.some((binding) => !binding?.scope || !binding?.defaultGate || !Array.isArray(binding?.requiredEvidence) || binding.requiredEvidence.length === 0 || !Array.isArray(binding?.requiredFor) || binding.requiredFor.length === 0)
    || !isDeepStrictEqual(investmentRightsPropagation?.decisionStatusSemantics, { OPEN: "BLOCKED; no permission or execution implied", EVIDENCE_READY: "reviewable evidence only; still blocked", APPROVED: "decision scope only; dependent runtime/code gates remain separately closed until their acceptance evidence passes", CLOSED: "only after the decision lifecycle's required code gate and rollback evidence; does not grant broader source/action scope", REJECTED: "blocked until the recorded reopen condition is met and a new revision is reviewed", EXPIRED: "affected action and publication gates close until current evidence is reviewed" })
    || !["ANALYZE", "PERSIST_DERIVATIVE", "DISPLAY_PUBLIC_API", "DISTRIBUTE_PUSH", "DELETE"].every((action) => investmentRightsPropagation?.authorizationActions?.includes(action))
    || !["SOURCE_CLAIM", "QUANTITATIVE_CALCULATION", "INTERPRETATION", "PUBLICATION"].every((kind) => investmentRightsPropagation?.approvalKinds?.includes(kind))
    || !isDeepStrictEqual([...investmentRightsPropagationIds].sort(), [...requiredInvestmentRightsPropagationIds].sort())
    || new Set(investmentRightsPropagationIds).size !== requiredInvestmentRightsPropagationIds.length
    || investmentRightsPropagation?.propagationRules?.length !== 9;
  const rightsProjectionRevocation = investmentRightsPropagationById.get("IRAP-01-PUBLIC-DISPLAY-REVOCATION-PRESERVES-VALID-INTERNAL-ANALYSIS");
  const rightsPersistRevocation = investmentRightsPropagationById.get("IRAP-02-DERIVATIVE-PERSISTENCE-REVOCATION-QUARANTINES-STORED-OUTPUTS");
  const rightsAnalysisRevocation = investmentRightsPropagationById.get("IRAP-03-ANALYSIS-REVOCATION-INVALIDATES-DERIVED-APPROVALS");
  const rightsScopedRevision = investmentRightsPropagationById.get("IRAP-04-UNRELATED-ACTION-REVISION-DOES-NOT-STALE-INDEPENDENT-APPROVAL");
  const rightsPublicSurfaces = investmentRightsPropagationById.get("IRAP-05-PUBLICATION-REVOCATION-SUPPRESSES-ALL-PUBLIC-DERIVATIVE-SURFACES");
  const rightsPushRevocation = investmentRightsPropagationById.get("IRAP-06-PUSH-REVOCATION-USES-DELIVERY-EVIDENCE");
  const rightsDeleteSeparation = investmentRightsPropagationById.get("IRAP-07-DELETE-REQUIRES-SEPARATE-RETENTION-DISPOSITION");
  const rightsIncompleteInventory = investmentRightsPropagationById.get("IRAP-08-INCOMPLETE-DESCENDANT-SET-KEEPS-PUBLICATION-SUPPRESSED");
  const rightsNoResurrection = investmentRightsPropagationById.get("IRAP-09-CURRENT-ALLOW-AFTER-REMEDIATION-DOES-NOT-RESURRECT-STALE-APPROVAL");
  const rightsFinalizationFence = investmentRightsPropagationById.get("IRAP-10-TERMS-REVISION-DURING-PUBLICATION-FINALIZATION-FAILS-CLOSED");
  const unsafeInvestmentRightsPropagation = rightsProjectionRevocation?.expected?.publicProjection !== "SUPPRESSED"
    || rightsProjectionRevocation?.expected?.deletion !== "NOT_IMPLIED"
    || rightsPersistRevocation?.expected?.unknownDescendantCount !== "NOT_ZERO"
    || rightsAnalysisRevocation?.expected?.dependentCalculationApproval !== "STALE"
    || rightsScopedRevision?.expected?.globalApprovalReset !== false
    || rightsPublicSurfaces?.expected?.priorPublicSnapshotReuse !== false
    || rightsPushRevocation?.expected?.acceptedMeansDelivered !== false
    || rightsPushRevocation?.expected?.deliveredMeansRetracted !== false
    || rightsDeleteSeparation?.expected?.deletion !== "BLOCKED_UNTIL_DELETE_DECISION_AND_RETENTION_REVIEW"
    || rightsIncompleteInventory?.expected?.publicProjection !== "SUPPRESSED"
    || rightsNoResurrection?.expected?.automaticResurrection !== false
    || rightsFinalizationFence?.expected?.publicationCommit !== "REJECT_STALE_RIGHTS_REVISION";
  const investmentRightsPropagationArchitecture = readFileSync(krArchitecturePath, "utf8");
  const requiredInvestmentRightsPropagationTerms = ["investment-effect-projection-bridge.v0.json", "IRAP-01`–`IRAP-10", "action 범위가 바뀐 approval만 stale", "과거 approval row는 immutable", "삭제 권한은 자동으로 생기지 않는다", "이미 전달된 push는 회수 증거가 있어야 정정 완료", "IRAP decision-gate binding", "KR-DART-RIGHTS-01", "KR-RETENTION-01", "KR-OPERATIONAL-SECURITY-01", "KR-API-UI-CONSISTENCY-01", "KR-END-TO-END-ACCEPTANCE-01", "EVIDENCE_READY", "OPEN=BLOCKED", "APPROVED=DECISION_SCOPE_ONLY_DEPENDENT_GATES_CLOSED", "decision-register.v0.json", "decision-evidence-ledger.v0.json", "RFC 8785 JCS", "scope·owner·상태 전이", "status는"];
  const missingInvestmentRightsPropagationTerms = requiredInvestmentRightsPropagationTerms.filter((term) => !investmentRightsPropagationArchitecture.includes(term));
  if (invalidInvestmentRightsPropagation || unsafeInvestmentRightsPropagation || missingInvestmentRightsPropagationTerms.length) {
    console.error(`Investment rights action propagation incomplete: ${[...(invalidInvestmentRightsPropagation ? ["fixture version/upstream contracts/action and approval axes/vector IDs"] : []), ...(unsafeInvestmentRightsPropagation ? ["scoped approval staleness/public suppression/delete/push/remediation fail-closed expectations"] : []), ...missingInvestmentRightsPropagationTerms].join(", ")}`);
    process.exit(1);
  }
  const requiredFactCorrectionRemediationIds = [
    "FCR-01-OBSERVATION-CORRECTION-DOES-NOT-AUTO-DECIDE-ECONOMIC-EFFECT", "FCR-02-UNRESOLVED-RELATION-DOES-NOT-SUPERSEDE", "FCR-03-ONLY-DEPENDENT-CONSUMERS-ARE-INVALIDATED",
    "FCR-04-ACTUAL-EFFECT-CHANGE-REQUIRES-RECOMPUTE-AND-REVIEW", "FCR-05-SAME-EFFECT-NEW-SOURCE-NEEDS-REVIEWED-NO-CHANGE", "FCR-06-USER-VISIBLE-PRIOR-SNAPSHOT-GETS-CORRECTION-LINK",
    "FCR-07-PREVIOUSLY-DELIVERED-CLAIM-USES-DELIVERY-RECONCILIATION", "FCR-08-CORRECTION-NOT-INVESTMENT-RECOMMENDATION-REVERSAL", "FCR-09-WRONG-ATTRIBUTION-TRACES-ALL-AFFECTED-SUBJECTS",
    "FCR-10-REMEDIATION-COMPLETE-REQUIRES-DENOMINATOR-AND-OWNER", "FCR-11-DART-RECEIPT-IDENTITY-DOES-NOT-INFER-CORRECTION-LINK",
    "FCR-12-RM_RETRACTION-MARKER-IS-NOT-EVENT-CANCELLATION-PROOF", "FCR-13-ATTACHMENT-CORRECTION-CHANGES-DOCUMENT-REVISION-NOT-ALL-CLAIMS",
    "FCR-14-REPEATED-CORRECTION-CHAIN-KEEPS-ALL-RECEIPTS-AND-RELATIONS",
    "FCR-15-CORRECTION-VIEWER-POINTS-TO-ITS-OWN-RECEIPT", "FCR-16-RM-CORRECTION-MARKER-DOES-NOT-SUPPLY-PREDECESSOR-ID",
    "FCR-17-EXPLICIT-RELATION-KEEPS-BOTH-RECEIPT-VIEWERS", "FCR-18-INVALID-TARGET-LINK-DOES-NOT-ERASE-RELATION-EVIDENCE",
    "FCR-19-RSS-LINK-RECEIPT-MUST-MATCH-ROW-RECEIPT",
    "FCR-20-RSS-AND-LIST-JOIN-ONLY-ON-EXACT-RECEIPT", "FCR-21-MALFORMED-RSS-RECEIPT-DOES-NOT-FALL-BACK-TO-TITLE",
    "FCR-22-DUPLICATE-LIST-RECEIPT-CONFLICT-IS-QUARANTINED", "FCR-23-SAME-TITLE-COMPANY-DATE-DIFFERENT-RECEIPTS-STAY-DISTINCT",
    "FCR-24-INCOMPLETE-LIST-COVERAGE-DOES-NOT-PROVE-NO-MATCH", "FCR-25-METADATA-DRIFT-KEEPS-BOTH-OBSERVATIONS",
    "FCR-26-RECONCILIATION-REPORT-IS-AGGREGATE-ONLY", "FCR-27-SINGLE-SOURCE-CAPTURE-IS-NOT-CROSS-SOURCE-MATCH",
    "FCR-28-CORP-CODE-DRIFT-BLOCKS-ISSUER-ATTRIBUTION", "FCR-29-ROW-COUNT-OR-PAGE-ECHO-MISMATCH-INVALIDATES-COVERAGE",
    "FCR-30-PAGINATION-SWEEP-DRIFT-KEEPS-SNAPSHOT-STABILITY-UNKNOWN",
    "FCR-31-UNRESOLVED-COVERAGE-UI-DOES-NOT-CALL-IT-A-MISMATCH", "FCR-32-CONFLICT-STATES-HOLD-CROSS-SOURCE-INVESTMENT-OUTPUTS",
    "FCR-33-EXACT-RECEIPT-MATCH-IS-NOT-ISSUER-OR-TICKER-VERIFICATION", "FCR-34-REVIEWED-LINKED-DOES-NOT-BYPASS-INVESTMENT-GATES",
    "FCR-35-REVIEW-DECISION-IS-APPEND-ONLY-AND-REVISION-FENCED", "FCR-36-REVIEWED-UNLINKED-PRESERVES-OBSERVATIONS-WITHOUT-CROSS-SOURCE-ALERT",
    "FCR-37-PUBLIC-FEED-DOES-NOT-LEAK-INTERNAL-JOIN-REVIEW-DATA", "FCR-38-ADMIN-REVIEW-READ-REQUIRES-SESSION-BEFORE-STORE-ACCESS",
    "FCR-39-RIGHTS-UNRESOLVED-FILTERS-REVIEW-DETAIL-FIELDS", "FCR-40-SHARED-ADMIN-SESSION-CANNOT-FABRICATE-NAMED-REVIEWER",
    "FCR-41-REVIEW-DECISION-MUTATION-REQUIRES-APPROVED-CSRF-AND-ROLE-GATE",
    "FCR-42-SHARED-SESSION-IS-NOT-NAMED-ACTOR", "FCR-43-REVIEW-DAL-AUTHORIZES-BEFORE-STORE-READ",
    "FCR-44-SAMESITE-ALONE-DOES-NOT-AUTHORIZE-MUTATION", "FCR-45-VALIDATED-CSRF-AND-ROLE-REQUIRED",
    "FCR-46-STALE-REVIEW-REVISION-REJECTED", "FCR-47-NULL-ORIGIN-REJECTED-UNLESS-ALTERNATE-CSRF-DEFENSE-PASSES",
    "FCR-48-NO-IMPACT-REQUIRES-CLOSED-DEPENDENCY-DENOMINATOR", "FCR-49-OPEN-IMPACT-DENOMINATOR-FORBIDS-NO-IMPACT-CLAIM",
  ];
  let factCorrectionRemediationFixture;
  try {
    const fixtureSource = readFileSync(factCorrectionRemediationFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    factCorrectionRemediationFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Fact correction remediation fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const factCorrectionRemediationIds = (factCorrectionRemediationFixture?.vectors ?? []).map((vector) => vector?.id);
  const factCorrectionRemediationById = new Map((factCorrectionRemediationFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredFactCorrectionLayers = ["SOURCE_OBSERVATION", "NORMALIZED_FACT", "INTERPRETATION", "INVESTMENT_EFFECT", "PUBLICATION"];
  const requiredFactCorrectionImpactStates = ["NO_DOWNSTREAM_IMPACT", "STALE_SUPPRESSED", "RECALCULATION_REQUIRED", "REVIEW_REQUIRED", "CORRECTED", "UNRESOLVED"];
  const invalidFactCorrectionRemediationStructure = factCorrectionRemediationFixture?.contractVersion !== "fact-correction-remediation.v0"
    || factCorrectionRemediationFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || factCorrectionRemediationFixture?.dataPolicy?.containsRealFiling !== false
    || factCorrectionRemediationFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || factCorrectionRemediationFixture?.dataPolicy?.containsSourceBody !== false
    || factCorrectionRemediationFixture?.dataPolicy?.containsPersonalRecipientData !== false
    || factCorrectionRemediationFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || !requiredFactCorrectionLayers.every((layer) => factCorrectionRemediationFixture?.factLayers?.includes(layer))
    || !requiredFactCorrectionImpactStates.every((state) => factCorrectionRemediationFixture?.impactStates?.includes(state))
    || !["claimId", "priorRevisionId", "newRevisionId", "sourceRelationId", "consumerType", "consumerRevisionId", "publicationEpoch", "deliveryId", "disposition", "rationaleRef"].every((field) => factCorrectionRemediationFixture?.requiredImpactDimensions?.includes(field))
    || factCorrectionRemediationFixture?.vectors?.length !== requiredFactCorrectionRemediationIds.length
    || new Set(factCorrectionRemediationIds).size !== factCorrectionRemediationIds.length
    || requiredFactCorrectionRemediationIds.some((id) => !factCorrectionRemediationById.has(id));
  const correctionRelationUnresolved = factCorrectionRemediationById.get("FCR-02-UNRESOLVED-RELATION-DOES-NOT-SUPERSEDE");
  const exactConsumerClosure = factCorrectionRemediationById.get("FCR-03-ONLY-DEPENDENT-CONSUMERS-ARE-INVALIDATED");
  const closedNoImpactDenominator = factCorrectionRemediationById.get("FCR-48-NO-IMPACT-REQUIRES-CLOSED-DEPENDENCY-DENOMINATOR");
  const openNoImpactDenominator = factCorrectionRemediationById.get("FCR-49-OPEN-IMPACT-DENOMINATOR-FORBIDS-NO-IMPACT-CLAIM");
  const revisedImpact = factCorrectionRemediationById.get("FCR-04-ACTUAL-EFFECT-CHANGE-REQUIRES-RECOMPUTE-AND-REVIEW");
  const recommendationBoundary = factCorrectionRemediationById.get("FCR-08-CORRECTION-NOT-INVESTMENT-RECOMMENDATION-REVERSAL");
  const incompleteRemediation = factCorrectionRemediationById.get("FCR-10-REMEDIATION-COMPLETE-REQUIRES-DENOMINATOR-AND-OWNER");
  const receiptRelationInference = factCorrectionRemediationById.get("FCR-11-DART-RECEIPT-IDENTITY-DOES-NOT-INFER-CORRECTION-LINK");
  const withdrawalSemantics = factCorrectionRemediationById.get("FCR-12-RM_RETRACTION-MARKER-IS-NOT-EVENT-CANCELLATION-PROOF");
  const attachmentCorrectionScope = factCorrectionRemediationById.get("FCR-13-ATTACHMENT-CORRECTION-CHANGES-DOCUMENT-REVISION-NOT-ALL-CLAIMS");
  const correctionChain = factCorrectionRemediationById.get("FCR-14-REPEATED-CORRECTION-CHAIN-KEEPS-ALL-RECEIPTS-AND-RELATIONS");
  const correctionOwnViewer = factCorrectionRemediationById.get("FCR-15-CORRECTION-VIEWER-POINTS-TO-ITS-OWN-RECEIPT");
  const correctionMarkerOnly = factCorrectionRemediationById.get("FCR-16-RM-CORRECTION-MARKER-DOES-NOT-SUPPLY-PREDECESSOR-ID");
  const correctionExplicitRelation = factCorrectionRemediationById.get("FCR-17-EXPLICIT-RELATION-KEEPS-BOTH-RECEIPT-VIEWERS");
  const correctionInvalidTarget = factCorrectionRemediationById.get("FCR-18-INVALID-TARGET-LINK-DOES-NOT-ERASE-RELATION-EVIDENCE");
  const correctionRssReceiptMismatch = factCorrectionRemediationById.get("FCR-19-RSS-LINK-RECEIPT-MUST-MATCH-ROW-RECEIPT");
  const exactReceiptJoin = factCorrectionRemediationById.get("FCR-20-RSS-AND-LIST-JOIN-ONLY-ON-EXACT-RECEIPT");
  const malformedRssReceipt = factCorrectionRemediationById.get("FCR-21-MALFORMED-RSS-RECEIPT-DOES-NOT-FALL-BACK-TO-TITLE");
  const duplicateListReceipt = factCorrectionRemediationById.get("FCR-22-DUPLICATE-LIST-RECEIPT-CONFLICT-IS-QUARANTINED");
  const titleCollision = factCorrectionRemediationById.get("FCR-23-SAME-TITLE-COMPANY-DATE-DIFFERENT-RECEIPTS-STAY-DISTINCT");
  const incompleteJoinCoverage = factCorrectionRemediationById.get("FCR-24-INCOMPLETE-LIST-COVERAGE-DOES-NOT-PROVE-NO-MATCH");
  const joinedMetadataDrift = factCorrectionRemediationById.get("FCR-25-METADATA-DRIFT-KEEPS-BOTH-OBSERVATIONS");
  const aggregateJoinReport = factCorrectionRemediationById.get("FCR-26-RECONCILIATION-REPORT-IS-AGGREGATE-ONLY");
  const singleSourceJoin = factCorrectionRemediationById.get("FCR-27-SINGLE-SOURCE-CAPTURE-IS-NOT-CROSS-SOURCE-MATCH");
  const corpCodeJoinConflict = factCorrectionRemediationById.get("FCR-28-CORP-CODE-DRIFT-BLOCKS-ISSUER-ATTRIBUTION");
  const invalidPageCoverage = factCorrectionRemediationById.get("FCR-29-ROW-COUNT-OR-PAGE-ECHO-MISMATCH-INVALIDATES-COVERAGE");
  const paginationSnapshotDrift = factCorrectionRemediationById.get("FCR-30-PAGINATION-SWEEP-DRIFT-KEEPS-SNAPSHOT-STABILITY-UNKNOWN");
  const unresolvedCoverageUi = factCorrectionRemediationById.get("FCR-31-UNRESOLVED-COVERAGE-UI-DOES-NOT-CALL-IT-A-MISMATCH");
  const identityConflictOutput = factCorrectionRemediationById.get("FCR-32-CONFLICT-STATES-HOLD-CROSS-SOURCE-INVESTMENT-OUTPUTS");
  const exactReceiptNotIssuer = factCorrectionRemediationById.get("FCR-33-EXACT-RECEIPT-MATCH-IS-NOT-ISSUER-OR-TICKER-VERIFICATION");
  const reviewedLinkedGate = factCorrectionRemediationById.get("FCR-34-REVIEWED-LINKED-DOES-NOT-BYPASS-INVESTMENT-GATES");
  const staleJoinReview = factCorrectionRemediationById.get("FCR-35-REVIEW-DECISION-IS-APPEND-ONLY-AND-REVISION-FENCED");
  const reviewedUnlinked = factCorrectionRemediationById.get("FCR-36-REVIEWED-UNLINKED-PRESERVES-OBSERVATIONS-WITHOUT-CROSS-SOURCE-ALERT");
  const publicReviewLeak = factCorrectionRemediationById.get("FCR-37-PUBLIC-FEED-DOES-NOT-LEAK-INTERNAL-JOIN-REVIEW-DATA");
  const adminReviewRead = factCorrectionRemediationById.get("FCR-38-ADMIN-REVIEW-READ-REQUIRES-SESSION-BEFORE-STORE-ACCESS");
  const rightsFilteredReview = factCorrectionRemediationById.get("FCR-39-RIGHTS-UNRESOLVED-FILTERS-REVIEW-DETAIL-FIELDS");
  const unattributedAdmin = factCorrectionRemediationById.get("FCR-40-SHARED-ADMIN-SESSION-CANNOT-FABRICATE-NAMED-REVIEWER");
  const reviewMutationGate = factCorrectionRemediationById.get("FCR-41-REVIEW-DECISION-MUTATION-REQUIRES-APPROVED-CSRF-AND-ROLE-GATE");
  const invalidFactCorrectionRemediationSafety = correctionRelationUnresolved?.expected?.newValuePromotion !== false
    || correctionRelationUnresolved?.expected?.priorCurrentState !== "STALE_SUPPRESSED"
    || exactConsumerClosure?.expected?.independent !== "RETAIN_IF_CURRENT_AND_VALID"
    || exactConsumerClosure?.expected?.missingEdge !== "BROADER_SUPPRESSION"
    || closedNoImpactDenominator?.expected?.noImpactAdmissible !== true
    || closedNoImpactDenominator?.expected?.unresolvedDependencyCount !== 0
    || closedNoImpactDenominator?.expected?.unlistedConsumerTreatedAsUnaffected !== false
    || closedNoImpactDenominator?.expected?.unrelatedEventMutation !== false
    || openNoImpactDenominator?.expected?.noImpactAdmissible !== false
    || openNoImpactDenominator?.expected?.unresolvedDependencyCount !== 1
    || openNoImpactDenominator?.expected?.claimBDisposition !== "UNRESOLVED_NOT_NO_IMPACT"
    || openNoImpactDenominator?.expected?.unlistedConsumerTreatedAsUnaffected !== false
    || openNoImpactDenominator?.expected?.unrelatedEventMutation !== false
    || revisedImpact?.expected?.priorApproval !== "STALE_REVIEW"
    || revisedImpact?.expected?.publication !== "SUPPRESSED_UNTIL_REAPPROVED"
    || recommendationBoundary?.expected?.buySellInstruction !== "FORBIDDEN"
    || incompleteRemediation?.expected?.completion !== false
    || receiptRelationInference?.expected?.sourceRelation !== "UNRESOLVED"
    || receiptRelationInference?.expected?.supersedesPrior !== false
    || receiptRelationInference?.expected?.bodyFetch !== "BLOCKED_UNTIL_ACTION_DECISION"
    || withdrawalSemantics?.expected?.eventStatus !== "UNRESOLVED"
    || withdrawalSemantics?.expected?.cancelledClaim !== false
    || attachmentCorrectionScope?.expected?.wholeEventSuperseded !== false
    || correctionChain?.expected?.priorRevisionsMutable !== false
    || correctionChain?.expected?.chronologyInferredFromReceiptNumber !== false
    || correctionOwnViewer?.expected?.currentViewerReceipt !== "20261104000002"
    || correctionOwnViewer?.expected?.sourceRelation !== "UNRESOLVED"
    || correctionMarkerOnly?.expected?.predecessorLink !== "SUPPRESSED_UNRESOLVED"
    || correctionMarkerOnly?.expected?.titleAndRmAreRelationProof !== false
    || correctionExplicitRelation?.expected?.receiptRecordsMerged !== false
    || correctionExplicitRelation?.expected?.sourceRelation !== "RESOLVED_FROM_EXPLICIT_EVIDENCE"
    || correctionInvalidTarget?.expected?.sourceRelation !== "RESOLVED_FROM_EXPLICIT_EVIDENCE"
    || correctionInvalidTarget?.expected?.targetViewerLink !== "SUPPRESSED_INVALID_RECEIPT"
    || correctionRssReceiptMismatch?.expected?.candidateLinkDisposition !== "REJECT_RECEIPT_MISMATCH"
    || correctionRssReceiptMismatch?.expected?.untrustedCandidateUrlReused !== false
    || exactReceiptJoin?.expected?.joinStatus !== "EXACT_RECEIPT_MATCH"
    || exactReceiptJoin?.expected?.sourcePayloadOverwrite !== false
    || malformedRssReceipt?.expected?.titleFallbackUsed !== false
    || duplicateListReceipt?.expected?.lastWriteWins !== false
    || duplicateListReceipt?.expected?.publication !== "QUARANTINED_REVIEW"
    || titleCollision?.expected?.recordsMerged !== false
    || incompleteJoinCoverage?.expected?.absenceClaim !== "FORBIDDEN"
    || joinedMetadataDrift?.expected?.bothTitlesPreserved !== true
    || joinedMetadataDrift?.expected?.automaticValueSelection !== false
    || aggregateJoinReport?.expected?.reportContainsRawSourceContent !== false
    || aggregateJoinReport?.expected?.reportContainsCredentials !== false
    || aggregateJoinReport?.expected?.retentionDecision !== "UNRESOLVED_UNTIL_RIGHTS_ACTION_DECISION"
    || singleSourceJoin?.expected?.joinStatus !== "SINGLE_SOURCE_OBSERVATION"
    || singleSourceJoin?.expected?.absenceClaim !== "FORBIDDEN"
    || corpCodeJoinConflict?.expected?.issuerAttribution !== "BLOCKED_IDENTITY_CONFLICT"
    || corpCodeJoinConflict?.expected?.automaticIssuerSelection !== false
    || invalidPageCoverage?.expected?.enumerationStatus !== "ENUMERATION_INCOMPLETE"
    || invalidPageCoverage?.expected?.negativeMatchAllowed !== false
    || paginationSnapshotDrift?.expected?.snapshotStability !== "SNAPSHOT_STABILITY_UNKNOWN"
    || paginationSnapshotDrift?.expected?.crossSweepUnionAsComplete !== false
    || unresolvedCoverageUi?.expected?.userLabel !== "대조 자료 불완전 · 불일치 판정 아님"
    || unresolvedCoverageUi?.expected?.crossSourceMismatchClaim !== false
    || identityConflictOutput?.expected?.bullishScorePublished !== false
    || identityConflictOutput?.expected?.pushAlertSent !== false
    || identityConflictOutput?.expected?.sourceSpecificObservationPreserved !== true
    || exactReceiptNotIssuer?.expected?.issuerAttribution !== "UNVERIFIED"
    || exactReceiptNotIssuer?.expected?.tickerRecommendationAllowed !== false
    || reviewedLinkedGate?.expected?.crossSourceClaim !== "HOLD"
    || reviewedLinkedGate?.expected?.sourceRightsBypassed !== false
    || staleJoinReview?.expected?.decisionWrite !== "REJECT_STALE_EXPECTED_REVISION"
    || staleJoinReview?.expected?.priorDecisionMutable !== false
    || reviewedUnlinked?.expected?.sourceObservationsPreserved !== 2
    || reviewedUnlinked?.expected?.crossSourceAlertSent !== false
    || publicReviewLeak?.expected?.reviewerIdentityExposed !== false
    || publicReviewLeak?.expected?.captureIdsExposed !== false
    || adminReviewRead?.expected?.httpStatus !== 401
    || adminReviewRead?.expected?.storeRead !== false
    || rightsFilteredReview?.expected?.rawBodyReturned !== false
    || rightsFilteredReview?.expected?.restrictedMetadataReturned !== false
    || unattributedAdmin?.expected?.decisionWrite !== "BLOCKED_ACTOR_IDENTITY_UNRESOLVED"
    || unattributedAdmin?.expected?.reviewerIdFabricated !== false
    || reviewMutationGate?.expected?.decisionWrite !== "BLOCKED_POLICY_NOT_READY"
    || reviewMutationGate?.expected?.decisionPersisted !== false
    || factCorrectionRemediationFixture?.receiptJoinContract?.joinRule !== "exact receipt equality only"
    || factCorrectionRemediationFixture?.receiptJoinContract?.duplicateConflict !== "same source and receipt with differing identity-critical fields is quarantined; no last-write-wins"
    || factCorrectionRemediationFixture?.receiptJoinContract?.negativeMatch !== "absence may be reported only for a separately bounded query with complete verified coverage; otherwise NO_MATCH is UNRESOLVED"
    || factCorrectionRemediationFixture?.receiptJoinEvaluationReport?.classification !== "PROPOSED_AGGREGATE_ONLY_REPORT_NO_PERSISTED_SOURCE_SNAPSHOTS"
    || !["rssCaptureId", "listCaptureId", "listPagesDeclared", "listPagesFetched", "pageEchoConsistent", "enumerationStatus", "snapshotStability"].every((field) => factCorrectionRemediationFixture?.receiptJoinEvaluationReport?.runFields?.includes(field))
    || !["rssItemsObserved", "listRowsObserved", "duplicateReceiptKeyCount", "duplicateConflictCount", "exactReceiptMatchCount", "exactMatchMetadataDriftCount", "unresolvedCoverageCount"].every((field) => factCorrectionRemediationFixture?.receiptJoinEvaluationReport?.aggregateOnlyMetrics?.includes(field))
    || factCorrectionRemediationFixture?.receiptJoinEvaluationReport?.retentionDecision !== "UNRESOLVED_UNTIL_RIGHTS_ACTION_DECISION"
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.contractStatus !== "PROPOSED_NOT_CURRENT_UI_OR_RUNTIME"
    || !["UNRESOLVED_COVERAGE", "IDENTITY_CONFLICT", "METADATA_DRIFT_REVIEW", "DUPLICATE_RECEIPT_CONFLICT", "SINGLE_SOURCE_OBSERVATION"].every((state) => factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.states?.some((item) => item.state === state))
    || !["decisionId", "priorJoinRevision", "currentCaptureIds", "receiptIds", "decision", "rationale", "evidenceRefs", "reviewerId", "reviewerRole", "decidedAt", "expectedRevision"].every((field) => factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.reviewDecisionFields?.includes(field))
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.decisionRules?.exactReceiptDoesNotProveIssuer !== true
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.decisionRules?.issuerNeedsActiveCommonStockAndDirectImpactEvidence !== true
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.decisionRules?.reviewedLinkedDoesNotBypassRightsOrClaimApproval !== true
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.ui?.page !== "공시 연결 검토"
    || !["joinStatus", "receiptIds", "sourceCaptureIds", "reasonCode", "capturedAt", "queueAge"].every((field) => factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.ui?.queueColumns?.includes(field))
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.ui?.unknownVsMismatch !== "visually distinct states; unknown coverage is never rendered as mismatch or absence"
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.ui?.slo !== "NOT_SET_UNTIL_OWNER_APPROVES"
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.wireframe?.status !== "PROPOSED_TEXT_WIREFRAME_NOT_IMPLEMENTED"
    || !["receipt identity", "submitter identity", "active COMMON_STOCK master", "direct affected-issuer evidence", "source rights/action", "cross-source claim review"].every((gate) => factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.wireframe?.detail?.decisionGates?.includes(gate))
    || !factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.permissionsMatrix?.some((row) => row.surface === "PUBLIC_DART_FEED" && row.access === "PUBLIC")
    || !factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.permissionsMatrix?.some((row) => row.surface === "ADMIN_REVIEW_API" && row.access === "ADMIN_SESSION_REQUIRED_BEFORE_READ")
    || !factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.permissionsMatrix?.some((row) => row.surface === "ADMIN_REVIEW_DECISION_API" && row.access === "NOT_READY_UNTIL_ACTOR_AND_CSRF_POLICY_APPROVED")
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.authorizationGap?.includes("shared password session") !== true
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.mutationSecurityContract?.status !== "PROPOSED_FAIL_CLOSED_CONTRACT_NOT_IMPLEMENTED"
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.mutationSecurityContract?.csrf?.requiredForCookieAuthenticatedMutation !== true
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.mutationSecurityContract?.csrf?.sameSiteIsDefenseInDepthOnly !== true
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.mutationSecurityContract?.csrf?.acceptedApproach !== "UNDECIDED_BY_SECURITY_OWNER"
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.mutationSecurityContract?.csrf?.safeMethodsMustNotMutate !== true
    || factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.mutationSecurityContract?.audit?.includes("never trust client-supplied actor fields") !== true
    || !factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.officialSecurityBasis?.some((item) => item.source === "Next.js Authentication guide" && item.url === "https://nextjs.org/docs/app/guides/authentication")
    || !factCorrectionRemediationFixture?.receiptJoinReviewWorkflow?.officialSecurityBasis?.some((item) => item.source === "OWASP CSRF Prevention Cheat Sheet" && item.url === "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html");
  const factCorrectionRemediationArchitecture = readFileSync(krArchitecturePath, "utf8");
  const factCorrectionRemediationRangeDeclared = requiredFactCorrectionRemediationIds.every((id) => factCorrectionRemediationArchitecture.includes(id.slice(0, 5)))
    && factCorrectionRemediationArchitecture.includes("`FCR-01`–`FCR-49`");
  const missingFactCorrectionRemediationIds = factCorrectionRemediationRangeDeclared ? [] : requiredFactCorrectionRemediationIds;
  const requiredFactCorrectionRemediationTerms = ["오류가 확정된 공시 claim의 product remediation 제안", "source observation history", "transitive consumer set", "REVIEWED_NO_CHANGE", "Remediation case", "자동 매수·매도 지시"];
  const missingFactCorrectionRemediationTerms = requiredFactCorrectionRemediationTerms.filter((term) => !factCorrectionRemediationArchitecture.includes(term));
  if (invalidFactCorrectionRemediationStructure || invalidFactCorrectionRemediationSafety || missingFactCorrectionRemediationIds.length || missingFactCorrectionRemediationTerms.length) {
    console.error(`Fact correction remediation contract incomplete: ${[...(invalidFactCorrectionRemediationStructure ? ["fixture version/data policy/layers/states/dimensions/vector IDs"] : []), ...(invalidFactCorrectionRemediationSafety ? ["unresolved relation/closure/recalculation/recommendation/completion fail-closed expectations"] : []), ...missingFactCorrectionRemediationIds, ...missingFactCorrectionRemediationTerms].join(", ")}`);
    process.exit(1);
  }
  const disclosurePlanningIndexPath = join(root, "docs", "architecture", "kr-disclosure-investment-planning-index.md");
  const disclosurePlanningIndex = readFileSync(disclosurePlanningIndexPath, "utf8");
  const disclosurePlanningRequiredTerms = ["문서 상태", "사용자 결과", "P1", "KR-DART-RIGHTS-01", "fact-correction-remediation.v0.json", "disclosure-rights-surface-inventory.v0.json", "disclosure-investment-evidence-gate.v0.json", "disclosure-investment-gold-set-protocol.v0.json", "disclosure-investment-dossier-projection.v0.json", "investment-evidence-gap-followup.v0.json", "correction-delivery-reconciliation.v0.json", "별도 판정 필요", "DEVELOPMENT_LOG.md", "read-only discovery package", "identity·eligibility packet과 source-window coverage packet을 별도 제출", "source-window coverage 설계", "P0 22개 결정 ID와 discovery packet crosswalk", "NOT_ASSIGNED", "NOT_REQUESTED", "R2 저장소 query profile과 공식 가이드 교차 확인", "OPENDART_LIST_JSON", "last_reprt_at=N", "status=013", "SYNTHETIC_SOURCE_PROFILE_PROPOSAL_NOT_RUNTIME_HASH", "TITLE_TRIAGE_ONLY", "제목 후보→근거 검토→issuer dossier→명시적 사건 구독"];
  const disclosurePlanningTermsMissing = disclosurePlanningRequiredTerms.filter((term) => !disclosurePlanningIndex.includes(term));
  const decisionRegisterForPlanning = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-register.v0.json"), "utf8"));
  const planningDecisionCrosswalk = disclosurePlanningIndex.match(/### P0 22개 결정 ID와 discovery packet crosswalk\r?\n([\s\S]*?)\r?\n## R0 저장소 현황 요약/)?.[1] ?? "";
  const planningDecisionRows = [...planningDecisionCrosswalk.matchAll(/^\| `(KR-[A-Z-]+-\d{2})` \|([^\n]+)$/gm)].map((match) => ({ decisionId: match[1], cells: match[2].split("|").slice(0, -1).map((cell) => cell.trim()) }));
  const planningDecisionRowById = new Map(planningDecisionRows.map((row) => [row.decisionId, row.cells]));
  const missingPlanningDecisionIds = (decisionRegisterForPlanning.decisions ?? []).filter((decision) => {
    const cells = planningDecisionRowById.get(decision.decisionId);
    return !cells || cells.length !== 4 || cells[1] !== decision.ownerRole || cells[2] !== "`NOT_ASSIGNED`" || !cells[3].endsWith("?");
  }).map((decision) => decision.decisionId);
  const inaccuratePlanningDecisionCount = (decisionRegisterForPlanning.decisions ?? []).length !== 22 || !planningDecisionCrosswalk.includes("22개") || planningDecisionRows.length !== 22 || new Set(planningDecisionRows.map((row) => row.cells[0])).size !== 5;
  const syntheticContractCheckpoint = disclosurePlanningIndex.match(/### R1 합성 contract checkpoint — 2026-11-04\r?\n([\s\S]*?)\r?\n## R2 저장소 query profile과 공식 가이드 교차 확인/)?.[1] ?? "";
  const requiredSyntheticCheckpointTerms = ["PASS_SYNTHETIC_CONTRACT", "disclosure-rights-surface-inventory.v0.json", "instrument-identity-temporal-crosswalk.v0.json` ITC-01–37", "disclosure-source-coverage.v0.json` DSC-01–27", "DBI-01–10", "issuer-capital-state-reconciliation.v0.json` 16 vectors", "issuer-risk-status-timeline.v0.json` 18", "investment-effect-projection-bridge.v0.json` 15", "disclosure-counterevidence-review.v0.json` DCR-01–18", "decision-register-lifecycle.v0.json` DRL-01–15", "decision-ledger-checkpoint.v0.json` DLCP vectors 8", "R0 named owner"];
  const missingSyntheticCheckpointTerms = requiredSyntheticCheckpointTerms.filter((term) => !syntheticContractCheckpoint.includes(term));
  const syntheticCheckpointRows = [...syntheticContractCheckpoint.matchAll(/^\| [^|]+ \|[^\n]*\| `PASS_SYNTHETIC_CONTRACT` \|/gm)];
  const priorityStageIds = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7"];
  const parsePriorityStageStatuses = (content) => Object.fromEntries([...content.matchAll(/^\| (P[0-7]) \|[^|]*\| ([^|]+) \|/gm)].map((match) => {
    const status = match[2].replaceAll("`", "").trim().split(";", 1)[0].trim();
    return [match[1], status.startsWith("BLOCKED_BY_DECISION") ? "BLOCKED_BY_DECISION" : status];
  }));
  const planningPriorityStatuses = parsePriorityStageStatuses(disclosurePlanningIndex);
  const architectureBacklogSection = architecture.match(/### 개선 백로그\r?\n([\s\S]*?)\r?\n### 다음 검토 단위/)?.[1] ?? "";
  const discoveryPackageSection = architecture.match(/### P0 read-only discovery package와 결정 입력물\r?\n([\s\S]*?)\r?\n### P2 진행 기록/)?.[1] ?? "";
  const requiredDiscoveryPacketTerms = ["권리·source surface", "identity·eligibility", "source-window coverage·query·correction", "분석·사건 정책·수용", "저장·consumer closure", "다섯 packet", "필수 분모와 연결", "fetched·parsed·persisted·rejected·duplicate count", "future completeness", "reopen trigger"];
  const missingDiscoveryPacketTerms = requiredDiscoveryPacketTerms.filter((term) => !discoveryPackageSection.includes(term));
  const architecturePriorityStatuses = parsePriorityStageStatuses(architectureBacklogSection);
  const invalidPlanningPriorityAlignment = !isDeepStrictEqual(Object.keys(planningPriorityStatuses), priorityStageIds)
    || !isDeepStrictEqual(Object.keys(architecturePriorityStatuses), priorityStageIds)
    || !isDeepStrictEqual(planningPriorityStatuses, architecturePriorityStatuses)
    || planningPriorityStatuses.P0 !== "IN_PROGRESS"
    || priorityStageIds.slice(1).some((id) => !planningPriorityStatuses[id]?.startsWith("BLOCKED_BY_DECISION"));
  const oversizedArchitecture = statSync(krArchitecturePath).size > 300_000;
  const planningIndexEntry = JSON.parse(readFileSync(join(root, "public", "document-catalog.json"), "utf8")).documents.find((entry) => entry.sourcePath === "docs/architecture/kr-disclosure-investment-planning-index.md");
  const oversizedArchitectureCatalogEntry = JSON.parse(readFileSync(join(root, "public", "document-catalog.json"), "utf8")).documents.some((entry) => entry.sourcePath === "docs/architecture/kr-disclosure-event-architecture.md");
  if (disclosurePlanningTermsMissing.length || missingPlanningDecisionIds.length || inaccuratePlanningDecisionCount || missingSyntheticCheckpointTerms.length || syntheticCheckpointRows.length !== 5 || missingDiscoveryPacketTerms.length || invalidPlanningPriorityAlignment || !planningIndexEntry || (oversizedArchitecture && oversizedArchitectureCatalogEntry)) {
    console.error(`Disclosure planning index incomplete: ${[...disclosurePlanningTermsMissing, ...missingPlanningDecisionIds, ...(inaccuratePlanningDecisionCount ? ["P0 crosswalk denominator must match the canonical 22-decision register"] : []), ...missingSyntheticCheckpointTerms, ...(syntheticCheckpointRows.length !== 5 ? ["R1 synthetic checkpoint must report all five packet types"] : []), ...missingDiscoveryPacketTerms, ...(invalidPlanningPriorityAlignment ? ["P0-P7 priority IDs/statuses must match the detailed architecture and unresolved stages stay blocked"] : []), ...(!planningIndexEntry ? ["planning index is not published in the document catalog"] : []), ...(oversizedArchitecture && oversizedArchitectureCatalogEntry ? ["oversized architecture source bypasses the catalog size exclusion"] : [])].join(", ")}`);
    process.exit(1);
  }
  const eventPriceObservationFixturePath = join(root, "docs", "fixtures", "disclosure", "event-price-observation.v0.json");
  const requiredEventPriceObservationIds = [
    "EPO-01-EXACT-PREMARKET-ANNOUNCEMENT-USES-NEXT-REGULAR-OPEN", "EPO-02-EXACT-INTRADAY-ANNOUNCEMENT-CANNOT-USE-DAILY-CLOSE-ORDER", "EPO-03-DATE-ONLY-FILING-DOES-NOT-PIN-REACTION-START",
    "EPO-04-LATEST-REVISED-CANDLE-IS-NOT-POINT-IN-TIME-OBSERVATION", "EPO-05-RETURN-REQUIRES-MATCHED-CURRENCY-AND-CORPORATE-ACTION-BASIS", "EPO-06-BENCHMARK-SESSION-MISMATCH-OMITS-ADJUSTED-COMPARISON",
    "EPO-07-TRADING-HALT-IS-NOT-ZERO-RETURN", "EPO-08-PRICE-VENDOR-CORRECTION-EXPIRES-PRIOR-RESULT", "EPO-09-SAME-WINDOW-SECONDARY-FILING-MARKS-CONFOUNDING",
    "EPO-10-MULTI-INSTRUMENT-SNAPSHOT-MUST-NOT-MIX-ASOF", "EPO-11-WINDOW-POLICY-IS-FROZEN-BEFORE-OUTCOME-INSPECTION",
    "EPO-12-COHORT-DENOMINATOR-RETAINS-DELISTED-HALTED-AND-MISSING-CASES", "EPO-13-CURRENT-CONSTITUENTS-DO-NOT-SUBSTITUTE-FOR-ASOF-COMPARATOR",
    "EPO-14-UNSEARCHED-CONFOUNDER-SCOPE-IS-NOT-CLEAN-EVENT", "EPO-15-MULTIPLE-WINDOW-SENSITIVITY-DOES-NOT-PICK-A-FAVORABLE-RESULT",
    "EPO-16-FILING-ACCEPTANCE-TIME-IS-NOT-PUBLIC-AVAILABILITY-TIME", "EPO-17-TIMEZONE-OR-PRECISION-UNKNOWN-KEEPS-SESSION-AMBIGUOUS",
    "EPO-18-INCOMPLETE-HISTORICAL-MASTER-BLOCKS-COHORT-DENOMINATOR", "EPO-19-INFORMATIVE-OUTCOME-MISSINGNESS-IS-NOT-ZERO-OR-FORWARD-FILLED",
    "EPO-20-PRE-EVENT-PRICE-TREND-IS-SEPARATE-CONTEXT-NOT-CAUSAL-CONTROL", "EPO-21-COMPARATOR-SIGN-CONFLICT-IS-REPORTED-AS-SENSITIVITY",
    "EPO-22-SUBGROUPS-ARE-FROZEN-BEFORE-OUTCOME-INSPECTION", "EPO-23-SMALL-OR-UNRESOLVED-SUBGROUP-DOES-NOT-INHERIT-COHORT-PASS",
    "EPO-24-MULTIPLE-TEST-FAMILY-REQUIRES-PREDECLARED-OWNER-POLICY",
    "EPO-25-SAME-INPUT-POLICY-AND-ARTIFACT-MUST-REPLAY-SAME-DIGEST", "EPO-26-INPUT-OR-POLICY-REVISION-CHANGE-EXPIRES-CURRENT-RESULT",
    "EPO-27-REPLAY-DIGEST-MISMATCH-IS-NOT-SILENTLY-ACCEPTED",
    "EPO-28-HASH-INTEGRITY-DOES-NOT-MEAN-SOURCE-REPLAY-IS-AUTHORIZED", "EPO-29-UNAVAILABLE-OR-UNAUTHORIZED-REACQUISITION-EXPIRES-CURRENT-REPLAY-CLAIM",
    "EPO-30-TERMS-REVISION-REOPENS-AFFECTED-PRICE-ACTIONS", "EPO-31-PRICE-RIGHTS-AND-EVENT-STUDY-SHADOW-GATES-ARE-BOTH-REQUIRED",
    "EPO-32-PRICE-REVISION-EXPIRES-DEPENDENT-RUN-AND-DESCENDANTS", "EPO-33-CORPORATE-ACTION-REVISION-REQUIRES-BASIS-CONSISTENT-REPLAY", "EPO-34-BENCHMARK-REVISION-INVALIDATES-ONLY-DEPENDENT-ADJUSTED-RESULTS",
    "EPO-35-REPLAY-RECOVERY-REQUIRES-NEW-REVIEW-AND-ATOMIC-PROJECTION",
    "EPO-36-CONCURRENT-IDENTICAL-REPLAY-PUBLISHERS-ARE-IDEMPOTENT", "EPO-37-LATE-STALE-REPLAY-CANNOT-OVERWRITE-NEWER-DEPENDENCY",
    "EPO-38-RIGHTS-REVOCATION-BETWEEN-PROJECTION-COMMIT-AND-DISPATCH-REUSES-IRAP-DUES",
    "EPO-39-RIGHTS-REGRANT-DOES-NOT-RESURRECT-OLD-ANALYSIS-OR-DELIVERY",
  ];
  let eventPriceObservationFixture;
  try {
    const fixtureSource = readFileSync(eventPriceObservationFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    eventPriceObservationFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Event price observation fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const eventPriceObservationIds = (eventPriceObservationFixture?.vectors ?? []).map((vector) => vector?.id);
  const eventPriceObservationById = new Map((eventPriceObservationFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredPriceSnapshotFields = ["snapshotId", "instrumentId", "marketAndVenue", "candleKey", "barStartOrDate", "barEnd", "observedAtUtc", "fetchedAtUtc", "sourceProvider", "sourceRevisionOrPayloadHash", "priceBasis", "currency", "sessionCalendarRevision", "corporateActionBasis", "snapshotManifestHash"];
  const requiredEventStudyFields = ["eventWindowPolicyId", "policyFrozenAt", "cohortDefinitionHash", "inclusionExclusionCounts", "comparatorPolicyRevision", "comparatorCandidateSetHash", "preEventContextWindowPolicyRevision", "confounderSearchScope", "sensitivityWindowSet", "subgroupFamilyId", "minimumSamplePolicyRevision", "multiplicityPolicyRevision", "analysisRunManifest", "analysisRunHash", "inputRevisionSetHash", "corporateActionRevisionSetHash", "dependencyClosureHash", "resultLineageStatus"];
  const requiredAnalysisRunManifestFields = ["algorithmVersion", "codeArtifactHash", "runtimeVersion", "canonicalization", "inputManifestHash", "policySetHash", "environmentFingerprint", "resultDigest"];
  const requiredReplayRightsFields = ["sourceAction", "rightsDecisionRevision", "allowedRetentionClass", "replayPayloadAvailability", "reexecutionPermission"];
  const requiredGovernanceDecisionIds = ["KR-MARKET-DATA-RIGHTS-01", "KR-RETENTION-01", "KR-EVENT-STUDY-POLICY-01", "KR-SHADOW-SLO-01", "KR-END-TO-END-ACCEPTANCE-01"];
  const requiredAnnouncementTimeBasisFields = ["filingAcceptedAt", "firstPublicAvailabilityAt", "timestampSource", "timezone", "precision", "availabilityEvidenceRef"];
  const requiredCohortCoverageFields = ["candidateReceiptSetHash", "historicalInstrumentMasterRevision", "eligibilityAsOf", "listingLifecycleCoverage", "unresolvedEligibilityCount", "outcomeMissingnessDispositionByReason"];
  const invalidEventPriceObservationStructure = eventPriceObservationFixture?.contractVersion !== "event-price-observation.v0"
    || eventPriceObservationFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || eventPriceObservationFixture?.dataPolicy?.containsRealFiling !== false
    || eventPriceObservationFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || eventPriceObservationFixture?.dataPolicy?.containsRealPriceSeries !== false
    || eventPriceObservationFixture?.dataPolicy?.containsSourceBody !== false
    || eventPriceObservationFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || !["CONFOUNDER_SCOPE_UNASSESSED", "EXPLORATORY_SENSITIVITY_ONLY", "PUBLICATION_TIME_UNVERIFIED"].every((state) => eventPriceObservationFixture?.reactionStates?.includes(state))
    || !["EXACT_INSTANT", "DATE_ONLY", "UNKNOWN"].every((state) => eventPriceObservationFixture?.timePrecisionStates?.includes(state))
    || !["OBSERVED_AS_OF", "LATEST_REVISED_ONLY", "MISSING", "BASIS_UNKNOWN", "CONFLICTED"].every((state) => eventPriceObservationFixture?.priceObservationStates?.includes(state))
    || requiredPriceSnapshotFields.some((field) => !eventPriceObservationFixture?.requiredSnapshotFields?.includes(field))
    || requiredEventStudyFields.some((field) => !eventPriceObservationFixture?.requiredStudyFields?.includes(field))
    || requiredAnnouncementTimeBasisFields.some((field) => !eventPriceObservationFixture?.announcementTimeBasisFields?.includes(field))
    || requiredCohortCoverageFields.some((field) => !eventPriceObservationFixture?.requiredCohortCoverageFields?.includes(field))
    || requiredAnalysisRunManifestFields.some((field) => !eventPriceObservationFixture?.requiredAnalysisRunManifestFields?.includes(field))
    || requiredReplayRightsFields.some((field) => !eventPriceObservationFixture?.requiredReplayRightsFields?.includes(field))
    || requiredGovernanceDecisionIds.some((id) => !eventPriceObservationFixture?.requiredGovernanceDecisionIds?.includes(id))
    || !["runId", "startedAt", "completedAt", "workerId"].every((field) => eventPriceObservationFixture?.analysisDigestExclusions?.includes(field))
    || eventPriceObservationFixture?.ownerControlledAnalysisPolicies?.minimumSubgroupSampleSize !== "NOT_SET_BY_OWNER"
    || eventPriceObservationFixture?.ownerControlledAnalysisPolicies?.multiplicityAdjustmentMethod !== "NOT_SET_BY_OWNER"
    || eventPriceObservationFixture?.ownerControlledAnalysisPolicies?.confirmatorySignificanceThreshold !== "NOT_SET_BY_OWNER"
    || eventPriceObservationFixture?.ownerControlledAnalysisPolicies?.inferentialPublicationApproval !== "NOT_APPROVED"
    || eventPriceObservationFixture?.vectors?.length !== requiredEventPriceObservationIds.length
    || new Set(eventPriceObservationIds).size !== eventPriceObservationIds.length
    || requiredEventPriceObservationIds.some((id) => !eventPriceObservationById.has(id));
  const eventPriceIntraday = eventPriceObservationById.get("EPO-02-EXACT-INTRADAY-ANNOUNCEMENT-CANNOT-USE-DAILY-CLOSE-ORDER");
  const eventPriceDateOnly = eventPriceObservationById.get("EPO-03-DATE-ONLY-FILING-DOES-NOT-PIN-REACTION-START");
  const eventPriceMutableCache = eventPriceObservationById.get("EPO-04-LATEST-REVISED-CANDLE-IS-NOT-POINT-IN-TIME-OBSERVATION");
  const eventPriceHalt = eventPriceObservationById.get("EPO-07-TRADING-HALT-IS-NOT-ZERO-RETURN");
  const eventPriceMixedAsOf = eventPriceObservationById.get("EPO-10-MULTI-INSTRUMENT-SNAPSHOT-MUST-NOT-MIX-ASOF");
  const eventPricePostHocWindow = eventPriceObservationById.get("EPO-11-WINDOW-POLICY-IS-FROZEN-BEFORE-OUTCOME-INSPECTION");
  const eventPriceCohortDenominator = eventPriceObservationById.get("EPO-12-COHORT-DENOMINATOR-RETAINS-DELISTED-HALTED-AND-MISSING-CASES");
  const eventPriceComparatorMembership = eventPriceObservationById.get("EPO-13-CURRENT-CONSTITUENTS-DO-NOT-SUBSTITUTE-FOR-ASOF-COMPARATOR");
  const eventPriceConfounderScope = eventPriceObservationById.get("EPO-14-UNSEARCHED-CONFOUNDER-SCOPE-IS-NOT-CLEAN-EVENT");
  const eventPriceSensitivity = eventPriceObservationById.get("EPO-15-MULTIPLE-WINDOW-SENSITIVITY-DOES-NOT-PICK-A-FAVORABLE-RESULT");
  const eventPriceAcceptedVsPublic = eventPriceObservationById.get("EPO-16-FILING-ACCEPTANCE-TIME-IS-NOT-PUBLIC-AVAILABILITY-TIME");
  const eventPriceUnknownTimezone = eventPriceObservationById.get("EPO-17-TIMEZONE-OR-PRECISION-UNKNOWN-KEEPS-SESSION-AMBIGUOUS");
  const eventPriceIncompleteHistoricalMaster = eventPriceObservationById.get("EPO-18-INCOMPLETE-HISTORICAL-MASTER-BLOCKS-COHORT-DENOMINATOR");
  const eventPriceInformativeMissingness = eventPriceObservationById.get("EPO-19-INFORMATIVE-OUTCOME-MISSINGNESS-IS-NOT-ZERO-OR-FORWARD-FILLED");
  const eventPricePreTrendContext = eventPriceObservationById.get("EPO-20-PRE-EVENT-PRICE-TREND-IS-SEPARATE-CONTEXT-NOT-CAUSAL-CONTROL");
  const eventPriceComparatorSensitivity = eventPriceObservationById.get("EPO-21-COMPARATOR-SIGN-CONFLICT-IS-REPORTED-AS-SENSITIVITY");
  const eventPricePostHocSubgroup = eventPriceObservationById.get("EPO-22-SUBGROUPS-ARE-FROZEN-BEFORE-OUTCOME-INSPECTION");
  const eventPriceSmallSubgroup = eventPriceObservationById.get("EPO-23-SMALL-OR-UNRESOLVED-SUBGROUP-DOES-NOT-INHERIT-COHORT-PASS");
  const eventPriceMultiplicity = eventPriceObservationById.get("EPO-24-MULTIPLE-TEST-FAMILY-REQUIRES-PREDECLARED-OWNER-POLICY");
  const eventPriceReplayMatch = eventPriceObservationById.get("EPO-25-SAME-INPUT-POLICY-AND-ARTIFACT-MUST-REPLAY-SAME-DIGEST");
  const eventPriceRevisionExpiry = eventPriceObservationById.get("EPO-26-INPUT-OR-POLICY-REVISION-CHANGE-EXPIRES-CURRENT-RESULT");
  const eventPriceReplayMismatch = eventPriceObservationById.get("EPO-27-REPLAY-DIGEST-MISMATCH-IS-NOT-SILENTLY-ACCEPTED");
  const eventPriceHashOnlyReplay = eventPriceObservationById.get("EPO-28-HASH-INTEGRITY-DOES-NOT-MEAN-SOURCE-REPLAY-IS-AUTHORIZED");
  const eventPriceUnauthorizedReplay = eventPriceObservationById.get("EPO-29-UNAVAILABLE-OR-UNAUTHORIZED-REACQUISITION-EXPIRES-CURRENT-REPLAY-CLAIM");
  const eventPriceTermsRevision = eventPriceObservationById.get("EPO-30-TERMS-REVISION-REOPENS-AFFECTED-PRICE-ACTIONS");
  const eventPriceShadowGate = eventPriceObservationById.get("EPO-31-PRICE-RIGHTS-AND-EVENT-STUDY-SHADOW-GATES-ARE-BOTH-REQUIRED");
  const eventPriceInputRevision = eventPriceObservationById.get("EPO-32-PRICE-REVISION-EXPIRES-DEPENDENT-RUN-AND-DESCENDANTS");
  const eventPriceCorporateActionRevision = eventPriceObservationById.get("EPO-33-CORPORATE-ACTION-REVISION-REQUIRES-BASIS-CONSISTENT-REPLAY");
  const eventPriceBenchmarkRevision = eventPriceObservationById.get("EPO-34-BENCHMARK-REVISION-INVALIDATES-ONLY-DEPENDENT-ADJUSTED-RESULTS");
  const eventPriceReplayRecovery = eventPriceObservationById.get("EPO-35-REPLAY-RECOVERY-REQUIRES-NEW-REVIEW-AND-ATOMIC-PROJECTION");
  const eventPriceConcurrentReplay = eventPriceObservationById.get("EPO-36-CONCURRENT-IDENTICAL-REPLAY-PUBLISHERS-ARE-IDEMPOTENT");
  const eventPriceLateStaleReplay = eventPriceObservationById.get("EPO-37-LATE-STALE-REPLAY-CANNOT-OVERWRITE-NEWER-DEPENDENCY");
  const eventPriceRevokedBeforeDispatch = eventPriceObservationById.get("EPO-38-RIGHTS-REVOCATION-BETWEEN-PROJECTION-COMMIT-AND-DISPATCH-REUSES-IRAP-DUES");
  const eventPriceRightsRegrant = eventPriceObservationById.get("EPO-39-RIGHTS-REGRANT-DOES-NOT-RESURRECT-OLD-ANALYSIS-OR-DELIVERY");
  const invalidEventPriceObservationSafety = eventPriceIntraday?.expected?.reactionState !== "DAILY_ONLY_WINDOW_AMBIGUOUS"
    || eventPriceIntraday?.expected?.sameDateCloseAsPostEventProof !== false
    || eventPriceDateOnly?.expected?.exactStartInstant !== null
    || eventPriceMutableCache?.expected?.pointInTimeClaim !== false
    || eventPriceMutableCache?.expected?.reactionState !== "NOT_REPRODUCIBLE"
    || eventPriceHalt?.expected?.return !== null
    || eventPriceMixedAsOf?.expected?.publishedRowCount !== 0
    || eventPricePostHocWindow?.expected?.confirmatoryResult !== "BLOCKED_POST_HOC_WINDOW"
    || eventPriceCohortDenominator?.expected?.denominator !== 50
    || eventPriceCohortDenominator?.expected?.survivorOnlySummary !== false
    || eventPriceComparatorMembership?.expected?.adjustedComparison !== "NOT_COMPUTABLE"
    || eventPriceConfounderScope?.expected?.reactionState !== "CONFOUNDER_SCOPE_UNASSESSED"
    || eventPriceConfounderScope?.expected?.singleEventCausality !== false
    || eventPriceSensitivity?.expected?.reactionState !== "EXPLORATORY_SENSITIVITY_ONLY"
    || eventPriceSensitivity?.expected?.windowCherryPicking !== false
    || eventPriceAcceptedVsPublic?.expected?.reactionState !== "PUBLICATION_TIME_UNVERIFIED"
    || eventPriceAcceptedVsPublic?.expected?.reactionStartInstant !== null
    || eventPriceAcceptedVsPublic?.expected?.sameDayPriceChangeAsEventReaction !== false
    || eventPriceUnknownTimezone?.expected?.sessionAssignment !== "UNKNOWN"
    || eventPriceUnknownTimezone?.expected?.eventWindowStart !== null
    || eventPriceIncompleteHistoricalMaster?.expected?.cohortState !== "DENOMINATOR_UNVERIFIED"
    || eventPriceIncompleteHistoricalMaster?.expected?.candidateReceiptsRetained !== 50
    || eventPriceIncompleteHistoricalMaster?.expected?.headlineReturnStatistic !== null
    || eventPriceInformativeMissingness?.expected?.fullCohortReturnStatistic !== null
    || eventPriceInformativeMissingness?.expected?.missingValuesImputed !== false
    || eventPriceInformativeMissingness?.expected?.completeOutcomeClaim !== false
    || eventPricePreTrendContext?.expected?.preEventTrendReportedSeparately !== true
    || eventPricePreTrendContext?.expected?.eventWindowReturnRewrittenByPreTrend !== false
    || eventPricePreTrendContext?.expected?.trendAdjustedCausalEffect !== "NOT_ESTABLISHED"
    || eventPricePreTrendContext?.expected?.windowPolicyValid !== true
    || eventPriceComparatorSensitivity?.expected?.bothComparatorResultsReported !== true
    || eventPriceComparatorSensitivity?.expected?.bestResultSelectedAsConfirmatory !== false
    || eventPriceComparatorSensitivity?.expected?.causalClaim !== false
    || eventPriceComparatorSensitivity?.expected?.primaryComparator !== "BROAD_MARKET_INDEX"
    || eventPriceComparatorSensitivity?.expected?.sensitivityState !== "COMPARATOR_DEPENDENT_EXPLORATORY"
    || eventPricePostHocSubgroup?.expected?.confirmatorySubgroupResult !== "BLOCKED_POST_HOC_STRATIFICATION"
    || eventPricePostHocSubgroup?.expected?.selectedWinnerHeadline !== false
    || eventPricePostHocSubgroup?.expected?.overallCohortDenominatorPreserved !== true
    || eventPriceSmallSubgroup?.expected?.inferentialClaim !== "NOT_AVAILABLE"
    || eventPriceSmallSubgroup?.expected?.parentCohortAcceptanceInherited !== false
    || eventPriceMultiplicity?.expected?.confirmatorySignificanceClaim !== "BLOCKED_POLICY_UNSET_OR_POST_HOC"
    || eventPriceMultiplicity?.expected?.adjustmentMethodInvented !== false
    || eventPriceMultiplicity?.expected?.bestPValueHeadline !== false
    || eventPriceReplayMatch?.expected?.replayState !== "DETERMINISTIC_MATCH"
    || eventPriceReplayMatch?.expected?.executionMetadataExcludedFromDigest !== true
    || eventPriceRevisionExpiry?.expected?.priorResultState !== "EXPIRED_FOR_CURRENT_VIEW"
    || eventPriceRevisionExpiry?.expected?.priorResultOverwritten !== false
    || eventPriceReplayMismatch?.expected?.runState !== "REPRODUCIBILITY_MISMATCH"
    || eventPriceReplayMismatch?.expected?.currentResultPublication !== "SUPPRESSED_PENDING_REVIEW"
    || eventPriceReplayMismatch?.expected?.automaticResultSelection !== false
    || eventPriceHashOnlyReplay?.expected?.replayability !== "HASH_ONLY_INTEGRITY_NOT_REPLAYABLE"
    || eventPriceHashOnlyReplay?.expected?.hashMatchProvesInputBytesAvailable !== false
    || eventPriceHashOnlyReplay?.expected?.authorizedReexecution !== false
    || eventPriceUnauthorizedReplay?.expected?.currentReplayability !== "NOT_REPRODUCIBLE"
    || eventPriceUnauthorizedReplay?.expected?.currentConfirmatoryPublication !== "SUPPRESSED"
    || eventPriceUnauthorizedReplay?.expected?.rightsDecisionBypassed !== false
    || eventPriceTermsRevision?.expected?.affectedCurrentRunState !== "EXPIRED_RIGHTS_REVISION"
    || eventPriceTermsRevision?.expected?.legacyApprovalInherited !== false
    || eventPriceTermsRevision?.expected?.affectedActionPublication !== "SUPPRESSED"
    || eventPriceShadowGate?.expected?.shadowAcceptance !== "NOT_ACCEPTED"
    || eventPriceShadowGate?.expected?.automaticRankingOrRecommendation !== false
    || eventPriceShadowGate?.expected?.positivePriceResultOverridesGates !== false
    || eventPriceInputRevision?.expected?.affectedRunCurrentState !== "STALE_INPUT_REVISION"
    || eventPriceInputRevision?.expected?.dependentProjectionPublished !== false
    || eventPriceInputRevision?.expected?.priorRunHistoryPreserved !== true
    || eventPriceInputRevision?.expected?.unrelatedRunInvalidated !== false
    || eventPriceCorporateActionRevision?.expected?.affectedRunsExpired !== true
    || eventPriceCorporateActionRevision?.expected?.rawAndAdjustedBasisMixed !== false
    || eventPriceCorporateActionRevision?.expected?.priorRunsOverwritten !== false
    || eventPriceCorporateActionRevision?.expected?.unrelatedInstrumentRunInvalidated !== false
    || eventPriceBenchmarkRevision?.expected?.runAState !== "STALE_BENCHMARK_REVISION"
    || eventPriceBenchmarkRevision?.expected?.runAPublication !== "SUPPRESSED"
    || eventPriceBenchmarkRevision?.expected?.runBOverInvalidated !== false
    || eventPriceBenchmarkRevision?.expected?.benchmarkRightBypass !== false
    || eventPriceReplayRecovery?.expected?.priorRunOrApprovalMutated !== false
    || eventPriceReplayRecovery?.expected?.priorApprovalInherited !== false
    || eventPriceReplayRecovery?.expected?.newReviewBindsExactInputPolicyArtifactAndResult !== true
    || eventPriceReplayRecovery?.expected?.publicationEpochAdvancedExactlyOnce !== true
    || eventPriceReplayRecovery?.expected?.allConsumersUseNewSnapshotAndEpoch !== true
    || eventPriceReplayRecovery?.expected?.duplicateNotificationForSameLogicalResult !== false
    || eventPriceReplayRecovery?.expected?.noPartialOrStaleFallback !== true
    || eventPriceConcurrentReplay?.expected?.onePublicationEpochAdvance !== true
    || eventPriceConcurrentReplay?.expected?.logicalNotificationOutboxEntries !== 1
    || eventPriceConcurrentReplay?.expected?.lastWriteWins !== false
    || eventPriceLateStaleReplay?.expected?.publisherACommit !== "REJECTED_STALE_FENCE_OR_DEPENDENCY_CAS"
    || eventPriceLateStaleReplay?.expected?.currentProjectionRemainsRevisionB !== true
    || eventPriceLateStaleReplay?.expected?.staleWorkerNotificationAllowed !== false
    || eventPriceRevokedBeforeDispatch?.expected?.publicReadReturnsRevokedSnapshot !== false
    || eventPriceRevokedBeforeDispatch?.expected?.queuedNotificationDispatch !== false
    || eventPriceRevokedBeforeDispatch?.expected?.dispatchRevalidatesCurrentEpochRightsAndSubscription !== true
    || eventPriceRevokedBeforeDispatch?.expected?.alreadyAcceptedDeliveryTreatedAsAutomaticallyRetracted !== false
    || eventPriceRevokedBeforeDispatch?.expected?.deliveryReconciliationRequiredWhenPriorExposureExists !== true
    || eventPriceRevokedBeforeDispatch?.expected?.separateEPORevocationStateMachineCreated !== false
    || eventPriceRightsRegrant?.expected?.priorApprovalOrProjectionResurrected !== false
    || eventPriceRightsRegrant?.expected?.newAnalysisRunAndReviewRequired !== true
    || eventPriceRightsRegrant?.expected?.notificationDispatchWithoutCurrentOptIn !== false
    || eventPriceRightsRegrant?.expected?.priorProviderAcceptedDeliveryHistoryMutated !== false
    || eventPriceRightsRegrant?.expected?.rightsRegrantMayBypassUnrelatedOpenGates !== false
    || eventPriceObservationFixture?.vectors?.length !== 39;
  const eventPriceObservationArchitecture = readFileSync(krArchitecturePath, "utf8");
  const eventPriceObservationRangeDeclared = requiredEventPriceObservationIds.every((id) => eventPriceObservationArchitecture.includes(id.slice(0, 5)))
    && eventPriceObservationArchitecture.includes("EPO-15")
    && eventPriceObservationArchitecture.includes("EPO-16")
    && eventPriceObservationArchitecture.includes("EPO-17")
    && eventPriceObservationArchitecture.includes("EPO-18")
    && eventPriceObservationArchitecture.includes("EPO-19")
    && eventPriceObservationArchitecture.includes("EPO-20")
    && eventPriceObservationArchitecture.includes("EPO-21")
    && eventPriceObservationArchitecture.includes("EPO-22")
    && eventPriceObservationArchitecture.includes("EPO-23")
    && eventPriceObservationArchitecture.includes("EPO-24")
    && eventPriceObservationArchitecture.includes("EPO-25")
    && eventPriceObservationArchitecture.includes("EPO-26")
    && eventPriceObservationArchitecture.includes("EPO-27")
    && eventPriceObservationArchitecture.includes("EPO-28")
    && eventPriceObservationArchitecture.includes("EPO-29")
    && eventPriceObservationArchitecture.includes("EPO-30")
    && eventPriceObservationArchitecture.includes("EPO-31")
    && eventPriceObservationArchitecture.includes("EPO-32")
    && eventPriceObservationArchitecture.includes("EPO-33")
    && eventPriceObservationArchitecture.includes("EPO-34")
    && eventPriceObservationArchitecture.includes("EPO-35")
    && eventPriceObservationArchitecture.includes("EPO-36")
    && eventPriceObservationArchitecture.includes("EPO-37")
    && eventPriceObservationArchitecture.includes("EPO-38")
    && eventPriceObservationArchitecture.includes("EPO-39")
    && eventPriceObservationArchitecture.includes("사전 window/cohort/comparator 고정");
  const missingEventPriceObservationIds = eventPriceObservationRangeDeclared ? [] : requiredEventPriceObservationIds;
  const requiredEventPriceObservationTerms = ["Point-in-time price observation snapshot 제안", "LATEST_REVISED_ONLY", "DAILY_ONLY_WINDOW_AMBIGUOUS", "PriceObservationSnapshot", "session calendar revision", "price rights/provider availability", "policyFrozenAt", "Cohort membership", "전체 후보, 포함, 제외 사유별 수", "CONFOUNDER_SCOPE_UNASSESSED", "EXPLORATORY_SENSITIVITY_ONLY", "pre-event price trend", "KRX 공식 지수 방법론 공개 경로", "다중가설 family", "최소 N 정책", "best p-value headline", "같은 input manifest·policy set·code artifact", "REPRODUCIBILITY_MISMATCH", "HASH_ONLY_INTEGRITY_NOT_REPLAYABLE", "EPO-32–39", "재승인 없는 과거 approval 승계 금지", "fencing token", "logical result key", "last-write-wins 금지", "IRAP/DUES", "권리 재허용 후 자동 부활 금지", "KRX/코스콤 정보이용정책"];
  const missingEventPriceObservationTerms = requiredEventPriceObservationTerms.filter((term) => !eventPriceObservationArchitecture.includes(term));
  if (invalidEventPriceObservationStructure || invalidEventPriceObservationSafety || missingEventPriceObservationIds.length || missingEventPriceObservationTerms.length) {
    console.error(`Event price observation contract incomplete: ${[...(invalidEventPriceObservationStructure ? ["fixture version/data policy/states/snapshot fields/vector IDs"] : []), ...(invalidEventPriceObservationSafety ? ["intraday/date-only/mutable-price/halt/as-of fail-closed expectations"] : []), ...missingEventPriceObservationIds, ...missingEventPriceObservationTerms].join(", ")}`);
    process.exit(1);
  }
  const eventDateLifecycleFixturePath = join(root, "docs", "fixtures", "disclosure", "event-date-lifecycle.v0.json");
  const requiredEventDateLifecycleIds = [
    "EDL-01-ESTIMATE-IS-NOT-CONFIRMED-DATE", "EDL-02-ESTIMATE-TO-CONFIRMED-REQUIRES-NEW-DIRECT-EVIDENCE",
    "EDL-03-POSTPONEMENT-APPENDS-ASSERTION-AND-PRESERVES-OLD-DATE", "EDL-04-DATE-PASSED-DOES-NOT-PROVE-EVENT-COMPLETED",
    "EDL-05-COMPLETED-EVENT-DOES-NOT-REWRITE-PLANNED-DATE-ASSERTION", "EDL-06-WITHDRAWAL-MARKER-ALONE-DOES-NOT-CANCEL-UNDERLYING-EVENT",
    "EDL-07-CONFLICTING-DATE-ASSERTIONS-ARE-NOT-LATEST-WINS", "EDL-08-DATE-ONLY-OR-LOCAL-TIME-WITHOUT-ZONE-DOES-NOT-SCHEDULE-TIMED-ALERT",
    "EDL-09-DISTINCT-DATE-KINDS-REMAIN-SEPARATE-ASSERTIONS", "EDL-10-RESPONSE-DOES-NOT-MIX-EVENT-AND-DATE-REVISIONS",
  ];
  let eventDateLifecycleFixture;
  try {
    const fixtureSource = readFileSync(eventDateLifecycleFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    eventDateLifecycleFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Event date lifecycle fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const eventDateLifecycleIds = (eventDateLifecycleFixture?.vectors ?? []).map((vector) => vector?.id);
  const eventDateLifecycleById = new Map((eventDateLifecycleFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidEventDateLifecycleStructure = eventDateLifecycleFixture?.contractVersion !== "event-date-lifecycle.v0"
    || eventDateLifecycleFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || eventDateLifecycleFixture?.dataPolicy?.containsRealFiling !== false
    || eventDateLifecycleFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || eventDateLifecycleFixture?.dataPolicy?.containsSourceBody !== false
    || eventDateLifecycleFixture?.dataPolicy?.containsCredentials !== false
    || eventDateLifecycleFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !["OFFICIAL_CONFIRMED", "COMPANY_ESTIMATE", "REGISTER_ESTIMATE", "THIRD_PARTY_ESTIMATE", "UNKNOWN", "CONTESTED"].every((state) => eventDateLifecycleFixture?.certaintyStates?.includes(state))
    || !["ANNOUNCED", "POSTPONED", "CANCELLED", "COMPLETED", "UNKNOWN"].every((state) => eventDateLifecycleFixture?.eventStatuses?.includes(state))
    || !["dateAssertionId", "eventRevisionId", "dateKind", "value", "precision", "sourceLocator", "certainty", "lifecycleStatus", "supersedesAssertionId", "decisionId"].every((field) => eventDateLifecycleFixture?.dateAssertionFields?.includes(field))
    || eventDateLifecycleFixture?.vectors?.length !== requiredEventDateLifecycleIds.length
    || new Set(eventDateLifecycleIds).size !== eventDateLifecycleIds.length
    || requiredEventDateLifecycleIds.some((id) => !eventDateLifecycleById.has(id));
  const eventDateEstimate = eventDateLifecycleById.get("EDL-01-ESTIMATE-IS-NOT-CONFIRMED-DATE");
  const eventDatePassed = eventDateLifecycleById.get("EDL-04-DATE-PASSED-DOES-NOT-PROVE-EVENT-COMPLETED");
  const eventDateWithdrawal = eventDateLifecycleById.get("EDL-06-WITHDRAWAL-MARKER-ALONE-DOES-NOT-CANCEL-UNDERLYING-EVENT");
  const eventDateConflict = eventDateLifecycleById.get("EDL-07-CONFLICTING-DATE-ASSERTIONS-ARE-NOT-LATEST-WINS");
  const eventDateAlert = eventDateLifecycleById.get("EDL-08-DATE-ONLY-OR-LOCAL-TIME-WITHOUT-ZONE-DOES-NOT-SCHEDULE-TIMED-ALERT");
  const eventDateSnapshot = eventDateLifecycleById.get("EDL-10-RESPONSE-DOES-NOT-MIX-EVENT-AND-DATE-REVISIONS");
  const invalidEventDateLifecycleSafety = eventDateEstimate?.expected?.exactDate !== null
    || eventDateEstimate?.expected?.countdown !== false
    || eventDatePassed?.expected?.completed !== false
    || eventDatePassed?.expected?.cancelled !== false
    || eventDateWithdrawal?.expected?.cancelled !== false
    || eventDateConflict?.expected?.automaticWinner !== null
    || eventDateAlert?.expected?.timedPush !== false
    || eventDateSnapshot?.expected?.publishedRows !== 0;
  const eventDateArchitecture = readFileSync(krArchitecturePath, "utf8");
  const eventDateIdsMissing = requiredEventDateLifecycleIds.filter((id) => !eventDateArchitecture.includes(id.slice(0, 5)));
  const eventDateTermsMissing = ["일정 certainty와 event status 분리", "EDL-01`–`EDL-10", "날짜 경과·피드에서 결과 미발견만으로", "IMMUTABLE", "financing-timeline-scenarios.v0.json"].filter((term) => !eventDateArchitecture.includes(term));
  if (invalidEventDateLifecycleStructure || invalidEventDateLifecycleSafety || eventDateIdsMissing.length || eventDateTermsMissing.length) {
    console.error(`Event date lifecycle contract incomplete: ${[...(invalidEventDateLifecycleStructure ? ["fixture version/data policy/vocabularies/fields/vector IDs"] : []), ...(invalidEventDateLifecycleSafety ? ["estimate/past-date/withdrawal/conflict/alert/snapshot fail-closed expectations"] : []), ...eventDateIdsMissing, ...eventDateTermsMissing].join(", ")}`);
    process.exit(1);
  }
  const eventScheduleNotificationFixturePath = join(root, "docs", "fixtures", "disclosure", "event-schedule-notification.v0.json");
  const requiredEventScheduleNotificationIds = [
    "ESN-01-WATCHLIST-MATCH-DOES-NOT-OPT-IN-TO-EVENT-REMINDERS", "ESN-02-CONFIRMED-DATE-REMINDER-REQUIRES-APPROVED-ASSERTION-AND-OPT-IN",
    "ESN-03-DATE-ONLY-CAN-NOT-CREATE-AN-INVENTED-TIMED-PUSH", "ESN-04-ESTIMATED-DATE-USES-ESTIMATE-RECHECK-LABEL-AND-SEPARATE-OPT-IN",
    "ESN-05-POSTPONEMENT-FENCES-OLD-QUEUED-REMINDER", "ESN-06-OPT-OUT-OR-REVOKED-SUBSCRIPTION-CANCELS-QUEUED-CANDIDATE",
    "ESN-07-DUPLICATE-SCHEDULER-RUNS-ARE-IDEMPOTENT-PER-REVISION", "ESN-08-PASSED-DATE-AND-MISSING-OUTCOME-IS-NOT-A-COMPLETION-REMINDER",
    "ESN-09-USER-LOCAL-TIME-AND-DST-RESOLUTION-REQUIRE-A-VERSIONED-POLICY", "ESN-10-MISSED-REMINDER-OUTAGE-DOES-NOT-CAUSE-UNBOUNDED-CATCHUP-BURST",
    "ESN-11-LOCKSCREEN-PREVIEW-EXCLUDES-SOURCE-AND-PRIVATE-DETAILS", "ESN-12-OPENING-OLD-PUSH-LINK-REVALIDATES-CURRENT-PUBLICATION-EPOCH",
    "ESN-13-OUTCOME-FOLLOWUP-REQUIRES-ITS-OWN-EXPLICIT-OPT-IN", "ESN-14-OUTCOME-FOLLOWUP-REQUIRES-APPROVED-FINITE-POLICY",
    "ESN-15-INCOMPLETE-COVERAGE-IS-UNVERIFIABLE-NOT-NO-OUTCOME", "ESN-16-VERIFIED-OUTCOME-CLOSES-ONLY-THE-LINKED-FOLLOWUP-CYCLE",
    "ESN-17-OUTCOME-FOLLOWUP-IDEMPOTENCY-INCLUDES-CHECK-REVISION-AND-SEQUENCE", "ESN-18-COMPLETE-SCOPE-NO-RESULT-AND-INCOMPLETE-SCOPE-ARE-DIFFERENT",
  ];
  let eventScheduleNotificationFixture;
  try {
    const fixtureSource = readFileSync(eventScheduleNotificationFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    eventScheduleNotificationFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Event schedule notification fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const eventScheduleNotificationIds = (eventScheduleNotificationFixture?.vectors ?? []).map((vector) => vector?.id);
  const eventScheduleNotificationById = new Map((eventScheduleNotificationFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidEventScheduleNotificationStructure = eventScheduleNotificationFixture?.contractVersion !== "event-schedule-notification.v0"
    || eventScheduleNotificationFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || eventScheduleNotificationFixture?.dataPolicy?.containsRealFiling !== false
    || eventScheduleNotificationFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || eventScheduleNotificationFixture?.dataPolicy?.containsPersonalRecipientData !== false
    || eventScheduleNotificationFixture?.dataPolicy?.containsSourceBody !== false
    || eventScheduleNotificationFixture?.dataPolicy?.containsCredentials !== false
    || eventScheduleNotificationFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !["CONFIRMED_DATE_REMINDER", "ESTIMATE_RECHECK", "SCHEDULE_CHANGED", "OUTCOME_NOT_VERIFIED"].every((kind) => eventScheduleNotificationFixture?.notificationKinds?.includes(kind))
    || !["recipientScopeId", "subscriptionRevision", "eventRevisionId", "dateAssertionId", "reminderPolicyRevision", "notificationKind", "channel", "scheduledFor", "timezone", "publicationEpoch", "outcomeCheckRevisionId", "followupSequence"].every((field) => eventScheduleNotificationFixture?.requiredScheduleKeyFields?.includes(field))
    || !["policyRevision", "maxAttempts", "minimumInterval", "cutoffAt", "coverageRequirement", "separateOptInScope"].every((field) => eventScheduleNotificationFixture?.outcomeFollowupPolicyFields?.includes(field))
    || !["OUTCOME_CONFIRMED", "OUTCOME_NOT_REPORTED_IN_COMPLETE_SCOPE", "UNVERIFIABLE_COVERAGE_INCOMPLETE", "CONFLICT_UNRESOLVED"].every((state) => eventScheduleNotificationFixture?.outcomeResolutionStates?.includes(state))
    || eventScheduleNotificationFixture?.vectors?.length !== requiredEventScheduleNotificationIds.length
    || new Set(eventScheduleNotificationIds).size !== eventScheduleNotificationIds.length
    || requiredEventScheduleNotificationIds.some((id) => !eventScheduleNotificationById.has(id));
  const scheduleWatchlist = eventScheduleNotificationById.get("ESN-01-WATCHLIST-MATCH-DOES-NOT-OPT-IN-TO-EVENT-REMINDERS");
  const scheduleDateOnly = eventScheduleNotificationById.get("ESN-03-DATE-ONLY-CAN-NOT-CREATE-AN-INVENTED-TIMED-PUSH");
  const scheduleEstimate = eventScheduleNotificationById.get("ESN-04-ESTIMATED-DATE-USES-ESTIMATE-RECHECK-LABEL-AND-SEPARATE-OPT-IN");
  const scheduleStale = eventScheduleNotificationById.get("ESN-05-POSTPONEMENT-FENCES-OLD-QUEUED-REMINDER");
  const scheduleOptOut = eventScheduleNotificationById.get("ESN-06-OPT-OUT-OR-REVOKED-SUBSCRIPTION-CANCELS-QUEUED-CANDIDATE");
  const scheduleIdempotency = eventScheduleNotificationById.get("ESN-07-DUPLICATE-SCHEDULER-RUNS-ARE-IDEMPOTENT-PER-REVISION");
  const scheduleOutcomeUnknown = eventScheduleNotificationById.get("ESN-08-PASSED-DATE-AND-MISSING-OUTCOME-IS-NOT-A-COMPLETION-REMINDER");
  const scheduleDst = eventScheduleNotificationById.get("ESN-09-USER-LOCAL-TIME-AND-DST-RESOLUTION-REQUIRE-A-VERSIONED-POLICY");
  const scheduleCatchup = eventScheduleNotificationById.get("ESN-10-MISSED-REMINDER-OUTAGE-DOES-NOT-CAUSE-UNBOUNDED-CATCHUP-BURST");
  const schedulePreviewPrivacy = eventScheduleNotificationById.get("ESN-11-LOCKSCREEN-PREVIEW-EXCLUDES-SOURCE-AND-PRIVATE-DETAILS");
  const scheduleStaleLink = eventScheduleNotificationById.get("ESN-12-OPENING-OLD-PUSH-LINK-REVALIDATES-CURRENT-PUBLICATION-EPOCH");
  const outcomeFollowupOptIn = eventScheduleNotificationById.get("ESN-13-OUTCOME-FOLLOWUP-REQUIRES-ITS-OWN-EXPLICIT-OPT-IN");
  const outcomeFollowupPolicy = eventScheduleNotificationById.get("ESN-14-OUTCOME-FOLLOWUP-REQUIRES-APPROVED-FINITE-POLICY");
  const outcomeFollowupCoverage = eventScheduleNotificationById.get("ESN-15-INCOMPLETE-COVERAGE-IS-UNVERIFIABLE-NOT-NO-OUTCOME");
  const outcomeFollowupVerified = eventScheduleNotificationById.get("ESN-16-VERIFIED-OUTCOME-CLOSES-ONLY-THE-LINKED-FOLLOWUP-CYCLE");
  const outcomeFollowupIdempotency = eventScheduleNotificationById.get("ESN-17-OUTCOME-FOLLOWUP-IDEMPOTENCY-INCLUDES-CHECK-REVISION-AND-SEQUENCE");
  const outcomeFollowupEmptyScope = eventScheduleNotificationById.get("ESN-18-COMPLETE-SCOPE-NO-RESULT-AND-INCOMPLETE-SCOPE-ARE-DIFFERENT");
  const invalidEventScheduleNotificationSafety = scheduleWatchlist?.expected?.scheduledCount !== 0
    || scheduleDateOnly?.expected?.timedPush !== false
    || scheduleEstimate?.expected?.confirmedDateReminder !== false
    || scheduleStale?.expected?.oldDateSendAllowed !== false
    || scheduleOptOut?.expected?.dispatch !== false
    || scheduleIdempotency?.expected?.logicalCandidates !== 1
    || scheduleOutcomeUnknown?.expected?.completed !== false
    || scheduleDst?.expected?.utcInstantInvented !== false
    || scheduleCatchup?.expected?.burstDispatch !== false
    || schedulePreviewPrivacy?.expected?.previewContainsSourceQuote !== false
    || schedulePreviewPrivacy?.expected?.previewContainsInvestmentConclusion !== false
    || schedulePreviewPrivacy?.expected?.previewContainsPersonalPortfolioData !== false
    || scheduleStaleLink?.expected?.eventDetailReturned !== false
    || scheduleStaleLink?.expected?.cachedBodyUsedAsFallback !== false
    || outcomeFollowupOptIn?.expected?.outcomeFollowupCandidate !== false
    || outcomeFollowupOptIn?.expected?.confirmedReminderImpliesOutcomeFollowup !== false
    || outcomeFollowupPolicy?.expected?.candidate !== false
    || outcomeFollowupPolicy?.expected?.disposition !== "HOLD_FOR_POLICY"
    || outcomeFollowupPolicy?.expected?.unboundedRepeat !== false
    || outcomeFollowupCoverage?.expected?.resolutionState !== "UNVERIFIABLE_COVERAGE_INCOMPLETE"
    || outcomeFollowupCoverage?.expected?.noOutcomeClaim !== false
    || outcomeFollowupVerified?.expected?.queuedFollowupDispatch !== false
    || outcomeFollowupVerified?.expected?.eventLifecycleAutoMutated !== false
    || outcomeFollowupIdempotency?.expected?.logicalCandidates !== 1
    || outcomeFollowupIdempotency?.expected?.attemptHistoryAppendOnly !== true
    || outcomeFollowupEmptyScope?.expected?.resolutionState !== "OUTCOME_NOT_REPORTED_IN_COMPLETE_SCOPE"
    || outcomeFollowupEmptyScope?.expected?.completed !== false
    || outcomeFollowupEmptyScope?.expected?.cancelled !== false;
  const eventScheduleNotificationArchitecture = readFileSync(krArchitecturePath, "utf8");
  const eventScheduleNotificationIdsMissing = requiredEventScheduleNotificationIds.filter((id) => !eventScheduleNotificationArchitecture.includes(id.slice(0, 5)));
  const eventScheduleNotificationTermsMissing = ["일정 알림 candidate·발송 예약의 fail-closed 계약", "ESN-01`–`ESN-18", "watchlist 등록은 알림 구독이 아니며", "STALE_SUPPRESSED", "catch-up/burst 정책은 owner가 versioned policy", "OS 잠금 화면", "현재 publication gate와 epoch", "결과 미확인 follow-up은 확정 일정 reminder와 별도 opt-in", "UNVERIFIABLE_COVERAGE_INCOMPLETE", "outcomeCheckRevisionId"].filter((term) => !eventScheduleNotificationArchitecture.includes(term));
  if (invalidEventScheduleNotificationStructure || invalidEventScheduleNotificationSafety || eventScheduleNotificationIdsMissing.length || eventScheduleNotificationTermsMissing.length) {
    console.error(`Event schedule notification contract incomplete: ${[...(invalidEventScheduleNotificationStructure ? ["fixture version/data policy/notification kinds/schedule key/vector IDs"] : []), ...(invalidEventScheduleNotificationSafety ? ["opt-in/date-only/estimate/stale/opt-out/idempotency/outcome/timezone/catch-up/privacy/current-epoch link safety"] : []), ...eventScheduleNotificationIdsMissing, ...eventScheduleNotificationTermsMissing].join(", ")}`);
    process.exit(1);
  }
  const instrumentIdentityTemporalCrosswalkFixturePath = join(root, "docs", "fixtures", "disclosure", "instrument-identity-temporal-crosswalk.v0.json");
  const requiredInstrumentIdentityTemporalCrosswalkIds = [
    "ITC-01-DART-CORPORATION-CODE-IS-NOT-INSTRUMENT-IDENTITY", "ITC-02-MASTER-LATEST-CHANGE-DATE-IS-NOT-HISTORICAL-CROSSWALK", "ITC-03-REUSED-CODE-DOES-NOT-MERGE-TWO-INSTRUMENTS",
    "ITC-04-RENAME-REQUIRES-EFFECTIVE-DATE-AND-CONTINUITY-EVIDENCE", "ITC-05-MERGER-SUCCESSOR-IS-NOT-SILENTLY-THE-SAME-INSTRUMENT", "ITC-06-SECURITY-CLASS-CHANGE-KEEPS-DISTINCT-INSTRUMENT-IDENTITY",
    "ITC-07-EVENT-TIME-ELIGIBILITY-USES-ALIGNED-MASTER-AND-CAP-SNAPSHOT", "ITC-08-WATCHLIST-SUCCESSOR-MATCH-IS-CONTEXT-ONLY-WITHOUT-APPROVED-RELATION", "ITC-09-OVERLAPPING-CONFLICTING-ALIASES-QUARANTINE-ONLY-AFFECTED-SUBJECT",
    "ITC-10-PRICE-CONTINUITY-AND-IDENTITY-CONTINUITY-ARE-SEPARATE", "ITC-11-UNVERIFIED-CODE-ALIAS-BLOCKS-COMMON-STOCK-RECOMMENDATION", "ITC-12-MAPPING-CORRECTION-CREATES-NEW-ASSERTION-AND-INVALIDATES-DESCENDANTS",
    "ITC-13-OPENDART-MODIFY-DATE-IS-NOT-HISTORICAL-SECURITY-ALIAS", "ITC-14-KRX-LIMITED-ISSUE-VIEW-ABSENCE-DOES-NOT-PROVE-NO-LISTING",
    "ITC-15-SEC-TICKER-EXCHANGE-FILE-IS-CANDIDATE-MAP-NOT-GUARANTEED-HISTORY", "ITC-16-KIS-FIRST-LAST-SEEN-ARE-OBSERVATION-TIMES-NOT-LISTING-EFFECTIVE-DATES",
    "ITC-17-CONFLICTING-OFFICIAL-FIELDS-ARE-NOT-RESOLVED-BY-LATEST-WRITE", "ITC-18-INCOMPLETE-SOURCE-DENOMINATOR-CANNOT-SUPPORT-COVERAGE-OR-ABSENCE",
    "ITC-19-CROSSWALK-CANDIDATE-DOES-NOT-ACTIVATE-ELIGIBILITY", "ITC-20-ASSERTION-APPROVAL-REQUIRES-FIELD-LEVEL-EVIDENCE-PACKET",
    "ITC-21-CLASS-OR-HISTORY-CORRECTION-REQUIRES-INDEPENDENT-REVIEW", "ITC-22-OVERLAPPING-ALIAS-CONFLICT-QUARANTINES-ONLY-RELATED-SCOPE",
    "ITC-23-CORRECTION-APPENDS-ASSERTION-AND-REOPENS-DEPENDENT-REVIEWS", "ITC-24-RIGHTS-EXPIRY-CLOSES-ACTION-WITHOUT-DELETING-ASSERTION-HISTORY",
    "ITC-25-PREPARER-CANNOT-APPROVE-OWN-IDENTITY-ASSERTION", "ITC-26-REVOKED-OR-OUT-OF-SCOPE-ROLE-CANNOT-MUTATE-REVIEW",
    "ITC-27-UNKNOWN-RIGHTS-BLOCK-PERSISTENCE-OF-SOURCE-BYTES-AND-HASH", "ITC-28-EDITED-EVIDENCE-PACKET-REQUIRES-NEW-REVIEW-REVISION",
    "ITC-29-CONCURRENT-REVIEW-TRANSITIONS-USE-CAS-NOT-LAST-WRITE-WINS", "ITC-30-AUDITOR-IS-READ-ONLY-AND-PENDING-CROSSWALK-IS-NOT-PUBLIC",
    "ITC-31-EVIDENCE-READY-IS-REVIEWABLE-NOT-AN-AUTHORIZATION", "ITC-32-PARTIAL-OWNER-APPROVAL-DOES-NOT-EXPAND-SOURCE-OR-ACTION-SCOPE",
    "ITC-33-OWNER-DECISION-PACKAGE-REQUIRES-NAMED-OWNER-AND-PASSING-ACCEPTANCE", "ITC-34-POLICY-APPROVAL-DOES-NOT-SKIP-ASSERTION-LEVEL-DECISION",
    "ITC-35-EXPIRED-OR-STALE-OWNER-DECISION-REOPENS-DEPENDENT-ASSERTION", "ITC-36-REVIEW-UI-KEEPS-POLICY-AND-ASSERTION-STATUS-AXES-SEPARATE",
    "ITC-37-OWNER-PACKAGE-OMITS-SOURCE-BODY-WHEN-RIGHTS-DO-NOT-PERMIT-RETENTION",
  ];
  let instrumentIdentityTemporalCrosswalkFixture;
  try {
    const fixtureSource = readFileSync(instrumentIdentityTemporalCrosswalkFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    instrumentIdentityTemporalCrosswalkFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Instrument identity temporal crosswalk fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const instrumentIdentityTemporalCrosswalkIds = (instrumentIdentityTemporalCrosswalkFixture?.vectors ?? []).map((vector) => vector?.id);
  const instrumentIdentityTemporalCrosswalkById = new Map((instrumentIdentityTemporalCrosswalkFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const crosswalkDecisionLifecycle = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-register-lifecycle.v0.json"), "utf8"));
  const invalidInstrumentIdentityTemporalCrosswalkStructure = instrumentIdentityTemporalCrosswalkFixture?.contractVersion !== "instrument-identity-temporal-crosswalk.v0"
    || instrumentIdentityTemporalCrosswalkFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || instrumentIdentityTemporalCrosswalkFixture?.dataPolicy?.containsRealFiling !== false
    || instrumentIdentityTemporalCrosswalkFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || instrumentIdentityTemporalCrosswalkFixture?.dataPolicy?.containsCredentials !== false
    || instrumentIdentityTemporalCrosswalkFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !["LEGAL_ENTITY_IDENTITY", "SECURITY_INSTRUMENT_IDENTITY", "MARKET_CODE_ALIAS", "ELIGIBILITY_ASSERTION"].every((layer) => instrumentIdentityTemporalCrosswalkFixture?.identityLayers?.includes(layer))
    || !["aliasAssertionId", "instrumentId", "market", "code", "securityClass", "validFrom", "validUntil", "observedAt", "masterSnapshotId", "masterContentHash", "sourceEvidenceRef", "relationType", "reviewState"].every((field) => instrumentIdentityTemporalCrosswalkFixture?.requiredAliasAssertionFields?.includes(field))
    || !["IDENTIFIES", "RENAMED_AS", "REPLACED_BY", "MERGED_INTO", "SPLIT_INTO", "CODE_REUSED_BY", "CLASS_CHANGED_TO"].every((relation) => instrumentIdentityTemporalCrosswalkFixture?.relationTypes?.includes(relation))
    || !["CURRENT_VENDOR_SUPPORTED_INSTRUMENT", "LEGAL_ENTITY_OR_FILER_ID", "EXCHANGE_LISTING_EFFECTIVE_STATUS", "SECURITY_CLASS", "PRICE_OBSERVATION_VENUE", "SOURCE_COVERAGE"].every((role) => instrumentIdentityTemporalCrosswalkFixture?.officialSourceRoles?.includes(role))
    || !["fieldName", "assertedValue", "instrumentId", "issuerRelation", "venueId", "securityClass", "validFrom", "validUntil", "observedAt", "sourceAuthority", "sourceRecordRef", "sourceContentHash", "queryWindow", "rowPageDenominator", "sourceRevisionOrEffectiveNoticeTime", "parserRevision", "rightsUsePurposeState", "reviewState"].every((field) => instrumentIdentityTemporalCrosswalkFixture?.requiredEvidenceEnvelopeFields?.includes(field))
    || !["CANDIDATE_DISCOVERY", "EVIDENCE_PREPARER", "INSTRUMENT_REVIEWER", "INDEPENDENT_REVIEWER", "DECISION_OWNER", "AUDITOR_READ_ONLY"].every((role) => instrumentIdentityTemporalCrosswalkFixture?.crosswalkReviewRoles?.includes(role))
    || !["reviewDecisionId", "revision", "assertionId", "assertionRevision", "decision", "reasonCode", "reviewerActorId", "reviewerRoleSnapshot", "independentReviewerRef", "evidencePacketId", "evidencePacketHash", "boundPolicyDecisionRevisions", "sourceRightsRetentionScope", "validFrom", "validUntil", "effectiveAt", "recordedAt", "expiryOrReopenCondition", "expectedPriorRevision", "precedingDecisionRef"].every((field) => instrumentIdentityTemporalCrosswalkFixture?.requiredCrosswalkReviewDecisionFields?.includes(field))
    || !["KR-MASTER-SNAPSHOT-01", "KR-EVENT-ATTRIBUTION-01", "KR-OPERATIONAL-SECURITY-01", "KR-RETENTION-01", "KR-DART-RIGHTS-01", "KR-MARKET-DATA-RIGHTS-01"].every((id) => instrumentIdentityTemporalCrosswalkFixture?.crosswalkReviewDecisionBindings?.includes(id))
    || instrumentIdentityTemporalCrosswalkFixture?.ownerDecisionPackageContractRef !== "decision-register-lifecycle.v0.json"
    || instrumentIdentityTemporalCrosswalkFixture?.ownerDecisionPackageFieldsSource !== "requiredDecisionRecordFields"
    || !Array.isArray(crosswalkDecisionLifecycle?.requiredDecisionRecordFields)
    || new Set(crosswalkDecisionLifecycle?.requiredDecisionRecordFields ?? []).size !== crosswalkDecisionLifecycle?.requiredDecisionRecordFields?.length
    || !isDeepStrictEqual(instrumentIdentityTemporalCrosswalkFixture?.reviewUiPolicyDecisionStates, crosswalkDecisionLifecycle?.statusVocabulary)
    || !["DISCOVERED", "EVIDENCE_INCOMPLETE", "READY_FOR_REVIEW", "IN_REVIEW", "CONFLICT_UNRESOLVED", "APPROVED_ASSERTION", "REJECTED", "REVIEW_REQUIRED", "EXPIRED"].every((state) => instrumentIdentityTemporalCrosswalkFixture?.reviewUiAssertionStates?.includes(state))
    || !["ASSIGN_REVIEWER", "REQUEST_EVIDENCE", "MARK_EVIDENCE_READY", "APPROVE_POLICY_SCOPE", "APPROVE_ASSERTION", "REJECT_WITH_REASON", "RESOLVE_CONFLICT", "REOPEN", "EXPIRE"].every((action) => instrumentIdentityTemporalCrosswalkFixture?.reviewUiActions?.includes(action))
    || !["instrumentId", "effectiveAt", "masterSnapshotId", "instrumentType", "activeState", "marketCapValue", "marketCapCurrency", "marketCapObservedAt", "decisionState"].every((field) => instrumentIdentityTemporalCrosswalkFixture?.eligibilityEvidenceFields?.includes(field))
    || instrumentIdentityTemporalCrosswalkFixture?.vectors?.length !== requiredInstrumentIdentityTemporalCrosswalkIds.length
    || new Set(instrumentIdentityTemporalCrosswalkIds).size !== instrumentIdentityTemporalCrosswalkIds.length
    || requiredInstrumentIdentityTemporalCrosswalkIds.some((id) => !instrumentIdentityTemporalCrosswalkById.has(id));
  const crosswalkDecisionRegister = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-register.v0.json"), "utf8"));
  const crosswalkRegisteredDecisionIds = new Set((crosswalkDecisionRegister?.decisions ?? []).map((decision) => decision?.decisionId));
  const missingCrosswalkReviewDecisionBindings = (instrumentIdentityTemporalCrosswalkFixture?.crosswalkReviewDecisionBindings ?? []).filter((id) => !crosswalkRegisteredDecisionIds.has(id));
  const identityCorpCode = instrumentIdentityTemporalCrosswalkById.get("ITC-01-DART-CORPORATION-CODE-IS-NOT-INSTRUMENT-IDENTITY");
  const identityLatestOnly = instrumentIdentityTemporalCrosswalkById.get("ITC-02-MASTER-LATEST-CHANGE-DATE-IS-NOT-HISTORICAL-CROSSWALK");
  const identityCodeReuse = instrumentIdentityTemporalCrosswalkById.get("ITC-03-REUSED-CODE-DOES-NOT-MERGE-TWO-INSTRUMENTS");
  const identityClassChange = instrumentIdentityTemporalCrosswalkById.get("ITC-06-SECURITY-CLASS-CHANGE-KEEPS-DISTINCT-INSTRUMENT-IDENTITY");
  const identitySnapshotMismatch = instrumentIdentityTemporalCrosswalkById.get("ITC-07-EVENT-TIME-ELIGIBILITY-USES-ALIGNED-MASTER-AND-CAP-SNAPSHOT");
  const identitySuccessorWatchlist = instrumentIdentityTemporalCrosswalkById.get("ITC-08-WATCHLIST-SUCCESSOR-MATCH-IS-CONTEXT-ONLY-WITHOUT-APPROVED-RELATION");
  const identityUnknownMaster = instrumentIdentityTemporalCrosswalkById.get("ITC-11-UNVERIFIED-CODE-ALIAS-BLOCKS-COMMON-STOCK-RECOMMENDATION");
  const identityCorrection = instrumentIdentityTemporalCrosswalkById.get("ITC-12-MAPPING-CORRECTION-CREATES-NEW-ASSERTION-AND-INVALIDATES-DESCENDANTS");
  const identityOpenDartCoverage = instrumentIdentityTemporalCrosswalkById.get("ITC-13-OPENDART-MODIFY-DATE-IS-NOT-HISTORICAL-SECURITY-ALIAS");
  const identityKrxCoverage = instrumentIdentityTemporalCrosswalkById.get("ITC-14-KRX-LIMITED-ISSUE-VIEW-ABSENCE-DOES-NOT-PROVE-NO-LISTING");
  const identitySecCoverage = instrumentIdentityTemporalCrosswalkById.get("ITC-15-SEC-TICKER-EXCHANGE-FILE-IS-CANDIDATE-MAP-NOT-GUARANTEED-HISTORY");
  const identityKisObservation = instrumentIdentityTemporalCrosswalkById.get("ITC-16-KIS-FIRST-LAST-SEEN-ARE-OBSERVATION-TIMES-NOT-LISTING-EFFECTIVE-DATES");
  const identitySourceConflict = instrumentIdentityTemporalCrosswalkById.get("ITC-17-CONFLICTING-OFFICIAL-FIELDS-ARE-NOT-RESOLVED-BY-LATEST-WRITE");
  const identitySourceDenominator = instrumentIdentityTemporalCrosswalkById.get("ITC-18-INCOMPLETE-SOURCE-DENOMINATOR-CANNOT-SUPPORT-COVERAGE-OR-ABSENCE");
  const identityCandidateGate = instrumentIdentityTemporalCrosswalkById.get("ITC-19-CROSSWALK-CANDIDATE-DOES-NOT-ACTIVATE-ELIGIBILITY");
  const identityEvidencePacket = instrumentIdentityTemporalCrosswalkById.get("ITC-20-ASSERTION-APPROVAL-REQUIRES-FIELD-LEVEL-EVIDENCE-PACKET");
  const identityIndependentReview = instrumentIdentityTemporalCrosswalkById.get("ITC-21-CLASS-OR-HISTORY-CORRECTION-REQUIRES-INDEPENDENT-REVIEW");
  const identityAliasConflict = instrumentIdentityTemporalCrosswalkById.get("ITC-22-OVERLAPPING-ALIAS-CONFLICT-QUARANTINES-ONLY-RELATED-SCOPE");
  const identityCorrectionReopens = instrumentIdentityTemporalCrosswalkById.get("ITC-23-CORRECTION-APPENDS-ASSERTION-AND-REOPENS-DEPENDENT-REVIEWS");
  const identityRightsExpiry = instrumentIdentityTemporalCrosswalkById.get("ITC-24-RIGHTS-EXPIRY-CLOSES-ACTION-WITHOUT-DELETING-ASSERTION-HISTORY");
  const identitySelfApproval = instrumentIdentityTemporalCrosswalkById.get("ITC-25-PREPARER-CANNOT-APPROVE-OWN-IDENTITY-ASSERTION");
  const identityAuthorization = instrumentIdentityTemporalCrosswalkById.get("ITC-26-REVOKED-OR-OUT-OF-SCOPE-ROLE-CANNOT-MUTATE-REVIEW");
  const identityEvidenceRights = instrumentIdentityTemporalCrosswalkById.get("ITC-27-UNKNOWN-RIGHTS-BLOCK-PERSISTENCE-OF-SOURCE-BYTES-AND-HASH");
  const identityPacketRevision = instrumentIdentityTemporalCrosswalkById.get("ITC-28-EDITED-EVIDENCE-PACKET-REQUIRES-NEW-REVIEW-REVISION");
  const identityReviewCas = instrumentIdentityTemporalCrosswalkById.get("ITC-29-CONCURRENT-REVIEW-TRANSITIONS-USE-CAS-NOT-LAST-WRITE-WINS");
  const identityAuditorScope = instrumentIdentityTemporalCrosswalkById.get("ITC-30-AUDITOR-IS-READ-ONLY-AND-PENDING-CROSSWALK-IS-NOT-PUBLIC");
  const identityEvidenceReadyDecision = instrumentIdentityTemporalCrosswalkById.get("ITC-31-EVIDENCE-READY-IS-REVIEWABLE-NOT-AN-AUTHORIZATION");
  const identityPartialScopeDecision = instrumentIdentityTemporalCrosswalkById.get("ITC-32-PARTIAL-OWNER-APPROVAL-DOES-NOT-EXPAND-SOURCE-OR-ACTION-SCOPE");
  const identityNamedOwnerAcceptance = instrumentIdentityTemporalCrosswalkById.get("ITC-33-OWNER-DECISION-PACKAGE-REQUIRES-NAMED-OWNER-AND-PASSING-ACCEPTANCE");
  const identityPolicyAssertionSplit = instrumentIdentityTemporalCrosswalkById.get("ITC-34-POLICY-APPROVAL-DOES-NOT-SKIP-ASSERTION-LEVEL-DECISION");
  const identityPolicyExpiry = instrumentIdentityTemporalCrosswalkById.get("ITC-35-EXPIRED-OR-STALE-OWNER-DECISION-REOPENS-DEPENDENT-ASSERTION");
  const identityReviewUi = instrumentIdentityTemporalCrosswalkById.get("ITC-36-REVIEW-UI-KEEPS-POLICY-AND-ASSERTION-STATUS-AXES-SEPARATE");
  const identityOwnerPackageRights = instrumentIdentityTemporalCrosswalkById.get("ITC-37-OWNER-PACKAGE-OMITS-SOURCE-BODY-WHEN-RIGHTS-DO-NOT-PERMIT-RETENTION");
  const invalidInstrumentIdentityTemporalCrosswalkSafety = identityCorpCode?.expected?.instrumentIdentityFromStockCodeAlone !== false
    || identityLatestOnly?.expected?.historicalMapping !== "UNRESOLVED"
    || identityLatestOnly?.expected?.inferFromCurrentAlias !== false
    || identityCodeReuse?.expected?.identityMerge !== false
    || identityClassChange?.expected?.instrumentIdentitySame !== false
    || identityClassChange?.expected?.commonStockEligibilityInherited !== false
    || identitySnapshotMismatch?.expected?.eligibleAtEvent !== "UNRESOLVED"
    || identitySuccessorWatchlist?.expected?.directWatchlistMatch !== false
    || identitySuccessorWatchlist?.expected?.alertAllowed !== false
    || identityUnknownMaster?.expected?.recommendation !== false
    || identityCorrection?.expected?.oldAssertionImmutable !== true
    || identityCorrection?.expected?.oldApprovalReused !== false
    || identityOpenDartCoverage?.expected?.historicalAlias !== "UNRESOLVED"
    || identityOpenDartCoverage?.expected?.modifyDatePromotedToListingEffectiveDate !== false
    || identityKrxCoverage?.expected?.listingAbsenceConclusion !== "UNVERIFIABLE_OUTSIDE_CONFIRMED_COVERAGE"
    || identityKrxCoverage?.expected?.coverageLimitRetained !== true
    || identitySecCoverage?.expected?.mappingCandidateOnly !== true
    || identitySecCoverage?.expected?.historicalListingApproved !== false
    || identityKisObservation?.expected?.validityDerivedFromSeenTimes !== false
    || identitySourceConflict?.expected?.latestValueAutoWins !== false
    || identitySourceConflict?.expected?.identityReviewBlocked !== true
    || identitySourceDenominator?.expected?.completeHistoryClaim !== false
    || identitySourceDenominator?.expected?.publicationOrAggregate !== false
    || identityCandidateGate?.expected?.eligibilityActivated !== false
    || identityCandidateGate?.expected?.publicSubjectCreated !== false
    || identityEvidencePacket?.expected?.assertionState !== "EVIDENCE_INCOMPLETE"
    || identityEvidencePacket?.expected?.partialFieldAutoApproval !== false
    || identityIndependentReview?.expected?.independentReviewSatisfied !== false
    || identityIndependentReview?.expected?.assertionActivated !== false
    || identityAliasConflict?.expected?.unrelatedCandidateBlocked !== false
    || identityCorrectionReopens?.expected?.priorAssertionMutable !== false
    || identityCorrectionReopens?.expected?.automaticReapproval !== false
    || identityRightsExpiry?.expected?.sourceActionAllowed !== false
    || identityRightsExpiry?.expected?.priorAssertionImmutable !== true
    || identitySelfApproval?.expected?.selfApprovalAllowed !== false
    || identitySelfApproval?.expected?.approvalRecordCreated !== false
    || identityAuthorization?.expected?.mutationAllowed !== false
    || identityAuthorization?.expected?.assertionRevisionChanged !== false
    || identityEvidenceRights?.expected?.persistentSourceBytes !== false
    || identityEvidenceRights?.expected?.persistentContentHash !== false
    || identityPacketRevision?.expected?.priorPacketMutable !== false
    || identityPacketRevision?.expected?.priorApprovalCurrent !== false
    || identityReviewCas?.expected?.staleTransitionAccepted !== false
    || identityReviewCas?.expected?.lastWriteWins !== false
    || identityAuditorScope?.expected?.mutationAllowed !== false
    || identityAuditorScope?.expected?.publicCandidateReturned !== false
    || identityAuditorScope?.expected?.packetOrReviewerIdentityLeaked !== false
    || identityEvidenceReadyDecision?.expected?.policyScopeAuthorized !== false
    || identityEvidenceReadyDecision?.expected?.assertionActivationAllowed !== false
    || identityPartialScopeDecision?.expected?.requestedActionAuthorized !== false
    || identityPartialScopeDecision?.expected?.scopeExpansionRequiresNewRevision !== true
    || identityNamedOwnerAcceptance?.expected?.decisionTransitionToApproved !== false
    || identityNamedOwnerAcceptance?.expected?.ownerRoleAloneIsAssignment !== false
    || identityPolicyAssertionSplit?.expected?.publicOrEligibilityActivation !== false
    || identityPolicyExpiry?.expected?.priorAssertionDecisionMutable !== false
    || identityPolicyExpiry?.expected?.dependentPublicDescendantsActive !== false
    || identityReviewUi?.expected?.statusAxesCollapsed !== false
    || identityReviewUi?.expected?.approveAssertionActionEnabled !== false
    || identityOwnerPackageRights?.expected?.bodyRetentionRequired !== false
    || identityOwnerPackageRights?.expected?.policyApprovalImpliesAssertionTruth !== false;
  const instrumentIdentityTemporalCrosswalkArchitecture = readFileSync(krArchitecturePath, "utf8");
  const requiredInstrumentIdentityTemporalCrosswalkTerms = ["종목 identity와 시점별 코드·분류 crosswalk — ITC-01–ITC-37", "OpenDART 공시검색 가이드", "modify_date", "validFrom/validUntil", "observedAt", "masterSnapshotId/masterContentHash", "instrument-identity-temporal-crosswalk.v0.json", "officialSourceRoles", "requiredEvidenceEnvelopeFields", "KRX Data Marketplace", "CIK/ticker/exchange 연결 파일", "ITC-13`–`ITC-18"];
  const missingInstrumentIdentityTemporalCrosswalkTerms = requiredInstrumentIdentityTemporalCrosswalkTerms.filter((term) => !instrumentIdentityTemporalCrosswalkArchitecture.includes(term));
  const instrumentUniverseSyncArchitecture = readFileSync(join(root, "docs", "architecture", "instrument-universe-sync.md"), "utf8");
  const requiredInstrumentIdentityWorkflowTerms = ["Crosswalk 후보 검토와 assertion 승격 절차", "APPROVED_ASSERTION", "CONFLICT_UNRESOLVED", "expected prior revision/CAS", "독립 reviewer", "필드별 증거 packet", "rights 만료", "ITC-19`–`ITC-30", "ITC-31`–`ITC-37", "Reviewer 권한·evidence packet·결정 연결", "Owner decision package와 review-state UI", "decision-register-lifecycle.v0.json", "EVIDENCE_READY", "APPROVE_POLICY_SCOPE", "APPROVE_ASSERTION", "CANDIDATE_DISCOVERY", "AUDITOR_READ_ONLY", "CrosswalkReviewDecision", "evidence packet digest", "원문 body나 bytes를 기본 복제하지 않는다", "KR-OPERATIONAL-SECURITY-01", "KR-RETENTION-01", "KR-MASTER-SNAPSHOT-01", "KR-EVENT-ATTRIBUTION-01", "서버 측 actor capability"];
  const missingInstrumentIdentityWorkflowTerms = requiredInstrumentIdentityWorkflowTerms.filter((term) => !instrumentUniverseSyncArchitecture.includes(term));
  if (invalidInstrumentIdentityTemporalCrosswalkStructure || missingCrosswalkReviewDecisionBindings.length || invalidInstrumentIdentityTemporalCrosswalkSafety || missingInstrumentIdentityTemporalCrosswalkTerms.length || missingInstrumentIdentityWorkflowTerms.length) {
    console.error(`Instrument identity temporal crosswalk incomplete: ${[...(invalidInstrumentIdentityTemporalCrosswalkStructure ? ["fixture/data policy/identity layers/temporal fields/relations/review capabilities/decision fields/vector IDs"] : []), ...(missingCrosswalkReviewDecisionBindings.length ? [`unregistered decision bindings: ${missingCrosswalkReviewDecisionBindings.join(",")}`] : []), ...(invalidInstrumentIdentityTemporalCrosswalkSafety ? ["entity separation/code reuse/class change/event-time eligibility/successor match/master fail-closed/correction immutability/source boundaries/workflow safety"] : []), ...missingInstrumentIdentityTemporalCrosswalkTerms, ...missingInstrumentIdentityWorkflowTerms].join(", ")}`);
    process.exit(1);
  }
  const personalDisclosureReviewNoteFixturePath = join(root, "docs", "fixtures", "disclosure", "personal-disclosure-review-note.v0.json");
  const requiredPersonalDisclosureReviewNoteIds = [
    "PDN-01-CROSS-USER-READ-IS-DENIED", "PDN-02-WATCHLIST-DOES-NOT-IMPLY-OWNERSHIP-OR-NOTE-CREATION", "PDN-03-NOTE-PINS-EXACT-EVENT-AND-CLAIM-REVISIONS",
    "PDN-04-SUPPRESSED-EVENT-HIDES-EVENT-CONTENT-KEEPS-OWNER-RECORD", "PDN-05-CLAIM-CORRECTION-MARKS-DEPENDENT-NOTE-STALE", "PDN-06-UNRESOLVED-IMPACT-MARKS-WHOLE-NOTE-REVIEW-REQUIRED",
    "PDN-07-OWNER-DELETE-DOES-NOT-DELETE-CANONICAL-EVENT", "PDN-08-SEARCH-AND-COUNTS-ARE-OWNER-SCOPED", "PDN-09-LEGACY-UNLINKED-NOTE-IS-NOT-AUTO-LINKED",
    "PDN-10-OPT-OUT-ACCOUNT-DELETION-CLEARS-PRIVATE-INDEX",
  ];
  let personalDisclosureReviewNoteFixture;
  try {
    const fixtureSource = readFileSync(personalDisclosureReviewNoteFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    personalDisclosureReviewNoteFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Personal disclosure review note fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const personalDisclosureReviewNoteIds = (personalDisclosureReviewNoteFixture?.vectors ?? []).map((vector) => vector?.id);
  const personalDisclosureReviewNoteById = new Map((personalDisclosureReviewNoteFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredPersonalNoteDimensions = ["noteId", "ownerUserId", "eventId", "eventRevisionId", "publicationSnapshotId", "selectedClaimIds", "createdAt", "updatedAt", "noteRevision", "visibility", "stalenessState", "retentionState"];
  const invalidPersonalDisclosureReviewNoteStructure = personalDisclosureReviewNoteFixture?.contractVersion !== "personal-disclosure-review-note.v0"
    || personalDisclosureReviewNoteFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || personalDisclosureReviewNoteFixture?.dataPolicy?.containsRealUser !== false
    || personalDisclosureReviewNoteFixture?.dataPolicy?.containsRealFiling !== false
    || personalDisclosureReviewNoteFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || personalDisclosureReviewNoteFixture?.dataPolicy?.containsSourceBody !== false
    || personalDisclosureReviewNoteFixture?.dataPolicy?.containsPersonalNoteText !== false
    || personalDisclosureReviewNoteFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || requiredPersonalNoteDimensions.some((field) => !personalDisclosureReviewNoteFixture?.requiredNoteDimensions?.includes(field))
    || !["OWNER_ONLY", "DELETED"].every((state) => personalDisclosureReviewNoteFixture?.visibilityStates?.includes(state))
    || !["CURRENT_REVISION", "SOURCE_REVISION_CHANGED", "EVENT_SUPPRESSED", "SNAPSHOT_EXPIRED", "INELIGIBLE_OR_UNRESOLVED", "UNLINKED_LEGACY_NOTE"].every((state) => personalDisclosureReviewNoteFixture?.stalenessStates?.includes(state))
    || personalDisclosureReviewNoteFixture?.vectors?.length !== requiredPersonalDisclosureReviewNoteIds.length
    || new Set(personalDisclosureReviewNoteIds).size !== personalDisclosureReviewNoteIds.length
    || requiredPersonalDisclosureReviewNoteIds.some((id) => !personalDisclosureReviewNoteById.has(id));
  const personalNoteCrossUser = personalDisclosureReviewNoteById.get("PDN-01-CROSS-USER-READ-IS-DENIED");
  const personalNoteWatchlist = personalDisclosureReviewNoteById.get("PDN-02-WATCHLIST-DOES-NOT-IMPLY-OWNERSHIP-OR-NOTE-CREATION");
  const personalNotePinning = personalDisclosureReviewNoteById.get("PDN-03-NOTE-PINS-EXACT-EVENT-AND-CLAIM-REVISIONS");
  const personalNoteSuppression = personalDisclosureReviewNoteById.get("PDN-04-SUPPRESSED-EVENT-HIDES-EVENT-CONTENT-KEEPS-OWNER-RECORD");
  const personalNoteDeletion = personalDisclosureReviewNoteById.get("PDN-07-OWNER-DELETE-DOES-NOT-DELETE-CANONICAL-EVENT");
  const personalNoteLegacy = personalDisclosureReviewNoteById.get("PDN-09-LEGACY-UNLINKED-NOTE-IS-NOT-AUTO-LINKED");
  const invalidPersonalDisclosureReviewNoteSafety = personalNoteCrossUser?.expected?.read !== "DENIED_OR_NOT_FOUND"
    || personalNoteCrossUser?.expected?.existenceLeak !== false
    || personalNoteWatchlist?.expected?.noteCreated !== false
    || personalNoteWatchlist?.expected?.userOptInRequired !== true
    || personalNotePinning?.expected?.silentRetarget !== false
    || personalNoteSuppression?.expected?.eventContent !== "NOT_RENDERED"
    || personalNoteDeletion?.expected?.canonicalEvent !== "UNCHANGED"
    || personalNoteLegacy?.expected?.autoLink !== false;
  const personalDisclosureReviewNoteArchitecture = readFileSync(krArchitecturePath, "utf8");
  const personalDisclosureReviewNoteRangeDeclared = requiredPersonalDisclosureReviewNoteIds.every((id) => personalDisclosureReviewNoteArchitecture.includes(id.slice(0, 5)))
    && personalDisclosureReviewNoteArchitecture.includes("PDN-10`은 계정");
  const missingPersonalDisclosureReviewNoteIds = personalDisclosureReviewNoteRangeDeclared ? [] : requiredPersonalDisclosureReviewNoteIds;
  const requiredPersonalDisclosureReviewNoteTerms = ["개인 공시 검토 노트 — 사용자 판단의 revision pinning 제안", "owner-only 개인 기록", "현재 worktree의 `lib/schema.ts`와 파일 탐색에서는 active notes API/UI 사용 경로를 확인하지 못했으므로", "SOURCE_REVISION_CHANGED", "UNLINKED_LEGACY_NOTE", "public projection/cache/search 결과에 개인값 섞이면"];
  const missingPersonalDisclosureReviewNoteTerms = requiredPersonalDisclosureReviewNoteTerms.filter((term) => !personalDisclosureReviewNoteArchitecture.includes(term));
  if (invalidPersonalDisclosureReviewNoteStructure || invalidPersonalDisclosureReviewNoteSafety || missingPersonalDisclosureReviewNoteIds.length || missingPersonalDisclosureReviewNoteTerms.length) {
    console.error(`Personal disclosure review note contract incomplete: ${[...(invalidPersonalDisclosureReviewNoteStructure ? ["fixture version/data policy/dimensions/states/vector IDs"] : []), ...(invalidPersonalDisclosureReviewNoteSafety ? ["owner isolation/watchlist/revision/suppression/delete/legacy fail-closed expectations"] : []), ...missingPersonalDisclosureReviewNoteIds, ...missingPersonalDisclosureReviewNoteTerms].join(", ")}`);
    process.exit(1);
  }
  const investmentThesisJournalFixturePath = join(root, "docs", "fixtures", "disclosure", "investment-thesis-journal.v0.json");
  let investmentThesisJournalFixture;
  try {
    const fixtureSource = readFileSync(investmentThesisJournalFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    investmentThesisJournalFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Investment thesis journal fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredInvestmentThesisJournalIds = [
    "ITJ-01-EXPLICIT-OPT-IN-DOES-NOT-INFER-OWNERSHIP-OR-TRADES", "ITJ-02-THESIS-REVISION-PINS-EXACT-SUPPORT-AND-COUNTERCLAIMS",
    "ITJ-03-REVIEW-HORIZON-AND-INVALIDATION-CRITERIA-ARE-FROZEN-BEFORE-OUTCOME", "ITJ-04-THESIS-EDIT-APPENDS-REVISION-INSTEAD-OF-REWRITING-PAST",
    "ITJ-05-CORRECTION-INVALIDATES-ONLY-DEPENDENT-THESIS-EVIDENCE", "ITJ-06-PRICE-OUTCOME-REQUIRES-RIGHTS-AND-PREREGISTERED-MEASURE",
    "ITJ-07-USER-THESIS-IS-NOT-A-SYSTEM-RATING-OR-TRADE-RECOMMENDATION", "ITJ-08-PRIVATE-THESIS-NEVER-ENTERS-PUBLIC-OR-CROSS-USER-PROJECTION",
    "ITJ-09-DELETE-AND-EXPORT-ARE-OWNER-SCOPED-AND-RETENTION-AWARE", "ITJ-10-UNAVAILABLE-OUTCOME-IS-NOT-ZERO-OR-THESIS-FAILURE",
    "ITJ-11-OBSERVED-PRICE-METRIC-DOES-NOT-VERIFY-FACTUAL-THESIS", "ITJ-12-REVIEW-ADDITION-DOES-NOT-MUTATE-THESIS-OR-PRIOR-REVIEW",
    "ITJ-13-FACTUAL-CLAIM-USES-SOURCE-EVIDENCE-NOT-PRICE-DIRECTION", "ITJ-14-FORECAST-NEEDS-PREDECLARED-HORIZON-AND-MEASURE",
    "ITJ-15-CONDITIONAL-SCENARIO-NOT-TRIGGERED-IS-NOT-FALSIFIED", "ITJ-16-MIXED-STATEMENT-REQUIRES-USER-DECOMPOSITION-BEFORE-EVALUATION",
    "ITJ-17-DECOMPOSED-PROPOSITIONS-KEEP-THE-SAME-THESIS-REVISION-LINEAGE", "ITJ-18-FORECAST-SUMMARY-KEEPS-ALL-DUE-OUTCOMES-IN-DENOMINATOR",
    "ITJ-19-FACTS-FORECASTS-AND-CONDITIONAL-SCENARIOS-USE-DIFFERENT-OUTCOME-RULES", "ITJ-20-USER-WITHDRAWAL-IS-EXPLICITLY-COUNTED-NOT-SILENTLY-DROPPED",
    "ITJ-21-ERASURE-INVALIDATES-DERIVED-COHORT-SUMMARY", "ITJ-22-POST-CUTOFF-FILING-DOES-NOT-REWRITE-FORECAST-INFORMATION-SET",
    "ITJ-23-CORRECTED-PREMISE-CLAIM-STALES-DEPENDENCY-WITHOUT-REWRITING-FORECAST", "ITJ-24-LATE-PRICE-REVISION-CREATES-NEW-OUTCOME-SNAPSHOT",
    "ITJ-25-LATE-ELIGIBLE-FORECAST-REOPENS-COHORT-DENOMINATOR", "ITJ-26-OCCURRENCE-AVAILABILITY-AND-RETRIEVAL-TIMES-REMAIN-SEPARATE",
    "ITJ-27-DST-FALLBACK-AMBIGUOUS-LOCAL-TIME-IS-NOT-ARBITRARILY-CONVERTED", "ITJ-28-DST-SPRING-GAP-LOCAL-TIME-IS-NOT-INVENTED",
    "ITJ-29-EARLY-CLOSE-AND-HOLIDAY-SESSION-USE-PINNED-EXCHANGE-CALENDAR", "ITJ-30-CONFLICTING-ACCEPTANCE-AND-PUBLIC-AVAILABILITY-TIMES-REMAIN-UNRESOLVED",
    "ITJ-31-TIMEZONE-OR-CALENDAR-RULE-REVISION-APPENDS-NEW-REVIEW", "ITJ-32-DATE-ONLY-TIMESTAMP-DOES-NOT-GET-A-MARKET-SESSION-BY-INFERENCE",
    "ITJ-33-TICKER-OR-ISSUER-MATCH-DOES-NOT-MERGE-INSTRUMENT-IDENTITY", "ITJ-34-VENUE-TRANSFER-USES-TIME-EFFECTIVE-LISTING-EPOCH-AND-CALENDAR",
    "ITJ-35-DEPOSITARY-RECEIPT-IS-EXCLUDED-AND-NEVER-SPLICED-TO-UNDERLYING-COMMON", "ITJ-36-MULTIPLE-ACTIVE-COMMON-LISTINGS-REQUIRE-USER-INSTRUMENT-SELECTION",
    "ITJ-37-ISSUER-CLASS-OR-LISTING-EPOCH-REVISION-APPENDS-REVIEW",
    "ITJ-38-OUTCOME-PINS-EXACT-IDENTITY-AND-ATTRIBUTION-REVISIONS", "ITJ-39-FILER-IDENTITY-DOES-NOT-SUBSTITUTE-FOR-DIRECT-INSTRUMENT-IMPACT",
    "ITJ-40-EXPIRED-OR-SUPERSEDED-IDENTITY-ASSERTION-SUPPRESSES-OUTCOME", "ITJ-41-MASTER-DECISION-APPROVAL-DOES-NOT-AUTO-APPROVE-CROSSWALK-ASSERTION",
    "ITJ-42-CORRECTION-IMPACTS-ONLY-DEPENDENT-THESIS-REVIEWS", "ITJ-43-UNRESOLVED-DEPENDENCY-DENOMINATOR-DOES-NOT-CLAIM-UNAFFECTED",
    "ITJ-44-FILER-METADATA-ALONE-DOES-NOT-ATTRIBUTE-PRICE-OUTCOME", "ITJ-45-PARTY-ROLE-IS-CLAIM-AND-SUBJECT-SCOPED",
    "ITJ-46-CLAIM-LOCATOR-OR-SOURCE-REVISION-CHANGE-REQUIRES-REVIEW", "ITJ-47-RIGHTS-BLOCKED-IS-NOT-EVIDENCE-ABSENCE",
    "ITJ-48-UNRESOLVED-ROLE-REASONS-ARE-NOT-COLLAPSED",
    "ITJ-49-PRIVATE-NOTE-REFERENCES-CLAIM-WITHOUT-COPYING-RIGHT-BLOCKED-BODY",
  ];
  const investmentThesisJournalById = new Map((investmentThesisJournalFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredInvestmentThesisJournalFields = ["thesisId", "ownerUserId", "issuerOrInstrumentRef", "createdAt", "thesisRevision", "statementRef", "supportingClaimRevisionRefs", "counterClaimRevisionRefs", "reviewHorizonPolicyRevision", "reviewTriggerSetHash", "createdFromSnapshotId", "visibility", "retentionState"];
  const requiredInvestmentThesisReviewFields = ["reviewId", "ownerUserId", "thesisRevisionRef", "reviewPolicyRevision", "scheduledReviewAt", "reviewedAt", "evidenceRevisionRefs", "outcomeObservationState", "outcomeMeasureRef", "userConclusionRef", "limitations", "supersedesReviewId"];
  const requiredInvestmentThesisPropositionFields = ["propositionId", "propositionType", "statementRef", "asOf", "subjectRef", "supportingClaimRevisionRefs", "counterClaimRevisionRefs", "horizonRef", "outcomeMeasureRef", "conditionSetRef", "parentThesisRevisionRef"];
  const requiredInvestmentThesisPropositionTypes = ["FACTUAL_CLAIM", "FORECAST", "CONDITIONAL_SCENARIO", "MIXED_OR_UNCLEAR"];
  const requiredInvestmentThesisForecastCohortFields = ["forecastCohortId", "ownerUserId", "cohortPolicyRevision", "membershipRuleRevision", "cohortFrozenAt", "evaluationInformationCutoffAt", "windowStart", "windowEnd", "eligiblePropositionSetHash", "duePropositionCount", "dispositionCounts", "completenessState", "summaryRevision"];
  const requiredInvestmentThesisForecastCohortStates = ["NOT_APPROVED", "COMPLETE", "INCOMPLETE", "DENOMINATOR_UNVERIFIABLE", "REOPEN_REQUIRED"];
  const requiredInvestmentThesisLateEvidenceFields = ["sourceOccurrenceAt", "sourceFirstAvailableAt", "systemRetrievedAt", "evaluationInformationCutoffAt", "outcomeDataAsOf", "priorEvidenceSnapshotRef", "lateEvidenceDisposition", "lateEvidenceReason"];
  const requiredInvestmentThesisLateEvidenceDispositions = ["ON_TIME_FOR_CUTOFF", "LATE_INGEST_ON_TIME_SOURCE", "LATE_OUTCOME_EVIDENCE", "LATE_PREMISE_CORRECTION", "LATE_PRICE_REVISION", "LATE_COHORT_MEMBER", "UNRESOLVED_TIMING"];
  const requiredInvestmentThesisEvaluationTimeFields = ["sourceTimestampRaw", "sourceTimezoneId", "sourceTimezoneEvidenceRef", "sourceTimePrecision", "sourceTimestampOffset", "cutoffAtUtc", "cutoffTimezoneId", "tzDatabaseVersion", "marketCalendarId", "marketCalendarRevision", "sessionAssignment", "assignmentReason"];
  const requiredInvestmentThesisInstrumentAttributionFields = ["instrumentRef", "legalIssuerRef", "instrumentClass", "venueId", "listingEpochStart", "listingEpochEnd", "instrumentMasterRevision", "marketCalendarId", "marketCalendarRevision", "marketTimezoneId", "securityIdentityEvidenceRef", "identityAssertionId", "identityAssertionRevision", "identityDecisionRef", "attributionDecisionRef", "eligibilityDecisionRef", "eventSubjectRef"];
  const requiredInvestmentThesisClaimAttributionFields = ["filingId", "documentRevisionId", "documentContentHash", "claimId", "claimRevision", "claimKind", "partyRef", "partyRole", "eventSubjectRef", "exactSourceLocator", "locatorType", "sourceRightsDecisionRef", "extractionStatus", "reviewStatus"];
  const requiredInvestmentThesisPartyRoles = ["FILER", "REGISTRANT", "REPORTING_ISSUER", "AGREEMENT_PARTY", "OBLIGOR", "BENEFICIARY", "COUNTERPARTY", "AFFECTED_ISSUER", "SUBSIDIARY", "UNDERLYING_ISSUER", "OTHER_NAMED_PARTY", "ROLE_UNRESOLVED"];
  const requiredInvestmentThesisAttributionReviewReasons = ["FILER_ONLY", "PARTY_ROLE_UNRESOLVED", "DIRECT_IMPACT_EVIDENCE_MISSING", "CLAIM_LOCATOR_UNAVAILABLE", "ENTITY_CROSSWALK_UNRESOLVED", "INSTRUMENT_CROSSWALK_UNRESOLVED", "POLICY_DECISION_OPEN", "ASSERTION_REVIEW_PENDING", "CONFLICTING_PARTIES_OR_CLAIMS", "SOURCE_RIGHTS_UNRESOLVED", "ELIGIBILITY_UNRESOLVED", "DEPENDENCY_SNAPSHOT_STALE", "IMPACT_DENOMINATOR_INCOMPLETE"];
  const requiredInvestmentThesisInstrumentAttributionStates = ["ACTIVE_COMMON_STOCK", "DEPOSITARY_RECEIPT_EXCLUDED", "INSTRUMENT_CLASS_UNRESOLVED", "ISSUER_INSTRUMENT_CROSSWALK_UNRESOLVED", "LISTING_EPOCH_UNRESOLVED"];
  const requiredInvestmentThesisTimeResolutionStates = ["EXACT_INSTANT", "DATE_ONLY", "UNKNOWN", "AMBIGUOUS_DST", "NONEXISTENT_LOCAL_TIME", "SOURCE_CONFLICT", "CALENDAR_UNKNOWN", "CALENDAR_REVISION_CHANGED"];
  const requiredInvestmentThesisOutcomeStates = ["NOT_DUE", "NOT_OBSERVED", "OBSERVED_AS_OF", "RIGHTS_BLOCKED", "SOURCE_UNAVAILABLE", "INCOMPLETE_WINDOW", "NOT_ATTRIBUTABLE"];
  const requiredInvestmentThesisJournalDecisions = ["KR-PERSONAL-THESIS-UX-01", "KR-OPERATIONAL-SECURITY-01", "KR-RETENTION-01", "KR-API-UI-CONSISTENCY-01", "KR-MARKET-DATA-RIGHTS-01", "KR-END-TO-END-ACCEPTANCE-01", "KR-MASTER-SNAPSHOT-01", "KR-EVENT-ATTRIBUTION-01", "KR-DART-RIGHTS-01", "KR-CAP-FRESHNESS-01"];
  const investmentThesisJournalRegister = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-register.v0.json"), "utf8"));
  const investmentThesisJournalRegisteredDecisions = new Set((investmentThesisJournalRegister?.decisions ?? []).map((decision) => decision?.decisionId));
  const invalidInvestmentThesisJournalStructure = investmentThesisJournalFixture?.contractVersion !== "investment-thesis-journal.v0"
    || investmentThesisJournalFixture?.classification !== "SYNTHETIC_PRODUCT_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || investmentThesisJournalFixture?.dataPolicy?.containsRealUser !== false
    || investmentThesisJournalFixture?.dataPolicy?.containsRealFiling !== false
    || investmentThesisJournalFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || investmentThesisJournalFixture?.dataPolicy?.containsPersonalThesisText !== false
    || investmentThesisJournalFixture?.dataPolicy?.containsTransactionOrHoldingData !== false
    || investmentThesisJournalFixture?.dataPolicy?.containsRealPriceSeries !== false
    || investmentThesisJournalFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || requiredInvestmentThesisJournalFields.some((field) => !investmentThesisJournalFixture?.requiredThesisFields?.includes(field))
    || requiredInvestmentThesisReviewFields.some((field) => !investmentThesisJournalFixture?.requiredReviewRecordFields?.includes(field))
    || requiredInvestmentThesisPropositionFields.some((field) => !investmentThesisJournalFixture?.requiredPropositionFields?.includes(field))
    || requiredInvestmentThesisPropositionTypes.some((type) => !investmentThesisJournalFixture?.propositionTypes?.includes(type))
    || requiredInvestmentThesisForecastCohortFields.some((field) => !investmentThesisJournalFixture?.requiredForecastCohortFields?.includes(field))
    || requiredInvestmentThesisForecastCohortStates.some((state) => !investmentThesisJournalFixture?.forecastCohortCompletenessStates?.includes(state))
    || requiredInvestmentThesisLateEvidenceFields.some((field) => !investmentThesisJournalFixture?.requiredLateEvidenceFields?.includes(field))
    || requiredInvestmentThesisLateEvidenceDispositions.some((state) => !investmentThesisJournalFixture?.lateEvidenceDispositions?.includes(state))
    || requiredInvestmentThesisEvaluationTimeFields.some((field) => !investmentThesisJournalFixture?.requiredEvaluationTimeFields?.includes(field))
    || requiredInvestmentThesisInstrumentAttributionFields.some((field) => !investmentThesisJournalFixture?.requiredInstrumentAttributionFields?.includes(field))
    || requiredInvestmentThesisClaimAttributionFields.some((field) => !investmentThesisJournalFixture?.requiredClaimAttributionFields?.includes(field))
    || requiredInvestmentThesisPartyRoles.some((role) => !investmentThesisJournalFixture?.partyRoles?.includes(role))
    || requiredInvestmentThesisAttributionReviewReasons.some((reason) => !investmentThesisJournalFixture?.attributionReviewReasons?.includes(reason))
    || requiredInvestmentThesisInstrumentAttributionStates.some((state) => !investmentThesisJournalFixture?.instrumentAttributionStates?.includes(state))
    || requiredInvestmentThesisTimeResolutionStates.some((state) => !investmentThesisJournalFixture?.timeResolutionStates?.includes(state))
    || requiredInvestmentThesisOutcomeStates.some((state) => !investmentThesisJournalFixture?.outcomeObservationStates?.includes(state))
    || requiredInvestmentThesisJournalDecisions.some((id) => !investmentThesisJournalFixture?.decisionBindings?.includes(id) || !investmentThesisJournalRegisteredDecisions.has(id))
    || investmentThesisJournalFixture?.vectors?.length !== requiredInvestmentThesisJournalIds.length
    || new Set((investmentThesisJournalFixture?.vectors ?? []).map((vector) => vector?.id)).size !== (investmentThesisJournalFixture?.vectors ?? []).length
    || requiredInvestmentThesisJournalIds.some((id) => !investmentThesisJournalById.has(id));
  const invalidInvestmentThesisJournalSafety = investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[0])?.expected?.holdingOrTradeInferred !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[2])?.expected?.confirmatoryOutcomeEvaluation !== "BLOCKED_POST_HOC_CRITERIA"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[4])?.expected?.missingImpactAssumedUnaffected !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[5])?.expected?.replayOrPublicPriceClaim !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[6])?.expected?.buySellRecommendation !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[7])?.expected?.publicProjection !== "EXCLUDED"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[8])?.expected?.canonicalEventChanged !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[9])?.expected?.missingPriceTreatedAsZero !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[9])?.expected?.thesisOutcomeLabel !== "NOT_EVALUABLE"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[10])?.expected?.factualClaimVerifiedByPrice !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[10])?.expected?.systemThesisGrade !== null
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[11])?.expected?.priorReviewMutable !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[12])?.expected?.priceDirectionAsFactProof !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[13])?.expected?.confirmatoryEvaluation !== "BLOCKED_POST_HOC_OR_UNDEFINED"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[14])?.expected?.scenarioStatus !== "NOT_TRIGGERED"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[14])?.expected?.falsified !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[15])?.expected?.systemRewroteMeaning !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[16])?.expected?.legacyReviewBackfilled !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[17])?.expected?.eligibleDenominator !== 12
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[17])?.expected?.accuracyOrWinRate !== null
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[18])?.expected?.mixedTypeAccuracy !== null
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[18])?.expected?.conditionNotOccurredCountedAsForecastMiss !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[19])?.expected?.silentDenominatorRemoval !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[20])?.expected?.affectedSummary !== "INVALIDATED"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[20])?.expected?.userTombstoneRetainedByDefault !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[21])?.expected?.forecastInformationSetRewritten !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[21])?.expected?.separateReviewRevisionRequired !== true
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[22])?.expected?.priorForecastMutable !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[22])?.expected?.priorReviewOverwritten !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[23])?.expected?.priorSnapshotMutable !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[23])?.expected?.currentResultWithoutRightsRecheck !== "SUPPRESSED"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[24])?.expected?.completenessState !== "DENOMINATOR_UNVERIFIABLE"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[24])?.expected?.silentMembershipMutation !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[25])?.expected?.timesCollapsedToSingleDate !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[25])?.expected?.appendNewReviewRequired !== true
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[26])?.expected?.timeResolutionState !== "AMBIGUOUS_DST"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[26])?.expected?.normalizedInstant !== null
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[27])?.expected?.timeResolutionState !== "NONEXISTENT_LOCAL_TIME"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[27])?.expected?.sourceTimestampRewritten !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[28])?.expected?.calendarRevisionPinned !== true
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[28])?.expected?.genericWeekdayHoursUsed !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[29])?.expected?.timeResolutionState !== "SOURCE_CONFLICT"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[29])?.expected?.acceptanceTimeSubstitutedForPublicTime !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[30])?.expected?.priorReviewMutable !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[30])?.expected?.silentRetiming !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[31])?.expected?.sessionAssignment !== "UNKNOWN"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[31])?.expected?.KstMidnightAssumed !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[37])?.expected?.latestOnlyReferenceAllowed !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[37])?.expected?.missingDecisionRefState !== "NOT_ATTRIBUTABLE"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[38])?.expected?.filerTickerFallbackAllowed !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[38])?.expected?.priceOutcomeAttribution !== "NOT_ATTRIBUTABLE"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[39])?.expected?.priorReviewMutable !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[39])?.expected?.silentSuccessorRetargetAllowed !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[40])?.expected?.policyApprovalSubstitutesAssertionReview !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[40])?.expected?.thesisOutcomeAttribution !== "NOT_ATTRIBUTABLE"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[41])?.expected?.unrelatedReviewChanged !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[41])?.expected?.priorReviewsMutable !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[42])?.expected?.unaffectedConclusionAllowed !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[42])?.expected?.disposition !== "REOPEN_REQUIRED"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[43])?.expected?.instrumentPriceOutcome !== "NOT_ATTRIBUTABLE"
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[44])?.expected?.arbitraryRoleAssignment !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[45])?.expected?.oldClaimRevisionReusable !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[46])?.expected?.notReportedConclusion !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[47])?.expected?.reasonPriorityHidesBlockers !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[48])?.expected?.noteSaveAccepted !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[48])?.expected?.canonicalClaimCreatedFromNote !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[48])?.expected?.publicDossierIncludesNote !== false
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[48])?.expected?.permittedReferenceOnlyFallback !== true
    || investmentThesisJournalById.get(requiredInvestmentThesisJournalIds[48])?.expected?.otherUserReadAllowed !== false
  const investmentThesisJournalDocument = readFileSync(join(root, "docs", "architecture", "investment-thesis-journal-design.md"), "utf8");
  const investmentThesisJournalIndex = readFileSync(join(root, "docs", "architecture", "kr-disclosure-investment-planning-index.md"), "utf8");
  const investmentThesisJournalCatalog = readFileSync(join(root, "docs", "README.md"), "utf8");
  const investmentThesisJournalArchitecture = readFileSync(krArchitecturePath, "utf8");
  const requiredInvestmentThesisJournalTerms = ["상태: 제품 설계 제안", "broker 연동", "watchlist", "사전 고정한 horizon/measure", "FACTUAL_CLAIM", "CONDITIONAL_SCENARIO", "NOT_TRIGGERED", "MIXED_OR_UNCLEAR", "`FORECAST` cohort", "적중률·수익률 headline", "sourceOccurrenceAt", "sourceFirstAvailableAt", "systemRetrievedAt", "LATE_PREMISE_CORRECTION", "LATE_PRICE_REVISION", "REOPEN_REQUIRED", "AMBIGUOUS_DST", "NONEXISTENT_LOCAL_TIME", "SOURCE_CONFLICT", "exchange calendar snapshot", "발행인·증권·상장 venue 귀속", "공시 subject에서 thesis 가격 outcome까지의 attribution lineage", "Claim locator와 attribution 보류 사유", "https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001", "https://www.sec.gov/divisions/corpfin/forms/8-k.htm", "identityAssertionId/revision", "attributionDecisionRef", "exactSourceLocator", "PARTY_ROLE_UNRESOLVED", "DIRECT_IMPACT_EVIDENCE_MISSING", "SOURCE_RIGHTS_UNRESOLVED", "COMMON_STOCK`으로 확인", "depositary receipt", "상장 venue", "IANA timezone database 설명", "NOT_OBSERVED", "RIGHTS_BLOCKED", "수익률 0이나 thesis 실패로 변환하지 않는다", "KR-PERSONAL-THESIS-UX-01", "ITJ-01`–`ITJ-49", "본문을 붙여넣지 않는다", "claim/revision reference"];
  const missingInvestmentThesisJournalTerms = requiredInvestmentThesisJournalTerms.filter((term) => !investmentThesisJournalDocument.includes(term));
  const missingInvestmentThesisJournalLinks = [
    ...(!investmentThesisJournalIndex.includes("investment-thesis-journal-design.md") || !investmentThesisJournalIndex.includes("investment-thesis-journal.v0.json") ? ["planning index link"] : []),
    ...(!investmentThesisJournalCatalog.includes("investment-thesis-journal-design.md") || !investmentThesisJournalCatalog.includes("investment-thesis-journal.v0.json") ? ["docs README catalog link"] : []),
    ...(!investmentThesisJournalArchitecture.includes("개인 투자 thesis journal 기획") ? ["parent architecture link"] : []),
  ];
  if (invalidInvestmentThesisJournalStructure || invalidInvestmentThesisJournalSafety || missingInvestmentThesisJournalTerms.length || missingInvestmentThesisJournalLinks.length) {
    console.error(`Investment thesis journal contract incomplete: ${[...(invalidInvestmentThesisJournalStructure ? ["synthetic fixture fields/data policy/registered decision bindings/vector IDs/attribution roles and hold reasons"] : []), ...(invalidInvestmentThesisJournalSafety ? ["no holding inference/post-hoc criteria/correction/rights/recommendation/privacy fail-closed expectations"] : []), ...missingInvestmentThesisJournalTerms, ...missingInvestmentThesisJournalLinks].join(", ")}`);
    process.exit(1);
  }
  const investmentThesisReviewTriggerFixturePath = join(root, "docs", "fixtures", "disclosure", "investment-thesis-review-trigger.v0.json");
  let investmentThesisReviewTriggerFixture;
  try {
    const fixtureSource = readFileSync(investmentThesisReviewTriggerFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    investmentThesisReviewTriggerFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Investment thesis review trigger fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredInvestmentThesisReviewTriggerIds = [
    "ITHR-01-CLAIM-CORRECTION-OPENS-USER-REVIEW", "ITHR-02-NO-MATCH-IN-PARTIAL-COVERAGE-IS-UNVERIFIABLE",
    "ITHR-03-ELAPSED-MILESTONE-WITHOUT-COVERAGE-IS-NOT-MISSED", "ITHR-04-COMPLETE-SCOPE-NO-MATCH-REMAINS-AS-OF-OBSERVATION",
    "ITHR-05-RIGHTS-BLOCKED-EVIDENCE-DOES-NOT-EVALUATE-CONDITION", "ITHR-06-NEW-EVIDENCE-APPENDS-REVIEW-UNDER-NEW-SNAPSHOT",
    "ITHR-07-TRIGGER-SET-EDIT-DOES-NOT-RETROACTIVELY-EVALUATE", "ITHR-08-USER-REVIEW-IS-NOT-A-TRADE-INSTRUCTION",
    "ITHR-09-NATURAL-LANGUAGE-ONLY-TRIGGER-REQUIRES-MANUAL-REVIEW", "ITHR-10-STRUCTURED-FACT-NEEDS-UNIT-PERIOD-BASIS-AND-SUBJECT",
    "ITHR-11-UNIT-MISMATCH-DOES-NOT-EVALUATE-THRESHOLD", "ITHR-12-ALL-ANY-LOGIC-IS-EXPLICIT-AND-PINNED",
    "ITHR-13-REVIEW-DATE-DUE-ONLY-OPENS-A-REVIEW", "ITHR-14-FACT-COMPARISON-DOES-NOT-INFER-INVESTMENT-IMPACT",
  ];
  const investmentThesisReviewTriggerById = new Map((investmentThesisReviewTriggerFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredInvestmentThesisReviewTriggerFields = ["triggerId", "thesisRevisionRef", "triggerSetRevision", "triggerType", "userAuthoredConditionRef", "subjectRef", "evidenceRuleRef", "sourceScopeRef", "rightsDecisionRef", "coverageAssertionRef", "effectiveWindow", "evaluationInformationCutoffAt", "evaluationState", "evidenceSnapshotRef", "reviewDecisionRef", "supersedesTriggerId"];
  const requiredInvestmentThesisReviewTriggerStates = ["NOT_DUE", "OBSERVED_CONDITION_MET", "NO_MATCH_IN_COMPLETE_SCOPE_AS_OF", "UNVERIFIABLE_COVERAGE", "RIGHTS_BLOCKED", "SOURCE_UNAVAILABLE", "TIMING_UNRESOLVED", "MANUAL_REVIEW_REQUIRED", "REVIEW_REQUIRED", "USER_REVIEWED", "SUPERSEDED"];
  const invalidInvestmentThesisReviewTrigger = investmentThesisReviewTriggerFixture?.contractVersion !== "investment-thesis-review-trigger.v0"
    || investmentThesisReviewTriggerFixture?.classification !== "SYNTHETIC_PRODUCT_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE_OR_INVESTMENT_ADVICE"
    || investmentThesisReviewTriggerFixture?.dataPolicy?.containsRealUser !== false
    || investmentThesisReviewTriggerFixture?.dataPolicy?.containsRealFiling !== false
    || investmentThesisReviewTriggerFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || investmentThesisReviewTriggerFixture?.dataPolicy?.containsRealPriceSeries !== false
    || investmentThesisReviewTriggerFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || requiredInvestmentThesisReviewTriggerFields.some((field) => !investmentThesisReviewTriggerFixture?.requiredTriggerFields?.includes(field))
    || requiredInvestmentThesisReviewTriggerStates.some((state) => !investmentThesisReviewTriggerFixture?.evaluationStates?.includes(state))
    || !["REVISION_CHANGED", "STRUCTURED_FACT_COMPARISON", "EXPLICIT_EVENT_STATE", "REVIEW_DUE", "MANUAL_REVIEW_REQUIRED"].every((kind) => investmentThesisReviewTriggerFixture?.predicateModel?.allowedPredicateKinds?.includes(kind))
    || !["ALL", "ANY"].every((combinator) => investmentThesisReviewTriggerFixture?.predicateModel?.logicalCombinators?.includes(combinator))
    || !["sourceFieldLocator", "subjectRef", "unit", "periodOrAsOf", "basis", "comparisonOperator", "thresholdRef", "sourceRevisionRef"].every((field) => investmentThesisReviewTriggerFixture?.predicateModel?.requiredStructuredFactBindingFields?.includes(field))
    || investmentThesisReviewTriggerFixture?.predicateModel?.unsupportedConditionState !== "MANUAL_REVIEW_REQUIRED"
    || investmentThesisReviewTriggerFixture?.predicateModel?.invariants?.naturalLanguageAloneIsNotExecutable !== true
    || investmentThesisReviewTriggerFixture?.predicateModel?.invariants?.unitsPeriodBasisAndSubjectMustMatch !== true
    || investmentThesisReviewTriggerFixture?.predicateModel?.invariants?.combinatorIsExplicitAndRevisionPinned !== true
    || investmentThesisReviewTriggerFixture?.vectors?.length !== requiredInvestmentThesisReviewTriggerIds.length
    || new Set((investmentThesisReviewTriggerFixture?.vectors ?? []).map((vector) => vector?.id)).size !== (investmentThesisReviewTriggerFixture?.vectors ?? []).length
    || requiredInvestmentThesisReviewTriggerIds.some((id) => !investmentThesisReviewTriggerById.has(id))
    || investmentThesisReviewTriggerFixture?.invariants?.triggerObservationDoesNotDecideThesis !== true
    || investmentThesisReviewTriggerFixture?.invariants?.noMatchingDisclosureDoesNotMeanConditionFalse !== true
    || investmentThesisReviewTriggerFixture?.invariants?.elapsedDateDoesNotMeanMilestoneMissed !== true
    || investmentThesisReviewTriggerFixture?.invariants?.automaticFetchPollingAndNotificationAreNotImplied !== true
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[1])?.expected?.conditionFalse !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[2])?.expected?.milestoneMissed !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[4])?.expected?.conditionFalse !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[7])?.expected?.systemTradeInstruction !== null
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[8])?.expected?.conditionAutoInterpreted !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[9])?.expected?.comparisonExecuted !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[10])?.expected?.implicitCurrencyConversion !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[11])?.expected?.implicitCombinator !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[12])?.expected?.thesisJudgmentCreated !== false
    || investmentThesisReviewTriggerById.get(requiredInvestmentThesisReviewTriggerIds[13])?.expected?.investmentImpact !== "NOT_ASSESSED";
  const investmentThesisReviewTriggerArchitecture = readFileSync(join(root, "docs", "architecture", "investment-thesis-journal-design.md"), "utf8");
  const investmentThesisReviewTriggerIndex = readFileSync(join(root, "docs", "architecture", "kr-disclosure-investment-planning-index.md"), "utf8");
  const missingInvestmentThesisReviewTriggerTerms = ["## 사용자 검토 trigger의 평가 경계", "NO_MATCH_IN_COMPLETE_SCOPE_AS_OF", "milestone 날짜가 지났거나 후속 공시를 못 찾았다는 사실만으로", "typed predicate", "MANUAL_REVIEW_REQUIRED", "source field locator", "ITHR-01–14", "investment-thesis-review-trigger.v0.json"].filter((term) => !investmentThesisReviewTriggerArchitecture.includes(term));
  const missingInvestmentThesisReviewTriggerIndexLink = !investmentThesisReviewTriggerIndex.includes("investment-thesis-review-trigger.v0.json") || !investmentThesisReviewTriggerIndex.includes("ITHR-01–14");
  if (invalidInvestmentThesisReviewTrigger || missingInvestmentThesisReviewTriggerTerms.length || missingInvestmentThesisReviewTriggerIndexLink) {
    console.error(`Investment thesis review trigger contract incomplete: ${[...(invalidInvestmentThesisReviewTrigger ? ["fixture version/fields/states/safety/vector IDs"] : []), ...missingInvestmentThesisReviewTriggerTerms, ...(missingInvestmentThesisReviewTriggerIndexLink ? ["planning index link"] : [])].join(", ")}`);
    process.exit(1);
  }
  const counterevidenceReviewFixturePath = join(root, "docs", "fixtures", "disclosure", "disclosure-counterevidence-review.v0.json");
  let counterevidenceReviewFixture;
  try {
    const fixtureSource = readFileSync(counterevidenceReviewFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    counterevidenceReviewFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Disclosure counterevidence review fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const requiredCounterevidenceReviewIds = [
    "DCR-01-MISSING-RISK-CATEGORY-KEEPS-REVIEW-INCOMPLETE", "DCR-02-NOT-APPLICABLE-REQUIRES-REASON-AND-REVIEWER",
    "DCR-03-PARTIAL-COVERAGE-NO-MATCH-IS-UNVERIFIABLE", "DCR-04-RIGHTS-BLOCKED-SEARCH-IS-NOT-A-CLEAN-CATEGORY",
    "DCR-05-COMPLETE-SCOPE-NO-MATCH-IS-AS-OF-ONLY", "DCR-06-FOUND-COUNTEREVIDENCE-REQUIRES-ADJUDICATION",
    "DCR-07-PRICE-REACTION-DOES-NOT-FILL-RISK-SEARCH", "DCR-08-NEW-CORRECTION-STALES-PRIOR-COUNTEREVIDENCE-REVIEW",
    "DCR-09-COMPLETE-CATEGORY-SET-STILL-DOES-NOT-GENERATE-TRADE",
    "DCR-10-INCOMPLETE-REVIEW-BLOCKS-INVESTMENT-EFFECT-BRIDGE", "DCR-11-STALE-REVIEW-DEPENDENCY-CANNOT-REUSE-OLD-BRIDGE-APPROVAL",
    "DCR-12-REVIEWED-MANIFEST-IS-NECESSARY-BUT-DOES-NOT-APPROVE-INTERPRETATION",
    "DCR-13-SHARED-SESSION-OR-CLIENT-REVIEWER-ID-DOES-NOT-ADJUDICATE", "DCR-14-REVIEWER-INDEPENDENCE-POLICY-NOT-READY-BLOCKS-CLOSURE",
    "DCR-15-SAME-ACTOR-IS-BLOCKED-WHEN-SEPARATION-IS-REQUIRED", "DCR-16-STALE-ROLE-OR-CAPABILITY-SNAPSHOT-REQUIRES-REVIEW",
    "DCR-17-UNKNOWN-CONFLICT-DECLARATION-IS-NOT-CLEARANCE", "DCR-18-OWNER-APPROVED-NO-SEPARATION-REQUIREMENT-IS-SCOPE-PINNED",
  ];
  const counterevidenceReviewById = new Map((counterevidenceReviewFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredCounterevidenceReviewFields = ["reviewId", "targetClaimRevisionRefs", "eventGroupRefs", "reviewSetRevision", "evaluationInformationCutoffAt", "riskCategoryDispositions", "sourceProfileRevisionRefs", "searchScopeRef", "searchWindow", "queryDefinitionRevision", "rightsDecisionRevisionRefs", "coverageAssertionRefs", "foundCounterClaimRevisionRefs", "reviewState", "reviewerDecisionRef", "preparedByActorRef", "adjudicatedByActorRef", "reviewerRoleDecisionRef", "reviewerEligibilitySnapshotRef", "reviewerConflictDeclarationState", "reviewerIndependencePolicyRevision", "supersedesReviewId"];
  const requiredCounterevidenceRiskCategories = ["CORRECTION_OR_SUPERSEDING_FILING", "FINANCING_DILUTION_OR_LIQUIDITY", "CONDITIONS_DEPENDENCIES_OR_CANCELLATION", "LEGAL_REGULATORY_OR_LISTING_STATUS", "COUNTERPARTY_CREDIT_OR_PERFORMANCE", "ASSET_OPERATING_OR_REVENUE_IMPACT", "RELATED_PARTY_OR_CONFLICT_OF_INTEREST"];
  const requiredCounterevidenceReviewStates = ["NOT_ASSESSED", "EVIDENCE_INCOMPLETE", "COUNTEREVIDENCE_REVIEWED", "STALE_REVIEW_REQUIRED", "SUPPRESSED_RIGHTS_OR_COVERAGE"];
  const requiredCounterevidenceReviewerGovernanceStates = ["POLICY_NOT_READY", "REVIEWER_UNASSIGNED", "ACTOR_IDENTITY_UNVERIFIED", "CAPABILITY_UNVERIFIED", "CONFLICT_UNRESOLVED", "REVIEWER_ELIGIBLE", "REVIEWER_CONFLICTED", "REVIEWER_POLICY_EXCEPTION_APPROVED"];
  const counterevidenceReviewInvalid = counterevidenceReviewFixture?.contractVersion !== "disclosure-counterevidence-review.v0"
    || counterevidenceReviewFixture?.classification !== "SYNTHETIC_PRODUCT_ACCEPTANCE_NOT_RUNTIME_EVIDENCE_OR_INVESTMENT_ADVICE"
    || counterevidenceReviewFixture?.dataPolicy?.containsRealFiling !== false
    || counterevidenceReviewFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || counterevidenceReviewFixture?.dataPolicy?.containsRealUser !== false
    || counterevidenceReviewFixture?.dataPolicy?.containsSourceBody !== false
    || counterevidenceReviewFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || requiredCounterevidenceReviewFields.some((field) => !counterevidenceReviewFixture?.requiredReviewFields?.includes(field))
    || requiredCounterevidenceRiskCategories.some((category) => !counterevidenceReviewFixture?.riskCategories?.includes(category))
    || requiredCounterevidenceReviewStates.some((state) => !counterevidenceReviewFixture?.aggregateReviewStates?.includes(state))
    || requiredCounterevidenceReviewerGovernanceStates.some((state) => !counterevidenceReviewFixture?.reviewerGovernanceStates?.includes(state))
    || !["REQUIRED", "NOT_REQUIRED_BY_CURRENT_POLICY", "NOT_READY"].every((state) => counterevidenceReviewFixture?.reviewerIndependenceRequirements?.includes(state))
    || !["KR-OPERATIONAL-SECURITY-01", "KR-END-TO-END-ACCEPTANCE-01"].every((id) => counterevidenceReviewFixture?.reviewerGovernanceDecisionBindings?.includes(id))
    || counterevidenceReviewFixture?.reviewerGovernance?.defaultIndependenceRequirement !== "NOT_READY"
    || counterevidenceReviewFixture?.reviewerGovernance?.clientSuppliedReviewerIdentityAccepted !== false
    || counterevidenceReviewFixture?.reviewerGovernance?.publicProjectionIncludesInternalReviewerIdentity !== false
    || counterevidenceReviewFixture?.downstreamBindings?.consumerContract !== "investment-effect-projection-bridge.v0.json"
    || counterevidenceReviewFixture?.downstreamBindings?.consumerStage !== "INTERPRETATION_REVIEW"
    || !["counterevidenceReviewId", "reviewSetRevision", "reviewSnapshotHash", "targetClaimRevisionDigest", "rightsDecisionSetHash", "coverageAssertionSetDigest"].every((field) => counterevidenceReviewFixture?.downstreamBindings?.requiredDependencyFields?.includes(field))
    || counterevidenceReviewFixture?.downstreamBindings?.stateMapping?.EVIDENCE_INCOMPLETE !== "BLOCK_DIRECTION_AS_EVIDENCE_INCOMPLETE"
    || counterevidenceReviewFixture?.downstreamBindings?.stateMapping?.STALE_REVIEW_REQUIRED !== "BLOCK_DIRECTION_AS_EVIDENCE_INCOMPLETE"
    || counterevidenceReviewFixture?.downstreamBindings?.stateMapping?.SUPPRESSED_RIGHTS_OR_COVERAGE !== "SUPPRESS_PROJECTION"
    || counterevidenceReviewFixture?.vectors?.length !== requiredCounterevidenceReviewIds.length
    || new Set((counterevidenceReviewFixture?.vectors ?? []).map((vector) => vector?.id)).size !== (counterevidenceReviewFixture?.vectors ?? []).length
    || requiredCounterevidenceReviewIds.some((id) => !counterevidenceReviewById.has(id))
    || counterevidenceReviewFixture?.invariants?.allRiskCategoriesReceiveExplicitDisposition !== true
    || counterevidenceReviewFixture?.invariants?.notApplicableRequiresReviewerRationale !== true
    || counterevidenceReviewFixture?.invariants?.absenceRequiresRightsAndCompleteDeclaredScope !== true
    || counterevidenceReviewFixture?.invariants?.marketReactionIsNotCounterevidenceSearch !== true
    || counterevidenceReviewFixture?.invariants?.incompleteCounterevidenceBlocksSingleDirection !== true
    || counterevidenceReviewFixture?.invariants?.counterevidenceReviewDoesNotGenerateTradeInstruction !== true
    || counterevidenceReviewFixture?.invariants?.sharedCredentialDoesNotProveNamedReviewer !== true
    || counterevidenceReviewFixture?.invariants?.unresolvedReviewerEligibilityCannotCloseReview !== true
    || counterevidenceReviewFixture?.invariants?.independenceRequirementIsExplicitAndOwnerApproved !== true
    || counterevidenceReviewFixture?.invariants?.sameActorReviewIsBlockedWhenCurrentPolicyRequiresSeparation !== true
    || counterevidenceReviewFixture?.invariants?.unknownConflictStateKeepsReviewIncomplete !== true
    || counterevidenceReviewFixture?.invariants?.reviewerPolicyExceptionIsScopedAndRevisionPinned !== true
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[0])?.expected?.omittedCategoryTreatedAsNotApplicable !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[2])?.expected?.noRiskClaimAllowed !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[3])?.expected?.noRiskClaimAllowed !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[4])?.expected?.claimThatNoCorrectionEverExists !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[6])?.expected?.priceReactionCountsAsSearchEvidence !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[7])?.expected?.priorDirectionApprovalReusable !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[8])?.expected?.tradeInstruction !== null;
  const invalidCounterevidenceDownstreamAcceptance = counterevidenceReviewById.get(requiredCounterevidenceReviewIds[9])?.expected?.projection !== "EVIDENCE_INCOMPLETE"
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[9])?.expected?.directionPublished !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[10])?.expected?.priorInterpretationApprovalReusable !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[10])?.expected?.newReviewSnapshotRequired !== true
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[11])?.expected?.interpretationApprovalInferred !== false;
  const invalidCounterevidenceReviewerGovernance = counterevidenceReviewById.get(requiredCounterevidenceReviewIds[12])?.expected?.clientReviewerIdentityAccepted !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[12])?.expected?.reviewState !== "EVIDENCE_INCOMPLETE"
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[13])?.expected?.reviewerGovernanceState !== "POLICY_NOT_READY"
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[13])?.expected?.singleDirectionApproval !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[14])?.expected?.reviewerAdjudicationAccepted !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[15])?.expected?.priorAdjudicationReusable !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[16])?.expected?.clearanceInferred !== false
    || counterevidenceReviewById.get(requiredCounterevidenceReviewIds[17])?.expected?.globalIndependenceDefaultInferred !== false;
  const counterevidenceReviewArchitecture = readFileSync(join(root, "docs", "architecture", "kr-disclosure-event-architecture.md"), "utf8");
  const counterevidenceReviewIndex = readFileSync(join(root, "docs", "architecture", "kr-disclosure-investment-planning-index.md"), "utf8");
  const missingCounterevidenceReviewTerms = ["#### Claim별 반대 근거 검토 manifest", "NO_MATCH_IN_COMPLETE_SCOPE_AS_OF", "EVIDENCE_FOUND_PENDING_REVIEW", "DCR-01–18", "counterevidenceReviewId", "coverageAssertionSetDigest", "investment-effect-projection-bridge.v0.json", "검토 행위자·자격·독립성 경계", "preparedByActorRef", "POLICY_NOT_READY", "KR-OPERATIONAL-SECURITY-01"].filter((term) => !counterevidenceReviewArchitecture.includes(term));
  const missingCounterevidenceReviewIndexLink = !counterevidenceReviewIndex.includes("disclosure-counterevidence-review.v0.json") || !counterevidenceReviewIndex.includes("DCR-01–18");
  if (counterevidenceReviewInvalid || invalidCounterevidenceDownstreamAcceptance || invalidCounterevidenceReviewerGovernance || missingCounterevidenceReviewTerms.length || missingCounterevidenceReviewIndexLink) {
    console.error(`Disclosure counterevidence review contract incomplete: ${[...(counterevidenceReviewInvalid ? ["fixture version/fields/categories/states/safety/vector IDs/downstream bindings/reviewer governance"] : []), ...(invalidCounterevidenceDownstreamAcceptance ? ["downstream bridge fail-closed/current revision expectations"] : []), ...(invalidCounterevidenceReviewerGovernance ? ["reviewer identity/independence/conflict fail-closed expectations"] : []), ...missingCounterevidenceReviewTerms, ...(missingCounterevidenceReviewIndexLink ? ["planning index link"] : [])].join(", ")}`);
    process.exit(1);
  }
  const disclosureUserEventSubscriptionFixturePath = join(root, "docs", "fixtures", "disclosure", "disclosure-user-event-subscription.v0.json");
  const requiredDisclosureUserEventSubscriptionIds = [
    "DUES-01-WATCHLIST-ADD-DOES-NOT-SUBSCRIBE-TO-EVENT", "DUES-02-BROAD-DART-PREFERENCE-IS-NOT-REINTERPRETED-AS-EVENT-OPT-IN", "DUES-03-EVENT-SUBSCRIPTION-REQUIRES-EXPLICIT-SCOPE-AND-CHANNEL",
    "DUES-04-WATCHLIST-RELEVANCE-NEEDS-APPROVED-ELIGIBLE-SUBJECT", "DUES-05-FILER-ONLY-MATCH-DOES-NOT-BECOME-DIRECT-IMPACT", "DUES-06-EXPLICIT-EVENT-SUBSCRIPTION-IS-INDEPENDENT-OF-WATCHLIST",
    "DUES-07-OWNER-SCOPE-ISOLATES-READS-AND-COUNTS", "DUES-08-REVOCATION-ADVANCES-REVISION-AND-FENCES-QUEUED-SEND", "DUES-09-READ-DISMISS-AND-MUTE-ARE-PERSONAL-OVERLAY-ONLY",
    "DUES-10-ACCOUNT-DELETE-REMOVES-ACTIVE-PRIVATE-SUBSCRIPTIONS", "DUES-11-CANDIDATE-KEY-PINS-SUBSCRIPTION-EVENT-CHANNEL-AND-EPOCH", "DUES-12-ONE-USER-CANDIDATE-FANS-OUT-TO-HASHED-ENDPOINT-ATTEMPTS",
    "DUES-13-EVENT-TRANSITION-AND-DATE-REMINDER-USE-SEPARATE-OPT-INS", "DUES-14-LEGACY-DART-DEVICE-TOGGLE-IS-A-SUPPRESSION-GATE-NOT-CONSENT", "DUES-15-DISPATCH-REVALIDATES-LIVE-REVISION-RIGHTS-AND-RECIPIENT-GATES",
    "DUES-16-CORRECTION-RECIPIENTS-COME-FROM-COMPLETE-AFFECTED-EXPOSURE-SET", "DUES-17-PROVIDER-ACCEPTANCE-AND-TIMEOUT-DO-NOT-CLAIM-USER-RECEIPT", "DUES-18-ACCEPTED-OLD-PUSH-CAN-NOT-BE-RETRACTED-AND-LINK-REVALIDATES",
    "DUES-19-TARGET-IDENTITY-HASH-IS-KEYED-DOMAIN-SEPARATED-AND-REPRODUCIBLE", "DUES-20-KEY-ROTATION-OR-RETENTION-EXPIRY-BLOCKS-UNLINKABLE-RECONCILIATION",
  ];
  let disclosureUserEventSubscriptionFixture;
  try {
    const fixtureSource = readFileSync(disclosureUserEventSubscriptionFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    disclosureUserEventSubscriptionFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Disclosure user event subscription fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const disclosureUserEventSubscriptionIds = (disclosureUserEventSubscriptionFixture?.vectors ?? []).map((vector) => vector?.id);
  const disclosureUserEventSubscriptionById = new Map((disclosureUserEventSubscriptionFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidDisclosureUserEventSubscriptionStructure = disclosureUserEventSubscriptionFixture?.contractVersion !== "disclosure-user-event-subscription.v0"
    || disclosureUserEventSubscriptionFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || disclosureUserEventSubscriptionFixture?.dataPolicy?.containsRealUser !== false
    || disclosureUserEventSubscriptionFixture?.dataPolicy?.containsRealFiling !== false
    || disclosureUserEventSubscriptionFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || disclosureUserEventSubscriptionFixture?.dataPolicy?.containsPersonalRecipientData !== false
    || disclosureUserEventSubscriptionFixture?.dataPolicy?.containsCredentials !== false
    || disclosureUserEventSubscriptionFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !["GENERAL_DART_FEED", "EVENT_TRANSITION", "CONFIRMED_DATE_REMINDER", "ESTIMATE_RECHECK"].every((scope) => disclosureUserEventSubscriptionFixture?.subscriptionScopes?.includes(scope))
    || !["ownerUserId", "eventId", "eventRevisionId", "publicationEpoch", "transitionKinds", "channels", "subscriptionRevision", "createdAt", "revokedAt"].every((field) => disclosureUserEventSubscriptionFixture?.requiredEventSubscriptionFields?.includes(field))
    || !["recipientScopeId", "subscriptionId", "subscriptionRevision", "eventId", "eventRevisionId", "notificationKind", "channel", "notificationPolicyRevision", "publicationEpoch"].every((field) => disclosureUserEventSubscriptionFixture?.dispatchBinding?.candidateIdentityFields?.includes(field))
    || !["candidateId", "targetIdentityHash", "targetIdentityKeyId", "attemptNumber", "creditState", "payloadHash", "creditManifestHash", "creditComponents", "rendererRevision", "locale", "notificationRevision", "rightsDecisionRevision", "attributionPolicyRevision", "publicationEpoch", "providerOutcome", "deviceDeliveryObservation"].every((field) => disclosureUserEventSubscriptionFixture?.dispatchBinding?.attemptIdentityFields?.includes(field))
    || !["exposureScope", "surfaceKind", "targetIdentityHash", "targetIdentityKeyId", "sourceRevision", "publicationEpoch", "disposition"].every((field) => disclosureUserEventSubscriptionFixture?.dispatchBinding?.reconciliationFields?.includes(field))
    || disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.contractRef !== "DELIVERY-TARGET-HASH-v1"
    || disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.algorithm !== "HMAC-SHA-256"
    || disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.canonicalization !== "RFC8785-JCS"
    || !["provider", "surfaceKind", "targetKind", "targetIdentity"].every((field) => disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.inputFields?.includes(field))
    || disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.resultFormat !== "hmac-sha256:<keyId>:<lowercase-hex>"
    || disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.goldenVector?.keyPolicy !== "SYNTHETIC_ONLY"
    || disclosureUserEventSubscriptionFixture?.targetIdentityRetentionContract?.dataClass !== "PSEUDONYMOUS_PERSONAL_DELIVERY_METADATA"
    || disclosureUserEventSubscriptionFixture?.targetIdentityRetentionContract?.anonymous !== false
    || disclosureUserEventSubscriptionFixture?.targetIdentityRetentionContract?.targetHashRetention !== "UNRESOLVED_UNTIL_OWNER_APPROVES_RETENTION_WINDOW_AND_PURPOSE"
    || disclosureUserEventSubscriptionFixture?.targetIdentityRetentionContract?.backupDisposition !== "UNRESOLVED_OWNER_DECISION"
    || disclosureUserEventSubscriptionFixture?.vectors?.length !== requiredDisclosureUserEventSubscriptionIds.length
    || new Set(disclosureUserEventSubscriptionIds).size !== disclosureUserEventSubscriptionIds.length
    || requiredDisclosureUserEventSubscriptionIds.some((id) => !disclosureUserEventSubscriptionById.has(id));
  const userEventWatchlist = disclosureUserEventSubscriptionById.get("DUES-01-WATCHLIST-ADD-DOES-NOT-SUBSCRIBE-TO-EVENT");
  const userEventLegacy = disclosureUserEventSubscriptionById.get("DUES-02-BROAD-DART-PREFERENCE-IS-NOT-REINTERPRETED-AS-EVENT-OPT-IN");
  const userEventEligibility = disclosureUserEventSubscriptionById.get("DUES-04-WATCHLIST-RELEVANCE-NEEDS-APPROVED-ELIGIBLE-SUBJECT");
  const userEventFiler = disclosureUserEventSubscriptionById.get("DUES-05-FILER-ONLY-MATCH-DOES-NOT-BECOME-DIRECT-IMPACT");
  const userEventDeleteWatchlist = disclosureUserEventSubscriptionById.get("DUES-06-EXPLICIT-EVENT-SUBSCRIPTION-IS-INDEPENDENT-OF-WATCHLIST");
  const userEventIsolation = disclosureUserEventSubscriptionById.get("DUES-07-OWNER-SCOPE-ISOLATES-READS-AND-COUNTS");
  const userEventRevocation = disclosureUserEventSubscriptionById.get("DUES-08-REVOCATION-ADVANCES-REVISION-AND-FENCES-QUEUED-SEND");
  const userEventPersonalOverlay = disclosureUserEventSubscriptionById.get("DUES-09-READ-DISMISS-AND-MUTE-ARE-PERSONAL-OVERLAY-ONLY");
  const userEventEndpointFanout = disclosureUserEventSubscriptionById.get("DUES-12-ONE-USER-CANDIDATE-FANS-OUT-TO-HASHED-ENDPOINT-ATTEMPTS");
  const userEventSeparateOptIns = disclosureUserEventSubscriptionById.get("DUES-13-EVENT-TRANSITION-AND-DATE-REMINDER-USE-SEPARATE-OPT-INS");
  const userEventLegacyToggle = disclosureUserEventSubscriptionById.get("DUES-14-LEGACY-DART-DEVICE-TOGGLE-IS-A-SUPPRESSION-GATE-NOT-CONSENT");
  const userEventLiveGate = disclosureUserEventSubscriptionById.get("DUES-15-DISPATCH-REVALIDATES-LIVE-REVISION-RIGHTS-AND-RECIPIENT-GATES");
  const userEventCorrectionScope = disclosureUserEventSubscriptionById.get("DUES-16-CORRECTION-RECIPIENTS-COME-FROM-COMPLETE-AFFECTED-EXPOSURE-SET");
  const userEventProviderUnknown = disclosureUserEventSubscriptionById.get("DUES-17-PROVIDER-ACCEPTANCE-AND-TIMEOUT-DO-NOT-CLAIM-USER-RECEIPT");
  const userEventOldPush = disclosureUserEventSubscriptionById.get("DUES-18-ACCEPTED-OLD-PUSH-CAN-NOT-BE-RETRACTED-AND-LINK-REVALIDATES");
  const userEventTargetHash = disclosureUserEventSubscriptionById.get("DUES-19-TARGET-IDENTITY-HASH-IS-KEYED-DOMAIN-SEPARATED-AND-REPRODUCIBLE");
  const userEventKeyRotation = disclosureUserEventSubscriptionById.get("DUES-20-KEY-ROTATION-OR-RETENTION-EXPIRY-BLOCKS-UNLINKABLE-RECONCILIATION");
  const targetHashContract = disclosureUserEventSubscriptionFixture?.targetIdentityHashContract;
  const targetHashGolden = targetHashContract?.goldenVector;
  const expectedTargetIdentityHash = targetHashGolden?.input && targetHashGolden?.testOnlyKeyUtf8
    ? `hmac-sha256:${targetHashGolden.keyId}:${createHmac("sha256", Buffer.from(targetHashGolden.testOnlyKeyUtf8, "utf8")).update(Buffer.from(`${targetHashContract.domainSeparator}\0`, "utf8")).update(Buffer.from(jcsStringify(targetHashGolden.input), "utf8")).digest("hex")}`
    : null;
  const invalidDisclosureUserEventSubscriptionSafety = userEventWatchlist?.expected?.eventSubscriptionCreated !== false
    || userEventLegacy?.expected?.eventSubscriptionCreated !== false
    || userEventLegacy?.expected?.implicitConsent !== false
    || userEventEligibility?.expected?.instrumentPushCandidate !== false
    || userEventFiler?.expected?.directImpactClaim !== false
    || userEventDeleteWatchlist?.expected?.eventSubscription !== "ACTIVE"
    || userEventIsolation?.expected?.existenceLeak !== false
    || userEventRevocation?.expected?.dispatch !== false
    || userEventPersonalOverlay?.expected?.globalEventChanged !== false
    || userEventPersonalOverlay?.expected?.otherUserChanged !== false
    || userEventEndpointFanout?.expected?.rawEndpointPersisted !== false
    || userEventSeparateOptIns?.expected?.confirmedDateReminderCandidate !== false
    || userEventLegacyToggle?.expected?.eventConsentInferredFromLegacyToggle !== false
    || userEventLegacyToggle?.expected?.dispatch !== false
    || userEventLiveGate?.expected?.dispatch !== false
    || userEventCorrectionScope?.expected?.unaffectedTargetSent !== false
    || userEventCorrectionScope?.expected?.allCurrentSubscribersBroadcast !== false
    || userEventProviderUnknown?.expected?.userReceipt !== "UNOBSERVED"
    || userEventProviderUnknown?.expected?.attemptState !== "ATTEMPTED_UNKNOWN"
    || userEventProviderUnknown?.expected?.deviceDeliveredClaim !== false
    || userEventProviderUnknown?.expected?.blindRetry !== false
    || userEventOldPush?.expected?.cachedOldBodyUsed !== false
    || userEventOldPush?.expected?.providerRetractionClaim !== false
    || targetHashContract?.domainSeparator !== "KR-DISCLOSURE-DELIVERY-TARGET-v1"
    || targetHashContract?.canonicalization !== "RFC8785-JCS"
    || targetHashGolden?.expectedHash !== expectedTargetIdentityHash
    || targetHashGolden?.keyId !== "SYNTH-KEY-1"
    || targetHashGolden?.testOnlyKeyUtf8 !== "synthetic-fixture-key-never-for-runtime"
    || userEventTargetHash?.expected?.hashMatchesGoldenVector !== true
    || userEventTargetHash?.expected?.rawTargetInLedger !== false
    || userEventTargetHash?.expected?.hashIsAnonymous !== false
    || userEventKeyRotation?.expected?.crossKeyJoin !== "BLOCKED"
    || userEventKeyRotation?.expected?.silentlyTreatAsUnaffected !== false
    || disclosureUserEventSubscriptionFixture?.targetIdentityRetentionContract?.retentionPolicyRevision !== null;
  const disclosureUserEventSubscriptionArchitecture = readFileSync(krArchitecturePath, "utf8");
  const disclosureUserEventSubscriptionTerms = ["사건별 사용자 구독과 관심 overlay 계약 — DUES-01–DUES-10", "구독에서 발송 시도·정정 reconciliation으로의 연결 — DUES-11–DUES-18", "target identity hash 및 공통 전송 envelope — DUES-19–DUES-20", "기존 일반 피드 선호로만 유지", "watchlist와 독립적으로 존속", "EventSubjectInstrument", "correction-delivery-reconciliation.v0.json", "publication epoch/revision", "DELIVERY-TARGET-HASH-v1", "PSEUDONYMOUS_PERSONAL_DELIVERY_METADATA", "disclosure-user-event-subscription.v0.json"];
  const missingDisclosureUserEventSubscriptionTerms = disclosureUserEventSubscriptionTerms.filter((term) => !disclosureUserEventSubscriptionArchitecture.includes(term));
  if (invalidDisclosureUserEventSubscriptionStructure || invalidDisclosureUserEventSubscriptionSafety || missingDisclosureUserEventSubscriptionTerms.length) {
    console.error(`Disclosure user event subscription contract incomplete: ${[...(invalidDisclosureUserEventSubscriptionStructure ? ["fixture version/data policy/scopes/fields/vector IDs"] : []), ...(invalidDisclosureUserEventSubscriptionSafety ? ["watchlist/legacy consent/eligibility/identity/owner isolation/revocation/global state safety"] : []), ...missingDisclosureUserEventSubscriptionTerms].join(", ")}`);
    process.exit(1);
  }
  const pushPreferenceLockscreenFixturePath = join(root, "docs", "fixtures", "disclosure", "push-preference-lockscreen.v0.json");
  const requiredPushPreferenceLockscreenIds = [
    "NPL-01-MASTER-OFF-PRESERVES-INDIVIDUAL-SOURCE-CHOICES", "NPL-02-MASTER-ON-RESUMES-ONLY-EXPLICITLY-ENABLED-SOURCES", "NPL-03-FIRST-SOURCE-OPT-IN-DOES-NOT-ENABLE-OTHER-SOURCES",
    "NPL-04-OS-PERMISSION-AND-APP-PREFERENCES-ARE-INDEPENDENT", "NPL-05-PREFERENCE-UI-IDENTIFIES-CURRENT-DEVICE-SCOPE", "NPL-06-GENERAL-DART-PREFERENCE-IS-NOT-EVENT-SUBSCRIPTION",
    "NPL-07-GENERIC-LOCKSCREEN-PREVIEW-OMITS-FILING-AND-INVESTMENT-DETAILS", "NPL-08-DETAILED-LOCKSCREEN-PREVIEW-REQUIRES-EXPLICIT-DEVICE-CHOICE", "NPL-09-PREVIEW-CHANGE-IS-REVALIDATED-BEFORE-QUEUED-DISPATCH",
    "NPL-10-TEST-PUSH-IS-AUTHORIZED-AND-CURRENT-DEVICE-ONLY", "NPL-11-TEST-MESSAGE-CANNOT-MIMIC-A-REAL-POSITIVE-DART-ALERT", "NPL-12-PERMISSION-REGRANT-DOES-NOT-RESTORE-APP-SOURCE-CONSENT",
    "NPL-13-SETTINGS-CATEGORIES-MUST-MATCH-AUDITED-PRODUCER-CALL-SITES",
  ];
  let pushPreferenceLockscreenFixture;
  try {
    const fixtureSource = readFileSync(pushPreferenceLockscreenFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    pushPreferenceLockscreenFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Push preference lockscreen fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const pushPreferenceLockscreenIds = (pushPreferenceLockscreenFixture?.vectors ?? []).map((vector) => vector?.id);
  const pushPreferenceLockscreenById = new Map((pushPreferenceLockscreenFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidPushPreferenceLockscreenStructure = pushPreferenceLockscreenFixture?.contractVersion !== "push-preference-lockscreen.v0"
    || pushPreferenceLockscreenFixture?.classification !== "SYNTHETIC_PRODUCT_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || pushPreferenceLockscreenFixture?.dataPolicy?.containsRealUser !== false
    || pushPreferenceLockscreenFixture?.dataPolicy?.containsRealFiling !== false
    || pushPreferenceLockscreenFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || pushPreferenceLockscreenFixture?.dataPolicy?.containsCredentials !== false
    || pushPreferenceLockscreenFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !["OS_PERMISSION", "DEVICE_MASTER", "DEVICE_SOURCE", "EVENT_SUBSCRIPTION", "LOCKSCREEN_PREVIEW"].every((scope) => pushPreferenceLockscreenFixture?.preferenceScopes?.includes(scope))
    || !["deviceIdentity", "masterEnabled", "enabledSources", "previewMode", "preferenceRevision", "updatedAt"].every((field) => pushPreferenceLockscreenFixture?.requiredPreferenceFields?.includes(field))
    || pushPreferenceLockscreenFixture?.vectors?.length !== requiredPushPreferenceLockscreenIds.length
    || new Set(pushPreferenceLockscreenIds).size !== pushPreferenceLockscreenIds.length
    || requiredPushPreferenceLockscreenIds.some((id) => !pushPreferenceLockscreenById.has(id));
  const preferenceMasterOff = pushPreferenceLockscreenById.get("NPL-01-MASTER-OFF-PRESERVES-INDIVIDUAL-SOURCE-CHOICES");
  const preferenceFirstSource = pushPreferenceLockscreenById.get("NPL-03-FIRST-SOURCE-OPT-IN-DOES-NOT-ENABLE-OTHER-SOURCES");
  const preferenceOsPermission = pushPreferenceLockscreenById.get("NPL-04-OS-PERMISSION-AND-APP-PREFERENCES-ARE-INDEPENDENT");
  const preferenceDeviceScope = pushPreferenceLockscreenById.get("NPL-05-PREFERENCE-UI-IDENTIFIES-CURRENT-DEVICE-SCOPE");
  const preferenceEventConsent = pushPreferenceLockscreenById.get("NPL-06-GENERAL-DART-PREFERENCE-IS-NOT-EVENT-SUBSCRIPTION");
  const preferenceGenericPreview = pushPreferenceLockscreenById.get("NPL-07-GENERIC-LOCKSCREEN-PREVIEW-OMITS-FILING-AND-INVESTMENT-DETAILS");
  const preferenceQueuedPreview = pushPreferenceLockscreenById.get("NPL-09-PREVIEW-CHANGE-IS-REVALIDATED-BEFORE-QUEUED-DISPATCH");
  const preferenceTestPush = pushPreferenceLockscreenById.get("NPL-10-TEST-PUSH-IS-AUTHORIZED-AND-CURRENT-DEVICE-ONLY");
  const preferenceTestMessage = pushPreferenceLockscreenById.get("NPL-11-TEST-MESSAGE-CANNOT-MIMIC-A-REAL-POSITIVE-DART-ALERT");
  const preferenceRegrant = pushPreferenceLockscreenById.get("NPL-12-PERMISSION-REGRANT-DOES-NOT-RESTORE-APP-SOURCE-CONSENT");
  const preferenceProducerParity = pushPreferenceLockscreenById.get("NPL-13-SETTINGS-CATEGORIES-MUST-MATCH-AUDITED-PRODUCER-CALL-SITES");
  const invalidPushPreferenceLockscreenSafety = preferenceMasterOff?.expected?.sourceChoicesMutated !== false
    || preferenceFirstSource?.expected?.otherSourcesEnabled !== false
    || preferenceFirstSource?.expected?.consentInferredFromPermission !== false
    || preferenceOsPermission?.expected?.permissionImpliesPreference !== false
    || preferenceDeviceScope?.expected?.accountWideClaim !== false
    || preferenceEventConsent?.expected?.eventPushAllowed !== false
    || preferenceGenericPreview?.expected?.visibleTitleContainsCompany !== false
    || preferenceGenericPreview?.expected?.visibleBodyContainsFilingTitle !== false
    || preferenceGenericPreview?.expected?.visibleBodyContainsKeyword !== false
    || preferenceGenericPreview?.expected?.visibleBodyContainsGrade !== false
    || preferenceQueuedPreview?.expected?.oldDetailedPayloadDispatch !== false
    || preferenceTestPush?.expected?.dispatch !== false
    || preferenceTestPush?.expected?.requiredAuthorization !== "OWNER_OR_ADMIN"
    || preferenceTestPush?.expected?.targetScope !== "CURRENT_DEVICE_ONLY"
    || preferenceTestPush?.expected?.broadcastToOthers !== false
    || preferenceTestMessage?.expected?.messageClearlyMarkedTest !== true
    || preferenceTestMessage?.expected?.positiveInvestmentSignalImplied !== false
    || preferenceRegrant?.expected?.deliveryAllowed !== false
    || preferenceProducerParity?.expected?.verifiedProductionSources?.join(",") !== "DART"
    || preferenceProducerParity?.expected?.scannerDeliveryClaimVerified !== false
    || preferenceProducerParity?.expected?.labelRequiresProducerInventory !== true;
  const pushPreferenceLockscreenArchitecture = readFileSync(krArchitecturePath, "utf8");
  const requiredPushPreferenceLockscreenTerms = ["푸시 선호·잠금 화면 privacy 계약 — NPL-01–NPL-13", "enablePush()", "전체 endpoint 목록", "middleware.ts", "push_subscriptions", "lib/dart-automation.ts", "GENERIC", "OWNER_OR_ADMIN", "push-preference-lockscreen.v0.json"];
  const missingPushPreferenceLockscreenTerms = requiredPushPreferenceLockscreenTerms.filter((term) => !pushPreferenceLockscreenArchitecture.includes(term));
  if (invalidPushPreferenceLockscreenStructure || invalidPushPreferenceLockscreenSafety || missingPushPreferenceLockscreenTerms.length) {
    console.error(`Push preference lockscreen contract incomplete: ${[...(invalidPushPreferenceLockscreenStructure ? ["fixture version/data policy/preference scopes/fields/vector IDs"] : []), ...(invalidPushPreferenceLockscreenSafety ? ["master/source/OS/device/event/lockscreen/test-push fail-closed expectations"] : []), ...missingPushPreferenceLockscreenTerms].join(", ")}`);
    process.exit(1);
  }
  const pushTestDeliverySafetyFixturePath = join(root, "docs", "fixtures", "disclosure", "push-test-delivery-safety.v0.json");
  const requiredPushTestDeliverySafetyIds = [
    "PTDS-01-AUTHORIZATION-PRECEDES-DB-AND-SENDER-SIDE-EFFECTS", "PTDS-02-USER-TEST-REQUIRES-VERIFIABLE-ENDPOINT-OWNER-BINDING", "PTDS-03-USER-TEST-NEVER-USES-ALL-ENDPOINT-BROADCAST-LOADER",
    "PTDS-04-ADMIN-TEST-USES-AN-EXPLICIT-BOUNDED-TARGET-SET", "PTDS-05-REPEATED-TEST-REQUESTS-ARE-RATE-LIMITED-AND-AUDITED", "PTDS-06-COOKIE-AUTHENTICATED-POST-REQUIRES-CSRF-DEFENSE",
    "PTDS-07-AUDIT-IS-RECONCILABLE-WITHOUT-RAW-ENDPOINT-OR-CREDENTIALS", "PTDS-08-REPOSITORY-ROUTE-FACTS-DO-NOT-PROVE-DEPLOYMENT-REACHABILITY",
    "PTDS-09-TEST-PAYLOAD-IS-DISTINCT-FROM-REAL-DART-INVESTMENT-ALERT", "PTDS-10-AMBIGUOUS-OR-EMPTY-TARGET-SET-FAILS-CLOSED",
  ];
  let pushTestDeliverySafetyFixture;
  try {
    const fixtureSource = readFileSync(pushTestDeliverySafetyFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    pushTestDeliverySafetyFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Push test delivery safety fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const pushTestDeliverySafetyIds = (pushTestDeliverySafetyFixture?.vectors ?? []).map((vector) => vector?.id);
  const pushTestDeliverySafetyById = new Map((pushTestDeliverySafetyFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidPushTestDeliverySafetyStructure = pushTestDeliverySafetyFixture?.contractVersion !== "push-test-delivery-safety.v0"
    || pushTestDeliverySafetyFixture?.classification !== "SYNTHETIC_OPERATIONAL_DESIGN_FIXTURES_NOT_RUNTIME_OR_DEPLOYMENT_PROOF"
    || pushTestDeliverySafetyFixture?.dataPolicy?.containsRealUser !== false
    || pushTestDeliverySafetyFixture?.dataPolicy?.containsRealEndpoint !== false
    || pushTestDeliverySafetyFixture?.dataPolicy?.containsCredentials !== false
    || pushTestDeliverySafetyFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !["AUTHORIZATION", "CSRF_IF_COOKIE_AUTH", "ACTOR_RATE_LIMIT", "OWNER_TARGET_RESOLUTION", "PREFERENCE_CHECK", "TEST_PAYLOAD_RENDER", "SCOPED_DISPATCH", "APPEND_ONLY_AUDIT"].every((stage) => pushTestDeliverySafetyFixture?.executionStages?.includes(stage))
    || !["requestId", "actorScope", "targetScope", "recipientCount", "payloadHash", "attemptState", "createdAt"].every((field) => pushTestDeliverySafetyFixture?.requiredDispatchFields?.includes(field))
    || !["PRESENT_AND_VERIFIED", "MISSING", "UNVERIFIED"].every((state) => pushTestDeliverySafetyFixture?.deploymentEvidenceStates?.includes(state))
    || pushTestDeliverySafetyFixture?.vectors?.length !== requiredPushTestDeliverySafetyIds.length
    || new Set(pushTestDeliverySafetyIds).size !== pushTestDeliverySafetyIds.length
    || requiredPushTestDeliverySafetyIds.some((id) => !pushTestDeliverySafetyById.has(id));
  const testSafetyAuth = pushTestDeliverySafetyById.get("PTDS-01-AUTHORIZATION-PRECEDES-DB-AND-SENDER-SIDE-EFFECTS");
  const testSafetyOwner = pushTestDeliverySafetyById.get("PTDS-02-USER-TEST-REQUIRES-VERIFIABLE-ENDPOINT-OWNER-BINDING");
  const testSafetyFanout = pushTestDeliverySafetyById.get("PTDS-03-USER-TEST-NEVER-USES-ALL-ENDPOINT-BROADCAST-LOADER");
  const testSafetyAdminCap = pushTestDeliverySafetyById.get("PTDS-04-ADMIN-TEST-USES-AN-EXPLICIT-BOUNDED-TARGET-SET");
  const testSafetyRateLimit = pushTestDeliverySafetyById.get("PTDS-05-REPEATED-TEST-REQUESTS-ARE-RATE-LIMITED-AND-AUDITED");
  const testSafetyCsrf = pushTestDeliverySafetyById.get("PTDS-06-COOKIE-AUTHENTICATED-POST-REQUIRES-CSRF-DEFENSE");
  const testSafetyAudit = pushTestDeliverySafetyById.get("PTDS-07-AUDIT-IS-RECONCILABLE-WITHOUT-RAW-ENDPOINT-OR-CREDENTIALS");
  const testSafetyDeployment = pushTestDeliverySafetyById.get("PTDS-08-REPOSITORY-ROUTE-FACTS-DO-NOT-PROVE-DEPLOYMENT-REACHABILITY");
  const testSafetyMessage = pushTestDeliverySafetyById.get("PTDS-09-TEST-PAYLOAD-IS-DISTINCT-FROM-REAL-DART-INVESTMENT-ALERT");
  const testSafetyTarget = pushTestDeliverySafetyById.get("PTDS-10-AMBIGUOUS-OR-EMPTY-TARGET-SET-FAILS-CLOSED");
  const invalidPushTestDeliverySafety = testSafetyAuth?.expected?.dispatch !== false
    || testSafetyAuth?.expected?.schemaWork !== false
    || testSafetyOwner?.expected?.dispatch !== false
    || testSafetyOwner?.expected?.selfServiceMode !== "BLOCKED_UNTIL_OWNER_LINK"
    || testSafetyFanout?.expected?.globalBroadcast !== false
    || testSafetyAdminCap?.expected?.excessTargets !== "REJECTED"
    || testSafetyRateLimit?.expected?.overLimitDispatch !== false
    || testSafetyCsrf?.expected?.dispatch !== false
    || testSafetyAudit?.expected?.rawEndpointPersisted !== false
    || testSafetyAudit?.expected?.credentialPersisted !== false
    || testSafetyAudit?.expected?.providerAcceptedMeansDeviceReceipt !== false
    || testSafetyMessage?.expected?.clearlyMarkedTest !== true
    || testSafetyMessage?.expected?.positiveSignalImplied !== false
    || testSafetyDeployment?.expected?.externalReachability !== "UNVERIFIED"
    || testSafetyDeployment?.expected?.codePathProtection !== "ABSENT"
    || testSafetyDeployment?.expected?.deploymentProtectionClaim !== false
    || testSafetyTarget?.expected?.fallbackToAll !== false;
  const pushTestDeliverySafetyArchitecture = readFileSync(krArchitecturePath, "utf8");
  const requiredPushTestDeliverySafetyTerms = ["테스트 발송의 실행 순서와 배포 근거 — PTDS-01–PTDS-10", "EXTERNAL_REACHABILITY=UNVERIFIED", "OWNER_TARGET_RESOLUTION", "CSRF_IF_COOKIE_AUTH", "recipient cap", "push-test-delivery-safety.v0.json"];
  const missingPushTestDeliverySafetyTerms = requiredPushTestDeliverySafetyTerms.filter((term) => !pushTestDeliverySafetyArchitecture.includes(term));
  if (invalidPushTestDeliverySafetyStructure || invalidPushTestDeliverySafety || missingPushTestDeliverySafetyTerms.length) {
    console.error(`Push test delivery safety contract incomplete: ${[...(invalidPushTestDeliverySafetyStructure ? ["fixture version/data policy/execution stages/dispatch fields/vector IDs"] : []), ...(invalidPushTestDeliverySafety ? ["auth/owner/fanout/cap/rate/CSRF/privacy/deployment fail-closed expectations"] : []), ...missingPushTestDeliverySafetyTerms].join(", ")}`);
    process.exit(1);
  }
  const pushPrivacyDataflowFixturePath = join(root, "docs", "fixtures", "disclosure", "push-privacy-dataflow.v0.json");
  const requiredPushPrivacyDataflowIds = [
    "PPD-01-GENERIC-PROJECTION-REMOVES-IDENTIFYING-FILING-DETAILS", "PPD-02-DETAILED-PROJECTION-REQUIRES-CURRENT-EXPLICIT-PREVIEW-CHOICE", "PPD-03-MISSING-OR-STALE-PREFERENCE-FAILS-CLOSED-TO-GENERIC",
    "PPD-04-SERVER-PROJECTION-IS-THE-ONLY-SOURCE-OF-VISIBLE-TEXT", "PPD-05-GENERIC-MODE-REMOVES-IDENTITY-FROM-TAG-ACTIONS-AND-TARGET", "PPD-06-EVENT-PUSH-REQUIRES-DUES-OPT-IN-IN-ADDITION-TO-PREVIEW-CHOICE",
    "PPD-07-QUEUED-DETAILED-PAYLOAD-IS-REBUILT-AFTER-PRIVACY-CHANGE", "PPD-08-EVENT-CLICK-RESOLVES-CURRENT-EPOCH-AND-RIGHTS", "PPD-09-OS-PREVIEW-SETTING-IS-RECORDED-SEPARATELY-FROM-APP-MODE",
    "PPD-10-APP-OPT-OUT-DOES-NOT-CLAIM-TO-RECALL-ALREADY-DISPLAYED-NOTIFICATION", "PPD-11-DEVICE-QA-REQUIRES-VERSIONED-MATRIX-AND-VISIBLE-RESULTS", "PPD-12-PRIVACY-REGRESSION-EVIDENCE-USES-SYNTHETIC-CONTENT",
  ];
  let pushPrivacyDataflowFixture;
  try {
    const fixtureSource = readFileSync(pushPrivacyDataflowFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    pushPrivacyDataflowFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Push privacy dataflow fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const pushPrivacyDataflowIds = (pushPrivacyDataflowFixture?.vectors ?? []).map((vector) => vector?.id);
  const pushPrivacyDataflowById = new Map((pushPrivacyDataflowFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidPushPrivacyDataflowStructure = pushPrivacyDataflowFixture?.contractVersion !== "push-privacy-dataflow.v0"
    || pushPrivacyDataflowFixture?.classification !== "SYNTHETIC_PRODUCT_DESIGN_FIXTURES_NOT_RUNTIME_OR_DEVICE_QA_PROOF"
    || pushPrivacyDataflowFixture?.dataPolicy?.containsRealUser !== false
    || pushPrivacyDataflowFixture?.dataPolicy?.containsRealFiling !== false
    || pushPrivacyDataflowFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || pushPrivacyDataflowFixture?.dataPolicy?.containsCredentials !== false
    || pushPrivacyDataflowFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !["GENERIC", "DETAILED"].every((mode) => pushPrivacyDataflowFixture?.projectionModes?.includes(mode))
    || !["notificationId", "preferenceRevision", "previewMode", "title", "body", "tag", "actions", "opaqueTarget", "publicationEpoch", "rendererRevision"].every((field) => pushPrivacyDataflowFixture?.requiredProjectionFields?.includes(field))
    || !["browserName", "browserVersion", "osName", "osVersion", "deviceClass", "osPreviewSetting", "permissionState", "appPreviewMode", "buildDigest", "testRunAt", "visibleTitle", "visibleBody", "visibleActions", "result", "evidenceRef"].every((field) => pushPrivacyDataflowFixture?.deviceQaEvidenceFields?.includes(field))
    || pushPrivacyDataflowFixture?.vectors?.length !== requiredPushPrivacyDataflowIds.length
    || new Set(pushPrivacyDataflowIds).size !== pushPrivacyDataflowIds.length
    || requiredPushPrivacyDataflowIds.some((id) => !pushPrivacyDataflowById.has(id));
  const privacyGeneric = pushPrivacyDataflowById.get("PPD-01-GENERIC-PROJECTION-REMOVES-IDENTIFYING-FILING-DETAILS");
  const privacyStalePreference = pushPrivacyDataflowById.get("PPD-03-MISSING-OR-STALE-PREFERENCE-FAILS-CLOSED-TO-GENERIC");
  const privacyServiceWorker = pushPrivacyDataflowById.get("PPD-04-SERVER-PROJECTION-IS-THE-ONLY-SOURCE-OF-VISIBLE-TEXT");
  const privacyEventOptIn = pushPrivacyDataflowById.get("PPD-06-EVENT-PUSH-REQUIRES-DUES-OPT-IN-IN-ADDITION-TO-PREVIEW-CHOICE");
  const privacyQueuedPayload = pushPrivacyDataflowById.get("PPD-07-QUEUED-DETAILED-PAYLOAD-IS-REBUILT-AFTER-PRIVACY-CHANGE");
  const privacyCurrentEpoch = pushPrivacyDataflowById.get("PPD-08-EVENT-CLICK-RESOLVES-CURRENT-EPOCH-AND-RIGHTS");
  const privacyOsSetting = pushPrivacyDataflowById.get("PPD-09-OS-PREVIEW-SETTING-IS-RECORDED-SEPARATELY-FROM-APP-MODE");
  const privacyRecall = pushPrivacyDataflowById.get("PPD-10-APP-OPT-OUT-DOES-NOT-CLAIM-TO-RECALL-ALREADY-DISPLAYED-NOTIFICATION");
  const privacyQa = pushPrivacyDataflowById.get("PPD-11-DEVICE-QA-REQUIRES-VERSIONED-MATRIX-AND-VISIBLE-RESULTS");
  const privacyEvidence = pushPrivacyDataflowById.get("PPD-12-PRIVACY-REGRESSION-EVIDENCE-USES-SYNTHETIC-CONTENT");
  const invalidPushPrivacyDataflowSafety = privacyGeneric?.expected?.companyVisible !== false
    || privacyGeneric?.expected?.titleVisible !== false
    || privacyGeneric?.expected?.keywordVisible !== false
    || privacyGeneric?.expected?.gradeVisible !== false
    || privacyGeneric?.expected?.financialValueVisible !== false
    || privacyStalePreference?.expected?.effectiveMode !== "GENERIC"
    || privacyStalePreference?.expected?.detailedFallback !== false
    || privacyServiceWorker?.expected?.rawFieldFallback !== false
    || privacyServiceWorker?.expected?.rawAlertFieldsInPayload !== false
    || privacyEventOptIn?.expected?.eventPushAllowed !== false
    || privacyQueuedPayload?.expected?.oldPayloadDispatch !== false
    || privacyQueuedPayload?.expected?.queuedDetailedSuppressed !== true
    || privacyQueuedPayload?.expected?.staleGenericProjectionSuppressed !== true
    || privacyQueuedPayload?.expected?.currentPreferenceRecheckedAtReceipt !== true
    || privacyQueuedPayload?.expected?.oldPayloadFallback !== false
    || privacyCurrentEpoch?.expected?.cachedBodyReturned !== false
    || privacyOsSetting?.expected?.appClaimsOsWillShowDetails !== false
    || privacyRecall?.expected?.displayedNotificationRecallClaim !== false
    || privacyQa?.expected?.qaStatus !== "NOT_RUN"
    || privacyQa?.expected?.supportClaim !== false
    || privacyEvidence?.expected?.evidenceAccepted !== false;
  const pushPrivacyDataflowArchitecture = readFileSync(krArchitecturePath, "utf8");
  const requiredPushPrivacyDataflowTerms = ["Push projection에서 service worker·기기 QA까지의 privacy dataflow — PPD-01–PPD-12", "GENERIC", "DETAILED", "DART payload에서 회사·공시 제목·키워드·등급·원문 URL을 제거", "OS의 lock-screen preview setting", "device QA는 `NOT_RUN`", "push-privacy-dataflow.v0.json"];
  const missingPushPrivacyDataflowTerms = requiredPushPrivacyDataflowTerms.filter((term) => !pushPrivacyDataflowArchitecture.includes(term));
  if (invalidPushPrivacyDataflowStructure || invalidPushPrivacyDataflowSafety || missingPushPrivacyDataflowTerms.length) {
    console.error(`Push privacy dataflow contract incomplete: ${[...(invalidPushPrivacyDataflowStructure ? ["fixture version/data policy/projection/QA fields/vector IDs"] : []), ...(invalidPushPrivacyDataflowSafety ? ["generic projection/stale preference/service-worker/event opt-in/current epoch/OS-QA fail-closed expectations"] : []), ...missingPushPrivacyDataflowTerms].join(", ")}`);
    process.exit(1);
  }
  const pushProducerCatalogFixturePath = join(root, "docs", "fixtures", "disclosure", "push-producer-catalog.v0.json");
  let pushProducerCatalogFixture;
  try {
    const fixtureSource = readFileSync(pushProducerCatalogFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    pushProducerCatalogFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Push producer catalog fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const producerVectorIds = [
    "PPC-01-DART-IS-THE-ONLY-VERIFIED-PRODUCTION-CALL-SITE", "PPC-02-SCANNER-PREFERENCE-DOES-NOT-PROVE-A-PRODUCER", "PPC-03-US-RISING-PREFERENCE-DOES-NOT-PROVE-A-PRODUCER",
    "PPC-04-UNCONFIGURED-SOURCE-FAILS-CLOSED-WITHOUT-SUBSCRIPTION", "PPC-05-UNKNOWN-SOURCE-NEVER-INHERITS-MASTER-ONLY-DELIVERY", "PPC-06-UI-LABEL-REQUIRES-ACTIVE-END-TO-END-PRODUCER",
    "PPC-07-INVENTORY-REQUIRES-CALL-SITE-AND-USER-CLAIM-EVIDENCE", "PPC-08-SOURCE-PARITY-CHANGE-REQUIRES-INVENTORY-UPDATE",
  ];
  const producerSources = pushProducerCatalogFixture?.sources ?? [];
  const producerVectorMap = new Map((pushProducerCatalogFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const pushTestRouteSource = readFileSync(join(root, "app", "api", "push", "test", "route.ts"), "utf8");
  const pushSenderSource = readFileSync(join(root, "lib", "push.ts"), "utf8");
  const pushServiceWorkerSource = readFileSync(join(root, "public", "sw.js"), "utf8");
  const pushTestUiSource = readFileSync(join(root, "app", "notifications", "page.tsx"), "utf8");
  const pushSubscribeRouteSource = readFileSync(join(root, "app", "api", "push", "subscribe", "route.ts"), "utf8");
  const pushProviderSource = readFileSync(join(root, "components", "push-provider.tsx"), "utf8");
  const pushPreferenceSchemaSource = readFileSync(join(root, "lib", "schema.ts"), "utf8");
  const pushPreferenceMigrationSource = readFileSync(join(root, "db", "migration", "V174__push_subscription_opt_in_defaults.sql"), "utf8");
  const pushProjectionMigrationSource = readFileSync(join(root, "db", "migration", "V175__push_projection_revision.sql"), "utf8");
  const pushPreferenceStoreSafe = [
    "ALTER COLUMN enabled SET DEFAULT FALSE",
    "ALTER COLUMN dart_enabled SET DEFAULT FALSE",
    "ALTER COLUMN intensity_enabled SET DEFAULT FALSE",
    "ALTER COLUMN rising_enabled SET DEFAULT FALSE",
  ].every((term) => pushPreferenceMigrationSource.includes(term))
    && [
      'enabled: boolean("enabled").notNull().default(false)',
      'dartEnabled: boolean("dart_enabled").notNull().default(false)',
      'intensityEnabled: boolean("intensity_enabled").notNull().default(false)',
      'risingEnabled: boolean("rising_enabled").notNull().default(false)',
    ].every((term) => pushPreferenceSchemaSource.includes(term))
    && pushSubscribeRouteSource.includes("requireKeys ? false : undefined")
    && pushProjectionMigrationSource.includes("ADD COLUMN preview_mode TEXT NOT NULL DEFAULT 'GENERIC'")
    && pushProjectionMigrationSource.includes("ADD COLUMN preference_revision INTEGER NOT NULL DEFAULT 1")
    && pushPreferenceSchemaSource.includes('previewMode: text("preview_mode").notNull().default("GENERIC")')
    && pushPreferenceSchemaSource.includes('preferenceRevision: integer("preference_revision").notNull().default(1)')
    && pushSubscribeRouteSource.includes('keys.p256dh')
    && pushSubscribeRouteSource.includes('keys.auth')
    && pushSenderSource.includes('WHERE endpoint = $1 AND p256dh = $6 AND auth = $7')
    && pushSenderSource.includes('WHERE push_subscriptions.p256dh = EXCLUDED.p256dh')
    && pushSenderSource.includes('AND push_subscriptions.auth = EXCLUDED.auth')
    && pushSubscribeRouteSource.includes('"PUSH_SUBSCRIPTION_PROOF_REQUIRED"')
    && pushProviderSource.includes("dartEnabled: true")
    && pushProviderSource.includes("intensityEnabled: false")
    && pushProviderSource.includes("risingEnabled: false")
    && pushSenderSource.includes('alert.source === "DART"')
    && pushSenderSource.includes("subscription.enabled === true")
    && pushSenderSource.includes("subscription.dartEnabled === true")
    && pushSenderSource.includes('subscription.previewMode === "GENERIC"')
    && pushSenderSource.includes('privacyProjection: "GENERIC"')
    && pushSenderSource.includes("publicationEpoch: null")
    && pushSenderSource.includes('rendererRevision: "dart-generic-v1"')
    && pushServiceWorkerSource.includes('fetch("/api/push/subscribe"')
    && pushServiceWorkerSource.includes('current.preferenceRevision !== payload.preferenceRevision')
    && pushServiceWorkerSource.includes('current.enabled !== true')
    && pushServiceWorkerSource.includes('current.dartEnabled !== true')
    && !pushSubscribeRouteSource.includes("latestEndpoint")
    && !pushSubscribeRouteSource.includes("latestUserAgent")
    && !pushSubscribeRouteSource.includes("savedCount")
    && !pushSubscribeRouteSource.slice(pushSubscribeRouteSource.indexOf("export async function GET"), pushSubscribeRouteSource.indexOf("export async function POST")).includes("loadPushSubscriptionDebug")
    && pushSenderSource.includes("dart_enabled = COALESCE($3, dart_enabled)")
    && pushTestUiSource.includes("await updatePreferences({ enabled });")
    && !pushTestUiSource.includes('handleToggleSource("intensity")')
    && !pushTestUiSource.includes('handleToggleSource("rising")')
    && !pushTestUiSource.includes("국내 체결강도 푸시")
    && !pushTestUiSource.includes("미국 상승률 푸시");
  const unsafePushTestPath = pushProducerCatalogFixture?.inventorySnapshot?.testCallSites?.length !== 0
    || !pushProducerCatalogFixture?.inventorySnapshot?.disabledTestRoutes?.includes("app/api/push/test/route.ts:POST")
    || /\bsendTestPush\b/.test(pushSenderSource)
    || /\bsendTestPush\b/.test(pushTestRouteSource)
    || !pushTestRouteSource.includes('"PUSH_TEST_UNAVAILABLE"')
    || !pushTestRouteSource.includes("status: 503")
    || !pushTestUiSource.includes("테스트 푸시 일시 중단")
    || !/className=\{styles\.testButton\} disabled/.test(pushTestUiSource);
  const auditedProductionCallSites = ["app", "components", "lib", "scripts", "netlify/functions"]
    .flatMap((directory) => collectSourceFiles(join(root, directory)))
    .filter((path) => /\.(?:[cm]?[jt]sx?)$/i.test(path) && !/\.test\.[^.]+$/i.test(path) && !/\.spec\.[^.]+$/i.test(path) && !path.endsWith(join("lib", "push.ts")) && !path.endsWith(join("scripts", "check-docs.mjs")))
    .flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [...source.matchAll(/\bsendPushAlerts\s*\(/g)].map(() => `${path.slice(root.length + 1).replaceAll("\\", "/")}:call`);
    }).sort();
  const declaredProductionCallSites = (pushProducerCatalogFixture?.inventorySnapshot?.productionCallSites ?? []).map((site) => site.replace(/:[^:]+$/, ":call")).sort();
  const sourceByName = new Map(producerSources.map((source) => [source.source, source]));
  const producerInventoryInvalid = pushProducerCatalogFixture?.contractVersion !== "push-producer-catalog.v0"
    || pushProducerCatalogFixture?.classification !== "SYNTHETIC_PRODUCT_INVENTORY_NOT_DELIVERY_PROOF"
    || pushProducerCatalogFixture?.dataPolicy?.containsRealUser !== false
    || pushProducerCatalogFixture?.dataPolicy?.containsRealFiling !== false
    || pushProducerCatalogFixture?.dataPolicy?.containsCredentials !== false
    || pushProducerCatalogFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || !isDeepStrictEqual(auditedProductionCallSites, declaredProductionCallSites)
    || !["DART", "INTENSITY", "TOP_RISING", "NEWS_RADAR"].every((source) => sourceByName.has(source))
    || producerSources.length !== 4
    || producerSources.filter((source) => source.state === "PRODUCTION_DELIVERY_VERIFIED").map((source) => source.source).join(",") !== "DART"
    || producerSources.filter((source) => source.productionCaller).map((source) => source.source).join(",") !== "DART"
    || producerSources.filter((source) => source.uiLabel).map((source) => source.source).join(",") !== "DART"
    || unsafePushTestPath
    || !pushPreferenceStoreSafe
    || !pushSubscribeRouteSource.includes("preferenceRevision")
    || pushProducerCatalogFixture?.vectors?.length !== producerVectorIds.length
    || new Set(producerVectorIds).size !== producerVectorIds.length
    || producerVectorIds.some((id) => !producerVectorMap.has(id));
  const producerUnknownSource = producerVectorMap.get("PPC-05-UNKNOWN-SOURCE-NEVER-INHERITS-MASTER-ONLY-DELIVERY");
  const producerUnconfiguredSource = producerVectorMap.get("PPC-04-UNCONFIGURED-SOURCE-FAILS-CLOSED-WITHOUT-SUBSCRIPTION");
  const producerLabelGate = producerVectorMap.get("PPC-06-UI-LABEL-REQUIRES-ACTIVE-END-TO-END-PRODUCER");
  const producerSafetyInvalid = producerUnknownSource?.expected?.dispatch !== false
    || producerUnconfiguredSource?.expected?.dispatch !== false
    || producerUnconfiguredSource?.expected?.requiresExplicitPreference !== true
    || producerLabelGate?.expected?.labelMayPromiseDelivery !== false;
  const producerCatalogArchitecture = readFileSync(krArchitecturePath, "utf8");
  const producerCatalogTerms = ["푸시 source producer inventory와 UI parity — PPC-01–PPC-08", "PREFERENCE_AND_FORMATTER_ONLY", "FORMATTER_ONLY_NO_CONSENT", "push-producer-catalog.v0.json", "sendPushAlerts()"];
  const missingProducerCatalogTerms = producerCatalogTerms.filter((term) => !producerCatalogArchitecture.includes(term));
  if (producerInventoryInvalid || producerSafetyInvalid || missingProducerCatalogTerms.length) {
    console.error(`Push producer catalog incomplete: ${[...(producerInventoryInvalid ? ["fixture/data policy/source inventory/production call-site parity/label parity/vector IDs/test/preference fail-closed"] : []), ...(producerSafetyInvalid ? ["unknown/unconfigured source fail-closed and UI claim gate"] : []), ...missingProducerCatalogTerms].join(", ")}`);
    process.exit(1);
  }
  const legacyEventRevisionFixturePath = join(root, "docs", "fixtures", "disclosure", "legacy-event-revision-transition.v0.json");
  const requiredLegacyEventRevisionIds = [
    "LER-01-EDIT-CREATES-NEW-IMMUTABLE-REVISION", "LER-02-API-ASOF-DOES-NOT-RECONSTRUCT-OLD-PAYLOAD", "LER-03-OMITTED-JSON-ROW-IS-NOT-A-CANCELLATION",
    "LER-04-UNTRACEABLE-CURRENT-ROW-IS-NOT-BACKDATED", "LER-05-TRACEABLE-GIT-SNAPSHOT-KEEPS-ITS-OWN-PROVENANCE", "LER-06-SHADOW-PARITY-MISMATCH-DOES-NOT-PUBLISH",
    "LER-07-V1-COMPATIBILITY-ISOLATES-NEW-REVISION-READ", "LER-08-NOTE-PINS-ONLY-EXPLICITLY-SELECTED-REVISION", "LER-09-EXTERNAL-CONSUMER-UNKNOWN-BLOCKS-RETIREMENT",
    "LER-10-REVOKED-RIGHTS-SUPPRESS-DERIVATIVE-REVISION",
  ];
  let legacyEventRevisionFixture;
  try {
    const fixtureSource = readFileSync(legacyEventRevisionFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    legacyEventRevisionFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Legacy event revision transition fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const legacyEventRevisionIds = (legacyEventRevisionFixture?.vectors ?? []).map((vector) => vector?.id);
  const legacyEventRevisionById = new Map((legacyEventRevisionFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredLegacyEventRevisionDimensions = ["eventId", "eventRevisionId", "revisionOrdinal", "sourceSnapshotHash", "analysisRevisionId", "contentHash", "observedAt", "approvalState", "publicationGeneration"];
  const invalidLegacyEventRevisionStructure = legacyEventRevisionFixture?.contractVersion !== "legacy-event-revision-transition.v0"
    || legacyEventRevisionFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || legacyEventRevisionFixture?.dataPolicy?.containsRealEvent !== false
    || legacyEventRevisionFixture?.dataPolicy?.containsRealFiling !== false
    || legacyEventRevisionFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || legacyEventRevisionFixture?.dataPolicy?.containsSourceBody !== false
    || legacyEventRevisionFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || legacyEventRevisionFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || requiredLegacyEventRevisionDimensions.some((field) => !legacyEventRevisionFixture?.requiredRevisionDimensions?.includes(field))
    || !["APPROVED_REVISION", "LEGACY_CURRENT_STATE_ONLY", "SHADOW_ONLY", "SUPPRESSED", "UNRESOLVED"].every((state) => legacyEventRevisionFixture?.revisionStates?.includes(state))
    || legacyEventRevisionFixture?.vectors?.length !== requiredLegacyEventRevisionIds.length
    || new Set(legacyEventRevisionIds).size !== legacyEventRevisionIds.length
    || requiredLegacyEventRevisionIds.some((id) => !legacyEventRevisionById.has(id));
  const legacyEventRevisionOverwrite = legacyEventRevisionById.get("LER-01-EDIT-CREATES-NEW-IMMUTABLE-REVISION");
  const legacyEventRevisionAsOf = legacyEventRevisionById.get("LER-02-API-ASOF-DOES-NOT-RECONSTRUCT-OLD-PAYLOAD");
  const legacyEventRevisionOmission = legacyEventRevisionById.get("LER-03-OMITTED-JSON-ROW-IS-NOT-A-CANCELLATION");
  const legacyEventRevisionUntraceable = legacyEventRevisionById.get("LER-04-UNTRACEABLE-CURRENT-ROW-IS-NOT-BACKDATED");
  const legacyEventRevisionShadow = legacyEventRevisionById.get("LER-06-SHADOW-PARITY-MISMATCH-DOES-NOT-PUBLISH");
  const legacyEventRevisionV1 = legacyEventRevisionById.get("LER-07-V1-COMPATIBILITY-ISOLATES-NEW-REVISION-READ");
  const legacyEventRevisionNotes = legacyEventRevisionById.get("LER-08-NOTE-PINS-ONLY-EXPLICITLY-SELECTED-REVISION");
  const legacyEventRevisionRetirement = legacyEventRevisionById.get("LER-09-EXTERNAL-CONSUMER-UNKNOWN-BLOCKS-RETIREMENT");
  const legacyEventRevisionRights = legacyEventRevisionById.get("LER-10-REVOKED-RIGHTS-SUPPRESS-DERIVATIVE-REVISION");
  const invalidLegacyEventRevisionSafety = legacyEventRevisionOverwrite?.expected?.priorContentMutated !== false
    || legacyEventRevisionAsOf?.expected?.asOfMeansHistoricalRevision !== false
    || legacyEventRevisionOmission?.expected?.cancellationInferred !== false
    || legacyEventRevisionUntraceable?.expected?.revisionTimeBackdated !== false
    || legacyEventRevisionShadow?.expected?.vNextPublication !== "BLOCKED"
    || legacyEventRevisionV1?.expected?.v1ContractMutated !== false
    || legacyEventRevisionNotes?.expected?.silentRetarget !== false
    || legacyEventRevisionRetirement?.expected?.v1Retirement !== "BLOCKED"
    || legacyEventRevisionRights?.expected?.oldApprovalReused !== false;
  const legacyEventRevisionArchitecture = readFileSync(join(root, "docs", "architecture", "market-impact-events-design.md"), "utf8");
  const missingLegacyEventRevisionTerms = ["v1 수정 이력 한계와 revision-capable 전환 제안", "eventRevisionId", "LEGACY_CURRENT_STATE_ONLY", "legacy-event-revision-transition.v0.json", "과거 event payload를 재현하는 기준이 아니다"].filter((term) => !legacyEventRevisionArchitecture.includes(term));
  const missingLegacyEventRevisionIds = requiredLegacyEventRevisionIds.filter((id) => !legacyEventRevisionArchitecture.includes(id.slice(0, 5)));
  if (invalidLegacyEventRevisionStructure || invalidLegacyEventRevisionSafety || missingLegacyEventRevisionIds.length || missingLegacyEventRevisionTerms.length) {
    console.error(`Legacy event revision transition contract incomplete: ${[...(invalidLegacyEventRevisionStructure ? ["fixture version/data policy/dimensions/states/vector IDs"] : []), ...(invalidLegacyEventRevisionSafety ? ["immutability/as-of/omission/backdate/shadow/v1/note/retirement/rights fail-closed expectations"] : []), ...missingLegacyEventRevisionIds, ...missingLegacyEventRevisionTerms].join(", ")}`);
    process.exit(1);
  }
  const disclosureSourceCoverageFixturePath = join(root, "docs", "fixtures", "disclosure", "disclosure-source-coverage.v0.json");
  const requiredDisclosureSourceCoverageIds = [
    "DSC-01-SUCCESSFUL-EMPTY-FEED-IS-NOT-MISSING-RUN", "DSC-02-NO-SOURCE-RUN-MEANS-COVERAGE-UNKNOWN", "DSC-03-ADMIN-PREVIEW-DOES-NOT-COUNT-AS-PERSISTED-COVERAGE",
    "DSC-04-FETCH-SUCCESS-PERSIST-FAILURE-IS-PARTIAL", "DSC-05-DISABLED-OR-UNCONFIGURED-IS-NOT-EMPTY-SUCCESS", "DSC-06-RSS-FEED-WINDOW-DOES-NOT-PROVE-HISTORICAL-COMPLETENESS",
    "DSC-07-DART-PAGE-COUNT-MISMATCH-IS-PARTIAL", "DSC-08-DART-LAST-REPORT-ONLY-SETTING-CHANGES-DENOMINATOR", "DSC-09-ARTICLE-UPDATED-AT-IS-NOT-PROVIDER-FETCH-TIME",
    "DSC-10-ALL-SOURCES-PRESERVES-PER-SOURCE-FAILURE",
    "DSC-11-MANIFEST-BINDS-SOURCE-SCOPE-WINDOW-AND-SUBJECT-IDENTITY", "DSC-12-PAGE-AND-ROW-DENOMINATORS-MUST-RECONCILE",
    "DSC-13-CORRECTION-WATERMARK-MUST-COVER-APPROVED-LOOKBACK", "DSC-14-MASTER-CROSSWALK-AND-RIGHTS-ARE-SAME-MANIFEST-DEPENDENCIES",
    "DSC-15-REPEATED-PASS-STABILITY-IS-NOT-PROVIDER-SNAPSHOT", "DSC-16-COMPLETE-ONE-SOURCE-DOES-NOT-COMPLETE-OTHER-SOURCE",
    "DSC-17-OPENDART-QUERY-HASH-EXCLUDES-SECRET-AND-PAGE-CURSOR", "DSC-18-OPENDART-FILTER-OR-CORRECTION-SETTING-CHANGES-SCOPE-HASH",
    "DSC-19-UNPROFILED-RSS-URL-CANNOT-CLAIM-CANONICAL-SCOPE",
    "DSC-20-JSON-EXPORT-PRESERVES-QUERY-AND-COVERAGE-CONTEXT", "DSC-21-URL-ONLY-COPY-IS-NOT-AN-ANALYSIS-EXPORT",
    "DSC-22-PER-SOURCE-UNKNOWN-IS-PRESERVED-IN-EXPORT",
    "DSC-23-LATE-RECEIPT-OR-CORRECTION-REOPENS-PRIOR-STABLE-PASS", "DSC-24-WATERMARK-AS-OF-IS-NOT-FUTURE-COMPLETENESS",
    "DSC-25-OPENDART-STATUS-000-REQUIRES-ARRAY-LIST", "DSC-26-OPENDART-QUOTA-020-PRESERVES-PROVIDER-FAILURE", "DSC-27-CORRECTION-REQUERY-KEEPS-SCOPE-AND-AS-OF-HISTORY",
  ];
  let disclosureSourceCoverageFixture;
  try {
    const fixtureSource = readFileSync(disclosureSourceCoverageFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    disclosureSourceCoverageFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Disclosure source coverage fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const disclosureSourceCoverageIds = (disclosureSourceCoverageFixture?.vectors ?? []).map((vector) => vector?.id);
  const disclosureSourceCoverageById = new Map((disclosureSourceCoverageFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredDisclosureSourceCoverageFields = ["source", "sourceClass", "configuredState", "runId", "fetchState", "persistState", "observedAt", "itemCount", "pageCount", "failureCode", "lastSuccessfulPersistAt", "rangeCoverage"];
  const requiredCoverageManifestFields = ["manifestVersion", "manifestId", "sourceProduct", "sourceClass", "endpointOrSurface", "normalizedQueryHash", "issuerId", "instrumentId", "securityClassAndSeriesScope", "windowStart", "windowEnd", "datePrecisionAndTimezone", "expectedPageSet", "observedPageSet", "perPageObservations", "expectedTotalRows", "rawRowCount", "validRowCount", "uniqueReceiptCount", "duplicateReceiptCount", "invalidOrUnkeyedRowCount", "rowSetDigest", "metadataSetDigest", "providerSnapshotCapability", "correctionPolicyRevision", "correctionWatermarkAsOf", "correctionWatermarkState", "masterSnapshotId", "subjectApplicabilityRevisionId", "crosswalkCoverageState", "rightsDecisionSetHash", "rightsDecisionRevisionRefs", "coveragePolicyRevision", "coverageState", "manifestDigest"];
  const coverageManifestContract = disclosureSourceCoverageFixture?.coverageAssertionManifestContract;
  const coverageStorageOwnership = disclosureSourceCoverageFixture?.storageOwnershipGapMatrix;
  const coverageDecisionGatePlan = coverageStorageOwnership?.decisionGatePlan;
  const databaseDriftEvidencePackage = coverageStorageOwnership?.databaseDriftEvidencePackage;
  const decisionRegisterForCoverage = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-register.v0.json"), "utf8"));
  const decisionLedgerForCoverage = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-evidence-ledger.v0.json"), "utf8"));
  const decisionLifecycleForCoverage = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-register-lifecycle.v0.json"), "utf8"));
  const registeredCoverageDecisionIds = new Set((decisionRegisterForCoverage?.decisions ?? []).map((decision) => decision?.decisionId));
  const priceReplayGovernanceFixture = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "event-price-observation.v0.json"), "utf8"));
  const unregisteredPriceReplayGovernanceDecisions = (priceReplayGovernanceFixture?.requiredGovernanceDecisionIds ?? []).filter((id) => !registeredCoverageDecisionIds.has(id));
  const coverageGateDecisionGroups = ["requiredBeforePersistenceDesign", "requiredBeforeReconciledAsOf", "requiredBeforePublicNegativeEvidence"];
  const invalidCoverageDecisionGatePlan = coverageDecisionGatePlan?.statusSemantics !== "Register scope/owner/acceptance requirements do not imply APPROVED. Current status is derived from the verified latest decision-evidence ledger revision; an empty ledger leaves all decisions OPEN."
    || unregisteredPriceReplayGovernanceDecisions.length > 0
    || coverageGateDecisionGroups.some((group) => !Array.isArray(coverageDecisionGatePlan?.[group]) || coverageDecisionGatePlan[group].some((id) => !registeredCoverageDecisionIds.has(id)))
    || !Array.isArray(coverageDecisionGatePlan?.reopenOn) || coverageDecisionGatePlan.reopenOn.length === 0
    || coverageStorageOwnership?.fieldOwnership?.some((entry) => entry?.decisionRefs?.some((id) => !registeredCoverageDecisionIds.has(id)))
    || (decisionLedgerForCoverage?.entries?.length ?? 0) === 0 && (decisionLifecycleForCoverage?.registerBaseline ?? []).some((entry) => entry?.currentStatus !== "OPEN")
    || !coverageDecisionGatePlan?.gateRule?.includes("not sufficient by itself")
    || !coverageDecisionGatePlan?.reopenOn?.includes("schema drift or unreviewed external writer found");
  const requiredDatabaseDriftFields = ["environmentId", "observationAt", "databaseInstanceFingerprint", "databaseVersion", "databaseRole", "schemaInventoryDigest", "flywayHistoryDigest", "repositoryMigrationHead", "pendingAndFailedMigrations", "checksumMismatches", "relationInventory", "constraintsAndIndexesInventory", "viewsFunctionsTriggersInventory", "rolesGrantsAndDefaultPrivileges", "writerAndImporterInventory", "deploymentArtifactAndCommit", "rowCountAndCanonicalDigestScope", "backupSnapshotIdAndAsOf", "restoreRehearsalReportRef", "destructivePreconditionReport", "additiveDryRunReport", "ownerReview", "evidenceManifestDigest"];
  const requiredExternalWriterFields = ["writerId", "environmentId", "ownerRole", "entryPointOrPrincipal", "targetRelations", "readWriteActions", "deploymentOrScheduleRef", "lastObservedAt", "evidenceRef", "inventoryDisposition"];
  const validDriftEnvironmentStates = ["NOT_COLLECTED_THIS_TURN", "UNKNOWN_NO_ENVIRONMENT_CATALOG_OR_OWNER_BUNDLE"];
  const invalidDatabaseDriftEvidencePackage = databaseDriftEvidencePackage?.classification !== "SYNTHETIC_EVIDENCE_REQUEST_CONTRACT_NOT_ENVIRONMENT_OBSERVATION"
    || databaseDriftEvidencePackage?.decisionId !== "KR-DB-DRIFT-01"
    || !registeredCoverageDecisionIds.has(databaseDriftEvidencePackage?.decisionId)
    || requiredDatabaseDriftFields.some((field) => !databaseDriftEvidencePackage?.requiredEnvironmentBundleFields?.includes(field))
    || requiredExternalWriterFields.some((field) => !databaseDriftEvidencePackage?.externalWriterInventory?.recordFields?.includes(field))
    || databaseDriftEvidencePackage?.environmentMatrix?.length !== 2
    || databaseDriftEvidencePackage?.environmentMatrix?.some((environment) => !validDriftEnvironmentStates.includes(environment?.evidenceState))
    || !databaseDriftEvidencePackage?.externalWriterInventory?.unknownWriterDisposition?.includes("BLOCK")
    || databaseDriftEvidencePackage?.acceptanceSequence?.length !== 7
    || databaseDriftEvidencePackage?.notEvidence?.length < 6
    || Object.values(databaseDriftEvidencePackage?.failClosedOutcomes ?? {}).some((value) => !["UNKNOWN", "BLOCKED", "OPEN"].includes(value));
  const catalogQueryCoverage = databaseDriftEvidencePackage?.catalogQueryCoverage;
  const writerDenominatorContract = databaseDriftEvidencePackage?.writerDenominatorContract;
  const databaseInventoryGoldenContract = databaseDriftEvidencePackage?.databaseInventoryGoldenFixtureContract;
  const databaseInventoryGoldenCases = databaseInventoryGoldenContract?.cases ?? [];
  const databaseInventoryGoldenCasesById = new Map(databaseInventoryGoldenCases.map((testCase) => [testCase?.id, testCase]));
  const databaseInventoryGoldenSchema = databaseInventoryGoldenContract?.schemaContract;
  const databaseInventoryJsonSchemaPath = join(root, "docs", "fixtures", "disclosure", databaseInventoryGoldenContract?.schemaRef ?? "schema/database-inventory-golden-case.v0.schema.json");
  let databaseInventoryJsonSchema;
  try {
    const schemaSource = readFileSync(databaseInventoryJsonSchemaPath, "utf8");
    assertUniqueJsonObjectKeys(schemaSource);
    databaseInventoryJsonSchema = JSON.parse(schemaSource);
  } catch {
    databaseInventoryJsonSchema = null;
  }
  let databaseInventorySchemaEngineValid = false;
  try {
    const Ajv = (await import("ajv")).default;
    const validator = new Ajv({ allErrors: true, strict: true }).compile(databaseInventoryJsonSchema);
    const validCases = databaseInventoryGoldenCases.every((testCase) => validator(testCase));
    const baseCase = databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE");
    const rejectsExtraProperty = !validator({ ...baseCase, unexpectedProperty: true });
    const rejectsInvalidType = !validator({ ...baseCase, input: { ...baseCase?.input, querySucceeded: "true" } });
    databaseInventorySchemaEngineValid = validCases && rejectsExtraProperty && rejectsInvalidType;
  } catch (error) {
    console.error(`DBI Draft-07 JSON Schema engine validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const hasExactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
    && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
  const validGoldenInput = (testCase) => {
    const schema = databaseInventoryGoldenSchema?.inputFieldsByCategory?.[testCase?.category];
    if (!schema || !hasExactKeys(testCase?.input, schema.allowed) || !schema.required.every((field) => Object.hasOwn(testCase.input, field))) return false;
    const typeMatches = (value, type) => {
      if (type === "boolean") return typeof value === "boolean";
      if (type === "string") return typeof value === "string";
      if (type === "non-negative-integer") return Number.isSafeInteger(value) && value >= 0;
      if (type === "string[]") return Array.isArray(value) && value.every((item) => typeof item === "string");
      if (type === "count-map") return value !== null && typeof value === "object" && !Array.isArray(value)
        && Object.values(value).every((count) => Number.isSafeInteger(count) && count >= 0);
      if (type === "row-tuple[]") return Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string"));
      if (type === "writer-completeness-enum") return databaseInventoryGoldenSchema?.enums?.writerCompleteness?.includes(value) === true;
      return type === "enum" ? databaseInventoryGoldenSchema?.enums?.category?.includes(value) === true : typeof value === "string";
    };
    return Object.entries(Object.fromEntries(Object.entries(testCase.input).map(([field]) => [field, databaseInventoryGoldenSchema?.types?.[field]])))
      .every(([field, type]) => typeMatches(testCase.input[field], type));
  };
  const validGoldenCaseShape = (testCase) => {
    const schema = databaseInventoryGoldenSchema?.inputFieldsByCategory?.[testCase?.category];
    return hasExactKeys(testCase, databaseInventoryGoldenSchema?.caseFields?.required ?? [])
      && validGoldenInput(testCase)
      && hasExactKeys(testCase?.expected, databaseInventoryGoldenSchema?.expectedFields?.allowed ?? [])
      && databaseInventoryGoldenSchema?.expectedFields?.required?.every((field) => Object.hasOwn(testCase.expected, field))
      && Boolean(schema);
  };
  const negativeGoldenSchemaChecks = [
    validGoldenCaseShape({ ...databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE"), extra: true }) === false,
    validGoldenCaseShape({ ...databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE"), input: { ...databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE")?.input, extra: true } }) === false,
    validGoldenCaseShape({ ...databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE"), input: Object.fromEntries(Object.entries(databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE")?.input ?? {}).filter(([key]) => key !== "declaredScope")) }) === false,
    validGoldenCaseShape({ ...databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE"), input: { ...databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE")?.input, querySucceeded: "true" } }) === false,
    validGoldenCaseShape({ ...databaseInventoryGoldenCasesById.get("DBI-03-RELATION-KIND-DENOMINATOR-MISMATCH"), input: { ...databaseInventoryGoldenCasesById.get("DBI-03-RELATION-KIND-DENOMINATOR-MISMATCH")?.input, expectedRelationKinds: { table: -1 } } }) === false,
    validGoldenCaseShape({ ...databaseInventoryGoldenCasesById.get("DBI-02-EMPTY-ROWS-BUT-ROLE-CANNOT-SEE-OTHER-SCHEMA"), expected: { ...databaseInventoryGoldenCasesById.get("DBI-02-EMPTY-ROWS-BUT-ROLE-CANNOT-SEE-OTHER-SCHEMA")?.expected, invalidEnum: "COMPLETE" } }) === false,
  ];
  const requiredDatabaseInventoryGoldenIds = ["DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE", "DBI-02-EMPTY-ROWS-BUT-ROLE-CANNOT-SEE-OTHER-SCHEMA", "DBI-03-RELATION-KIND-DENOMINATOR-MISMATCH", "DBI-04-QUERY-FAILURE-IS-NOT-EMPTY", "DBI-05-DUPLICATE-CATALOG-ROW-CHANGES-DIGEST", "DBI-06-SAME-ROWS-DIFFERENT-ORDER-SAME-CANONICAL-DIGEST", "DBI-07-EMPTY-WRITER-LIST-REPOSITORY-ONLY", "DBI-08-EVERY-WRITER-PRINCIPAL-AND-ENTRYPOINT-RECONCILED", "DBI-09-UNRESOLVED-DYNAMIC-SQL-TARGET-BLOCKS", "DBI-10-SCOPE-OR-CANONICALIZATION-REVISION-CHANGED"];
  const invalidDatabaseInventoryGoldenCases = databaseInventoryGoldenContract?.classification !== "SYNTHETIC_ACCEPTANCE_CASES_NOT_DATABASE_OBSERVATIONS"
    || databaseInventoryGoldenContract?.schemaVersion !== "database-inventory-golden-case.v0"
    || databaseInventoryGoldenContract?.schemaRef !== "schema/database-inventory-golden-case.v0.schema.json"
    || databaseInventoryGoldenContract?.schemaDraft !== "http://json-schema.org/draft-07/schema#"
    || databaseInventoryJsonSchema?.$schema !== databaseInventoryGoldenContract?.schemaDraft
    || !databaseInventorySchemaEngineValid
    || !Array.isArray(databaseInventoryJsonSchema?.oneOf)
    || databaseInventoryJsonSchema.oneOf.length !== databaseInventoryGoldenCases.length
    || databaseInventoryJsonSchema.oneOf.some((variant) => {
      const category = variant?.allOf?.[0]?.properties?.category?.const;
      const inputShape = databaseInventoryGoldenSchema?.inputFieldsByCategory?.[category];
      const inputSchema = variant?.allOf?.[1]?.properties?.input;
      return !inputShape || inputSchema?.additionalProperties !== false
        || !isDeepStrictEqual(inputSchema?.required, inputShape.required)
        || !isDeepStrictEqual(Object.keys(inputSchema?.properties ?? []).sort(), [...inputShape.allowed].sort())
        || !isDeepStrictEqual(databaseInventoryJsonSchema.oneOf.map((item) => item?.allOf?.[0]?.properties?.category?.const).sort(), Object.keys(databaseInventoryGoldenSchema?.inputFieldsByCategory ?? {}).sort());
    })
    || databaseInventoryJsonSchema.oneOf.some((variant) => !isDeepStrictEqual(variant?.allOf?.[0]?.properties?.expected?.required, databaseInventoryGoldenContract?.requiredOutcomeFields))
    || databaseInventoryGoldenSchema?.additionalProperties !== false
    || databaseInventoryGoldenContract?.requiredCaseFields?.length !== 4
    || databaseInventoryGoldenContract?.requiredOutcomeFields?.length !== 4
    || databaseInventoryGoldenCases.length !== requiredDatabaseInventoryGoldenIds.length
    || new Set(databaseInventoryGoldenCases.map((testCase) => testCase?.id)).size !== databaseInventoryGoldenCases.length
    || requiredDatabaseInventoryGoldenIds.some((id) => !databaseInventoryGoldenCasesById.has(id))
    || databaseInventoryGoldenCases.some((testCase) => !validGoldenCaseShape(testCase)
      || !["COMPLETE_WITHIN_DECLARED_PRIVILEGE_SCOPE", "PARTIAL_PRIVILEGE_OR_QUERY_FAILURE", "UNKNOWN_NO_RECONCILABLE_DENOMINATOR"].includes(testCase?.expected?.catalogCompleteness)
      || !["COMPLETE_ATTESTED_SCOPE", "PARTIAL_REPOSITORY_ONLY", "UNKNOWN_EXTERNAL_WRITER_COVERAGE"].includes(testCase?.expected?.writerCompleteness)
      || !["BLOCKED", "OPEN_FOR_REVIEW_ONLY"].includes(testCase?.expected?.migrationGate)
      || typeof testCase?.expected?.zeroMeansAbsent !== "boolean")
    || databaseInventoryGoldenCases.some((testCase) => Object.values(testCase.input).some((value) => typeof value === "number" && (!Number.isInteger(value) || value < 0)))
    || !databaseInventoryGoldenSchema?.enums?.category?.includes("scope-drift")
    || !databaseInventoryGoldenSchema?.enums?.catalogCompleteness?.includes("UNKNOWN_NO_RECONCILABLE_DENOMINATOR")
    || !databaseInventoryGoldenSchema?.enums?.writerCompleteness?.includes("UNKNOWN_EXTERNAL_WRITER_COVERAGE")
    || !databaseInventoryGoldenSchema?.enums?.migrationGate?.includes("BLOCKED")
    || databaseInventoryGoldenCasesById.get("DBI-02-EMPTY-ROWS-BUT-ROLE-CANNOT-SEE-OTHER-SCHEMA")?.expected?.zeroMeansAbsent !== false
    || databaseInventoryGoldenCasesById.get("DBI-04-QUERY-FAILURE-IS-NOT-EMPTY")?.expected?.zeroMeansAbsent !== false
    || databaseInventoryGoldenCasesById.get("DBI-07-EMPTY-WRITER-LIST-REPOSITORY-ONLY")?.expected?.migrationGate !== "BLOCKED"
    || databaseInventoryGoldenCasesById.get("DBI-06-SAME-ROWS-DIFFERENT-ORDER-SAME-CANONICAL-DIGEST")?.expected?.catalogCompleteness !== "COMPLETE_WITHIN_DECLARED_PRIVILEGE_SCOPE"
    || databaseInventoryGoldenCasesById.get("DBI-10-SCOPE-OR-CANONICALIZATION-REVISION-CHANGED")?.expected?.catalogCompleteness !== "UNKNOWN_NO_RECONCILABLE_DENOMINATOR"
    || databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE")?.expected?.zeroMeansAbsent !== true
    || databaseInventoryGoldenCasesById.get("DBI-01-EMPTY-SCOPE-WITH-RECONCILED-PRIVILEGE")?.expected?.migrationGate !== "OPEN_FOR_REVIEW_ONLY"
    || databaseInventoryGoldenCasesById.get("DBI-08-EVERY-WRITER-PRINCIPAL-AND-ENTRYPOINT-RECONCILED")?.expected?.writerCompleteness !== "COMPLETE_ATTESTED_SCOPE"
    || databaseInventoryGoldenCasesById.get("DBI-09-UNRESOLVED-DYNAMIC-SQL-TARGET-BLOCKS")?.expected?.migrationGate !== "BLOCKED"
    || negativeGoldenSchemaChecks.some((rejectedInvalidCase) => rejectedInvalidCase !== true);
  const invalidCatalogAndWriterDenominators = !catalogQueryCoverage?.inventoryScopeKey?.includes("databaseRole")
    || !catalogQueryCoverage?.relationDenominator?.requiredColumns?.includes("relkind")
    || !catalogQueryCoverage?.relationDenominator?.omissionDetection
    || !catalogQueryCoverage?.columnAndConstraintDenominator?.omissionDetection
    || !catalogQueryCoverage?.programmableObjectDenominator?.omissionDetection
    || !catalogQueryCoverage?.privilegeDenominator?.omissionDetection
    || !catalogQueryCoverage?.queryManifestFields?.includes("permissionDeniedScopes")
    || !catalogQueryCoverage?.completenessStates?.includes("UNKNOWN_NO_RECONCILABLE_DENOMINATOR")
    || !catalogQueryCoverage?.rule?.includes("otherwise the result is UNKNOWN")
    || !writerDenominatorContract?.inventoryRoots?.includes("owner-attested external service/operator integrations")
    || !writerDenominatorContract?.joinKeys?.includes("deploymentCommitOrArtifact")
    || writerDenominatorContract?.completenessChecks?.length !== 5
    || !writerDenominatorContract?.states?.includes("UNKNOWN_EXTERNAL_WRITER_COVERAGE")
    || !writerDenominatorContract?.rule?.includes("lower bound")
    || !databaseInventoryGoldenContract?.requiredOutcomeFields?.includes("zeroMeansAbsent");
  const coverageStorageOwnershipFields = (coverageStorageOwnership?.fieldOwnership ?? []).map((entry) => entry?.field);
  const queryScopeNormalizationContract = disclosureSourceCoverageFixture?.queryScopeNormalizationContract;
  const openDartScopeProfile = queryScopeNormalizationContract?.profiles?.OPENDART_LIST_JSON;
  const unprofiledSourceScopeProfile = queryScopeNormalizationContract?.profiles?.UNPROFILED_RSS_OR_PROVIDER;
  const validCoverageStorageDispositions = ["DESIGN_ONLY_NO_MIGRATION", "PARTIAL_RUNTIME_NOT_RECONCILIATION", "DECISION_GATED_NO_POLICY_APPROVED", "RIGHTS_GATED_NO_APPROVED_ACTION_SET", "DERIVED_ONLY_NO_CANONICAL_ASSERTION"];
  const validCoverageStorageConsumers = ["UNVERIFIABLE", "SUPPRESSED_RIGHTS"];
  const invalidCoverageStorageOwnership = coverageStorageOwnership?.classification !== "SYNTHETIC_CHECKED_IN_REPOSITORY_AUDIT_NOT_LIVE_DATABASE_EVIDENCE"
    || coverageStorageOwnership?.liveDatabaseCatalogState !== "UNKNOWN_NOT_INSPECTED"
    || coverageStorageOwnership?.currentCoveragePersistenceState !== "NO_COVERAGE_ASSERTION_STORAGE_FOUND_IN_CHECKED_IN_MIGRATIONS_OR_SCHEMA"
    || coverageStorageOwnership?.fieldOwnership?.length !== coverageManifestContract?.requiredManifestFields?.length
    || new Set(coverageStorageOwnershipFields).size !== coverageStorageOwnershipFields.length
    || coverageManifestContract?.requiredManifestFields?.some((field) => !coverageStorageOwnershipFields.includes(field))
    || coverageStorageOwnershipFields.some((field) => !coverageManifestContract?.requiredManifestFields?.includes(field))
    || coverageStorageOwnership?.fieldOwnership?.some((entry) => !validCoverageStorageDispositions.includes(entry?.storageDisposition)
      || !entry?.candidateOwnerRole || !entry?.evidence || !validCoverageStorageConsumers.includes(entry?.consumerGate)
      || !Array.isArray(entry?.decisionRefs) || entry.decisionRefs.length === 0
      || entry.decisionRefs.some((id) => !registeredCoverageDecisionIds.has(id)))
    || coverageStorageOwnership?.persistenceBoundary?.neverStoreInManifest?.some((item) => !["API credentials", "unapproved raw filing body", "source bytes without an applicable retention decision"].includes(item));
  const invalidDisclosureSourceCoverageStructure = disclosureSourceCoverageFixture?.contractVersion !== "disclosure-source-coverage.v0"
    || disclosureSourceCoverageFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || disclosureSourceCoverageFixture?.dataPolicy?.containsRealFiling !== false
    || disclosureSourceCoverageFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || disclosureSourceCoverageFixture?.dataPolicy?.containsSourceBody !== false
    || disclosureSourceCoverageFixture?.dataPolicy?.containsCredentials !== false
    || disclosureSourceCoverageFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || requiredDisclosureSourceCoverageFields.some((field) => !disclosureSourceCoverageFixture?.requiredCoverageFields?.includes(field))
    || !["OFFICIAL_DISCLOSURE", "EXCHANGE_FEED", "THIRD_PARTY_RSS"].every((state) => disclosureSourceCoverageFixture?.sourceClasses?.includes(state))
    || !["DB_QUERY_COMPLETE", "NO_MATCHING_STORED_ROWS", "DB_QUERY_FAILED"].every((state) => disclosureSourceCoverageFixture?.queryStates?.includes(state))
    || !["ENUMERATED_PROVIDER_RESPONSE", "PARTIAL", "UNKNOWN"].every((state) => disclosureSourceCoverageFixture?.coverageStates?.includes(state))
    || coverageManifestContract?.classification !== "SYNTHETIC_RECONCILIATION_MANIFEST_PROPOSAL_NOT_RUNTIME_SCHEMA"
    || coverageManifestContract?.notRuntimeProof !== true
    || requiredCoverageManifestFields.some((field) => !coverageManifestContract?.requiredManifestFields?.includes(field))
    || !["PAGE_ENUMERATION_COMPLETE", "OBSERVED_STABLE", "RECONCILED_AS_OF", "UNVERIFIABLE_COVERAGE_INCOMPLETE"].every((state) => coverageManifestContract?.states?.includes(state))
    || coverageManifestContract?.publicProjectionMapping?.RECONCILED_AS_OF_WITH_ZERO_MATCHES !== "NOT_FOUND_IN_SCOPE"
    || coverageManifestContract?.publicProjectionMapping?.UNKNOWN_OR_PARTIAL_OR_UNVERIFIABLE_COVERAGE !== "UNVERIFIABLE"
    || coverageManifestContract?.publicProjectionMapping?.rightsDeniedOrUnresolved !== "SUPPRESSED_RIGHTS"
    || coverageManifestContract?.consumerContractRefs?.issuerDossier !== "disclosure-dossier-public-read.v0.json#/negativeEvidenceContract"
    || coverageManifestContract?.consumerContractRefs?.investmentDossierProjection !== "disclosure-investment-dossier-projection.v0.json#/sourceCoverageBinding"
    || coverageManifestContract?.consumerContractRefs?.queryScopeNormalization !== "#/queryScopeNormalizationContract"
    || coverageManifestContract?.consumerContractRefs?.publicCoverageStatusMapping !== "disclosure-dossier-public-read.v0.json#/negativeEvidenceContract/publicCoverageStatusMapping"
    || coverageManifestContract?.consumerContractRefs?.publicCoverageVocabulary !== "disclosure-dossier-public-read.v0.json#/negativeEvidenceContract/publicCoverageMessageKo"
    || queryScopeNormalizationContract?.contractVersion !== "disclosure-query-scope-normalization.v0"
    || queryScopeNormalizationContract?.classification !== "SYNTHETIC_SOURCE_PROFILE_PROPOSAL_NOT_RUNTIME_HASH"
    || !queryScopeNormalizationContract?.canonicalization?.includes("RFC8785_JCS_UTF8")
    || !["crtfc_key", "api_key", "authorization", "cookie", "signed_url_query"].every((field) => queryScopeNormalizationContract?.secretFieldsNeverIncluded?.includes(field))
    || !queryScopeNormalizationContract?.traversalFieldsSeparateFromSemanticQueryHash?.includes("page_no")
    || !queryScopeNormalizationContract?.traversalFieldsRetainedInManifest?.includes("pageSizeRequested")
    || openDartScopeProfile?.currentRepositoryRequestProfile?.sourcePath !== "lib/dart-opendart-client.ts"
    || !openDartScopeProfile?.semanticParameters?.includes("last_reprt_at")
    || openDartScopeProfile?.currentRepositoryRequestProfile?.pageSizeRequested !== 100
    || openDartScopeProfile?.currentRepositoryRequestProfile?.datePrecisionAndTimezone !== "KST_RECEIPT_DATE_YYYYMMDD"
    || openDartScopeProfile?.currentRepositoryRequestProfile?.pageNoExcludedFromSemanticHash !== true
    || openDartScopeProfile?.currentRepositoryRequestProfile?.apiKeyExcludedFromCanonicalInput !== true
    || openDartScopeProfile?.documentedDefaults?.last_reprt_at !== "N"
    || openDartScopeProfile?.currentRepositoryRequestProfile?.effectiveParameters?.last_reprt_at !== "N"
    || openDartScopeProfile?.currentRepositoryRequestProfile?.effectiveParameters?.sort !== "date"
    || openDartScopeProfile?.currentRepositoryRequestProfile?.effectiveParameters?.sort_mth !== "desc"
    || openDartScopeProfile?.currentRepositoryRequestProfile?.effectiveParameters?.page_count !== "100"
    || unprofiledSourceScopeProfile?.canonicalQueryHash !== null
    || unprofiledSourceScopeProfile?.scopeDisposition !== "UNRESOLVED"
    || unprofiledSourceScopeProfile?.negativeEvidenceAllowed !== false
    || disclosureSourceCoverageFixture?.vectors?.length !== requiredDisclosureSourceCoverageIds.length
    || new Set(disclosureSourceCoverageIds).size !== disclosureSourceCoverageIds.length
    || requiredDisclosureSourceCoverageIds.some((id) => !disclosureSourceCoverageById.has(id));
  const disclosureCoverageEmpty = disclosureSourceCoverageById.get("DSC-01-SUCCESSFUL-EMPTY-FEED-IS-NOT-MISSING-RUN");
  const disclosureCoverageUnknown = disclosureSourceCoverageById.get("DSC-02-NO-SOURCE-RUN-MEANS-COVERAGE-UNKNOWN");
  const disclosureCoveragePreview = disclosureSourceCoverageById.get("DSC-03-ADMIN-PREVIEW-DOES-NOT-COUNT-AS-PERSISTED-COVERAGE");
  const disclosureCoveragePersistFailure = disclosureSourceCoverageById.get("DSC-04-FETCH-SUCCESS-PERSIST-FAILURE-IS-PARTIAL");
  const disclosureCoverageDartPages = disclosureSourceCoverageById.get("DSC-07-DART-PAGE-COUNT-MISMATCH-IS-PARTIAL");
  const disclosureCoverageFetchTime = disclosureSourceCoverageById.get("DSC-09-ARTICLE-UPDATED-AT-IS-NOT-PROVIDER-FETCH-TIME");
  const disclosureCoverageAllSources = disclosureSourceCoverageById.get("DSC-10-ALL-SOURCES-PRESERVES-PER-SOURCE-FAILURE");
  const coverageManifestScope = disclosureSourceCoverageById.get("DSC-11-MANIFEST-BINDS-SOURCE-SCOPE-WINDOW-AND-SUBJECT-IDENTITY");
  const coverageManifestDenominators = disclosureSourceCoverageById.get("DSC-12-PAGE-AND-ROW-DENOMINATORS-MUST-RECONCILE");
  const coverageManifestCorrection = disclosureSourceCoverageById.get("DSC-13-CORRECTION-WATERMARK-MUST-COVER-APPROVED-LOOKBACK");
  const coverageManifestIdentityRights = disclosureSourceCoverageById.get("DSC-14-MASTER-CROSSWALK-AND-RIGHTS-ARE-SAME-MANIFEST-DEPENDENCIES");
  const coverageManifestStable = disclosureSourceCoverageById.get("DSC-15-REPEATED-PASS-STABILITY-IS-NOT-PROVIDER-SNAPSHOT");
  const coverageManifestMultiSource = disclosureSourceCoverageById.get("DSC-16-COMPLETE-ONE-SOURCE-DOES-NOT-COMPLETE-OTHER-SOURCE");
  const queryHashCredentialAndPage = disclosureSourceCoverageById.get("DSC-17-OPENDART-QUERY-HASH-EXCLUDES-SECRET-AND-PAGE-CURSOR");
  const queryHashCorrectionSetting = disclosureSourceCoverageById.get("DSC-18-OPENDART-FILTER-OR-CORRECTION-SETTING-CHANGES-SCOPE-HASH");
  const queryHashUnknownProvider = disclosureSourceCoverageById.get("DSC-19-UNPROFILED-RSS-URL-CANNOT-CLAIM-CANONICAL-SCOPE");
  const exportQueryCoverageContext = disclosureSourceCoverageById.get("DSC-20-JSON-EXPORT-PRESERVES-QUERY-AND-COVERAGE-CONTEXT");
  const urlOnlyCopyBoundary = disclosureSourceCoverageById.get("DSC-21-URL-ONLY-COPY-IS-NOT-AN-ANALYSIS-EXPORT");
  const exportUnknownPerSource = disclosureSourceCoverageById.get("DSC-22-PER-SOURCE-UNKNOWN-IS-PRESERVED-IN-EXPORT");
  const lateReceiptReopensCoverage = disclosureSourceCoverageById.get("DSC-23-LATE-RECEIPT-OR-CORRECTION-REOPENS-PRIOR-STABLE-PASS");
  const watermarkIsAsOf = disclosureSourceCoverageById.get("DSC-24-WATERMARK-AS-OF-IS-NOT-FUTURE-COMPLETENESS");
  const openDartResponseShape = disclosureSourceCoverageById.get("DSC-25-OPENDART-STATUS-000-REQUIRES-ARRAY-LIST");
  const openDartQuotaFailure = disclosureSourceCoverageById.get("DSC-26-OPENDART-QUOTA-020-PRESERVES-PROVIDER-FAILURE");
  const correctionRequeryScope = disclosureSourceCoverageById.get("DSC-27-CORRECTION-REQUERY-KEEPS-SCOPE-AND-AS-OF-HISTORY");
  const openDartResponseContract = disclosureSourceCoverageFixture?.queryScopeNormalizationContract?.responseValidationAndFailureContract;
  const invalidDisclosureSourceCoverageSafety = disclosureCoverageEmpty?.expected?.noDisclosureClaim !== false
    || disclosureCoverageUnknown?.expected?.coverage !== "UNKNOWN"
    || disclosureCoveragePreview?.expected?.persistState !== "NOT_RUN"
    || disclosureCoveragePersistFailure?.expected?.coverage !== "PARTIAL"
    || disclosureCoverageDartPages?.expected?.completeEnumeration !== false
    || disclosureCoverageFetchTime?.expected?.fetchedAt !== null
    || disclosureCoverageFetchTime?.expected?.updatedAtAliasedAsFetchTime !== false
    || disclosureCoverageAllSources?.expected?.failedAndSkippedDistinguished !== true
    || coverageManifestScope?.expected?.coverageState !== "UNVERIFIABLE_COVERAGE_INCOMPLETE"
    || coverageManifestDenominators?.expected?.enumerationComplete !== false
    || coverageManifestCorrection?.expected?.reconciledAsOf !== false
    || coverageManifestIdentityRights?.expected?.publicSubjectEligible !== false
    || coverageManifestStable?.expected?.immutableSnapshotClaim !== false
    || coverageManifestMultiSource?.expected?.overallRequiredSourceCoverage !== "PARTIAL"
    || queryHashCredentialAndPage?.expected?.credentialInCanonicalInput !== false
    || queryHashCredentialAndPage?.expected?.pageNoInSemanticQueryHash !== false
    || queryHashCredentialAndPage?.expected?.pageSizeRetainedInManifest !== 100
    || queryHashCorrectionSetting?.expected?.semanticScopeHashesDiffer !== true
    || queryHashUnknownProvider?.expected?.normalizedQueryHash !== null
    || queryHashUnknownProvider?.expected?.scopeDisposition !== "UNRESOLVED"
    || queryHashUnknownProvider?.expected?.publicNegativeEvidence !== "UNVERIFIABLE"
    || exportQueryCoverageContext?.expected?.exportIncludesQueryStatus !== true
    || exportQueryCoverageContext?.expected?.exportIncludesExactQueryWindow !== true
    || exportQueryCoverageContext?.expected?.exportIncludesPerSourceCoverage !== true
    || exportQueryCoverageContext?.expected?.coveragePromotedFromMissingAttempt !== false
    || urlOnlyCopyBoundary?.expected?.payloadRemainsNewlineSeparatedUrls !== true
    || urlOnlyCopyBoundary?.expected?.queryMetadataAppended !== false
    || urlOnlyCopyBoundary?.expected?.describedAsFullJsonExport !== false
    || exportUnknownPerSource?.expected?.selectedSourceCoverage !== "UNKNOWN"
    || exportUnknownPerSource?.expected?.borrowOtherSourceSuccess !== false
    || exportUnknownPerSource?.expected?.overallQueryStatusImpliesSourceCompleteness !== false
    || lateReceiptReopensCoverage?.expected?.priorPassImmutable !== true
    || lateReceiptReopensCoverage?.expected?.currentCoverageInvalidated !== true
    || lateReceiptReopensCoverage?.expected?.newReconciliationPassRequired !== true
    || lateReceiptReopensCoverage?.expected?.unrelatedSourceScopeInvalidated !== false
    || watermarkIsAsOf?.expected?.priorAsOfAssertionRewritten !== false
    || watermarkIsAsOf?.expected?.priorAssertionCurrent !== false
    || watermarkIsAsOf?.expected?.dependentNegativeEvidenceAllowedAsCurrent !== false
    || watermarkIsAsOf?.expected?.reconciliationTriggerRecorded !== true
    || openDartResponseContract?.successStatus !== "000"
    || openDartResponseContract?.emptyStatus !== "013"
    || openDartResponseContract?.successListShape !== "ARRAY_REQUIRED"
    || openDartResponseContract?.invalidSuccessListDisposition !== "FAILED_OR_PARTIAL_NOT_EMPTY_SUCCESS"
    || openDartResponseContract?.providerFailureStatuses?.["020"] !== "QUOTA_EXCEEDED"
    || openDartResponseContract?.providerFailureDisposition?.includes("NEVER_EMPTY_SUCCESS") !== true
    || openDartResponseShape?.expected?.responseAccepted !== false
    || openDartResponseShape?.expected?.interpretedAsEmptySuccess !== false
    || openDartQuotaFailure?.expected?.failureClass !== "QUOTA_EXCEEDED"
    || openDartQuotaFailure?.expected?.providerStatusPreserved !== "020"
    || openDartQuotaFailure?.expected?.coverageState !== "PARTIAL"
    || openDartQuotaFailure?.expected?.negativeEvidenceAllowed !== false
    || correctionRequeryScope?.expected?.requerySameCanonicalQueryAndWindow !== true
    || correctionRequeryScope?.expected?.widerOverlapAllowedWithoutApproval !== false
    || correctionRequeryScope?.expected?.priorAsOfImmutable !== true
    || correctionRequeryScope?.expected?.currentCoverageInvalidated !== true
    || correctionRequeryScope?.expected?.unrelatedSourceScopeInvalidated !== false;
  const dossierReadContractForCoverage = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "disclosure-dossier-public-read.v0.json"), "utf8"));
  const eventScheduleCoverageContract = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "event-schedule-notification.v0.json"), "utf8"));
  const convertibleOutcomeCoverageContract = JSON.parse(readFileSync(join(root, "docs", "fixtures", "disclosure", "convertible-outcome-evidence.v0.json"), "utf8"));
  const dossierCoverageVectorsById = new Map((dossierReadContractForCoverage?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const eventScheduleCoverageVectorsById = new Map((eventScheduleCoverageContract?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const convertibleCoverageVectorsById = new Map((convertibleOutcomeCoverageContract?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const missingCoverageConsumerVectors = [
    [dossierCoverageVectorsById.get("DPR-21-OPENDART-013-IS-EMPTY-ONLY-IN-ITS-EXACT-COMPLETED-DATE-SCOPE")?.expected, "NOT_FOUND_IN_SCOPE_NOT_NO_EVENT"],
    [eventScheduleCoverageVectorsById.get("ESN-15-INCOMPLETE-COVERAGE-IS-UNVERIFIABLE-NOT-NO-OUTCOME")?.expected?.resolutionState, "UNVERIFIABLE_COVERAGE_INCOMPLETE"],
    [eventScheduleCoverageVectorsById.get("ESN-18-COMPLETE-SCOPE-NO-RESULT-AND-INCOMPLETE-SCOPE-ARE-DIFFERENT")?.expected?.resolutionState, "OUTCOME_NOT_REPORTED_IN_COMPLETE_SCOPE"],
    [convertibleCoverageVectorsById.get("FUEV-15-VALID-EMPTY-LISTING-SEARCH-IS-SCOPE-LIMITED")?.expected?.listingStageStatus, "NOT_FOUND_IN_SCOPE"],
    [convertibleCoverageVectorsById.get("FUEV-16-PARTIAL-OR-UNAUTHORIZED-LISTING-SEARCH-IS-UNVERIFIABLE")?.expected?.listingStageStatus, "UNVERIFIABLE"],
  ].some(([actual, expected]) => typeof actual === "object" ? actual?.expected !== expected : actual !== expected);
  const missingCoverageConsumerLinks = !coverageManifestContract?.consumerContractRefs?.eventOutcomeFollowup?.includes("ESN-15,ESN-18")
    || !coverageManifestContract?.consumerContractRefs?.convertibleListingOutcome?.includes("FUEV-15,FUEV-16")
    || dossierReadContractForCoverage?.negativeEvidenceContract?.coverageAssertionManifestRef !== "disclosure-source-coverage.v0.json#/coverageAssertionManifestContract"
    || coverageManifestContract?.consumerContractRefs?.publicCoverageVocabulary !== "disclosure-dossier-public-read.v0.json#/negativeEvidenceContract/publicCoverageMessageKo"
    || !["COVERED_AS_OF", "ENUMERATED_INCOMPLETE_RECONCILIATION", "PARTIAL", "UNVERIFIABLE", "SUPPRESSED_RIGHTS", "NOT_SEARCHED", "CONFLICT_UNRESOLVED"].every((status) => dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusVocabulary?.includes(status))
    || dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusMapping?.RECONCILED_AS_OF !== "COVERED_AS_OF"
    || dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusMapping?.PAGE_ENUMERATION_COMPLETE !== "ENUMERATED_INCOMPLETE_RECONCILIATION"
    || dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusMapping?.OBSERVED_STABLE !== "UNVERIFIABLE"
    || !dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusMapping?.PARTIAL?.includes("PARTIAL_IF_SCOPE_AND_COUNTS_ARE_RIGHTS_APPROVED")
    || dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusMapping?.noRun !== "NOT_SEARCHED"
    || dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusMapping?.manifestDigestOrScopeConflict !== "CONFLICT_UNRESOLVED"
    || dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusVocabulary?.includes("NOT_FOUND_IN_SCOPE") !== false
    || dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageStatusVocabulary?.includes("NOT_REPORTED") !== false
    || !["COVERED_AS_OF", "ENUMERATED_INCOMPLETE_RECONCILIATION", "PARTIAL", "UNVERIFIABLE", "SUPPRESSED_RIGHTS", "NOT_SEARCHED", "CONFLICT_UNRESOLVED", "NOT_FOUND_IN_SCOPE", "NOT_REPORTED"].every((status) => typeof dossierReadContractForCoverage?.negativeEvidenceContract?.publicCoverageMessageKo?.[status] === "string")
    || !["manifestId", "manifestDigest", "normalizedQueryHash", "rightsDecisionSetHash", "masterSnapshotId", "subjectApplicabilityRevisionId", "correctionWatermarkAsOf", "coveragePolicyRevision"].every((field) => dossierReadContractForCoverage?.negativeEvidenceContract?.scopeBindingFields?.includes(field))
    || eventScheduleCoverageContract?.coverageAssertionManifestRef !== "disclosure-source-coverage.v0.json#/coverageAssertionManifestContract"
    || convertibleOutcomeCoverageContract?.listingSearchPolicy?.coverageAssertionManifestRef !== "disclosure-source-coverage.v0.json#/coverageAssertionManifestContract"
    || dossierReadContractForCoverage?.negativeEvidenceContract?.manifestDigestRequiredBeforeCoverageClaim !== true
    || !dossierReadContractForCoverage?.negativeEvidenceContract?.statusVocabulary?.includes("NOT_FOUND_IN_SCOPE")
    || !dossierReadContractForCoverage?.negativeEvidenceContract?.statusVocabulary?.includes("UNVERIFIABLE");
  const dailyDisclosureCoverageArchitecture = readFileSync(join(root, "docs", "architecture", "daily-disclosure-feed-design.md"), "utf8");
  const unifiedDisclosureCoverageArchitecture = readFileSync(join(root, "docs", "architecture", "unified-disclosure-rss-ingestion-design.md"), "utf8");
  const disclosureApiSource = readFileSync(join(root, "app", "api", "disclosures", "route.ts"), "utf8");
  const disclosureTimestampPrecisionSource = readFileSync(join(root, "lib", "disclosure-timestamp-precision.ts"), "utf8");
  const disclosureCoverageProjectionSource = readFileSync(join(root, "lib", "disclosure-source-coverage.ts"), "utf8");
  const automationRunSource = readFileSync(join(root, "lib", "automation-run.ts"), "utf8");
  const marketRssPipelineSource = readFileSync(join(root, "lib", "market-rss-pipeline.ts"), "utf8");
  const dailyDisclosuresUiSource = readFileSync(join(root, "components", "daily-disclosures-page.tsx"), "utf8");
  const openDartClientSource = readFileSync(join(root, "lib", "dart-opendart-client.ts"), "utf8");
  const disclosureDartAutomationSource = readFileSync(join(root, "lib", "dart-automation.ts"), "utf8");
  const disclosureDartCronSource = readFileSync(join(root, "app", "api", "cron", "sync-filings", "route.ts"), "utf8");
  const disclosureSecCronSource = readFileSync(join(root, "app", "api", "cron", "sec-edgar", "route.ts"), "utf8");
  const disclosureCoverageApiSchemaSource = readFileSync(join(root, "scripts", "api-surface.mjs"), "utf8");
  const rssCronSource = readFileSync(join(root, "app", "api", "cron", "market-rss", "route.ts"), "utf8");
  const rssSourcesSource = readFileSync(join(root, "lib", "market-rss-sources.ts"), "utf8");
  const domesticRssSourcePath = join(root, "lib", "domestic-rss-sources.ts");
  const domesticRssRuntimeCallers = [...collectSourceFiles(join(root, "app")), ...collectSourceFiles(join(root, "lib"))]
    .filter((path) => path !== domesticRssSourcePath && !/\.test\./i.test(path) && readFileSync(path, "utf8").includes("fetchAllDomesticRss("));
  const missingDisclosureCoverageTerms = ["현재 코드 상태 대조 — 수집과 조회 coverage 분리", "sourceCoverage[]", "NO_MATCHING_STORED_ROWS", "lastSuccessfulPersistAt", "DSC-10`은 빈 성공", "DSC-20`–`DSC-22", "조회 결과 JSON snapshot", "DSC-23`–`DSC-24", "late receipt/correction 관측"].filter((term) => !dailyDisclosureCoverageArchitecture.includes(term));
  const missingDisclosureCoverageIds = requiredDisclosureSourceCoverageIds.filter((id) => !dailyDisclosureCoverageArchitecture.includes(id.slice(0, 5)));
  const invalidUnifiedDisclosureState = !unifiedDisclosureCoverageArchitecture.includes("국내 RSS가 `market_rss_fetch_snapshots`/`market_rss_articles`에 주기적으로 저장된다고 확인할 수 없다")
    || !unifiedDisclosureCoverageArchitecture.includes("운영 DB의 현재 row 분포와 저장소 밖 collector/수동 writer 존재는 미확인")
    || !disclosureApiSource.includes("from(marketRssArticles)") || !disclosureApiSource.includes("from(filings)")
    || !disclosureApiSource.includes("db.transaction(async (tx)")
    || !disclosureApiSource.includes('isolationLevel: "repeatable read"')
    || !disclosureApiSource.includes('accessMode: "read only"')
    || !disclosureApiSource.includes("leftJoin(marketRssFetchSnapshots") || !disclosureApiSource.includes("marketRssFetchSnapshots.fetchedAt")
    || !disclosureApiSource.includes('fetchedAt: sql<Date | null>`NULL::timestamptz`')
    || !disclosureApiSource.includes("projectMarketRssSourceCoverage") || !disclosureApiSource.includes("sourceCoverage,")
    || !disclosureApiSource.includes("const automationRunWindow = and(")
    || !disclosureApiSource.includes("isNull(automationRuns.finishedAt)")
    || !disclosureCoverageProjectionSource.includes("function runOverlapsQueryWindow")
    || !disclosureApiSource.includes("from(secSubmissions)")
    || !disclosureApiSource.includes("includeSecSubmissions = hours === null")
    || !disclosureApiSource.includes("raw_payload::jsonb->'filings'->'recent'->'accessionNumber'")
    || !disclosureApiSource.includes('snapshotId: sql<string | null>')
    || !disclosureApiSource.includes('sourceSnapshotId: row.snapshotId')
    || !disclosureApiSource.includes("rssHasExplicitInstant")
    || !disclosureApiSource.includes("rssDateOnly")
    || !disclosureApiSource.includes("classifyRssTimestamp(rawPayload)")
    || !disclosureApiSource.includes("const { rawPayload, ...publicRow } = row")
    || !disclosureTimestampPrecisionSource.includes("hasExplicitZone")
    || !disclosureTimestampPrecisionSource.includes("return { precision: \"UNKNOWN\", date: null }")
    || !disclosureCoverageApiSchemaSource.includes('sourceSnapshotId: { type: ["string", "null"]')
    || !disclosureApiSource.includes('id: `${row.source}:${row.externalId}`')
    || !disclosureApiSource.includes('id: `SEC:${row.accession}`')
    || !disclosureApiSource.includes('sort: "timestamp_precision_group_desc"')
    || !disclosureApiSource.includes('sortBasis: "FILED_DATE" as const')
    || !disclosureCoverageApiSchemaSource.includes('sort: { const: "timestamp_precision_group_desc" }')
    || !disclosureCoverageApiSchemaSource.includes('contentStatus: { type: "string", enum: ["FULL", "EXCERPT", "METADATA_ONLY"] }')
    || !dailyDisclosuresUiSource.includes('{ value: "SEC", label: "SEC 제출목록" }')
    || !dailyDisclosuresUiSource.includes("function DisclosureItemCard")
    || !dailyDisclosuresUiSource.includes("RANGE_COVERAGE_LABELS")
    || !dailyDisclosuresUiSource.includes("function disclosureSourceLabel")
    || !dailyDisclosuresUiSource.includes("선택한 조회 구간과 실행 시각이 겹치는 최근 자동화 기록입니다.")
    || !dailyDisclosuresUiSource.includes('aria-label="출처별 수집 상태"')
    || !dailyDisclosuresUiSource.includes('role="listitem"')
    || !dailyDisclosuresUiSource.includes('new URL(url)')
    || !dailyDisclosuresUiSource.includes('!parsed.username && !parsed.password')
    || !dailyDisclosuresUiSource.includes('safeHttpUrl(item.link)')
    || !dailyDisclosuresUiSource.includes("발행·접수 시각 미확인")
    || !dailyDisclosuresUiSource.includes('item.source === "DART" || item.source === "SEC" ? `접수일 ${filedAt}` : `날짜만 확인 ${filedAt}`')
    || !dailyDisclosuresUiSource.includes('CONTENT_STATUS_LABELS[contentStatus]')
    || !disclosureCoverageProjectionSource.includes('rangeCoverage: "UNKNOWN" as const')
    || !disclosureCoverageProjectionSource.includes("objectValue(sourceResults)?.sample")
    || !automationRunSource.includes('key === "sourceResults"')
    || !disclosureCoverageProjectionSource.includes("function projectDartCoverage")
    || !disclosureCoverageProjectionSource.includes('persistState: "NOT_RUN" as const')
    || !disclosureCoverageProjectionSource.includes('queryWindow.kind === "KST_CALENDAR_DAY"')
    || !disclosureApiSource.includes('eq(automationRuns.moduleKey, "dart-realtime")')
    || !disclosureApiSource.includes('eq(automationRuns.moduleKey, "sec-realtime")')
    || !disclosureApiSource.includes("includeSecRun ?")
    || !disclosureCoverageProjectionSource.includes("function projectSecCoverage")
    || !disclosureSecCronSource.includes("const submissionCoverage = {")
    || !disclosureSecCronSource.includes("fetchSuccessCikCount: successfulFetches.length")
    || !disclosureSecCronSource.includes("insertedSubmissionCount: successfulFetches.reduce")
    || !disclosureSecCronSource.includes("submissionCoverage, smallcapUniverse")
    || !disclosureCoverageProjectionSource.includes('rangeCoverage: "UNKNOWN" as const')
    || !disclosureDartCronSource.includes("await runFilingSync()")
    || disclosureDartCronSource.includes("withAutomationRun")
    || !disclosureCoverageProjectionSource.includes("lastSuccessfulPersistAt: null")
    || !disclosureCoverageProjectionSource.includes("fetchedAt: safeFetchedAt(result?.fetchedAt)")
    || !marketRssPipelineSource.includes("fetchedAt: item.ok ? item.feed.fetchedAt : null")
    || !disclosureCoverageApiSchemaSource.includes('fetchedAt: { type: ["string", "null"], format: "date-time", description: "Source response fetch time from the feed adapter." }')
    || !disclosureCoverageProjectionSource.includes('ingestStatus === "FETCH_FAILED"')
    || !disclosureCoverageProjectionSource.includes('itemCount: ingestStatus === "FETCH_FAILED" ? null : safeCount(result?.count)')
    || !disclosureCoverageProjectionSource.includes('? "FAILED"')
    || !disclosureCoverageProjectionSource.includes('(result !== null || run.status === "SKIPPED")')
    || !dailyDisclosuresUiSource.includes('schemaVersion: "daily-disclosure-query.v1"')
    || !dailyDisclosuresUiSource.includes("pagination, sourceCoverage, total, returned: items.length, hasMore: pagination.hasMore, items")
    || !dailyDisclosuresUiSource.includes("exportedAt: new Date().toISOString()")
    || !dailyDisclosuresUiSource.includes("페이지 일부")
    || !dailyDisclosuresUiSource.includes('page: String(page), pageSize: String(DISCLOSURE_PAGE_SIZE)')
    || !dailyDisclosuresUiSource.includes('type="search" maxLength={120}')
    || !dailyDisclosuresUiSource.includes('검색 조건에 맞는 저장 항목이 없습니다.')
    || !dailyDisclosuresUiSource.includes('제목·요약·본문 발췌·회사·티커·접수번호')
    || !dailyDisclosuresUiSource.includes('setSearchQuery(searchInput.trim())')
    || !dailyDisclosuresUiSource.includes('...(searchQuery ? { q: searchQuery } : {})')
    || !dailyDisclosuresUiSource.includes('asOf: rollingAsOf.current')
    || !dailyDisclosuresUiSource.includes('rollingAsOf.current = body.queryWindow.to')
    || !dailyDisclosuresUiSource.includes('aria-label="공시 목록 페이지"')
    || !dailyDisclosuresUiSource.includes('disabled={!pagination.hasMore')
    || !dailyDisclosuresUiSource.includes('const offsetLimitReached = page * (pagination.pageSize ?? DISCLOSURE_PAGE_SIZE) > 1_000_000')
    || !dailyDisclosuresUiSource.includes('API 조회 상한')
    || !dailyDisclosuresUiSource.includes("if (!queryLoaded || !queryWindowInfo) return")
    || !dailyDisclosuresUiSource.includes(">원문 링크 복사</button>")
    || !dailyDisclosuresUiSource.includes(">미국 RSS 원문 링크 복사</button>")
    || dailyDisclosuresUiSource.includes(">전체 JSON 복사</button>")
    || dailyDisclosuresUiSource.includes(">미국 RSS JSON 복사</button>")
    || !openDartClientSource.includes("page.responsePageNo !== pageNo")
    || !openDartClientSource.includes("page.totalPages !== expectedPages || page.totalCount !== totalCount")
    || !openDartClientSource.includes('"RECONCILED" | "PARTIAL"')
    || !openDartClientSource.includes("uniqueReceiptCount === totalCount")
    || !disclosureDartAutomationSource.includes("ok: feed.reconciliationState === \"RECONCILED\"")
    || !rssSourcesSource.includes('export const MARKET_RSS_SOURCES = ["GLOBENEWSWIRE", "NASDAQ", "NASDAQ_TRADER", "SEC_EDGAR", "STOCKTITAN"]')
    || !rssCronSource.includes('["GLOBENEWSWIRE", "STOCKTITAN", "SEC_EDGAR"]')
    || domesticRssRuntimeCallers.length > 0;
  if (invalidDisclosureSourceCoverageStructure || invalidDisclosureSourceCoverageSafety || invalidCoverageStorageOwnership || invalidCoverageDecisionGatePlan || invalidDatabaseDriftEvidencePackage || invalidCatalogAndWriterDenominators || invalidDatabaseInventoryGoldenCases || missingCoverageConsumerVectors || missingCoverageConsumerLinks || missingDisclosureCoverageIds.length || missingDisclosureCoverageTerms.length || invalidUnifiedDisclosureState) {
    console.error(`Disclosure source coverage contract incomplete: ${[...(invalidDisclosureSourceCoverageStructure ? ["fixture version/data policy/fields/states/vector IDs"] : []), ...(invalidCoverageStorageOwnership ? ["storage ownership matrix does not exactly classify all manifest fields or preserve unknown/live-state boundaries"] : []), ...(invalidCoverageDecisionGatePlan ? ["coverage approval stages/decision references/ledger-derived OPEN semantics"] : []), ...(invalidDatabaseDriftEvidencePackage ? ["database drift evidence package is incomplete or promotes unobserved environment state"] : []), ...(invalidCatalogAndWriterDenominators ? ["catalog/writer inventory denominator and omission checks"] : []), ...(invalidDatabaseInventoryGoldenCases ? ["database inventory golden case IDs/outcomes/permission/digest/scope behavior"] : []), ...(invalidDisclosureSourceCoverageSafety ? ["empty/unknown/preview/persist/page/fetch-time/all-source fail-closed expectations"] : []), ...(missingCoverageConsumerVectors ? ["DPR/ESN/FUEV consumer status mapping"] : []), ...(missingCoverageConsumerLinks ? ["reconciliation manifest consumer refs"] : []), ...missingDisclosureCoverageIds, ...missingDisclosureCoverageTerms, ...(invalidUnifiedDisclosureState ? ["documented source/query/fetch-time facts differ from checked-in runtime wiring; re-audit before changing the contract"] : [])].join(", ")}`);
    process.exit(1);
  }
  const disclosureFeedTimeFixturePath = join(root, "docs", "fixtures", "disclosure", "disclosure-feed-time-semantics.v0.json");
  const requiredDisclosureFeedTimeIds = [
    "DFT-01-KST-MIDNIGHT-DERIVES-TODAY-INDEPENDENT-OF-UTC-DATE", "DFT-02-INSTANT-BEFORE-KST-MIDNIGHT-BELONGS-TO-PRIOR-DAY",
    "DFT-03-EXPLICIT-DATE-USES-KST-HALF-OPEN-DAY", "DFT-04-ROLLING-HOURS-REMAINS-INSTANT-WINDOW",
    "DFT-05-DATE-ONLY-FILING-DOES-NOT-INVENT-MIDNIGHT", "DFT-06-UPDATED-AT-IS-STORED-TIME-NOT-FETCH-TIME",
    "DFT-07-MISSING-PUBLISHED-INSTANT-USES-ONLY-VERIFIED-FALLBACK", "DFT-08-ORDERING-IS-STABLE-FOR-EQUAL-TIME-AND-BASIS",
    "DFT-09-TRANSLATION-OR-ROW-UPDATE-DOES-NOT-CHANGE-SOURCE-TIME", "DFT-10-DATE-AND-HOUR-MODE-RETURN-DISTINCT-WINDOW-METADATA",
  ];
  let disclosureFeedTimeFixture;
  try {
    const fixtureSource = readFileSync(disclosureFeedTimeFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    disclosureFeedTimeFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Disclosure feed time fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const disclosureFeedTimeById = new Map((disclosureFeedTimeFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const invalidDisclosureFeedTimeStructure = disclosureFeedTimeFixture?.contractVersion !== "disclosure-feed-time-semantics.v0"
    || disclosureFeedTimeFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || disclosureFeedTimeFixture?.dataPolicy?.containsRealFiling !== false
    || disclosureFeedTimeFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || disclosureFeedTimeFixture?.dataPolicy?.containsSourceBody !== false
    || disclosureFeedTimeFixture?.dataPolicy?.containsCredentials !== false
    || disclosureFeedTimeFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || disclosureFeedTimeFixture?.displayTimezone !== "Asia/Seoul"
    || disclosureFeedTimeFixture?.vectors?.length !== requiredDisclosureFeedTimeIds.length
    || new Set((disclosureFeedTimeFixture?.vectors ?? []).map((vector) => vector?.id)).size !== requiredDisclosureFeedTimeIds.length
    || requiredDisclosureFeedTimeIds.some((id) => !disclosureFeedTimeById.has(id));
  const disclosureFeedTimeMidnight = disclosureFeedTimeById.get("DFT-01-KST-MIDNIGHT-DERIVES-TODAY-INDEPENDENT-OF-UTC-DATE");
  const disclosureFeedTimeDateOnly = disclosureFeedTimeById.get("DFT-05-DATE-ONLY-FILING-DOES-NOT-INVENT-MIDNIGHT");
  const disclosureFeedTimeStored = disclosureFeedTimeById.get("DFT-06-UPDATED-AT-IS-STORED-TIME-NOT-FETCH-TIME");
  const disclosureFeedTimeFallback = disclosureFeedTimeById.get("DFT-07-MISSING-PUBLISHED-INSTANT-USES-ONLY-VERIFIED-FALLBACK");
  const invalidDisclosureFeedTimeSafety = disclosureFeedTimeMidnight?.expected?.defaultDate !== "2026-11-04"
    || disclosureFeedTimeMidnight?.expected?.utcIsoSliceAccepted !== false
    || disclosureFeedTimeDateOnly?.expected?.instant !== null
    || disclosureFeedTimeStored?.expected?.fetchedAt !== null
    || disclosureFeedTimeFallback?.expected?.storedAtUsedAsFetch !== false;
  const disclosureFeedArchitecture = readFileSync(join(root, "docs", "architecture", "daily-disclosure-feed-design.md"), "utf8");
  const missingDisclosureFeedTimeIds = requiredDisclosureFeedTimeIds.filter((id) => !disclosureFeedArchitecture.includes(id.slice(0, 5)));
  const missingDisclosureFeedTimeTerms = ["기준일·시각 정밀도·정렬", "Asia/Seoul", "sortBasis", "ROLLING_HOURS", "disclosure-feed-time-semantics.v0.json"].filter((term) => !disclosureFeedArchitecture.includes(term));
  const disclosureFeedApiSource = readFileSync(join(root, "app", "api", "disclosures", "route.ts"), "utf8");
  const disclosureFeedUiSource = readFileSync(join(root, "components", "daily-disclosures-page.tsx"), "utf8");
  const seoulDateHelperSource = readFileSync(join(root, "lib", "seoul-date.ts"), "utf8");
  const disclosureFeedApiContractSource = readFileSync(join(root, "scripts", "api-surface.mjs"), "utf8");
  const dailyMarketRssExportSource = readFileSync(join(root, "lib", "daily-market-rss-export.ts"), "utf8");
  const kstDefaultDateImplementationMissing = !disclosureFeedApiSource.includes("getSeoulDateKey(now)")
    || !disclosureFeedApiSource.includes('url.searchParams.get("q")')
    || !disclosureFeedApiSource.includes('error: "INVALID_QUERY"')
    || !disclosureFeedApiSource.includes("const rssSearchWhere = searchQuery ? or(")
    || !disclosureFeedApiSource.includes("const filingSearchWhere = searchQuery ? or(")
    || !disclosureFeedApiSource.includes("const secSearchWhere = searchQuery ? or(")
    || !disclosureFeedApiSource.includes("q: searchQuery || null")
    || !disclosureFeedApiSource.includes('url.searchParams.get("asOf")')
    || !disclosureFeedApiSource.includes('error: "INVALID_AS_OF"')
    || !disclosureFeedApiSource.includes('queryStatus: total === 0 ? "NO_MATCHING_STORED_ROWS" : "DB_QUERY_COMPLETE"')
    || !disclosureFeedApiSource.includes("filedAt: filings.publishedDateSeoul")
    || !disclosureFeedApiSource.includes('filedAtPrecision: "DATE" as const')
    || !disclosureFeedApiSource.includes('filedAtPrecision: timestamp.precision === "DATE"')
    || !disclosureFeedApiSource.includes("asc(marketRssArticles.externalId)")
    || !disclosureFeedApiSource.includes("asc(filings.externalId)")
    || !disclosureFeedApiSource.includes("a.source.localeCompare(b.source) || a.externalId.localeCompare(b.externalId)")
    || !disclosureFeedApiSource.includes('sortTieBreak: "source_externalId_asc"')
    || !disclosureFeedApiSource.includes('displayTimezone: "Asia/Seoul"')
    || !disclosureFeedApiSource.includes('endExclusive: true')
    || !disclosureFeedApiSource.includes('"KST_CALENDAR_DAY"')
    || !disclosureFeedApiSource.includes('"ROLLING_HOURS"')
    || !disclosureFeedApiSource.includes("marketRssFetchSnapshots.fetchedAt")
    || !disclosureFeedApiSource.includes("leftJoin(marketRssFetchSnapshots")
    || !disclosureFeedApiSource.includes('fetchedAt: sql<Date | null>`NULL::timestamptz`')
    || disclosureFeedApiSource.includes("fetchedAt: marketRssArticles.updatedAt")
    || disclosureFeedApiSource.includes("fetchedAt: filings.updatedAt")
    || !disclosureFeedUiSource.includes("useState(getSeoulDateKey())")
    || !disclosureFeedUiSource.includes('body.displayTimezone !== "Asia/Seoul"')
    || !disclosureFeedUiSource.includes('"DB_QUERY_COMPLETE", "NO_MATCHING_STORED_ROWS"')
    || !disclosureFeedUiSource.includes("원천 공시가 없다는 뜻은 아닙니다.")
    || !disclosureFeedUiSource.includes("setQueryWindowInfo(body.queryWindow)")
    || !disclosureFeedUiSource.includes("timeZone: displayTimezone")
    || !seoulDateHelperSource.includes('timeZone: "Asia/Seoul"')
    || !seoulDateHelperSource.includes('new Intl.DateTimeFormat("sv-SE"')
    || !disclosureFeedApiContractSource.includes('displayTimezone: { const: "Asia/Seoul" }')
    || !disclosureFeedApiContractSource.includes('queryStatus: { type: "string", enum: ["DB_QUERY_COMPLETE", "NO_MATCHING_STORED_ROWS"] }')
    || !disclosureFeedApiContractSource.includes('sortTieBreak: { const: "source_externalId_asc" }')
    || !disclosureFeedApiContractSource.includes('filedAtPrecision: { type: "string", enum: ["DATE", "UNKNOWN"] }')
    || !disclosureFeedApiContractSource.includes('endExclusive: { const: true }')
    || !disclosureFeedApiContractSource.includes('Verified source response fetch time; null when no linked fetch snapshot exists.')
    || !dailyMarketRssExportSource.includes("publishedAt: null")
    || !dailyMarketRssExportSource.includes('timePrecision: "DATE"')
    || !dailyMarketRssExportSource.includes('sortBasis: "FILED_DATE"')
    || !dailyMarketRssExportSource.includes("filedAt: row.filingDate")
    || dailyMarketRssExportSource.includes('`${row.filingDate}T00:00:00.000Z`')
    || dailyMarketRssExportSource.includes("publishedAtMs: row.updatedAt")
    || !disclosureFeedArchitecture.includes("같은 함수를 사용한다")
    || !disclosureFeedArchitecture.includes("`lib/seoul-date.ts`의 `getSeoulDateKey()`")
    || !disclosureFeedArchitecture.includes("`displayTimezone`/`queryWindow` 구현을 완료했다");
  if (invalidDisclosureFeedTimeStructure || invalidDisclosureFeedTimeSafety || missingDisclosureFeedTimeIds.length || missingDisclosureFeedTimeTerms.length || kstDefaultDateImplementationMissing) {
    console.error(`Disclosure feed time contract incomplete: ${[...(invalidDisclosureFeedTimeStructure ? ["fixture version/data policy/timezone/vector IDs"] : []), ...(invalidDisclosureFeedTimeSafety ? ["KST-midnight/date precision/fetch-time safety expectations"] : []), ...missingDisclosureFeedTimeIds, ...missingDisclosureFeedTimeTerms, ...(kstDefaultDateImplementationMissing ? ["KST default date and query-window metadata missing from API/UI/API contract/design status"] : [])].join(", ")}`);
    process.exit(1);
  }
  const consumerIdentityFixturePath = join(root, "docs", "fixtures", "disclosure", "consumer-identity-revision.v0.json");
  const requiredConsumerIdentityIds = [
    "CIR-01-CONTENT-CHANGE-NEW-REVISION-SAME-IDENTITY", "CIR-02-CLAIM-EDGE-CHANGE-PRESERVES-IDENTITY-REBUILDS-REFS",
    "CIR-03-EVENT-CHANGE-NEW-IDENTITY", "CIR-04-IMMUTABLE-CORRECTED-DATE-NEW-IDENTITY-RELATION",
    "CIR-05-NATURAL-KEY-HASH-COLLISION-EXACT-CHECK", "CIR-06-CANONICAL-AND-INDEX-CARDINALITY-MISMATCH",
    "CIR-07-OLD-NEW-TRANSITION-EDGE-MISSING", "CIR-08-SUMMARY-SEGMENT-IDENTITY-EXCLUDES-ANALYSIS-REVISION",
  ];
  let consumerIdentityFixture;
  try {
    const fixtureSource = readFileSync(consumerIdentityFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    consumerIdentityFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Consumer identity/revision fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const consumerIdentityVectors = consumerIdentityFixture?.vectors;
  const consumerIdentityIds = Array.isArray(consumerIdentityVectors) ? consumerIdentityVectors.map((vector) => vector?.id) : [];
  const consumerIdentityById = new Map(Array.isArray(consumerIdentityVectors) ? consumerIdentityVectors.map((vector) => [vector?.id, vector]) : []);
  const invalidConsumerIdentityStructure = consumerIdentityFixture?.contractVersion !== "consumer-identity-revision.v0"
    || consumerIdentityFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || consumerIdentityFixture?.dataPolicy?.containsRealFiling !== false
    || consumerIdentityFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || consumerIdentityFixture?.dataPolicy?.containsSourceBody !== false
    || consumerIdentityFixture?.dataPolicy?.hashesAreSyntheticLabels !== true
    || consumerIdentityIds.length !== requiredConsumerIdentityIds.length
    || new Set(consumerIdentityIds).size !== consumerIdentityIds.length
    || requiredConsumerIdentityIds.some((id) => !consumerIdentityById.has(id))
    || consumerIdentityVectors?.some((vector) => !vector?.input || !vector?.expected || !Array.isArray(vector.expected.forbiddenPublicText) || vector.expected.forbiddenPublicText.length === 0);
  const contentChangeIdentity = consumerIdentityById.get("CIR-01-CONTENT-CHANGE-NEW-REVISION-SAME-IDENTITY");
  const claimEdgeChange = consumerIdentityById.get("CIR-02-CLAIM-EDGE-CHANGE-PRESERVES-IDENTITY-REBUILDS-REFS");
  const eventChangeIdentity = consumerIdentityById.get("CIR-03-EVENT-CHANGE-NEW-IDENTITY");
  const correctedDateIdentity = consumerIdentityById.get("CIR-04-IMMUTABLE-CORRECTED-DATE-NEW-IDENTITY-RELATION");
  const hashCollisionIdentity = consumerIdentityById.get("CIR-05-NATURAL-KEY-HASH-COLLISION-EXACT-CHECK");
  const cardinalityMismatchIdentity = consumerIdentityById.get("CIR-06-CANONICAL-AND-INDEX-CARDINALITY-MISMATCH");
  const missingTransitionIdentity = consumerIdentityById.get("CIR-07-OLD-NEW-TRANSITION-EDGE-MISSING");
  const summaryAnalysisChange = consumerIdentityById.get("CIR-08-SUMMARY-SEGMENT-IDENTITY-EXCLUDES-ANALYSIS-REVISION");
  const invalidConsumerIdentitySafety = contentChangeIdentity?.expected?.identitySame !== true
    || contentChangeIdentity?.expected?.revisionKeySame !== false
    || claimEdgeChange?.expected?.oldEdgesImmutable !== true
    || eventChangeIdentity?.expected?.identitySame !== false
    || correctedDateIdentity?.expected?.identitySame !== false
    || correctedDateIdentity?.expected?.relationRequired !== true
    || hashCollisionIdentity?.expected?.identityMerge !== false
    || hashCollisionIdentity?.expected?.disposition !== "HASH_COLLISION_QUARANTINE"
    || cardinalityMismatchIdentity?.expected?.acceptance !== "FAIL_CLOSED"
    || cardinalityMismatchIdentity?.expected?.publication !== "SUPPRESSED"
    || missingTransitionIdentity?.expected?.acceptance !== "INCOMPLETE"
    || missingTransitionIdentity?.expected?.crossGenerationImpact !== "SUPPRESSED"
    || summaryAnalysisChange?.expected?.identitySame !== true
    || summaryAnalysisChange?.expected?.analysisRevisionBoundToConsumerRevision !== true;
  const consumerIdentityArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingConsumerIdentityIdsInArchitecture = requiredConsumerIdentityIds.filter((id) => !consumerIdentityArchitecture.includes(id));
  const requiredConsumerIdentityTerms = ["consumer_identity_key", "consumer revision key", "KR-DISCLOSURE-CONSUMER-IDENTITY-v1", "KR-DISCLOSURE-CONSUMER-REVISION-v1", "identity→revision은 1:N", "transition set도 old/new revision diff", "exact-object collision check"];
  const missingConsumerIdentityTerms = requiredConsumerIdentityTerms.filter((term) => !consumerIdentityArchitecture.includes(term));
  if (invalidConsumerIdentityStructure || invalidConsumerIdentitySafety || missingConsumerIdentityIdsInArchitecture.length || missingConsumerIdentityTerms.length) {
    console.error(`Consumer identity/revision contract incomplete: ${[...(invalidConsumerIdentityStructure ? ["fixture version/data policy/vector IDs"] : []), ...(invalidConsumerIdentitySafety ? ["identity/revision/transition/collision/cardinality safety assertions"] : []), ...missingConsumerIdentityIdsInArchitecture, ...missingConsumerIdentityTerms].join(", ")}`);
    process.exit(1);
  }
  const consumerExecutableFixturePath = join(root, "docs", "fixtures", "disclosure", "consumer-identity-executable-acceptance.v0.json");
  const requiredConsumerExecutableIds = [
    "CIX-01-IDENTITY-ASCII", "CIX-02-IDENTITY-ARRAY-ORDER-PRESERVED", "CIX-03-REVISION-DOMAIN-AND-CANONICAL-ORDER",
    "CIX-04-OBJECT-PROPERTY-PERMUTATION", "CIX-05-ARRAY-ORDER-CHANGE-CHANGES-CANONICAL", "CIX-06-NFC-NFD-ARE-NOT-NORMALIZED",
    "CIX-07-UNSAFE-INTEGER-USES-DECIMAL-STRING", "CIX-08-DUPLICATE-PROPERTY-AND-LONE-SURROGATE-REJECT",
    "CIX-09-OLD-NEW-COMPOSITE-FK-RECONSTRUCTION", "CIX-10-IMPACT-ITEM-CROSSES-COMMIT", "CIX-11-IDENTITY-REVISION-REF-COUNT-MISMATCH",
    "CIX-12-TRANSITION-OMISSION-IS-INCOMPLETE-NOT-UNAFFECTED",
  ];
  let consumerExecutableFixture;
  try {
    const fixtureSource = readFileSync(consumerExecutableFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    consumerExecutableFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Consumer executable acceptance fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const consumerExecutableVectors = [
    ...(consumerExecutableFixture?.hashVectors ?? []), ...(consumerExecutableFixture?.canonicalizationCases ?? []), ...(consumerExecutableFixture?.generationJoinCases ?? []),
  ];
  const consumerExecutableIds = consumerExecutableVectors.map((vector) => vector?.id);
  const consumerExecutableById = new Map(consumerExecutableVectors.map((vector) => [vector?.id, vector]));
  const invalidConsumerExecutableStructure = consumerExecutableFixture?.contractVersion !== "consumer-identity-executable-acceptance.v0"
    || consumerExecutableFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || consumerExecutableFixture?.dataPolicy?.containsRealFiling !== false
    || consumerExecutableFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || consumerExecutableFixture?.dataPolicy?.containsSourceBody !== false
    || consumerExecutableFixture?.dataPolicy?.hashesAreComputedFromSyntheticInputs !== true
    || consumerExecutableFixture?.algorithmContract?.canonicalization !== "RFC8785-JCS"
    || consumerExecutableFixture?.algorithmContract?.digest !== "SHA-256 lowercase hex"
    || consumerExecutableIds.length !== requiredConsumerExecutableIds.length
    || new Set(consumerExecutableIds).size !== consumerExecutableIds.length
    || requiredConsumerExecutableIds.some((id) => !consumerExecutableById.has(id))
    || consumerExecutableFixture?.hashVectors?.length !== 3
    || consumerExecutableFixture?.canonicalizationCases?.length !== 5
    || consumerExecutableFixture?.generationJoinCases?.length !== 4;
  const consumerHashVectorsValid = consumerExecutableFixture?.hashVectors?.every((vector) => {
    const canonicalBytes = Buffer.from(vector?.canonicalBytesUtf8Hex ?? "", "hex");
    const declaredInputBytes = Buffer.from(vector?.inputBytesHex ?? "", "hex");
    const declaredDigest = vector?.expectedSha256 ?? "";
    const expectedCanonicalBytes = Buffer.from(vector?.canonicalJson ?? "", "utf8");
    const expectedInputBytes = vector?.encoding === "canonicalBytesOnly"
      ? expectedCanonicalBytes
      : Buffer.concat([Buffer.from(vector?.domain ?? "", "utf8"), Buffer.from([0]), expectedCanonicalBytes]);
    return /^[a-f0-9]+$/i.test(vector?.canonicalBytesUtf8Hex ?? "")
      && /^[a-f0-9]+$/i.test(vector?.inputBytesHex ?? "")
      && /^[a-f0-9]{64}$/.test(declaredDigest)
      && canonicalBytes.equals(expectedCanonicalBytes)
      && declaredInputBytes.equals(expectedInputBytes)
      && createHash("sha256").update(declaredInputBytes).digest("hex") === declaredDigest;
  }) === true;
  const oldNewGenerationVector = consumerExecutableById.get("CIX-09-OLD-NEW-COMPOSITE-FK-RECONSTRUCTION");
  const crossGenerationVector = consumerExecutableById.get("CIX-10-IMPACT-ITEM-CROSSES-COMMIT");
  const edgeMismatchVector = consumerExecutableById.get("CIX-11-IDENTITY-REVISION-REF-COUNT-MISMATCH");
  const transitionOmissionVector = consumerExecutableById.get("CIX-12-TRANSITION-OMISSION-IS-INCOMPLETE-NOT-UNAFFECTED");
  const invalidConsumerExecutableJoinSafety = oldNewGenerationVector?.expected?.crossGenerationJoinRows !== 0
    || oldNewGenerationVector?.expected?.allSetsReconciled !== true
    || oldNewGenerationVector?.expected?.acceptance !== "PASS_FOR_FIXTURE"
    || crossGenerationVector?.expected?.compositeFk !== "REJECT"
    || crossGenerationVector?.expected?.publication !== "SUPPRESSED"
    || edgeMismatchVector?.expected?.acceptance !== "FAIL_CLOSED"
    || transitionOmissionVector?.expected?.disposition !== "INCOMPLETE"
    || transitionOmissionVector?.expected?.unaffectedCount !== "NOT_COMPUTABLE"
    || transitionOmissionVector?.expected?.suppression !== "REMAINS_ACTIVE";
  const consumerExecutableArchitecture = readFileSync(krArchitecturePath, "utf8");
  const missingConsumerExecutableIds = requiredConsumerExecutableIds.filter((id) => !consumerExecutableArchitecture.includes(id));
  const requiredConsumerExecutableTerms = ["Byte-level hash와 old/new generation join 수용 제안", "inputBytesHex", "양방향 anti-join", "cross-generation FK 위반 0", "relational acceptance는 `NOT_RUN`"];
  const missingConsumerExecutableTerms = requiredConsumerExecutableTerms.filter((term) => !consumerExecutableArchitecture.includes(term));
  if (invalidConsumerExecutableStructure || !consumerHashVectorsValid || invalidConsumerExecutableJoinSafety || missingConsumerExecutableIds.length || missingConsumerExecutableTerms.length) {
    console.error(`Consumer executable acceptance contract incomplete: ${[...(invalidConsumerExecutableStructure ? ["fixture version/data policy/algorithm/vector IDs"] : []), ...(!consumerHashVectorsValid ? ["canonical/input byte hex or SHA-256 digest mismatch"] : []), ...(invalidConsumerExecutableJoinSafety ? ["generation/FK/cardinality/transition safety assertions"] : []), ...missingConsumerExecutableIds, ...missingConsumerExecutableTerms].join(", ")}`);
    process.exit(1);
  }
  const consumerAcceptanceReportFixturePath = join(root, "docs", "fixtures", "disclosure", "consumer-identity-acceptance-report.v0.json");
  const requiredConsumerAcceptanceReportIds = [
    "CIRR-01-JCS-PASS-DB-NOT-RUN-IS-INCOMPLETE", "CIRR-02-DB-SCHEMA-FINGERPRINT-MISMATCH-BLOCKS", "CIRR-03-DB-UNAVAILABLE-IS-NOT-RUN",
    "CIRR-04-SET-DIGEST-DIFF-FAILS-CLOSED", "CIRR-05-COMPLETE-EMPTY-SET-REQUIRES-DECLARED-DENOMINATOR", "CIRR-06-REPORT-PAYLOAD-TAMPER-EXPIRES-RESULT",
    "CIRR-07-FIXTURE-OR-RUNNER-CHANGE-NEW-RUN-LINEAGE", "CIRR-08-REPORT-EXCLUDES-SECRETS-AND-SOURCE-BODY",
  ];
  let consumerAcceptanceReportFixture;
  try {
    const fixtureSource = readFileSync(consumerAcceptanceReportFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    consumerAcceptanceReportFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Consumer acceptance report fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const consumerAcceptanceReportIds = (consumerAcceptanceReportFixture?.vectors ?? []).map((vector) => vector?.id);
  const consumerAcceptanceReportById = new Map((consumerAcceptanceReportFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredConsumerAcceptanceManifestFields = ["runId", "acceptanceManifestHash", "fixtureContractVersion", "sourceCommitSha", "runnerBuildSha", "canonicalizerNameVersionHash", "rfc8785SuiteVersionHash", "databaseEngineVersion", "schemaMigrationRangeAndHash", "isolatedTargetIdentity", "startedAtUtc", "completedAtUtc", "stageResults", "overallResult", "operationalDecision", "reportPayloadHash"];
  const invalidConsumerAcceptanceReportStructure = consumerAcceptanceReportFixture?.contractVersion !== "consumer-identity-acceptance-report.v0"
    || consumerAcceptanceReportFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || consumerAcceptanceReportFixture?.dataPolicy?.containsRealFiling !== false
    || consumerAcceptanceReportFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || consumerAcceptanceReportFixture?.dataPolicy?.containsSourceBody !== false
    || consumerAcceptanceReportFixture?.dataPolicy?.containsCredentialsOrProductionConnectionString !== false
    || consumerAcceptanceReportFixture?.vectors?.length !== requiredConsumerAcceptanceReportIds.length
    || new Set(consumerAcceptanceReportIds).size !== consumerAcceptanceReportIds.length
    || requiredConsumerAcceptanceReportIds.some((id) => !consumerAcceptanceReportById.has(id))
    || requiredConsumerAcceptanceManifestFields.some((field) => !consumerAcceptanceReportFixture?.requiredManifestFields?.includes(field))
    || !["NOT_RUN", "PASS", "FAIL", "INCOMPLETE", "EXPIRED"].every((state) => consumerAcceptanceReportFixture?.stageStates?.includes(state))
    || !["NOT_RUN", "INCOMPLETE", "PASS", "FAIL", "EXPIRED"].every((state) => consumerAcceptanceReportFixture?.overallStates?.includes(state))
    || !["NO_GO", "HOLD", "GO_CANARY", "GO_LIMITED"].every((state) => consumerAcceptanceReportFixture?.decisionStates?.includes(state));
  const consumerAcceptanceJcsOnly = consumerAcceptanceReportById.get("CIRR-01-JCS-PASS-DB-NOT-RUN-IS-INCOMPLETE");
  const consumerAcceptanceUnavailableDb = consumerAcceptanceReportById.get("CIRR-03-DB-UNAVAILABLE-IS-NOT-RUN");
  const consumerAcceptanceSchemaDrift = consumerAcceptanceReportById.get("CIRR-02-DB-SCHEMA-FINGERPRINT-MISMATCH-BLOCKS");
  const invalidConsumerAcceptanceFailClosed = consumerAcceptanceJcsOnly?.expected?.overallResult !== "INCOMPLETE"
    || consumerAcceptanceJcsOnly?.expected?.operationalDecision !== "HOLD"
    || consumerAcceptanceUnavailableDb?.expected?.relationalProof !== "NONE"
    || consumerAcceptanceUnavailableDb?.expected?.operationalDecision !== "HOLD"
    || consumerAcceptanceSchemaDrift?.expected?.overallResult !== "FAIL"
    || consumerAcceptanceSchemaDrift?.expected?.operationalDecision !== "NO_GO"
    || consumerAcceptanceReportFixture?.dataPolicy?.hashesAreSyntheticLabels !== true;
  const consumerAcceptanceReportArchitecture = readFileSync(krArchitecturePath, "utf8");
  const mentionedConsumerAcceptanceRanges = requiredConsumerAcceptanceReportIds.every((id) => consumerAcceptanceReportArchitecture.includes(id.slice(0, 6)))
    && consumerAcceptanceReportArchitecture.includes("CIRR-08` fixture");
  const missingConsumerAcceptanceReportIds = mentionedConsumerAcceptanceRanges ? [] : requiredConsumerAcceptanceReportIds;
  const requiredConsumerAcceptanceReportTerms = ["Acceptance 실행 manifest·report·격리 경계 제안", "RELATIONAL_RECONSTRUCTION", "DOWNSTREAM_JOIN", "REPORT_INTEGRITY", "격리/rollback/report signing 실제 동작은 `NOT_RUN`"];
  const missingConsumerAcceptanceReportTerms = requiredConsumerAcceptanceReportTerms.filter((term) => !consumerAcceptanceReportArchitecture.includes(term));
  if (invalidConsumerAcceptanceReportStructure || invalidConsumerAcceptanceFailClosed || missingConsumerAcceptanceReportIds.length || missingConsumerAcceptanceReportTerms.length) {
    console.error(`Consumer acceptance report contract incomplete: ${[...(invalidConsumerAcceptanceReportStructure ? ["fixture version/data policy/manifest fields/states/vector IDs"] : []), ...(invalidConsumerAcceptanceFailClosed ? ["JCS-only/DB-unavailable/schema-drift fail-closed expectations"] : []), ...missingConsumerAcceptanceReportIds, ...missingConsumerAcceptanceReportTerms].join(", ")}`);
    process.exit(1);
  }
  const correctionDeliveryFixturePath = join(root, "docs", "fixtures", "disclosure", "correction-delivery-reconciliation.v0.json");
  const requiredCorrectionDeliveryIds = [
    "CDR-01-AGGREGATE-DELIVERED-DOES-NOT-PROVE-CHANNEL-COVERAGE", "CDR-02-PUSH-ACCEPTANCE-IS-NOT-DEVICE-DELIVERY", "CDR-03-DISCORD-WAIT-RESPONSE-ID-MUST-BE-LINKED",
    "CDR-04-PROVIDER-TIMEOUT-AFTER-POST-IS-UNKNOWN-NOT-RETRY-SAFE", "CDR-05-CORRECTION-ONLY-REACHES-AFFECTED-DELIVERIES", "CDR-06-NEW-CORRECTION-EPOCH-DOES-NOT-OVERWRITE-PRIOR-RECEIPT",
    "CDR-07-OPT-OUT-OR-REVOKED-SUBSCRIPTION-SUPPRESSES-RENOTICE", "CDR-08-UNRESOLVED-CORRECTION-RELATION-BLOCKS-CLAIM-RELEASE", "CDR-09-RECONCILIATION-REQUIRES-EXPLICIT-DENOMINATOR",
    "CDR-10-SECRET-FREE-RECEIPT-AND-AUDIT", "CDR-11-IMPACTED-INBOX-CARD-PINS-NEW-REVISION-AND-STALES-OLD-CLAIM",
    "CDR-12-UNRELATED-CONSUMER-PERSONAL-STATE-IS-PRESERVED", "CDR-13-UNRESOLVED-IMPACT-KEEPS-CARD-AND-RETRACTION-STATE-EXPLICIT",
    "CDR-14-CORRECTION-ARRIVING-DURING-PAGINATION-INVALIDATES-MIXED-SNAPSHOT", "CDR-15-DUPLICATE-DELIVERY-RECEIPT-DOES-NOT-DUPLICATE-INBOX-CORRECTION",
    "CDR-16-CROSS-SURFACE-EXPOSURE-MANIFEST-IS-COMPLETE-ONLY-ON-SET-PARITY", "CDR-17-AFFECTED-INBOX-CONTENT-IS-STALED-WITHOUT-ERASING-PERSONAL-STATE",
    "CDR-18-CORRECTION-ACCEPTANCE-DOES-NOT-PROVE-USER-RECEIPT-OR-OLD-MESSAGE-CONTROL",
    "CDR-19-DELIVERY-ATTEMPT-PINS-EXACT-SOURCE-CREDIT-PAYLOAD", "CDR-20-CREDIT-POLICY-CORRECTION-REOPENS-EXPOSURE-WITHOUT-REWRITING-FACT",
    "CDR-21-CREDIT-MANIFEST-ORDER-IS-PART-OF-CANONICAL-HASH",
    "CDR-23-INCOMPLETE-CORRECTION-COVERAGE-IS-NOT-SEMANTIC-DIRECTION",
    "CDR-24-COMPLETE-COVERAGE-WITH-INCOMPARABLE-TERMS-REQUIRES-REVIEW",
    "CDR-22-CORRECTED-EVENT-IMPACT-REOPENS-INVESTMENT-THESIS-BY-DEPENDENCY",
  ];
  let correctionDeliveryFixture;
  try {
    const fixtureSource = readFileSync(correctionDeliveryFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    correctionDeliveryFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Correction delivery reconciliation fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const correctionDeliveryIds = (correctionDeliveryFixture?.vectors ?? []).map((vector) => vector?.id);
  const correctionDeliveryById = new Map((correctionDeliveryFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const exposureDigestContract = correctionDeliveryFixture?.exposureDigestContract;
  const exposureDigestGoldenVector = exposureDigestContract?.goldenVector;
  const exposureDigestRows = exposureDigestGoldenVector?.exposures ?? [];
  const exposureDigestFields = exposureDigestContract?.inputFields ?? [];
  const canonicalExposureDigestRows = exposureDigestRows
    .map((row) => Object.fromEntries(exposureDigestFields.map((field) => [field, row[field]])))
    .sort((left, right) => Buffer.compare(Buffer.from(left.exposureId ?? "", "utf8"), Buffer.from(right.exposureId ?? "", "utf8")));
  const expectedExposureSetDigest = `sha256:${jcsSha256(exposureDigestContract?.domainSeparator ?? "", canonicalExposureDigestRows)}`;
  const sharedDeliveryAttemptFields = ["candidateId", "targetIdentityHash", "targetIdentityKeyId", "attemptNumber", "creditState", "payloadHash", "creditManifestHash", "creditComponents", "rendererRevision", "locale", "notificationRevision", "rightsDecisionRevision", "attributionPolicyRevision", "publicationEpoch", "providerOutcome", "deviceDeliveryObservation"];
  const invalidCorrectionDeliveryStructure = correctionDeliveryFixture?.contractVersion !== "correction-delivery-reconciliation.v0"
    || correctionDeliveryFixture?.classification !== "SYNTHETIC_DESIGN_FIXTURES_NOT_RUNTIME_ACCEPTANCE"
    || correctionDeliveryFixture?.dataPolicy?.containsRealFiling !== false
    || correctionDeliveryFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || correctionDeliveryFixture?.dataPolicy?.containsSourceBody !== false
    || correctionDeliveryFixture?.dataPolicy?.containsCredentialsOrWebhookToken !== false
    || correctionDeliveryFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || correctionDeliveryFixture?.vectors?.length !== requiredCorrectionDeliveryIds.length
    || new Set(correctionDeliveryIds).size !== correctionDeliveryIds.length
    || requiredCorrectionDeliveryIds.some((id) => !correctionDeliveryById.has(id))
    || !["filingRevision", "recipient", "channel", "deliveryAttempt", "notificationRevision", "publicationEpoch"].every((field) => correctionDeliveryFixture?.requiredDeliveryDimensions?.includes(field))
    || !["creditState", "creditManifestHash", "creditComponents", "payloadHash", "rendererRevision"].every((field) => correctionDeliveryFixture?.requiredAttributionLineageFields?.includes(field))
    || !correctionDeliveryFixture?.requiredAttributionLineageFields?.every((field) => sourceAttributionFixture?.deliveryAttemptFields?.includes(field))
    || !sharedDeliveryAttemptFields.every((field) => correctionDeliveryFixture?.requiredDeliveryAttemptFields?.includes(field))
    || !isDeepStrictEqual(correctionDeliveryFixture?.requiredDeliveryAttemptFields, sourceAttributionFixture?.deliveryAttemptFields)
    || !isDeepStrictEqual(correctionDeliveryFixture?.requiredDeliveryAttemptFields, disclosureUserEventSubscriptionFixture?.dispatchBinding?.attemptIdentityFields)
    || correctionDeliveryFixture?.targetIdentityHashContractRef !== disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.contractRef
    || sourceAttributionFixture?.targetIdentityHashContractRef !== disclosureUserEventSubscriptionFixture?.targetIdentityHashContract?.contractRef
    || exposureDigestContract?.algorithm !== "SHA-256"
    || exposureDigestContract?.canonicalization !== "RFC8785-JCS"
    || exposureDigestContract?.domainSeparator !== "KR-DISCLOSURE-EXPOSURE-SET-v1"
    || exposureDigestContract?.sharedSurfaceControlDigestDomainSeparator !== "KR-DISCLOSURE-SHARED-CONTROL-SET-v1"
    || exposureDigestGoldenVector?.expectedHash !== expectedExposureSetDigest
    || new Set(exposureDigestRows.map((row) => row.exposureId)).size !== exposureDigestRows.length
    || !["exposureId", "exposureScope", "surfaceKind", "targetIdentityHash", "targetIdentityKeyId", "sourceRevision", "publicationEpoch", "disposition"].every((field) => correctionDeliveryFixture?.requiredExposureDimensions?.includes(field))
    || !correctionDeliveryFixture?.requiredExposureDimensions?.every((field) => exposureDigestContract?.inputFields?.includes(field))
    || !["RECIPIENT_TARGET", "SHARED_SURFACE"].every((scope) => correctionDeliveryFixture?.exposureScopes?.includes(scope))
    || !["IN_APP_CARD", "WEB_PUSH_ENDPOINT", "DISCORD_MESSAGE", "PUBLIC_DETAIL", "PUBLIC_API_PAGE", "PUBLIC_API_CURSOR", "SHARED_CACHE"].every((surface) => correctionDeliveryFixture?.exposureSurfaceKinds?.includes(surface))
    || !["manifestId", "manifestRevision", "expectedExposureSetDigest", "observedExposureSetDigest", "expectedCountBySurface", "observedCountBySurface", "coverageStatus", "expectedSharedSurfaceControlSetDigest", "observedSharedSurfaceControlSetDigest"].every((field) => correctionDeliveryFixture?.requiredExposureManifestFields?.includes(field))
    || !["surfaceKind", "scopeHash", "priorEpoch", "currentEpoch", "gateResult", "evidenceRef"].every((field) => correctionDeliveryFixture?.requiredSharedSurfaceControlFields?.includes(field))
    || !["ATTEMPTED_UNKNOWN", "PROVIDER_ACCEPTED", "DEVICE_DELIVERY_UNOBSERVED", "DELIVERED_UNRETRACTABLE", "EDIT_CONFIRMED", "DELETE_CONFIRMED", "SUPPRESSED_BEFORE_SEND"].every((state) => correctionDeliveryFixture?.requiredEvidenceStates?.includes(state));
  const correctionDeliveryCoverage = correctionDeliveryById.get("CDR-01-AGGREGATE-DELIVERED-DOES-NOT-PROVE-CHANNEL-COVERAGE");
  const correctionPushBoundary = correctionDeliveryById.get("CDR-02-PUSH-ACCEPTANCE-IS-NOT-DEVICE-DELIVERY");
  const correctionTimeout = correctionDeliveryById.get("CDR-04-PROVIDER-TIMEOUT-AFTER-POST-IS-UNKNOWN-NOT-RETRY-SAFE");
  const correctionUnresolved = correctionDeliveryById.get("CDR-08-UNRESOLVED-CORRECTION-RELATION-BLOCKS-CLAIM-RELEASE");
  const correctionOptOut = correctionDeliveryById.get("CDR-07-OPT-OUT-OR-REVOKED-SUBSCRIPTION-SUPPRESSES-RENOTICE");
  const correctionInboxRevision = correctionDeliveryById.get("CDR-11-IMPACTED-INBOX-CARD-PINS-NEW-REVISION-AND-STALES-OLD-CLAIM");
  const correctionUnrelatedConsumer = correctionDeliveryById.get("CDR-12-UNRELATED-CONSUMER-PERSONAL-STATE-IS-PRESERVED");
  const correctionUnresolvedState = correctionDeliveryById.get("CDR-13-UNRESOLVED-IMPACT-KEEPS-CARD-AND-RETRACTION-STATE-EXPLICIT");
  const correctionPagination = correctionDeliveryById.get("CDR-14-CORRECTION-ARRIVING-DURING-PAGINATION-INVALIDATES-MIXED-SNAPSHOT");
  const correctionDuplicate = correctionDeliveryById.get("CDR-15-DUPLICATE-DELIVERY-RECEIPT-DOES-NOT-DUPLICATE-INBOX-CORRECTION");
  const correctionExposureManifest = correctionDeliveryById.get("CDR-16-CROSS-SURFACE-EXPOSURE-MANIFEST-IS-COMPLETE-ONLY-ON-SET-PARITY");
  const correctionAffectedInboxState = correctionDeliveryById.get("CDR-17-AFFECTED-INBOX-CONTENT-IS-STALED-WITHOUT-ERASING-PERSONAL-STATE");
  const correctionProviderReceiptBoundary = correctionDeliveryById.get("CDR-18-CORRECTION-ACCEPTANCE-DOES-NOT-PROVE-USER-RECEIPT-OR-OLD-MESSAGE-CONTROL");
  const correctionAttributionAttempt = correctionDeliveryById.get("CDR-19-DELIVERY-ATTEMPT-PINS-EXACT-SOURCE-CREDIT-PAYLOAD");
  const correctionCreditOnlyUpdate = correctionDeliveryById.get("CDR-20-CREDIT-POLICY-CORRECTION-REOPENS-EXPOSURE-WITHOUT-REWRITING-FACT");
  const correctionCreditOrder = correctionDeliveryById.get("CDR-21-CREDIT-MANIFEST-ORDER-IS-PART-OF-CANONICAL-HASH");
  const correctionInvestmentThesisImpact = correctionDeliveryById.get("CDR-22-CORRECTED-EVENT-IMPACT-REOPENS-INVESTMENT-THESIS-BY-DEPENDENCY");
  const incompleteCorrectionCoverage = correctionDeliveryById.get("CDR-23-INCOMPLETE-CORRECTION-COVERAGE-IS-NOT-SEMANTIC-DIRECTION");
  const incomparableCorrectionTerms = correctionDeliveryById.get("CDR-24-COMPLETE-COVERAGE-WITH-INCOMPARABLE-TERMS-REQUIRES-REVIEW");
  const correctionAttributionInput = correctionAttributionAttempt?.input?.attempt;
  const correctionOrderInput = correctionCreditOrder?.input;
  const attributionManifestDomain = "KR-DISCLOSURE-CREDIT-MANIFEST-v1";
  const invalidCreditManifestHashes = correctionAttributionInput?.canonicalization !== "RFC8785-JCS"
    || correctionAttributionInput?.expectedCreditManifestHash !== `sha256:${jcsSha256(attributionManifestDomain, correctionAttributionInput.expectedCreditComponents)}`
    || correctionAttributionInput?.observedCreditManifestHash !== `sha256:${jcsSha256(attributionManifestDomain, correctionAttributionInput.observedCreditComponents)}`
    || correctionOrderInput?.canonicalization !== "RFC8785-JCS"
    || correctionOrderInput?.reversedCreditManifestHash !== `sha256:${jcsSha256(attributionManifestDomain, correctionOrderInput.components)}`
    || correctionAttributionInput?.expectedCreditComponents?.some((component, index) => component.deliveryOrder !== index)
    || correctionAttributionInput?.observedCreditComponents?.some((component, index) => component.deliveryOrder !== index);
  const invalidCorrectionDeliverySafety = correctionDeliveryCoverage?.expected?.reconciliation !== "BLOCKED_DELIVERY_SCOPE"
    || correctionPushBoundary?.expected?.status !== "DEVICE_DELIVERY_UNOBSERVED"
    || correctionTimeout?.expected?.automaticDuplicateRetry !== false
    || correctionUnresolved?.expected?.publication !== "BLOCKED_REVIEW"
    || correctionOptOut?.expected?.personalCorrectionSend !== false
    || correctionInboxRevision?.expected?.priorCardImmutable !== true
    || correctionInboxRevision?.expected?.reReviewRequired !== true
    || correctionInboxRevision?.expected?.readAtPreserved !== true
    || correctionUnrelatedConsumer?.expected?.eventStatusChanged !== false
    || correctionUnrelatedConsumer?.expected?.personalNoteRetargeted !== false
    || correctionUnresolvedState?.expected?.freshness !== "UNKNOWN"
    || correctionUnresolvedState?.expected?.completionClaim !== false
    || correctionPagination?.expected?.mixedEpochItemsReturned !== false
    || correctionDuplicate?.expected?.correctionCards !== 1
    || correctionDuplicate?.expected?.deliveryAttemptsPreserved !== true
    || correctionExposureManifest?.expected?.coverageStatus !== "INCOMPLETE"
    || correctionExposureManifest?.expected?.reconciliation !== "BLOCKED_EXPOSURE_SCOPE"
    || correctionExposureManifest?.expected?.targetAndSharedSurfaceCountsSeparated !== true
    || correctionAffectedInboxState?.expected?.oldContent !== "SUPPRESSED_STALE"
    || correctionAffectedInboxState?.expected?.savedPreserved !== true
    || correctionAffectedInboxState?.expected?.priorReadAtPreserved !== true
    || correctionAffectedInboxState?.expected?.noteRevisionPreserved !== true
    || correctionAffectedInboxState?.expected?.deepLink !== "RESOLVE_CURRENT_GATE_NO_STALE_BODY"
    || correctionProviderReceiptBoundary?.expected?.correctionUserReceipt !== "UNOBSERVED"
    || correctionProviderReceiptBoundary?.expected?.allExposuresCorrected !== false
    || correctionProviderReceiptBoundary?.expected?.residualExposureExplicit !== true
    || correctionAttributionAttempt?.expected?.attemptLineage !== "MISMATCH"
    || correctionAttributionAttempt?.expected?.deliveryCreditCompletion !== false
    || correctionAttributionAttempt?.expected?.reconciliation !== "BLOCKED_ATTRIBUTION_LINEAGE"
    || correctionCreditOnlyUpdate?.expected?.priorAttemptImmutable !== true
    || correctionCreditOnlyUpdate?.expected?.claimOrEventFactRewritten !== false
    || correctionCreditOnlyUpdate?.expected?.affectedExposureReviewRequired !== true
    || correctionCreditOrder?.expected?.deliveryOrderValidation !== "REJECT_NON_MONOTONIC"
    || correctionCreditOrder?.expected?.manifestHashChangesWhenOrderChanges !== true
    || correctionCreditOrder?.expected?.originalPayloadReusable !== false
    || correctionInvestmentThesisImpact?.expected?.priorDecisionImmutable !== true
    || correctionInvestmentThesisImpact?.expected?.contractValueClaimStatus !== "STALE_SUPPRESSED"
    || correctionInvestmentThesisImpact?.expected?.catalystStatus !== "WITHDRAWN_NOT_UPCOMING"
    || correctionInvestmentThesisImpact?.expected?.instrumentEligibility !== "UNRESOLVED_BLOCKED"
    || correctionInvestmentThesisImpact?.expected?.automaticBuySellRecommendation !== false
    || correctionInvestmentThesisImpact?.expected?.portfolioContextPreserved !== true
    || correctionInvestmentThesisImpact?.expected?.reReviewReasons?.length !== 3
    || incompleteCorrectionCoverage?.expected?.assessmentState !== "EVIDENCE_INCOMPLETE"
    || incompleteCorrectionCoverage?.expected?.claimDirection !== "NOT_ASSESSED"
    || incompleteCorrectionCoverage?.expected?.investmentScore !== "NOT_COMPUTED"
    || incomparableCorrectionTerms?.expected?.assessmentState !== "REVIEW_REQUIRED"
    || incomparableCorrectionTerms?.expected?.claimDirection !== "NOT_ASSESSED"
    || incomparableCorrectionTerms?.expected?.investmentScore !== "NOT_COMPUTED"
    || incomparableCorrectionTerms?.expected?.supportingAndCounterClaimsKeptSeparate !== true
    || !correctionOrderInput?.components?.some((component, index) => component.deliveryOrder !== index)
    || invalidCreditManifestHashes;
  const correctionDeliveryArchitecture = readFileSync(krArchitecturePath, "utf8");
  const correctionDeliveryRangeDeclared = requiredCorrectionDeliveryIds.every((id) => correctionDeliveryArchitecture.includes(id.slice(0, 5)))
    && correctionDeliveryArchitecture.includes("CDR-19")
    && correctionDeliveryArchitecture.includes("CDR-20")
    && correctionDeliveryArchitecture.includes("CDR-21")
    && correctionDeliveryArchitecture.includes("CDR-22")
    && correctionDeliveryArchitecture.includes("CDR-23")
    && correctionDeliveryArchitecture.includes("CDR-24");
  const missingCorrectionDeliveryIds = correctionDeliveryRangeDeclared ? [] : requiredCorrectionDeliveryIds;
  const requiredCorrectionDeliveryTerms = ["기존 DART 전송과 correction ledger 간격 및 fixture 제안", "`filing × recipient × channel × attempt × notification revision × publication epoch`", "runtime ledger·provider receipt·edit/delete·correction 재생은 모두 `NOT_RUN`", "이전 카드는 immutable revision", "개인 노트는 새 revision으로 자동 retarget하지 않는다", "RESTART_REQUIRED", "RECIPIENT_TARGET", "SHARED_SURFACE", "expected/observed exposure identity set digest", "targeted exposure count와 shared control count는 합산하지 않는다", "correction push의 provider acceptance는 correction 사용자 전달/열람을 증명하지 않으며", "opt-out/rights suppression은 “수신 완료”가 아닌 명시적 unsent disposition", "CDR-19", "CDR-20", "CDR-21", "CDR-22", "CDR-23", "CDR-24", "EVIDENCE_INCOMPLETE", "REVIEW_REQUIRED", "NOT_COMPUTED", "BLOCKED_ATTRIBUTION_LINEAGE", "RFC8785-JCS", "creditManifestHash", "DELIVERY-TARGET-HASH-v1", "KR-DISCLOSURE-EXPOSURE-SET-v1"];
  const missingCorrectionDeliveryTerms = requiredCorrectionDeliveryTerms.filter((term) => !correctionDeliveryArchitecture.includes(term));
  if (invalidCorrectionDeliveryStructure || invalidCorrectionDeliverySafety || missingCorrectionDeliveryIds.length || missingCorrectionDeliveryTerms.length) {
    console.error(`Correction delivery reconciliation contract incomplete: ${[...(invalidCorrectionDeliveryStructure ? ["fixture version/data policy/dimensions/states/vector IDs"] : []), ...(invalidCorrectionDeliverySafety ? ["aggregate/push/timeout/unresolved/opt-out safety expectations"] : []), ...missingCorrectionDeliveryIds, ...missingCorrectionDeliveryTerms].join(", ")}`);
    process.exit(1);
  }
  const rightsActionDecisionFixturePath = join(root, "docs", "fixtures", "disclosure", "rights-action-decision.v0.json");
  const requiredRightsActionDecisionIds = [
    "RAD-01-API-ACCESS-DOES-NOT-GRANT-RAW-RETENTION", "RAD-02-METADATA-ALLOW-DOES-NOT-INHERIT-ATTACHMENT-RIGHTS", "RAD-03-TRANSIENT-PARSE-DOES-NOT-INHERIT-DERIVATIVE-PERSIST",
    "RAD-04-DISPLAY-DERIVATIVE-DOES-NOT-GRANT-API-DISTRIBUTION", "RAD-05-EXPIRED-EVIDENCE-BLOCKS-CURRENT-ACTION", "RAD-06-REVOKE-PROPAGATES-TO-DESCENDANT-ARTIFACTS",
    "RAD-07-ALLOW-WITH-CONTROLS-REQUIRES-ALL-CONTROLS", "RAD-08-UNKNOWN-POLICY-EVIDENCE-REMAINS-UNRESOLVED", "RAD-09-DELETION-IS-AN-OWNED-ACTION-NOT-IMPLICIT",
    "RAD-10-NO-GENERIC-APPROVED-STATUS", "RAD-11-CONFLICTING-CURRENT-DECISIONS-FAIL-CLOSED", "RAD-12-PARTIAL-OR-WILDCARD-SCOPE-CANNOT-AUTHORIZE",
    "RAD-13-TERMS-REVISION-FENCES-DEPENDENT-APPROVAL", "RAD-14-INCOMPLETE-DESCENDANT-INVENTORY-KEEPS-ROOT-SUPPRESSED",
    "RAD-15-COMPLETE-INVENTORY-DOES-NOT-CLOSE-UNRESOLVED-DISPOSITION", "RAD-16-MISSING-DERIVATIVE-LINEAGE-IS-NOT-EMPTY-IMPACT",
    "RAD-17-COMPLETE-COVERAGE-DOES-NOT-RESOLVE-RIGHTS-REMEDIATION", "RAD-18-RECONCILED-DOES-NOT-GRANT-CURRENT-READ-RIGHT",
    "RAD-19-CONCURRENT-RECONCILIATION-FINALIZERS-USE-CAS", "RAD-20-LATE-DESCENDANT-BEFORE-CLOSURE-INVALIDATES-INVENTORY",
    "RAD-21-LATE-DESCENDANT-AFTER-RECONCILED-OPENS-LINKED-CASE", "RAD-22-TERMS-REVISION-DURING-FINALIZATION-FENCES-CLOSURE",
  ];
  let rightsActionDecisionFixture;
  try {
    const fixtureSource = readFileSync(rightsActionDecisionFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    rightsActionDecisionFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Rights action decision fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const rightsActionDecisionIds = (rightsActionDecisionFixture?.vectors ?? []).map((vector) => vector?.id);
  const rightsActionDecisionById = new Map((rightsActionDecisionFixture?.vectors ?? []).map((vector) => [vector?.id, vector]));
  const requiredRightsActionDecisionFields = ["decisionId", "revision", "sourceProduct", "sourceClass", "endpointOrSurface", "fieldScope", "action", "purpose", "channel", "retentionClass", "policyEvidenceRefs", "status", "ownerRole", "namedReviewer", "effectiveFrom", "effectiveUntil", "reviewDue", "affectedGates", "previousRevision", "decisionHash"];
  const invalidRightsActionDecisionStructure = rightsActionDecisionFixture?.contractVersion !== "rights-action-decision.v0"
    || rightsActionDecisionFixture?.classification !== "SYNTHETIC_POLICY_DESIGN_NOT_LEGAL_ADVICE_OR_RUNTIME_AUTHORIZATION"
    || rightsActionDecisionFixture?.dataPolicy?.containsRealFiling !== false
    || rightsActionDecisionFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || rightsActionDecisionFixture?.dataPolicy?.containsSourceBody !== false
    || rightsActionDecisionFixture?.dataPolicy?.containsCredential !== false
    || rightsActionDecisionFixture?.dataPolicy?.decisionsAreUnapprovedExamples !== true
    || rightsActionDecisionFixture?.vectors?.length !== requiredRightsActionDecisionIds.length
    || new Set(rightsActionDecisionIds).size !== rightsActionDecisionIds.length
    || requiredRightsActionDecisionIds.some((id) => !rightsActionDecisionById.has(id))
    || !["DISCOVERY_INCOMPLETE", "INVENTORY_COMPLETE", "DISPOSITION_PENDING", "ACTIONS_PENDING_VERIFICATION", "RECONCILED"].every((state) => rightsActionDecisionFixture?.remediationStates?.includes(state))
    || !["SOURCE_BYTES", "PARSED_TEXT_OR_TABLE", "CLAIM_OR_SUMMARY", "EVENT_DATE_SUBJECT_PUBLICATION", "CACHE_OR_SEARCH_INDEX", "EXPORT", "NOTIFICATION_OR_DELIVERY", "BACKUP_OR_RESTORE_COPY"].every((kind) => rightsActionDecisionFixture?.descendantClasses?.includes(kind))
    || !["remediationCaseId", "triggerKind", "sourceScopeFingerprint", "priorDecisionRevision", "currentEvidenceRevision", "publicationEpoch", "expectedDescendantSetDigest", "discoveredDescendantSetDigest", "expectedCountByClassAndLocation", "discoveredCountByClassAndLocation", "perDescendantDisposition", "actionReceiptOrUnresolvedReason", "restoreVerification", "reviewDecisionRef", "previousCaseRevision", "caseRevision", "scopeEpoch", "discoveryWatermarkSetDigest", "closureFingerprint", "finalizationFence", "previousCaseId"].every((field) => rightsActionDecisionFixture?.requiredRemediationFields?.includes(field))
    || requiredRightsActionDecisionFields.some((field) => !rightsActionDecisionFixture?.requiredDecisionFields?.includes(field))
    || !["UNRESOLVED", "ALLOW", "ALLOW_WITH_CONTROLS", "DENY", "EXPIRED", "REVOKED"].every((state) => rightsActionDecisionFixture?.policyStates?.includes(state))
    || !["OFFICIAL_DOCUMENT_BODY", "ATTACHMENT", "STRUCTURED_API_FIELD"].every((sourceClass) => rightsActionDecisionFixture?.sourceClasses?.includes(sourceClass));
  const rightsApiRawSeparation = rightsActionDecisionById.get("RAD-01-API-ACCESS-DOES-NOT-GRANT-RAW-RETENTION");
  const rightsMetadataInheritance = rightsActionDecisionById.get("RAD-02-METADATA-ALLOW-DOES-NOT-INHERIT-ATTACHMENT-RIGHTS");
  const rightsExpiry = rightsActionDecisionById.get("RAD-05-EXPIRED-EVIDENCE-BLOCKS-CURRENT-ACTION");
  const rightsControls = rightsActionDecisionById.get("RAD-07-ALLOW-WITH-CONTROLS-REQUIRES-ALL-CONTROLS");
  const rightsGenericApproval = rightsActionDecisionById.get("RAD-10-NO-GENERIC-APPROVED-STATUS");
  const rightsOfficialEvidenceUnknown = rightsActionDecisionById.get("RAD-08-UNKNOWN-POLICY-EVIDENCE-REMAINS-UNRESOLVED");
  const rightsConflictingCurrentDecisions = rightsActionDecisionById.get("RAD-11-CONFLICTING-CURRENT-DECISIONS-FAIL-CLOSED");
  const rightsIncompleteScope = rightsActionDecisionById.get("RAD-12-PARTIAL-OR-WILDCARD-SCOPE-CANNOT-AUTHORIZE");
  const rightsTermsRevision = rightsActionDecisionById.get("RAD-13-TERMS-REVISION-FENCES-DEPENDENT-APPROVAL");
  const rightsIncompleteDescendants = rightsActionDecisionById.get("RAD-14-INCOMPLETE-DESCENDANT-INVENTORY-KEEPS-ROOT-SUPPRESSED");
  const rightsDispositionPending = rightsActionDecisionById.get("RAD-15-COMPLETE-INVENTORY-DOES-NOT-CLOSE-UNRESOLVED-DISPOSITION");
  const rightsMissingLineage = rightsActionDecisionById.get("RAD-16-MISSING-DERIVATIVE-LINEAGE-IS-NOT-EMPTY-IMPACT");
  const rightsCoverageDoesNotResolve = rightsActionDecisionById.get("RAD-17-COMPLETE-COVERAGE-DOES-NOT-RESOLVE-RIGHTS-REMEDIATION");
  const rightsReconciledDoesNotGrantRead = rightsActionDecisionById.get("RAD-18-RECONCILED-DOES-NOT-GRANT-CURRENT-READ-RIGHT");
  const concurrentRightsFinalizers = rightsActionDecisionById.get("RAD-19-CONCURRENT-RECONCILIATION-FINALIZERS-USE-CAS");
  const lateDescendantBeforeClosure = rightsActionDecisionById.get("RAD-20-LATE-DESCENDANT-BEFORE-CLOSURE-INVALIDATES-INVENTORY");
  const lateDescendantAfterClosure = rightsActionDecisionById.get("RAD-21-LATE-DESCENDANT-AFTER-RECONCILED-OPENS-LINKED-CASE");
  const termsRevisionDuringFinalization = rightsActionDecisionById.get("RAD-22-TERMS-REVISION-DURING-FINALIZATION-FENCES-CLOSURE");
  const invalidRightsActionDecisionSafety = rightsApiRawSeparation?.expected?.persistRaw !== "BLOCKED"
    || rightsApiRawSeparation?.expected?.credentialValidityIsAuthorization !== false
    || rightsMetadataInheritance?.expected?.rightsInheritance !== false
    || rightsExpiry?.expected?.action !== "BLOCKED"
    || rightsControls?.expected?.action !== "BLOCKED_CONTROLS_INCOMPLETE"
    || rightsOfficialEvidenceUnknown?.expected?.rightConclusion !== "UNRESOLVED"
    || rightsOfficialEvidenceUnknown?.expected?.licenseInferredFromGuide !== false
    || rightsGenericApproval?.expected?.globalApprovedFlag !== "FORBIDDEN"
    || rightsConflictingCurrentDecisions?.expected?.effectiveStatus !== "UNRESOLVED"
    || rightsConflictingCurrentDecisions?.expected?.lastWriteWins !== false
    || rightsConflictingCurrentDecisions?.expected?.action !== "BLOCKED_DECISION_SCOPE_CONFLICT"
    || rightsIncompleteScope?.expected?.effectiveStatus !== "UNRESOLVED"
    || rightsIncompleteScope?.expected?.scopeWildcardAccepted !== false
    || rightsIncompleteScope?.expected?.action !== "BLOCKED_INCOMPLETE_SCOPE"
    || rightsTermsRevision?.expected?.affectedDecision !== "REVIEW_REQUIRED"
    || rightsTermsRevision?.expected?.staleApprovalFallback !== false
    || rightsIncompleteDescendants?.expected?.remediationState !== "DISCOVERY_INCOMPLETE"
    || rightsIncompleteDescendants?.expected?.rootSuppression !== "ACTIVE"
    || rightsIncompleteDescendants?.expected?.rightsReconciliationComplete !== false
    || rightsDispositionPending?.expected?.inventoryState !== "INVENTORY_COMPLETE"
    || rightsDispositionPending?.expected?.remediationState !== "DISPOSITION_PENDING"
    || rightsDispositionPending?.expected?.rightsReconciliationComplete !== false
    || rightsMissingLineage?.expected?.unknownDescendants !== "NOT_ZERO"
    || rightsMissingLineage?.expected?.emptyImpactAccepted !== false
    || rightsMissingLineage?.expected?.rootSuppression !== "ACTIVE"
    || rightsIncompleteDescendants?.expected?.unknownCountMeansZero !== false
    || rightsCoverageDoesNotResolve?.expected?.publicRead !== "BLOCKED"
    || rightsCoverageDoesNotResolve?.expected?.rootSuppression !== "ACTIVE"
    || rightsCoverageDoesNotResolve?.expected?.remediationMayResolveFromCoverage !== false
    || rightsReconciledDoesNotGrantRead?.expected?.publicRead !== "BLOCKED_CURRENT_RIGHTS_GATE"
    || rightsReconciledDoesNotGrantRead?.expected?.remediationGrantsRights !== false
    || concurrentRightsFinalizers?.expected?.committedFinalizerCount !== 1
    || concurrentRightsFinalizers?.expected?.duplicateEpochAdvance !== false
    || lateDescendantBeforeClosure?.expected?.reconciliationCommit !== "REJECTED_WATERMARK_MISMATCH"
    || lateDescendantBeforeClosure?.expected?.rootSuppression !== "ACTIVE"
    || lateDescendantAfterClosure?.expected?.priorCaseMutation !== "FORBIDDEN"
    || lateDescendantAfterClosure?.expected?.newCase !== "REQUIRED_NEW_CASE_ID_LINKED_TO_PRIOR"
    || lateDescendantAfterClosure?.expected?.suppressionBeforeInventory !== "ACTIVE"
    || termsRevisionDuringFinalization?.expected?.reconciliationCommit !== "REJECTED_STALE_EVIDENCE_CAS"
    || termsRevisionDuringFinalization?.expected?.rootSuppression !== "ACTIVE";
  const rightsActionDecisionArchitecture = readFileSync(krArchitecturePath, "utf8");
  const rightsActionRangeDeclared = requiredRightsActionDecisionIds.every((id) => rightsActionDecisionArchitecture.includes(id.slice(0, 5)))
    && rightsActionDecisionArchitecture.includes("RAD-22`는 API credential");
  const missingRightsActionDecisionIds = rightsActionRangeDeclared ? [] : requiredRightsActionDecisionIds;
  const requiredRightsActionDecisionTerms = ["Action-scoped rights decision product contract", "sourceProduct × sourceClass × endpointOrSurface × fieldScope × action × purpose × channel × retentionClass", "`UNRESOLVED`", "action authorization point", "descendant 처리 case", "동일 scope에 둘 이상의 current decision이 매칭되면", "last-write-wins를 적용하지 않는다", "wildcard/부분 scope decision은 authorization match가 아니다", "Rights-remediation lifecycle 및 denominator", "expected/discovered descendant set digest와 class×storage-location별 denominator", "inventory 완료와 remediation 완료를 분리한다", "미해결 descendant가 있으면 `RECONCILED` 금지", "coverage 완료와 rights remediation 완료", "source-rights decision must still permit publication", "concurrent finalizer CAS", "discovery watermark", "finalizationFence", "previousCaseId + previousCaseRevision", "(market, source, scope_key_hash)", "`RAD-19-CONCURRENT-RECONCILIATION-FINALIZERS-USE-CAS`", "`RAD-20-LATE-DESCENDANT-BEFORE-CLOSURE-INVALIDATES-INVENTORY`", "`RAD-21-LATE-DESCENDANT-AFTER-RECONCILED-OPENS-LINKED-CASE`", "`RAD-22-TERMS-REVISION-DURING-FINALIZATION-FENCES-CLOSURE`", "`COV-FRESH-18-COVERAGE-COMPLETE-RIGHTS-REMEDIATION-PENDING`", "`DISCOVERY_INCOMPLETE`", "`ACTIONS_PENDING_VERIFICATION`", "`KR-DART-RIGHTS-01` 및 `KR-RETENTION-01`의 지정 책임자·법무 review 전부 `OPEN`", "2026-11-04 재확인한 공식 자료", "권리 decision을 대신하지 않고 evidence inventory에만 반영한다"];
  const missingRightsActionDecisionTerms = requiredRightsActionDecisionTerms.filter((term) => !rightsActionDecisionArchitecture.includes(term));
  if (invalidRightsActionDecisionStructure || invalidRightsActionDecisionSafety || missingRightsActionDecisionIds.length || missingRightsActionDecisionTerms.length) {
    console.error(`Rights action decision contract incomplete: ${[...(invalidRightsActionDecisionStructure ? ["fixture version/data policy/fields/states/vector IDs"] : []), ...(invalidRightsActionDecisionSafety ? ["non-inheritance/expiry/control/global approval fail-closed expectations"] : []), ...missingRightsActionDecisionIds, ...missingRightsActionDecisionTerms].join(", ")}`);
    process.exit(1);
  }
  const followUpFamilyTable = section("#### 유형별 후속 확인 case와 완료 증거 제안", "CB/BW/EB 후속 case는 세 상품");
  const followUpFamilyRows = followUpFamilyTable.split(/\r?\n/).filter((line) => line.startsWith("|"));
  if (followUpFamilyRows.length !== 6 || !followUpFamilyRows[1]?.startsWith("|---") || !followUpFamilyRows.some((line) => line.includes("유상/무상증자")) || !followUpFamilyRows.some((line) => line.includes("CB/BW/EB")) || !followUpFamilyRows.some((line) => line.includes("합병/주식교환/분할")) || !followUpFamilyRows.some((line) => line.includes("대규모 자산/사업/타법인 주식 양수도"))) {
    console.error("Korean disclosure follow-up event family table is incomplete or interrupted by non-table content.");
    process.exit(1);
  }
  const publicApiContract = section("## API·사용자 화면 경계", "## 저장·보존·정합성");
  const requiredGateOrder = ["event decision", "date assertion decision", "subject decision", "event revision approval", "current instrument eligibility", "current cap eligibility", "current source-rights decision", "current rights-remediation state"];
  const gatePosition = requiredGateOrder.map((gate) => publicApiContract.indexOf(gate));
  if (gatePosition.some((position) => position < 0) || gatePosition.some((position, index) => index > 0 && position <= gatePosition[index - 1])) {
    console.error("Korean disclosure publication gates are missing or not expressed in required fail-closed order.");
    process.exit(1);
  }
  const legacyContract = section("### 권위 데이터 원칙", "권장 v2 JSON 이벤트 단위");
  const legacyRequired = ["legacy_event_mapping_manifest", "UNVERIFIED_LEGACY_DATE", "NO_DATE_ASSERTION", "MAPPED/QUARANTINED/DUPLICATE/REJECTED", "row count = manifest row count", "US v1", "별도 버전 경로의 국내 전용 ledger", "US 전용 검토·회귀 검증", "dual-write", "별도 KR route/schema", "인증 없는 read-only"];
  const inventoryScript = join(root, "scripts", "inventory-kr-market-impact-legacy.mjs");
  const inventoryRequired = ["UNVERIFIED_LEGACY_DATE", "NO_DATE_ASSERTION", "QUARANTINED", "originalSourceSha256: null", "rightsDecisionRef: null", "stableInstrumentId: null"];
  const inventorySource = existsSync(inventoryScript) ? readFileSync(inventoryScript, "utf8") : "";
  const missingInventory = inventoryRequired.filter((value) => !inventorySource.includes(value));
  const inventoryRun = spawnSync(process.execPath, [inventoryScript], { cwd: root, encoding: "utf8" });
  let inventoryReport;
  try { inventoryReport = JSON.parse(inventoryRun.stdout ?? ""); } catch { inventoryReport = null; }
  const legacyArchitecture = readFileSync(join(root, "docs", "architecture", "kr-disclosure-event-architecture.md"), "utf8");
  const inventoryHashesAreValid = /^[a-f0-9]{64}$/i.test(inventoryReport?.source?.sha256 ?? "") && /^[a-f0-9]{40}$/i.test(inventoryReport?.source?.gitBlob ?? "") && /^[a-f0-9]{40}$/i.test(inventoryReport?.source?.repositoryCommit ?? "");
  const inventoryGitStateIsConsistent = inventoryReport?.source?.trackedBlobMatchesWorkingTree === (inventoryReport?.source?.committedGitBlob !== null && inventoryReport?.source?.committedGitBlob === inventoryReport?.source?.gitBlob);
  const inventoryIdentityCountsAreValid = Array.isArray(inventoryReport?.manifest) && new Set(inventoryReport.manifest.map((row) => row.legacyEventId)).size === inventoryReport?.totals?.uniqueEventIds && new Set(inventoryReport.manifest.map((row) => row.sourceTuple)).size === inventoryReport?.totals?.uniqueSourceTuples;
  const inventoryIsSafe = inventoryRun.status === 0 && inventoryReport?.classification === "READ_ONLY_INVENTORY_NOT_APPROVAL" && inventoryReport?.source?.path === "data/market-impact-events.json" && inventoryHashesAreValid && inventoryGitStateIsConsistent && inventoryIdentityCountsAreValid && inventoryReport.manifest.length === inventoryReport?.totals?.krRows && inventoryReport?.manifestStatuses?.quarantined === inventoryReport?.totals?.krRows && inventoryReport?.manifestStatuses?.mapped === 0 && inventoryReport?.manifest?.every((row) => row.disposition === "QUARANTINED" && row.reviewer === null && row.reviewedAt === null);
  const inventoryContractDocumented = legacyArchitecture.includes("현재 worktree의 KR legacy 행 수") && legacyArchitecture.includes("이 설계 문서에 현재 수치나 hash를 복사해 두지 않는다") && legacyArchitecture.includes("모든 legacy row를 격리");
  const missingLegacy = legacyRequired.filter((value) => !legacyContract.includes(value));
  if (missingLegacy.length || missingInventory.length || !inventoryIsSafe || !inventoryContractDocumented) {
    console.error(`Korean disclosure legacy cutover contract incomplete: ${[...missingLegacy, ...missingInventory, ...(!inventoryIsSafe ? ["legacy inventory report failed quarantine/hash/cardinality checks"] : []), ...(!inventoryContractDocumented ? ["legacy inventory policy is missing from the architecture document"] : [])].join(", ")}`);
    process.exit(1);
  }
  const decisionLog = section("### 결정 기록 및 fail-closed defaults", "## 공식 참고 및 저장소 기준");
  const dbMigrationAcceptance = section("#### Migration preflight acceptance", "## 오류·복구·관측");
  const dbMigrationGateIds = ["DB-MIG-01-TARGET-IDENTITY", "DB-MIG-02-HISTORY-CONSISTENCY", "DB-MIG-03-OBJECT-PREFLIGHT", "DB-MIG-04-DESTRUCTIVE-DATA-REVIEW", "DB-MIG-05-CONSISTENT-SNAPSHOT", "DB-MIG-06-RESTORE-REHEARSAL", "DB-MIG-07-ISOLATED-REPLAY", "DB-MIG-08-POSTCONDITION", "DB-MIG-09-ROLLBACK-REHEARSAL", "DB-MIG-10-EXECUTION-AUTHORIZATION"];
  const actualDbMigrationGateIds = [...dbMigrationAcceptance.matchAll(/`(DB-MIG-\d{2}-[A-Z-]+)`/g)].map((match) => match[1]);
  const dbMigrationRequired = ["checksum/full definition/index validity/data-operation 결과를 검증하지 않는다", "운영 DB 정의", "history repair/baseline 없이 block", "원 대상 DB에서 rehearsal 금지", "실환경 실행 허가를 추론하지 않음"];
  const missingDbMigrationGates = dbMigrationGateIds.filter((id) => !actualDbMigrationGateIds.includes(id));
  const invalidDbMigrationGateIds = actualDbMigrationGateIds.filter((id) => !dbMigrationGateIds.includes(id));
  const missingDbMigrationContract = dbMigrationRequired.filter((value) => !dbMigrationAcceptance.includes(value));
  if (missingDbMigrationGates.length || invalidDbMigrationGateIds.length || actualDbMigrationGateIds.length !== new Set(actualDbMigrationGateIds).size || missingDbMigrationContract.length) {
    console.error(`Korean disclosure migration safety contract incomplete: ${[...missingDbMigrationGates, ...invalidDbMigrationGateIds, ...(actualDbMigrationGateIds.length !== new Set(actualDbMigrationGateIds).size ? ["duplicate DB-MIG gate ID"] : []), ...missingDbMigrationContract].join(", ")}`);
    process.exit(1);
  }
  const canonicalDecisionRegisterPath = join(root, "docs", "fixtures", "disclosure", "decision-register.v0.json");
  let canonicalDecisionRegister;
  try {
    const source = readFileSync(canonicalDecisionRegisterPath, "utf8");
    assertUniqueJsonObjectKeys(source);
    canonicalDecisionRegister = JSON.parse(source);
  } catch (error) {
    console.error(`Canonical disclosure decision register invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const canonicalDecisions = canonicalDecisionRegister?.decisions ?? [];
  const canonicalDecisionIds = canonicalDecisions.map((decision) => decision?.decisionId);
  const canonicalDecisionById = new Map(canonicalDecisions.map((decision) => [decision?.decisionId, decision]));
  const canonicalDecisionRegisterInvalid = canonicalDecisionRegister?.contractVersion !== "disclosure-decision-register.v0"
    || canonicalDecisionRegister?.classification !== "DESIGN_REGISTER_BASELINE_NOT_OPERATIONAL_APPROVAL"
    || canonicalDecisionRegister?.dataPolicy?.containsOperationalDecisionEvidence !== false
    || canonicalDecisionRegister?.dataPolicy?.containsRealOwnerOrReviewer !== false
    || canonicalDecisionRegister?.dataPolicy?.containsCredentials !== false
    || canonicalDecisionRegister?.dataPolicy?.identitiesAreSynthetic !== true
    || !isDeepStrictEqual(canonicalDecisionRegister?.statusVocabulary, ["OPEN", "EVIDENCE_READY", "APPROVED", "CLOSED", "REJECTED", "EXPIRED"])
    || !isDeepStrictEqual(canonicalDecisionRegister?.decisionFields, ["decisionId", "ownerRole", "scope", "defaultBehavior", "acceptanceEvidence"])
    || canonicalDecisions.length === 0
    || new Set(canonicalDecisionIds).size !== canonicalDecisionIds.length
    || canonicalDecisions.some((decision) => !decision?.ownerRole || !decision?.scope || !decision?.defaultBehavior || !decision?.acceptanceEvidence || Object.hasOwn(decision, "currentStatus"));
  const decisionIds = canonicalDecisionIds;
  const decisionDomainById = new Map([
    ["KR-DART-RIGHTS-01", "공식 source와 rights"], ["KR-CAP-FRESHNESS-01", "보통주 identity 및 eligibility"],
    ["KR-RECONCILIATION-01", "ingestion coverage"], ["KR-CAPITAL-RECONCILIATION-01", "issuer capital state reconciliation"], ["KR-ISSUER-RISK-STATUS-01", "issuer risk and listing status"], ["KR-RETENTION-01", "문서·정정 생명주기"],
    ["KR-TAXONOMY-01", "event/date taxonomy"], ["KR-LEGACY-CUTOVER-01", "저장·legacy cutover"],
    ["KR-MASTER-SNAPSHOT-01", "보통주 identity 및 eligibility"], ["KR-ANALYSIS-REPRO-01", "분석·요약 재현성"],
    ["KR-IMPORTER-OPS-01", "저장·legacy cutover"], ["KR-DB-DRIFT-01", "저장·legacy cutover"],
    ["KR-SHADOW-SLO-01", "운영 책임·SLO"], ["KR-DOCUMENT-UX-01", "문서·정정 생명주기"], ["KR-PERSONAL-THESIS-UX-01", "문서·정정 생명주기"],
    ["KR-CURSOR-SECURITY-01", "cursor key/snapshot security"],
    ["KR-MARKET-DATA-RIGHTS-01", "공식 source와 rights"], ["KR-EVENT-STUDY-POLICY-01", "분석·요약 재현성"],
    ["KR-EVENT-ATTRIBUTION-01", "event attribution"], ["KR-API-UI-CONSISTENCY-01", "API·UI snapshot consistency"],
    ["KR-OPERATIONAL-SECURITY-01", "장애·보안·개인정보"], ["KR-END-TO-END-ACCEPTANCE-01", "end-to-end shadow acceptance"],
  ]);
  const missingDecisionIds = decisionIds.filter((id) => !decisionLog.includes(id));
  const decisionRows = [...decisionLog.matchAll(/^\| `(KR-[A-Z-]+-\d{2})` \|([^\n]+)\| `(OPEN|EVIDENCE_READY|APPROVED|CLOSED|REJECTED|EXPIRED)` \|$/gm)];
  const decisionRowIds = decisionRows.map((match) => match[1]);
  const invalidDecisionRows = decisionRows.filter((match) => match[2].trim().length < 12);
  const evidenceLedgerSection = section("#### Decision register 운영 계약", "#### 설계 승인 전 결함 종결 감사표");
  const evidenceLedgerHeader = "| Decision ID | Revision | Status | Named owner |";
  const evidenceLedgerHeaderIndex = evidenceLedgerSection.indexOf(evidenceLedgerHeader);
  const evidenceLedgerTable = evidenceLedgerHeaderIndex >= 0 ? evidenceLedgerSection.slice(evidenceLedgerHeaderIndex) : "";
  const evidenceLedgerDataLines = evidenceLedgerTable.split(/\r?\n/).filter((line) => /^\|/.test(line)).slice(2);
  const decisionEvidenceMatches = [...evidenceLedgerTable.matchAll(/^\| `(KR-[A-Z-]+-\d{2})` \| (\d+) \| `(OPEN|EVIDENCE_READY|APPROVED|CLOSED|REJECTED|EXPIRED)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
  const decisionEvidenceRows = decisionEvidenceMatches
    .map((match) => ({ raw: match[0], id: match[1], revision: Number(match[2]), status: match[3], fields: match.slice(4).map((value) => value.trim()) }));
  const invalidDecisionEvidence = [];
  const canonicalDecisionStatuses = ["OPEN", "EVIDENCE_READY", "APPROVED", "CLOSED", "REJECTED", "EXPIRED"];
  const allowedDecisionTransitions = {
    OPEN: new Set(["OPEN", "EVIDENCE_READY", "REJECTED"]),
    EVIDENCE_READY: new Set(["EVIDENCE_READY", "APPROVED", "REJECTED", "EXPIRED", "OPEN"]),
    APPROVED: new Set(["APPROVED", "CLOSED", "REJECTED", "EXPIRED", "OPEN"]),
    CLOSED: new Set(["CLOSED", "EXPIRED", "OPEN"]),
    REJECTED: new Set(["REJECTED", "OPEN"]),
    EXPIRED: new Set(["EXPIRED", "OPEN"]),
  };
  const decisionLifecycleFixturePath = join(root, "docs", "fixtures", "disclosure", "decision-register-lifecycle.v0.json");
  let decisionLifecycleFixture;
  try {
    const fixtureSource = readFileSync(decisionLifecycleFixturePath, "utf8");
    assertUniqueJsonObjectKeys(fixtureSource);
    decisionLifecycleFixture = JSON.parse(fixtureSource);
  } catch (error) {
    console.error(`Decision register lifecycle fixture invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const decisionEvidenceLedgerPath = join(root, "docs", "fixtures", "disclosure", "decision-evidence-ledger.v0.json");
  let decisionEvidenceLedger;
  try {
    const source = readFileSync(decisionEvidenceLedgerPath, "utf8");
    assertUniqueJsonObjectKeys(source);
    decisionEvidenceLedger = JSON.parse(source);
  } catch (error) {
    console.error(`Decision evidence ledger invalid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const decisionLedgerValidation = validateDecisionLedger(canonicalDecisionRegister, decisionLifecycleFixture, decisionEvidenceLedger);
  invalidDecisionEvidence.push(...decisionLedgerValidation.errors);
  let decisionLedgerCheckpoint;
  try {
    const checkpointSource = readFileSync(join(root, "docs", "fixtures", "disclosure", "decision-ledger-checkpoint.v0.json"), "utf8");
    assertUniqueJsonObjectKeys(checkpointSource);
    decisionLedgerCheckpoint = JSON.parse(checkpointSource);
  } catch (error) {
    invalidDecisionEvidence.push(`decision-ledger-checkpoint.v0.json is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const requiredDecisionLedgerCheckpointVectors = [
    "DLCP-01-VALID-SIGNATURE-AND-LATEST-TAIL", "DLCP-02-WHOLE-FILE-REWRITE-CHANGES-TAIL",
    "DLCP-03-TRUNCATED-OR-REPLAYED-CHECKPOINT", "DLCP-04-APPENDED-RECORD-IS-NOT-YET-ANCHORED",
    "DLCP-05-ANCHOR-STORE-UNAVAILABLE", "DLCP-06-REVOKED-OR-UNKNOWN-SIGNING-KEY",
    "DLCP-07-ROTATION-REQUIRES-OVERLAP-AND-REVIEW", "DLCP-08-COMPROMISE-REANCHOR-DOES-NOT-REWRITE-HISTORY",
  ];
  if (decisionLedgerCheckpoint?.contractVersion !== "decision-ledger-checkpoint.v0"
    || decisionLedgerCheckpoint?.classification !== "SYNTHETIC_SECURITY_ACCEPTANCE_NOT_SIGNATURE_OR_RUNTIME_PROOF"
    || decisionLedgerCheckpoint?.status !== "PROPOSED_UNAPPROVED"
    || decisionLedgerCheckpoint?.decisionId !== "KR-OPERATIONAL-SECURITY-01"
    || decisionLedgerCheckpoint?.dataPolicy?.containsOperationalDecisionEvidence !== false
    || decisionLedgerCheckpoint?.dataPolicy?.containsCredentials !== false
    || decisionLedgerCheckpoint?.dataPolicy?.containsPrivateKeys !== false
    || decisionLedgerCheckpoint?.unapprovedChoices?.signatureAlgorithm !== null
    || decisionLedgerCheckpoint?.unapprovedChoices?.keyProvider !== null
    || decisionLedgerCheckpoint?.unapprovedChoices?.checkpointCadence !== null
    || decisionLedgerRecordHash(decisionLedgerCheckpoint?.recordHashGoldenVector?.record ?? {}) !== decisionLedgerCheckpoint?.recordHashGoldenVector?.expectedHash
    || !isDeepStrictEqual(decisionLedgerCheckpoint?.vectors?.map((vector) => vector?.id), requiredDecisionLedgerCheckpointVectors)
    || decisionLedgerCheckpoint?.vectors?.some((vector) => !vector?.expected)) {
    invalidDecisionEvidence.push("decision ledger external checkpoint proposal/acceptance vectors are incomplete or mislabeled");
  }
  let issuerCapitalStateFixture;
  try {
    const capitalStateSource = readFileSync(join(root, "docs", "fixtures", "disclosure", "issuer-capital-state-reconciliation.v0.json"), "utf8");
    assertUniqueJsonObjectKeys(capitalStateSource);
    issuerCapitalStateFixture = JSON.parse(capitalStateSource);
  } catch (error) {
    invalidDecisionEvidence.push(`issuer-capital-state-reconciliation.v0.json is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const requiredIssuerCapitalStateVectors = [
    "ICSR-01-SAME-ISSUER-DIFFERENT-SERIES-STAY-SEPARATE", "ICSR-02-REPEATED-RECEIPT-REVISION-IS-NOT-DOUBLE-COUNTED",
    "ICSR-03-EXERCISE-REPORT-AND-LISTING-STAGE-DO-NOT-ADD-SHARES-TWICE", "ICSR-04-REPORTED-SHARE-TOTAL-MAY-INCLUDE-PROPOSED-LISTING",
    "ICSR-05-CORRECTED-CONVERSION-TERMS-STALE-ONLY-DEPENDENT-SCENARIO", "ICSR-06-UNRESOLVED-TRANCHE-IDENTITY-DOES-NOT-FUZZY-MERGE",
    "ICSR-07-EXCHANGE-BOND-ISSUER-AND-UNDERLYING-ISSUER-STAY-SEPARATE", "ICSR-08-MULTI-CURRENCY-PRINCIPAL-IS-NOT-SUMMED",
    "ICSR-09-CORPORATE-ACTION-BASIS-MISMATCH-BLOCKS-SHARE-RATIO", "ICSR-10-PARTIAL-ISSUANCE-COVERAGE-IS-NOT-ZERO-REMAINDER",
    "ICSR-11-OBSERVED-AT-DOES-NOT-LOOK-AHEAD-STATE-AS-OF", "ICSR-12-CORRECTION-SUPERSEDES-ONLY-LINKED-MOVEMENT",
    "ICSR-13-AUTHORIZED-AMOUNT-IS-NOT-ISSUED-OR-OUTSTANDING", "ICSR-14-PRINCIPAL-AND-POTENTIAL-SHARES-ARE-DIFFERENT-MEASURES",
    "ICSR-15-UNLINKED-FILINGS-DO-NOT-FORM-A-SYNTHETIC-SERIES", "ICSR-16-RIGHTS-OR-MASTER-FAILURE-SUPPRESSES-PUBLIC-PROJECTION",
  ];
  const requiredIssuerCapitalOutputFields = ["issuerInstrumentId", "securityClass", "seriesOrTrancheId", "stateAsOf", "observedAt", "sourceRevisionIds", "coverageStatus", "reportedBaseSnapshot", "linkedMovements", "outstandingPrincipalByCurrency", "potentialSharesByScenario", "sharesIssuedByStage", "sharesListedByStage", "unresolvedAmountsAndReasons", "reconciliationStatus", "dependencyFingerprint"];
  if (issuerCapitalStateFixture?.contractVersion !== "issuer-capital-state-reconciliation.v0"
    || issuerCapitalStateFixture?.classification !== "SYNTHETIC_PRODUCT_ACCEPTANCE_NOT_ISSUER_DATA_OR_INVESTMENT_RECOMMENDATION"
    || issuerCapitalStateFixture?.decisionId !== "KR-CAPITAL-RECONCILIATION-01"
    || issuerCapitalStateFixture?.status !== "PROPOSED_UNAPPROVED"
    || issuerCapitalStateFixture?.dataPolicy?.containsRealFiling !== false
    || issuerCapitalStateFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || issuerCapitalStateFixture?.dataPolicy?.containsRealFinancialValue !== false
    || !requiredIssuerCapitalOutputFields.every((field) => issuerCapitalStateFixture?.requiredOutputFields?.includes(field))
    || !isDeepStrictEqual(issuerCapitalStateFixture?.vectors?.map((vector) => vector?.id), requiredIssuerCapitalStateVectors)
    || issuerCapitalStateFixture?.vectors?.some((vector) => !vector?.expected)
    || issuerCapitalStateFixture?.stateContract?.reportedBaseSnapshotAndSubsequentMovementsAreReconciledNotBlindlySummed !== true
    || issuerCapitalStateFixture?.stateContract?.snapshotAsOfAndObservedAtAreSeparate !== true
    || issuerCapitalStateFixture?.stateContract?.currenciesAndSecurityClassesAreNeverImplicitlyCombined !== true
    || issuerCapitalStateFixture?.stateContract?.unknownOrUnsearchedAmountsAreNotZero !== true) {
    invalidDecisionEvidence.push("issuer capital state reconciliation contract/vectors are incomplete or mislabeled");
  }
  let issuerRiskStatusFixture;
  try {
    const source = readFileSync(join(root, "docs", "fixtures", "disclosure", "issuer-risk-status-timeline.v0.json"), "utf8");
    assertUniqueJsonObjectKeys(source);
    issuerRiskStatusFixture = JSON.parse(source);
  } catch (error) {
    invalidDecisionEvidence.push(`issuer-risk-status-timeline.v0.json is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const requiredIssuerRiskVectors = [
    "IRST-01-NEGATIVE-FINANCIAL-INDICATOR-IS-NOT-DEFAULT", "IRST-02-AUDIT-OPINION-AND-GOING-CONCERN-ARE-SEPARATE-ASSERTIONS",
    "IRST-03-REHABILITATION-APPLICATION-IS-NOT-COURT-OPENING", "IRST-04-APPLICATION-REJECTION-DOES-NOT-ERASE-FILING-HISTORY",
    "IRST-05-MANAGED-DESIGNATION-IS-NOT-DELISTING", "IRST-06-LISTING-ELIGIBILITY-REVIEW-IS-NOT-FINAL-DELISTING",
    "IRST-07-TRADING-SUSPENSION-IS-NOT-DELISTING", "IRST-08-RESUMED-TRADING-DOES-NOT-ERASE-HISTORICAL-ACTION",
    "IRST-09-EXPIRED-STATUS-SNAPSHOT-CANNOT-ASSERT-CURRENT-STATE", "IRST-10-CORRECTED-REPORT-INVALIDATES-DEPENDENT-STATE",
    "IRST-11-ISSUER-ASSERTION-IS-NOT-KRX-ACTION", "IRST-12-SUBSIDIARY-CASE-DOES-NOT-AUTO-ATTRIBUTE-TO-PARENT",
    "IRST-13-COURT-FILING-AND-COURT-ORDER-ARE-DIFFERENT-EVIDENCE", "IRST-14-SAME-FACT-IN-REPORT-AND-EXCHANGE-NOTICE-IS-NOT-TWO-DISTRESS-POINTS",
    "IRST-15-CONFLICTING-OFFICIAL-STATUS-REMAINS-UNRESOLVED", "IRST-16-PARTIAL-SOURCE-COVERAGE-IS-NOT-CLEAR-STATUS",
    "IRST-17-HISTORICAL-ASOF-EXCLUDES-LATER-KNOWN-OUTCOME", "IRST-18-RULE-REVISION-USES-EFFECTIVE-TIME-AND-SOURCE-VERSION",
  ];
  const issuerRiskRequiredFields = ["issuerInstrumentId", "affectedInstrumentIds", "sourceAuthority", "sourceRevisionIds", "sourceLocatorRefs", "eventTime", "observedAt", "stateAsOf", "issuerDisclosureAssertion", "legalOrRegulatoryProcess", "exchangeMarketAction", "coverageStatus", "correctionStatus", "conflictRefs", "decisionPolicyVersion"];
  if (issuerRiskStatusFixture?.contractVersion !== "issuer-risk-status-timeline.v0"
    || issuerRiskStatusFixture?.classification !== "SYNTHETIC_PRODUCT_ACCEPTANCE_NOT_ISSUER_DATA_OR_INVESTMENT_RECOMMENDATION"
    || issuerRiskStatusFixture?.decisionId !== "KR-ISSUER-RISK-STATUS-01"
    || issuerRiskStatusFixture?.status !== "PROPOSED_UNAPPROVED"
    || issuerRiskStatusFixture?.dataPolicy?.containsRealFiling !== false
    || issuerRiskStatusFixture?.dataPolicy?.containsRealIssuerOrTicker !== false
    || issuerRiskStatusFixture?.dataPolicy?.containsRealFinancialValue !== false
    || !issuerRiskRequiredFields.every((field) => issuerRiskStatusFixture?.requiredOutputFields?.includes(field))
    || !isDeepStrictEqual(issuerRiskStatusFixture?.vectors?.map((vector) => vector?.id), requiredIssuerRiskVectors)
    || issuerRiskStatusFixture?.vectors?.some((vector) => !vector?.expected)
    || Object.values(issuerRiskStatusFixture?.stateContract ?? {}).some((value) => value !== true)
    || issuerRiskStatusFixture?.independentStateAxes?.rule?.includes("never implies") !== true) {
    invalidDecisionEvidence.push("issuer risk status timeline contract/vectors are incomplete or mislabeled");
  }
  const decisionStatusById = decisionLedgerValidation.currentStatus;
  const requiredDecisionLifecycleVectorIds = [
    "DRL-01-OPEN-REGISTER-MAY-START-WITHOUT-HISTORY", "DRL-02-NON-OPEN-STATUS-REQUIRES-MATCHING-LEDGER-REVISION",
    "DRL-03-CURRENT-STATUS-MUST-MATCH-LATEST-REVISION", "DRL-04-REVISION-SEQUENCE-MUST-BE-CONTIGUOUS",
    "DRL-05-OPEN-CANNOT-SKIP-EVIDENCE-REVIEW", "DRL-06-APPROVAL-REQUIRES-SCOPED-DECISION-AND-PASSING-ACCEPTANCE",
    "DRL-07-REJECTION-REQUIRES-REASON-AND-REOPEN-CONDITION", "DRL-08-EXPIRY-REQUIRES-TIMESTAMP-AND-REVIEW-ACTION",
    "DRL-09-DECISION-SCOPE-DOES-NOT-AUTO-ACTIVATE-OTHER-CONSUMER", "DRL-10-ACTIVE-IS-CONSUMER-GATE-NOT-DECISION-STATUS",
    "DRL-11-CURRENT-STATUS-IS-DERIVED-FROM-LATEST-LEDGER-REVISION", "DRL-12-EVIDENCE-SCOPE-MUST-MATCH-REGISTERED-DECISION-SCOPE",
    "DRL-13-LEDGER-RECORD-HASH-MISMATCH-BLOCKS-STATUS-PROJECTION", "DRL-14-GLOBAL-LEDGER-CHAIN-BREAK-BLOCKS-STATUS-PROJECTION",
    "DRL-15-APPROVED-STATUS-REQUIRES-EXACT-SCOPE-AND-PASSING-EVIDENCE",
  ];
  const decisionLifecycleVectors = decisionLifecycleFixture?.vectors ?? [];
  const decisionLifecycleVectorIds = decisionLifecycleVectors.map((vector) => vector?.id);
  const decisionLifecycleVectorById = new Map(decisionLifecycleVectors.map((vector) => [vector?.id, vector]));
  const decisionLifecycleRegisterBaseline = decisionLifecycleFixture?.registerBaseline ?? [];
  const expectedDecisionRegisterBaseline = Object.fromEntries(canonicalDecisions.map((decision) => [decision.decisionId, decisionStatusById.get(decision.decisionId) ?? "OPEN"]));
  const fixtureDecisionRegisterBaseline = Object.fromEntries(decisionLifecycleRegisterBaseline.map((entry) => [entry?.decisionId, entry?.currentStatus]));
  const markdownDecisionRegisterBaseline = Object.fromEntries(decisionRows.map((row) => [row[1], row[3]]));
  const decisionRegisterRowsById = new Map(decisionRows.map((row) => [row[1], row[2].split("|").map((value) => value.trim())]));
  const canonicalDecisionMarkdownMismatch = canonicalDecisions.some((decision) => {
    const cells = decisionRegisterRowsById.get(decision.decisionId);
    return !cells || cells.length !== 4
      || cells[0] !== decision.ownerRole
      || cells[1] !== decision.scope
      || cells[2] !== decision.defaultBehavior
      || cells[3] !== decision.acceptanceEvidence
      || markdownDecisionRegisterBaseline[decision.decisionId] !== (decisionStatusById.get(decision.decisionId) ?? "OPEN");
  }) || decisionRows.length !== canonicalDecisions.length;
  const emptyEvidenceRow = "| — | — | — | — | — | — | — | — | — |";
  const renderedEvidenceRows = renderDecisionEvidenceLedger(decisionEvidenceLedger).split(/\r?\n/).filter((line) => line.startsWith("|")).slice(2);
  const actualEvidenceProjectionRows = decisionEvidenceRows.length ? decisionEvidenceRows.map((row) => row.raw) : [emptyEvidenceRow];
  if (!isDeepStrictEqual(actualEvidenceProjectionRows, renderedEvidenceRows)) invalidDecisionEvidence.push("Markdown evidence ledger differs from the canonical append-only decision evidence ledger");
  const investmentRightsDecisionBindings = investmentRightsPropagation?.decisionGateBindings ?? [];
  const investmentRightsDecisionBindingDrift = investmentRightsDecisionBindings.some((binding) => {
    const canonicalDecision = canonicalDecisionById.get(binding?.decisionId);
    const lifecycleStatus = fixtureDecisionRegisterBaseline[binding?.decisionId];
    return !canonicalDecision
      || markdownDecisionRegisterBaseline[binding?.decisionId] !== lifecycleStatus
      || lifecycleStatus !== (decisionStatusById.get(binding?.decisionId) ?? "OPEN")
      || !investmentRightsPropagation?.decisionGateEffects?.[lifecycleStatus]
      || binding.requiredFor.some((vectorRef) => !investmentRightsPropagationIds.some((vectorId) => vectorId.startsWith(`${vectorRef}-`)));
  });
  const investmentRightsBindingIdMismatch = investmentRightsDecisionBindings.some((binding) => !decisionIds.includes(binding?.decisionId))
    || investmentRightsDecisionBindings.some((binding) => !decisionLifecycleRegisterBaseline.some((entry) => entry?.decisionId === binding?.decisionId));
  const decisionLifecycleExpectedReasons = new Map([
    ["DRL-01-OPEN-REGISTER-MAY-START-WITHOUT-HISTORY", { valid: true, gateEffect: "FAIL_CLOSED" }],
    ["DRL-02-NON-OPEN-STATUS-REQUIRES-MATCHING-LEDGER-REVISION", { valid: false, reason: "MISSING_DECISION_EVIDENCE" }],
    ["DRL-03-CURRENT-STATUS-MUST-MATCH-LATEST-REVISION", { valid: false, reason: "STATUS_HISTORY_MISMATCH" }],
    ["DRL-04-REVISION-SEQUENCE-MUST-BE-CONTIGUOUS", { valid: false, reason: "REVISION_GAP" }],
    ["DRL-05-OPEN-CANNOT-SKIP-EVIDENCE-REVIEW", { valid: false, reason: "ILLEGAL_STATUS_TRANSITION" }],
    ["DRL-06-APPROVAL-REQUIRES-SCOPED-DECISION-AND-PASSING-ACCEPTANCE", { valid: false, reason: "APPROVAL_EVIDENCE_INCOMPLETE" }],
    ["DRL-07-REJECTION-REQUIRES-REASON-AND-REOPEN-CONDITION", { valid: false, reason: "REJECTION_REOPEN_CONDITION_MISSING" }],
    ["DRL-08-EXPIRY-REQUIRES-TIMESTAMP-AND-REVIEW-ACTION", { valid: false, reason: "EXPIRY_EVIDENCE_MISSING" }],
    ["DRL-09-DECISION-SCOPE-DOES-NOT-AUTO-ACTIVATE-OTHER-CONSUMER", { valid: false, reason: "SCOPE_NOT_COVERED", gateEffect: "FAIL_CLOSED" }],
    ["DRL-10-ACTIVE-IS-CONSUMER-GATE-NOT-DECISION-STATUS", { valid: true, decisionStatusAfter: "APPROVED" }],
    ["DRL-11-CURRENT-STATUS-IS-DERIVED-FROM-LATEST-LEDGER-REVISION", { currentStatus: "OPEN", manualStatusEditAccepted: false, gateEffect: "FAIL_CLOSED" }],
    ["DRL-12-EVIDENCE-SCOPE-MUST-MATCH-REGISTERED-DECISION-SCOPE", { valid: false, reason: "DECISION_SCOPE_MISMATCH", currentStatus: "OPEN" }],
    ["DRL-13-LEDGER-RECORD-HASH-MISMATCH-BLOCKS-STATUS-PROJECTION", { valid: false, reason: "LEDGER_RECORD_HASH_INVALID", currentStatus: "OPEN" }],
    ["DRL-14-GLOBAL-LEDGER-CHAIN-BREAK-BLOCKS-STATUS-PROJECTION", { valid: false, reason: "LEDGER_CHAIN_BROKEN", currentStatus: "OPEN" }],
    ["DRL-15-APPROVED-STATUS-REQUIRES-EXACT-SCOPE-AND-PASSING-EVIDENCE", { valid: false, reason: "APPROVAL_EVIDENCE_INCOMPLETE", currentStatus: "OPEN" }],
  ]);
  const invalidDecisionLifecycleFixture = decisionLifecycleFixture?.contractVersion !== "decision-register-lifecycle.v0"
    || decisionLifecycleFixture?.classification !== "SYNTHETIC_VECTORS_WITH_DOCUMENT_STATUS_BASELINE"
    || decisionLifecycleFixture?.dataPolicy?.containsOperationalDecisionEvidence !== false
    || decisionLifecycleFixture?.dataPolicy?.containsRealOwnerOrReviewer !== false
    || decisionLifecycleFixture?.dataPolicy?.containsCredentials !== false
    || decisionLifecycleFixture?.dataPolicy?.identitiesAreSynthetic !== true
    || decisionLifecycleFixture?.dataPolicy?.registerBaselineDerivedFromEvidenceLedger !== true
    || !isDeepStrictEqual(decisionLifecycleFixture?.statusVocabulary, canonicalDecisionStatuses)
    || !isDeepStrictEqual(decisionLifecycleFixture?.allowedTransitions, Object.fromEntries(Object.entries(allowedDecisionTransitions).map(([status, transitions]) => [status, [...transitions]])))
    || canonicalDecisionRegisterInvalid
    || !isDeepStrictEqual(decisionLifecycleRegisterBaseline.map((entry) => entry?.decisionId), decisionIds)
    || !isDeepStrictEqual(fixtureDecisionRegisterBaseline, expectedDecisionRegisterBaseline)
    || !isDeepStrictEqual(markdownDecisionRegisterBaseline, fixtureDecisionRegisterBaseline)
    || !["decisionId", "decisionRevision", "status", "scope", "selectedValue", "ownerRole", "namedOwner", "evidenceManifestHash", "evidenceObservedAt", "reviewer", "decisionRef", "validUntil", "reviewCondition", "acceptanceArtifact", "acceptanceResult", "fixtureCount", "reason", "reopenWhen", "effectiveAt", "previousRevision", "dependencyDecisionIds", "codeGateEvidence", "rollbackEvidence", "previousRecordHash", "recordHash"].every((field) => decisionLifecycleFixture?.requiredDecisionRecordFields?.includes(field))
    || !isDeepStrictEqual(Object.keys(decisionLifecycleFixture?.statusRequirements ?? {}).sort(), [...canonicalDecisionStatuses].sort())
    || !isDeepStrictEqual(Object.keys(investmentRightsPropagation?.decisionStatusSemantics ?? {}).sort(), [...canonicalDecisionStatuses].sort())
    || !isDeepStrictEqual(Object.keys(investmentRightsPropagation?.decisionGateEffects ?? {}).sort(), [...canonicalDecisionStatuses].sort())
    || investmentRightsPropagation?.decisionGateEffects?.OPEN !== "BLOCKED"
    || investmentRightsPropagation?.decisionGateEffects?.EVIDENCE_READY !== "BLOCKED"
    || investmentRightsPropagation?.decisionGateEffects?.APPROVED !== "DECISION_SCOPE_ONLY_DEPENDENT_GATES_CLOSED"
    || investmentRightsPropagation?.decisionGateEffects?.CLOSED !== "SCOPED_GATES_ONLY_AFTER_CODE_AND_ROLLBACK_EVIDENCE"
    || investmentRightsPropagation?.decisionGateEffects?.REJECTED !== "BLOCKED_UNTIL_REOPEN_CONDITION"
    || investmentRightsPropagation?.decisionGateEffects?.EXPIRED !== "BLOCKED_UNTIL_CURRENT_REVIEW"
    || decisionLifecycleVectors.length !== requiredDecisionLifecycleVectorIds.length
    || new Set(decisionLifecycleVectorIds).size !== decisionLifecycleVectorIds.length
    || requiredDecisionLifecycleVectorIds.some((id) => !decisionLifecycleVectorById.has(id))
    || [...decisionLifecycleExpectedReasons].some(([id, expected]) => !isDeepStrictEqual(decisionLifecycleVectorById.get(id)?.expected, expected));
  const knownDecisionIds = new Set(decisionIds);
  const emptyEvidenceRows = evidenceLedgerDataLines.filter((line) => line === emptyEvidenceRow).length;
  const unparsedEvidenceRows = evidenceLedgerDataLines.filter((line) => line !== emptyEvidenceRow && !decisionEvidenceRows.some((row) => row.raw === line));
  if (unparsedEvidenceRows.length || emptyEvidenceRows > 1 || (decisionEvidenceRows.length === 0 && emptyEvidenceRows !== 1) || (decisionEvidenceRows.length > 0 && emptyEvidenceRows !== 0)) invalidDecisionEvidence.push("decision evidence ledger must have parsed rows or exactly one empty placeholder, never both");
  const isValidUtcTimestamp = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
  };
  const isValidCalendarDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  for (const row of decisionEvidenceRows) {
    if (!knownDecisionIds.has(row.id)) invalidDecisionEvidence.push(`${row.id}: unknown decision ID in evidence ledger`);
    const [owner, manifest, reviewer, validity, acceptance] = row.fields;
    if (!/^person:[A-Za-z0-9._@:-]+$/.test(owner)) invalidDecisionEvidence.push(`${row.id}#${row.revision}: named owner must use person:<stable-id>`);
    const observedAt = manifest.match(/; observedAt:(.+)$/)?.[1] ?? "";
    if (!/^sha256:[a-f0-9]{64}; observedAt:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(manifest) || !isValidUtcTimestamp(observedAt)) invalidDecisionEvidence.push(`${row.id}#${row.revision}: evidence manifest requires valid SHA-256 and UTC observation timestamp`);
    if (!/^reviewer:person:[A-Za-z0-9._@:-]+; decisionRef:\S+$/.test(reviewer)) invalidDecisionEvidence.push(`${row.id}#${row.revision}: reviewer and decision reference are malformed`);
    const validUntil = validity.match(/^validUntil:(\d{4}-\d{2}-\d{2});/)?.[1] ?? "";
    if (!/^validUntil:\d{4}-\d{2}-\d{2}; reviewCondition:.{3,}$/.test(validity) || !isValidCalendarDate(validUntil)) invalidDecisionEvidence.push(`${row.id}#${row.revision}: validity/review condition is malformed`);
    if (!/^artifact:(?:https:\/\/\S+|[A-Za-z0-9_.\/-]+); result:(?:PASS|NOT_RUN); fixtureCount:\d+$/.test(acceptance)) invalidDecisionEvidence.push(`${row.id}#${row.revision}: acceptance artifact/result/count are malformed`);
    const reason = row.fields[5];
    if (row.status === "REJECTED" && !/^reason:.{3,}; reopenWhen:.{3,}$/.test(reason)) invalidDecisionEvidence.push(`${row.id}#${row.revision}: REJECTED requires reason and reopening condition`);
    const expiredAt = reason.match(/^expiredAt:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z);/)?.[1] ?? "";
    if (row.status === "EXPIRED" && (!/^expiredAt:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z; reviewAction:.{3,}$/.test(reason) || !isValidUtcTimestamp(expiredAt))) invalidDecisionEvidence.push(`${row.id}#${row.revision}: EXPIRED requires valid expiry timestamp and review action`);
    if (["APPROVED", "CLOSED"].includes(row.status) && (!/decisionRef:.+/.test(reviewer) || acceptance.includes("result:NOT_RUN"))) invalidDecisionEvidence.push(`${row.id}#${row.revision}: APPROVED/CLOSED requires a decision record and passing acceptance artifact`);
  }
  for (const decision of decisionRows) {
    const id = decision[1];
    const status = decision[3];
    const history = decisionEvidenceRows.filter((row) => row.id === id);
    const revisions = history.map((row) => row.revision);
    if (new Set(revisions).size !== revisions.length || revisions.some((revision, index) => revision !== index + 1)) invalidDecisionEvidence.push(`${id}: decision evidence revisions must be contiguous and unique`);
    for (let index = 1; index < history.length; index += 1) {
      if (!allowedDecisionTransitions[history[index - 1].status]?.has(history[index].status)) invalidDecisionEvidence.push(`${id}#${history[index].revision}: illegal state transition ${history[index - 1].status} -> ${history[index].status}`);
    }
    if (history.length && history.at(-1).status !== status) invalidDecisionEvidence.push(`${id}: current status must match latest decision evidence revision`);
    if (status !== "OPEN" && !history.length) invalidDecisionEvidence.push(`${id}: non-OPEN status requires decision evidence`);
    if (status !== "OPEN" && history.length) {
      const latest = history.at(-1);
      const acceptance = latest.fields[4];
      if (["APPROVED", "CLOSED"].includes(status) && acceptance.includes("result:NOT_RUN")) invalidDecisionEvidence.push(`${id}: APPROVED/CLOSED requires passing acceptance evidence`);
    }
  }
  const decisionAudit = section("#### 설계 승인 전 결함 종결 감사표", "| `KR-DART-RIGHTS-01` |");
  const decisionAuditRows = [...decisionAudit.matchAll(/^\| ([^|\r\n]+) \|([^\n]+)\|$/gm)].map((match) => ({ domain: match[1].trim(), body: match[2] })).filter(({ domain }) => !["감사 영역", "Decision ID", "---"].includes(domain));
  const decisionAuditDomains = decisionAuditRows.map(({ domain }) => domain);
  const expectedDecisionDomains = new Set(["공식 source와 rights", "보통주 identity 및 eligibility", "ingestion coverage", "issuer capital state reconciliation", "issuer risk and listing status", "문서·정정 생명주기", "분석·요약 재현성", "event/date taxonomy", "event attribution", "저장·legacy cutover", "API·UI snapshot consistency", "cursor key/snapshot security", "장애·보안·개인정보", "운영 책임·SLO", "end-to-end shadow acceptance"]);
  const missingDecisionDomains = [...expectedDecisionDomains].filter((domain) => !decisionAuditDomains.includes(domain));
  const duplicateDecisionDomains = decisionAuditDomains.filter((domain, index) => decisionAuditDomains.indexOf(domain) !== index);
  const unmappedDecisionDomains = decisionAuditDomains.filter((domain) => !expectedDecisionDomains.has(domain));
  const missingDecisionDomainLinks = [...decisionDomainById.entries()].filter(([, domain]) => !decisionAuditDomains.includes(domain));
  const mappedDecisionDomains = new Set(decisionDomainById.values());
  const missingDecisionOwners = [...expectedDecisionDomains].filter((domain) => !mappedDecisionDomains.has(domain));
  const decisionAuditRequired = ["현재 결과", "OPEN", "미충족 시 차단 범위"];
  const missingDecisionAuditTerms = decisionAuditRequired.filter((term) => !decisionAudit.includes(term));
  const decisionLedgerRequired = ["decision-evidence-ledger.v0.json", "Evidence manifest SHA-256 + source timestamp", "Reviewer/decision record", "Valid through/review condition", "Fixture/acceptance report", "서명된 외부 checkpoint 제안", "detached signature", "다른 trust domain", "전체 파일 재작성", "ledger writer와 signer 권한은 분리", "safe integer"];
  const missingDecisionLedger = decisionLedgerRequired.filter((term) => !decisionLog.includes(term));
  const decisionLifecycleSection = section("#### 결정 종료 및 증거 추적 프로토콜 제안", "현재 decision register는");
  const lifecycleStatusRows = [...decisionLifecycleSection.matchAll(/^\| `([A-Z_]+)` \|[^\n]+$/gm)].map((match) => match[1]);
  const invalidDecisionLifecycle = invalidDecisionLifecycleFixture
    || lifecycleStatusRows.length !== canonicalDecisionStatuses.length
    || canonicalDecisionStatuses.some((status, index) => lifecycleStatusRows[index] !== status)
    || !decisionLifecycleSection.includes("결정 상태, 심의 진행 단계, 실제 consumer gate 상태는 서로 다른 축")
    || !decisionLifecycleSection.includes("유보는 사유와 재검토 trigger를 기록한 `OPEN` revision")
    || !decisionLifecycleSection.includes("`ACTIVE`는 status가 아니라 downstream release/consumer gate 상태")
    || !decisionLifecycleSection.includes("`REOPENED`는 status가 아니라 만료·변경 후 새 `OPEN` revision");
  if (decisionRowIds.length !== decisionIds.length || new Set(decisionRowIds).size !== decisionRowIds.length || decisionIds.some((id) => !decisionRowIds.includes(id)) || invalidDecisionRows.length || invalidDecisionEvidence.length || invalidDecisionLifecycle || canonicalDecisionRegisterInvalid || canonicalDecisionMarkdownMismatch || missingDecisionDomains.length || duplicateDecisionDomains.length || unmappedDecisionDomains.length || missingDecisionDomainLinks.length || missingDecisionOwners.length || missingDecisionAuditTerms.length || missingDecisionLedger.length || investmentRightsDecisionBindingDrift || investmentRightsBindingIdMismatch || !decisionLog.includes("각 영역을 각각 승인") || !decisionLog.includes("source hash") || !decisionLog.includes("전체 분모")) {
    console.error(`Korean disclosure decision register/audit incomplete: ${[...missingDecisionIds, ...(decisionRowIds.length !== decisionIds.length ? ["decision rows must include all IDs exactly once with explicit status"] : []), ...(invalidDecisionRows.length ? ["decision row owner/role is empty"] : []), ...(invalidDecisionLifecycleFixture ? ["decision lifecycle fixture vocabulary/transitions/vectors are incomplete or inconsistent"] : []), ...(invalidDecisionLifecycle ? ["decision lifecycle status vocabulary/axes must match the canonical decision register"] : []), ...invalidDecisionEvidence, ...missingDecisionDomains.map((value) => `missing audit domain: ${value}`), ...duplicateDecisionDomains.map((value) => `duplicate audit domain: ${value}`), ...unmappedDecisionDomains.map((value) => `unmapped audit domain: ${value}`), ...missingDecisionDomainLinks.map(([id, domain]) => `${id} lacks audit domain ${domain}`), ...missingDecisionOwners.map((domain) => `audit domain lacks an explicit decision owner: ${domain}`), ...missingDecisionAuditTerms, ...missingDecisionLedger, ...["각 영역을 각각 승인", "source hash", "전체 분모"].filter((term) => !decisionLog.includes(term))].join(", ")}`);
    process.exit(1);
  }
  const requiredFailures = ["source pagination 누락/변동", "문서 hash/attachment 변경", "instrument master/cap stale", "rights decision 만료/변경", "source/provider outage", "DB projection/import 실패", "일정 정정/철회 충돌"];
  const missingFailureCases = requiredFailures.filter((failure) => !decisionLog.includes(failure));
  if (missingDecisionIds.length || missingFailureCases.length || !decisionLog.includes("가장 제한적인 gate") || !decisionLog.includes("설계 승인과 해당 의존 단계의 구현·migration·shadow·공개 gate는 닫힌 상태다") || !decisionLog.includes("acceptance fixture, 코드 gate, rollback 증거")) {
    console.error(`Korean disclosure decision/runbook contract incomplete: ${[...missingDecisionIds, ...missingFailureCases].join(", ")}`);
    process.exit(1);
  }
  const taxonomy = section("### 사실, 해석, 일정", "#### 후보 승인과 이벤트 식별 규칙");
  const formFixtureContract = section("#### 공식 양식 fixture catalog 및 재현성 gate", "#### 일정 값 타입 수용 기준");
  const structuredApiContract = section("#### 공식 구조화 주요정보 API와 원문 filing의 역할", "#### 국내 일정 taxonomy 적용표");
  const structuredApiRequired = ["piicDecsn.json", "pifricDecsn.json", "fric_nstk_asstd", "fric_nstk_dlprd", "fric_nstk_lstprd", "fric_bddd", "stkExtrDecsn.json", "cmpMgDecsn.json", "일부 정보", "정확성·완전성을 보장하지 않고", "StructuredSourceRevision", "rcept_no", "correction-reconciliation coverage", "STRUCTURED_API_FIELD", "ORIGINAL_BODY_FIELD", "BOTH_REQUIRED", "NO_APPROVED_SOURCE", "NOT_APPLICABLE", "disclosure_structured_source_observations", "mapping release", "response hash 또는 non-retention reason", "coverage denominator", "STRUCTURED_FIXTURE_INCOMPLETE"];
  const missingStructuredApi = structuredApiRequired.filter((value) => value === "disclosure_structured_source_observations" ? !architecture.includes(value) : !structuredApiContract.includes(value));
  if (missingStructuredApi.length) {
    console.error(`Korean structured OpenDART field/reconciliation contract incomplete: ${missingStructuredApi.join(", ")}`);
    process.exit(1);
  }
  const issuerCapitalReconciliationSection = section("#### Issuer 단위 자본상태 roll-forward 제안 — ICSR-01–ICSR-16", "##### DS005 structured field와 timeline claim 대조 contract 제안");
  const issuerCapitalReconciliationRequired = ["KR-CAPITAL-RECONCILIATION-01", "stateAsOf", "observedAt", "reported base snapshot", "movement", "중복", "추가상장", "PARTIAL/CONFLICTED/UNRESOLVED", "currency", "corporate-action", "coverage", "OpenDART 정기보고서 주요정보 가이드", "KIND 전환주식 전환 사례"];
  const missingIssuerCapitalReconciliation = issuerCapitalReconciliationRequired.filter((value) => !issuerCapitalReconciliationSection.includes(value));
  if (missingIssuerCapitalReconciliation.length) {
    console.error(`Issuer capital state reconciliation planning contract incomplete: ${missingIssuerCapitalReconciliation.join(", ")}`);
    process.exit(1);
  }
  const sourceCrosswalk = section("#### DART/KIND 공시 발견 source와 event taxonomy crosswalk", "#### 국내 일정 taxonomy 적용표");
  const sourceCrosswalkRequired = ["`list.json` 전체 공시를 대체하지 않는다", "`last_reprt_at=N`", "A001", "A002", "A003", "B001", "C001–C005", "C006–C010", "C011", "D001", "D005", "E001", "E006", "F/G/H/J", "I001", "I003", "KIND issuer disclosure", "주주총회관련", "주식분할/병합", "KIND market action", "권리락·배당락·기준가격", "exact shared receipt", "`UNCLASSIFIED_SOURCE_TYPE`", "source/event", "currentPageSize=100", "${source}:${publishedAt || \"unknown\"}:${index}", "IDENTITY_UNRESOLVED", "OBSERVED_EMPTY_RESPONSE", "FEED_WINDOW_ONLY", "199 byte", "항목 재정렬", "동일 receipt의 제목/본문 수정"];
  const missingSourceCrosswalk = sourceCrosswalkRequired.filter((value) => !sourceCrosswalk.includes(value));
  const kindSourceCode = readFileSync(join(root, "lib", "domestic-rss-sources.ts"), "utf8");
  const marketRssParserCode = readFileSync(join(root, "lib", "market-rss.ts"), "utf8");
  const kindPipelineCode = readFileSync(join(root, "lib", "market-rss-pipeline.ts"), "utf8");
  const kindImplementationMarkers = [
    [kindSourceCode, "currentPageSize=100"],
    [marketRssParserCode, "item.guid || item.id"],
    [marketRssParserCode, "${source}:${publishedAt || \"unknown\"}:${index}"],
    [kindPipelineCode, "externalId: item.id"],
    [kindPipelineCode, "marketRssArticles.externalId"],
  ];
  const missingKindImplementationMarkers = kindImplementationMarkers.filter(([source, marker]) => !source.includes(marker)).map(([, marker]) => marker);
  if (missingSourceCrosswalk.length || missingKindImplementationMarkers.length) {
    console.error(`DART/KIND official source/category/identity contract incomplete: ${[...missingSourceCrosswalk, ...missingKindImplementationMarkers].join(", ")}`);
    process.exit(1);
  }
  const ds005Catalog = section("#### OpenDART DS005 주요정보 공식 36종 inventory", "#### 국내 일정 taxonomy 적용표");
  const ds005GuideIds = [...ds005Catalog.matchAll(/`(20200\d{2})`/g)].map((match) => match[1]);
  const ds005ExpectedGuideIds = Array.from({ length: 36 }, (_, index) => String(2020018 + index));
  const missingDs005GuideIds = ds005ExpectedGuideIds.filter((id) => !ds005GuideIds.includes(id));
  const unexpectedDs005GuideIds = ds005GuideIds.filter((id) => !ds005ExpectedGuideIds.includes(id));
  const ds005Rows = ds005Catalog.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\|\s*(\d+)\s*\/\s*\[`(20200\d{2})`\]\([^)]*\)\s*\|\s*`(\/api\/[A-Za-z0-9]+\.json)`\s*\|.*`(NOT_APPROVED)`\s*\|$/);
    return match ? [{ ordinal: Number(match[1]), guideId: match[2], endpoint: match[3], disposition: match[4] }] : [];
  });
  const ds005ExpectedEndpoints = ["astInhtrfEtcPtbkOpt", "dfOcr", "bsnSp", "ctrcvsBgrq", "dsRsOcr", "piicDecsn", "fricDecsn", "pifricDecsn", "crDecsn", "bnkMngtPcbg", "lwstLg", "ovLstDecsn", "ovDlstDecsn", "ovLst", "ovDlst", "cvbdIsDecsn", "bdwtIsDecsn", "exbdIsDecsn", "bnkMngtPcsp", "wdCocobdIsDecsn", "tsstkAqDecsn", "tsstkDpDecsn", "tsstkAqTrctrCnsDecsn", "tsstkAqTrctrCcDecsn", "bsnInhDecsn", "bsnTrfDecsn", "tgastInhDecsn", "tgastTrfDecsn", "otcprStkInvscrInhDecsn", "otcprStkInvscrTrfDecsn", "stkrtbdInhDecsn", "stkrtbdTrfDecsn", "cmpMgDecsn", "cmpDvDecsn", "cmpDvmgDecsn", "stkExtrDecsn"].map((endpoint) => `/api/${endpoint}.json`);
  const ds005Endpoints = ds005Rows.map((row) => row.endpoint);
  const ds005FieldExamples = ["fric_nstk_asstd", "fric_nstk_dlprd", "fric_nstk_lstprd", "fric_bddd", "exrqpd_bgd", "exrqpd_edd", "sbd", "pymd", "inh_prd", "extrsc_extrctrd", "extrsc_shddstd", "extrsc_shclspd_bgd", "extrsc_extrop_rcpd_bgd", "field-level spot check", "전체 schema inventory나 fixture 승인은 아님"];
  const missingDs005FieldExamples = ds005FieldExamples.filter((field) => !ds005Catalog.includes(field));
  const ds005RowMismatch = ds005Rows.some((row, index) => row.ordinal !== index + 1 || row.guideId !== ds005ExpectedGuideIds[index] || row.endpoint !== ds005ExpectedEndpoints[index]);
  if (missingDs005GuideIds.length || unexpectedDs005GuideIds.length || ds005GuideIds.length !== 36 || new Set(ds005GuideIds).size !== 36 || ds005Rows.length !== 36 || new Set(ds005Endpoints).size !== 36 || ds005RowMismatch || missingDs005FieldExamples.length || !ds005Catalog.includes("국내 보통주 원장 처리") || !ds005Catalog.includes("자회사/비상장 당사자")) {
    console.error(`OpenDART DS005 category inventory must contain all 36 ordered guide-ID/endpoint mappings with pending dispositions: ${[...missingDs005GuideIds, ...unexpectedDs005GuideIds, ...missingDs005FieldExamples, ...(ds005GuideIds.length !== 36 ? [`found ${ds005GuideIds.length} guide IDs`] : []), ...(ds005Rows.length !== 36 ? [`found ${ds005Rows.length} complete catalog rows`] : []), ...(new Set(ds005Endpoints).size !== ds005Endpoints.length ? ["duplicate JSON endpoint"] : []), ...(ds005RowMismatch ? ["guide ID/ordinal/endpoint mapping mismatch"] : [])].join(", ")}`);
    process.exit(1);
  }
  const formFixtureIdsRequired = ["KR-FORM-01-DIVIDEND-REVISION", "KR-FORM-02-SHAREHOLDER-MEETING", "KR-FORM-03-CONTRACT-CORRECTION", "KR-FORM-04-LISTING-RISK-ASSESSMENT"];
  const formFixtureIds = [...formFixtureContract.matchAll(/`(KR-FORM-\d{2}-[A-Z-]+)`/g)].map((match) => match[1]);
  const formFixtureReceiptsRequired = ["20261030901347", "20261030801331", "20261030901396", "20261030901431", "20260910900287", "20260930900523", "20261030901408"];
  const formFixtureRequired = ["SOURCE_METADATA_RESOLVED_BODY_FIXTURE_INCOMPLETE", "viewer `dcmNo`", "rights decision ID/hash/action", "taxonomy release 금지", "taxonomy approval count 0", "정확한 page/section/table/cell locator", "한 번의 non-snapshot metadata pass", "UNREPRODUCIBLE_OBSERVATION", "viewer shell/JS를 locator API처럼 호출·파싱하지 말고", "증거 mode는 `ORIGINAL_BODY` 또는 `STRUCTURED_API_FIELD`", "`STRUCTURED_API_FIELD`는 아래 구조화 API 절", "STRUCTURED_FIXTURE_INCOMPLETE"];
  const filingContract = section("### 공시와 원문", "### 보통주 적격성 및 회사 귀속");
  const officialFilingRequired = ["OpenDART 공식 `list.json` 계약", "`DATE_ONLY`", "페이지 열거 성공은 source snapshot 완전성이나 사실 정확성 증명이 아니다", "OpenDART 약관상 공시정보의 정확성·완전성은 제출인 책임"];
  const documentLifecycle = section("#### 문서·분석 lifecycle 및 상태 분리 계약", "- 수집기, parser");
  const documentLifecycleRequired = ["SourceRightsDecision", "Document fetch attempt", "Document revision integrity", "Parse/extraction attempt", "Analysis attempt/revision", "Human review decision", "Publication state", "입력 hash·권리·instrument/cap assertion·taxonomy version", "filing dossier"];
  const documentLifecycleFixtureIds = Array.from({ length: 10 }, (_, index) => `DOC-LC-${String(index + 1).padStart(2, "0")}`);
  const analysis = section("#### 공시 분석·요약 계약", "#### 국내 일정 taxonomy 적용표");
  const analysisRetentionRequired = ["payloadDisposition", "TRANSIENT_ONLY", "NOT_RETAINED", "summary-use authorization", "exact channel/action", "canonical analysis payload", "projection"];
  const missingAnalysisRetention = analysisRetentionRequired.filter((value) => !analysis.includes(value));
  if (missingAnalysisRetention.length) {
    console.error(`Korean disclosure analysis retention/publication contract incomplete: ${missingAnalysisRetention.join(", ")}`);
    process.exit(1);
  }
  const dateValueAcceptance = section("#### 일정 값 타입 수용 기준", "Date kind 어휘는");
  const apiContract = section("## API·사용자 화면 경계", "## 저장·보존·정합성");
  const cursorSecurityRequired = ["opaque token", "HMAC-SHA-256", "KR-DISCLOSURE-PUBLIC-CURSOR-v1", "constant-time compare", "canonical `queryHash`", "cross-endpoint/filter replay", "key rotation", "compromise"];
  const missingCursorSecurity = cursorSecurityRequired.filter((value) => !apiContract.includes(value));
  const unresolvedDefects = section("### 현재 결함/미결 사항", "아래 결정표는 참고 목록이 아니라");
  const unresolvedDefectIds = [...unresolvedDefects.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));
  const unresolvedDefectRequired = ["v2.26", "v2.29", "v2.30", "v2.31", "v2.32", "v2.33", "v2.34", "v2.35", "v2.36", "v2.37", "v2.38", "v2.39", "v2.40", "v2.41", "v2.42", "v2.43", "v2.44", "v2.45", "v2.46", "v2.47", "v2.48", "v2.49", "v2.50", "v2.51", "v2.93", "v2.94", "v2.95", "1~46번", "documentRevisions", "source lineage", "dependency fingerprint", "targetRevisionId", "targetContentHash", "dependencyFingerprintHash", "outputHash", "RFC 8785", "requestAsOf", "purpose", "channel", "effectiveFrom", "certaintyBasisClaimIds", "normalizedValue", "payloadDisposition", "TRANSIENT_ONLY/NOT_RETAINED", "summary-use authorization gate", "structured major-information API field inventory"];
  const missingUnresolvedDefects = unresolvedDefectRequired.filter((value) => !unresolvedDefects.includes(value));
  if (missingCursorSecurity.length || unresolvedDefectIds.length !== 46 || new Set(unresolvedDefectIds).size !== 46 || unresolvedDefectIds.some((id, index) => id !== index + 1) || missingUnresolvedDefects.length || !unresolvedDefects.includes("v2.51")) {
    console.error(`Korean disclosure cursor/analysis/source contract incomplete: ${[...missingCursorSecurity, ...(unresolvedDefectIds.length !== 46 ? ["defect list must contain IDs 1..46 exactly once"] : []), ...missingUnresolvedDefects, ...(!unresolvedDefects.includes("v2.51") ? ["v2.51 audit-domain decision ownership completeness and residual must be recorded"] : [])].join(", ")}`);
    process.exit(1);
  }
  const impactContract = section("근거 영향은", "### 원문·파생 데이터 보존 계층");
  const sourceCoverageReadContract = section("공개 GET은 PostgreSQL read-only `REPEATABLE READ` transaction", "Impact item은");
  const impactAcceptance = section("#### Evidence impact acceptance matrix", "### 원문·파생 데이터 보존 계층");
  const consumerContract = section("#### Consumer-kind key contract 및 legacy 경계", "근거 영향은");
  const existingRouteBoundary = section("### 기존 route/import 경계 및 cutover 분류", "## 핵심 개념과 권위 경계");
  const existingRouteBoundaryRequired = ["GET /api/public/market-impact-events", "LEGACY_COMPATIBILITY", "LEGACY_IMPORTER_BLOCKED_FOR_KR_V2", "UNAPPROVED_LEGACY_INPUT", "LEGACY_UNMAPPED", "KR-LEGACY-CUTOVER-01", "새 KR route", "기존 공개 endpoint의 인증을 임의 추가하지 않는다", "database grants", "canonical set hash", "UNKNOWN_EXTERNAL", "old writer를 fence", "rollback은 old writer 재활성이 아니라", "DB catalog와 owner inventory", "전체 consumer closure", "UNCLASSIFIED"];
  const missingExistingRouteBoundary = existingRouteBoundaryRequired.filter((value) => !existingRouteBoundary.includes(value));
  const legacyPathAudit = section("#### Repository-bounded event path audit v1", "`LEGACY_COMPATIBILITY`는");
  const legacyPathAuditRows = [...legacyPathAudit.matchAll(/^\| `([A-Z0-9_]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((match) => ({ id: match[1], facts: match[2].trim(), domains: match[3].trim(), disposition: match[4].trim() }));
  const legacyPathAuditIds = ["LEGACY_SHARED_EVENT_WRITER", "LEGACY_PUBLIC_EVENT_READ", "DART_ALERT_SCHEDULE", "LEGACY_CALENDAR_SCHEMA_ONLY", "KR_V2_CANONICAL_SURFACE_ABSENT", "REPOSITORY_EXTERNAL_SURFACE_UNKNOWN"];
  const sourceRoots = ["app", "lib", "scripts", "netlify", ".github", "db/migration"];
  const sourceInventory = sourceRoots.flatMap((path) => collectSourceFiles(join(root, path)))
    .filter((path) => /\.(?:mjs|cjs|js|ts|tsx|sql|sh|yml|yaml)$/.test(path) && !/\.(?:test|spec)\./.test(path) && path.replaceAll("\\", "/") !== join(root, "scripts", "check-docs.mjs").replaceAll("\\", "/"))
    .map((path) => ({ path: path.slice(root.length + 1).replaceAll("\\", "/"), source: readFileSync(path, "utf8") }));
  const marketImpactLiteralPaths = sourceInventory.filter(({ source }) => /\bmarket_impact_events\b/.test(source)).map(({ path }) => path).sort();
  const marketImpactLiteralExpected = ["app/api/public/market-impact-event-occurrences/route.ts", "app/api/public/market-impact-events/route.ts", "db/migration/V163__market_impact_events.sql", "db/migration/V164__market_impact_event_identity.sql", "db/migration/V165__market_impact_event_query_order.sql", "lib/schema-health.ts", "scripts/import-market-impact-events.mjs"].sort();
  const calendarLiteralPaths = sourceInventory.filter(({ source }) => /\binvestment_calendar_events\b/.test(source)).map(({ path }) => path).sort();
  const calendarLiteralExpected = ["db/migration/V130__investment_calendar_events.sql", "db/migration/V151__ensure_investment_calendar_events.sql"].sort();
  const pathSource = (path) => sourceInventory.find((entry) => entry.path === path)?.source ?? "";
  const sharedEventImporterSource = pathSource("scripts/import-market-impact-events.mjs");
  const publicEventRouteSource = pathSource("app/api/public/market-impact-events/route.ts");
  const filingSyncSource = pathSource("lib/filing-sync.ts");
  const dartAutomationSource = pathSource("lib/dart-automation.ts");
  const pushDeliverySource = pathSource("lib/push.ts");
  const dartAutomationStoreSource = pathSource("lib/dart-automation-store.ts");
  const netlifyFilingScheduleSource = pathSource("netlify/functions/sync-filings.ts");
  const apiFilingScheduleSource = pathSource("app/api/cron/sync-filings/route.ts");
  const currentV2EventRoutes = sourceInventory.some(({ path }) => /^app\/api\/disclosure-events(?:\/|$)/.test(path));
  const currentV2EventMigrations = sourceInventory.some(({ source }) => /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+disclosure_events\b/i.test(source));
  const legacyPathSourceFactsValid = sharedEventImporterSource.includes("payload.markets.KR") && sharedEventImporterSource.includes("payload.markets.US") && sharedEventImporterSource.includes("INSERT INTO market_impact_events") && sharedEventImporterSource.includes("ON CONFLICT (event_id) DO UPDATE") && publicEventRouteSource.includes("FROM market_impact_events") && !publicEventRouteSource.includes("instrument_type") && !publicEventRouteSource.includes("disclosure_event_publication_state") && filingSyncSource.includes("runDartAutomation") && dartAutomationSource.includes("fetchOpenDartToday") && dartAutomationSource.includes("claimDartAutomation") && dartAutomationSource.includes("Promise.allSettled") && dartAutomationSource.includes('"PROVIDER_ACCEPTED"') && pushDeliverySource.includes('deviceDelivery: "UNOBSERVED"') && pushDeliverySource.includes("providerAccepted") && pushDeliverySource.includes("skippedByPreference") && dartAutomationStoreSource.includes("CREATE TABLE IF NOT EXISTS dart_automation_events") && !dartAutomationStoreSource.includes("market_impact_events") && !dartAutomationStoreSource.includes("disclosure_events") && netlifyFilingScheduleSource.includes('schedule("* * * * *"') && netlifyFilingScheduleSource.includes("runFilingSync") && apiFilingScheduleSource.includes("isCronRequestAuthorized") && apiFilingScheduleSource.includes("runFilingSync");
  const legacyPathAuditInvalid = legacyPathAuditRows.length !== legacyPathAuditIds.length || !isDeepStrictEqual(legacyPathAuditRows.map(({ id }) => id), legacyPathAuditIds) || !legacyPathSourceFactsValid || !isDeepStrictEqual(marketImpactLiteralPaths, marketImpactLiteralExpected) || !isDeepStrictEqual(calendarLiteralPaths, calendarLiteralExpected) || currentV2EventRoutes || currentV2EventMigrations || !legacyPathAudit.includes("DB catalog·동적 SQL·배포된 artifact·외부 caller") || !legacyPathAudit.includes("runtime kill switch") || !legacyPathAudit.includes("UNKNOWN_EXTERNAL");
  const legacyPathAuditFailures = [
    ...(legacyPathAuditRows.length !== legacyPathAuditIds.length || !isDeepStrictEqual(legacyPathAuditRows.map(({ id }) => id), legacyPathAuditIds) ? ["document surface rows"] : []),
    ...(!legacyPathSourceFactsValid ? ["observed source behavior"] : []),
    ...(!isDeepStrictEqual(marketImpactLiteralPaths, marketImpactLiteralExpected) ? [`market_impact_events refs: ${marketImpactLiteralPaths.join(",")}`] : []),
    ...(!isDeepStrictEqual(calendarLiteralPaths, calendarLiteralExpected) ? [`investment_calendar_events refs: ${calendarLiteralPaths.join(",")}`] : []),
    ...(currentV2EventRoutes ? ["unexpected KR v2 route"] : []),
    ...(currentV2EventMigrations ? ["unexpected KR v2 migration"] : []),
    ...(!legacyPathAudit.includes("DB catalog·동적 SQL·배포된 artifact·외부 caller") ? ["audit boundary"] : []),
    ...(!legacyPathAudit.includes("runtime kill switch") ? ["legacy disable caveat"] : []),
    ...(!legacyPathAudit.includes("UNKNOWN_EXTERNAL") ? ["external surface caveat"] : []),
  ];
  const cursorDecisionRow = [...decisionAudit.matchAll(/^\| cursor key\/snapshot security \|([^\n]+)\|$/gm)];
  const cursorDecisionAuditRequired = ["KR-CURSOR-SECURITY-01", "tamper", "replay", "expiry", "pagination"];
  const missingCursorDecisionAudit = cursorDecisionAuditRequired.filter((value) => !cursorDecisionRow.some((row) => row[1].includes(value)));
  const decisionAuditOwnerRequired = ["event attribution", "API·UI snapshot consistency", "장애·보안·개인정보", "end-to-end shadow acceptance"];
  const missingSpecificDecisionOwners = decisionAuditOwnerRequired.flatMap((domain) => {
    const rows = decisionAuditRows.filter((row) => row.domain === domain);
    const ids = rows.length === 1 ? decisionIds.filter((id) => rows[0].body.includes(id)) : [];
    return rows.length !== 1 ? [`${domain} must have exactly one dedicated decision ID`] : ids.length !== 0 ? [`${domain} has an unrelated decision ID`] : [];
  });
  if (missingExistingRouteBoundary.length || legacyPathAuditInvalid || cursorDecisionRow.length !== 1 || missingCursorDecisionAudit.length || missingSpecificDecisionOwners.length) {
    console.error(`Korean disclosure legacy route/cursor audit contract incomplete: ${[...missingExistingRouteBoundary, ...legacyPathAuditFailures, ...(cursorDecisionRow.length !== 1 ? ["cursor security must have one dedicated audit domain"] : []), ...missingCursorDecisionAudit, ...missingSpecificDecisionOwners].join(", ")}`);
    process.exit(1);
  }
  const dependencyContract = section("#### Review 및 공개 dependency fingerprint", "### Shadow/운영 acceptance 제안");
  const conditionalDependencyActivationContract = section("#### Conditional dependency activation v1", "Dependency graph는");
  const publicationManifestContract = architecture.slice(architecture.indexOf("`PUBLICATION_TARGET`은 한 개"), architecture.indexOf("Dependency graph는"));
  const approvalKindSchemaSection = section("##### Approval-kind dependency schema v1", "Dependency graph는");
  const approvalKindSchemaRows = [...approvalKindSchemaSection.matchAll(/^\| `([A-Z_]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((match) => ({
    kind: match[1],
    required: [...match[2].matchAll(/`([A-Z_]+)`/g)].map((value) => value[1]),
    conditional: [...match[3].matchAll(/`([A-Z_]+)`/g)].map((value) => value[1]),
    allowed: [...match[4].matchAll(/`([A-Z_]+)`/g)].map((value) => value[1]),
  }));
  const approvalKindSchemaMismatch = approvalKindSchemaRows.length !== Object.keys(approvalKindSchema).length || new Set(approvalKindSchemaRows.map(({ kind }) => kind)).size !== approvalKindSchemaRows.length || approvalKindSchemaRows.some(({ kind, required, conditional, allowed }) => !approvalKindSchema[kind] || !isDeepStrictEqual(required, approvalKindSchema[kind].required) || !isDeepStrictEqual(conditional, approvalKindSchema[kind].conditional) || !isDeepStrictEqual(allowed, allowedDependencyKinds[kind]) || new Set(allowed).size !== allowed.length);
  const conditionalDependencyPredicates = [
    ["ANALYSIS", "PARSE_REVISION", "source body/attachment를 parser 또는 extractor로 처리한 input이 하나 이상 있음"],
    ["ANALYSIS", "EVIDENCE_SET", "분석 revision 안에 evidence edge가 하나 이상 있음"],
    ["ANALYSIS", "EVENT_TAXONOMY", "분석이 event/date taxonomy token을 추출하거나 해석에 사용함"],
    ["EVENT", "EVENT_DATES", "target event revision에 date assertion이 하나 이상 있음"],
    ["EVENT", "EVENT_PARTIES", "target event revision에 party relation이 하나 이상 있음"],
    ["EVENT", "EVENT_SUBJECTS", "target event revision에 instrument subject가 하나 이상 있음"],
    ["EVENT", "CLAIM", "event type/status/방향 또는 서술 본문이 analysis claim에 의존함"],
    ["EVENT", "EVIDENCE_SET", "target event claim 중 evidence edge가 하나 이상 있음"],
    ["EVENT", "RIGHTS_DECISION", "event output이 action-scoped 권리판정 대상 source/derivative에 의존함"],
    ["EVENT", "SOURCE_DISPOSITION", "source filing에 correction/withdrawal marker, disposition 또는 unresolved relation 관측이 있음"],
    ["DATE", "SOURCE_DISPOSITION", "date의 source filing에 correction/withdrawal marker, disposition 또는 reconciliation 판정이 있음"],
    ["SUBJECT", "SOURCE_DISPOSITION", "subject attribution 근거 filing에 correction/withdrawal marker 또는 unresolved relation이 있음"],
    ["PUBLICATION", "EVENT_DATES", "publication target projection에 date consumer가 포함됨"],
    ["PUBLICATION", "EVENT_PARTIES", "publication target projection에 party consumer가 포함됨"],
    ["PUBLICATION", "EVENT_SUBJECTS", "publication target projection에 stock subject consumer가 포함됨"],
    ["PUBLICATION", "DATE_ASSERTION", "publication target이 DATE assertion/달력 row임"],
    ["PUBLICATION", "EVENT_SUBJECT", "publication target이 특정 종목 subject projection임"],
    ["PUBLICATION", "CLAIM", "노출 summary 또는 표시값이 claim-derived임"],
    ["PUBLICATION", "EVIDENCE_SET", "published claim/date/subject가 evidence edge에 연결됨"],
    ["PUBLICATION", "ENTITY_CROSSWALK", "published subject attribution이 entity-to-instrument crosswalk를 사용함"],
    ["PUBLICATION", "INSTRUMENT_MASTER", "target에 COMMON_STOCK eligibility 판정이 적용됨"],
    ["PUBLICATION", "CAP_ASSERTION", "국내 시총 eligibility gate가 target subject에 적용됨"],
    ["PUBLICATION", "SOURCE_FILING", "public target provenance에 원천 filing이 표시/참조됨"],
    ["PUBLICATION", "SOURCE_DISPOSITION", "target source scope에 filing disposition/correction 상태가 존재함"],
    ["PUBLICATION", "RIGHTS_REMEDIATION", "exact source scope/dependency closure의 remediation case set, case revision/state, evidence revision 및 closure proof가 현재 epoch와 일치하고 적용 open case가 없음"],
  ];
  const conditionalDependencyPredicateSection = section("#### Conditional dependency activation v1", "Dependency graph는");
  const conditionalDependencyPredicateRows = [...conditionalDependencyPredicateSection.matchAll(/^\| `([A-Z_]+)` \| `([A-Z_]+)` \| ([^|]+) \|$/gm)].map((match) => [match[1], match[2], match[3].trim()]);
  const conditionalDependencyPredicateMismatch = !isDeepStrictEqual(conditionalDependencyPredicateRows, conditionalDependencyPredicates);
  const dependencyAcceptance = section("#### Approval dependency failure-injection acceptance", "- 모든 FK는 삭제 cascade보다 soft state");
  const dependencyChangeIds = ["rights terms/revision/action", "document bytes/attachment/parser/extractor", "taxonomy release", "entity crosswalk/instrument master/identifier validity", "cap source/value/freshness policy", "correction/withdrawal/disposition/source coverage", "prompt/model/schema/normalizer"];
  const dependencyFixtureRequired = ["DFP-01-RIGHTS-REVOKE", "DFP-02-DOCUMENT-REPLACE", "DFP-03-TAXONOMY-RELEASE", "DFP-04-INSTRUMENT-RECLASSIFY", "DFP-05-CAP-EXPIRY", "DFP-06-CORRECTION-NEW-SCOPE", "DFP-07-PROMPT-REPLAY-DIVERGENCE", "DFP-08-CONCURRENT-APPROVAL-EDIT", "DFP-09-INDEX-OMISSION", "DFP-10-CURSOR-TIME-BOUNDARY", "DFP-11-FINGERPRINT-CANONICAL-VECTOR", "DFP-12-APPROVAL-KIND-SCHEMA", "DFP-13-DAG-CYCLE-AND-EDGE-REWRITE", "DFP-14-SHARED-DEPENDENCY-SIBLING-ISOLATION", "DFP-15-TRAVERSAL-BOUNDARY-ESCALATION", "DFP-16-PUBLICATION-MANIFEST-SNAPSHOT-RACE"];
  const dependencyFixtureIds = [...dependencyAcceptance.matchAll(/`(DFP-\d{2}-[A-Z-]+)`/g)].map((match) => match[1]);
  const missingDependencyFixtures = dependencyFixtureRequired.filter((fixture) => !dependencyFixtureIds.includes(fixture));
  const unexpectedDependencyFixtures = dependencyFixtureIds.filter((fixture) => !dependencyFixtureRequired.includes(fixture));
  const duplicateDependencyFixtures = dependencyFixtureIds.filter((fixture, index) => dependencyFixtureIds.indexOf(fixture) !== index);
  const dependencyFixtureContractRequired = ["synthetic IDs/hash", "publication_epoch", "content/body/304 leakage를 0건", "409 CURSOR_INVALIDATED", "과거 approval row/hash는 유지", "RFC 8785 JCS", "KR-DISCLOSURE-REVIEW-DEPENDENCY-v1", "UTF-8 unsigned bytewise lexicographic", "dependencyGraphHash", "transitiveClosureHash", "cycle detection", "downstream transitive closure", "source scope 전체 suppression", "DFP-15-TRAVERSAL-BOUNDARY-ESCALATION", "DFP-16-PUBLICATION-MANIFEST-SNAPSHOT-RACE"];
  const dependencyContractAndAcceptance = `${dependencyContract}\n${dependencyAcceptance}`;
  const missingDependencyFixtureContract = dependencyFixtureContractRequired.filter((value) => !dependencyContractAndAcceptance.includes(value));
  const collectionContract = section("## 수집·분석·저장 파이프라인", "## API·사용자 화면 경계");
  const sourceScopeIdentityContract = section("Source scope identity", "Coverage run의 metadata row");
  const cutoverContract = section("### 권위 데이터 원칙", "### 공시와 원문");
  const cutoverStates = ["PRECHECK", "FROZEN_SNAPSHOT", "MAPPED", "DRY_RUN_PASSED", "SHADOW_RECONCILED", "CANARY_APPROVED", "KR_READ_SWITCHED", "ROLLBACK_WINDOW_CLOSED"];
  const failureMatrix = section("### 결정 기록 및 fail-closed defaults", "## 공식 참고 및 저장소 기준");
  const minimumFields = section("### 최소 필드와 정규화 경계", "`FactClaim` 본문/정규화 값");
  const taxonomyRequired = ["taxonomy token", "MEETING_START", "CONTRACT_SIGNED", "UNMAPPED/NEEDS_EVIDENCE", "taxonomyVersion"];
  const analysisRequired = ["분석 provenance", "`claimId`", "summary`는", "원천 filing/document revision IDs"];
  const evidenceRequired = ["`evidenceRefs`", "`disclosure_claim_evidence`", "SUPPORTS", "CONTRADICTS", "claim당 1..N", "consumer impact", "documentRevisionId", "rightsDecisionId", "SUPPORTED/CONTESTED/UNSUPPORTED/UNRESOLVED"];
  const impactTablesRequired = ["`disclosure_claim_consumer_identities`", "`disclosure_claim_consumers`", "`disclosure_claim_consumer_refs`", "`disclosure_evidence_impact_runs`", "`disclosure_evidence_impact_attempts`", "`disclosure_evidence_impact_items`", "`disclosure_publication_epochs`", "`disclosure_publication_suppression_roots`", "`disclosure_publication_suppression_root_states`", "`disclosure_publication_watermarks`", "`disclosure_publication_outbox`"];
  const documentLifecycleTablesRequired = ["`disclosure_document_fetch_attempts`", "`disclosure_document_revisions`", "`disclosure_document_validation_results`", "`disclosure_parse_attempts`", "`disclosure_analysis_attempts`", "`disclosure_analysis_revisions`", "`disclosure_review_decisions`"];
  const documentSchemaRequired = ["parser version·parse state는 별도 attempt에 둠", "reviewer/status는 저장하지 않음"];
  const documentConcepts = section("## 핵심 개념과 권위 경계", "### 권위 데이터 원칙");
  const documentRevisionDefinition = documentConcepts.match(/^6\. \*\*DocumentRevision\*\*: ([^\n]+)$/m)?.[1] ?? "";
  const parseAttemptDefinition = documentConcepts.match(/^17\. \*\*ParseAttempt\*\*: ([^\n]+)$/m)?.[1] ?? "";
  const documentRevisionSchemaRow = minimumFields.match(/^\| `disclosure_document_revisions` \|([^\n]+)$/m)?.[1] ?? "";
  const parseAttemptSchemaRow = minimumFields.match(/^\| `disclosure_parse_attempts` \|([^\n]+)$/m)?.[1] ?? "";
  const documentRevisionSchemaColumns = documentRevisionSchemaRow.split("|").map((value) => value.trim());
  const parseAttemptSchemaColumns = parseAttemptSchemaRow.split("|").map((value) => value.trim());
  const documentParseOwnershipValid = documentRevisionDefinition.includes("불변 스냅샷") && documentRevisionDefinition.includes("여기에 넣지 않는다") && parseAttemptDefinition.includes("parser/extractor") && parseAttemptDefinition.includes("불변 처리 시도") && documentRevisionSchemaColumns[1]?.includes("원문 byte identity만") && documentRevisionSchemaColumns[1]?.includes("parser version·parse state는 별도 attempt에 둠") && parseAttemptSchemaColumns[0]?.includes("parser/extractor version");
  if (!documentParseOwnershipValid) {
    console.error("DocumentRevision must own immutable bytes only; parser/extractor versions and results must belong to ParseAttempt in both conceptual and storage schemas.");
    process.exit(1);
  }
  const impactProjectionFkRequired = ["unique `(projection_commit_sha, consumer_key)`", "unique `(projection_commit_sha, consumer_key, claim_id)`", "unique `(run_id, attempt_no)` and `(attempt_id, projection_commit_sha)`", "composite FK `(run_id, projection_commit_sha)`", "attempt composite FK `(attempt_id, projection_commit_sha)`", "consumer composite FK `(projection_commit_sha, consumer_key)`"];
  const impactProtocolRequired = ["source commit/generation별 immutable projection", "idempotent impact run", "`QUEUED→RUNNING→COMPLETE|FAILED|OVERFLOW`", "`FAILED`/`OVERFLOW`/timeout", "append-only publication epoch", "current_epoch_id", "root suppression", "consumerContentHash", "lowercase hex", "NUL byte", "`consumer_key` FK", "attempt_no+1", "fencing generation", "zombie worker", "only one active attempt", "Source coverage는 이 impact/revocation protocol과 독립 pointer로 운영하되 동일 publication epoch 안에서 원자화", "scope_kind=SOURCE_SCOPE", "suppression root 및 초기 `ACTIVE` state", "Root idempotency key", "scope gate는 닫힌다", "coverage finalization", "scope watermark", "해제는 최신 COMPLETE impact attempt", "이전 generation/retry worker"];
  const cacheSafetyRequired = ["`Cache-Control: no-store`", "`stale-if-error`", "`304`", "`publicationRevocationEpoch`", "source별 `sourceCoverageFreshness`", "`sourceScopeSetHash`", "accepted assertion watermark", "coverage_generation", "dependency_generation", "409 CURSOR_INVALIDATED", "REPEATABLE READ", "같은 connection/transaction을 사용한다"];
  const impactFixtureIds = [...impactAcceptance.matchAll(/`EI-\d{2}-[A-Z-]+`/g)].map((match) => match[0]);
  const impactFixtureRequired = ["EI-01-INDEX-CARDINALITY", "EI-02-SOLE-SUPPORT", "EI-03-MULTI-SOURCE-CONFLICT", "EI-04-RETRY-IDEMPOTENCY", "EI-05-FAILED-OVERFLOW", "EI-06-OLD-CURSOR-304", "EI-07-CONCURRENT-TRIGGERS", "EI-08-TYPED-REFERENCE-RESOLUTION", "EI-09-COMPLETE-EMPTY-IMPACT", "EI-10-FAILED-RETRY-ATTEMPT", "EI-11-LEASE-EXPIRY-FENCING", "EI-12-RIGHTS-DESCENDANT-DENOMINATOR", "EI-13-TERMS-REVISION-REVALIDATES-SCOPED-DESCENDANTS"];
  const missingImpactFixtures = impactFixtureRequired.filter((fixture) => !impactAcceptance.includes(`\`${fixture}\``));
  const consumerContractRequired = ["SUMMARY_SEGMENT", "DATE_ASSERTION", "EVENT_PARTY", "EVENT_SUBJECT", "domain separator", "RFC 8785 JCS", "consumer_identity_key", "consumer revision key", "KR-DISCLOSURE-CONSUMER-IDENTITY-v1", "KR-DISCLOSURE-CONSUMER-REVISION-v1", "exact-object collision check", "market-impact-events.v1", "ON CONFLICT(event_id) DO UPDATE", "investment_calendar_events", "QUARANTINED", "영향 추적 불가"];
  const missingConsumerContract = consumerContractRequired.filter((value) => !consumerContract.includes(value));
  const consumerIdentityCardinalityRequired = ["identity→revision은 1:N", "transition set도 old/new revision diff", "distinct identity set", "distinct revision set", "claim-edge set"];
  const missingConsumerIdentityCardinality = consumerIdentityCardinalityRequired.filter((value) => !consumerIdentityArchitecture.includes(value));
  const dateValueRequired = ["`valueKind` tagged union", "timezone 없는 `DATE`", "`LOCAL_DATE_TIME`", "`OFFSET_DATE_TIME`", "`DATE_RANGE`", "`INCLUSIVE/EXCLUSIVE/UNKNOWN`", "midnight UTC/KST instant 변환 금지"];
  const collectionRequired = ["NON_SNAPSHOT_PAGINATION", "PAGE_ENUMERATION_COMPLETE", "VALID_EMPTY", "OBSERVED_STABLE", "SNAPSHOT_PROVEN", "status=013", "status=020", "status=800", "failureClass=QUOTA_EXCEEDED", "total_page", "distinct receipt 수"];
  const sourceFreshnessContractRequired = ["SourceCoverageAssertion", "CURRENT/STALE/UNKNOWN", "policy·run·평가 증거", "owner 승인 만료", "coverageDegraded=true", "active/upcoming", "requestAsOf", "GET에서 assertion/state를 write하지 않는다", "PostgreSQL `REPEATABLE READ`", "read-only transaction", "같은 connection/transaction을 사용한다", "consumer claims → claim evidence → document revision → filing source/scope", "양방향 cardinality/hash", "projection 전체를 억제", "distinct receipt count = latest disposition count", "receipt/disposition set digest", "NOT_EVENT_RELEVANT", "CANDIDATE_QUARANTINED", "IMPACT_LINKED_SUPPRESSED", "IMPACT_RESOLVED", "UNRESOLVED/FAILED", "COV-FRESH-01-NO-POLICY", "COV-FRESH-02-WITHIN-WINDOW", "COV-FRESH-03-SHORT-OUTAGE", "COV-FRESH-04-EXPIRED-OR-PARTIAL", "COV-FRESH-05-EMPTY-IS-NOT-RECONCILED", "COV-FRESH-06-RIGHTS-REVOKED", "COV-FRESH-07-SOURCE-ISOLATION", "COV-FRESH-08-MISSING-LINEAGE", "COV-FRESH-09-ALTERNATE-SOURCE-REVIEW", "COV-FRESH-10-UNPROCESSED-RECEIPT", "COV-FRESH-11-UNRESOLVED-CORRECTION", "COV-FRESH-12-QUARANTINED-NEW-CANDIDATE", "COV-FRESH-13-SET-DIGEST-MISMATCH", "COV-FRESH-14-FINALIZATION-ATOMICITY", "COV-FRESH-15-PAGE-CURSOR-ATTEMPT-CHANGE", "COV-FRESH-16-POLICY-REVOCATION", "COV-FRESH-17-OLD-WORKER-RECOVERY", "COV-FRESH-18-COVERAGE-COMPLETE-RIGHTS-REMEDIATION-PENDING"];
  const sourceFreshnessScenarioIds = [...collectionContract.matchAll(/`(COV-FRESH-\d{2}-[A-Z-]+)`/g)].map((match) => match[1]);
  const missingSourceFreshnessContract = sourceFreshnessContractRequired.filter((value) => !collectionContract.includes(value) && !sourceScopeIdentityContract.includes(value) && !apiContract.includes(value) && !sourceCoverageReadContract.includes(value));
  const sourceFreshnessTablesRequired = ["disclosure_source_freshness_policies", "disclosure_source_scope_filing_dispositions", "disclosure_source_coverage_assertions", "disclosure_source_coverage_watermarks", "disclosure_source_coverage_consumer_refs", "unique `(projection_commit_sha, consumer_key, source, scope_key_hash)`", "nullable current accepted assertion/policy/latest attempt run FKs", "evidence-lineage hash", "monotone coverage generation + dependency generation", "SOURCE_SCOPE/EVENT/DATE/SUBJECT", "raw key and recomputed hash must both match watermark/root"];
  const sourceScopeIdentityRequired = ["KR-DISCLOSURE-SOURCE-SCOPE-v1", "RFC8785-JCS-UTF8", "SHA256(UTF8(", "(source, scope_key)", "window_start/end"];
  const missingSourceScopeIdentity = sourceScopeIdentityRequired.filter((value) => !sourceScopeIdentityContract.includes(value));
  const missingSourceFreshnessTables = sourceFreshnessTablesRequired.filter((value) => !minimumFields.includes(value));
  const cutoverRequired = ["append-only 상태 ledger", "source commit/blob hash", "row denominator", "manifest hash", "조건부 원자 CAS", "KR input row count = manifest row count", "fence/disable", "단일 writer", "missing-row tombstone"];
  const cutoverUsIsolationRequired = ["US` 행 수/hash", "전·후 대조해 같음을 입증"];
  const missingCutoverContract = cutoverRequired.filter((value) => !cutoverContract.includes(value));
  const missingCutoverUsIsolation = cutoverUsIsolationRequired.filter((value) => !cutoverContract.includes(value));
  const missingCutoverStates = cutoverStates.filter((value) => !cutoverContract.includes(value));
  const dependencyRequired = ["ReviewDependencyFingerprint", "kr-disclosure-review-dependency.v1", "projectionCommitSHA", "projectionGeneration", "dependencyGraphHash", "transitiveClosureHash", "UTF-8 unsigned bytewise lexicographic", "NFC/NFD 정규화를 하지 않으므로 원 code point를 유지", "immutable decision envelope", "`ANALYSIS` approval", "`PUBLICATION` approval", "IEEE-754 binary64 표현 불가 숫자", "정밀 정수값이 필요하면 decimal string만 허용", "KR-DISCLOSURE-DEPENDENCY-GRAPH-v1", "KR-DISCLOSURE-DEPENDENCY-CLOSURE-v1", "synthetic projection", "전체 kind별 production schema", "실제 그래프 완전성", "닫힌 allowlist", "각 summary segment", "claim/evidence 대상이 모두 들어간다", "##### Approval-kind dependency schema v1", "SUMMARY_SEGMENT", "ANALYSIS", "EVENT", "DATE", "SUBJECT", "PUBLICATION", "conditional", "fail-closed", "PUBLICATION_TARGET", "CONSUMER_PROJECTION"];
  const publicationManifestRequired = ["모든 source scope", "PublicationManifest", "publication decision ID/fingerprint", "sourceScopeSetHash", "exact source-rights decision set/hash", "rights-remediation case set/revision/state/evidence/closure-proof digest", "비`RECONCILED` 상태", "consumerSetHash/refSetHash/count", "publicationScopeKeyHash", "tenant/market/event/target/source commit/generation/asOf", "requestAsOf", "REPEATABLE READ READ ONLY", "공개 경로에서 CAS UPDATE를 실행하지 않는다", "쓰기 transaction", "같은 commit", "HTTP 응답 전송은 DB transaction과 원자 commit할 수 없다", "Cache-Control: no-store", "ETag/304는 기본 금지", "실행형 acceptance", "전체 GET을 새 transaction과 새 `requestAsOf`로 재시작", "최대 지연 상한"];
  const missingDependencyContract = dependencyRequired.filter((value) => !dependencyContract.includes(value) && !conditionalDependencyActivationContract.includes(value)).concat(publicationManifestRequired.filter((value) => !publicationManifestContract.includes(value)));
  const publicationWriterSection = section("##### Publication mutation writer matrix v1", "Dependency graph는");
  const publicationWriterRows = [...publicationWriterSection.matchAll(/^\| `([A-Z_]+)` \| ([^|]+) \| ([^|]+) \|$/gm)].map((match) => ({ domain: match[1], atomicSet: match[2].trim(), failureMode: match[3].trim() }));
  const publicationWriterDomains = ["TARGET_EVENT_DATE_SUBJECT", "RIGHTS_SOURCE_DISPOSITION", "COVERAGE_POLICY_ASSERTION", "DEPENDENCY_CONSUMER_PROJECTION", "MASTER_CAP_ELIGIBILITY", "SUPPRESSION_IMPACT_RESOLUTION"];
  const publicationWriterRequirements = ["approval/publication pointer", "source-scope root suppression", "coverage_generation", "consumer generation/hash", "eligibility decision", "COMPLETE impact proof"];
  const publicationWriterMatrixMismatch = publicationWriterRows.length !== publicationWriterDomains.length || !isDeepStrictEqual(publicationWriterRows.map(({ domain }) => domain), publicationWriterDomains) || publicationWriterRows.some(({ atomicSet, failureMode }) => !atomicSet.includes("epoch") && !atomicSet.includes("watermark") || !failureMode.includes("억제") && !failureMode.includes("숨기") && !failureMode.includes("유지") && !failureMode.includes("금지")) || publicationWriterRequirements.some((value) => !publicationWriterSection.includes(value));
  const missingDependencyChangeIds = dependencyChangeIds.filter((value) => !dependencyContract.includes(value));
  const missingTaxonomy = taxonomyRequired.filter((value) => !taxonomy.includes(value));
  const missingFormFixtures = formFixtureIdsRequired.filter((id) => !formFixtureIds.includes(id));
  const invalidFormFixtures = formFixtureIds.filter((id) => !formFixtureIdsRequired.includes(id));
  const missingFormFixtureReceipts = formFixtureReceiptsRequired.filter((receipt) => !formFixtureContract.includes(receipt));
  const missingFormFixtureContract = formFixtureRequired.filter((value) => value === "STRUCTURED_FIXTURE_INCOMPLETE" ? !architecture.includes(value) : !formFixtureContract.includes(value));
  const missingOfficialFiling = officialFilingRequired.filter((value) => !filingContract.includes(value));
  const missingDocumentLifecycle = documentLifecycleRequired.filter((value) => !documentLifecycle.includes(value));
  const missingDocumentLifecycleFixtures = documentLifecycleFixtureIds.filter((id) => !documentLifecycle.includes(`\`${id}\``));
  const missingAnalysis = analysisRequired.filter((value) => !analysis.includes(value));
  const missingEvidence = evidenceRequired.filter((value) => !analysis.includes(value) && !minimumFields.includes(value));
  const missingImpactTables = impactTablesRequired.filter((value) => !minimumFields.includes(value));
  const missingDocumentLifecycleTables = documentLifecycleTablesRequired.filter((value) => !minimumFields.includes(value));
  const missingDocumentSchema = documentSchemaRequired.filter((value) => !minimumFields.includes(value));
  const missingImpactProjectionFk = impactProjectionFkRequired.filter((value) => !minimumFields.includes(value));
  const missingImpactProtocol = impactProtocolRequired.filter((value) => !impactContract.includes(value) && !consumerContract.includes(value));
  const missingCacheSafety = cacheSafetyRequired.filter((value) => !apiContract.includes(value) && !sourceCoverageReadContract.includes(value));
  const missingDateValue = dateValueRequired.filter((value) => !taxonomy.includes(value));
  const missingCollection = collectionRequired.filter((value) => !collectionContract.includes(value));
  if (missingTaxonomy.length || missingFormFixtures.length || invalidFormFixtures.length || formFixtureIds.length !== new Set(formFixtureIds).size || missingFormFixtureReceipts.length || missingFormFixtureContract.length || missingOfficialFiling.length || missingDocumentLifecycle.length || missingDocumentLifecycleFixtures.length || missingDocumentLifecycleTables.length || missingDocumentSchema.length || missingAnalysis.length || missingEvidence.length || missingImpactTables.length || missingImpactProjectionFk.length || missingImpactProtocol.length || missingCacheSafety.length || missingImpactFixtures.length || missingConsumerContract.length || missingConsumerIdentityCardinality.length || missingDependencyContract.length || publicationWriterMatrixMismatch || approvalKindSchemaMismatch || conditionalDependencyPredicateMismatch || missingDependencyChangeIds.length || missingDependencyFixtures.length || unexpectedDependencyFixtures.length || duplicateDependencyFixtures.length || missingDependencyFixtureContract.length || impactFixtureIds.length !== new Set(impactFixtureIds).size || missingSourceFreshnessContract.length || missingSourceFreshnessTables.length || missingSourceScopeIdentity.length || missingCutoverContract.length || missingCutoverUsIsolation.length || missingCutoverStates.length || sourceFreshnessScenarioIds.length !== 18 || new Set(sourceFreshnessScenarioIds).size !== 18 || !apiContract.includes("`sourceCoverageFreshness`") || dateValueRequired.some((value) => !taxonomy.includes(value)) || !dateValueAcceptance.includes("월/분기 표현") || !dateValueAcceptance.includes("inclusive/exclusive semantics") || !apiContract.includes("`displayTimezone`") || !minimumFields.includes("`value_kind`")) {
    console.error(`Korean disclosure analysis/date/evidence/impact contract incomplete: ${[...missingTaxonomy, ...missingFormFixtures, ...invalidFormFixtures, ...missingFormFixtureReceipts, ...missingFormFixtureContract, ...missingOfficialFiling, ...missingDocumentLifecycle, ...missingDocumentLifecycleFixtures, ...missingDocumentLifecycleTables, ...missingDocumentSchema, ...missingAnalysis, ...missingEvidence, ...missingImpactTables, ...missingImpactProjectionFk, ...missingImpactProtocol, ...missingCacheSafety, ...missingImpactFixtures, ...missingConsumerContract, ...missingConsumerIdentityCardinality, ...missingDependencyContract, ...(publicationWriterMatrixMismatch ? ["publication mutation writer matrix is incomplete or out of order"] : []), ...(approvalKindSchemaMismatch ? ["approval-kind dependency matrix differs from validator allowlist"] : []), ...(conditionalDependencyPredicateMismatch ? ["conditional dependency predicate matrix differs from validator contract"] : []), ...missingDependencyChangeIds, ...missingDependencyFixtures, ...unexpectedDependencyFixtures, ...duplicateDependencyFixtures, ...missingDependencyFixtureContract, ...missingSourceFreshnessContract, ...missingSourceFreshnessTables, ...missingSourceScopeIdentity, ...missingCutoverContract, ...missingCutoverUsIsolation, ...missingCutoverStates, ...(sourceFreshnessScenarioIds.length !== 18 || new Set(sourceFreshnessScenarioIds).size !== 18 ? ["source freshness acceptance requires eighteen unique scenario IDs"] : []), ...(impactFixtureIds.length !== new Set(impactFixtureIds).size ? ["duplicate impact fixture ID"] : []), ...dateValueRequired.filter((value) => !taxonomy.includes(value))].join(", ")}`);
    process.exit(1);
  }
  if (missingCollection.length || !apiContract.includes("enumerationStatus") || !apiContract.includes("failureClass") || !apiContract.includes("stabilityObservation") || !failureMatrix.includes("status=020/010/011/012/100/101/800")) {
    console.error(`Korean disclosure collection coverage contract incomplete: ${[...missingCollection, ...(!apiContract.includes("enumerationStatus") ? ["API enumerationStatus"] : []), ...(!apiContract.includes("failureClass") ? ["API failureClass"] : []), ...(!apiContract.includes("stabilityObservation") ? ["API stabilityObservation"] : []), ...(!failureMatrix.includes("status=020/010/011/012/100/101/800") ? ["DART API status-code failure matrix"] : [])].join(", ")}`);
    process.exit(1);
  }
  console.log(`Korean disclosure architecture OK (${conceptual.length} aligned schema tables; rights matrix ${rightsScenarioRows} scenarios; analysis/date/reference/publication/decision/legacy gates present).`);
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

const schemaHealthSource = readFileSync(join(root, "lib", "schema-health.ts"), "utf8");
const rateLimitWriterSource = readFileSync(join(root, "lib", "kis-rate-limit-event.ts"), "utf8");
const dbRetentionSource = readFileSync(join(root, "app", "api", "cron", "db-retention", "route.ts"), "utf8");
const rateLimitRequiredColumnsBlock = schemaHealthSource.match(/export const KIS_RATE_LIMIT_EVENT_REQUIRED_COLUMNS\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? "";
const rateLimitRequiredColumns = new Set([...rateLimitRequiredColumnsBlock.matchAll(/\[\s*["']kis_rate_limit_events["']\s*,\s*["']([a-z_][a-z0-9_]*)["']\s*\]/gi)].map((match) => match[1].toLowerCase()));
const rateLimitWriterColumnsBlock = rateLimitWriterSource.match(/INSERT\s+INTO\s+kis_rate_limit_events\s*\(([^)]+)\)/i)?.[1] ?? "";
const rateLimitWriterColumns = rateLimitWriterColumnsBlock.split(",").map((column) => column.trim().replaceAll('"', "").toLowerCase()).filter(Boolean);
const missingRateLimitConsumerColumns = [
  ...rateLimitWriterColumns.filter((column) => !rateLimitRequiredColumns.has(column)).map((column) => `writer.${column}`),
  ...(!rateLimitRequiredColumns.has("occurred_at") || !dbRetentionSource.includes('batchedDelete("kis_rate_limit_events", "occurred_at <') ? ["retention.occurred_at"] : []),
];
if (!rateLimitWriterColumnsBlock || missingRateLimitConsumerColumns.length) {
  console.error(`KIS rate-limit schema consumer audit failed; consumer SQL could not be parsed or required columns are missing: ${missingRateLimitConsumerColumns.join(", ") || "writer shape"}.`);
  process.exit(1);
}
const extractSqlLiterals = (source) => [...source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .matchAll(/"((?:\\.|[^"\\])*)"/g)]
  .map((match) => match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
const hasBaseTableInventoryQuery = (source) => extractSqlLiterals(source).some((sql) =>
  /information_schema\.tables/i.test(sql)
  && /table_schema\s*=\s*'public'/i.test(sql)
  && /table_type\s*=\s*'base table'/i.test(sql));
const hasViewInventoryQuery = (source) => extractSqlLiterals(source).some((sql) =>
  /information_schema\.tables/i.test(sql)
  && /table_schema\s*=\s*'public'/i.test(sql)
  && /table_type\s*=\s*'view'/i.test(sql));
const hasBaseTableColumnQuery = (source) => extractSqlLiterals(source).some((sql) =>
  /information_schema\.columns/i.test(sql)
  && (/exists\s*\(\s*select 1 from information_schema\.tables as relation\s+where relation\.table_schema\s*=\s*available\.table_schema\s+and relation\.table_name\s*=\s*available\.table_name\s+and relation\.table_type\s*=\s*'base table'\s*\)/i.test(sql)
    || /join information_schema\.tables as relation\s+on relation\.table_schema\s*=\s*'public'\s+and relation\.table_type\s*=\s*'base table'\s+and relation\.table_name\s*=\s*required\.table_name/i.test(sql)));
const requiredBaseTableInventories = [["lib/schema-health.ts", schemaHealthSource]];
const missingBaseTableInventories = requiredBaseTableInventories.filter(([, source]) => !hasBaseTableInventoryQuery(source)).map(([file]) => file);
const missingBaseTableColumnScopes = requiredBaseTableInventories.filter(([, source]) => !hasBaseTableColumnQuery(source)).map(([file]) => file);
const missingColumnTableAbsenceFilters = [
  ...(!schemaHealthSource.includes("REQUIRED_OPERATIONAL_COLUMNS.filter(([table]) => checkedTables.includes(table))") ? ["lib/schema-health.ts"] : []),
];
const missingViewInventories = requiredBaseTableInventories.filter(([, source]) => !hasViewInventoryQuery(source)).map(([file]) => file);
if (missingBaseTableInventories.length || missingBaseTableColumnScopes.length || missingColumnTableAbsenceFilters.length || missingViewInventories.length) {
  console.error(`Operational relation-type audit failed; BASE TABLE inventory missing in [${missingBaseTableInventories.join(", ")}], VIEW inventory missing in [${missingViewInventories.join(", ")}], required-column BASE TABLE scope missing in [${missingBaseTableColumnScopes.join(", ")}], missing-table column-noise filters absent in [${missingColumnTableAbsenceFilters.join(", ")}]`);
  process.exit(1);
}
const healthSummarySource = readFileSync(join(root, "lib", "health-check.ts"), "utf8");
const healthPageSource = readFileSync(join(root, "app", "health-check", "page.tsx"), "utf8");
const deploymentChecklistSource = readFileSync(join(root, "docs", "operations", "deployment-checklist.md"), "utf8");
const operationalIndexHealthComplete = schemaHealthSource.includes("KIS_RATE_LIMIT_EVENT_COLUMN_SHAPES")
  && schemaHealthSource.includes("getOperationalColumnShapeIssues")
  && schemaHealthSource.includes("operationalColumnShapeIssues.length === 0")
  && healthSummarySource.includes("operationalColumnShapeIssues: schema.operationalColumnShapeIssues")
  && healthPageSource.includes("database.operationalColumnShapeIssues")
  && schemaHealthSource.includes("buildOperationalPrimaryKeyIntegrityQuery()")
  && schemaHealthSource.includes("pg_constraint AS primary_key_constraint")
  && schemaHealthSource.includes("unnest(primary_key_constraint.conkey) WITH ORDINALITY")
  && schemaHealthSource.includes("primary_key_definition.key_column_count IS DISTINCT FROM 1")
  && schemaHealthSource.includes("MAX(key_attribute.attname) FILTER (WHERE key_column.ordinal_position = 1)")
  && schemaHealthSource.includes("operationalPrimaryKeyIssues.length === 0")
  && healthSummarySource.includes("operationalPrimaryKeyIssues: schema.operationalPrimaryKeyIssues")
  && healthPageSource.includes("database.operationalPrimaryKeyIssues")
  && schemaHealthSource.includes("pg_index")
  && schemaHealthSource.includes("indisvalid")
  && schemaHealthSource.includes("indisready")
  && schemaHealthSource.includes("indislive")
  && schemaHealthSource.includes("operationalIndexIssues.length === 0")
  && schemaHealthSource.includes("expected_table_exists IS DISTINCT FROM TRUE")
  && schemaHealthSource.includes("LEFT JOIN pg_namespace expected_namespace")
  && schemaHealthSource.includes("table_missing")
  && schemaHealthSource.includes("buildOperationalIndexIntegrityQuery()")
  && healthSummarySource.includes("operationalIndexIssues: schema.operationalIndexIssues")
  && schemaHealthSource.includes("pg_get_indexdef(index_relation.oid, indexed_column.ordinal::int, false)")
  && schemaHealthSource.includes("index_integrity.access_method IS DISTINCT FROM 'btree'")
  && schemaHealthSource.includes("index_integrity.is_unique IS DISTINCT FROM FALSE")
  && schemaHealthSource.includes("index_integrity.is_exclusion IS DISTINCT FROM FALSE")
  && schemaHealthSource.includes("index_integrity.has_predicate IS DISTINCT FROM FALSE")
  && schemaHealthSource.includes("index_integrity.has_expressions IS DISTINCT FROM FALSE")
  && schemaHealthSource.includes("index_integrity.key_attribute_count IS DISTINCT FROM index_integrity.attribute_count")
  && schemaHealthSource.includes("index_integrity.actual_table_name IS DISTINCT FROM index_integrity.table_name")
  && schemaHealthSource.includes("index_integrity.actual_columns")
  && schemaHealthSource.includes("index_integrity.expected_columns")
  && schemaHealthSource.includes("indisexclusion")
  && healthPageSource.includes("database.operationalIndexIssues")
  && healthPageSource.includes("운영 인덱스 검증 불가: 대상 테이블이 없습니다.")
  && deploymentChecklistSource.includes("operationalIndexIssues")
  && deploymentChecklistSource.includes("operationalColumnShapeIssues")
  && deploymentChecklistSource.includes("operationalPrimaryKeyIssues");
if (!operationalIndexHealthComplete) {
  console.error("Operational index runtime health audit failed; catalog validity, diagnostics, summary, or health UI check is missing.");
  process.exit(1);
}
const missingOperationalColumnTables = findMissingOperationalColumnTables(schemaHealthSource);
if (missingOperationalColumnTables.length) {
  console.error(`Operational schema audit failed; required-column relations are absent from OPERATIONAL_SCHEMA_TABLES: ${missingOperationalColumnTables.join(", ")}`);
  process.exit(1);
}
const migrationSources = migrations.map((fileName) => ({
  fileName,
  contents: readFileSync(join(migrationDir, fileName), "utf8"),
}));
const rateLimitForwardMigration = migrationSources.find(({ fileName }) => /^V172__/i.test(fileName))?.contents ?? "";
const rateLimitTableDdl = rateLimitForwardMigration.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+kis_rate_limit_events\s*\(([\s\S]*?)\)\s*;/i)?.[1] ?? "";
const rateLimitIdPrimaryKeyDeclared = /^\s*id\s+bigserial\s+primary\s+key\b/im.test(rateLimitTableDdl);
const rateLimitShapeContract = schemaHealthSource.match(/export const KIS_RATE_LIMIT_EVENT_COLUMN_SHAPES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? "";
const rateLimitDdlColumnShapes = new Map([...rateLimitTableDdl.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+([a-z]+(?:\s+with\s+time\s+zone)?)\b([^,\n]*)/gim)].map((match) => {
  const rawType = match[2].toLowerCase();
  const type = rawType === "timestamptz" ? "timestamp with time zone" : rawType === "bigserial" ? "bigint" : rawType === "serial" ? "integer" : rawType === "smallserial" ? "smallint" : rawType;
  return [match[1].toLowerCase(), { type, nullable: /\b(?:NOT\s+NULL|PRIMARY\s+KEY)\b/i.test(match[3]) || /\b(?:bigserial|serial|smallserial)\b/i.test(match[2]) ? "NO" : "YES", hasDefault: /\bDEFAULT\b/i.test(match[3]) || /\b(?:bigserial|serial|smallserial)\b/i.test(match[2]) }];
}));
const rateLimitContractShapes = [...rateLimitShapeContract.matchAll(/\[\s*["']([a-z_][a-z0-9_]*)["']\s*,\s*["']([^"']+)["']\s*,\s*["'](YES|NO)["']\s*,\s*(true|false)\s*\]/gi)];
const rateLimitShapeContractDrift = rateLimitContractShapes.flatMap((match) => {
  const [, column, type, nullable, requiresDefault] = match;
  const ddl = rateLimitDdlColumnShapes.get(column.toLowerCase());
  return !ddl || ddl.type !== type.toLowerCase() || ddl.nullable !== nullable.toUpperCase() || (requiresDefault.toLowerCase() === "true" && !ddl.hasDefault)
    ? [`kis_rate_limit_events.${column}`]
    : [];
});
if (!rateLimitTableDdl || !rateLimitIdPrimaryKeyDeclared || rateLimitContractShapes.length !== 26 || rateLimitShapeContractDrift.length) {
  console.error(`KIS rate-limit migration shape audit failed; expected V172 table DDL and matching 26-column runtime contract, drift: ${rateLimitShapeContractDrift.join(", ") || "contract or migration parse incomplete"}.`);
  process.exit(1);
}
let missingOperationalMigrations;
try {
  missingOperationalMigrations = findMissingOperationalRelations(schemaHealthSource, migrationSources);
} catch (error) {
  console.error(`Operational schema migration audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
if (missingOperationalMigrations.length) {
  console.error(`Operational schema migration audit failed; required table/view relations are absent, dropped, or have the wrong type after the migration history: ${missingOperationalMigrations.join(", ")}`);
  process.exit(1);
}
// Production had successfully advanced through V157 while two required
// translation columns were only defined in older V137/V140 files. Keep a
// forward-edge repair for every readiness column so out-of-order-ignore
// deployments cannot report a false-green schema.
const missingForwardColumns = findMissingForwardOperationalColumns(schemaHealthSource, migrationSources, 157);
if (missingForwardColumns.length) {
  console.error(`Forward operational column migration audit failed after V157: ${missingForwardColumns.join(", ")}`);
  process.exit(1);
}
const missingForwardTables = findMissingForwardOperationalTables(schemaHealthSource, migrationSources, 157);
if (missingForwardTables.length) {
  console.error(`Forward operational table migration audit failed after V157: ${missingForwardTables.join(", ")}`);
  process.exit(1);
}
const intradayTurnoverForwardMigration = migrationSources.find(({ fileName }) => /^V171__/i.test(fileName))?.contents ?? "";
const intradayTurnoverCreateTable = intradayTurnoverForwardMigration.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+intraday_turnover_observations\s*\(([\s\S]*?)\)\s*;/i)?.[1] ?? "";
const intradayTurnoverForwardColumns = new Set([
  ...[...intradayTurnoverCreateTable.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gim)].map((match) => match[1].toLowerCase()),
  ...[...intradayTurnoverForwardMigration.matchAll(/ALTER\s+TABLE\s+intraday_turnover_observations\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1].toLowerCase()),
]);
const requiredIntradayTurnoverColumns = [
  "market", "code", "session_date", "bucket_at", "observed_at", "currency", "price", "volume",
  "source_trading_value", "minute_trading_value", "minute_trading_value_source", "market_cap",
  "market_cap_observed_at", "market_cap_fetched_at", "rolling_trading_value", "turnover_ratio", "source", "source_payload",
];
const missingIntradayTurnoverForwardColumns = requiredIntradayTurnoverColumns.filter((column) => !intradayTurnoverForwardColumns.has(column));
if (!intradayTurnoverCreateTable || missingIntradayTurnoverForwardColumns.length) {
  console.error(`Intraday turnover forward-migration audit failed; V171 must recover a missing V138 table before adding its timestamp fields: ${missingIntradayTurnoverForwardColumns.join(", ") || "table DDL missing"}.`);
  process.exit(1);
}
const rssRetentionMigrations = ["173", "176"].map((version) => migrationSources.find(({ fileName }) => new RegExp(`^V${version}__`, "i").test(fileName)) ?? { fileName: "", contents: "" });
const rssRetentionIndexCounts = rssRetentionMigrations.map(({ contents }) => [...contents.matchAll(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+[a-z_][a-z0-9_]*/gi)].length);
const rssRetentionUsesConcurrentBuilds = rssRetentionMigrations.some(({ contents }) => /CREATE\s+INDEX\s+CONCURRENTLY\b/i.test(contents));
const rssRetentionHasNonTransactionalConfig = migrations
  .filter((fileName) => /^V(?:173|176)__.*\.sql$/i.test(fileName))
  .some((fileName) => existsSync(join(migrationDir, fileName.replace(/\.sql$/i, ".sql.conf"))));
const kisRateLimitRepair = migrationSources.find(({ fileName }) => /^V178__/i.test(fileName))?.contents ?? "";
const kisRateLimitRepairHasNonTransactionalConfig = migrations
  .filter((fileName) => /^V178__.*\.sql$/i.test(fileName))
  .some((fileName) => existsSync(join(migrationDir, fileName.replace(/\.sql$/i, ".sql.conf"))));
const activationScriptSource = readFileSync(join(root, "deploy/oci/stockman-activate"), "utf8");
const maintenanceWindowStarts = activationScriptSource.indexOf('stage="quiesce-services"');
const migrationStageStarts = activationScriptSource.indexOf('stage="flyway-migrate"');
const preflightScriptSource = readFileSync(join(root, "scripts/oci-flyway-v168-preflight.mjs"), "utf8");
if (rssRetentionMigrations.some((migration) => !migration)
  || rssRetentionIndexCounts[0] !== 2
  || rssRetentionIndexCounts[1] !== 4
  || rssRetentionUsesConcurrentBuilds
  || rssRetentionHasNonTransactionalConfig
  || !kisRateLimitRepair
  || (kisRateLimitRepair.match(/DROP INDEX IF EXISTS/g) ?? []).length !== 3
  || (kisRateLimitRepair.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length !== 3
  || /INDEX CONCURRENTLY/i.test(kisRateLimitRepair)
  || kisRateLimitRepairHasNonTransactionalConfig
  || maintenanceWindowStarts < 0
  || migrationStageStarts <= maintenanceWindowStarts
  || !activationScriptSource.includes("V173__market_rss_72h_retention_indexes.sql")
  || !activationScriptSource.includes("V176__market_rss_query_order_indexes.sql")
  || !preflightScriptSource.includes('new Set(["168", "170", "173", "176", "178"])')
  || !preflightScriptSource.includes("DROP INDEX ${concurrent}IF EXISTS")) {
  console.error("RSS forward-index migration audit failed; V173/V176 must use the quiesced maintenance window, and OCI preflight must inspect/repair known partial indexes.");
  process.exit(1);
}
const missingForwardIndexes = findMissingForwardOperationalIndexes(schemaHealthSource, migrationSources, 157);
if (missingForwardIndexes.length) {
  console.error(`Forward operational index migration audit failed after V157: ${missingForwardIndexes.join(", ")}`);
  process.exit(1);
}
const flywayAuditCliSource = readFileSync(join(root, "scripts/audit-flyway-history.ts"), "utf8");
const missingFlywayAuditFailureGates = ["FLYWAY_HISTORY_DRIFT", "PENDING_CONCURRENT_INDEX_TRANSACTION_CONFIG_MISSING", "PENDING_CONCURRENT_INDEX_EXPLICIT_TRANSACTION_BLOCK", "PENDING_MIGRATION_INDEX_TARGET_MISSING", "PENDING_MIGRATION_INDEX_TARGET_SCHEMA_UNVERIFIED", "PENDING_MIGRATION_INDEX_SCHEMA_UNVERIFIED", "PENDING_MIGRATION_INDEX_TARGET_CREATOR_OLDER_UNAPPLIED", "PENDING_MIGRATION_INDEX_TARGET_DROPPED_BY_SOURCE_HISTORY", "PENDING_MIGRATION_RELATION_SCHEMA_UNVERIFIED", "PENDING_MIGRATION_RELATION_CASCADE_DEPENDENCIES_UNVERIFIED", "PENDING_MIGRATION_RELATION_REFERENCED_BY_FOREIGN_KEY", "PENDING_MIGRATION_COLUMN_REFERENCED_BY_FOREIGN_KEY", "PENDING_MIGRATION_SCHEMA_DROP_UNVERIFIED", "PENDING_MIGRATION_PUBLIC_SCHEMA_RENAME_UNVERIFIED", "PENDING_MIGRATION_TYPE_CASCADE_UNVERIFIED", "PENDING_MIGRATION_DOMAIN_CASCADE_UNVERIFIED", "PENDING_MIGRATION_DROP_OWNED_UNVERIFIED", "PENDING_MIGRATION_ALTER_OBJECT_SCHEMA_UNVERIFIED", "PENDING_MIGRATION_ALTER_DROP_DEPENDENCIES_UNVERIFIED", "PENDING_MIGRATION_ALTER_UNIQUE_KEY_UNVERIFIED", "PENDING_MIGRATION_UNMODELED_ALTER_UNIQUE_KEY", "PENDING_MIGRATION_INDEX_COLUMN_MISSING", "PENDING_MIGRATION_INDEX_NAME_CONFLICT", "PENDING_MIGRATION_INDEX_OWNED_BY_CONSTRAINT", "PENDING_MIGRATION_INDEX_REFERENCED_BY_FOREIGN_KEY", "PENDING_MIGRATION_UNIQUE_CONSTRAINT_REFERENCED_BY_FOREIGN_KEY", "PENDING_MIGRATION_INDEX_CASCADE_UNVERIFIED", "PENDING_MIGRATION_CONCURRENT_INDEX_DROP_MULTIPLE_TARGETS", "PENDING_MIGRATION_CONCURRENT_INDEX_DROP_CASCADE_UNSUPPORTED", "PENDING_MIGRATION_CONCURRENT_INDEX_DROP_PARTITIONED_TABLE_UNSUPPORTED", "PENDING_MIGRATION_INDEX_DEFINITION_UNVERIFIED", "PENDING_MIGRATION_ALTER_TARGET_MISSING", "PENDING_MIGRATION_ALTER_OBJECT_STATE_CONFLICT", "PENDING_MIGRATION_ALTER_OBJECT_STATE_UNVERIFIED", "PENDING_MIGRATION_CREATE_TABLE_RELATION_KIND_MISMATCH", "PENDING_MIGRATION_CREATE_TABLE_DEFINITION_UNVERIFIED", "PENDING_MIGRATION_CREATE_TABLE_COLUMNS_MISSING", "PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_MISMATCH", "PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_UNVERIFIED", "PENDING_MIGRATION_CREATE_TABLE_FOREIGN_KEY_MISSING", "PENDING_MIGRATION_FOREIGN_KEY_TARGET_MISSING", "PENDING_MIGRATION_FOREIGN_KEY_TARGET_UNVERIFIED", "INVALID_CATALOG_INDEX_STATE", "OPERATIONAL_SCHEMA_NOT_READY", "failureReasons.length > 0"]
  .filter((required) => !flywayAuditCliSource.includes(required));
if (missingFlywayAuditFailureGates.length) {
  console.error(`Local Flyway audit must fail for history drift and operational schema readiness failures: ${missingFlywayAuditFailureGates.join(", ")}`);
  process.exit(1);
}
const flywayHistoryAuditLogic = readFileSync(join(root, "lib/flyway-history-audit.ts"), "utf8");
const flywaySplitErrorDoc = readFileSync(join(root, "docs/ERROR_HANDLING.md"), "utf8");
if (!flywayHistoryAuditLogic.includes("export function auditUniverseSplitPreconditions")
  || !flywayHistoryAuditLogic.includes("postMigrationShapePresent")
  || !flywayHistoryAuditLogic.includes("structuralPreconditionsPass")
  || !flywayHistoryAuditLogic.includes("this does not verify migration history")
  || !flywayAuditCliSource.includes("splitMigrationPreflight: splitPreflight")
  || !flywaySplitErrorDoc.includes("postMigrationShapePresent")
  || !flywaySplitErrorDoc.includes("history, row 내용, 필터 결과, 제약조건, 손실 위험은 증명되지 않는다.")) {
  console.error("Flyway split preflight, CLI output, and error-handling documentation must preserve observed-shape versus execution state and evidence limits.");
  process.exit(1);
}
if (!flywayHistoryAuditLogic.includes("drift: pending.length > 0 || failed.length > 0")) {
  console.error("Flyway history drift must exclude older unapplied candidates; their effects are assessed by schema/catalog audits.");
  process.exit(1);
}
if (!flywayHistoryAuditLogic.includes("classifyFlywayMigrationState")
  || !flywayHistoryAuditLogic.includes('"OLDER_UNAPPLIED"')
  || !flywayHistoryAuditLogic.includes('"PENDING"')
  || !flywayHistoryAuditLogic.includes('"APPLIED_WITH_FAILED_ATTEMPTS"')
  || !flywayAuditCliSource.includes("classifyFlywayMigrationState(version, history.rows, report.pending, report.olderUnapplied)")
  || !flywayAuditCliSource.includes("historyRows,")) {
  console.error("Local Flyway audit must use the shared state classifier and preserve all version history rows in relevant evidence.");
  process.exit(1);
}
if (!flywayHistoryAuditLogic.includes("calculateFlywaySqlChecksum")
  || !flywayHistoryAuditLogic.includes("auditAppliedFlywayMigrationValidation")
  || !flywayHistoryAuditLogic.includes("APPLIED_MIGRATION_NOT_RESOLVED")
  || !flywayHistoryAuditLogic.includes("DUPLICATE_SOURCE_MIGRATION_VERSION")
  || !flywayHistoryAuditLogic.includes("APPLIED_MIGRATION_TYPE_UNSUPPORTED")
  || !flywayHistoryAuditLogic.includes('row.type?.toUpperCase() === "BASELINE"')
  || !flywayHistoryAuditLogic.includes("DESCRIPTION_MISMATCH")
  || !flywayHistoryAuditLogic.includes("TYPE_MISMATCH")
  || !flywayHistoryAuditLogic.includes("CHECKSUM_MISSING")
  || !flywayHistoryAuditLogic.includes("CHECKSUM_MISMATCH")
  || !flywayHistoryAuditLogic.includes("checkedAppliedMigrationCount: checkedAppliedVersions.size")
  || !flywayHistoryAuditLogic.includes("checkedAppliedVersions = new Set")
  || !flywayAuditCliSource.includes("description, type, checksum")
  || !flywayAuditCliSource.includes("FLYWAY_VALIDATION_DRIFT")
  || !flywayAuditCliSource.includes("migrationValidation")
  || !flywayAuditCliSource.includes("drift: report.drift || !migrationValidation.ok")) {
  console.error("Local Flyway audit must compare applied SQL migration descriptions, types, and CRC32 checksums with source and fail on validation drift.");
  process.exit(1);
}
if (!flywayAuditCliSource.includes("ddlInventoryScope")
  || !flywayAuditCliSource.includes("ddlInventoryMismatchMigrationStates")
  || !flywayAuditCliSource.includes("ddlInventoryMismatchVersions")
  || !flywayAuditCliSource.includes("pendingIndexTargetIssues")
  || !flywayAuditCliSource.includes("pendingRelationCascadeUnverified")
  || !flywayAuditCliSource.includes("pendingSchemaDropUnverified")
  || !flywayAuditCliSource.includes("pendingPublicSchemaRenameUnverified")
  || !flywayAuditCliSource.includes("pendingTypeCascadeDropUnverified")
  || !flywayAuditCliSource.includes("pendingDomainCascadeDropUnverified")
  || !flywayAuditCliSource.includes("pendingDropOwnedUnverified")
  || !flywayAuditCliSource.includes("pendingRelationSchemaUnverified")
  || !flywayAuditCliSource.includes("pendingAlterObjectSchemaUnverified")
  || !flywayAuditCliSource.includes("pendingAlterDropDependenciesUnverified")
  || !flywayAuditCliSource.includes('effect.operation === "absent" && alreadyExists')
  || !flywayAuditCliSource.includes("effect.operation === \"present\" && effect.uniqueKey && !alreadyExists")
  || !flywayAuditCliSource.includes("pendingAlterUniqueKeyUnverified")
  || !flywayAuditCliSource.includes("pendingUnmodeledAlterUniqueKeys")
  || !flywayAuditCliSource.includes("pendingIndexTargetSchemaUnverified")
  || !flywayAuditCliSource.includes('effect.tableSchemaName !== "public"')
  || !flywayAuditCliSource.includes("pendingIndexTargetsDroppedBySourceHistory")
  || !flywayAuditCliSource.includes("auditFlywayIndexTargetsAgainstSourceHistory(migrationSql)")
  || !flywayAuditCliSource.includes("pendingIndexTargetCreatorOlderUnappliedIssues")
  || !flywayAuditCliSource.includes("findFlywayRelationCreationSourceBeforeVersion(migrationSql, targetTable, migration.version)")
  || !flywayHistoryAuditLogic.includes("export function auditFlywayIndexTargetsAgainstSourceHistory")
  || !flywayHistoryAuditLogic.includes("export function findFlywayRelationCreationSourceBeforeVersion")
  || !flywayHistoryAuditLogic.includes('effect.schemaName !== "public"')
  || !flywayHistoryAuditLogic.includes('effect.tableSchemaName !== "public"')
  || !flywayHistoryAuditLogic.includes("dropColumn: true")
  || !flywayHistoryAuditLogic.includes("uniqueKeyUnverified: true")
  || !flywayHistoryAuditLogic.includes("export function findFlywayUnmodeledAlterUniqueKeyEffects")
  || !flywayHistoryAuditLogic.includes("const dropTablePattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("splitSqlIdentifierList(match[1])")
  || !flywayHistoryAuditLogic.includes('hasTopLevelSqlKeyword(remainder, "CASCADE")')
  || !flywayHistoryAuditLogic.includes("dropCascade: true")
  || !flywayHistoryAuditLogic.includes("export function findFlywaySchemaDropEffects")
  || !flywayHistoryAuditLogic.includes("export function findFlywaySchemaRenameEffects")
  || !flywayHistoryAuditLogic.includes("export function findFlywayTypeCascadeDropEffects")
  || !flywayHistoryAuditLogic.includes("export function findFlywayDomainCascadeDropEffects")
  || !flywayHistoryAuditLogic.includes("export function findFlywayDropOwnedEffects")
  || !flywayHistoryAuditLogic.includes("createMaterializedViewPattern")
  || !flywayHistoryAuditLogic.includes("dropMaterializedViewPattern")
  || !flywayHistoryAuditLogic.includes("setTableSchemaPattern")
  || !flywayHistoryAuditLogic.includes("movedToSchema")
  || !flywayHistoryAuditLogic.includes("movedFromSchema")
  || !flywayAuditCliSource.includes('kind === "m"')
  || !flywayAuditCliSource.includes("availableIndexableRelations.has(targetTable)")
  || !flywayAuditCliSource.includes("pendingIndexColumnIssues")
  || !flywayAuditCliSource.includes("pendingIndexColumnUnverified")
  || !flywayAuditCliSource.includes("pendingIndexNameConflicts")
  || !flywayAuditCliSource.includes("pendingIndexNameUnverified")
  || !flywayAuditCliSource.includes("PENDING_MIGRATION_INDEX_NAME_UNVERIFIED")
  || !flywayAuditCliSource.includes("pendingPartitionedIndexOnlyUnverified")
  || !flywayAuditCliSource.includes("PENDING_PARTITIONED_INDEX_ONLY_UNVERIFIED")
  || !flywayAuditCliSource.includes("pendingIndexDefinitionUnverified")
  || !flywayHistoryAuditLogic.includes("indexNullsNotDistinct: true")
  || !flywayHistoryAuditLogic.includes("export function isFlywayIndexDefinitionVerified")
  || !flywayHistoryAuditLogic.includes("includeColumns: string[] | null")
  || !flywayHistoryAuditLogic.includes("function hasTopLevelSqlKeyword")
  || !flywayHistoryAuditLogic.includes('"storage_parameters"')
  || !flywayHistoryAuditLogic.includes('"tablespace"')
  || !flywayHistoryAuditLogic.includes("ON\\s+(?:ONLY\\s+)?(${sqlQualifiedIdentifier})")
  || !flywayAuditCliSource.includes("isFlywayIndexDefinitionVerified({")
  || !flywayAuditCliSource.includes("catalogIncludeColumns: existingIndex.include_columns")
  || !flywayAuditCliSource.includes("catalogPredicateExpression: existingIndex.predicate_expression")
  || !flywayAuditCliSource.includes("pg_get_expr(index_row.indpred, index_row.indrelid, false)")
  || !flywayAuditCliSource.includes("sourcePredicateExpression: effect.indexPredicateExpression ?? null")
  || !flywayAuditCliSource.includes("sourceUnverifiedOptions: effect.indexUnverifiedOptions ?? []")
  || !flywayAuditCliSource.includes("catalogNullsNotDistinct")
  || !flywayAuditCliSource.includes("pendingAlterTargetIssues")
  || !flywayAuditCliSource.includes("pendingAlterEffectCount")
  || !flywayAuditCliSource.includes("pendingAlterEffects")
  || !flywayAuditCliSource.includes("pendingAlterObjectStateIssues")
  || !flywayAuditCliSource.includes("pendingAlterObjectStateUnverified")
  || !flywayAuditCliSource.includes("ALTER TABLE ADD/DROP/RENAME COLUMN statements")
  || !flywayAuditCliSource.includes("ALTER TABLE table/column/constraint renames, column/constraint add/drop, ALTER ADD CONSTRAINT foreign-key targets, and referenced-object presence for ALTER COLUMN, ALTER CONSTRAINT, and VALIDATE CONSTRAINT actions")
  || !flywayAuditCliSource.includes("ALTER TABLE foreign key source columns are unavailable")
  || !flywayHistoryAuditLogic.includes("foreignKeyTarget: {")
  || !flywayHistoryAuditLogic.includes("export function matchesFlywayForeignKeyTargetKey")
  || !flywayAuditCliSource.includes("matchesFlywayForeignKeyTargetKey(resolvedTargetColumns, key.columns)")
  || !flywayHistoryAuditLogic.includes("targetSchema: referenceTargetParts.length > 1")
  || !flywayAuditCliSource.includes("CREATE TABLE foreign key references schema")
  || !flywayAuditCliSource.includes("ALTER TABLE foreign key references schema")
  || !flywayAuditCliSource.includes("tableIfExists: effect.tableIfExists ?? false")
  || !flywayAuditCliSource.includes("if (!effect.tableIfExists)")
  || !flywayAuditCliSource.includes("skippedRelationRenames")
  || !flywayAuditCliSource.includes("pendingRelationRenameIssues")
  || !flywayHistoryAuditLogic.includes("renamedToRelation")
  || !flywayHistoryAuditLogic.includes("renamedFromRelation")
  || !flywayAuditCliSource.includes("effect.requiresExistingColumn ? \"verify\" : effect.operation")
  || !flywayAuditCliSource.includes("effect.requiresExistingConstraint ? \"verify\" : effect.operation")
  || !flywayAuditCliSource.includes("sourceConstraintNamesByTable")
  || !flywayAuditCliSource.includes("availableConstraintNames.add(`${effect.name}.${constraintName}`)")
  || !flywayHistoryAuditLogic.includes("const alterColumnPattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("const validateConstraintPattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("const renameConstraintPattern = new RegExp")
  || !flywayAuditCliSource.includes("pendingCreateTableRelationKindIssues")
  || !flywayAuditCliSource.includes("pendingCreateTableDefinitionUnverified")
  || !flywayAuditCliSource.includes("sourceLikeByTable")
  || !flywayAuditCliSource.includes("parseFlywayCreateTableSpecialDefinitions")
  || !flywayHistoryAuditLogic.includes("PARTITIONED_TABLE")
  || !flywayHistoryAuditLogic.includes("INHERITS")
  || !flywayHistoryAuditLogic.includes("SELECT_INTO")
  || !flywayHistoryAuditLogic.includes("findSelectIntoTargets")
  || !flywayHistoryAuditLogic.includes("function isSqlIdentifierContinuationAt")
  || !flywayHistoryAuditLogic.includes("function splitSqlIdentifierList")
  || !flywayHistoryAuditLogic.includes("function findKeywordParenthesizedClause")
  || !flywayHistoryAuditLogic.includes("export function extractFlywayCheckExpression")
  || !flywayHistoryAuditLogic.includes("export function normalizeFlywayIdentifier")
  || !flywayAuditCliSource.includes("pendingCreateTableColumnIssues")
  || !flywayAuditCliSource.includes("pendingCreateTableColumnUnverified")
  || !flywayAuditCliSource.includes("pendingCreateTableForeignKeyIssues")
  || !flywayAuditCliSource.includes("pendingCreateTableConstraintIssues")
  || !flywayAuditCliSource.includes("pendingCreateTableConstraintUnverified")
  || !flywayAuditCliSource.includes("PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_MISMATCH")
  || !flywayAuditCliSource.includes("PENDING_MIGRATION_CREATE_TABLE_CONSTRAINT_UNVERIFIED")
  || !flywayAuditCliSource.includes("pg_get_constraintdef(constraint_row.oid, false)")
  || !flywayAuditCliSource.includes("extractFlywayCheckExpression(constraint.constraint_definition)")
  || !flywayAuditCliSource.includes("indnullsnotdistinct")
  || !flywayAuditCliSource.includes("indnkeyatts")
  || !flywayAuditCliSource.includes("included_columns")
  || !flywayAuditCliSource.includes("connoinherit")
  || !flywayAuditCliSource.includes("unsupportedConstraints")
  || !flywayHistoryAuditLogic.includes("normalizeFlywayCheckExpression")
  || !flywayHistoryAuditLogic.includes("compareFlywayCheckExpressions")
  || !flywayAuditCliSource.includes("confmatchtype")
  || !flywayAuditCliSource.includes("confdeltype")
  || !flywayAuditCliSource.includes("confupdtype")
  || !flywayHistoryAuditLogic.includes("initiallyDeferred")
  || !flywayHistoryAuditLogic.includes("matchType")
  || !flywayHistoryAuditLogic.includes("onDelete")
  || !flywayHistoryAuditLogic.includes("onUpdate")
  || !flywayAuditCliSource.includes("pendingForeignKeyTargetIssues")
  || !flywayAuditCliSource.includes("pendingForeignKeyTargetUnverified")
  || !flywayAuditCliSource.includes("pendingForeignKeyTargets")
  || !flywayAuditCliSource.includes("invalidCatalogIndexes")
  || !flywayAuditCliSource.includes("catalogIndexParentByName")
  || !flywayAuditCliSource.includes("pendingConcurrentIndexConfigIssues")
  || !flywayAuditCliSource.includes("hasExplicitNonTransactionalFlywayScriptConfig")
  || !flywayAuditCliSource.includes("parseFlywayCreateTableColumns")
  || !flywayAuditCliSource.includes("pendingIndexTargetNote")
  || !flywayAuditCliSource.includes("availablePhysicalRelations")
  || !flywayAuditCliSource.includes("parseFlywayDdlEffects")
  || !flywayAuditCliSource.includes("parseFlywayMigrationFiles")
  || !flywayAuditCliSource.includes("ddlMismatchStateCounts")
  || !flywayHistoryAuditLogic.includes("inline CREATE TABLE constraints are not inventoried")
  || !flywayHistoryAuditLogic.includes("full column/constraint/index definitions")
  || !flywayHistoryAuditLogic.includes("skippedParentAbsentObjectCount")
  || !flywayHistoryAuditLogic.includes("parentRelation?.operation !== \"absent\"")
  || !flywayHistoryAuditLogic.includes('parentRelation.relationType === "view"')
  || !flywayHistoryAuditLogic.includes("dataOperationNote")
  || !flywayHistoryAuditLogic.includes("outside dollar-quoted DO blocks are heuristic candidates only")
  || !flywayHistoryAuditLogic.includes("function maskSqlCommentsAndLiterals")
  || !flywayHistoryAuditLogic.includes("maskSqlCommentsAndLiterals(migration.sql)")) {
  console.error("Local Flyway DDL inventory must disclose inline-constraint, full-definition, and DML-candidate limits.");
  process.exit(1);
}
if (!flywayHistoryAuditLogic.includes("const alterActionPattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("function isTopLevelSqlPosition")
  || !flywayHistoryAuditLogic.includes("if (!isTopLevelSqlPosition(body, match.index!)) continue;")
  || !flywayHistoryAuditLogic.includes("const sqlUnquotedIdentifier = String.raw`[_\\p{L}]")
  || !flywayHistoryAuditLogic.includes("function decodeUnicodeIdentifierBody")
  || !flywayHistoryAuditLogic.includes("function decodeUnicodeEscapedIdentifierTokens")
  || !flywayHistoryAuditLogic.includes("let unicodeEscapeIdentifierEnd: number | null = null;")
  || !flywayHistoryAuditLogic.includes("source.slice(unicodeEscapeIdentifierEnd, index)")
  || !flywayHistoryAuditLogic.includes("const sqlQuotedIdentifier = String.raw`(?:U&")
  || !flywayHistoryAuditLogic.includes("UESCAPE\\s*$/i" )
  || !flywayHistoryAuditLogic.includes("const sqlQualifiedIdentifier = String.raw`${sqlIdentifier}(?:\\s*\\.\\s*${sqlIdentifier})*`")
  || !flywayHistoryAuditLogic.includes('else if (!quoted && /\\s/.test(character))')
  || !flywayHistoryAuditLogic.includes("const sqlIdentifierBoundary = String.raw`(?<![\\p{L}\\p{N}\\p{M}_$])`")
  || !flywayHistoryAuditLogic.includes("const sqlIdentifierEnd = String.raw`(?![\\p{L}\\p{N}\\p{M}_$])`")
  || !flywayHistoryAuditLogic.includes("const sqlKeywordPattern =")
  || !flywayHistoryAuditLogic.includes("const renameTablePattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("conditionalSourceRelation")
  || !flywayHistoryAuditLogic.includes("const renameColumnPattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("const createIndexPattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("const createSequencePattern = new RegExp")
  || !flywayHistoryAuditLogic.includes("const dataOperationPattern = new RegExp")
  || !flywayHistoryAuditLogic.includes('operation: action.startsWith("ADD") ? "present" : "absent"')
  || !flywayHistoryAuditLogic.includes("orderedEffects.sort((left, right) => left.order - right.order)")) {
  console.error("Flyway SQL inventory must preserve Unicode identifiers and source action order across DDL and DML targets.");
  process.exit(1);
}
const operationalTableCount = parseOperationalSchemaTables(schemaHealthSource).length;
const operationalViewCount = parseOperationalSchemaViews(schemaHealthSource).length;
const catalogCheck = spawnSync(process.execPath, ["docs/api/document-catalog.mjs", "check"], { cwd: root, encoding: "utf8" });
if (catalogCheck.status !== 0) {
  if (catalogCheck.stdout) process.stdout.write(catalogCheck.stdout);
  if (catalogCheck.stderr) process.stderr.write(catalogCheck.stderr);
  console.error("Document catalog audit failed.");
  process.exit(catalogCheck.status ?? 1);
}
console.log(`Documentation OK (${required.length} entry points); migrations OK (${versions.length} files, latest V${versions.at(-1) ?? 0}); operational tables and views present after migration history (${operationalTableCount} tables, ${operationalViewCount} views).`);
