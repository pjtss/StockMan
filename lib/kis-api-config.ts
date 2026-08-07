import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { kisApiConfigs } from "@/lib/schema";

export type KisApiConfigKey = "us_updown_rate" | "us_volume_power" | "us_turnover_trend" | "us_price_detail" | "us_trade_trend" | "us_daily_price";

export type KisApiConfig = {
  KEYB?: string;
  AUTH?: string;
  EXCD: string;
  FID_COND_MRKT_DIV_CODE?: string;
  FID_HOUR_CLS_CODE?: string;
  FID_PW_DATA_INCU_YN?: string;
  GUBN?: string;
  NDAY?: string;
  VOL_RANG?: string;
  tr_id: string;
  custtype: string;
  content_type: string;
  authorization: string;
};

function normalizeBlank(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === '""' || text === "''") return "";
  return text;
}

function normalizeKisApiConfig(config: Partial<KisApiConfig>, base: KisApiConfig = DEFAULT_KIS_API_CONFIGS.us_updown_rate): KisApiConfig {
  return {
    ...base,
    ...config,
    KEYB: normalizeBlank(config.KEYB),
    AUTH: normalizeBlank(config.AUTH),
    EXCD: normalizeBlank(config.EXCD) || base.EXCD,
    FID_COND_MRKT_DIV_CODE: normalizeBlank(config.FID_COND_MRKT_DIV_CODE),
    FID_HOUR_CLS_CODE: normalizeBlank(config.FID_HOUR_CLS_CODE),
    FID_PW_DATA_INCU_YN: normalizeBlank(config.FID_PW_DATA_INCU_YN),
    GUBN: normalizeBlank(config.GUBN),
    NDAY: normalizeBlank(config.NDAY),
    VOL_RANG: normalizeBlank(config.VOL_RANG),
    tr_id: normalizeBlank(config.tr_id) || base.tr_id,
    custtype: normalizeBlank(config.custtype) || base.custtype,
    content_type:
      normalizeBlank(config.content_type) ||
      base.content_type,
    authorization:
      normalizeBlank(config.authorization) ||
      base.authorization,
  };
}

export const DEFAULT_KIS_API_CONFIGS: Record<KisApiConfigKey, KisApiConfig> = {
  us_updown_rate: {
    EXCD: "AMS",
    GUBN: "1",
    NDAY: "0",
    VOL_RANG: "5",
    tr_id: "HHDFS76290000",
    custtype: "P",
    content_type: "application/json; charset=utf-8",
    authorization: "Bearer",
  },
  us_volume_power: {
    EXCD: "AMS",
    NDAY: "0",
    VOL_RANG: "5",
    tr_id: "HHDFS76280000",
    custtype: "P",
    content_type: "application/json; charset=utf-8",
    authorization: "Bearer",
  },
  us_turnover_trend: {
    KEYB: "",
    AUTH: "",
    EXCD: process.env.KIS_US_TURNOVER_EXCD || "AMS",
    FID_COND_MRKT_DIV_CODE: process.env.KIS_US_TURNOVER_MRKT || "AMS",
    FID_HOUR_CLS_CODE: "0",
    FID_PW_DATA_INCU_YN: "N",
    NDAY: "0",
    VOL_RANG: "5",
    tr_id: "HHDFS76950200",
    custtype: "P",
    content_type: "application/json; charset=utf-8",
    authorization: "Bearer",
  },
  us_price_detail: {
    AUTH: "",
    EXCD: "AMS",
    tr_id: "HHDFS76200200",
    custtype: "P",
    content_type: "application/json; charset=utf-8",
    authorization: "Bearer",
  },
  us_trade_trend: {
    AUTH: "",
    KEYB: "",
    EXCD: "NAS",
    tr_id: "HHDFS76200300",
    custtype: "P",
    content_type: "application/json; charset=utf-8",
    authorization: "Bearer",
  },
  us_daily_price: {
    AUTH: "",
    KEYB: "",
    EXCD: "NAS",
    tr_id: "HHDFS76240000",
    custtype: "P",
    content_type: "application/json; charset=utf-8",
    authorization: "Bearer",
  },
};

export async function loadKisApiConfig(key: KisApiConfigKey): Promise<KisApiConfig> {
  const defaults = DEFAULT_KIS_API_CONFIGS[key];
  const db = getDb();
  if (!db) return defaults;

  const rows = await db.select().from(kisApiConfigs).where(eq(kisApiConfigs.key, key)).limit(1);
  if (rows.length === 0) return defaults;
  return normalizeKisApiConfig({ ...defaults, ...(rows[0].config as Partial<KisApiConfig>) }, defaults);
}

export async function saveKisApiConfig(key: KisApiConfigKey, config: KisApiConfig) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const normalized = normalizeKisApiConfig(config, DEFAULT_KIS_API_CONFIGS[key]);
  await db.insert(kisApiConfigs)
    .values({ key, config: normalized, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: kisApiConfigs.key,
      set: { config: normalized, updatedAt: new Date() },
    });
}
