"use client";

import Link from "next/link";
import styles from "./page-navigation.module.css";
import { ThemeToggle } from "./theme-toggle";

type PageKey =
  | "home"
  | "dart"
  | "dart-opendart-fast"
  | "sec"
  | "scanners"
  | "watchlist"
  | "notifications"
  | "scanners-us"
  | "us-intensity"
  | "multi-timeframe-rebound"
  | "charts"
  | "admin"

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
          홈
        </Link>
        <Link className={current === "dart" ? styles.navActive : styles.navLink} href="/dart" prefetch={false}>
          DART
        </Link>

        <Link className={current === "multi-timeframe-rebound" ? styles.navActive : styles.navLink} href="/scanners/multi-timeframe-rebound" prefetch={false}>
          일·주·월봉 탐지
        </Link>
        <Link className={current === "charts" ? styles.navActive : styles.navLink} href="/charts" prefetch={false}>
          티커 차트
        </Link>
        <Link
          className={current === "notifications" ? styles.navActive : styles.navLink}
          href="/notifications"
          prefetch={false}
        >
          알림 설정
        </Link>
        <Link className={current === "admin" ? styles.navActive : styles.navLink} href="/admin" prefetch={false}>
          관리자
        </Link>
      </nav>
      <ThemeToggle />
    </header>
  );
}
