import Link from "next/link";
import { notFound } from "next/navigation";
import { PageNavigation } from "@/components/page-navigation";
import { getNotice } from "@/lib/notices";
import { formatDisplayDateTime } from "@/lib/display-number";

export const dynamic = "force-dynamic";

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const notice = await getNotice(id);
  if (!notice) notFound();
  return <><PageNavigation current="notices" /><main className="page-shell inquiryPage"><div className="inquiryBack"><Link href="/notices">← 공지사항</Link></div><article className="inquiryBoard inquiryDetail"><header className="inquiryDetailHeader"><div className="kicker">NOTICE</div><h1><span className="inquiryNoticeBadge">공지</span>{notice.title}</h1><div className="inquiryMeta"><span>{notice.author_key}</span><span>{formatDisplayDateTime(notice.published_at)}</span></div></header><div className="inquiryContent">{notice.content}</div><Link className="inquiryBackLink" href="/notices">목록으로 돌아가기</Link></article></main></>;
}
