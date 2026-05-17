import { NextRequest, NextResponse } from "next/server";
import { fetchDisclosureDetails } from "@/lib/opendart-details";
import type { DetailCategory } from "@/lib/opendart-fast";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const corpCode = searchParams.get("corpCode");
  const category = searchParams.get("category") as DetailCategory;

  if (!corpCode || !category) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const details = await fetchDisclosureDetails(corpCode, category);
    return NextResponse.json(details);
  } catch (err) {
    console.error("Disclosure Details API Error:", err);
    return NextResponse.json({ error: "Failed to fetch disclosure details" }, { status: 500 });
  }
}
