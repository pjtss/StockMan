import { htmlToSecText, prepareSecDocument } from "./sec-document-parser";
import { isSecHttpsUrl } from "./sec-filing-url";
import { createSecRequestHeaders } from "./sec-request-headers";

const DEFAULT_SEC_DOCUMENT_TIMEOUT_MS = 15_000;
const DEFAULT_SEC_DOCUMENT_MAX_BYTES = 32 * 1024 * 1024;

function secDocumentTimeoutMs() {
  const configured = Number(process.env.SEC_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000
    ? Math.min(configured, 120_000)
    : DEFAULT_SEC_DOCUMENT_TIMEOUT_MS;
}

function secDocumentMaxBytes() {
  const configured = Number(process.env.SEC_DOCUMENT_MAX_BYTES);
  return Number.isFinite(configured) && configured >= 1_024
    ? Math.min(Math.floor(configured), 128 * 1024 * 1024)
    : DEFAULT_SEC_DOCUMENT_MAX_BYTES;
}

async function readLimitedUtf8(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("SEC 원문 응답이 허용 크기를 초과했습니다.");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("SEC 원문 응답이 허용 크기를 초과했습니다.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export type SecRawDocument = {
  url: string;
  html: string;
  text: string;
};

export async function fetchSecRawDocument(url: string): Promise<SecRawDocument> {
  if (!isSecHttpsUrl(url)) {
    throw new Error("SEC 원문 URL은 sec.gov의 HTTPS 주소여야 합니다.");
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: createSecRequestHeaders("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    signal: AbortSignal.timeout(secDocumentTimeoutMs()),
  });

  if (!response.ok) {
    throw new Error(`SEC 원문 요청 실패: ${response.status}`);
  }

  const html = await readLimitedUtf8(response, secDocumentMaxBytes());
  return {
    url,
    html,
    text: htmlToSecText(html),
  };
}

export function extractSecAiText(document: SecRawDocument): string {
  return prepareSecDocument(document.html).aiText;
}
