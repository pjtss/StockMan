import { handleAccumulationRequest } from "@/lib/accumulation-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleAccumulationRequest(request, "US");
}
