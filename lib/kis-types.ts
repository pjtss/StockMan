export interface StockIntensity {
  rank: number;
  company: string;
  code: string;
  intensity: number;
  price: string;
  change: string;
  changeRate: string;
  volume?: string;
  tradingValue?: string;
}

export interface VolumeSpikeItem {
  rank: number;
  company: string;
  code: string;
  volumeRatio: string;
  tradingValue: string;
  price: string;
  changeRate: string;
}

export interface NetBuyingItem {
  rank: number;
  company: string;
  code: string;
  foreignNetBuy: string;
  instNetBuy: string;
  price: string;
  changeRate: string;
  source?: "KIS";
  flowStatus?: "CONFIRMED" | "ESTIMATED" | "UNAVAILABLE";
  observedAt?: string;
}

export interface ProgramTradingItem {
  rank: number;
  company: string;
  code: string;
  programNetBuy: string;
  price: string;
  changeRate: string;
  source?: "KIS";
  flowStatus?: "CONFIRMED" | "ESTIMATED" | "UNAVAILABLE";
  observedAt?: string;
}

export interface NewHighItem {
  rank: number;
  company: string;
  code: string;
  highType: string;
  price: string;
  changeRate: string;
}

export interface BidAskRatioItem {
  rank: number;
  company: string;
  code: string;
  bidAskRatio: number;
  price: string;
  changeRate: string;
}

export interface TopRisingStockItem {
  rank: number;
  company: string;
  code: string;
  price: string;
  changeRate: string;
}

export interface KisOutput {
  hts_kor_shr_nlen?: string;
  mksc_shrn_iscd?: string;
  hts_kor_isnm?: string;
  stck_shrn_iscd?: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  acml_vol: string;
  acml_tr_pbmn: string;
  tday_rltv?: string;
}
