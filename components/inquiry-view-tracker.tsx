"use client";
import { useEffect } from "react";

export function InquiryViewTracker({ id }: { id: number }) {
  useEffect(() => {
    const key = `inquiry-viewed:${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void fetch(`/api/inquiries/${id}/views`, { method: "POST", keepalive: true });
  }, [id]);
  return null;
}
