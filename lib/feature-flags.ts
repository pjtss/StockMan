import { NextResponse } from "next/server";

export const FEATURE_FLAGS = {
  dartRealtimeDisabled: true,
  secRealtimeDisabled: true,
  domesticScannersDisabled: true,
  usScannersDisabled: true,
} as const;

export function createDisabledApiResponse(featureName: string) {
  return NextResponse.json(
    {
      error: `${featureName} 기능은 현재 비활성화 상태입니다.`,
      disabled: true,
    },
    { status: 503 },
  );
}
