"use client";

import { PageNavigation } from "@/components/page-navigation";
import { usePushDebug } from "@/components/push-provider";
import { useState } from "react";
import styles from "@/components/feed-page.module.css"; // Reuse existing styles for now

export default function NotificationsPage() {
  const [error, setError] = useState<string | null>(null);
  const { status: pushStatus, enablePush, updatePreferences, refreshStatus, enabling, saving } = usePushDebug();

  async function handleEnablePush() {
    try {
      await enablePush();
      await refreshStatus();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알림 활성화 실패");
    }
  }

  async function handleToggleAll() {
    try {
      const enabled = !pushStatus?.subscriptionExists || pushStatus.enabled === false;
      if (!pushStatus?.subscriptionExists) {
        await handleEnablePush();
        return;
      }
      await updatePreferences({ enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "푸시 설정 변경 실패");
    }
  }

  async function handleToggleDart() {
    try {
      if (!pushStatus?.subscriptionExists) {
        await handleEnablePush();
        return;
      }

      const nextState = { enabled: pushStatus.enabled ?? true, dartEnabled: !(pushStatus.dartEnabled ?? false) };
      await updatePreferences(nextState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "푸시 설정 변경 실패");
    }
  }

  return (
    <main className={styles.page}>
      <PageNavigation current="notifications" />

      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>NOTIFICATION SETTINGS</p>
          <div className={styles.heroMain}>
            <p className={styles.heroDescription}>현재 실제 발송 경로가 확인된 DART 공시 알림을 이 기기에서 설정합니다.</p>
            <h1 className={styles.heroTitle}>알림 환경설정</h1>
          </div>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.pushDebug}>
            <span>푸시 지원: {pushStatus?.supported ? "예" : "아니오"}</span>
            <span>권한: {pushStatus?.permission ?? "-"}</span>
            <span>현재 기기 구독 존재: {pushStatus?.subscriptionExists ? "예" : "아니오"}</span>
            <span>현재 기기 DB 저장: {pushStatus?.currentDeviceSaved ? "예" : "아니오"}</span>
            <hr style={{ margin: "8px 0", borderColor: "var(--border)" }} />
            <span>전체 푸시: {pushStatus?.currentDeviceSaved && pushStatus.enabled !== false ? "켜짐" : "꺼짐"}</span>
            <span>DART 공시 선택: {pushStatus?.dartEnabled === true ? "켜짐" : "꺼짐"}</span>
            <span>잠금 화면 미리보기: 일반 표시</span>
            <hr style={{ margin: "8px 0", borderColor: "var(--border)" }} />
            {pushStatus?.error ? <span style={{ color: "red" }}>오류: {pushStatus.error}</span> : null}
            {error ? <span style={{ color: "red" }}>오류: {error}</span> : null}
          </div>

          <button
            type="button"
            className={styles.enableButton}
            onClick={handleEnablePush}
            disabled={enabling || !pushStatus?.supported}
          >
            {enabling ? "알림 활성화 중.." : "DART 공시 알림 활성화 (최초 1회 필수)"}
          </button>

          <div className={styles.toggleRow}>
            <button type="button" className={styles.toggleButton} onClick={handleToggleAll} disabled={saving}>
              {!pushStatus?.subscriptionExists || pushStatus.enabled === false ? "✅ 전체 푸시 켜기" : "전체 푸시 끄기"}
            </button>
            <button type="button" className={styles.toggleButton} onClick={handleToggleDart} disabled={saving}>
              {!pushStatus?.subscriptionExists || pushStatus.dartEnabled === false ? "🔔 DART 공시 켜기" : "🔕 DART 공시 끄기"}
            </button>
          </div>

          <p role="note">안전한 현재 기기 전용 테스트 발송 경로가 준비되지 않아 테스트 푸시는 중단했습니다.</p>
          <button type="button" className={styles.testButton} disabled>
            테스트 푸시 일시 중단
          </button>
        </div>
      </section>
    </main>
  );
}
