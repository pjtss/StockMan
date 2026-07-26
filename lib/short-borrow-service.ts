import { alpacaGet } from "@/lib/alpaca-client";
import { calculatePercent, normalizeAlpacaSymbol, scoreShortPressure, type BorrowStatus, type ShortBorrowResult } from "@/lib/alpaca-short-borrow";
import { loadPreviousShortBorrow, saveShortBorrowSnapshot } from "@/lib/short-borrow-repository";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { DEFAULT_SHORT_BORROW_POLICY, type ShortBorrowScorePolicy } from "@/lib/short-borrow-policy";

type AssetResponse = { symbol?: string; tradable?: boolean; shortable?: boolean; borrow_status?: string };
type QuoteResponse = { quotes?: Array<{ symbol?: string; available_qty?: number; price?: string | number; quoted_at?: string }>; errors?: Array<{ symbol?: string; code?: string; message?: string }> };

function borrowStatus(asset: AssetResponse): BorrowStatus {
  if (asset.shortable === false) return "NOT_SHORTABLE";
  if (String(asset.borrow_status || "").toLowerCase() === "easy_to_borrow") return "ETB";
  if (String(asset.borrow_status || "").toLowerCase() === "hard_to_borrow") return "HTB";
  return "UNKNOWN";
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function fetchShortBorrow(symbolInput: string, options: { currentPrice?: number | null; requestedQty?: number } = {}): Promise<ShortBorrowResult> {
  const symbol = normalizeAlpacaSymbol(symbolInput);
  const asset = await alpacaGet<AssetResponse>(`/v2/assets/${encodeURIComponent(symbol)}`);
  const status = borrowStatus(asset);
  const currentPrice = finite(options.currentPrice);
  let availableQty: number | null = null;
  let locatePricePerShare: number | null = status === "ETB" ? 0 : null;
  let quotedAt: string | null = null;
  let quoteStatus: ShortBorrowResult["quoteStatus"] = status === "ETB" || status === "NOT_SHORTABLE" ? "NOT_REQUIRED" : "UNAVAILABLE";
  if (status === "HTB") {
    const quotes = await alpacaGet<QuoteResponse>("/v1/locates/quotes", { symbols: symbol });
    const quote = quotes.quotes?.find((item) => String(item.symbol).toUpperCase() === symbol);
    if (quote) {
      availableQty = finite(quote.available_qty);
      locatePricePerShare = finite(quote.price);
      quotedAt = quote.quoted_at || null;
      quoteStatus = locatePricePerShare !== null && availableQty !== null ? "AVAILABLE" : "UNAVAILABLE";
    } else if (quotes.errors?.some((item) => item.code === "easy_to_borrow")) {
      quoteStatus = "NOT_REQUIRED";
      locatePricePerShare = 0;
    }
  }
  const previous = await loadPreviousShortBorrow(symbol);
  const availableQtyChange = availableQty !== null && previous?.availableQty !== null && previous?.availableQty !== undefined ? availableQty - previous.availableQty : null;
  const availableQtyChangePercent = calculatePercent(availableQty, previous?.availableQty ?? null);
  const locatePriceChangePercent = calculatePercent(locatePricePerShare, previous?.locatePricePerShare ?? null);
  const locateFeeRatePercent = currentPrice !== null && currentPrice > 0 && locatePricePerShare !== null ? (locatePricePerShare / currentPrice) * 100 : null;
  let policy: ShortBorrowScorePolicy = DEFAULT_SHORT_BORROW_POLICY;
  try {
    const settings = await loadFeatureModuleSettings("us-short-borrow");
    const configured = settings.featureSettings?.shortBorrowPolicy;
    if (configured) policy = { ...DEFAULT_SHORT_BORROW_POLICY, ...configured } as ShortBorrowScorePolicy;
  } catch (error) {
    console.warn("[ShortBorrow] scoring policy unavailable; using defaults", error instanceof Error ? error.message : error);
  }
  const score = scoreShortPressure({ shortable: asset.shortable !== false, borrowStatus: status, availableQtyChangePercent, locateFeeRatePercent, locatePriceChangePercent }, policy);
  const fetchedAt = new Date().toISOString();
  const result: ShortBorrowResult = {
    symbol, tradable: asset.tradable !== false, shortable: asset.shortable !== false, borrowStatus: status, quoteStatus,
    availableQty, locatePricePerShare, currentPrice, locateFeeRatePercent,
    previousAvailableQty: previous?.availableQty ?? null, availableQtyChange, availableQtyChangePercent,
    previousLocatePricePerShare: previous?.locatePricePerShare ?? null, locatePriceChangePercent,
    ...score, quotedAt, fetchedAt, source: "ALPACA", scope: "ALPACA_ACCOUNT_SPECIFIC",
  };
  if (options.requestedQty !== undefined) {
    result.requestedQty = options.requestedQty;
    result.estimatedLocateFee = locatePricePerShare !== null ? options.requestedQty * locatePricePerShare : null;
  }
  return saveShortBorrowSnapshot(result);
}
