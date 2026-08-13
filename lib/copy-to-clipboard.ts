"use client";

/** Copies text in both secure Clipboard API and older/mobile embedded contexts. */
export async function copyToClipboard(text: string) {
  if (!text) throw new Error("복사할 내용이 없습니다.");
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based fallback when permission is denied.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("브라우저가 클립보드 복사를 허용하지 않았습니다.");
}
