import { readLocalEnvFile } from "./local-env.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DECISIONS = new Set(["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE", "INSUFFICIENT"]);
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function buildDiscordContent(item) {
  const plain = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/@/g, "@\u200b").replace(/([\\`*_~|>\[\]()])/g, "\\$1").slice(0, max);
  const content = [
    `📈 **RSS 호재 분석 · ${item.tickerStatus === "NEW" ? "신규 종목" : "기존 분석 종목"} · ${plain(item.ticker, 12)} ${plain(item.companyName, 80)}**`,
    `**${plain(item.translatedTitleKo, 240)}**`,
    plain(item.analysisKo, 900),
    `근거: ${plain((item.evidenceQuotes || []).join(" / "), 500) || "RSS 원문 분석"}`,
    `위험·조건: ${plain(item.risksKo, 400) || "추가 확인 필요"}`,
    `유형: ${plain(item.eventType, 80)} · 중요도 ${item.priority}/100 · 신뢰도 ${plain(item.confidence, 10)}`,
    `출처: ${plain(item.source, 80)} · <${safeArticleUrl(item.article?.link)}>`,
    "투자 권유가 아니며 가격 상승을 보장하지 않습니다.",
  ].filter(Boolean).join("\n");
  return content.length <= 1950 ? content : `${content.slice(0, 1947)}...`;
}

function safeArticleUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["https:", "http:"].includes(url.protocol)) return "원문 링크 없음";
    url.username = ""; url.password = "";
    for (const key of [...url.searchParams.keys()]) if (/(^|[_-])(?:api[_-]?key|access[_-]?token|key|token|secret|auth(?:orization)?|credential|signature|sig)([_-]|$)/i.test(key)) url.searchParams.set(key, "[redacted]");
    return Array.from(url.href).length <= 500 ? url.href : "원문 링크 없음";
  }
  catch { return "원문 링크 없음"; }
}

export function validateAnalyses(value) {
  if (!value || !Array.isArray(value.analyses) || value.analyses.length > 20) throw new Error("analyses 배열(최대 20건)이 필요합니다.");
  for (const item of value.analyses) {
    if (!item || typeof item.source !== "string" || typeof item.externalId !== "string"
      || !/^[a-f0-9]{32}$/.test(item.revisionHash || "") || !DECISIONS.has(item.decision)
      || !["HIGH", "MEDIUM", "LOW"].includes(item.confidence)
      || typeof item.eventType !== "string" || typeof item.translatedTitleKo !== "string"
      || typeof item.analysisKo !== "string" || typeof item.risksKo !== "string"
      || !Array.isArray(item.evidenceQuotes) || !Number.isInteger(item.priority) || item.priority < 0 || item.priority > 100) {
      throw new Error("분석 결과 형식이 API 계약과 일치하지 않습니다.");
    }
    item.ticker = typeof item.ticker === "string" && TICKER.test(item.ticker.trim().toUpperCase()) ? item.ticker.trim().toUpperCase() : null;
  }
  return value;
}

export function parseAnalysisJson(text) {
  if (Buffer.byteLength(text, "utf8") > 1_000_000) throw new Error("stdin JSON이 1MB 제한을 넘었습니다.");
  return validateAnalyses(JSON.parse(text));
}

async function readStdinJson(maxBytes = 1_000_000) {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > maxBytes) throw new Error("stdin JSON이 1MB 제한을 넘었습니다.");
    chunks.push(chunk);
  }
  return parseAnalysisJson(Buffer.concat(chunks).toString("utf8"));
}

function loadConfig() {
  const env = readLocalEnvFile();
  const base = env.RSS_BULLISH_REPORT_API_BASE_URL || process.env.RSS_BULLISH_REPORT_API_BASE_URL;
  const readToken = env.LOCAL_RSS_AGENT_READ_TOKEN || process.env.LOCAL_RSS_AGENT_READ_TOKEN;
  const writeToken = env.LOCAL_RSS_AGENT_WRITE_TOKEN || process.env.LOCAL_RSS_AGENT_WRITE_TOKEN;
  if (!base || !readToken || !writeToken) throw new Error("RSS_BULLISH_REPORT_API_BASE_URL, LOCAL_RSS_AGENT_READ_TOKEN, LOCAL_RSS_AGENT_WRITE_TOKEN을 .env.local에 설정하세요.");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.username || url.password) throw new Error("운영 API는 자격증명 없는 HTTPS origin이어야 합니다.");
  return { base: url.origin, readToken, writeToken, webhook: env.LOCAL_RSS_BULLISH_DISCORD_WEBHOOK_URL || process.env.LOCAL_RSS_BULLISH_DISCORD_WEBHOOK_URL || "" };
}

async function api(config, path, options = {}) {
  const response = await fetch(`${config.base}/api/local-rss-agent${path}`, {
    ...options, headers: { authorization: `Bearer ${options.method === "POST" ? config.writeToken : config.readToken}`, ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) throw new Error(`운영 RSS agent API 오류 (HTTP ${response.status}, ${body.error || "UNKNOWN"})`);
  return body;
}

async function deliverPending(config) {
  if (!config.webhook) throw new Error("LOCAL_RSS_BULLISH_DISCORD_WEBHOOK_URL이 설정되지 않았습니다.");
  const webhook = new URL(config.webhook);
  if (webhook.hostname !== "discord.com" || !/^\/api\/webhooks\/\d+\//.test(webhook.pathname)) throw new Error("Discord webhook 도메인/경로를 확인하세요.");
  const pending = await api(config, "?kind=deliveries&limit=20");
  let sent = 0; let uncertain = 0; let failed = 0;
  for (const item of pending.deliveries || []) {
    const claim = await api(config, "", { method: "POST", body: JSON.stringify({ kind: "delivery", id: item.id, status: "SENDING" }) }).catch(() => null);
    if (!claim) continue;
    let status = "UNCERTAIN"; let messageId = null; let errorText = null;
    try {
      const target = new URL(config.webhook); target.searchParams.set("wait", "true");
      const response = await fetch(target, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: buildDiscordContent(item), allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(15000) });
      if (response.ok) { status = "SENT"; const receipt = await response.json().catch(() => ({})); messageId = receipt.id || null; }
      else { status = response.status < 500 ? "FAILED" : "UNCERTAIN"; errorText = `Discord HTTP ${response.status}`; }
    } catch (error) { errorText = error instanceof Error ? error.message.slice(0, 300) : "Discord request failed"; }
    await api(config, "", { method: "POST", body: JSON.stringify({ kind: "delivery", id: item.id, status, discordMessageId: messageId, error: errorText }) });
    if (status === "SENT") sent += 1; else if (status === "FAILED") failed += 1; else uncertain += 1;
  }
  return { pending: pending.count, sent, failed, uncertain };
}

export async function runAgentCommand(args) {
  if (args[0] === "--help" || args.length === 0) return { usage: "node scripts/local-rss-llm-agent.mjs --prepare [limit] | --save-stdin | --save-base64 <UTF-8 JSON base64> | --deliver | --status", note: "Codex가 --prepare 결과를 직접 분석한 뒤 --save-stdin 또는 --save-base64로 운영 DB에 저장하고, --deliver로 Discord에 전달합니다." };
  const config = loadConfig();
  if (args[0] === "--prepare") return api(config, `?kind=articles&limit=${Math.min(Math.max(Number(args[1]) || 20, 1), 50)}`);
  if (args[0] === "--save-base64" && args[1]) {
    const data = validateAnalyses(JSON.parse(Buffer.from(args[1], "base64").toString("utf8")));
    return api(config, "", { method: "POST", body: JSON.stringify({ kind: "analyses", analyses: data.analyses }) });
  }
  if (args[0] === "--save-stdin") {
    const data = await readStdinJson();
    return api(config, "", { method: "POST", body: JSON.stringify({ kind: "analyses", analyses: data.analyses }) });
  }
  if (args[0] === "--deliver") return deliverPending(config);
  if (args[0] === "--status") return api(config, "?kind=status");
  throw new Error("지원하지 않는 명령입니다. --help를 확인하세요.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAgentCommand(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(`[local-rss-agent] ${error instanceof Error ? error.message : "실패"}`); process.exitCode = 1; });
}
