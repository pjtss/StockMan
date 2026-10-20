import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";
import { refreshInstrumentFundamentals } from "@/lib/instrument-fundamentals";
import { assertInstrumentFundamentalRefreshScopeMatches, fingerprintInstrumentFundamentalRefreshScope } from "@/lib/instrument-fundamental-refresh-scope";

const [sinceArg, modeArg, expectedCountArg, expectedFingerprint] = process.argv.slice(2);
const since = new Date(sinceArg ?? "");
const expectedCount = Number(expectedCountArg);
const preview = modeArg === "--preview";
const apply = modeArg === "--apply";
if (!Number.isFinite(since.getTime()) || (!preview && !apply)
  || (apply && (!Number.isInteger(expectedCount) || expectedCount < 1 || !/^[a-f0-9]{64}$/i.test(expectedFingerprint ?? "")))) {
  throw new Error("Usage: retry-failed-instrument-fundamentals.ts <ISO-since> --preview | <ISO-since> --apply <expected-count> <expected-scope-sha256>");
}

loadLocalEnv({ required: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) {
  throw new Error(`Refusing to retry against non-local database host: ${database.hostname}`);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
async function main() {
  try {
    const result = await pool.query(`
    SELECT market,code FROM (
      SELECT u.market,u.code,s.fetched_at
        FROM kr_common_stock_universe u
        LEFT JOIN instrument_fundamental_snapshots s USING (market,code)
       WHERE u.enabled=true
      UNION ALL
      SELECT u.market,u.code,s.fetched_at
        FROM us_common_stock_universe u
        LEFT JOIN instrument_fundamental_snapshots s USING (market,code)
       WHERE u.enabled=true
    ) unresolved
    WHERE fetched_at IS NULL OR fetched_at < $1::timestamptz
    ORDER BY market,code
    `, [since.toISOString()]);

    const scope = result.rows.map((row) => ({ ...row, reason: "stale_snapshot" }));
    const scopeFingerprint = fingerprintInstrumentFundamentalRefreshScope(scope);
    console.info(`[fundamentals-retry-scope] ${JSON.stringify({ mode: preview ? "preview" : "apply", count: scope.length, scopeFingerprint, markets: scope.reduce<Record<string, number>>((counts, row) => { counts[row.market] = (counts[row.market] ?? 0) + 1; return counts; }, {}) })}`);
    if (preview) return;
    assertInstrumentFundamentalRefreshScopeMatches(scope, expectedCount, expectedFingerprint!);

    console.info(`[fundamentals-retry] target=${result.rows.length} databaseHost=${database.hostname} scopeFingerprint=${scopeFingerprint}`);
    const refresh = await refreshInstrumentFundamentals({
      instruments: result.rows,
      onProgress: (progress) => {
        if (progress.processedCount % 10 === 0 || progress.processedCount === progress.instrumentCount) {
          console.info(`[fundamentals-retry] ${JSON.stringify(progress)}`);
        }
      },
    });
    console.info(`[fundamentals-retry-result] ${JSON.stringify(refresh)}`);
    if (!refresh?.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[fundamentals-retry-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
