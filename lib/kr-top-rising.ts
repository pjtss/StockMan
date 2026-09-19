export type KrTopRisingItem = {
  market: "KOSPI" | "KOSDAQ";
  code: string;
  name?: string;
  rank?: number;
  rate?: number;
  volume?: number;
  tradingValue?: number;
  observedAt?: string;
};

function numeric(value: unknown) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeKrTopRisingRows(rows: Array<Record<string, unknown>>, observedAt: string): KrTopRisingItem[] {
  return rows.map((row, index) => {
    const marketName = String(row.rprs_mrkt_kor_name ?? row.market ?? "");
    const market: KrTopRisingItem["market"] = marketName.includes("코스닥") || String(row.market).toUpperCase() === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
    const code = String(row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.code ?? "").trim();
    return {
      market,
      code,
      name: String(row.hts_kor_isnm ?? row.name ?? "").trim() || undefined,
      rank: numeric(row.data_rank ?? row.rank) ?? index + 1,
      rate: numeric(row.prdy_ctrt ?? row.rate ?? row.changeRate),
      volume: numeric(row.acml_vol ?? row.volume ?? row.rankingVolume),
      tradingValue: numeric(row.acml_tr_pbmn ?? row.acml_tr_pbmn_amt ?? row.tradingValue),
      observedAt,
    };
  }).filter((item) => item.code);
}
