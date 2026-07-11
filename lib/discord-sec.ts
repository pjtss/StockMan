type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordWebhookPayload = {
  content: string;
  username: string;
  allowed_mentions: {
    parse: string[];
  };
  embeds: Array<{
    title: string;
    url?: string;
    description: string;
    color: number;
    fields: DiscordEmbedField[];
    timestamp: string;
    footer: {
      text: string;
    };
  }>;
};

export type SecDiscordResult = {
  request?: {
    url?: string;
    originalUrl?: string;
  };
  urlInfo?: {
    canonicalUrl?: string;
    accessionNumber?: string;
    documentFile?: string;
  };
  document?: {
    metadata?: {
      documentType?: string;
      registrantName?: string;
      tradingSymbol?: string;
      reportDate?: string;
    };
    events?: Array<{
      type?: string;
      item?: string;
      title?: string;
      text?: string;
    }>;
  };
  aiEvaluation?: {
    skipped?: boolean;
    reason?: string;
    model?: string;
    evaluation?: {
      level?: string;
      fundamentalScore?: number | null;
      catalystScore?: number | null;
      shortTermImpactScore?: number | null;
      longTermImpactScore?: number | null;
      confidence?: number | null;
      noveltyScore?: number | null;
      surpriseScore?: number | null;
      alreadyPricedInRisk?: number | null;
      materialityScore?: number | null;
      summary?: string;
      facts?: string[];
      inferences?: string[];
      unknowns?: string[];
      eventRisks?: string[];
      analysisLimitations?: string[];
      marketImpact?: string;
      requiresMarketData?: boolean;
      recommendedNextChecks?: string[];
      timeHorizon?: {
        immediate?: string;
        shortTerm?: string;
        longTerm?: string;
      };
    };
  };
};

export type DiscordSendResult = {
  ok: boolean;
  status: number;
  responseText: string;
};

const DISCORD_SUCCESS_STATUSES = new Set([200, 204]);

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function compactLines(values: Array<string | undefined | null>) {
  return values.filter((value): value is string => Boolean(value && value.trim())).join("\n");
}

function list(values: string[] | undefined, maxItems = 4) {
  const items = (values || []).filter(Boolean).slice(0, maxItems);
  if (items.length === 0) return "-";
  return items.map((item) => `• ${item}`).join("\n");
}

function score(value: number | null | undefined) {
  return value === null || value === undefined ? "null" : `${value}`;
}

function colorForLevel(level: string | undefined) {
  switch (level) {
    case "bullish":
      return 0x00ffa3;
    case "bearish":
      return 0xef4444;
    case "mixed":
      return 0xf59e0b;
    case "neutral":
      return 0x94a3b8;
    default:
      return 0x64748b;
  }
}

function addField(fields: DiscordEmbedField[], name: string, value: string, inline = false) {
  fields.push({
    name: truncate(name, 256),
    value: truncate(value || "-", 1024),
    inline,
  });
}

export function buildSecDiscordWebhookPayload(result: SecDiscordResult): DiscordWebhookPayload {
  const metadata = result.document?.metadata;
  const evaluation = result.aiEvaluation?.evaluation;
  const company = metadata?.registrantName || "SEC filing";
  const ticker = metadata?.tradingSymbol ? ` (${metadata.tradingSymbol})` : "";
  const form = metadata?.documentType || "-";
  const level = result.aiEvaluation?.skipped ? "skipped" : evaluation?.level || "insufficient_data";
  const canonicalUrl = result.urlInfo?.canonicalUrl || result.request?.url;
  const firstEvent = result.document?.events?.[0];
  const fields: DiscordEmbedField[] = [];

  addField(fields, "Form / Date", `${form} / ${metadata?.reportDate || "-"}`, true);
  addField(fields, "Accession", result.urlInfo?.accessionNumber || "-", true);
  addField(fields, "Level", level, true);

  if (evaluation) {
    addField(
      fields,
      "Scores",
      compactLines([
        `Fundamental: ${score(evaluation.fundamentalScore)}`,
        `Catalyst: ${score(evaluation.catalystScore)}`,
        `Short term: ${score(evaluation.shortTermImpactScore)}`,
        `Long term: ${score(evaluation.longTermImpactScore)}`,
        `Confidence: ${score(evaluation.confidence)}`,
      ]),
      true,
    );
    addField(
      fields,
      "Market Data Needed",
      compactLines([
        `requiresMarketData: ${String(evaluation.requiresMarketData)}`,
        `surpriseScore: ${score(evaluation.surpriseScore)}`,
        `alreadyPricedInRisk: ${score(evaluation.alreadyPricedInRisk)}`,
        `materialityScore: ${score(evaluation.materialityScore)}`,
      ]),
      true,
    );
    addField(
      fields,
      "Time Horizon",
      compactLines([
        `Immediate: ${evaluation.timeHorizon?.immediate || "-"}`,
        `Short: ${evaluation.timeHorizon?.shortTerm || "-"}`,
        `Long: ${evaluation.timeHorizon?.longTerm || "-"}`,
      ]),
      true,
    );
    addField(fields, "Facts", list(evaluation.facts));
    addField(fields, "Unknowns", list(evaluation.unknowns));
    addField(fields, "Analysis Limitations", list(evaluation.analysisLimitations));
    addField(fields, "Next Checks", list(evaluation.recommendedNextChecks));
  } else if (result.aiEvaluation?.skipped) {
    addField(fields, "AI Evaluation", result.aiEvaluation.reason || "skipped");
  }

  if (firstEvent) {
    addField(
      fields,
      "Event",
      compactLines([
        `${firstEvent.type || "EVENT"}${firstEvent.item ? ` / Item ${firstEvent.item}` : ""}`,
        firstEvent.title || "",
        firstEvent.text ? truncate(firstEvent.text, 700) : "",
      ]),
    );
  }

  return {
    content: truncate(`SEC 분석 결과: ${company}${ticker} ${form} ${level}`, 2000),
    username: "STOCKMAN SEC",
    allowed_mentions: {
      parse: [],
    },
    embeds: [
      {
        title: truncate(`${company}${ticker} ${form}: ${level}`, 256),
        url: canonicalUrl,
        description: truncate(evaluation?.summary || result.aiEvaluation?.reason || "SEC 분석 결과입니다.", 4096),
        color: colorForLevel(evaluation?.level),
        fields,
        timestamp: new Date().toISOString(),
        footer: {
          text: "STOCKMAN SEC Analyzer",
        },
      },
    ],
  };
}

function getDiscordWebhookUrl() {
  return process.env.SEC_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || "";
}

export function isSecDiscordConfigured() {
  return Boolean(getDiscordWebhookUrl());
}

export async function sendSecResultToDiscord(result: SecDiscordResult): Promise<DiscordSendResult> {
  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    throw new Error("SEC_DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL is not configured");
  }

  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(buildSecDiscordWebhookPayload(result)),
  });
  const responseText = await response.text();

  return {
    ok: DISCORD_SUCCESS_STATUSES.has(response.status),
    status: response.status,
    responseText,
  };
}
