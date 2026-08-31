"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NoticeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/notices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, content }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "공지사항 등록에 실패했습니다."); return; }
    router.push(`/notices/${body.id}`);
  }
  return <form className="inquiryForm" onSubmit={submit}>
    <div className="inquiryFormIntro"><span>새 공지사항</span><p>관리자에게만 공개된 작성 화면입니다.</p></div>
    <label>제목<input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} required /></label>
    <label>내용<textarea value={content} maxLength={5000} onChange={(event) => setContent(event.target.value)} required rows={10} /></label>
    {error && <p role="alert">{error}</p>}
    <div className="inquiryFormActions"><button type="button" onClick={() => router.push("/notices")}>취소</button><button type="submit">공지 등록</button></div>
  </form>;
}
