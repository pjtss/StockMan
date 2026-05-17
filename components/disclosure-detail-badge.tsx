"use client";

import { useEffect, useState } from "react";
import type { DetailCategory } from "@/lib/opendart-fast";
import type { DisclosureDetail } from "@/lib/opendart-details";
import styles from "./disclosure-detail-badge.module.css";

interface DisclosureDetailBadgeProps {
  corpCode: string;
  category: DetailCategory;
}

export function DisclosureDetailBadge({ corpCode, category }: DisclosureDetailBadgeProps) {
  const [detail, setDetail] = useState<DisclosureDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchDetail() {
      if (!corpCode || !category) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/dart/details?corpCode=${corpCode}&category=${category}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (!cancelled && data) {
          setDetail(data);
        }
      } catch (err) {
        // Silently fail to not disrupt the main UI
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [corpCode, category]);

  if (!corpCode || !category) return null;

  return (
    <div className={styles.container}>
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>분석 중...</span>
        </div>
      ) : detail ? (
        <span className={`${styles.badge} ${styles[detail.badgeType]}`}>
          {detail.summary}
        </span>
      ) : null}
    </div>
  );
}
