"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function InquiryAdminControls({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm("이 문의글을 삭제할까요? 삭제 후 일반 화면에서는 보이지 않습니다.")) return;
    setBusy(true);
    const response = await fetch(`/api/inquiries/${id}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) router.push("/inquiries");
  }
  return <div className="inquiryAdminBar"><strong>관리자 도구</strong><button type="button" disabled={busy} onClick={() => void remove()}>{busy ? "삭제 중…" : "문의글 삭제"}</button></div>;
}
