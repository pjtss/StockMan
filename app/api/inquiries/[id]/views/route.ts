import { NextResponse } from "next/server"; import { incrementView } from "@/lib/inquiries";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){await incrementView(Number((await params).id));return NextResponse.json({ok:true});}
