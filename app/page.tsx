import { PageNavigation } from "@/components/page-navigation";
import styles from "./page.module.css";

// The shell must not be served from a long-lived prerender cache after a release.
// Otherwise clients can receive HTML that references chunks from an older build.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.workspace}>
        <header className={styles.topBar}>
          <div className={styles.brand}><span className={styles.signal} /> STOCKMAN QUANT</div>
          <span className={styles.live}><span /> LIVE MONITOR</span>
        </header>
        <PageNavigation current="home" />
        <section className={styles.contentHeader}>
          <p className={styles.eyebrow}>MARKET OPERATIONS</p>
          <h1>주식 모니터 터미널</h1>
          <p className={styles.description}>공시와 실시간 시장 스캐너를 한 화면에서 확인합니다.</p>
        </section>
        <section className={styles.statusBar} aria-label="서비스 상태">
          <div><span className={styles.statusDot} /> 시스템 정상</div>
          <span>실시간 데이터 모니터링</span>
        </section>
      </div>
    </main>
  );
}
