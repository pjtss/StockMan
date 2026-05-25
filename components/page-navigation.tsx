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
  | "top-rising"
  | "trading-intensity";

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
        <Link
          className={current === "dart-opendart-fast" ? styles.navActive : styles.navLink}
          href="/dart/opendart-fast"
          prefetch={false}
        >
          OPEN DART
        </Link>
        <Link
          className={current === "top-rising" ? styles.navActive : styles.navLink}
          href="/scanners/top-rising"
          prefetch={false}
        >
          상승률 TOP 10
        </Link>
        <Link
          className={current === "trading-intensity" ? styles.navActive : styles.navLink}
          href="/scanners/trading-intensity"
          prefetch={false}
        >
          체결강도 TOP 10
        </Link>
      </nav>
      <ThemeToggle />
    </header>
  );
}
