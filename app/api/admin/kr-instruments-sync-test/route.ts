import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { syncKrInstrumentUniverseFromKis } from "@/lib/kr-instruments";
export async function POST(){try{await requireAdminSession();return NextResponse.json(await syncKrInstrumentUniverseFromKis());}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});}}
export const GET = POST;
