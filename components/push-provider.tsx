"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { PushDebugStatus } from "@/lib/types";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

declare global {
  interface Window {
    __pushDebug?: PushDebugStatus;
  }
}

type PushContextValue = {
  status: PushDebugStatus | null;
  enablePush: () => Promise<void>;
  updatePreferences: (next: { enabled?: boolean; dartEnabled?: boolean; intensityEnabled?: boolean; risingEnabled?: boolean }) => Promise<void>;
  refreshStatus: () => Promise<void>;
  enabling: boolean;
  saving: boolean;
};

const PushContext = createContext<PushContextValue | null>(null);

async function readLocalStatus(): Promise<PushDebugStatus> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return {
      supported: false,
      permission: "unsupported",
      serviceWorkerRegistered: false,
      subscriptionExists: false,
    };
  }

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  return {
    supported: true,
    permission: Notification.permission,
    serviceWorkerRegistered: Boolean(registration),
    subscriptionExists: Boolean(subscription),
    endpoint: subscription?.endpoint,
    actionRequired: Notification.permission !== "granted",
  };
}

export function PushProvider({ children }: { children?: ReactNode }) {
  const [status, setStatus] = useState<PushDebugStatus | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refreshStatus() {
    try {
      const localStatus = await readLocalStatus();
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      const response = subscription
        ? await fetch("/api/push/subscribe", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              ...subscription.toJSON(),
            }),
          })
        : null;
      const data = response ? await response.json() : {};

      const nextStatus: PushDebugStatus = {
        ...localStatus,
        currentDeviceSaved: data.currentDeviceSaved ?? false,
        enabled: data.enabled ?? false,
        dartEnabled: data.dartEnabled ?? false,
        intensityEnabled: data.intensityEnabled ?? false,
        risingEnabled: data.risingEnabled ?? false,
        previewMode: "GENERIC",
        preferenceRevision: Number.isSafeInteger(data.preferenceRevision) ? data.preferenceRevision : 0,
        error: undefined,
      };

      window.__pushDebug = nextStatus;
      setStatus(nextStatus);
    } catch (error) {
      const fallback: PushDebugStatus = {
        supported: false,
        permission: "unsupported",
        serviceWorkerRegistered: false,
        subscriptionExists: false,
        error: error instanceof Error ? error.message : "구독 상태 확인 실패",
      };
      window.__pushDebug = fallback;
      setStatus(fallback);
    }
  }

  async function enablePush() {
    if (enabling) {
      return;
    }

    setEnabling(true);

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const unsupportedStatus: PushDebugStatus = {
        supported: false,
        permission: "unsupported",
        serviceWorkerRegistered: false,
        subscriptionExists: false,
      };
      window.__pushDebug = unsupportedStatus;
      setStatus(unsupportedStatus);
      setEnabling(false);
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      const invalidStatus: PushDebugStatus = {
        supported: true,
        permission: Notification.permission,
        serviceWorkerRegistered: false,
        subscriptionExists: false,
        actionRequired: false,
        error: "NEXT_PUBLIC_VAPID_PUBLIC_KEY 누락",
      };
      window.__pushDebug = invalidStatus;
      setStatus(invalidStatus);
      setEnabling(false);
      return;
    }

    try {
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();

      if (permission !== "granted") {
        const permissionStatus: PushDebugStatus = {
          supported: true,
          permission,
          serviceWorkerRegistered: false,
          subscriptionExists: false,
          actionRequired: true,
        };
        window.__pushDebug = permissionStatus;
        setStatus(permissionStatus);
        setEnabling(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...subscription.toJSON(),
          enabled: true,
          dartEnabled: true,
          intensityEnabled: false,
          risingEnabled: false,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "푸시 구독 저장 실패");
      }

      const nextStatus: PushDebugStatus = {
        supported: true,
        permission,
        serviceWorkerRegistered: true,
        subscriptionExists: true,
        currentDeviceSaved: result.currentDeviceSaved ?? false,
        endpoint: subscription.endpoint,
        enabled: result.enabled ?? false,
        dartEnabled: result.dartEnabled ?? false,
        intensityEnabled: result.intensityEnabled ?? false,
        risingEnabled: result.risingEnabled ?? false,
        previewMode: "GENERIC",
        preferenceRevision: Number.isSafeInteger(result.preferenceRevision) ? result.preferenceRevision : 0,
        actionRequired: false,
      };

      window.__pushDebug = nextStatus;
      setStatus(nextStatus);
    } catch (error) {
      const failedStatus: PushDebugStatus = {
        supported: true,
        permission: Notification.permission,
        serviceWorkerRegistered: false,
        subscriptionExists: false,
        actionRequired: Notification.permission !== "granted",
        error: error instanceof Error ? error.message : "구독 등록 실패",
      };
      window.__pushDebug = failedStatus;
      setStatus(failedStatus);
    } finally {
      setEnabling(false);
    }
  }

  async function updatePreferences(next: { enabled?: boolean; dartEnabled?: boolean; intensityEnabled?: boolean; risingEnabled?: boolean }) {
    if (!status?.endpoint || saving) {
      return;
    }

    setSaving(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (!subscription || subscription.endpoint !== status.endpoint) {
        throw new Error("PUSH_SUBSCRIPTION_PROOF_REQUIRED");
      }
      const response = await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: status.endpoint,
          keys: subscription.toJSON().keys,
          enabled: next.enabled ?? status.enabled ?? false,
          dartEnabled: next.dartEnabled ?? status.dartEnabled ?? false,
          intensityEnabled: next.intensityEnabled ?? status.intensityEnabled ?? false,
          risingEnabled: next.risingEnabled ?? status.risingEnabled ?? false,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "푸시 설정 저장 실패");
      }

      const nextStatus: PushDebugStatus = {
        ...(status ?? {}),
        enabled: result.enabled ?? false,
        dartEnabled: result.dartEnabled ?? false,
        intensityEnabled: result.intensityEnabled ?? false,
        risingEnabled: result.risingEnabled ?? false,
        previewMode: "GENERIC",
        preferenceRevision: Number.isSafeInteger(result.preferenceRevision) ? result.preferenceRevision : 0,
      };

      window.__pushDebug = nextStatus;
      setStatus(nextStatus);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  const value = useMemo(
    () => ({
      status,
      enablePush,
      updatePreferences,
      refreshStatus,
      enabling,
      saving,
    }),
    [status, enabling, saving],
  );

  return <PushContext.Provider value={value}>{children ?? null}</PushContext.Provider>;
}

export function usePushDebug() {
  const context = useContext(PushContext);
  if (!context) {
    throw new Error("PushProvider 안에서만 usePushDebug를 사용할 수 있습니다.");
  }

  return context;
}
