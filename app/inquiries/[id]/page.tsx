import Link from "next/link";
import { PageNavigation } from "@/components/page-navigation";
import { InquiryInteraction } from "@/components/inquiry-interaction";
import { InquiryViewTracker } from "@/components/inquiry-view-tracker";
import { InquiryAdminControls } from "@/components/inquiry-admin-controls";
import { getInquiry } from "@/lib/inquiries";
import { maskIp, summarizeUserAgent } from "@/lib/request-identity";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const row = await getInquiry(id);
  const isAdmin = await requireAdminSession();
  if (!row) return <><PageNavigation current="inquiries" /><main className="page-shell inquiryPage"><section className="inquiryBoard inquiryNotFound">존재하지 않는 문의글입니다.<br /><Link href="/inquiries">목록으로</Link></section></main></>;
  return <><PageNavigation current="inquiries" /><InquiryViewTracker id={id} /><main className="page-shell inquiryPage"><div className="inquiryBack"><Link href="/inquiries">← 문의 게시판</Link></div><article className="inquiryBoard inquiryDetail"><header className="inquiryDetailHeader"><div className="kicker">INQUIRY</div><h1>{row.title}</h1><div className="inquiryMeta"><span>{row.author_key}</span><span>{maskIp(row.ip_address)}</span><span>{summarizeUserAgent(row.user_agent)}</span><span>조회 {row.view_count}</span></div></header><div className="inquiryContent">{row.content}</div>{isAdmin && <InquiryAdminControls id={id} />}<div className="inquirySectionHeading"><h2>반응과 댓글</h2><p>문의에 공감하거나 의견을 남겨주세요.</p></div><InquiryInteraction id={id} initialLikeCount={row.like_count} comments={row.comments} isAdmin={isAdmin} /><Link className="inquiryBackLink" href="/inquiries">목록으로 돌아가기</Link></article></main></>;
}
