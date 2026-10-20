import { loadLocalEnv } from "./local-env.mjs";

function expectedFlag(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

async function main() {
  loadLocalEnv({ required: true });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required in .env.local");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error(`Refusing non-local database host: ${url.hostname}`);
  const apply = process.argv.includes("--apply");
  const { getPool } = await import("@/lib/db");
  const { reconcileUsUniversePartitions } = await import("@/lib/instrument-universe-import");
  try {
    const preview = await reconcileUsUniversePartitions();
    if (!preview) throw new Error("Partition reconciliation is already running");
    const { commonToSpecialRows, specialToCommonRows, ...previewSummary } = preview;
    const byType = Object.groupBy(commonToSpecialRows, (row) => row.instrumentType);
    console.info(`[us-universe-reconcile-preview] ${JSON.stringify({
      ...previewSummary,
      commonToSpecialTypeCounts: Object.fromEntries(Object.entries(byType).map(([type, items]) => [type, items?.length ?? 0])),
      nonDebtToSpecial: commonToSpecialRows.filter((row) => row.instrumentType !== "DEBT_SECURITY").map(({ market, code, name, instrumentType }) => ({ market, code, name, instrumentType })),
      specialToCommonSample: specialToCommonRows.slice(0, 10),
    })}`);
    if (!apply) return;
    const expectedCommonToSpecial = expectedFlag("--expect-common-to-special");
    const expectedSpecialToCommon = expectedFlag("--expect-special-to-common");
    if (expectedCommonToSpecial === null || expectedSpecialToCommon === null) throw new Error("Apply requires --expect-common-to-special N and --expect-special-to-common N");
    if (preview.commonToSpecial !== expectedCommonToSpecial || preview.specialToCommon !== expectedSpecialToCommon) {
      throw new Error(`Scope changed; expected ${expectedCommonToSpecial}/${expectedSpecialToCommon}, found ${preview.commonToSpecial}/${preview.specialToCommon}; no rows changed`);
    }
    const result = await reconcileUsUniversePartitions({ apply: true });
    if (!result || result.commonToSpecial !== expectedCommonToSpecial || result.specialToCommon !== expectedSpecialToCommon) throw new Error("Reconciliation result differed from the guarded preview");
    const { commonToSpecialRows: _commonToSpecialRows, specialToCommonRows: _specialToCommonRows, ...resultSummary } = result;
    console.info(`[us-universe-reconcile-applied] ${JSON.stringify(resultSummary)}`);
    const after = await reconcileUsUniversePartitions();
    if (!after || after.commonToSpecial !== 0 || after.specialToCommon !== 0) throw new Error("Post-apply partition audit found rows still requiring movement");
    const { commonToSpecialRows: _afterCommonToSpecialRows, specialToCommonRows: _afterSpecialToCommonRows, ...afterSummary } = after;
    console.info(`[us-universe-reconcile-verified] ${JSON.stringify(afterSummary)}`);
  } finally {
    await getPool().end();
  }
}

void main().catch((error) => {
  console.error(`[us-universe-reconcile-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
