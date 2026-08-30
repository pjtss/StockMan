import { NextResponse } from "next/server"; import { toggleLike } from "@/lib/inquiries"; import { getRequestIdentity } from "@/lib/request-identity";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const liked=await toggleLike(Number((await params).id),getRequestIdentity(request).userKey);return NextResponse.json({ok:true,liked});}
