import pg from "pg";
import { loadLocalEnv } from "./local-env.mjs";
import { extractMarketRssCoreSummary } from "../lib/market-rss-summary.ts";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 100;

async function main() {
  loadLocalEnv({ required: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required in .env.local");
  const host = new URL(connectionString).hostname;
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) {
    throw new Error(`Refusing to write to a non-local database host: ${host}`);
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const migration = await pool.query(
      "SELECT 1 FROM public.flyway_schema_history WHERE version = '161' AND success = true LIMIT 1",
    );
    if (migration.rowCount !== 1) throw new Error("V161 is not recorded as successfully applied; apply project migrations first");
    const column = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'market_rss_articles' AND column_name = 'normalized_summary'",
    );
    if (column.rowCount !== 1) throw new Error("market_rss_articles.normalized_summary is missing; apply project migrations first");

    if (!APPLY) {
      const rows = await pool.query<{ id: number; title: string; summary: string }>(
        "SELECT id, title, summary FROM public.market_rss_articles WHERE normalized_summary = '' ORDER BY id",
      );
      const usesTitle = rows.rows.filter((row) => extractMarketRssCoreSummary(row.summary, row.title) === row.title.trim()).length;
      console.log(JSON.stringify({ dryRun: true, candidates: rows.rowCount, wouldUseTitle: usesTitle, wouldUseSourceSummary: rows.rowCount - usesTitle }));
      return;
    }

    let updated = 0;
    let usedTitle = 0;
    while (true) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const rows = await client.query<{ id: number; title: string; summary: string }>(
          "SELECT id, title, summary FROM public.market_rss_articles WHERE normalized_summary = '' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED",
          [BATCH_SIZE],
        );
        if (rows.rowCount === 0) {
          await client.query("COMMIT");
          break;
        }
        for (const row of rows.rows) {
          const normalized = extractMarketRssCoreSummary(row.summary, row.title);
          if (normalized === row.title.trim()) usedTitle++;
          await client.query(
            "UPDATE public.market_rss_articles SET normalized_summary = $1 WHERE id = $2 AND normalized_summary = ''",
            [normalized, row.id],
          );
        }
        await client.query("COMMIT");
        updated += rows.rowCount ?? 0;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    console.log(JSON.stringify({ dryRun: false, updated, usedTitle, usedSourceSummary: updated - usedTitle }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[market-rss-summary-backfill-failed] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
