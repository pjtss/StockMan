import { PageNavigation } from "@/components/page-navigation";
import Link from "next/link";
import styles from "./page.module.css";

const destinations = [
  { href: "/dart", label: "DART 공시 분석", description: "실시간 국내 공시와 상세 분석" },
];

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
        <section className={styles.destinationSection} aria-labelledby="destination-title">
          <div className={styles.sectionHeading}>
            <h2 id="destination-title">빠른 진입</h2>
            <span>{destinations.length} MODULES</span>
          </div>
          <div className={styles.destinationList}>
            {destinations.map((destination, index) => (
              <Link key={destination.href} href={destination.href} prefetch={false} className={styles.destination}>
                <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.destinationCopy}>
                  <strong>{destination.label}</strong>
                  <small>{destination.description}</small>
                </span>
                <span className={styles.arrow} aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
