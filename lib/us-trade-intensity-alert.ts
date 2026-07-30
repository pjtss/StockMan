import type { TradeIntensityScore } from "@/lib/us-trade-intensity-metrics";

export type TradeIntensityAlertState = "NORMAL" | "WATCH" | "QUALIFIED" | "COOLDOWN";
export type TradeIntensityAlertInput = { market: string; code: string; score: TradeIntensityScore; now?: Date; lastAlertAt?: Date | null; cooldownSeconds?: number };
export type TradeIntensityAlertDecision = { state: TradeIntensityAlertState; shouldAlert: boolean; externalId: string; reason: string };

function bucket(date: Date, cooldownSeconds: number) {
  return Math.floor(date.getTime() / 1000 / Math.max(1, cooldownSeconds));
}

export function decideTradeIntensityAlert(input: TradeIntensityAlertInput): TradeIntensityAlertDecision {
  const now = input.now ?? new Date();
  const cooldownSeconds = Math.max(1, input.cooldownSeconds ?? 600);
  const market = input.market.trim().toUpperCase();
  const code = input.code.trim().toUpperCase();
  const externalId = `us-trade-intensity:${market}:${code}:${bucket(now, cooldownSeconds)}`;
  if (input.score.level === "REJECT") return { state: "NORMAL", shouldAlert: false, externalId, reason: "score_rejected" };
  if (input.score.level === "WATCH") return { state: "WATCH", shouldAlert: false, externalId, reason: "score_watch_only" };
  if (input.lastAlertAt && now.getTime() - input.lastAlertAt.getTime() < cooldownSeconds * 1000) return { state: "COOLDOWN", shouldAlert: false, externalId, reason: "cooldown_active" };
  return { state: "QUALIFIED", shouldAlert: true, externalId, reason: "strong_score_qualified" };
}
