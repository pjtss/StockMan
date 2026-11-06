import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { eventRevisionHash, multiplyExactDecimalStrings, STOCKMAN_EVENT_ANALYSIS_VERSION } from "@/lib/stockman-events";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";
const GRADES = new Set(["A", "B", "C", "EXCLUDED"]);
const RISKS = new Set(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);
const EVENT_STATUSES = new Set(["ANNOUNCED", "PLANNED", "COMPLETED", "CANCELLED"]);
const decimal = /^-?(?:0|[1-9]\d{0,25})(?:\.\d{1,12})?$/;
type MetricInput = {
  metricKey: string; amountValue?: string | null; quantityValue?: string | null; currency?: string | null; unit?: string | null;
  asOfDate?: string | null; splitAdjustment?: string | null; calculationFormula?: string | null;
  calculationInputs?: Record<string, unknown>; sourceDocumentId?: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const { id: rawId } = await context.params;
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) < 1) return NextResponse.json({ ok: false, error: "INVALID_EVENT_ID" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 }); }
  const grade = typeof body.bullishGrade === "string" ? body.bullishGrade.toUpperCase() : "";
  const bullishReason = typeof body.bullishReason === "string" ? body.bullishReason.trim() : "";
  const bearishReason = typeof body.bearishReason === "string" ? body.bearishReason.trim() : "";
  const dilutionRisk = body.dilutionRisk == null ? null : String(body.dilutionRisk).toUpperCase();
  const unknownFactors = body.unknownFactors ?? [];
  const evidenceQuotes = body.evidenceQuotes ?? [];
  const evidenceDocumentIds = body.evidenceDocumentIds;
  const metrics = body.metrics ?? [];
  const eventStatus = body.eventStatus == null ? null : String(body.eventStatus).toUpperCase();
  const relatedEventId = body.relatedEventId == null ? null : String(body.relatedEventId);
  if (!GRADES.has(grade) || bullishReason.length > 6000 || bearishReason.length > 6000
    || (dilutionRisk !== null && !RISKS.has(dilutionRisk))
    || !Array.isArray(unknownFactors) || unknownFactors.length > 40 || unknownFactors.some((item) => typeof item !== "string" || item.length > 1000)
    || !Array.isArray(evidenceQuotes) || evidenceQuotes.length > 20 || evidenceQuotes.some((item) => typeof item !== "string" || !item.trim() || item.length > 1000)
    || !Array.isArray(evidenceDocumentIds) || evidenceDocumentIds.length > 20 || evidenceDocumentIds.some((item) => typeof item !== "string" || !/^\d+$/.test(item))
    || !Array.isArray(metrics) || metrics.length > 40
    || (eventStatus !== null && !EVENT_STATUSES.has(eventStatus))
    || (relatedEventId !== null && (!/^\d+$/.test(relatedEventId) || !Number.isSafeInteger(Number(relatedEventId)) || Number(relatedEventId) < 1 || Number(relatedEventId) === Number(rawId)))) return NextResponse.json({ ok: false, error: "INVALID_ANALYSIS" }, { status: 400 });
  if (grade !== "EXCLUDED" && (!bullishReason || !evidenceQuotes.length || !evidenceDocumentIds.length)) return NextResponse.json({ ok: false, error: "POSITIVE_ANALYSIS_REQUIRES_EVIDENCE" }, { status: 400 });
  const normalizedMetrics: MetricInput[] = [];
  for (const metric of metrics as MetricInput[]) {
    if (!metric || typeof metric.metricKey !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(metric.metricKey)
      || (metric.amountValue != null && (typeof metric.amountValue !== "string" || !decimal.test(metric.amountValue)))
      || (metric.quantityValue != null && (typeof metric.quantityValue !== "string" || !decimal.test(metric.quantityValue)))
      || (metric.asOfDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(metric.asOfDate))
      || (metric.calculationFormula != null && (typeof metric.calculationFormula !== "string" || metric.calculationFormula.length > 500))
      || (metric.calculationInputs != null && (typeof metric.calculationInputs !== "object" || Array.isArray(metric.calculationInputs)))) return NextResponse.json({ ok: false, error: "INVALID_METRIC" }, { status: 400 });
    if (metric.calculationFormula?.toUpperCase() === "PRICE_TIMES_SHARES") {
      const price = metric.calculationInputs?.price;
      const shares = metric.calculationInputs?.shares;
      if (typeof price !== "string" || !decimal.test(price) || typeof shares !== "string" || !decimal.test(shares)) return NextResponse.json({ ok: false, error: "INVALID_CALCULATION_INPUTS" }, { status: 400 });
      const calculated = multiplyExactDecimalStrings(price, shares);
      if (metric.amountValue != null && metric.amountValue !== calculated) return NextResponse.json({ ok: false, error: "CALCULATION_MISMATCH", expectedAmountValue: calculated }, { status: 422 });
      normalizedMetrics.push({ ...metric, amountValue: calculated, calculationInputs: { ...metric.calculationInputs, calculatedAmount: calculated } });
    } else normalizedMetrics.push(metric);
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const eventResult = await client.query<{ id: string; ticker: string | null; verification_status: string; event_status: string; related_event_id: string | null; title: string; source_url: string }>(
      `SELECT id::text,ticker,verification_status,event_status,related_event_id::text,title,source_url FROM stockman_events WHERE id=$1 FOR UPDATE`, [Number(rawId)]);
    const event = eventResult.rows[0];
    if (!event) { await client.query("ROLLBACK"); return NextResponse.json({ ok: false, error: "EVENT_NOT_FOUND" }, { status: 404 }); }
    const documentIds = [...new Set(evidenceDocumentIds as string[])];
    if (relatedEventId) {
      const related = await client.query(`SELECT 1 FROM stockman_events WHERE id=$1`, [Number(relatedEventId)]);
      if (!related.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ ok: false, error: "RELATED_EVENT_NOT_FOUND" }, { status: 404 }); }
    }
    const docs = documentIds.length ? await client.query<{ id: string; source_url: string; verification_status: string; source: string }>(
      `SELECT id::text,source_url,verification_status,source FROM stockman_event_documents WHERE event_id=$1 AND id=ANY($2::bigint[])`, [Number(rawId), documentIds]) : { rows: [] as Array<{ id: string; source_url: string; verification_status: string; source: string }> };
    if (grade !== "EXCLUDED" && (docs.rows.length !== documentIds.length || !event.ticker
      || docs.rows.some((doc) => !doc.source_url.startsWith("https://") || doc.source === "STOCKTITAN")
      || !(await client.query(`SELECT 1 FROM us_common_stock_universe WHERE enabled=TRUE AND instrument_type='COMMON_STOCK' AND UPPER(code)=UPPER($1) AND UPPER(market)=ANY($2::text[]) LIMIT 1`, [event.ticker, ["NASDAQ", "NAS", "NYSE", "NYS", "AMEX", "AMS"]])).rowCount)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "OFFICIAL_SOURCE_OR_ACTIVE_COMMON_STOCK_REQUIRED" }, { status: 422 });
    }
    if (grade !== "EXCLUDED" && docs.rows.some((doc) => doc.verification_status !== "VERIFIED")) {
      const note = typeof body.verificationNote === "string" ? body.verificationNote.trim() : "";
      if (note.length < 10) { await client.query("ROLLBACK"); return NextResponse.json({ ok: false, error: "VERIFICATION_NOTE_REQUIRED" }, { status: 422 }); }
      await client.query(`UPDATE stockman_event_documents SET verification_status='VERIFIED' WHERE event_id=$1 AND id=ANY($2::bigint[])`, [Number(rawId), documentIds]);
    }
    const verificationStatus = grade === "EXCLUDED" ? event.verification_status : "VERIFIED";
    const currentState = { verificationStatus: event.verification_status, bullishGrade: grade, bullishReason, bearishReason, dilutionRisk, evidenceDocumentIds: documentIds };
    if (verificationStatus !== event.verification_status) {
      await client.query(`UPDATE stockman_events SET verification_status=$2,updated_at=NOW() WHERE id=$1`, [Number(rawId), verificationStatus]);
      await client.query(`INSERT INTO stockman_event_history(event_id,change_type,before_state,after_state,reason,evidence_url) VALUES($1,'VERIFICATION_CHANGED',$2::jsonb,$3::jsonb,$4,$5)`,
        [Number(rawId), JSON.stringify({ verificationStatus: event.verification_status }), JSON.stringify(currentState), String(body.verificationNote ?? "Operator reviewed official source"), docs.rows[0]?.source_url ?? event.source_url]);
    }
    const nextEventStatus = eventStatus ?? event.event_status;
    const nextRelatedEventId = relatedEventId ?? event.related_event_id;
    if (nextEventStatus !== event.event_status || nextRelatedEventId !== event.related_event_id) {
      await client.query(`UPDATE stockman_events SET event_status=$2,related_event_id=$3::bigint,updated_at=NOW() WHERE id=$1`, [Number(rawId), nextEventStatus, nextRelatedEventId]);
      await client.query(`INSERT INTO stockman_event_history(event_id,change_type,before_state,after_state,reason,evidence_url) VALUES($1,'EVENT_RELATION_OR_STATUS_CHANGED',$2::jsonb,$3::jsonb,$4,$5)`,
        [Number(rawId), JSON.stringify({ eventStatus: event.event_status, relatedEventId: event.related_event_id }), JSON.stringify({ eventStatus: nextEventStatus, relatedEventId: nextRelatedEventId }), String(body.verificationNote ?? "Operator updated event relation/status"), docs.rows[0]?.source_url ?? event.source_url]);
    }
    const revisionPayload = { grade, bullishReason, bearishReason, dilutionRisk, unknownFactors, evidenceQuotes, evidenceDocumentIds: documentIds, metrics: normalizedMetrics };
    const revisionHash = eventRevisionHash(revisionPayload);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO stockman_event_analyses(event_id,analysis_version,revision_hash,bullish_grade,bullish_reason,bearish_reason,dilution_risk,key_metrics,unknown_factors)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT(event_id,revision_hash) DO NOTHING RETURNING id::text`,
      [Number(rawId), STOCKMAN_EVENT_ANALYSIS_VERSION, revisionHash, grade, bullishReason, bearishReason, dilutionRisk, JSON.stringify({ evidenceQuotes, evidenceDocumentIds: documentIds }), JSON.stringify(unknownFactors)]);
    for (const metric of normalizedMetrics) {
      const sourceDocumentId = metric.sourceDocumentId ?? (documentIds.length === 1 ? documentIds[0] : null);
      if (sourceDocumentId && !documentIds.includes(sourceDocumentId)) { await client.query("ROLLBACK"); return NextResponse.json({ ok: false, error: "METRIC_SOURCE_DOCUMENT_NOT_VERIFIED" }, { status: 422 }); }
      await client.query(
        `INSERT INTO stockman_event_metrics(event_id,metric_key,revision_hash,amount_value,quantity_value,currency,unit,as_of_date,split_adjustment,calculation_formula,calculation_inputs,source_document_id)
         VALUES($1,$2,$3,$4::numeric,$5::numeric,$6,$7,$8::date,$9,$10,$11::jsonb,$12::bigint) ON CONFLICT(event_id,metric_key,revision_hash) DO NOTHING`,
        [Number(rawId), metric.metricKey, revisionHash, metric.amountValue ?? null, metric.quantityValue ?? null, metric.currency ?? null, metric.unit ?? null, metric.asOfDate ?? null, metric.splitAdjustment ?? null, metric.calculationFormula ?? null, JSON.stringify(metric.calculationInputs ?? {}), sourceDocumentId]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, eventId: rawId, revisionHash, analysisId: inserted.rows[0]?.id ?? null, verificationStatus, version: STOCKMAN_EVENT_ANALYSIS_VERSION }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({ ok: false, error: "EVENT_ANALYSIS_SAVE_FAILED" }, { status: 503 });
  } finally { client.release(); }
}
