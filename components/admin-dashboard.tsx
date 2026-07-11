"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AdminPageShell } from "@/components/admin-page-shell";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-navigation";
import styles from "@/app/admin/page.module.css";

const GROUPS = ["운영 제어", "API 관리", "SEC 분석"] as const;

export function AdminDashboard() {
  const destinations = ADMIN_NAV_ITEMS.filter((item) => item.id !== "dashboard");

  return (
    <AdminPageShell
      eyebrow="CONTROL CENTER"
      title="관리자 대시보드"
      description="운영 상태, 외부 API 설정, 분석 도구를 기능 단위로 관리합니다."
    >
      <div className={styles.dashboardGroups}>
        {GROUPS.map((group) => (
          <section key={group} className={styles.dashboardGroup} aria-labelledby={`admin-group-${group}`}>
            <div className={styles.groupHeading}>
              <h2 id={`admin-group-${group}`}>{group}</h2>
              <span>{destinations.filter((item) => item.group === group).length}</span>
            </div>
            <div className={styles.taskList}>
              {destinations
                .filter((item) => item.group === group)
                .map((item) => (
                  <Link key={item.id} href={item.href} prefetch={false} className={styles.taskRow}>
                    <span className={styles.taskCopy}>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </AdminPageShell>
  );
}
