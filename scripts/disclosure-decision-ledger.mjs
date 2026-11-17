import { createHash } from "node:crypto";

const statusVocabulary = ["OPEN", "EVIDENCE_READY", "APPROVED", "CLOSED", "REJECTED", "EXPIRED"];
const ledgerHashDomain = "KR-DISCLOSURE-DECISION-LEDGER-RECORD-v1";

export function parseJsonRejectingDuplicateKeys(source) {
  let index = 0;
  const whitespace = () => { while (/[ \t\r\n]/.test(source[index] ?? "")) index += 1; };
  const string = () => {
    const start = index++;
    while (index < source.length) {
      if (source[index] === "\\") { index += 2; continue; }
      if (source[index++] === '"') return JSON.parse(source.slice(start, index));
    }
    throw new Error("unterminated JSON string");
  };
  const value = () => {
    whitespace();
    if (source[index] === "{") {
      index += 1;
      const keys = new Set();
      whitespace();
      if (source[index] === "}") { index += 1; return; }
      while (index < source.length) {
        whitespace();
        if (source[index] !== '"') throw new Error("object key must be a string");
        const key = string();
        if (keys.has(key)) throw new Error(`duplicate JSON object key: ${key}`);
        keys.add(key);
        whitespace();
        if (source[index++] !== ":") throw new Error("missing colon after JSON object key");
        value();
        whitespace();
        const delimiter = source[index++];
        if (delimiter === "}") return;
        if (delimiter !== ",") throw new Error("invalid JSON object delimiter");
      }
      throw new Error("unterminated JSON object");
    }
    if (source[index] === "[") {
      index += 1;
      whitespace();
      if (source[index] === "]") { index += 1; return; }
      while (index < source.length) {
        value();
        whitespace();
        const delimiter = source[index++];
        if (delimiter === "]") return;
        if (delimiter !== ",") throw new Error("invalid JSON array delimiter");
      }
      throw new Error("unterminated JSON array");
    }
    if (source[index] === '"') { string(); return; }
    const primitive = source.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/)?.[0];
    if (!primitive) throw new Error("invalid JSON value");
    index += primitive.length;
  };
  value();
  whitespace();
  if (index !== source.length) throw new Error("trailing data after JSON value");
  return JSON.parse(source);
}

export function jcsStringify(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Decision ledger JCS input contains an unpaired high surrogate.");
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("Decision ledger JCS input contains an unpaired low surrogate.");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Decision ledger JCS input contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => jcsStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${jcsStringify(key)}:${jcsStringify(value[key])}`).join(",")}}`;
  }
  throw new Error(`Decision ledger JCS input contains unsupported type ${typeof value}.`);
}

export function decisionLedgerRecordHash(record) {
  const { recordHash, ...payload } = record;
  return `sha256:${createHash("sha256").update(Buffer.from(`${ledgerHashDomain}\0`, "utf8")).update(Buffer.from(jcsStringify(payload), "utf8")).digest("hex")}`;
}

function validTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateDecisionLedger(register, lifecycle, ledger) {
  const errors = [];
  const decisions = register?.decisions ?? [];
  const decisionsById = new Map(decisions.map((decision) => [decision.decisionId, decision]));
  const allowedTransitions = lifecycle?.allowedTransitions ?? {};
  const statusRequirements = lifecycle?.statusRequirements ?? {};
  if (ledger?.contractVersion !== "decision-evidence-ledger.v0") errors.push("invalid ledger contractVersion");
  if (ledger?.classification !== "APPEND_ONLY_DECISION_EVIDENCE_LEDGER_WITH_HASH_CHAIN") errors.push("invalid ledger classification");
  if (ledger?.dataPolicy?.containsCredentials !== false || ledger?.dataPolicy?.containsPersonalContactData !== false) errors.push("ledger data policy permits forbidden credential/contact data");
  if (ledger?.dataPolicy?.containsOperationalDecisionEvidence !== true || ledger?.dataPolicy?.namedOwnersAndReviewersUseStablePersonIds !== true) errors.push("ledger data policy is incomplete");
  if (JSON.stringify(ledger?.hashContract) !== JSON.stringify({ canonicalization: "RFC8785-JCS", domainSeparator: ledgerHashDomain, firstPreviousRecordHash: null, chainScope: "GLOBAL_APPEND_ORDER" })) errors.push("invalid ledger hash contract");
  if (JSON.stringify(lifecycle?.statusVocabulary) !== JSON.stringify(statusVocabulary)) errors.push("lifecycle status vocabulary differs from the canonical ledger vocabulary");
  if (!Array.isArray(ledger?.entries)) errors.push("ledger entries must be an array");

  const currentStatus = new Map(decisions.map((decision) => [decision.decisionId, "OPEN"]));
  const lastByDecision = new Map();
  let previousGlobalHash = null;
  for (const [index, entry] of (ledger?.entries ?? []).entries()) {
    const label = `${entry?.decisionId ?? "UNKNOWN"}#${entry?.decisionRevision ?? "?"}`;
    const decision = decisionsById.get(entry?.decisionId);
    if (!decision) errors.push(`${label}: unknown decision ID`);
    if (!Number.isSafeInteger(entry?.decisionRevision) || entry.decisionRevision < 1) errors.push(`${label}: decisionRevision must be a positive safe integer`);
    if (!statusVocabulary.includes(entry?.status)) errors.push(`${label}: invalid status`);
    if (entry?.scope !== decision?.scope) errors.push(`${label}: decision scope does not exactly match the canonical register`);
    if (entry?.ownerRole !== decision?.ownerRole) errors.push(`${label}: ownerRole does not match the canonical register`);
    if (!/^person:[A-Za-z0-9._@:-]+$/.test(entry?.namedOwner ?? "")) errors.push(`${label}: namedOwner must use person:<stable-id>`);
    if (!/^sha256:[a-f0-9]{64}$/.test(entry?.evidenceManifestHash ?? "")) errors.push(`${label}: evidenceManifestHash must be SHA-256`);
    if (!validTimestamp(entry?.evidenceObservedAt)) errors.push(`${label}: evidenceObservedAt must be a valid UTC timestamp`);
    if (!/^person:[A-Za-z0-9._@:-]+$/.test(entry?.reviewer ?? "")) errors.push(`${label}: reviewer must use person:<stable-id>`);
    if (typeof entry?.decisionRef !== "string" || entry.decisionRef.trim() === "") errors.push(`${label}: decisionRef is required`);
    if (!validDate(entry?.validUntil)) errors.push(`${label}: validUntil must be a valid calendar date`);
    if (!validTimestamp(entry?.effectiveAt)) errors.push(`${label}: effectiveAt must be a valid UTC timestamp`);
    if (typeof entry?.reviewCondition !== "string" || entry.reviewCondition.trim() === "") errors.push(`${label}: reviewCondition is required`);
    if (typeof entry?.acceptanceArtifact !== "string" || entry.acceptanceArtifact.trim() === "") errors.push(`${label}: acceptanceArtifact is required`);
    if (!Number.isSafeInteger(entry?.fixtureCount) || entry.fixtureCount < 0) errors.push(`${label}: fixtureCount must be a non-negative safe integer`);
    if (!["PASS", "NOT_RUN", "FAIL"].includes(entry?.acceptanceResult)) errors.push(`${label}: invalid acceptanceResult`);
    if (!Array.isArray(entry?.dependencyDecisionIds) || new Set(entry.dependencyDecisionIds).size !== entry.dependencyDecisionIds.length || entry.dependencyDecisionIds.includes(entry?.decisionId) || entry.dependencyDecisionIds.some((id) => !decisionsById.has(id))) errors.push(`${label}: dependencyDecisionIds must uniquely reference other known decisions`);
    if (!Object.prototype.hasOwnProperty.call(statusRequirements, entry?.status)) errors.push(`${label}: missing status requirement definition`);

    const prior = lastByDecision.get(entry?.decisionId);
    const expectedRevision = prior ? prior.decisionRevision + 1 : 1;
    if (entry?.decisionRevision !== expectedRevision) errors.push(`${label}: per-decision revisions must be contiguous from 1`);
    if (entry?.previousRevision !== (prior?.decisionRevision ?? null)) errors.push(`${label}: previousRevision does not point to the prior decision revision`);
    if (prior && !allowedTransitions[prior.status]?.includes(entry.status)) errors.push(`${label}: illegal transition ${prior.status} -> ${entry.status}`);
    if (entry?.previousRecordHash !== previousGlobalHash) errors.push(`${label}: previousRecordHash breaks the global append-only chain`);
    if (!/^sha256:[a-f0-9]{64}$/.test(entry?.recordHash ?? "") || decisionLedgerRecordHash(entry) !== entry.recordHash) errors.push(`${label}: recordHash is invalid`);

    const requirements = statusRequirements[entry?.status] ?? [];
    for (const requirement of requirements) {
      if (requirement === "acceptanceResult:PASS") {
        if (entry?.acceptanceResult !== "PASS") errors.push(`${label}: ${entry.status} requires acceptanceResult PASS`);
      } else if (requirement === "reason" || requirement === "reopenWhen" || requirement === "expiredAt" || requirement === "reviewAction") {
        if (typeof entry?.[requirement] !== "string" || entry[requirement].trim() === "") errors.push(`${label}: ${entry.status} requires ${requirement}`);
      } else if (requirement === "scope") {
        if (entry.scope !== decision?.scope) errors.push(`${label}: ${entry.status} requires exact registered scope`);
      } else if (requirement === "selectedValue") {
        if (typeof entry.selectedValue !== "string" || entry.selectedValue.trim() === "") errors.push(`${label}: ${entry.status} requires selectedValue`);
      } else if (requirement === "evidenceManifestHash") {
        if (!/^sha256:[a-f0-9]{64}$/.test(entry.evidenceManifestHash ?? "")) errors.push(`${label}: ${entry.status} requires evidence manifest hash`);
      } else if (requirement === "evidenceObservedAt") {
        if (!validTimestamp(entry.evidenceObservedAt)) errors.push(`${label}: ${entry.status} requires evidence observation timestamp`);
      } else if (requirement === "acceptanceArtifact") {
        if (typeof entry.acceptanceArtifact !== "string" || entry.acceptanceArtifact.trim() === "") errors.push(`${label}: ${entry.status} requires acceptanceArtifact`);
      } else if (requirement === "decisionRef") {
        if (typeof entry.decisionRef !== "string" || entry.decisionRef.trim() === "") errors.push(`${label}: ${entry.status} requires decisionRef`);
      } else if (requirement === "validUntil") {
        if (!validDate(entry.validUntil)) errors.push(`${label}: ${entry.status} requires validUntil`);
      } else if (requirement === "codeGateEvidence" || requirement === "rollbackEvidence") {
        if (typeof entry?.[requirement] !== "string" || entry[requirement].trim() === "") errors.push(`${label}: ${entry.status} requires ${requirement}`);
      }
    }
    if (["APPROVED", "CLOSED"].includes(entry?.status) && entry?.acceptanceResult !== "PASS") errors.push(`${label}: approval/closure requires passing acceptance evidence`);
    if (entry?.status === "EXPIRED" && (!validTimestamp(entry.expiredAt) || typeof entry.reviewAction !== "string" || entry.reviewAction.trim() === "")) errors.push(`${label}: expiry requires timestamp and review action`);

    lastByDecision.set(entry?.decisionId, entry);
    if (decision) currentStatus.set(entry.decisionId, entry.status);
    previousGlobalHash = entry?.recordHash ?? null;
  }
  if (ledger?.chainTailHash !== previousGlobalHash) errors.push("chainTailHash does not match the last ledger record");
  return { errors, currentStatus, lastByDecision, entryCount: ledger?.entries?.length ?? 0 };
}

