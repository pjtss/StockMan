import Link from "next/link";
import styles from "./page-navigation.module.css";

type PageKey = "home" | "dart" | "dart-opendart-fast" | "sec" | "scanners";

export function PageNavigation({ current }: { current: PageKey }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logoIcon}>⚡</span>
        <span className={styles.brandName}>STOCKMAN</span>
        <span className={styles.brandSubtitle}>QUANT</span>
      </div>
      <nav className={styles.nav}>
        <Link className={current === "home" ? styles.navActive : styles.navLink} href="/" prefetch={false}>
          🏠 홈
        </Link>
        <Link className={current === "dart" ? styles.navActive : styles.navLink} href="/dart" prefetch={false}>
          📋 일반 DART
        </Link>
        <Link
          className={current === "dart-opendart-fast" ? styles.navActive : styles.navLink}
          href="/dart/opendart-fast"
          prefetch={false}
        >
          ⚡ 실시간 DART
        </Link>
        <Link className={current === "sec" ? styles.navActive : styles.navLink} href="/sec" prefetch={false}>
          🇺🇸 SEC
        </Link>
        <Link className={current === "scanners" ? styles.navActive : styles.navLink} href="/scanners" prefetch={false}>
          📊 마켓 스캐너
        </Link>
      </nav>
    </header>
  );
}
