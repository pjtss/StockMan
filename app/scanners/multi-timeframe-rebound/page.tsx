import Link from "next/link";
import { PageNavigation } from "@/components/page-navigation";
import { MultiTimeframeReboundCopy } from "@/components/multi-timeframe-rebound-copy";
import { MultiTimeframeApiRunner } from "@/components/multi-timeframe-api-runner";
import styles from "../page.module.css";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ market?: string; view?: string }> }) {
  const p = await searchParams; const market = p.market?.toUpperCase() === "KR" ? "KR" : "US"; const view = ["rebound", "recommendations", "pullback", "all-middle-above"].includes(p.view ?? "") ? p.view! : "rebound";
  const title = view === "rebound" ? "BB 반등 준비 종목" : view === "recommendations" ? "통합 추천 종목" : view === "pullback" ? "BB 풀백 종목" : "일·주·월봉 중단선 이상 종목";
  return <><PageNavigation current="multi-timeframe-rebound" /><main className={styles.page}><section className={styles.hero}><div className={styles.kicker}>MULTI-TIMEFRAME ANALYSIS</div><h1 className={styles.title}>{title}</h1><p>조건을 선택한 뒤 API 실행 버튼을 눌러 결과를 조회합니다.</p></section><div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginBottom:24}}>{["rebound","recommendations","pullback","all-middle-above"].map(v=><Link key={v} href={`/scanners/multi-timeframe-rebound?market=${market}&view=${v}`}>{v === "rebound" ? "반등" : v === "recommendations" ? "통합 추천" : v === "pullback" ? "BB 풀백" : "중단선 이상"}</Link>)}<Link href={`/scanners/multi-timeframe-rebound?market=KR&view=${view}`}>국내</Link><Link href={`/scanners/multi-timeframe-rebound?market=US&view=${view}`}>해외</Link><MultiTimeframeApiRunner /><MultiTimeframeReboundCopy text="API 실행 후 결과를 복사할 수 있습니다." /></div><section style={{border:"1px solid var(--border-color,#334155)",borderRadius:12,padding:20,textAlign:"center"}}>현재 선택: {market === "KR" ? "국내" : "해외"} · {title}<br/><small>서버 대량 계산은 버튼 실행 시에만 진행됩니다.</small></section></main></>;
}
