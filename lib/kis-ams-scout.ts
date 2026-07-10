import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";

export type AmsScoutCandidate = {
  symb: string;
  name: string;
  ename: string;
  rank: number;
  price: number;
  changeRate: number;
  tradeAmount: number;
  prevTradeAmount: number;
  prevVolume: number;
  marketCap: number | null;
  minuteTradeAmount: number;
  minuteTradeAmount3m: number;
  minuteTradeAmount5m: number;
  minuteVolume3m: number;
  score: number;
  reason: string[];
  raw: {
    ranking: unknown;
    detail: unknown;
    chart: unknown;
  };
};

export type AmsScoutResponse = {
  ok: boolean;
  status: number;
  request: {
    ranking: { url: string; headers: Record<string, string> };
    detail: { url: string; headers: Record<string, string> };
  };
  candidates: AmsScoutCandidate[];
};

function parseNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pickDetailOutput(parsed: any) {
  const candidate =
    parsed?.output ??
    parsed?.output1?.output ??
    parsed?.output1 ??
    parsed?.output2?.output ??
    parsed?.output2 ??
    parsed ??
    {};
  return candidate && typeof candidate === "object" ? candidate : {};
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function resolveAuthorization(prefix: string | undefined, token: string) {
  const value = String(prefix ?? "").trim();
  if (!value || value.toLowerCase() === "bearer") {
    return `Bearer ${token}`;
  }
  if (value.toLowerCase().startsWith("bearer ")) {
    return value;
  }
  return `${value} ${token}`.trim();
}

function buildAuthHeaders(prefix: string | undefined, token: string) {
  const authorization = resolveAuthorization(prefix, token);
  return { authorization };
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { method: "GET", headers });
  const rawText = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = null;
  }
  return { res, rawText, parsed };
}

function isExpiredTokenResponse(parsed: any) {
  const msgCd = String(parsed?.msg_cd ?? "");
  const msg1 = String(parsed?.msg1 ?? "");
  return msgCd === "EGW00123" || msg1.includes("token");
}