export function renderDecisionEvidenceLedger(ledger) {
  const header = [
    "| Decision ID | Revision | Status | Named owner | Evidence manifest SHA-256 + source timestamp | Reviewer/decision record | Valid through/review condition | Fixture/acceptance report | Rejection/expiry reason |",
    "|---|---:|---|---|---|---|---|---|---|",
  ];
  const rows = (ledger?.entries ?? []).map((entry) => {
    const observedManifest = `${entry.evidenceManifestHash}; observedAt:${entry.evidenceObservedAt}`;
    const reviewer = `reviewer:${entry.reviewer}; decisionRef:${entry.decisionRef}`;
    const validity = `validUntil:${entry.validUntil}; reviewCondition:${entry.reviewCondition}`;
    const acceptance = `artifact:${entry.acceptanceArtifact}; result:${entry.acceptanceResult}; fixtureCount:${entry.fixtureCount}`;
    const reason = entry.status === "REJECTED"
      ? `reason:${entry.reason}; reopenWhen:${entry.reopenWhen}`
      : entry.status === "EXPIRED"
        ? `expiredAt:${entry.expiredAt}; reviewAction:${entry.reviewAction}`
        : entry.reason ?? "—";
    return `| \`${entry.decisionId}\` | ${entry.decisionRevision} | \`${entry.status}\` | ${entry.namedOwner} | ${observedManifest} | ${reviewer} | ${validity} | ${acceptance} | ${reason} |`;
  });
  return [...header, ...(rows.length ? rows : ["| — | — | — | — | — | — | — | — | — |"])].join("\n");
}
