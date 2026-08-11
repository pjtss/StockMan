import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { refreshKrDailyCandles, refreshKrMarketSnapshot } from "@/lib/kr-daily-price-cache";
export async function POST(){try{await requireAdminSession();const {scopes}=await loadStoredKrInstrumentScopes();const results=[];for(const item of scopes){const [daily,quote]=await Promise.all([refreshKrDailyCandles(item.code),refreshKrMarketSnapshot(item.code)]);results.push({market:item.market,code:item.code,daily:daily?.diagnostics??null,quote:quote?{ok:quote.ok,status:quote.status,price:quote.price,volume:quote.volume,tradingValue:quote.tradingValue,marketCap:quote.marketCap,turnoverRatio:quote.turnoverRatio,rawText:quote.rawText}:null});}return NextResponse.json({ok:true,mode:"ADMIN_MANUAL_REFRESH",instrumentCount:scopes.length,successCount:results.filter(r=>r.daily?.kisOk).length,results});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
export const GET = POST;
