const baseUrl = process.argv[2] || "http://localhost:3000/api/scan/us-accumulation?limit=10";
const iterations = Math.max(1, Number.parseInt(process.argv[3] || "5", 10));

const samples = [];
for (let index = 0; index < iterations; index += 1) {
  const started = performance.now();
  let response;
  let body = {};
  let error = null;
  try {
    response = await fetch(baseUrl, { cache: "no-store" });
    body = await response.json().catch(() => ({}));
  } catch (cause) {
    error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }
  const elapsedMs = Math.round(performance.now() - started);
  samples.push({
    status: response?.status ?? null,
    elapsedMs,
    loadMs: Number(response?.headers.get("x-scan-load-ms") || body.timings?.loadMs || 0),
    evaluateMs: Number(response?.headers.get("x-scan-evaluate-ms") || body.timings?.evaluateMs || 0),
    totalMs: Number(response?.headers.get("x-scan-total-ms") || body.timings?.totalMs || elapsedMs),
    matched: body.summary?.matched ?? null,
    returned: body.summary?.returned ?? null,
    ...(error ? { error } : {}),
  });
}

const percentile = (key, p) => {
  const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))];
};
const average = (key) => Math.round(samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length);
console.log(JSON.stringify({
  url: baseUrl,
  iterations,
  statuses: [...new Set(samples.map((sample) => sample.status))],
  summary: { matched: samples.at(-1)?.matched ?? null, returned: samples.at(-1)?.returned ?? null },
  timingsMs: {
    average: { load: average("loadMs"), evaluate: average("evaluateMs"), total: average("totalMs"), wall: average("elapsedMs") },
    p50: { load: percentile("loadMs", 0.5), evaluate: percentile("evaluateMs", 0.5), total: percentile("totalMs", 0.5), wall: percentile("elapsedMs", 0.5) },
    p95: { load: percentile("loadMs", 0.95), evaluate: percentile("evaluateMs", 0.95), total: percentile("totalMs", 0.95), wall: percentile("elapsedMs", 0.95) },
  },
  samples,
}, null, 2));
