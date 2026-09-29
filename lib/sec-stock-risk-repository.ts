import { getPool } from "./db";

export type RiskDocument = { schemaVersion: 2; items: Array<Record<string, unknown>> };
const markets = new Set(["NAS", "NYS", "AMS"]);
const allowedSeverities = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const allowedDirections = new Set(["NEGATIVE", "MIXED"]);
const allowedStatuses = new Set(["ACTIVE", "RESOLVED", "UNKNOWN"]);

function clean(value: unknown, max: number) { const result = String(value ?? "").trim(); if (result.length > max) throw new Error("FIELD_TOO_LONG"); return result; }
function normalizeItem(input: Record<string, unknown>, existing?: Record<string, unknown>) {
  const item = { ...(existing ?? {}), ...input };
  const required = ["riskId", "category", "severity", "direction", "status", "summary", "originalText", "koreanText", "details", "confidence"];
  for (const key of required) if (!clean(item[key], key === "details" || key === "originalText" || key === "koreanText" ? 30_000 : 2_000)) throw new Error(`RISK_${key.toUpperCase()}_REQUIRED`);
  if (!allowedSeverities.has(String(item.severity)) || !allowedDirections.has(String(item.direction)) || !allowedStatuses.has(String(item.status))) throw new Error("INVALID_RISK_ENUM");
  if (!Array.isArray(item.evidence)) throw new Error("RISK_EVIDENCE_REQUIRED");
  return { ...item, riskId: clean(item.riskId, 120), category: clean(item.category, 80), severity: String(item.severity), direction: String(item.direction), status: String(item.status), summary: clean(item.summary, 2_000), originalText: clean(item.originalText, 30_000), koreanText: clean(item.koreanText, 30_000), details: clean(item.details, 30_000), confidence: clean(item.confidence, 32) };
}
export function validateRiskDocument(value: unknown): RiskDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RISK_MUST_BE_OBJECT");
  const input = value as Record<string, unknown>;
  if (Number(input.schemaVersion ?? 2) !== 2 || !Array.isArray(input.items) || input.items.length > 100) throw new Error("INVALID_RISK_DOCUMENT");
  const items = input.items.map((item) => normalizeItem(item as Record<string, unknown>));
  if (new Set(items.map((item) => String(item.riskId))).size !== items.length) throw new Error("DUPLICATE_RISK_ID");
  return { schemaVersion: 2, items };
}
function identity(market: unknown, ticker: unknown) { const m = clean(market, 3).toUpperCase(); const t = clean(ticker, 16).toUpperCase(); if (!markets.has(m) || !/^[A-Z0-9.-]{1,16}$/.test(t)) throw new Error("INVALID_INSTRUMENT"); return [m, t] as const; }
export async function listSecStockRisks(market: string, tickers: string[]) { const [m] = identity(market, tickers[0]); const normalized = [...new Set(tickers.map((ticker) => identity(m, ticker)[1]))]; return (await getPool().query("SELECT market,ticker,company_name AS \"companyName\",risk,market_cap_usd AS \"marketCapUsd\",market_cap_observed_at AS \"marketCapObservedAt\",sec_cik AS \"secCik\",source_accessions AS \"sourceAccessions\",source_urls AS \"sourceUrls\",risk_as_of AS \"riskAsOf\",source_updated_at AS \"sourceUpdatedAt\",updated_at AS \"updatedAt\",updated_by AS \"updatedBy\" FROM sec_stock_risks WHERE market=$1 AND ticker=ANY($2::text[]) ORDER BY ticker", [m, normalized])).rows; }
export async function patchSecStockRisks(items: Array<Record<string, unknown>>) {
  if (!items.length || items.length > 100) throw new Error("INVALID_BATCH");
  const client = await getPool().connect();
  try { await client.query("BEGIN"); const updated = [];
    for (const input of items) {
      const [market, ticker] = identity(input.market, input.ticker);
      const current = (await client.query("SELECT * FROM sec_stock_risks WHERE market=$1 AND ticker=$2 FOR UPDATE", [market, ticker])).rows[0];
      const patch = (input.risk && typeof input.risk === "object" ? input.risk : {}) as Record<string, unknown>;
      const currentRisk = (current?.risk && typeof current.risk === "object" ? current.risk : { schemaVersion: 2, items: [] }) as Record<string, unknown>;
      const currentItems = new Map((Array.isArray(currentRisk.items) ? currentRisk.items : []).map((item) => {
        const normalized = item as Record<string, unknown>;
        return [String(normalized.riskId), normalized] as const;
      }));
      if (Array.isArray(patch.items)) for (const item of patch.items) { const partial = item as Record<string, unknown>; const id = clean(partial.riskId, 120); currentItems.set(id, normalizeItem(partial, currentItems.get(id))); }
      const risk = validateRiskDocument({ schemaVersion: 2, items: [...currentItems.values()] });
      const companyName = clean(input.companyName ?? current?.company_name, 300); if (!companyName) throw new Error("COMPANY_NAME_REQUIRED");
      const result = await client.query(`INSERT INTO sec_stock_risks (market,ticker,company_name,risk,risk_as_of,updated_at,updated_by) VALUES ($1,$2,$3,$4::jsonb,CURRENT_DATE,NOW(),'LOCAL_API') ON CONFLICT (market,ticker) DO UPDATE SET company_name=EXCLUDED.company_name,risk=EXCLUDED.risk,risk_as_of=EXCLUDED.risk_as_of,updated_at=NOW(),updated_by='LOCAL_API' RETURNING market,ticker,company_name AS "companyName",risk,updated_at AS "updatedAt"`, [market, ticker, companyName, JSON.stringify(risk)]);
      updated.push(result.rows[0]);
    }
    await client.query("COMMIT"); return updated;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
