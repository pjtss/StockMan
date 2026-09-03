import { describeError } from "@/lib/error-diagnostics";
import { loadFeatureDiscordDebugWebhook } from "@/lib/discord-config";

let lastFingerprint = "";
let lastReportedAt = 0;
const inFlightFingerprints = new Set<string>();
export async function reportProductionError(input:{error:unknown;path?:string;requestId?:string;source?:string}){
  const d=describeError(input.error); const fingerprint=`${d.errorCode}:${d.message}:${input.path??""}`; const now=Date.now();
  if(fingerprint===lastFingerprint&&now-lastReportedAt<60000)return {sent:false,reason:"deduplicated"};
  if(inFlightFingerprints.has(fingerprint)) return {sent:false,reason:"deduplicated"};
  const webhook=await loadFeatureDiscordDebugWebhook(input.source ?? "production-errors", ["STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL"]); if(!webhook)return {sent:false,reason:"webhook_not_configured"};
  inFlightFingerprints.add(fingerprint);
  const content=["🚨 STOCKMAN 운영 오류",`등급: ${d.errorCode.includes("SCHEMA")||d.errorCode.includes("DATABASE")?"CRITICAL":"ERROR"}`,`출처: ${input.source??"server"}`,`경로: ${input.path??"-"}`,`오류: ${d.message.slice(0,1200)}`,`requestId: ${input.requestId??"-"}`,`커밋: ${process.env.COMMIT_SHA??process.env.VERCEL_GIT_COMMIT_SHA??"-"}`].join("\n");
  try{const response=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content})});if(response.ok){lastFingerprint=fingerprint;lastReportedAt=now;}return {sent:response.ok,status:response.status};}catch{return {sent:false,reason:"discord_unavailable"};} finally { inFlightFingerprints.delete(fingerprint); }
}
