import crypto from "node:crypto";
import { getPool } from "./db";

export const TRANSLATION_LIMIT = 300_000;
export const translationHash = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
export type CachedTranslation = { translatedText: string; provider: string; characterCount: number };

export async function loadTranslationCache(sourceText: string, provider: string, targetLanguage = "ko") {
  const result = await getPool().query<CachedTranslation>("SELECT translated_text AS \"translatedText\", provider, character_count AS \"characterCount\" FROM market_rss_translation_cache WHERE source_hash=$1 AND target_language=$2 AND provider=$3 LIMIT 1", [translationHash(sourceText), targetLanguage, provider]);
  return result.rows[0] ?? null;
}

export async function saveTranslationCache(sourceText: string, translatedText: string, provider: string, sourceLanguage = "en", targetLanguage = "ko") {
  const count = sourceText.length;
  await getPool().query("INSERT INTO market_rss_translation_cache (source_hash,source_text,translated_text,source_language,target_language,provider,character_count) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (source_hash,target_language,provider) DO UPDATE SET translated_text=EXCLUDED.translated_text,updated_at=NOW()", [translationHash(sourceText), sourceText, translatedText, sourceLanguage, targetLanguage, provider, count]);
  return count;
}

export async function reserveTranslationCharacters(characterCount: number, month = new Date().toISOString().slice(0, 7), limit = TRANSLATION_LIMIT) {
  if (characterCount <= 0) return { allowed: true, used: 0, limitReached: false };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ reserved: number }>("INSERT INTO translation_usage_monthly (usage_month,reserved_characters,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (usage_month) DO UPDATE SET reserved_characters=translation_usage_monthly.reserved_characters+$2,updated_at=NOW() WHERE translation_usage_monthly.reserved_characters+$2 <= $3 RETURNING reserved_characters AS reserved", [month, characterCount, limit]);
    await client.query("COMMIT");
    const allowed = result.rowCount === 1;
    return { allowed, used: allowed ? Number(result.rows[0].reserved) : limit, limitReached: !allowed };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
