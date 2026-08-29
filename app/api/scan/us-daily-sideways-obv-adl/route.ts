import { NextResponse } from "next/server";
import { scanUsDailySidewaysObvAdl } from "@/lib/us-daily-sideways-obv-adl";
export async function GET(){try{return NextResponse.json(await scanUsDailySidewaysObvAdl())}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500})}}
