/** 공식 KIS 종목 마스터 기준 공통 거래 대상 판정 모듈. */
export function isEligibleKrCommonStock(row: { instrumentType?: unknown; tradingHaltCode?: unknown; liquidationCode?: unknown; isSuspended?: unknown }) {
  const flag = (value: unknown) => value === true || ["Y", "1"].includes(String(value ?? ""));
  return row.instrumentType === "COMMON_STOCK" && !flag(row.isSuspended) && !flag(row.tradingHaltCode) && !flag(row.liquidationCode);
}

export const eligibilityPolicy = {
  kr: "COMMON_STOCK + 공식 거래정지·청산·is_suspended 제외",
  us: "COMMON_STOCK + 상품 유형 제외; 공식 거래정지 필드 미제공",
} as const;
