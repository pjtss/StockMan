import type { SecAiPayload } from "./sec-ai-payload";

export type SecBullishLevel =
  | "strong_bullish"
  | "bullish"
  | "slightly_bullish"
  | "neutral"
  | "negative"
  | "uncertain";

export type SecAiEvaluation = {
  level: SecBullishLevel;
  score: number;
  confidence: number;
  summary: string;
  reasons: string[];
  risks: string[];
  marketImpact: string;
  timeHorizon: "intraday" | "short_term" | "medium_term" | "long_term" | "unclear";
};

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
    };

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_PROMPT_TEXT_LENGTH = 12000;

const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["level", "score", "confidence", "summary", "reasons", "risks", "marketImpact", "timeHorizon"],
  properties: {
    level: {
      type: "string",
      enum: ["strong_bullish", "bullish", "slightly_bullish", "neutral", "negative", "uncertain"],
    },
    score: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "0 means clearly negative, 50 means neutral, 100 means extremely bullish.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },
    summary: {
      type: "string",
      description: "One concise Korean sentence summarizing the bullishness.",
    },
    reasons: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
    },
    risks: {
      type: "array",
      minItems: 0,
      maxItems: 5,
      items: { type: "string" },
    },
    marketImpact: {
      type: "string",
      description: "Korean explanation of likely stock-market impact.",
    },
    timeHorizon: {
      type: "string",
      enum: ["intraday", "short_term", "medium_term", "long_term", "unclear"],
    },
  },
} as const;

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
    promptText,
  ].join("\n");
}

function getOpenAiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  };
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
        "You are a US equity disclosure analyst. Evaluate whether the SEC filing is bullish for the registrant's stock. Answer in Korean. Use only the supplied filing text; do not assume facts not present in the filing.",
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
    throw new Error(`OpenAI evaluation failed: ${response.status} ${raw}`);
  }

  const parsed = JSON.parse(raw);
  const outputText = extractOutputText(parsed);
  if (!outputText) {
    throw new Error("OpenAI evaluation returned no output_text");
  }

  return {
    skipped: false,
    model,
    evaluation: JSON.parse(outputText) as SecAiEvaluation,
    rawText: outputText,
  };
}
