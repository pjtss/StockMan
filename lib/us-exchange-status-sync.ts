import { getPool } from "@/lib/db";
import { reconcileUsUniversePartitions } from "@/lib/instrument-universe-import";

type StatusRow = {
  market: "NAS" | "NYS" | "AMS";
  symbol: string;
  source: string;
  status: string;
  statusType: string;
  reasonCode: string | null;
  reason: string | null;
  sourceUpdatedAt: string | null;
  payload: Record<string, string | null>;
};

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function xmlField(item: string, name: string) {
  const value = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1];
  return value ? decodeXml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()) : "";
}

function exchangeMarket(value: string): StatusRow["market"] | null {
  const exchange = value.trim().toUpperCase();
  if (["NASDAQ", "NAS", "Q", "G", "S"].includes(exchange)) return "NAS";
  if (["NYSE", "NYS", "N"].includes(exchange)) return "NYS";
  if (["NYSE AMERICAN", "NYSE MKT", "AMEX", "AMS", "A"].includes(exchange)) return "AMS";
  return null;
}

function canonicalSymbol(value: string) {
  // KIS master stores class shares as AKO/B while Nasdaq Trader uses AKO.B.
  return value.trim().toUpperCase().replace(/\./g, "/");
}

export function parseEasternTimestamp(date: string, time: string): string | null {
  const dateParts = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const timeParts = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!dateParts || !timeParts) return null;
  const [, month, day, year] = dateParts;
  const [, hour, minute, second = "0", milliseconds = "0"] = timeParts;
  const intended = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds.padEnd(3, "0")));
  const calendarCheck = new Date(intended);
  if (calendarCheck.getUTCFullYear() !== Number(year) || calendarCheck.getUTCMonth() !== Number(month) - 1 || calendarCheck.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  let utc = intended;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fields = Object.fromEntries(formatter.formatToParts(new Date(utc)).map(({ type, value }) => [type, value]));
    const observed = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute), Number(fields.second));
    utc += intended - observed;
  }
  return new Date(utc).toISOString();
}

export function parseNasdaqTradeHalts(xml: string): StatusRow[] {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  if (!/<rss\b[^>]*>[\s\S]*?<channel\b/i.test(xml)) throw new Error("NASDAQ_HALT_FEED_INVALID");
  return items.flatMap((item) => {
    const symbol = canonicalSymbol(xmlField(item, "IssueSymbol"));
    const market = exchangeMarket(xmlField(item, "Market"));
    if (!symbol || !market) return [];
    const haltDate = xmlField(item, "HaltDate");
    const haltTime = xmlField(item, "HaltTime");
    const sourceUpdatedAt = haltDate && haltTime ? parseEasternTimestamp(haltDate, haltTime) : null;
    const reasonCode = xmlField(item, "ReasonCode") || null;
    const reason = xmlField(item, "Reason") || null;
    const isDeletion = reasonCode?.trim().toUpperCase() === "D";
    const resumptionDate = xmlField(item, "ResumptionDate");
    const resumptionTradeTime = xmlField(item, "ResumptionTradeTime");
    const resumptionAt = resumptionDate && resumptionTradeTime ? parseEasternTimestamp(resumptionDate, resumptionTradeTime) : null;
    const hasResumed = Boolean(resumptionAt && Date.parse(resumptionAt) <= Date.now());
    return [{ market, symbol, source: "NASDAQ_TRADE_HALTS", status: isDeletion ? "DELISTING_ACTION" : hasResumed ? "RESUMED" : "HALTED", statusType: isDeletion ? "LISTING_REMOVAL" : "TRADING_HALT", reasonCode, reason: reason || (isDeletion ? "Security deletion from Nasdaq/CQS" : null), sourceUpdatedAt, payload: { issueName: xmlField(item, "IssueName") || null, haltDate: haltDate || null, haltTime: haltTime || null, resumptionDate: resumptionDate || null, resumptionTradeTime: resumptionTradeTime || null } }];
  });
}

function parseDelimitedRow(line: string) {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "|" && !quoted) { fields.push(value); value = ""; }
    else value += char;
  }
  fields.push(value);
  return fields;
}

