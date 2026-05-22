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
  | "scanners-us";

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
        <Link className={current === "sec" ? styles.navActive : styles.navLink} href="/sec" prefetch={false}>
          SEC
        </Link>
        <Link className={current === "scanners" ? styles.navActive : styles.navLink} href="/scanners" prefetch={false}>
          국내 스캐너
        </Link>
        <Link className={current === "scanners-us" ? styles.navActive : styles.navLink} href="/scanners/us" prefetch={false}>
          미국 스캐너
        </Link>
        <Link className={current === "watchlist" ? styles.navActive : styles.navLink} href="/watchlist" prefetch={false}>
          관심 종목
        </Link>
        <Link className={current === "notifications" ? styles.navActive : styles.navLink} href="/notifications" prefetch={false}>
          알림 센터
        </Link>
      </nav>
      <ThemeToggle />
    </header>
  );
}
