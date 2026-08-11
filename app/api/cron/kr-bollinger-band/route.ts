import { NextResponse } from "next/server";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { sendKrBollingerBandSignals } from "@/lib/discord-kr-bollinger-band";
export async function POST(request:Request){const secret=process.env.CRON_SECRET?.trim();const supplied=request.headers.get("x-cron-secret")||request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");if(!secret||supplied!==secret)return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});const settings=await loadFeatureModuleSettings("kr-bollinger-band");if(!settings.enabled)return NextResponse.json({ok:true,skipped:true,reason:"disabled"});if(!isWithinSchedule(settings,new Date()))return NextResponse.json({ok:true,skipped:true,reason:"outside_schedule"});const result=await scanStoredKrBollingerBands();const discord=await sendKrBollingerBandSignals(result.results);return NextResponse.json({ok:true,data:{...result,discord}});}
