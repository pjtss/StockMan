export const SEC_SMALLCAP_MAX_USD = 100_000_000;

const ALLOWED_MARKETS = new Set(["NAS", "NASDAQ", "NYS", "NYSE", "AMS", "AMEX"]);

export type SecSmallcapCandidate = {
  market: string;
  ticker: string;
  name: string;
  marketCapUsd: number;
  priceUsd: number | null;
};

export type SecSharesFact = {
  shares: number;
  end: string;
  filed: string;
  accessionNumber: string;
  form: string;
};

type UnitFacts = { val?: unknown; end?: unknown; filed?: unknown; accn?: unknown; form?: unknown }[];
const ALLOWED_SEC_FORMS = new Set(["10-K", "10-Q", "20-F", "40-F", "6-K", "10-K/A", "10-Q/A", "20-F/A", "40-F/A", "6-K/A"]);
export type SecSharesFacts = {
  dei: SecSharesFact | null;
  usGaap: SecSharesFact | null;
};

export function isSecEligibleSmallcapCandidate(candidate: SecSmallcapCandidate) {
  return ALLOWED_MARKETS.has(candidate.market.toUpperCase())
    && /^[A-Z][A-Z0-9.-]{0,14}$/.test(candidate.ticker.toUpperCase())
    && Number.isFinite(candidate.marketCapUsd)
    && candidate.marketCapUsd > 0
    && candidate.marketCapUsd <= SEC_SMALLCAP_MAX_USD;
}

function selectLatestFact(payload: Record<string, any>, taxonomy: "dei" | "us-gaap", tag: string): SecSharesFact | null {
  const units = payload.facts?.[taxonomy]?.[tag]?.units?.shares as Record<string, UnitFacts> | undefined;
  if (!units || typeof units !== "object") return null;
  const facts = Object.values(units).flat().filter((item) => {
    const shares = Number(item?.val);
    const form = String(item?.form ?? "").toUpperCase();
    return Number.isSafeInteger(shares) && shares > 0
      && /^\d{4}-\d{2}-\d{2}$/.test(String(item?.end ?? ""))
      && /^\d{4}-\d{2}-\d{2}$/.test(String(item?.filed ?? ""))
      && ALLOWED_SEC_FORMS.has(form);
  });
  facts.sort((a, b) => String(b.filed).localeCompare(String(a.filed)) || String(b.end).localeCompare(String(a.end)));
  const latest = facts[0];
  if (!latest) return null;
  return { shares: Number(latest.val), end: String(latest.end), filed: String(latest.filed), accessionNumber: String(latest.accn ?? ""), form: String(latest.form ?? "") };
}

/** Select latest facts independently for the DEI cover-page tag and US-GAAP balance-sheet tag. */
export function selectSecSharesFacts(payload: unknown): SecSharesFacts {
  const root = payload && typeof payload === "object" ? payload as Record<string, any> : {};
  return {
    dei: selectLatestFact(root, "dei", "EntityCommonStockSharesOutstanding"),
    usGaap: selectLatestFact(root, "us-gaap", "CommonStockSharesOutstanding"),
  };
}

/** Legacy selector retained for callers that expect the DEI fact only. */
export function selectLatestSecSharesFact(payload: unknown): SecSharesFact | null {
  return selectSecSharesFacts(payload).dei;
}
