export function validateInquiryInput(title: unknown, content: unknown) {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedContent = typeof content === "string" ? content.trim() : "";
  if (!normalizedTitle || !normalizedContent) return { ok: false as const, error: "제목과 내용을 입력해주세요." };
  if (normalizedTitle.length > 100) return { ok: false as const, error: "제목은 1~100자로 입력해주세요." };
  if (normalizedContent.length > 5000) return { ok: false as const, error: "내용은 1~5,000자로 입력해주세요." };
  return { ok: true as const, title: normalizedTitle, content: normalizedContent };
}

export function validateCommentInput(content: unknown) {
  const normalized = typeof content === "string" ? content.trim() : "";
  if (!normalized) return { ok: false as const, error: "댓글을 입력해주세요." };
  if (normalized.length > 2000) return { ok: false as const, error: "댓글은 1~2,000자로 입력해주세요." };
  return { ok: true as const, content: normalized };
}
