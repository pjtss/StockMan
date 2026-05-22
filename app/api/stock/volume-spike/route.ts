import { createDisabledApiResponse } from "@/lib/feature-flags";

export async function GET() {
  return createDisabledApiResponse("국내 스캐너");
}
