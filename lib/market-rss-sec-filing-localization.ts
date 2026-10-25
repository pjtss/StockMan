import { localizeSecFilingTitle } from "./market-rss-sec-filing-title";

export const MARKET_RSS_SEC_FILING_TITLE_SQL_PATTERN = String.raw`^[0-9]{1,2}(-[A-Z]{1,3}(/[A-Z])?)? *- *.+ *\([0-9]{10}\) *\((Filer|Issuer|Reporting)\)$`;

export type MarketRssSecFilingLocalizationRow = {
  id: number;
  title: string;
  summary: string;
  content: string;
  translationAttempts: number;
};

export function buildMarketRssSecFilingLocalizationAssignments<T extends MarketRssSecFilingLocalizationRow>(rows: T[]) {
  return rows.flatMap((row) => {
    const translatedTitle = localizeSecFilingTitle(row.title);
    return translatedTitle ? [{ ...row, translatedTitle }] : [];
  });
}
