import { createDisabledApiResponse } from "@/lib/feature-flags";

export async function GET() {
  return createDisabledApiResponse("미국 스캐너");
}
