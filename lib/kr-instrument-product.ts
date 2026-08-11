export type KrInstrumentProductClassification = {
  instrumentType: "COMMON_STOCK" | "ETF" | "LEVERAGED_PRODUCT" | "INVERSE_PRODUCT" | "DERIVATIVE_PRODUCT";
  isEtf: boolean;
  isLeveraged: boolean;
  isInverse: boolean;
  isDerivativeProduct: boolean;
  source: string;
  reason: string;
};

const ETF = /(?:\bETF\b|\bETN\b|\bETP\b|상장지수|인덱스|펀드|수익증권|(?:^|\s)(?:KODEX|TIGER|PLUS|SOL|ACE|HANARO|KBSTAR|KOSEF|KIWOOM|TREX)\b)/i;
const LEVERAGED = /(?:레버리지|leverag|\b(?:2|3|4|5)\s*x\b|\b(?:2|3|4|5)x\b|울트라|ultra|bull|bullish)/i;
const INVERSE = /(?:인버스|inverse|\bshort\b|bear|하락배율)/i;
const DERIVATIVE = /(?:ETN|ETP|ELW|warrant|선물|옵션|option|권리주|신주인수권|우선주|통안채|국고채|회사채|채권|SOFR|MSCI|S&P|KRX)/i;

export function classifyKrInstrumentProduct(input: { name?: unknown; productType?: unknown }): KrInstrumentProductClassification {
  const name = String(input.name ?? "").trim();
  const productType = String(input.productType ?? "").trim();
  const text = `${name} ${productType}`;
  const isEtf = ETF.test(text);
  const isLeveraged = LEVERAGED.test(text);
  const isInverse = INVERSE.test(text);
  const isDerivativeProduct = DERIVATIVE.test(text) || isEtf;
  let instrumentType: KrInstrumentProductClassification["instrumentType"] = "COMMON_STOCK";
  if (isLeveraged) instrumentType = "LEVERAGED_PRODUCT";
  else if (isInverse) instrumentType = "INVERSE_PRODUCT";
  else if (isEtf) instrumentType = "ETF";
  else if (isDerivativeProduct) instrumentType = "DERIVATIVE_PRODUCT";
  return { instrumentType, isEtf, isLeveraged, isInverse, isDerivativeProduct, source: productType ? "KIS_METADATA_NAME" : "KIS_NAME_FALLBACK", reason: instrumentType === "COMMON_STOCK" ? "일반주식으로 분류" : `제외 상품: ${instrumentType}` };
}

export function isEligibleKrCommonStock(product: KrInstrumentProductClassification) {
  return product.instrumentType === "COMMON_STOCK" && !product.isEtf && !product.isLeveraged && !product.isInverse && !product.isDerivativeProduct;
}
