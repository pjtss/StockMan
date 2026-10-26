import crypto from "node:crypto";
import { getPool } from "./db";

// Google Cloud Translation Basic's first 500K characters/month are covered by
// up to a shared $10 credit. Keep a 50K margin for usage outside this app.
export const GOOGLE_TRANSLATION_MONTHLY_LIMIT = 450_000;
// Azure Translator F0 includes 2M characters/month. Keep a 50K safety margin
// for counting/usage outside this application's reservation ledger.
export const AZURE_TRANSLATION_MONTHLY_LIMIT = 1_950_000;
export const AZURE_TRANSLATION_HOURLY_LIMIT = 1_800_000;
export const GOOGLE_TRANSLATION_HOURLY_LIMIT = 100_000;
export const AZURE_TRANSLATION_PROVIDER = "azure-translator";
export const GOOGLE_TRANSLATION_PROVIDER = "google-cloud-translation";
export const translationHash = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
/** Cloud Translation quota counts Unicode code points (including whitespace), not UTF-16 code units. */
export const countTranslationCharacters = (text: string, provider = GOOGLE_TRANSLATION_PROVIDER) => provider === AZURE_TRANSLATION_PROVIDER ? text.length : Array.from(text).length;
export type CachedTranslation = { translatedText: string; provider: string; characterCount: number };

export async function loadTranslationCache(sourceText: string, provider: string, targetLanguage = "ko") {
  const result = await getPool().query<CachedTranslation>("SELECT translated_text AS \"translatedText\", provider, character_count AS \"characterCount\" FROM market_rss_translation_cache WHERE source_hash=$1 AND target_language=$2 AND provider=$3 LIMIT 1", [translationHash(sourceText), targetLanguage, provider]);
  return result.rows[0] ?? null;
}

export async function saveTranslationCache(sourceText: string, translatedText: string, provider: string, sourceLanguage = "en", targetLanguage = "ko") {
  const count = countTranslationCharacters(sourceText, provider);
  await getPool().query("INSERT INTO market_rss_translation_cache (source_hash,source_text,translated_text,source_language,target_language,provider,character_count) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (source_hash,target_language,provider) DO UPDATE SET translated_text=EXCLUDED.translated_text,updated_at=NOW()", [translationHash(sourceText), sourceText, translatedText, sourceLanguage, targetLanguage, provider, count]);
  return count;
}

export async function deleteTranslationCache(sourceText: string, provider: string, targetLanguage = "ko") {
  await getPool().query("DELETE FROM market_rss_translation_cache WHERE source_hash=$1 AND target_language=$2 AND provider=$3", [translationHash(sourceText), targetLanguage, provider]);
}

