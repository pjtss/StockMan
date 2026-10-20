import crypto from "node:crypto";
import { getPool } from "./db";

export const TRANSLATION_LIMIT = 300_000;
export const translationHash = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
/** Cloud Translation quota counts Unicode code points (including whitespace), not UTF-16 code units. */
export const countTranslationCharacters = (text: string) => Array.from(text).length;
export type CachedTranslation = { translatedText: string; provider: string; characterCount: number };

export async function loadTranslationCache(sourceText: string, provider: string, targetLanguage = "ko") {
  const result = await getPool().query<CachedTranslation>("SELECT translated_text AS \"translatedText\", provider, character_count AS \"characterCount\" FROM market_rss_translation_cache WHERE source_hash=$1 AND target_language=$2 AND provider=$3 LIMIT 1", [translationHash(sourceText), targetLanguage, provider]);
  return result.rows[0] ?? null;
}

export async function saveTranslationCache(sourceText: string, translatedText: string, provider: string, sourceLanguage = "en", targetLanguage = "ko") {
  const count = countTranslationCharacters(sourceText);
  await getPool().query("INSERT INTO market_rss_translation_cache (source_hash,source_text,translated_text,source_language,target_language,provider,character_count) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (source_hash,target_language,provider) DO UPDATE SET translated_text=EXCLUDED.translated_text,updated_at=NOW()", [translationHash(sourceText), sourceText, translatedText, sourceLanguage, targetLanguage, provider, count]);
  return count;
}

export async function deleteTranslationCache(sourceText: string, provider: string, targetLanguage = "ko") {
  await getPool().query("DELETE FROM market_rss_translation_cache WHERE source_hash=$1 AND target_language=$2 AND provider=$3", [translationHash(sourceText), targetLanguage, provider]);
}

export async function reserveTranslationCharacters(characterCount: number, month = new Date().toISOString().slice(0, 7), limit = TRANSLATION_LIMIT) {
  if (characterCount <= 0) return { allowed: true, used: 0, limitReached: false };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ reserved: number }>("INSERT INTO translation_usage_monthly (usage_month,reserved_characters,updated_at) SELECT $1,$2,NOW() WHERE $2 <= $3 ON CONFLICT (usage_month) DO UPDATE SET reserved_characters=translation_usage_monthly.reserved_characters+$2,updated_at=NOW() WHERE translation_usage_monthly.reserved_characters+$2 <= $3 RETURNING reserved_characters AS reserved", [month, characterCount, limit]);
    await client.query("COMMIT");
    const allowed = result.rowCount === 1;
    if (allowed) return { allowed: true, used: Number(result.rows[0].reserved), limitReached: false };
    const usage = await client.query<{ reserved: number }>("SELECT reserved_characters AS reserved FROM translation_usage_monthly WHERE usage_month=$1", [month]);
    return { allowed: false, used: Number(usage.rows[0]?.reserved ?? 0), limitReached: true };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function releaseTranslationCharacters(characterCount: number, month = new Date().toISOString().slice(0, 7)) {
  if (characterCount <= 0) return;
  const result = await getPool().query("UPDATE translation_usage_monthly SET reserved_characters=GREATEST(0,reserved_characters-$1),updated_at=NOW() WHERE usage_month=$2", [characterCount, month]);
  if (result.rowCount !== 1) throw new Error(`Translation quota reservation row missing for ${month}`);
}

export async function recordTranslatedCharacters(characterCount: number, month = new Date().toISOString().slice(0, 7)) {
  if (characterCount <= 0) return;
  const result = await getPool().query("UPDATE translation_usage_monthly SET translated_characters=translated_characters+$1,updated_at=NOW() WHERE usage_month=$2", [characterCount, month]);
  if (result.rowCount !== 1) throw new Error(`Translation usage row missing for ${month}`);
}

export async function claimTranslationLimitAlert(month = new Date().toISOString().slice(0, 7)) {
  const result = await getPool().query("INSERT INTO translation_usage_monthly (usage_month,limit_alerted) VALUES ($1,TRUE) ON CONFLICT (usage_month) DO UPDATE SET limit_alerted=TRUE,updated_at=NOW() WHERE translation_usage_monthly.limit_alerted=FALSE RETURNING usage_month", [month]);
  return result.rowCount === 1;
}

export async function releaseTranslationLimitAlert(month = new Date().toISOString().slice(0, 7)) {
  await getPool().query("UPDATE translation_usage_monthly SET limit_alerted=FALSE,updated_at=NOW() WHERE usage_month=$1", [month]);
}

export async function claimTranslationThresholdAlert(threshold: number, month = new Date().toISOString().slice(0, 7)) {
  const result = await getPool().query("INSERT INTO translation_usage_monthly (usage_month,alerted_thresholds) VALUES ($1,ARRAY[$2]::integer[]) ON CONFLICT (usage_month) DO UPDATE SET alerted_thresholds=array_append(translation_usage_monthly.alerted_thresholds,$2),updated_at=NOW() WHERE NOT ($2 = ANY(translation_usage_monthly.alerted_thresholds)) RETURNING usage_month", [month, threshold]);
  return result.rowCount === 1;
}

export async function releaseTranslationThresholdAlert(threshold: number, month = new Date().toISOString().slice(0, 7)) {
  await getPool().query("UPDATE translation_usage_monthly SET alerted_thresholds=array_remove(alerted_thresholds,$1),updated_at=NOW() WHERE usage_month=$2", [threshold, month]);
}
