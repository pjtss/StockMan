import { NextRequest, NextResponse } from "next/server";
import { getContractDetails } from "@/lib/opendart";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rceptNo = searchParams.get("rceptNo");

  if (!rceptNo || rceptNo.length !== 14) {
    return NextResponse.json({ error: "Invalid rceptNo" }, { status: 400 });
  }

  try {
    const details = await getContractDetails(rceptNo);
    
    if (!details) {
      return NextResponse.json(null);
    }

    return NextResponse.json(details);
  } catch (error) {
    console.error("API Route Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ error: "CONTRACT_DETAILS_UNAVAILABLE" }, { status: 503 });
  }
}
