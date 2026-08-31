import Link from "next/link";
import { PageNavigation } from "@/components/page-navigation";
import { listNotices } from "@/lib/notices";
import { formatDisplayDateTime } from "@/lib/display-number";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const rows = await listNotices();
  return <><PageNavigation current="notices" /><main className="page-shell inquiryPage"><section className="hero inquiryHero"><div className="kicker">NOTICE</div><h1>공지사항</h1><p>서비스의 주요 안내와 변경사항을 확인하세요.</p></section><section className="inquiryBoard"><div className="inquiryBoardHead"><div><h2>공지사항</h2><p>{rows.length}개의 공지가 등록되어 있습니다.</p></div></div>{rows.length === 0 ? <div className="inquiryEmpty"><span aria-hidden="true">✦</span><p>등록된 공지사항이 없습니다.</p></div> : <div className="inquiryList">{rows.map((row) => <Link className="inquiryRow" key={row.id} href={`/notices/${row.id}`}><div className="inquiryRowMain"><strong><span className="inquiryNoticeBadge">공지</span>{row.title}</strong><small>{row.author_key} · {formatDisplayDateTime(row.published_at)}</small></div></Link>)}</div>}</section></main></>;
}
