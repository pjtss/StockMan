import type { SecAiPayload } from "./sec-ai-payload";

export type SecBullishLevel =
  | "bullish"
  | "bearish"
  | "neutral"
  | "mixed"
  | "insufficient_data";

export type SecAiEvaluation = {
  level: SecBullishLevel;
  fundamentalScore: number | null;
  catalystScore: number | null;
  shortTermImpactScore: number | null;
  longTermImpactScore: number | null;
  confidence: number;
  noveltyScore: number | null;
  surpriseScore: number | null;
  alreadyPricedInRisk: number | null;
  materialityScore: number | null;
  summary: string;
  facts: string[];
  inferences: string[];
  unknowns: string[];
  eventRisks: string[];
  analysisLimitations: string[];
  marketImpact: string;
  timeHorizon: {
    immediate: SecTimeHorizonImpact;
    shortTerm: SecTimeHorizonImpact;
    longTerm: SecTimeHorizonImpact;
  };
  requiresMarketData: boolean;
  recommendedNextChecks: string[];
};

type SecTimeHorizonImpact =
  | "very_negative"
  | "negative"
  | "neutral"
  | "positive"
  | "strong_positive"
  | "insufficient_data";

export type SecAiEvaluationResult =
  | {
      skipped: false;
      model: string;
      evaluation: SecAiEvaluation;
      rawText: string;
    }
  | {
      skipped: true;
      reason: string;
      rawText?: string;
    };

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_PROMPT_TEXT_LENGTH = 12000;
const impactEnum = ["very_negative", "negative", "neutral", "positive", "strong_positive", "insufficient_data"] as const;
const levelEnum = ["bullish", "bearish", "neutral", "mixed", "insufficient_data"] as const;

const nullableScore = {
  type: ["integer", "null"],
  minimum: 0,
  maximum: 100,
} as const;

const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "level",
    "fundamentalScore",
    "catalystScore",
    "shortTermImpactScore",
    "longTermImpactScore",
    "confidence",
    "noveltyScore",
    "surpriseScore",
    "alreadyPricedInRisk",
    "materialityScore",
    "summary",
    "facts",
    "inferences",
    "unknowns",
    "eventRisks",
    "analysisLimitations",
    "marketImpact",
    "timeHorizon",
    "requiresMarketData",
    "recommendedNextChecks",
  ],
  properties: {
    level: {
      type: "string",
      enum: levelEnum,
    },
    fundamentalScore: nullableScore,
    catalystScore: nullableScore,
    shortTermImpactScore: nullableScore,
    longTermImpactScore: nullableScore,
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },
    noveltyScore: nullableScore,
    surpriseScore: nullableScore,
    alreadyPricedInRisk: nullableScore,
    materialityScore: nullableScore,
    summary: {
      type: "string",
      description: "Concise Korean summary separating long-term quality from short-term spike potential.",
    },
    facts: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" },
    },
    inferences: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" },
    },
    unknowns: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" },
    },
    eventRisks: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: { type: "string" },
    },
    analysisLimitations: {
      type: "array",
      minItems: 0,
      maxItems: 10,
      items: { type: "string" },
    },
    marketImpact: {
      type: "string",
      description: "Korean explanation of likely stock-market impact and short-term spike limitations.",
    },
    timeHorizon: {
      type: "object",
      additionalProperties: false,
      required: ["immediate", "shortTerm", "longTerm"],
      properties: {
        immediate: { type: "string", enum: impactEnum },
        shortTerm: { type: "string", enum: impactEnum },
        longTerm: { type: "string", enum: impactEnum },
      },
    },
    requiresMarketData: {
      type: "boolean",
    },
    recommendedNextChecks: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string" },
    },
  },
} as const;

const genericRiskPatterns = [
  /기술\s*변화/,
  /경쟁사/,
  /경쟁\s*심화/,
  /투자자\s*과민/,
  /시장\s*변동/,
  /technology\s+change/i,
  /competitor/i,
  /competition/i,
  /investor\s+overreaction/i,
  /market\s+volatility/i,
];

