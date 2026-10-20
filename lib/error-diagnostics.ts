export type ErrorDiagnostics = {
  errorCode: string;
  message: string;
  databaseCode?: string;
  table?: string;
  column?: string;
  constraint?: string;
};

export type SafeErrorMetadata = Pick<ErrorDiagnostics, "errorCode"> & { databaseCode?: string };

function errorChain(error: unknown) {
  const chain: Array<Error & { code?: string; detail?: string; cause?: unknown }> = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current) && chain.length < 6) {
    seen.add(current);
    chain.push((current instanceof Error ? current : new Error(String(current))) as Error & { code?: string; detail?: string; cause?: unknown });
    current = (current as { cause?: unknown }).cause;
  }
  return chain.length ? chain : [new Error("unknown error") as Error & { code?: string; detail?: string; cause?: unknown }];
}

/** Convert database/integration errors into safe, machine-readable diagnostics. */
export function describeError(error: unknown): ErrorDiagnostics {
  const chain = errorChain(error);
  const rawMessage = chain.find((value) => value.message && !value.message.startsWith("Failed query:"))?.message || chain[chain.length - 1].message || "unknown error";
  const allMessages = chain.map((value) => value.message).join("\n");
  const table = allMessages.match(/relation [\"']([^\"']+)[\"'] does not exist/i)?.[1];
  const column = allMessages.match(/column [\"']([^\"']+)[\"'] does not exist/i)?.[1];
  const constraint = allMessages.match(/constraint [\"']([^\"']+)[\"']/i)?.[1];
  const databaseCode = chain.find((value) => value.code)?.code;
  const errorCode = databaseCode === "42P01"
    ? "SCHEMA_TABLE_MISSING"
    : databaseCode === "42703"
      ? "SCHEMA_COLUMN_MISSING"
      : databaseCode === "23503"
        ? "DATABASE_FOREIGN_KEY_VIOLATION"
        : databaseCode === "23505"
          ? "DATABASE_UNIQUE_VIOLATION"
          : databaseCode === "23502"
            ? "DATABASE_NOT_NULL_VIOLATION"
            : databaseCode === "57014"
              ? "DATABASE_QUERY_TIMEOUT"
              : databaseCode === "21000"
                ? "DATABASE_CARDINALITY_VIOLATION"
      : databaseCode === "ECONNREFUSED" || databaseCode === "ENOTFOUND" || databaseCode === "ETIMEDOUT"
        ? "DATABASE_CONNECTION_FAILED"
        : /Discord.*HTTP\s+429/i.test(allMessages)
          ? "DISCORD_WEBHOOK_RATE_LIMIT"
          : /Discord.*HTTP\s+5\d{2}/i.test(allMessages)
            ? "DISCORD_WEBHOOK_SERVER_ERROR"
        : /EGW00201|초당 거래건수를 초과|rate limit/i.test(allMessages)
          ? "KIS_RATE_LIMIT"
          : /EGW00123|AUTH(?:ORIZATION)?(?:\s+ERROR)?|인증.*오류/i.test(allMessages)
            ? "KIS_AUTH_ERROR"
            : /KIS_[A-Z0-9_]+_API_ERROR|KIS API/i.test(allMessages)
              ? "KIS_API_ERROR"
        : "INTEGRATION_ERROR";
  const message = rawMessage.replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, "postgresql://[redacted]");
  return { errorCode, message, databaseCode, table, column, constraint };
}

/** Metadata suitable for logs: excludes free-form messages, URLs, query text, and causes. */
export function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  const diagnostics = describeError(error);
  const databaseCode = diagnostics.databaseCode && /^[A-Z0-9]{5,20}$/.test(diagnostics.databaseCode)
    ? diagnostics.databaseCode
    : undefined;
  return { errorCode: diagnostics.errorCode, ...(databaseCode ? { databaseCode } : {}) };
}

/** Keep provider diagnostics machine-readable; free-form provider text is not safe for public API responses. */
export function safeProviderCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : null;
}

export function isSchemaError(error: unknown) {
  const diagnostics = describeError(error);
  return diagnostics.errorCode === "SCHEMA_TABLE_MISSING" || diagnostics.errorCode === "SCHEMA_COLUMN_MISSING";
}
