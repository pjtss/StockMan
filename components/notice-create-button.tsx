"use client";

import { useRouter } from "next/navigation";

export function NoticeCreateButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="inquiryPrimaryAction"
      onClick={() => router.push("/notices/new")}
    >
      공지 작성 <span aria-hidden="true">＋</span>
    </button>
  );
}