const defaultMarketDataLimitations = [
  "시장 기대치 데이터가 없어 surpriseScore를 계산할 수 없다.",
  "공시 전후 주가와 거래량 데이터가 없어 alreadyPricedInRisk를 계산할 수 없다.",
  "시가총액, 매출, 계약 금액 등 기업 규모 비교 데이터가 없어 materialityScore를 계산할 수 없다.",
];

const defaultRecommendedNextChecks = [
  "공시 직후 거래량 변화 확인",
  "공시 전후 주가 반응 확인",
  "계약 금액 또는 매출 기여도 관련 추가 자료 확인",
  "동일 내용의 보도자료 또는 이전 공시 존재 여부 확인",
  "시가총액 및 매출 대비 계약 중요도 확인",
];

function extractOutputText(response: any) {
  if (typeof response?.output_text === "string") return response.output_text;

  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
    }
  }

  return "";
}

function normalizeScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeRequiredScore(value: unknown) {
  return normalizeScore(value) ?? 0;
}

function normalizeLevel(value: unknown): SecBullishLevel {
  if (value === "bullish" || value === "bearish" || value === "neutral" || value === "mixed" || value === "insufficient_data") {
    return value;
  }
  if (value === "strong_bullish" || value === "slightly_bullish") return "bullish";
  if (value === "negative") return "bearish";
  if (value === "uncertain") return "insufficient_data";
  return "insufficient_data";
}

function normalizeImpact(value: unknown): SecTimeHorizonImpact {
  return impactEnum.includes(value as SecTimeHorizonImpact) ? (value as SecTimeHorizonImpact) : "insufficient_data";
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function limit(values: string[], maxItems: number) {
  return values.slice(0, maxItems);
}

function isGenericRisk(value: string) {
  return genericRiskPatterns.some((pattern) => pattern.test(value));
}

function normalizeEvaluation(value: any): SecAiEvaluation {
  const analysisLimitations = limit(dedupe([
    ...normalizeStringArray(value?.analysisLimitations),
    ...defaultMarketDataLimitations,
  ]), 10);

  return {
    level: normalizeLevel(value?.level),
    fundamentalScore: normalizeScore(value?.fundamentalScore),
    catalystScore: normalizeScore(value?.catalystScore),
    shortTermImpactScore: normalizeScore(value?.shortTermImpactScore),
    longTermImpactScore: normalizeScore(value?.longTermImpactScore),
    confidence: normalizeRequiredScore(value?.confidence),
    noveltyScore: normalizeScore(value?.noveltyScore),
    surpriseScore: null,
    alreadyPricedInRisk: null,
    materialityScore: null,
    summary: typeof value?.summary === "string" ? value.summary : "",
    facts: limit(normalizeStringArray(value?.facts), 8),
    inferences: limit(normalizeStringArray(value?.inferences), 8),
    unknowns: limit(normalizeStringArray(value?.unknowns), 8),
    eventRisks: limit(normalizeStringArray(value?.eventRisks).filter((risk) => !isGenericRisk(risk)), 8),
    analysisLimitations,
    marketImpact: typeof value?.marketImpact === "string" ? value.marketImpact : "",
    timeHorizon: {
      immediate: normalizeImpact(value?.timeHorizon?.immediate),
      shortTerm: normalizeImpact(value?.timeHorizon?.shortTerm),
      longTerm: normalizeImpact(value?.timeHorizon?.longTerm),
    },
    requiresMarketData: true,
    recommendedNextChecks: limit(dedupe([
      ...normalizeStringArray(value?.recommendedNextChecks),
      ...defaultRecommendedNextChecks,
    ]), 10),
  };
}

function buildEvaluationInput(payload: SecAiPayload) {
  const promptText =
    payload.promptText.length > MAX_PROMPT_TEXT_LENGTH
      ? `${payload.promptText.slice(0, MAX_PROMPT_TEXT_LENGTH)}\n\n[TRUNCATED]`
      : payload.promptText;

  return [
    `Title: ${payload.title}`,
    `Company: ${payload.metadata.registrantName}`,
    `Ticker: ${payload.metadata.tradingSymbol}`,
    `Form: ${payload.formType}`,
    `Report date: ${payload.metadata.reportDate}`,
    `Accession: ${payload.accession}`,
    `URL: ${payload.link}`,
    "",
    "Events metadata:",
    JSON.stringify(payload.events.map((event) => ({
      type: event.type,
      item: event.item || null,
      title: event.title,
    }))),
    "",
    promptText,
  ].join("\n");
}

function getOpenAiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  };
}

