const cleanEnv = (v) => {
  if (v == null) return "";
  const t = String(v).trim();
  // Allow users to wrap env values in quotes in .env.local
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
};

const maskToken = (s) => {
  if (!s || typeof s !== "string") return s;
  if (s.length <= 20) return "...[MASKED]...";
  return `${s.slice(0, 10)}...[MASKED]...${s.slice(-10)}`;
};

const readDotEnvLocal = async () => {
  // Avoid adding new deps; parse .env.local ourselves.
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(new URL("../.env.local", import.meta.url), "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1);
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
};

async function main() {
  const dot = await readDotEnvLocal();
  const appkey = cleanEnv(dot.KIS_APPKEY ?? process.env.KIS_APPKEY);
  const appsecret = cleanEnv(dot.KIS_APPSECRET ?? process.env.KIS_APPSECRET);
  const accessTokenFromEnv = cleanEnv(dot.KIS_ACCESS_TOKEN ?? process.env.KIS_ACCESS_TOKEN);

  console.log("=== env check ===");
  console.log(
    JSON.stringify(
      {
        hasAppKey: Boolean(appkey),
        hasAppSecret: Boolean(appsecret),
        appKeyPreview: appkey ? `${appkey.slice(0, 4)}...[MASKED]...${appkey.slice(-4)}` : null,
        hasAccessTokenFromEnv: Boolean(accessTokenFromEnv),
      },
      null,
      2
    )
  );

  const accessToken = accessTokenFromEnv;
  if (!accessToken) {
    console.error("KIS_ACCESS_TOKEN missing in .env.local (or env).");
    process.exit(2);
  }

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    // volume-power (체결강도 상위) 문서 기준: v1_국내주식-101
    FID_COND_SCR_DIV_CODE: "20168",
    FID_INPUT_ISCD: "0000",
    FID_DIV_CLS_CODE: "0",
    FID_BLNG_CLS_CODE: "0",
    FID_TRGT_CLS_CODE: "111111111",
    FID_TRGT_EXLS_CLS_CODE: "000000000",
    FID_INPUT_PRICE_1: "0",
    FID_INPUT_PRICE_2: "0",
    FID_VOL_CNT: "0",
    FID_INPUT_CNT_1: "0",
    FID_INPUT_CNT_2: "0",
    FID_STOC_PRE_KYWD_CLS_CODE: "00",
    FID_SUB_AND_DO_CLS_CODE: "N",
  });

  const url =
    "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/ranking/volume-power?" + params.toString();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      appkey,
      appsecret,
      tr_id: "FHPST01680000",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  console.log("=== volume-power response ===");
  const keys = json && json.output && json.output[0] ? Object.keys(json.output[0]) : null;
  console.log(JSON.stringify({ ok: res.ok, status: res.status, firstOutputKeys: keys, data: json }, null, 2));
}

main().catch((e) => {
  console.error("CALL_FAILED", e && (e.cause || e));
  process.exit(1);
});
