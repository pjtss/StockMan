import { NextResponse } from "next/server"; import { clearUserSessionCookie, logoutUser } from "@/lib/user-auth";
export async function POST(){await logoutUser().catch(()=>undefined);const response=NextResponse.json({ok:true});const c=clearUserSessionCookie();response.cookies.set(c.name,c.value,c.options);return response;}
