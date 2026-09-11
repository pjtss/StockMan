"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./page-navigation.module.css";

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
  | "notices"
  | "market-news"
  | "disclosures"
  | "login"
  | "register"
  | "notes"
  | "investment-calendar"
  | "other"

export function PageNavigation({ current }: { current: PageKey }) {
  const [username, setUsername] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => { fetch(`/api/auth/me?ts=${Date.now()}`, { credentials: "same-origin", cache: "no-store" }).then(response => response.ok ? response.json() : null).then(body => setUsername(body?.authenticated ? body.user?.username ?? null : null)).catch(() => setUsername(null)).finally(() => setAuthChecked(true)); }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); setUsername(null); window.location.reload(); }
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
        <Link aria-current={current === "watchlist" ? "page" : undefined} className={current === "watchlist" ? styles.navActive : styles.navLink} href="/watchlist" prefetch={false}>
          관심종목
        </Link>
        <Link aria-current={current === "notes" ? "page" : undefined} className={current === "notes" ? styles.navActive : styles.navLink} href="/notes" prefetch={false}>
          메모장
        </Link>
        <Link aria-current={current === "inquiries" ? "page" : undefined} className={current === "inquiries" ? styles.navActive : styles.navLink} href="/inquiries" prefetch={false}>
          문의
        </Link>
        <Link aria-current={current === "notices" ? "page" : undefined} className={current === "notices" ? styles.navActive : styles.navLink} href="/notices" prefetch={false}>
          공지사항
        </Link>
        <Link aria-current={current === "market-news" ? "page" : undefined} className={current === "market-news" ? styles.navActive : styles.navLink} href="/market-news" prefetch={false}>
          해외 뉴스
        </Link>
        <Link aria-current={current === "investment-calendar" ? "page" : undefined} className={current === "investment-calendar" ? styles.navActive : styles.navLink} href="/investment-calendar" prefetch={false}>
          투자 일정
        </Link>
        <Link aria-current={current === "other" ? "page" : undefined} className={current === "other" ? styles.navActive : styles.navLink} href="/other" prefetch={false}>
          기타
        </Link>
        <Link aria-current={current === "scanners-us" ? "page" : undefined} className={current === "scanners-us" ? styles.navActive : styles.navLink} href="/us-top-rising" prefetch={false}>
          해외 상승률 TOP 100
        </Link>
        <Link aria-current={current === "disclosures" ? "page" : undefined} className={current === "disclosures" ? styles.navActive : styles.navLink} href="/disclosures" prefetch={false}>
          일별 공시
        </Link>
        <Link
          aria-current={current === "notifications" ? "page" : undefined}
          className={current === "notifications" ? styles.navActive : styles.navLink}
          href="/notifications"
          prefetch={false}
        >
          알림 설정
        </Link>
        {authChecked && (username ? <button type="button" className={styles.navLink} onClick={logout} aria-label={`${username} 로그아웃`}>로그아웃</button> : <Link aria-current={current === "login" ? "page" : undefined} className={current === "login" ? styles.navActive : styles.navLink} href="/login" prefetch={false}>로그인</Link>)}
      </nav>
    </header>
  );
}
