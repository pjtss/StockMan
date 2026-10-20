export function extractMarketRssProtectedTokens(text: string): string[];
export function transformMarketRssProtectedTokens(text: string, transform: (token: string, index: number) => string): { text: string; tokens: string[] };
