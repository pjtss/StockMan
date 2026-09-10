import { NextResponse } from "next/server";
import { createUserNote, listUserNotes } from "@/lib/user-notes";

function readText(value: unknown) { return typeof value === "string" ? value : null; }
function readPayload(body: any) { const title = readText(body?.title); const content = readText(body?.content); return title !== null && content !== null ? { title, content } : null; }
export async function GET() { try { const notes = await listUserNotes(); return notes ? NextResponse.json({ ok:true, notes }) : NextResponse.json({ ok:false,error:"UNAUTHORIZED" },{status:401}); } catch { return NextResponse.json({ok:false,error:"NOTES_UNAVAILABLE"},{status:503}); } }
export async function POST(request: Request) { try { const payload = readPayload(await request.json()); if (!payload || !payload.title.trim()) return NextResponse.json({ok:false,error:"TITLE_REQUIRED"},{status:400}); const note = await createUserNote(payload.title,payload.content); return note ? NextResponse.json({ok:true,note},{status:201}) : NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401}); } catch { return NextResponse.json({ok:false,error:"NOTES_UNAVAILABLE"},{status:503}); } }
