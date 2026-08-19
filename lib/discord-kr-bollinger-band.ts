import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import type { KrBollingerResult } from "@/lib/kr-bollinger-band";
export async function sendKrBollingerBandSignals(results:KrBollingerResult[], zoneLabel = "하단선 이하", moduleKey: "kr-bollinger-band" | "kr-bollinger-middle-lower" = "kr-bollinger-band"){
  const qualified=results.filter(r=>r.qualifies);
  if(!qualified.length)return {sent:0,skipped:true,reason:"no_candidates"};
  const webhook=await loadFeatureDiscordWebhook(moduleKey,["KR_BOLLINGER_BAND_DISCORD_WEBHOOK_URL"]);
  if(!webhook)return {sent:0,skipped:true,reason:"webhook_not_configured"};
  const header=`국내주식 볼린저밴드 ${zoneLabel}\n\n`;
  const rows=qualified.map(r=>`KRX | ${r.name || r.code}`);
  const chunks:string[]=[]; let current=header;
  for(const row of rows){const next=current===header?`${current}${row}`:`${current}\n\n${row}`;if(next.length>1900&&current!==header){chunks.push(current);current=`${header}${row}`;}else current=next;}
  if(current!==header)chunks.push(current);
  const responses=[];
  for(const content of chunks){const response=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content})});responses.push({ok:response.ok,status:response.status,responseText:await response.text()});}
  const failures=responses.filter(r=>!r.ok);
  if(failures.length)throw new Error(`Discord HTTP ${failures[0].status}`);
  return {sent:qualified.length,skipped:false,messageCount:chunks.length};
}
