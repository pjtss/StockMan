/** SEC RSS form types allowed through to the Market RSS Discord channel. */
export const SEC_RSS_DISCORD_ALLOWED_FORM_TYPES = ["8-K", "6-K"] as const;

export type SecRssDiscordAllowedFormType = typeof SEC_RSS_DISCORD_ALLOWED_FORM_TYPES[number];

type SecRssItem = { title: string; raw?: unknown };

function readSecFormCategory(raw: unknown): { present: boolean; term: string | null } {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return { present: false, term: null }; }
  }
  if (!value || typeof value !== "object") return { present: false, term: null };

  const category = (value as Record<string, unknown>).category;
  const categories = Array.isArray(category) ? category : category == null ? [] : [category];
  const formCategory = categories.find((entry) => entry && typeof entry === "object" && String((entry as Record<string, unknown>).label || "").toLowerCase() === "form type");
  if (!formCategory || typeof formCategory !== "object") return { present: false, term: null };
  const term = (formCategory as Record<string, unknown>).term;
  return { present: true, term: typeof term === "string" ? term.trim().toUpperCase() : null };
}

/** SEC's explicit Atom form category is authoritative. */
export function getSecRssDiscordFormType(item: SecRssItem, options: { allowLegacyTitleFallback?: boolean } = {}): SecRssDiscordAllowedFormType | null {
  const category = readSecFormCategory(item.raw);
  const titleMatch = options.allowLegacyTitleFallback ? item.title.match(/^\s*(8-K|6-K)(?=\s|[-:])/i)?.[1]?.toUpperCase() : null;
  const formType = category.present ? category.term : titleMatch ?? null;
  return formType && SEC_RSS_DISCORD_ALLOWED_FORM_TYPES.includes(formType as SecRssDiscordAllowedFormType)
    ? formType as SecRssDiscordAllowedFormType
    : null;
}

export function isSecRssDiscordItemAllowed(item: SecRssItem, options?: { allowLegacyTitleFallback?: boolean }): boolean {
  return getSecRssDiscordFormType(item, options) !== null;
}
