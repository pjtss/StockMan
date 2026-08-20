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
  if (!result.payload) return `📭 **${result.title} 캐시 없음**\n아직 갱신된 캐시가 없습니다. 일봉 캐시와 탐지 작업을 먼저 실행해 주세요.`;
  const payload = result.payload;
  const items = Array.isArray(payload.qualified) ? payload.qualified : [];
  const header = `📊 **${result.title} 캐시**`;
  const meta = `갱신 ${payload.updatedAt ?? "-"} · 대상 ${payload.scannedCount ?? 0}개 · 조건 충족 ${payload.qualifiedCount ?? items.length}개`;
  const limit = 1800;
  const lines = items.map(displayName);
  let content = `${header}\n${meta}`;
  let included = 0;
  for (const line of lines) {
    const next = `${content}\n${line}`;
    if (next.length > limit) break;
    content = next;
    included += 1;
  }
  if (included < lines.length) content += `\n외 ${lines.length - included}개는 Discord 길이 제한으로 생략되었습니다.`;
  if (included === 0 && lines.length === 0) content += "\n조건 충족 종목이 없습니다.";
  return content;
}
