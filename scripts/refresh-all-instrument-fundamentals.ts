import pg from "pg";
import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./local-env.mjs";
import { parseInstrumentFundamentalRefreshCli } from "../lib/instrument-fundamental-refresh-cli";
import { assertInstrumentFundamentalRefreshScopeMatches, findDuplicateInstrumentFundamentalUniverseEntries, fingerprintInstrumentFundamentalRefreshScope } from "../lib/instrument-fundamental-refresh-scope";
import { loadInstrumentFundamentalUniverse, loadInvalidInstrumentFundamentals, loadMissingInstrumentFundamentals, verifyInstrumentFundamentalRefresh } from "../lib/instrument-fundamental-refresh-repository";

function parseCliOptions() {
  try {
    return parseInstrumentFundamentalRefreshCli(process.argv.slice(2));
  } catch (error) {
    console.error(`[fundamentals-full-refresh-cli-error] ${error instanceof Error ? error.message : "invalid CLI options"}`);
    process.exit(2);
  }
}

const {
  apply, expectedCount, expectedFingerprint, verifySince, retryMissingSince,
  expectedMissing, expectedMissingFingerprint, retryInvalidSince,
  expectedInvalid, expectedInvalidFingerprint,
} = parseCliOptions();
loadLocalEnv({ required: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) {
  throw new Error(`Refusing to refresh non-local database host: ${database.hostname}`);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

function verifyCompletedFullRefresh(since: string) {
  const scriptPath = process.argv[1];
  if (!scriptPath) throw new Error("Cannot locate refresh script for automatic post-refresh verification");
  const result = spawnSync(process.execPath, [
    ...process.execArgv,
    scriptPath,
    `--verify-since=${since}`,
  ], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function main() {
  try {
    const universeRows = await loadInstrumentFundamentalUniverse(pool);
    const duplicateUniverseEntries = findDuplicateInstrumentFundamentalUniverseEntries(universeRows);
    if (duplicateUniverseEntries.length > 0) {
      throw new Error(`Active instrument universes contain duplicate market/code identities; refusing refresh: ${JSON.stringify(duplicateUniverseEntries.slice(0, 20))}`);
    }
    const instruments = universeRows.map(({ market, code, name }) => ({ market, code, name }));
    const targetCount = instruments.length;
    const marketCounts = instruments.reduce<Record<string, number>>((counts, instrument) => {
      counts[instrument.market] = (counts[instrument.market] ?? 0) + 1;
      return counts;
    }, {});
    const markets = Object.entries(marketCounts).map(([market, active_count]) => ({ market, active_count }));
    const scopeFingerprint = fingerprintInstrumentFundamentalRefreshScope(
      instruments.map(({ market, code }) => ({ market, code, reason: "full_refresh" })),
    );
    console.info(`[fundamentals-full-refresh] mode=${apply ? "apply" : "preview"} databaseHost=${database.hostname} target=${targetCount} markets=${JSON.stringify(markets)} scopeFingerprint=${scopeFingerprint}`);
    if (verifySince) {
      const verification = await verifyInstrumentFundamentalRefresh(pool, verifySince);
      console.info(`[fundamentals-full-refresh-verification] ${JSON.stringify(verification)}`);
      if (!verification.ok) process.exitCode = 1;
      return;
    }
    if (retryMissingSince) {
      if (!retryMissingSince || !Number.isFinite(retryMissingSince.getTime())) throw new Error("--retry-missing-since must be a valid ISO timestamp");
      const missingRows = await loadMissingInstrumentFundamentals(pool, retryMissingSince);
      const missingScope = missingRows.map((row) => ({ ...row, reason: "missing_history" }));
      const missingFingerprint = fingerprintInstrumentFundamentalRefreshScope(missingScope);
      console.info(`[fundamentals-missing-retry-preview] ${JSON.stringify({ since: retryMissingSince.toISOString(), missingCount: missingRows.length, scopeFingerprint: missingFingerprint, markets: missingRows.reduce<Record<string, number>>((counts, row) => { counts[row.market] = (counts[row.market] ?? 0) + 1; return counts; }, {}) })}`);
      if (!apply) return;
      assertInstrumentFundamentalRefreshScopeMatches(missingScope, expectedMissing ?? Number.NaN, expectedMissingFingerprint ?? "");
      if (missingRows.length === 0) return;
      const { refreshInstrumentFundamentals } = await import("@/lib/instrument-fundamentals");
      const refresh = await refreshInstrumentFundamentals({
        instruments: missingRows,
        onProgress: ({ processedCount, instrumentCount, fetchedCount, savedCount, failureCount, elapsedMs, fetchDurationMs, dbWriteDurationMs, writeQueueWaitMs }) => {
          if (processedCount % 25 === 0 || processedCount === instrumentCount) {
            console.info(`[fundamentals-missing-retry-progress] ${JSON.stringify({ processedCount, instrumentCount, fetchedCount, savedCount, failureCount, elapsedMs, fetchDurationMs, dbWriteDurationMs, writeQueueWaitMs })}`);
          }
        },
      });
      console.info(`[fundamentals-missing-retry-result] ${JSON.stringify(refresh)}`);
      if (!refresh?.ok) process.exitCode = 1;
      return;
    }
    if (retryInvalidSince) {
      if (!retryInvalidSince || !Number.isFinite(retryInvalidSince.getTime())) throw new Error("--retry-invalid-since must be a valid ISO timestamp");
      const invalidRows = await loadInvalidInstrumentFundamentals(pool, retryInvalidSince);
      const reasonCounts = invalidRows.reduce<Record<string, number>>((counts, row) => {
        counts[row.reason] = (counts[row.reason] ?? 0) + 1;
        return counts;
      }, {});
      const scopeFingerprint = fingerprintInstrumentFundamentalRefreshScope(invalidRows);
      console.info(`[fundamentals-invalid-retry-preview] ${JSON.stringify({ since: retryInvalidSince.toISOString(), invalidCount: invalidRows.length, scopeFingerprint, reasonCounts, samples: invalidRows.slice(0, 20) })}`);
      if (!apply) return;
      if (!Number.isInteger(expectedInvalid) || expectedInvalid !== invalidRows.length || expectedInvalidFingerprint !== scopeFingerprint) {
        throw new Error(`Exact invalid-scope confirmation required: --expect-invalid=${invalidRows.length} --expect-invalid-fingerprint=${scopeFingerprint}`);
      }
      if (invalidRows.length === 0) return;
      const { refreshInstrumentFundamentals } = await import("@/lib/instrument-fundamentals");
      const refresh = await refreshInstrumentFundamentals({
        instruments: invalidRows,
        onProgress: ({ processedCount, instrumentCount, fetchedCount, savedCount, failureCount, elapsedMs, fetchDurationMs, dbWriteDurationMs, writeQueueWaitMs }) => {
          if (processedCount % 25 === 0 || processedCount === instrumentCount) {
            console.info(`[fundamentals-invalid-retry-progress] ${JSON.stringify({ processedCount, instrumentCount, fetchedCount, savedCount, failureCount, elapsedMs, fetchDurationMs, dbWriteDurationMs, writeQueueWaitMs })}`);
          }
        },
      });
      console.info(`[fundamentals-invalid-retry-result] ${JSON.stringify(refresh)}`);
      if (!refresh?.ok) process.exitCode = 1;
      return;
    }
    if (!apply) return;
    if (!Number.isInteger(expectedCount) || expectedCount !== targetCount || expectedFingerprint !== scopeFingerprint) {
      throw new Error(`Exact full-refresh scope confirmation required: --expect-total=${targetCount} --expect-total-fingerprint=${scopeFingerprint}`);
    }
    if (targetCount === 0) throw new Error("Refusing to apply an empty full-refresh scope");

    const { refreshInstrumentFundamentals } = await import("@/lib/instrument-fundamentals");
    const refresh = await refreshInstrumentFundamentals({
      instruments,
      onProgress: ({ processedCount, instrumentCount, fetchedCount, savedCount, failureCount, elapsedMs, fetchDurationMs, dbWriteDurationMs, writeQueueWaitMs }) => {
        if (processedCount % 100 === 0 || processedCount === instrumentCount) {
          console.info(`[fundamentals-full-refresh-progress] ${JSON.stringify({ processedCount, instrumentCount, fetchedCount, savedCount, failureCount, elapsedMs, fetchDurationMs, dbWriteDurationMs, writeQueueWaitMs })}`);
        }
      },
    });
    console.info(`[fundamentals-full-refresh-result] ${JSON.stringify(refresh)}`);
    if (!refresh) {
      console.error("[fundamentals-full-refresh] refresh lock is already held; skipping post-refresh verification");
      process.exitCode = 1;
      return;
    }
    const verificationExitCode = verifyCompletedFullRefresh(refresh.startedAt);
    if (!refresh.ok || verificationExitCode !== 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[fundamentals-full-refresh-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
