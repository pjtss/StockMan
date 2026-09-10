const operators = new Set(["=", "!=", ">", ">=", "<", "<="]);
const metricFields = new Set([
  "marketCap",
  ...["D", "W", "M"].flatMap((tf) => [
    `${tf}.close`, `${tf}.high`, `${tf}.low`, `${tf}.volume`, `${tf}.rvol`, `${tf}.changePct`,
    `${tf}.closeVsEma20`, `${tf}.closeVsEma60`,
    `${tf}.emaGoldenCross`, `${tf}.bb.upper`, `${tf}.bb.middle`, `${tf}.bb.lower`,
    `${tf}.bb.width`, `${tf}.bb.lowerTouch`, `${tf}.bb.lowerBreak`,
    `${tf}.obv.signalTrend`, `${tf}.adl.signalTrend`,
  ]),
]);
const isMetricField = (field: string) => metricFields.has(field);

export function validateScreenerRequest(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "INVALID_BODY";
  const value = body as Record<string, unknown>;
  if (value.market != null && !["KR", "US", "ALL"].includes(String(value.market))) return "INVALID_MARKET";
  if (value.timeframe != null && !["D", "W", "M"].includes(String(value.timeframe))) return "INVALID_TIMEFRAME";
  if (value.asOf != null && value.asOf !== "LATEST") {
    if (typeof value.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)) return "INVALID_AS_OF";
    const [year, month, day] = value.asOf.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "INVALID_AS_OF";
  }
  if (value.logic != null && !["AND", "OR"].includes(String(value.logic))) return "INVALID_LOGIC";
  if (value.instrumentType != null && value.instrumentType !== "COMMON_STOCK") return "INVALID_INSTRUMENT_TYPE";
  if (value.status != null && value.status !== "ACTIVE") return "INVALID_STATUS";
  if (value.exchange != null && (!Array.isArray(value.exchange) || value.exchange.some((exchange) => typeof exchange !== "string" || !exchange.trim()))) return "INVALID_EXCHANGE";
  if (value.limit != null && (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 1000)) return "INVALID_LIMIT";
  if (value.filters != null && (!Array.isArray(value.filters) || value.filters.some((filter) => {
    if (!filter || typeof filter !== "object") return true;
    const item = filter as Record<string, unknown>;
    if (typeof item.field !== "string" || !operators.has(String(item.operator)) || (typeof item.value !== "string" && typeof item.value !== "number" && typeof item.value !== "boolean")) return true;
    if (!isMetricField(item.field)) return true;
    const numericField = item.field === "marketCap" || /\.(close|high|low|volume|rvol|changePct|bb\.(upper|middle|lower|width))$/.test(item.field);
    if (!numericField) return false;
    if (typeof item.value === "number") return !Number.isFinite(item.value) || item.value < 0;
    return typeof item.value !== "string" || !/^[DWM]\.bb\.(upper|middle|lower)$/.test(item.value);
  }))) return "INVALID_FILTERS";
  if (value.ranking != null && (!Array.isArray(value.ranking) || value.ranking.some((rule) => {
    if (!rule || typeof rule !== "object") return true;
    const item = rule as Record<string, unknown>;
    return typeof item.field !== "string" || !isMetricField(item.field) || !["ASC", "DESC"].includes(String(item.direction));
  }))) return "INVALID_RANKING";
  if (value.ema9Conditions != null && (!value.ema9Conditions || typeof value.ema9Conditions !== "object" || Object.entries(value.ema9Conditions as Record<string, unknown>).some(([timeframe, condition]) => !["D", "W", "M"].includes(timeframe) || !["ANY", "ABOVE", "NOT_ABOVE"].includes(String(condition))))) return "INVALID_EMA9_CONDITIONS";
  if (value.emaPositionConditions != null && (!value.emaPositionConditions || typeof value.emaPositionConditions !== "object" || Object.entries(value.emaPositionConditions as Record<string, unknown>).some(([period, condition]) => !["EMA20", "EMA60"].includes(period) || !["ANY", "ABOVE", "NOT_ABOVE"].includes(String(condition))))) return "INVALID_EMA_POSITION_CONDITIONS";
  return null;
}
