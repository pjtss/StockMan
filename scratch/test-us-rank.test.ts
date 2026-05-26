import { describe, it } from "vitest";
import fs from "fs";
import path from "path";

// Load .env.local manually for Vitest execution
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.warn("Failed to load .env.local manually:", e);
}

describe("KIS US Rank API live test", () => {
  it("should print raw response of updown-rate", async () => {
    const KIS_APPKEY = process.env.KIS_APPKEY || "";
    const KIS_APPSECRET = process.env.KIS_APPSECRET || "";

    if (!KIS_APPKEY || !KIS_APPSECRET) {
      console.error("APPKEY or APPSECRET is missing in process.env");
      return;
    }

    // 1. KIS OpenAPI 토큰 발급 API 직접 강제 호출
    const tokenUrl = "https://openapi.koreainvestment.com:9443/oauth2/tokenP";
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: KIS_APPKEY,
        appsecret: KIS_APPSECRET,
      }),
    });

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;
    if (!token) {
      console.error("Failed to retrieve access token:", tokenData);
      return;
    }

    // 2. 등락율 순위 API 호출 (사용자가 성공시킨 쿼리 스펙 동기화)
    const params = new URLSearchParams({
      EXCD: "NAS",
      GUBN: "1",
      NDAY: "0",
      VOL_RANG: "5",
    });

    const baseUrl = "https://openapi.koreainvestment.com:9443";
    const trId = "HHDFS76290000"; // 해외주식 상승율/하락율 TR_ID
    const url = `${baseUrl}/uapi/overseas-stock/v1/ranking/updown-rate?${params.toString()}`;

    console.log("Target API URL:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        appkey: KIS_APPKEY,
        appsecret: KIS_APPSECRET,
        tr_id: trId,
        custtype: "P",
      },
    });

    console.log("API Response HTTP status:", response.status);
    const resData = await response.json();
    console.log("Raw API Response JSON:", JSON.stringify(resData, null, 2));
  });
});
