"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChartNoAxesCombined,
  Clock3,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Settings2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { ADMIN_NAV_ITEMS, type AdminNavId } from "@/lib/admin-navigation";
import styles from "@/app/admin/page.module.css";

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  features: Activity,
  schedules: Clock3,
  "api-config": Settings2,
  "api-tests": FlaskConical,
  "sec-test": ChartNoAxesCombined,
} satisfies Record<AdminNavId, typeof LayoutDashboard>;

type AdminPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AdminPageShell({ eyebrow, title, description, children }: AdminPageShellProps) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin");
  }

  return (
    <main className={styles.page}>
      <section className={styles.workspace}>
        <header className={styles.adminBar}>
          <Link href="/admin" className={styles.adminBrand} prefetch={false}>
            <span className={styles.brandSignal} aria-hidden="true" />
            <span>STOCKMAN ADMIN</span>
          </Link>
          <button className={styles.iconTextButton} onClick={() => void logout()} disabled={loggingOut}>
            <LogOut size={16} />
            {loggingOut ? "종료 중" : "로그아웃"}
          </button>
        </header>

        <nav className={styles.adminNav} aria-label="관리자 메뉴">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.id} href={item.href} prefetch={false} className={`${styles.adminNavLink} ${active ? styles.adminNavActive : ""}`}>
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.contentHeader}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{description}</p>
        </div>

        <div className={styles.adminContent}>{children}</div>
      </section>
    </main>
  );
}
