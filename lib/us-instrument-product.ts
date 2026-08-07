export type UsInstrumentProductClassification = {
  instrumentType: string;
  isEtf: boolean;
  isLeveraged: boolean;
  isInverse: boolean;
  isDerivativeProduct: boolean;
  source: string;
  confidence: number;
};

const ETF_TYPE = /\b(?:ETF|ETN|ETP|FUND|TRUST|INDEX)\b/i;
const LEVERAGED = /(?:leverag|ultra(?:pro)?|geared|\b(?:2|3|4|5)\s*x\b|\b(?:2|3|4|5)x\b|daily\s+(?:bull|bear)|direxion|proshares)/i;
const INVERSE = /(?:inverse|인버스|\bshort\b|\bbear\b|inverse\s+etf)/i;
const DERIVATIVE = /(?:warrant|right|unit|option|preferred|\b(?:etn|etp)\b|trust)/i;

/** Classifies a product using provider metadata first, then conservative name fallbacks. */
export function classifyUsInstrumentProduct(input: { name?: unknown; englishName?: unknown; type?: unknown; market?: unknown }): UsInstrumentProductClassification {
  const text = [input.name, input.englishName, input.type].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ");
  const type = String(input.type ?? "").toUpperCase();
  const isEtf = /ETF|ETN|ETP|FUND|TRUST|INDEX/.test(type) || ETF_TYPE.test(text);
  const isLeveraged = LEVERAGED.test(text);
  const isInverse = INVERSE.test(text);
  const isDerivativeProduct = DERIVATIVE.test(text) || isEtf;
  let instrumentType = "COMMON_STOCK";
  if (isLeveraged) instrumentType = "LEVERAGED_PRODUCT";
  else if (isInverse) instrumentType = "INVERSE_PRODUCT";
  else if (isEtf) instrumentType = "ETF";
  else if (isDerivativeProduct) instrumentType = "DERIVATIVE_PRODUCT";
  const exactType = type && !["COMMON_STOCK", ""].includes(type) ? type : null;
  if (exactType) instrumentType = exactType;
  return { instrumentType, isEtf, isLeveraged, isInverse, isDerivativeProduct, source: type ? "KIS_METADATA_NAME" : "NAME_FALLBACK", confidence: type ? 0.95 : (isEtf || isLeveraged || isInverse ? 0.70 : 0.50) };
}

export function isEligibleUsCommonStock(product: Pick<UsInstrumentProductClassification, "instrumentType" | "isEtf" | "isLeveraged" | "isInverse" | "isDerivativeProduct">) {
  return product.instrumentType === "COMMON_STOCK" && !product.isEtf && !product.isLeveraged && !product.isInverse && !product.isDerivativeProduct;
}
