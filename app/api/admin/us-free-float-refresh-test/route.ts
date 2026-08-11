import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { refreshAllUsFreeFloat } from "@/lib/us-free-float-automation";
export async function GET(){try{await requireAdminSession();return NextResponse.json({mode:"ADMIN_MANUAL_REFRESH",...(await refreshAllUsFreeFloat({concurrency:4}))});}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
