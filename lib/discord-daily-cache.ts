import { readKisCache } from "@/lib/kis-cache";

export type DailyCacheCommand = "kr-bollinger-cache" | "us-bollinger-cache" | "kr-bollinger-middle-lower-cache" | "us-bollinger-middle-lower-cache" | "kr-golden-cross-cache" | "us-golden-cross-cache";

type CacheRecord = {
  market?: string;
  code?: string;
  name?: string;
  ticker?: string;
  [key: string]: unknown;
};

type CachePayload = {
  scope?: string;
  timeframe?: string;
  zone?: string;
  updatedAt?: string;
  sourceCheckedAt?: string | null;
  scannedCount?: number;
  successCount?: number;
  failureCount?: number;
  qualifiedCount?: number;
  qualified?: CacheRecord[];
  policy?: { ema?: string; recentCrossLookback?: number; requiredSignals?: string[] };
};

const COMMANDS: Record<DailyCacheCommand, { key: string; title: string }> = {
  "kr-bollinger-cache": { key: "daily-bollinger:KR:D:LOWER_OR_BELOW", title: "국내 일봉 볼린저밴드 하단 이하" },
  "us-bollinger-cache": { key: "daily-bollinger:US:D:LOWER_OR_BELOW", title: "해외 일봉 볼린저밴드 하단 이하" },
  "kr-bollinger-middle-lower-cache": { key: "daily-bollinger:KR:D:MIDDLE_TO_LOWER", title: "국내 일봉 볼린저밴드 중단선~하단선" },
  "us-bollinger-middle-lower-cache": { key: "daily-bollinger:US:D:MIDDLE_TO_LOWER", title: "해외 일봉 볼린저밴드 중단선~하단선" },
  "kr-golden-cross-cache": { key: "daily-golden-cross:KR:D", title: "국내 일봉 골든크로스" },
  "us-golden-cross-cache": { key: "daily-golden-cross:US:D", title: "해외 일봉 골든크로스" },
};

export function getDailyCacheCommand(command: string) {
  return COMMANDS[command as DailyCacheCommand] ?? null;
}

export async function loadDailyCacheCommand(command: DailyCacheCommand) {
  const definition = COMMANDS[command];
  const payload = await readKisCache<CachePayload>(definition.key);
  return { ...definition, cacheKey: definition.key, payload };
}

function displayName(item: CacheRecord) {
  const market = item.market ?? "-";
  const code = item.code ?? item.ticker ?? "-";
  const name = item.name ? ` | ${item.name}` : "";
  return `${market} ${code}${name}`;
}

export function formatDailyCacheCommand(result: Awaited<ReturnType<typeof loadDailyCacheCommand>>) {
  return splitDailyCacheCommand(result).join("\n");
}

export function splitDailyCacheCommand(result: Awaited<ReturnType<typeof loadDailyCacheCommand>>) {
  if (!result.payload) return [`📭 **${result.title} 캐시 없음**\n아직 갱신된 캐시가 없습니다. 일봉 캐시와 탐지 작업을 먼저 실행해 주세요.`];
  const payload = result.payload;
  const items = Array.isArray(payload.qualified) ? payload.qualified : [];
  const header = `📊 **${result.title} 캐시**`;
  const meta = `갱신 ${payload.updatedAt ?? "-"} · 대상 ${payload.scannedCount ?? 0}개 · 조건 충족 ${payload.qualifiedCount ?? items.length}개`;
  const policyLine = result.title.includes("골든크로스") ? `기준 EMA ${payload.policy?.ema ?? "9/20"} · 직전/당일/최근 ${payload.policy?.recentCrossLookback ?? 5}봉 · ${payload.policy?.requiredSignals?.join(" AND ") ?? "OBV > Signal AND ADL > Signal"}` : "";
  const limit = 1900;
  const chunks: string[] = [];
  let content = `${header}\n${meta}${policyLine ? `\n${policyLine}` : ""}`;
  for (const line of items.map(displayName)) {
    if ((content + "\n" + line).length > limit) {
      chunks.push(content);
      content = `${header} (계속)\n${policyLine ? `${policyLine}\n` : ""}${line}`;
    } else {
      content += `\n${line}`;
    }
  }
  if (items.length === 0) content += "\n조건 충족 종목이 없습니다.";
  chunks.push(content);
  return chunks;
}
