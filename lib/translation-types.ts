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
  requestOrigin?: "PROVIDER" | "CACHE" | "QUOTA_FALLBACK";
};

export type TranslationClientFailureStage = "cache_read" | "quota_reservation" | "provider_request";

/** Keeps provider-call accounting distinct from cache/quota infrastructure failures. */
export class TranslationClientOperationError extends Error {
  readonly stage: TranslationClientFailureStage;
  readonly originalError: unknown;
  readonly cleanupError: unknown;
  readonly providerAttempts: number;

  constructor(stage: TranslationClientFailureStage, error: unknown, cleanupError?: unknown) {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown translation client error";
    super(`${message}${cleanupError === undefined ? "" : " (quota reservation release also failed)"}`, error instanceof Error ? { cause: error } : undefined);
    this.name = "TranslationClientOperationError";
    this.stage = stage;
    this.originalError = error;
    this.cleanupError = cleanupError;
    this.providerAttempts = stage === "provider_request" ? 1 : 0;
  }
}
export interface TranslationClient {
  translate(text: string, source?: TranslationSourceLanguage, target?: TranslationLanguage, format?: TranslationFormat): Promise<TranslationResult>;
  /** Commit a deferred cache write only after domain-level response validation succeeds. */
  commitCache?(text: string, source?: TranslationSourceLanguage, target?: TranslationLanguage, format?: TranslationFormat): Promise<void>;
  /** Remove an existing cache entry that failed domain-level response validation. */
  invalidateCache?(text: string, source?: TranslationSourceLanguage, target?: TranslationLanguage, format?: TranslationFormat): Promise<boolean>;
}
