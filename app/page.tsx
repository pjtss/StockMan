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
          현재 실시간 DART, SEC, 국내 스캐너, 미국 스캐너 기능은 비활성화되어 있습니다.
          관심 종목과 알림 센터 같은 보조 기능은 계속 사용할 수 있습니다.
        </p>
        <div className={styles.actions}>
          <Link href="/dart" className={styles.secondary} prefetch={false}>
            DART 상태 보기
          </Link>
          <Link href="/dart/opendart-fast" className={styles.secondary} prefetch={false}>
            OPEN DART 상태 보기
          </Link>
          <Link href="/scanners" className={styles.secondary} prefetch={false}>
            국내 스캐너 상태 보기
          </Link>
          <Link href="/scanners/us" className={styles.secondary} prefetch={false}>
            미국 스캐너 상태 보기
          </Link>
          <Link href="/sec" className={styles.secondary} prefetch={false}>
            SEC 상태 보기
          </Link>
          <Link href="/watchlist" className={styles.primaryAlt} prefetch={false}>
            관심 종목
          </Link>
          <Link href="/notifications" className={styles.primary} prefetch={false}>
            알림 센터
          </Link>
        </div>
      </section>
    </main>
  );
}
