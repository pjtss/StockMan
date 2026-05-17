import { PageNavigation } from "@/components/page-navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <PageNavigation current="home" />
      <section className={styles.hero}>
        <p className={styles.kicker}>⚡ STOCKMAN QUANT</p>
        <h1>STOCKMAN 퀀트 모니터 터미널</h1>
        <p className={styles.description}>
          DART와 SEC 공시를 실시간으로 모니터링하고 KIS 수급 데이터와 교차 검증하는 최첨단 퀀트 대시보드입니다.
          실시간 주도주와 강한 호재를 Stockman 알고리즘으로 즉시 감지하세요.
        </p>
        <div className={styles.actions}>
          <Link href="/dart" className={styles.primary} prefetch={false}>
            DART 페이지 보기
          </Link>
          <Link href="/dart/opendart-fast" className={styles.primaryAlt} prefetch={false}>
            OPEN DART 빠른 공시
          </Link>
          <Link href="/sec" className={styles.secondary} prefetch={false}>
            SEC 페이지 보기
          </Link>
        </div>
      </section>
    </main>
  );
}
