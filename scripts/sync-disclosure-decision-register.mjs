import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseJsonRejectingDuplicateKeys, renderDecisionEvidenceLedger, validateDecisionLedger } from "./disclosure-decision-ledger.mjs";

const root = process.cwd();
const registerPath = resolve(root, "docs/fixtures/disclosure/decision-register.v0.json");
const architecturePath = resolve(root, "docs/architecture/kr-disclosure-event-architecture.md");
const lifecyclePath = resolve(root, "docs/fixtures/disclosure/decision-register-lifecycle.v0.json");
const evidenceLedgerPath = resolve(root, "docs/fixtures/disclosure/decision-evidence-ledger.v0.json");
const mode = process.argv[2] ?? "check";
const startMarker = "<!-- disclosure-decision-register:start -->";
const endMarker = "<!-- disclosure-decision-register:end -->";
const evidenceStartMarker = "<!-- decision-evidence-ledger:start -->";
const evidenceEndMarker = "<!-- decision-evidence-ledger:end -->";
const statuses = ["OPEN", "EVIDENCE_READY", "APPROVED", "CLOSED", "REJECTED", "EXPIRED"];

function assertRegister(register) {
  if (register?.contractVersion !== "disclosure-decision-register.v0"
    || register?.classification !== "DESIGN_REGISTER_BASELINE_NOT_OPERATIONAL_APPROVAL"
    || register?.dataPolicy?.containsOperationalDecisionEvidence !== false
    || register?.dataPolicy?.containsRealOwnerOrReviewer !== false
    || register?.dataPolicy?.containsCredentials !== false
    || register?.dataPolicy?.identitiesAreSynthetic !== true
    || JSON.stringify(register?.statusVocabulary) !== JSON.stringify(statuses)
    || JSON.stringify(register?.decisionFields) !== JSON.stringify(["decisionId", "ownerRole", "scope", "defaultBehavior", "acceptanceEvidence"])
    || !Array.isArray(register?.decisions)
    || register.decisions.length === 0) {
    throw new Error("Canonical disclosure decision register has an invalid contract or data policy.");
  }
  const ids = new Set();
  for (const decision of register.decisions) {
    if (!/^KR-[A-Z-]+-\d{2}$/.test(decision?.decisionId ?? "") || ids.has(decision.decisionId)) throw new Error(`Invalid or duplicate decision ID: ${decision?.decisionId}`);
    ids.add(decision.decisionId);
    for (const field of ["ownerRole", "scope", "defaultBehavior", "acceptanceEvidence"]) {
      if (typeof decision[field] !== "string" || decision[field].trim() === "" || decision[field].includes("|")) throw new Error(`${decision.decisionId}: invalid ${field}`);
    }
  }
}

function renderTable(register, currentStatus) {
  const rows = register.decisions.map(({ decisionId, ownerRole, scope, defaultBehavior, acceptanceEvidence }) =>
    `| \`${decisionId}\` | ${ownerRole} | ${scope} | ${defaultBehavior} | ${acceptanceEvidence} | \`${currentStatus.get(decisionId) ?? "OPEN"}\` |`);
  return ["| Decision ID | 소유 역할 | 결정할 값 | 소유자 결정 전 기본 동작 | 승인 증거 | 상태 |", "|---|---|---|---|---|---|", ...rows].join("\n");
}

function replaceMarkedBlock(source, startMarkerValue, endMarkerValue, content) {
  const start = source.indexOf(startMarkerValue);
  const end = source.indexOf(endMarkerValue);
  if (start < 0 || end <= start) throw new Error(`Missing or invalid marker pair: ${startMarkerValue}`);
  const contentStart = start + startMarkerValue.length;
  const current = source.slice(contentStart, end).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  return { current, updated: `${source.slice(0, contentStart)}\n${content}\n${source.slice(end)}` };
}

const register = parseJsonRejectingDuplicateKeys(await readFile(registerPath, "utf8"));
assertRegister(register);
const lifecycle = parseJsonRejectingDuplicateKeys(await readFile(lifecyclePath, "utf8"));
const evidenceLedger = parseJsonRejectingDuplicateKeys(await readFile(evidenceLedgerPath, "utf8"));
const ledgerValidation = validateDecisionLedger(register, lifecycle, evidenceLedger);
if (ledgerValidation.errors.length) throw new Error(`Decision evidence ledger invalid:\n${ledgerValidation.errors.join("\n")}`);
const table = renderTable(register, ledgerValidation.currentStatus);
const evidenceTable = renderDecisionEvidenceLedger(evidenceLedger);
const architecture = await readFile(architecturePath, "utf8");
const decisionBlock = replaceMarkedBlock(architecture, startMarker, endMarker, table);
const evidenceBlock = replaceMarkedBlock(decisionBlock.updated, evidenceStartMarker, evidenceEndMarker, evidenceTable);
const expectedArchitecture = evidenceBlock.updated;
const expectedBaseline = register.decisions.map(({ decisionId }) => ({ decisionId, currentStatus: ledgerValidation.currentStatus.get(decisionId) ?? "OPEN" }));
const expectedLifecycle = `${JSON.stringify({ ...lifecycle, registerBaseline: expectedBaseline }, null, 2)}\n`;
const currentLifecycle = await readFile(lifecyclePath, "utf8");
const lifecycleHasCanonicalBaseline = JSON.stringify(lifecycle.registerBaseline) === JSON.stringify(expectedBaseline);

if (mode === "write") {
  if (decisionBlock.current !== table || evidenceBlock.current !== evidenceTable) await writeFile(architecturePath, expectedArchitecture, "utf8");
  if (!lifecycleHasCanonicalBaseline) await writeFile(lifecyclePath, expectedLifecycle, "utf8");
  console.log(`Synchronized ${register.decisions.length} decision rows and lifecycle status baseline from ${registerPath}.`);
} else if (mode === "check") {
  if (decisionBlock.current !== table || evidenceBlock.current !== evidenceTable) throw new Error("Architecture decision/evidence ledger projections differ from their canonical sources; run node scripts/sync-disclosure-decision-register.mjs write.");
  if (!lifecycleHasCanonicalBaseline) throw new Error("Decision lifecycle baseline differs from the canonical machine-readable register; run node scripts/sync-disclosure-decision-register.mjs write.");
  console.log(`Decision register projections are current (${register.decisions.length} decisions; ${ledgerValidation.entryCount} evidence revisions).`);
} else {
  console.error("Usage: node scripts/sync-disclosure-decision-register.mjs [write|check]");
  process.exit(2);
}

