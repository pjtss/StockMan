/** Localize the fixed EDGAR index-title suffix while retaining official form, issuer name, and CIK. */
export function localizeSecFilingTitle(title: string) {
  const match = title.trim().match(/^(\d{1,2}(?:-[A-Z]{1,3}(?:\/[A-Z])?)?)\s*-\s*(.+?)\s+\((\d{10})\)\s+\((Filer|Issuer)\)$/i);
  if (!match) return null;

  const [, form, issuerName, cik, role] = match;
  const localizedRole = role.toLowerCase() === "filer" ? "제출자" : "발행인";
  return `${form.toUpperCase()} 공시 - ${issuerName.trim()} (${cik}) (${localizedRole})`;
}
