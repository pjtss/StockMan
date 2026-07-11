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
  totalCount: number;
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

  const payload = (await response.json()) as OpenDartListResponse;
  if (payload.status === "013") {
    return { rows: [] as OpenDartListRow[], totalCount: 0, totalPages: 0 };
  }
  if (payload.status !== "000") {
    throw new Error(payload.message || `OPEN DART 오류 코드: ${payload.status || "UNKNOWN"}`);
  }

  return {
    rows: payload.list ?? [],
    totalCount: Number(payload.total_count) || 0,
    totalPages: parsePositiveInteger(payload.total_page, "total_page"),
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

  while (pageNo <= totalPages) {
    const page = await fetchPage(apiKey, dateKey, pageNo);
    pagesFetched += 1;
    totalPages = page.totalPages;
    totalCount = page.totalCount;

    for (const row of page.rows) {
      const receiptNo = row.rcept_no?.trim();
      if (receiptNo) {
        rowsByReceiptNo.set(receiptNo, row);
      }
    }

    pageNo += 1;
  }

  return {
    dateKey,
    fetchedAt: new Date().toISOString(),
    pagesFetched,
    totalCount,
    rows: [...rowsByReceiptNo.values()],
  };
}