export function parseNasdaqSymbolDirectories(nasdaq: string, other: string): StatusRow[] {
  const result: StatusRow[] = [];
  const nasdaqLines = nasdaq.split(/\r?\n/).filter((line) => line && !line.startsWith("File Creation Time:"));
  const nasdaqHeaders = nasdaqLines[0]?.replace(/\|$/, "").split("|") ?? [];
  const nasdaqRows = nasdaqLines.slice(1).filter((line) => line !== "<EOF>");
  if (!nasdaqHeaders.includes("Symbol") || !nasdaqHeaders.includes("Financial Status") || !nasdaqRows.length) throw new Error("NASDAQ_LISTED_DIRECTORY_INVALID_OR_EMPTY");
  const symbolIndex = nasdaqHeaders.indexOf("Symbol");
  const nameIndex = nasdaqHeaders.indexOf("Security Name");
  const marketIndex = nasdaqHeaders.indexOf("Market Category");
  const statusIndex = nasdaqHeaders.indexOf("Financial Status");
  for (const line of nasdaqRows) {
    const columns = parseDelimitedRow(line);
    const symbol = canonicalSymbol(columns[symbolIndex] ?? "");
    if (!symbol) continue;
    const financialStatus = columns[statusIndex]?.trim().toUpperCase() || "N";
    const isDeficient = ["D", "E", "Q", "K"].includes(financialStatus);
    result.push({ market: "NAS", symbol, source: "NASDAQ_LISTED_DIRECTORY", status: isDeficient ? "LISTING_ISSUE" : "LISTED", statusType: "LISTING_QUALIFICATION", reasonCode: financialStatus, reason: financialStatus === "D" ? "Deficient; continuing listing requirements" : financialStatus === "E" ? "Delinquent in required filings" : financialStatus === "Q" ? "Bankruptcy" : financialStatus === "K" ? "Deficient, delinquent, and bankrupt" : null, sourceUpdatedAt: null, payload: { securityName: columns[nameIndex] || null, marketCategory: columns[marketIndex] || null, financialStatus } });
  }

  const otherLines = other.split(/\r?\n/).filter((line) => line && !line.startsWith("File Creation Time:"));
  const otherHeaders = otherLines[0]?.replace(/\|$/, "").split("|") ?? [];
  const otherRows = otherLines.slice(1).filter((line) => line !== "<EOF>");
  if (!otherHeaders.includes("ACT Symbol") || !otherHeaders.includes("Exchange") || !otherRows.length) throw new Error("NASDAQ_OTHER_LISTED_DIRECTORY_INVALID_OR_EMPTY");
  const otherSymbolIndex = otherHeaders.indexOf("ACT Symbol");
  const otherNameIndex = otherHeaders.indexOf("Security Name");
  const otherExchangeIndex = otherHeaders.indexOf("Exchange");
  for (const line of otherRows) {
    const columns = parseDelimitedRow(line);
    const symbol = canonicalSymbol(columns[otherSymbolIndex] ?? "");
    const market = exchangeMarket(columns[otherExchangeIndex] ?? "");
    if (!symbol || !market) continue;
    result.push({ market, symbol, source: "NASDAQ_OTHER_LISTED_DIRECTORY", status: "LISTED", statusType: "LISTING_PRESENCE", reasonCode: null, reason: null, sourceUpdatedAt: null, payload: { securityName: columns[otherNameIndex] || null, exchange: columns[otherExchangeIndex] || null } });
  }
  return result;
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "user-agent": "StockMan exchange status sync contact: ops@stockman.r-e.kr" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error(`EXCHANGE_SOURCE_HTTP_${response.status}`);
  return response.text();
}

export async function syncUsExchangeStatuses() {
  const [haltXml, nasdaqDirectory, otherDirectory] = await Promise.all([
    fetchText("https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts"),
    fetchText("https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt"),
    fetchText("https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"),
  ]);
  const halts = parseNasdaqTradeHalts(haltXml);
  const directoryRows = parseNasdaqSymbolDirectories(nasdaqDirectory, otherDirectory);
  const now = new Date();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The feed is a complete current-day snapshot. A previously halted issue
    // absent from a valid feed is no longer treated as halted, but is retained
    // as a cleared observation for auditability.
    await client.query(`UPDATE us_exchange_trading_status SET status='CLEARED', observed_at=$1
      WHERE source='NASDAQ_TRADE_HALTS' AND status='HALTED'`, [now]);
    const rows = [...halts, ...directoryRows];
    for (let offset = 0; offset < rows.length; offset += 250) {
      const batch = rows.slice(offset, offset + 250);
      const values: unknown[] = [];
      const tuples = batch.map((row, index) => {
        const parameter = index * 10;
        values.push(row.market, row.symbol, row.source, row.status, row.statusType, row.reasonCode, row.reason, row.sourceUpdatedAt, now, JSON.stringify(row.payload));
        return `($${parameter + 1},$${parameter + 2},$${parameter + 3},$${parameter + 4},$${parameter + 5},$${parameter + 6},$${parameter + 7},$${parameter + 8},$${parameter + 9},$${parameter + 10}::jsonb)`;
      });
      await client.query(`INSERT INTO us_exchange_trading_status
        (market,symbol,source,status,status_type,reason_code,reason,source_updated_at,observed_at,source_payload)
        VALUES ${tuples.join(",")}
        ON CONFLICT (market,symbol,source) DO UPDATE SET status=EXCLUDED.status,status_type=EXCLUDED.status_type,
        reason_code=EXCLUDED.reason_code,reason=EXCLUDED.reason,source_updated_at=EXCLUDED.source_updated_at,
        observed_at=EXCLUDED.observed_at,source_payload=EXCLUDED.source_payload`, values);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const reconciliation = await reconcileUsUniversePartitions({ apply: true });
  return { halted: halts.filter((row) => row.status === "HALTED").length, haltFeedRows: halts.length, directoryRows: directoryRows.length, listingIssues: directoryRows.filter((row) => row.status === "LISTING_ISSUE").length, reconciledInstruments: reconciliation.moved, checkedAt: now.toISOString() };
}
