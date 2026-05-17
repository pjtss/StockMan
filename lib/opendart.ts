import { ContractDetails } from "./types";

const OPENDART_API_KEY = process.env.OPENDART_API_KEY;
const BASE_URL = "https://opendart.fss.or.kr/api";

// Simple in-memory cache for corp_code lookups to prevent excessive API calls
// Keys are rceptNo, values are corp_code
const corpCodeCache = new Map<string, string>();

/**
 * Fetches the corp_code for a given rcept_no by searching the list.json API
 * for the date of the receipt.
 */
async function getCorpCodeByRceptNo(rceptNo: string): Promise<string | null> {
  if (corpCodeCache.has(rceptNo)) {
    return corpCodeCache.get(rceptNo)!;
  }

  if (!OPENDART_API_KEY || rceptNo.length !== 14) return null;

  // The first 8 digits of rceptNo represent the date (YYYYMMDD)
  const dateStr = rceptNo.slice(0, 8);

  try {
    const url = `${BASE_URL}/list.json?crtfc_key=${OPENDART_API_KEY}&bgn_de=${dateStr}&end_de=${dateStr}&page_count=100`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    
    if (!res.ok) return null;
    const data = await res.json();

    if (data.status !== "000" || !data.list) {
      console.error("OpenDART list.json API Error:", data.message);
      return null;
    }

    // Cache all corp_codes from today's list to optimize future lookups
    for (const item of data.list) {
      if (item.rcept_no && item.corp_code) {
        corpCodeCache.set(item.rcept_no, item.corp_code);
      }
    }

    return corpCodeCache.get(rceptNo) || null;
  } catch (error) {
    console.error("Failed to fetch corp_code:", error);
    return null;
  }
}

/**
 * Fetches contract details for "단일판매ㆍ공급계약체결" using snglpnrsctrt.json
 */
export async function getContractDetails(rceptNo: string): Promise<ContractDetails | null> {
  const corpCode = await getCorpCodeByRceptNo(rceptNo);
  if (!corpCode) return null;

  const dateStr = rceptNo.slice(0, 8);

  try {
    const url = `${BASE_URL}/snglpnrsctrt.json?crtfc_key=${OPENDART_API_KEY}&corp_code=${corpCode}&bgn_de=${dateStr}&end_de=${dateStr}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    
    if (!res.ok) return null;
    const data = await res.json();

    if (data.status !== "000" || !data.list) {
      console.error("OpenDART snglpnrsctrt API Error:", data.message);
      return null;
    }

    // A company might have multiple contracts on the same day. Match by rcept_no.
    const contract = data.list.find((item: any) => item.rcept_no === rceptNo);
    
    if (!contract) return null;

    // Formatting currency and percentages
    const formatCurrency = (val: string) => {
      const num = parseInt(val.replace(/,/g, ""), 10);
      if (isNaN(num)) return val;
      if (num >= 100000000) {
        return `${(num / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
      }
      return `${num.toLocaleString('ko-KR')}원`;
    };

    return {
      contractAmount: formatCurrency(contract.cntrct_amt || "0"),
      salesRatio: contract.sales_amount_stle || "N/A",
      partner: contract.cntrct_prtnr || "비공개",
      period: `${contract.cntrct_bgn_de || "?"} ~ ${contract.cntrct_end_de || "?"}`
    };
  } catch (error) {
    console.error("Failed to fetch contract details:", error);
    return null;
  }
}
