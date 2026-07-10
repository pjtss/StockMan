export type SecRawDocument = {
  url: string;
  html: string;
  text: string;
};

const SEC_FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "MySecWatcher/1.0 your_email@example.com",
};

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(html: string) {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export async function fetchSecRawDocument(url: string): Promise<SecRawDocument> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: SEC_FETCH_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`SEC 원문 요청 실패: ${response.status}`);
  }

  const html = await response.text();
  return {
    url,
    html,
    text: stripTags(html),
  };
}

export function extractSecAiText(document: SecRawDocument): string {
  return document.text;
}