export function isSecAiEvaluationConfigured() {
  return Boolean(getOpenAiConfig().apiKey);
}

export async function evaluateSecFilingWithAi(payload: SecAiPayload): Promise<SecAiEvaluationResult> {
  const { apiKey, model } = getOpenAiConfig();
  if (!apiKey) {
    return { skipped: true, reason: "OPENAI_API_KEY is not configured" };
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions:
        [
          "너는 SEC 공시 기반 주가 영향 분석기다.",
          "SEC 공시 원문에 명시된 내용만 facts에 넣어라.",
          "공시 원문에 없는 계약 금액, 매출 증가율, 이익 증가율을 추정하지 마라.",
          "공시 원문에 없는 내용을 확정적으로 말하지 마라.",
          "추론은 반드시 inferences에 넣고 가능성 표현으로 작성해라.",
          "모르는 정보는 unknowns 또는 analysisLimitations에 넣어라.",
          "좋은 뉴스와 단기 급등 뉴스는 다르다.",
          "장기 펀더멘털 영향과 단기 주가 촉매를 분리해라.",
          "시장 기대치 데이터가 없으면 surpriseScore는 null로 둬라.",
          "공시 전후 주가/거래량 데이터가 없으면 alreadyPricedInRisk는 null로 둬라.",
          "계약 금액, 시가총액, 매출액 데이터가 없으면 materialityScore는 null로 둬라.",
          "generic risk를 만들지 마라.",
          "eventRisks는 공시 내용에서 직접 도출되는 리스크만 넣어라.",
          "analysisLimitations에는 데이터 부족으로 인한 분석 한계를 넣어라.",
          "requiresMarketData는 단기 영향, surpriseScore, alreadyPricedInRisk, materialityScore 판단에 외부 시장 데이터가 필요하면 true로 둬라.",
          "recommendedNextChecks에는 다음에 확인해야 할 시장 데이터나 추가 자료를 넣어라.",
          "모든 응답은 JSON only로 반환해라.",
          "JSON 외 설명 문장을 절대 출력하지 마라.",
          "모든 점수는 0~100 정수 또는 null이어야 한다.",
          "enum 값은 지정된 값만 사용해라.",
        ].join("\n"),
      input: buildEvaluationInput(payload),
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "sec_filing_evaluation",
          strict: true,
          schema: evaluationSchema,
        },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    return { skipped: true, reason: `OpenAI evaluation failed: ${response.status}`, rawText: raw };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { skipped: true, reason: "OpenAI response JSON parse failed", rawText: raw };
  }

  const outputText = extractOutputText(parsed);
  if (!outputText) {
    return { skipped: true, reason: "OpenAI evaluation returned no output_text", rawText: raw };
  }

  let evaluation: any;
  try {
    evaluation = JSON.parse(outputText);
  } catch {
    return { skipped: true, reason: "AI evaluation JSON parse failed", rawText: outputText };
  }

  return {
    skipped: false,
    model,
    evaluation: normalizeEvaluation(evaluation),
    rawText: outputText,
  };
}
