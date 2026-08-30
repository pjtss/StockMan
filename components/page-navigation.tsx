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
  | "charts"
  | "inquiries"

export function PageNavigation({ current }: { current: PageKey }) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="STOCKMAN QUANT 홈" prefetch={false}>
        <span className={styles.logoIcon}>⚡</span>
        <span className={styles.brandName}>STOCKMAN</span>
        <span className={styles.brandSubtitle}>QUANT</span>
      </Link>
      <nav className={styles.nav} aria-label="주요 메뉴">
        <Link aria-current={current === "home" ? "page" : undefined} className={current === "home" ? styles.navActive : styles.navLink} href="/" prefetch={false}>
          홈
        </Link>
        <Link aria-current={current === "dart" ? "page" : undefined} className={current === "dart" ? styles.navActive : styles.navLink} href="/dart" prefetch={false}>
          DART
        </Link>

        <Link aria-current={current === "charts" ? "page" : undefined} className={current === "charts" ? styles.navActive : styles.navLink} href="/charts" prefetch={false}>
          티커 차트
        </Link>
        <Link aria-current={current === "inquiries" ? "page" : undefined} className={current === "inquiries" ? styles.navActive : styles.navLink} href="/inquiries" prefetch={false}>
          문의
        </Link>
        <Link
          aria-current={current === "notifications" ? "page" : undefined}
          className={current === "notifications" ? styles.navActive : styles.navLink}
          href="/notifications"
          prefetch={false}
        >
          알림 설정
        </Link>
      </nav>
      <ThemeToggle />
    </header>
  );
}
