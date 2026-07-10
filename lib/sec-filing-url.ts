export type SecFilingUrlInfo = {
  originalUrl: string;
  canonicalUrl: string;
  cik: string;
  accessionNumber: string;
  accessionCompact: string;
  documentFile: string;
  directoryUrl: string;
};

function toDashedAccession(value: string) {
  if (/^\d{10}-\d{2}-\d{6}$/.test(value)) return value;
  if (/^\d{18}$/.test(value)) {
    return `${value.slice(0, 10)}-${value.slice(10, 12)}-${value.slice(12)}`;
  }
  return "";
}

export function isSecHttpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (hostname === "sec.gov" || hostname.endsWith(".sec.gov"));
  } catch {
    return false;
  }
}

export function normalizeSecUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

export function parseSecFilingUrl(value: string): SecFilingUrlInfo {
  const canonicalUrl = normalizeSecUrl(value);
  const parsed = new URL(canonicalUrl);
  const match = parsed.pathname.match(/\/Archives\/edgar\/data\/(\d+)\/([0-9-]+)\/([^/]+)$/i);
  const cik = match?.[1] || "";
  const accessionSource = match?.[2] || "";
  const documentFile = match?.[3] || "";
  const accessionNumber = toDashedAccession(accessionSource);
  const accessionCompact = accessionNumber.replace(/-/g, "");
  const directoryPath = match ? `/Archives/edgar/data/${cik}/${accessionCompact}/` : parsed.pathname.replace(/[^/]*$/, "");

  return {
    originalUrl: value,
    canonicalUrl,
    cik,
    accessionNumber,
    accessionCompact,
    documentFile,
    directoryUrl: `${parsed.origin}${directoryPath}`,
  };
}