export async function fetchAmsScoutCandidates(): Promise<AmsScoutResponse> {
  let activeToken = await getAccessToken();
  if (!activeToken) {
    return { ok: false, status: 500, request: { ranking: { url: "", headers: {} }, detail: { url: "", headers: {} } }, candidates: [] };
  }

  const rankConfig = await loadKisApiConfig("us_updown_rate");
  const detailConfig = await loadKisApiConfig("us_price_detail");
  const topN = Math.max(1, Math.min(20, Number(process.env.US_AMS_SCOUT_TOP_N || "10")));
  const baseHeaders = {
    "content-type": rankConfig.content_type || "application/json; charset=utf-8",
    appkey: process.env.KIS_APPKEY || "",
    appsecret: process.env.KIS_APPSECRET || "",
    tr_id: "HHDFS76320010",
    custtype: "P",
    tr_cont: "",
    ...buildAuthHeaders(rankConfig.authorization, activeToken),
  };

  const refreshTokenOnce = async () => {
    const freshToken = await refreshAccessToken();
    if (freshToken) {
      activeToken = freshToken;
      baseHeaders.authorization = resolveAuthorization(rankConfig.authorization, freshToken);
    }
    return freshToken;
  };

  const rankingUrl =
    `https://openapi.koreainvestment.com:9443/uapi/overseas-stock/v1/ranking/trade-pbmn` +
    `?AUTH=&EXCD=AMS&NDAY=0&VOL_RANG=0&PRC1=&PRC2=&KEYB=`;
  const rankingRes = await fetchJson(rankingUrl, baseHeaders);
  const rankingOutput = rankingRes.parsed?.output2 ?? [];
  const rankingRows = Array.isArray(rankingOutput) ? rankingOutput.slice(0, topN) : [];
  const detailRequestHeaders = {
    ...baseHeaders,
    ...buildAuthHeaders(detailConfig.authorization, activeToken),
    tr_id: detailConfig.tr_id || "HHDFS76200200",
  };

  const enriched: AmsScoutCandidate[] = [];

  for (const row of rankingRows) {
    const symb = String(row.symb || "").trim();
    if (!symb) continue;

    const detailUrl =
      `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/price-detail?AUTH=&EXCD=AMS&SYMB=${encodeURIComponent(symb)}`;
    let detailRes = await fetchJson(detailUrl, detailRequestHeaders);
    if (isExpiredTokenResponse(detailRes.parsed)) {
      const freshToken = await refreshTokenOnce();
      if (freshToken) {
        const refreshedDetailHeaders = {
          ...baseHeaders,
          ...buildAuthHeaders(detailConfig.authorization, freshToken),
          tr_id: detailConfig.tr_id || "HHDFS76200200",
        };
        detailRes = await fetchJson(detailUrl, {
          ...refreshedDetailHeaders,
        });
      }
    }

    const chartUrl =
      `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice?` +
      `AUTH=&EXCD=AMS&SYMB=${encodeURIComponent(symb)}&NMIN=1&PINC=1&NEXT=&NREC=120&FILL=&KEYB=`;
    let chartRes = await fetchJson(chartUrl, {
      ...baseHeaders,
      tr_id: "HHDFS76950200",
    });
    if (isExpiredTokenResponse(chartRes.parsed)) {
      const freshToken = await refreshTokenOnce();
      if (freshToken) {
        chartRes = await fetchJson(chartUrl, {
          ...baseHeaders,
          tr_id: "HHDFS76950200",
        });
      }
    }

    const detail = pickDetailOutput(detailRes.parsed);
    const chartRows = Array.isArray(chartRes.parsed?.output2) ? chartRes.parsed.output2 : [];
    const minuteValues = chartRows.map((r: any) => {
      const open = parseNumber(r.open);
      const high = parseNumber(r.high);
      const low = parseNumber(r.low);
      const last = parseNumber(r.last);
      const volume = parseNumber(r.evol);
      const avg = (open + high + low + last) / 4;
      return avg * volume;
    });

    const minute3 = sum(minuteValues.slice(-3));
    const minute5 = sum(minuteValues.slice(-5));
    const minute1 = minuteValues.at(-1) ?? 0;
    const tradeAmount = parseNumber(row.tamt);
    const prevTradeAmount = parseNumber(detail.pamt);
    const prevVolume = parseNumber(detail.pvol);
    const marketCap = parseNumber(detail.tomv ?? detail.mcap);
    const price = parseNumber(detail.last ?? detail.lastprice ?? row.last);
    const changeRate = parseNumber(row.rate);
    const volumeRatio = minute5 > 0 && tradeAmount > 0 ? tradeAmount / minute5 : 0;
    const marketCapRatio = marketCap > 0 ? tradeAmount / marketCap : 0;

    const reason = [
      `거래대금순위 ${row.rank}`,
      `당일 거래대금 ${tradeAmount.toLocaleString()}`,
      `시총 대비 ${marketCap > 0 ? marketCapRatio.toFixed(4) : "N/A"}`,
      `최근 5분 거래대금 ${minute5.toLocaleString()}`,
    ];

    const score = Math.round(
      (tradeAmount / 100000000) * 2 +
      marketCapRatio * 1000 +
      volumeRatio * 25 +
      Math.max(0, changeRate) * 3 +
      (minute3 / 100000000) * 4
    );

    enriched.push({
      symb,
      name: String(row.name || detail.name || symb),
      ename: String(row.ename || ""),
      rank: Number(row.rank || 0),
      price,
      changeRate,
      tradeAmount,
      prevTradeAmount,
      prevVolume,
      marketCap,
      minuteTradeAmount: minute1,
      minuteTradeAmount3m: minute3,
      minuteTradeAmount5m: minute5,
      minuteVolume3m: sum(chartRows.slice(-3).map((r: any) => parseNumber(r.evol))),
      score,
      reason,
      raw: { ranking: row, detail, chart: chartRows },
    });
  }

  enriched.sort((a, b) => b.score - a.score);

  return {
    ok: rankingRes.res.ok,
    status: rankingRes.res.status,
    request: {
      ranking: {
        url: rankingUrl,
        headers: {
          authorization: "Bearer <masked>",
          Authorization: "Bearer <masked>",
        appkey: "<masked>",
        appsecret: "<masked>",
        "content-type": baseHeaders["content-type"],
          tr_id: "HHDFS76320010",
          custtype: "P",
          tr_cont: "",
        },
      },
      detail: {
        url: `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/price-detail?AUTH=&EXCD=AMS&SYMB=<masked>`,
        headers: {
          authorization: detailRequestHeaders.authorization ? "Bearer <masked>" : "",
          appkey: "<masked>",
          appsecret: "<masked>",
          "content-type": detailRequestHeaders["content-type"],
          tr_id: detailRequestHeaders.tr_id,
          custtype: detailRequestHeaders.custtype,
          tr_cont: detailRequestHeaders.tr_cont || "",
        },
      },
    },
    candidates: enriched,
  };
}
