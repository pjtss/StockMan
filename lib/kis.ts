export interface StockIntensity {
  rank: number;
  company: string;
  code: string;
  intensity: number; // 체결강도 (%)
  price: string;
  change: string;
  changeRate: string;
}

const KIS_APPKEY = process.env.KIS_APPKEY;
const KIS_APPSECRET = process.env.KIS_APPSECRET;

async function getAccessToken(): Promise<string | null> {
  if (!KIS_APPKEY || !KIS_APPSECRET) return null;
  
  try {
    const response = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: KIS_APPKEY,
        appsecret: KIS_APPSECRET,
      }),
    });
    const data = await response.json();
    return data.access_token;
  } catch (err) {
    console.error("KIS Access Token Error:", err);
    return null;
  }
}

export async function fetchTradingIntensity(): Promise<StockIntensity[]> {
  const token = await getAccessToken();
  
  if (!token) {
    // Mock data if API is not configured
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      company: `Mock Company ${i + 1}`,
      code: `00000${i}`,
      intensity: 150 - i * 5,
      price: "75,000",
      change: "+1,200",
      changeRate: "+1.5%",
    }));
  }

  try {
    // Example endpoint for trading intensity ranking
    // Note: Actual KIS endpoint for "체결강도 상위" needs to be verified
    // This is a placeholder for the actual API call
    const response = await fetch("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/ranking/trading-intensity", {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "appkey": KIS_APPKEY!,
        "appsecret": KIS_APPSECRET!,
        "tr_id": "FHPST01750000", // Placeholder TR_ID
      },
    });
    
    if (!response.ok) throw new Error("KIS API Response Error");
    
    const data = await response.json();
    // Transform KIS response to StockIntensity[]
    return (data.output || []).map((item: any, i: number) => ({
      rank: i + 1,
      company: item.hts_kor_isnm,
      code: item.mksc_shrn_iscd,
      intensity: parseFloat(item.t_x_intensity),
      price: item.stck_prpr,
      change: item.prdy_vrss,
      changeRate: item.prdy_ctrt,
    }));
  } catch (err) {
    console.error("KIS Fetch Intensity Error:", err);
    return [];
  }
}
