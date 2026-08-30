export type ScreenerMarket = "KR" | "US" | "ALL";
export type Timeframe = "D" | "W" | "M";
export type FilterOperator = "=" | "!=" | ">" | ">=" | "<" | "<=";
export type ScreenerFilter = { field: string; operator: FilterOperator; value: number | string | boolean };
export type ScreenerRequest = { market?: ScreenerMarket; exchange?: string[]; instrumentType?: "COMMON_STOCK"; status?: "ACTIVE"; timeframe?: Timeframe; asOf?: "LATEST" | string; logic?: "AND" | "OR"; filters?: ScreenerFilter[]; ranking?: { field: string; direction: "ASC" | "DESC" }[]; limit?: number };
export type ScreenerResult = { market: string; exchange: string; code: string; name: string; status: string; marketCap: number | null; sharesOutstanding: number | null; currency: string | null; candleDate: string; candleFetchedAt: string; metrics: Record<string, number | string | boolean | null>; conditions: { field: string; passed: boolean; actual: unknown; target: unknown }[]; matched: boolean; failureReasons: string[]; };
