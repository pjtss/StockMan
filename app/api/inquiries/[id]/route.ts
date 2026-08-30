import { NextResponse } from "next/server";
import { getInquiry } from "@/lib/inquiries";
import { maskIp, summarizeUserAgent } from "@/lib/request-identity";
export async function GET(_: Request,{params}:{params:Promise<{id:string}>}) { const row=await getInquiry(Number((await params).id)); if(!row)return NextResponse.json({error:"NOT_FOUND"},{status:404}); return NextResponse.json({...row,ip_address:maskIp(row.ip_address),user_agent:summarizeUserAgent(row.user_agent),comments:row.comments.map((c: { ip_address: string; user_agent: string })=>({...c,ip_address:maskIp(c.ip_address),user_agent:summarizeUserAgent(c.user_agent)}))}); }
