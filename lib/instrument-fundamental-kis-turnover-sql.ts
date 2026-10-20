const OUTPUT_KEYS = ["output", "output1", "output2"] as const;

/**
 * SQL equivalent of getKisUsPriceDetailTradingValue for persisted raw KIS JSON.
 * Match its first-present output envelope selection (rather than merging fields
 * across output objects). Positive tamt/tamnt wins; otherwise use that object's pamt.
 */
export function instrumentFundamentalKisTurnoverSql(rawPayloadSql: "raw_payload" | "h.raw_payload") {
  if (rawPayloadSql !== "raw_payload" && rawPayloadSql !== "h.raw_payload") {
    throw new Error("Unsupported raw payload SQL column");
  }
  const output = `COALESCE(${OUTPUT_KEYS.map((key) => `NULLIF(${rawPayloadSql}::jsonb->'${key}', 'null'::jsonb)`).join(", ")})`;
  const current = `NULLIF(COALESCE(${output}->>'tamt', ${output}->>'tamnt'), '')::numeric`;
  const previous = `NULLIF(${output}->>'pamt', '')::numeric`;
  return `(CASE WHEN COALESCE(${current}, 0) > 0 THEN ${current} ELSE ${previous} END)`;
}
