import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { refreshAllUsFreeFloat } from "@/lib/us-free-float-automation";
export async function GET(request: Request){try{await requireAdminSession();const params=new URL(request.url).searchParams;const offset=Math.max(0,Number(params.get("offset")??0)||0);const limit=Math.max(1,Math.min(25,Number(params.get("limit")??25)||25));return NextResponse.json({mode:"ADMIN_MANUAL_REFRESH",...(await refreshAllUsFreeFloat({concurrency:4,offset,limit}))});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
