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
  | "us-top-rising"
  | "top-rising"
  | "trading-intensity"
  | "admin";

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
          className={current === "us-intensity" ? styles.navActive : styles.navLink}
          href="/scanners/us/intensity"
          prefetch={false}
        >
          미국 체결강도
        </Link>
        <Link
          className={current === "us-top-rising" ? styles.navActive : styles.navLink}
          href="/scanners/us/top-rising"
          prefetch={false}
        >
          미국 상승률 TOP N
        </Link>
        <Link
          className={current === "trading-intensity" ? styles.navActive : styles.navLink}
          href="/scanners/trading-intensity"
          prefetch={false}
        >
          체결강도 TOP 10
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