export async function reserveTranslationCharacters(characterCount: number, month = new Date().toISOString().slice(0, 7), limit = GOOGLE_TRANSLATION_MONTHLY_LIMIT, provider = GOOGLE_TRANSLATION_PROVIDER, hourlyLimit = Number.MAX_SAFE_INTEGER) {
  if (characterCount <= 0) return { allowed: true, used: 0, limitReached: false };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`translation-quota:${provider}`]);
    await client.query("DELETE FROM translation_usage_reservations WHERE reserved_at < NOW()-INTERVAL '2 hours'");
    const hourly = await client.query<{ used: string }>("SELECT COALESCE(SUM(character_count),0)::text AS used FROM translation_usage_reservations WHERE provider=$1 AND reserved_at > NOW()-INTERVAL '1 hour'", [provider]);
    const hourlyUsed = Number(hourly.rows[0]?.used ?? 0);
    if (characterCount > hourlyLimit || hourlyUsed + characterCount > hourlyLimit) {
      await client.query("COMMIT");
      return { allowed: false, used: hourlyUsed, limitReached: true, reason: "hourly_character_limit_reached" as const };
    }
    const result = await client.query<{ reserved: number }>("WITH request AS (SELECT $1::text AS provider,$2::text AS usage_month,$3::bigint AS character_count,$4::bigint AS quota_limit) INSERT INTO translation_usage_monthly (provider,usage_month,reserved_characters,updated_at) SELECT provider,usage_month,character_count,NOW() FROM request WHERE character_count <= quota_limit ON CONFLICT (provider,usage_month) DO UPDATE SET reserved_characters=translation_usage_monthly.reserved_characters+EXCLUDED.reserved_characters,updated_at=NOW() WHERE translation_usage_monthly.reserved_characters+EXCLUDED.reserved_characters <= (SELECT quota_limit FROM request) RETURNING reserved_characters AS reserved", [provider, month, characterCount, limit]);
    const allowed = result.rowCount === 1;
    if (allowed) {
      // Keep the provider advisory transaction lock until both monthly and rolling-hour
      // reservations are durable, so concurrent requests cannot observe a missing hour row.
      await client.query("INSERT INTO translation_usage_reservations(provider,character_count) VALUES ($1,$2)", [provider, characterCount]);
      await client.query("COMMIT");
      return { allowed: true, used: Number(result.rows[0].reserved), limitReached: false };
    }
    const usage = await client.query<{ reserved: number }>("SELECT reserved_characters AS reserved FROM translation_usage_monthly WHERE provider=$1 AND usage_month=$2", [provider, month]);
    await client.query("COMMIT");
    return { allowed: false, used: Number(usage.rows[0]?.reserved ?? 0), limitReached: true, reason: "monthly_character_limit_reached" as const };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function releaseTranslationCharacters(characterCount: number, month = new Date().toISOString().slice(0, 7), provider = GOOGLE_TRANSLATION_PROVIDER) {
  if (characterCount <= 0) return;
  const result = await getPool().query("UPDATE translation_usage_monthly SET reserved_characters=GREATEST(0,reserved_characters-$1),updated_at=NOW() WHERE provider=$3 AND usage_month=$2", [characterCount, month, provider]);
  if (result.rowCount !== 1) throw new Error(`Translation quota reservation row missing for ${month}`);
}

export async function recordTranslatedCharacters(characterCount: number, month = new Date().toISOString().slice(0, 7), provider = GOOGLE_TRANSLATION_PROVIDER) {
  if (characterCount <= 0) return;
  const result = await getPool().query("UPDATE translation_usage_monthly SET translated_characters=translated_characters+$1,updated_at=NOW() WHERE provider=$3 AND usage_month=$2", [characterCount, month, provider]);
  if (result.rowCount !== 1) throw new Error(`Translation usage row missing for ${month}`);
}

export async function claimTranslationLimitAlert(month = new Date().toISOString().slice(0, 7), provider = GOOGLE_TRANSLATION_PROVIDER) {
  const result = await getPool().query("INSERT INTO translation_usage_monthly (provider,usage_month,limit_alerted) VALUES ($1,$2,TRUE) ON CONFLICT (provider,usage_month) DO UPDATE SET limit_alerted=TRUE,updated_at=NOW() WHERE translation_usage_monthly.limit_alerted=FALSE RETURNING usage_month", [provider, month]);
  return result.rowCount === 1;
}

export async function releaseTranslationLimitAlert(month = new Date().toISOString().slice(0, 7), provider = GOOGLE_TRANSLATION_PROVIDER) {
  await getPool().query("UPDATE translation_usage_monthly SET limit_alerted=FALSE,updated_at=NOW() WHERE provider=$2 AND usage_month=$1", [month, provider]);
}

export async function claimTranslationThresholdAlert(threshold: number, month = new Date().toISOString().slice(0, 7), provider = GOOGLE_TRANSLATION_PROVIDER) {
  const result = await getPool().query("INSERT INTO translation_usage_monthly (provider,usage_month,alerted_thresholds) VALUES ($1,$2,ARRAY[$3]::integer[]) ON CONFLICT (provider,usage_month) DO UPDATE SET alerted_thresholds=array_append(translation_usage_monthly.alerted_thresholds,$3),updated_at=NOW() WHERE NOT ($3 = ANY(translation_usage_monthly.alerted_thresholds)) RETURNING usage_month", [provider, month, threshold]);
  return result.rowCount === 1;
}

export async function releaseTranslationThresholdAlert(threshold: number, month = new Date().toISOString().slice(0, 7), provider = GOOGLE_TRANSLATION_PROVIDER) {
  await getPool().query("UPDATE translation_usage_monthly SET alerted_thresholds=array_remove(alerted_thresholds,$1),updated_at=NOW() WHERE usage_month=$2 AND provider=$3", [threshold, month, provider]);
}
