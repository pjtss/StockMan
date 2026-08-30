import { NextResponse } from "next/server"; import { addLike } from "@/lib/inquiries"; import { getRequestIdentity } from "@/lib/request-identity";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const id=Number((await params).id);const count=await addLike(id,getRequestIdentity(request));return NextResponse.json({ok:true,count});}
