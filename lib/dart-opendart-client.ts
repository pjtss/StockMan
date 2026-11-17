const OPENDART_LIST_URL = "https://opendart.fss.or.kr/api/list.json";
const PAGE_SIZE = 100;

export type OpenDartListRow = {
  corp_code?: string;
  corp_cls?: string;
  corp_name?: string;
  stock_code?: string;
  report_nm?: string;
  rcept_no?: string;
  flr_nm?: string;
  rcept_dt?: string;
  rm?: string;
};

type OpenDartListResponse = {
  status?: string;
  message?: string;
  page_no?: number | string;
  page_count?: number | string;
  total_count?: number | string;
  total_page?: number | string;
  list?: OpenDartListRow[];
};

export type OpenDartTodayResult = {
  dateKey: string;
  fetchedAt: string;
  pagesFetched: number;
  expectedPages: number;
  totalCount: number;
  rawRowCount: number;
  uniqueReceiptCount: number;
  duplicateReceiptCount: number;
  missingReceiptCount: number;
  reconciliationState: "RECONCILED" | "PARTIAL";
  rows: OpenDartListRow[];
};

function getApiKey() {
  const apiKey = process.env.OPENDART_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENDART_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return apiKey;
}

export function getKstDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replaceAll("-", "");
}

function parsePositiveInteger(value: number | string | undefined, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`OPEN DART 응답의 ${fieldName} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: number | string | undefined, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`OPEN DART 응답의 ${fieldName} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

async function fetchPage(apiKey: string, dateKey: string, pageNo: number) {
  const params = new URLSearchParams({
    crtfc_key: apiKey,
    bgn_de: dateKey,
    end_de: dateKey,
    sort: "date",
    sort_mth: "desc",
    page_no: String(pageNo),
    page_count: String(PAGE_SIZE),
  });
  const response = await fetch(`${OPENDART_LIST_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`OPEN DART 공시검색 요청 실패: ${response.status}`);
  }

  let payload: OpenDartListResponse;
  try {
    payload = (await response.json()) as OpenDartListResponse;
  } catch (error) {
    const contentType = response.headers.get("content-type") || "unknown";
    throw new Error(`OPEN DART 응답 JSON 파싱 실패 (HTTP ${response.status}, ${contentType}): ${error instanceof Error ? error.message : String(error)}`);
  }
  if (payload.status === "013") {
    return { rows: [] as OpenDartListRow[], totalCount: 0, totalPages: 0, responsePageNo: pageNo, responsePageCount: PAGE_SIZE, noData: true };
  }
  if (payload.status !== "000") {
    throw new Error(payload.message || `OPEN DART 오류 코드: ${payload.status || "UNKNOWN"}`);
  }

  return {
    rows: payload.list ?? [],
    totalCount: parseNonNegativeInteger(payload.total_count, "total_count"),
    totalPages: parsePositiveInteger(payload.total_page, "total_page"),
    responsePageNo: parsePositiveInteger(payload.page_no, "page_no"),
    responsePageCount: parsePositiveInteger(payload.page_count, "page_count"),
    noData: false,
  };
}

export async function fetchOpenDartToday(): Promise<OpenDartTodayResult> {
  const apiKey = getApiKey();
  const dateKey = getKstDateKey();
  const rowsByReceiptNo = new Map<string, OpenDartListRow>();
  let pageNo = 1;
  let totalPages = 1;
  let totalCount = 0;
  let pagesFetched = 0;
  let rawRowCount = 0;
  let duplicateReceiptCount = 0;
  let missingReceiptCount = 0;
  let expectedPages: number | null = null;
  let emptyResponse = false;

  while (pageNo <= totalPages) {
    const page = await fetchPage(apiKey, dateKey, pageNo);
    emptyResponse ||= page.noData === true;
    if (page.responsePageNo !== pageNo) throw new Error(`OPEN DART 페이지 번호 불일치: 요청 ${pageNo}, 응답 ${page.responsePageNo}`);
    if (page.responsePageCount !== PAGE_SIZE) throw new Error(`OPEN DART 페이지 크기 불일치: 요청 ${PAGE_SIZE}, 응답 ${page.responsePageCount}`);
    if (expectedPages === null) {
      expectedPages = page.totalPages;
      totalPages = page.totalPages;
      totalCount = page.totalCount;
    } else if (page.totalPages !== expectedPages || page.totalCount !== totalCount) {
      throw new Error(`OPEN DART 페이지 분모 불일치: ${dateKey} 조회 중 total_count 또는 total_page가 변경되었습니다.`);
    }
    pagesFetched += 1;
    rawRowCount += page.rows.length;

    for (const row of page.rows) {
      const receiptNo = row.rcept_no?.trim();
      if (!receiptNo) { missingReceiptCount += 1; continue; }
      if (rowsByReceiptNo.has(receiptNo)) duplicateReceiptCount += 1;
      rowsByReceiptNo.set(receiptNo, row);
    }

    pageNo += 1;
  }

  const uniqueReceiptCount = rowsByReceiptNo.size;
  const effectiveExpectedPages = expectedPages ?? 0;
  const reconciliationState = (emptyResponse && pagesFetched === 1 && totalCount === 0 && rawRowCount === 0)
    || (pagesFetched === effectiveExpectedPages
    && effectiveExpectedPages === Math.ceil(totalCount / PAGE_SIZE)
    && rawRowCount === totalCount
    && uniqueReceiptCount === totalCount
    && missingReceiptCount === 0
    && duplicateReceiptCount === 0)
    ? "RECONCILED" as const
    : "PARTIAL" as const;
  return {
    dateKey,
    fetchedAt: new Date().toISOString(),
    pagesFetched,
    expectedPages: effectiveExpectedPages,
    totalCount,
    rawRowCount,
    uniqueReceiptCount,
    duplicateReceiptCount,
    missingReceiptCount,
    reconciliationState,
    rows: [...rowsByReceiptNo.values()],
  };
}
