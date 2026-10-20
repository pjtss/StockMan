export function getMarketRssNotificationStatusDisplay(status: string) {
  switch (status) {
    case "PENDING": return { label: "알림 대기", tone: "translationMuted" as const, description: "" };
    case "PROCESSING": return { label: "발송 준비 중", tone: "translationMuted" as const, description: "" };
    case "SENDING": return { label: "Discord 전송 중", tone: "translationWarning" as const, description: "" };
    case "SENT": return { label: "Discord 전송 완료", tone: "translationSuccess" as const, description: "" };
    case "FAILED": return { label: "알림 실패", tone: "translationError" as const, description: "" };
    case "SKIPPED": return { label: "알림 제외", tone: "translationMuted" as const, description: "" };
    case "UNCERTAIN": return {
      label: "전송 여부 확인 필요",
      tone: "translationWarning" as const,
      description: "Discord가 메시지를 받았을 수 있어 자동 재전송하지 않았습니다. Discord 채널에서 먼저 확인하세요.",
    };
    default: return { label: "알림 상태 확인 필요", tone: "translationWarning" as const, description: "" };
  }
}
