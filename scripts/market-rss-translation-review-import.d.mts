export type TranslationReviewVerdict = "정확" | "부분번역" | "오역";
export type TranslationReviewFixtureCase = {
  id: string;
  source: string;
  externalId?: string | null;
  originalTitle: string;
  originalSummary?: string | null;
  translatedTitle: string;
  expectedTitle: string;
  verdict: TranslationReviewVerdict;
  ticker: string | null;
  publishedAt: string | null;
  link: string | null;
  notes: string | null;
};
export type TranslationReviewFixture = { schemaVersion: 1; cases: TranslationReviewFixtureCase[] };
export function parseTranslationReviewCsv(input: string): string[][];
export function buildTranslationReviewFixture(input: string, existing?: TranslationReviewFixture): {
  fixture: TranslationReviewFixture;
  importedCount: number;
  heldCount: number;
  duplicateCount: number;
};
export function importTranslationReviewCsvFile(options: { inputPath: string; fixturePath?: string; apply?: boolean }): Promise<{
  importedCount: number;
  heldCount: number;
  duplicateCount: number;
  mode: "preview" | "applied";
  fixturePath: string;
  fixture?: TranslationReviewFixture;
}>;
export function writeFixtureAtomically(
  fixturePath: string,
  fixture: TranslationReviewFixture,
  io?: {
    writeFile: (path: string, data: string, options: { encoding: string; flag: string }) => Promise<unknown>;
    rename: (source: string, target: string) => Promise<unknown>;
    unlink: (path: string) => Promise<unknown>;
  },
): Promise<void>;
