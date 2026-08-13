/** Converts an existing Discord payload to plain text while preserving embed builders. */
export function toTextWebhookPayload(payload: Record<string, unknown>) {
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  const sections: string[] = [];
  if (typeof payload.content === "string" && payload.content.trim()) sections.push(payload.content.trim());
  for (const raw of embeds) {
    if (!raw || typeof raw !== "object") continue;
    const embed = raw as Record<string, unknown>;
    const lines: string[] = [];
    if (typeof embed.title === "string" && embed.title.trim()) lines.push(embed.title.trim());
    if (typeof embed.description === "string" && embed.description.trim()) lines.push(embed.description.trim());
    if (Array.isArray(embed.fields)) for (const rawField of embed.fields) {
      if (!rawField || typeof rawField !== "object") continue;
      const field = rawField as Record<string, unknown>;
      const name = typeof field.name === "string" ? field.name.trim() : "";
      const value = typeof field.value === "string" ? field.value.trim() : "";
      if (name || value) lines.push(`${name}${name && value ? ": " : ""}${value}`);
    }
    if (embed.footer && typeof embed.footer === "object") {
      const text = (embed.footer as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) lines.push(text.trim());
    }
    if (lines.length) sections.push(lines.join("\n"));
  }
  const content = sections.join("\n\n").trim() || "(알림 내용 없음)";
  return { ...payload, content: content.length > 2000 ? `${content.slice(0, 1997)}…` : content, embeds: undefined };
}
