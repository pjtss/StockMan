import { PageNavigation } from "@/components/page-navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <PageNavigation current="home" />
      <section className={styles.hero}>
        <p className={styles.kicker}>STOCKMAN QUANT</p>
        <h1>주식 모니터 터미널</h1>
        <p className={styles.description}>
          실시간 DART 공시 조회 및 호재 필터링 기능이 정상적으로 활성화되어 작동 중입니다.
          그 외 SEC 공시, 국내/미국 스캐너 및 기타 보조 기능은 현재 비활성화 상태입니다.
        </p>
        <div className={styles.actions}>
          <Link href="/dart" className={styles.primary} prefetch={false}>
            DART 호재 공시 보기
          </Link>
          <Link href="/dart/opendart-fast" className={styles.secondary} prefetch={false}>
            OPEN DART 빠른 공시
          </Link>
        </div>
      </section>
    </main>
  );
}
