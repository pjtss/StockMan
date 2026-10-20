type RefreshMode = "preview" | "apply-full" | "verify" | "retry-missing" | "retry-invalid";

export type InstrumentFundamentalRefreshCliOptions = {
  mode: RefreshMode;
  apply: boolean;
  expectedCount: number | null;
  expectedFingerprint: string | null;
  verifySince: Date | null;
  retryMissingSince: Date | null;
  expectedMissing: number | null;
  expectedMissingFingerprint: string | null;
  retryInvalidSince: Date | null;
  expectedInvalid: number | null;
  expectedInvalidFingerprint: string | null;
};

const valueOptions = [
  "--expect-total",
  "--expect-total-fingerprint",
  "--verify-since",
  "--retry-missing-since",
  "--expect-missing",
  "--expect-missing-fingerprint",
  "--retry-invalid-since",
  "--expect-invalid",
  "--expect-invalid-fingerprint",
] as const;

function parseUniqueArgs(argv: string[]) {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (const arg of argv) {
    if (arg === "--apply") {
      if (flags.has(arg)) throw new Error("Duplicate CLI option: --apply");
      flags.add(arg);
      continue;
    }
    const option = valueOptions.find((candidate) => arg.startsWith(`${candidate}=`));
    if (!option) throw new Error(`Unknown refresh CLI option: ${arg}`);
    if (values.has(option)) throw new Error(`Duplicate CLI option: ${option}`);
    values.set(option, arg.slice(option.length + 1));
  }
  return { flags, values };
}

function parsePositiveInteger(value: string | undefined, option: string) {
  const parsed = value == null || !/^\d+$/.test(value) ? Number.NaN : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive safe integer`);
  return parsed;
}

function parseFingerprint(value: string | undefined, option: string) {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${option} must be a 64-character SHA-256 fingerprint`);
  return value.toLowerCase();
}

function parseTimestamp(value: string | undefined, option: string) {
  const parsed = new Date(value ?? "");
  if (!value || !Number.isFinite(parsed.getTime())) throw new Error(`${option} must be a valid ISO timestamp`);
  return parsed;
}

export function parseInstrumentFundamentalRefreshCli(argv: string[]): InstrumentFundamentalRefreshCliOptions {
  const { flags, values } = parseUniqueArgs(argv);
  const apply = flags.has("--apply");
  const verifyRaw = values.get("--verify-since");
  const retryMissingRaw = values.get("--retry-missing-since");
  const retryInvalidRaw = values.get("--retry-invalid-since");
  const selectedModes = [verifyRaw, retryMissingRaw, retryInvalidRaw].filter((value) => value !== undefined);
  if (selectedModes.length > 1) throw new Error("Choose only one of --verify-since, --retry-missing-since, or --retry-invalid-since");

  const fullOptions = ["--expect-total", "--expect-total-fingerprint"] as const;
  const missingOptions = ["--expect-missing", "--expect-missing-fingerprint"] as const;
  const invalidOptions = ["--expect-invalid", "--expect-invalid-fingerprint"] as const;
  const expectationOptions = [...fullOptions, ...missingOptions, ...invalidOptions];
  const ensureNoExpectations = (allowed: readonly string[]) => {
    const unexpected = expectationOptions.find((option) => values.has(option) && !allowed.includes(option));
    if (unexpected) throw new Error(`${unexpected} is not valid for this refresh mode`);
  };

  if (verifyRaw !== undefined) {
    if (apply) throw new Error("--verify-since cannot be combined with --apply");
    ensureNoExpectations([]);
    return {
      mode: "verify", apply: false, expectedCount: null, expectedFingerprint: null,
      verifySince: parseTimestamp(verifyRaw, "--verify-since"), retryMissingSince: null,
      expectedMissing: null, expectedMissingFingerprint: null, retryInvalidSince: null,
      expectedInvalid: null, expectedInvalidFingerprint: null,
    };
  }

  if (retryMissingRaw !== undefined) {
    ensureNoExpectations(missingOptions);
    const expectedMissing = apply ? parsePositiveInteger(values.get("--expect-missing"), "--expect-missing") : null;
    const expectedMissingFingerprint = apply ? parseFingerprint(values.get("--expect-missing-fingerprint"), "--expect-missing-fingerprint") : null;
    if (!apply && missingOptions.some((option) => values.has(option))) throw new Error("Retry expectations require --apply");
    return {
      mode: "retry-missing", apply, expectedCount: null, expectedFingerprint: null,
      verifySince: null, retryMissingSince: parseTimestamp(retryMissingRaw, "--retry-missing-since"),
      expectedMissing, expectedMissingFingerprint, retryInvalidSince: null,
      expectedInvalid: null, expectedInvalidFingerprint: null,
    };
  }

  if (retryInvalidRaw !== undefined) {
    ensureNoExpectations(invalidOptions);
    const expectedInvalid = apply ? parsePositiveInteger(values.get("--expect-invalid"), "--expect-invalid") : null;
    const expectedInvalidFingerprint = apply ? parseFingerprint(values.get("--expect-invalid-fingerprint"), "--expect-invalid-fingerprint") : null;
    if (!apply && invalidOptions.some((option) => values.has(option))) throw new Error("Retry expectations require --apply");
    return {
      mode: "retry-invalid", apply, expectedCount: null, expectedFingerprint: null,
      verifySince: null, retryMissingSince: null, expectedMissing: null,
      expectedMissingFingerprint: null, retryInvalidSince: parseTimestamp(retryInvalidRaw, "--retry-invalid-since"),
      expectedInvalid, expectedInvalidFingerprint,
    };
  }

  ensureNoExpectations(fullOptions);
  if (!apply && fullOptions.some((option) => values.has(option))) throw new Error("Full-refresh expectations require --apply");
  const expectedCount = apply ? parsePositiveInteger(values.get("--expect-total"), "--expect-total") : null;
  const expectedFingerprint = apply ? parseFingerprint(values.get("--expect-total-fingerprint"), "--expect-total-fingerprint") : null;
  return {
    mode: apply ? "apply-full" : "preview", apply, expectedCount, expectedFingerprint,
    verifySince: null, retryMissingSince: null, expectedMissing: null,
    expectedMissingFingerprint: null, retryInvalidSince: null, expectedInvalid: null,
    expectedInvalidFingerprint: null,
  };
}
