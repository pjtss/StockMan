import { redirect } from "next/navigation";
import { PageNavigation } from "@/components/page-navigation";
import { NoticeForm } from "@/components/notice-form";
import { requireAdminSession } from "@/lib/admin-auth";

export default async function NewNoticePage() {
  if (!(await requireAdminSession())) redirect("/notices");
  return <><PageNavigation current="notices" /><main className="page-shell inquiryPage"><section className="hero inquiryHero"><div className="kicker">NOTICE</div><h1>공지사항 작성</h1><p>서비스의 주요 안내를 등록하세요.</p></section><NoticeForm /></main></>;
}
