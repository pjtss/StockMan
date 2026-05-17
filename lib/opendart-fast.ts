const OPENDART_LIST_URL = "https://opendart.fss.or.kr/api/list.json";
const OPENDART_VIEWER_URL = "https://dart.fss.or.kr/dsaf001/main.do";

const SEARCH_TYPES = ["B", "E", "I"] as const;
const MARKET_CLASSES = ["Y", "K"] as const;
const STRONG_BULLISH_KEYWORDS = [
  "단일판매ㆍ공급계약체결",
  "공급계약체결",
  "대규모수주",
  "수주",
  "자기주식취득",
  "자기주식 취득",
  "자사주 취득",
  "무상증자",
  "현금ㆍ현물배당결정",
  "배당결정",
  "영업이익 증가",
  "매출액 증가",
  "특허권 취득",
  "유형자산 양수",
  "타법인주식및출자증권취득결정",
  "대량보유상황보고",
  "주식대량보유",
  "타법인주식",
  "타법인 주식",
  "전환사채권발행결정",
  "신주인수권부사채권발행결정",
  "소송 등의 제기",
  "소송등의제기",
  "영업실적",
  "재무제표",
];

type OpenDartListRow = {
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

type OpenDartResponse = {
  status?: string;
  message?: string;
  list?: OpenDartListRow[];
};

export type DetailCategory =
  | "insider"
  | "treasury"
  | "contract"
  | "capital"
  | "dividend"
  | "activism"
  | "mna"
  | "earnings"
  | "cb_bw"
  | "lawsuit"
  | null;

export type OpenDartFastItem = {
  corpCls: string;
  corpName: string;
  corpCode: string;
  stockCode: string;
  reportName: string;
  receiptNo: string;
  filerName: string;
  receiptDate: string;
  remarks: string;
  judgment: "최강호재" | "호재가능";
  keywords: string[];
  link: string;
  detailCategory: DetailCategory;
};

export type OpenDartFastPayload = {
  source: "OPENDART";
  fetchedAt: string;
  items: OpenDartFastItem[];
};

function getApiKey() {
  const key = process.env.OPENDART_API_KEY;
  if (!key) {
    throw new Error("OPENDART_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return key;
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
}

function classifyReportName(reportName: string): { judgment: "최강호재" | "호재가능"; keywords: string[] } | null {
  const keywords = STRONG_BULLISH_KEYWORDS.filter((keyword) => reportName.includes(keyword));
  if (keywords.length > 0) {
    return {
      judgment: "최강호재",
      keywords,
    };
  }

  if (reportName.includes("영업이익") || reportName.includes("매출액")) {
    return {
      judgment: "호재가능",
      keywords: ["실적"],
    };
  }

  return null;
}

function buildViewerLink(receiptNo: string) {
  return `${OPENDART_VIEWER_URL}?rcpNo=${receiptNo}`;
}

async function fetchDisclosureList(searchType: (typeof SEARCH_TYPES)[number], marketClass: (typeof MARKET_CLASSES)[number]) {
  const params = new URLSearchParams({
    crtfc_key: getApiKey(),
    bgn_de: getTodayKey(),
    end_de: getTodayKey(),
    last_reprt_at: "Y",
    pblntf_ty: searchType,
    corp_cls: marketClass,
    sort: "date",
    sort_mth: "desc",
    page_count: "100",
  });

  const response = await fetch(`${OPENDART_LIST_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`OPEN DART 공시검색 요청 실패: ${response.status}`);
  }

  const payload = (await response.json()) as OpenDartResponse;
  if (payload.status && payload.status !== "000" && payload.status !== "013") {
    throw new Error(payload.message || `OPEN DART 오류 코드: ${payload.status}`);
  }

  return payload.list ?? [];
}

export async function fetchOpenDartFastFeed(): Promise<OpenDartFastPayload> {
  const results = await Promise.all(
    SEARCH_TYPES.flatMap((searchType) => MARKET_CLASSES.map((marketClass) => fetchDisclosureList(searchType, marketClass))),
  );

  const deduped = new Map<string, OpenDartFastItem>();

  for (const rows of results) {
    for (const row of rows) {
      const receiptNo = row.rcept_no?.trim();
      const reportName = row.report_nm?.trim();
      if (!receiptNo || !reportName) {
        continue;
      }

      const classified = classifyReportName(reportName);
      if (!classified) {
        continue;
      }

      let detailCategory: DetailCategory = null;
      if (reportName.includes("소유보고")) detailCategory = "insider";
      else if (reportName.includes("자기주식")) detailCategory = "treasury";
      else if (reportName.includes("단일판매") || reportName.includes("공급계약")) detailCategory = "contract";
      else if (reportName.includes("유상증자") || reportName.includes("무상증자")) detailCategory = "capital";
      else if (reportName.includes("배당")) detailCategory = "dividend";
      else if (reportName.includes("대량보유상황보고") || reportName.includes("주식대량보유")) detailCategory = "activism";
      else if (reportName.includes("타법인주식") || reportName.includes("타법인 주식")) detailCategory = "mna";
      else if (reportName.includes("영업실적") || reportName.includes("재무제표")) detailCategory = "earnings";
      else if (reportName.includes("전환사채") || reportName.includes("신주인수권부사채")) detailCategory = "cb_bw";
      else if (reportName.includes("소송")) detailCategory = "lawsuit";

      deduped.set(receiptNo, {
        corpCls: row.corp_cls?.trim() || "",
        corpName: row.corp_name?.trim() || "회사명 확인 필요",
        corpCode: (row as any).corp_code?.trim() || "", // list.json returns corp_code, but might not be in our strict type
        stockCode: row.stock_code?.trim() || "",
        reportName,
        receiptNo,
        filerName: row.flr_nm?.trim() || "",
        receiptDate: row.rcept_dt?.trim() || "",
        remarks: row.rm?.trim() || "",
        judgment: classified.judgment,
        keywords: classified.keywords,
        link: buildViewerLink(receiptNo),
        detailCategory,
      });
    }
  }

  return {
    source: "OPENDART",
    fetchedAt: new Date().toISOString(),
    items: [...deduped.values()],
  };
}
