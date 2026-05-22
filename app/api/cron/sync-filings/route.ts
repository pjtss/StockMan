import { createDisabledApiResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  return createDisabledApiResponse("공시 동기화");
}
