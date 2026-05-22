import { createDisabledApiResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  return createDisabledApiResponse("SEC 공시");
}
