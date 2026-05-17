"use client";

import { useEffect, useState } from "react";
import type { ContractDetails } from "@/lib/types";
import styles from "./contract-badge.module.css";

interface Props {
  rceptNo: string;
}

export function ContractBadge({ rceptNo }: Props) {
  const [data, setData] = useState<ContractDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!rceptNo) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/dart/contract?rceptNo=${rceptNo}`);
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [rceptNo]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <span>계약 상세 데이터 불러오는 중...</span>
      </div>
    );
  }

  if (error || !data) {
    // If it fails or not found, just don't show the badge to avoid clutter
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.icon}>💰</span>
        <strong>{data.contractAmount}</strong>
        <span className={styles.ratio}>(매출대비 {data.salesRatio}%)</span>
      </div>
      <div className={styles.details}>
        <span><strong>상대방:</strong> {data.partner}</span>
        <span><strong>기간:</strong> {data.period}</span>
      </div>
    </div>
  );
}
