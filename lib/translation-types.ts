export type TranslationLanguage = "en" | "ko";
export type TranslationSourceLanguage = TranslationLanguage | "auto";
export type TranslationFormat = "text" | "html";
export type TranslationResult = {
  translatedText: string;
  /** `auto` is preserved for cache/quota fallbacks where no detected language is available. */
  source: TranslationSourceLanguage;
  target: TranslationLanguage;
  provider: string;
  fallback: boolean;
  fallbackReason?: string;
  /** Internal admin-preview diagnostic; do not copy into public article fields. */
  providerFallbackError?: string;
  requestOrigin?: "PROVIDER" | "CACHE" | "QUOTA_FALLBACK";
  providerAttemptCount?: number;
};
export type TranslationRequestOptions = { beforeRequest?: () => Promise<void> };

export type TranslationClientFailureStage = "cache_read" | "quota_reservation" | "provider_request";

/** Keeps provider-call accounting distinct from cache/quota infrastructure failures. */
export class TranslationClientOperationError extends Error {
  readonly stage: TranslationClientFailureStage;
  readonly originalError: unknown;
  readonly cleanupError: unknown;
  readonly providerAttempts: number;
  readonly provider: string | null;

  constructor(stage: TranslationClientFailureStage, error: unknown, cleanupError?: unknown, provider: string | null = null, providerAttempts = 0) {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown translation client error";
    super(`${message}${cleanupError === undefined ? "" : " (quota reservation release also failed)"}`, error instanceof Error ? { cause: error } : undefined);
    this.name = "TranslationClientOperationError";
    this.stage = stage;
    this.originalError = error;
    this.cleanupError = cleanupError;
    this.provider = provider;
    this.providerAttempts = stage === "provider_request" ? Math.max(1, providerAttempts) : 0;
  }
}
export interface TranslationClient {
  translate(text: string, source?: TranslationSourceLanguage, target?: TranslationLanguage, format?: TranslationFormat, options?: TranslationRequestOptions): Promise<TranslationResult>;
  /** Try a distinct configured provider after domain validation rejects a provider result. */
  translateFallbackProvider?(text: string, source?: TranslationSourceLanguage, target?: TranslationLanguage, format?: TranslationFormat, options?: TranslationRequestOptions): Promise<TranslationResult>;
  /** Commit a deferred cache write only after domain-level response validation succeeds. */
  commitCache?(text: string, source?: TranslationSourceLanguage, target?: TranslationLanguage, format?: TranslationFormat): Promise<void>;
  /** Remove an existing cache entry that failed domain-level response validation. */
  invalidateCache?(text: string, source?: TranslationSourceLanguage, target?: TranslationLanguage, format?: TranslationFormat): Promise<boolean>;
}
