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
  updatePreferences: (next: { enabled?: boolean; dartEnabled?: boolean; secEnabled?: boolean; onlyValidated?: boolean }) => Promise<void>;
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
      const search = localStatus.endpoint ? `?endpoint=${encodeURIComponent(localStatus.endpoint)}` : "";
      const response = await fetch(`/api/push/subscribe${search}`, { cache: "no-store" });
      const data = await response.json();

      const nextStatus: PushDebugStatus = {
        ...localStatus,
        currentDeviceSaved: data.currentDeviceSaved ?? false,
        savedCount: data.savedCount ?? undefined,
        lastSaved: data.latestUpdatedAt ?? undefined,
        latestUserAgent: data.latestUserAgent ?? undefined,
        enabled: data.enabled ?? true,
        dartEnabled: data.dartEnabled ?? true,
        secEnabled: data.secEnabled ?? true,
        onlyValidated: data.onlyValidated ?? false,
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
          secEnabled: true,
        }),
      });
      const result = await response.json();

      const nextStatus: PushDebugStatus = {
        supported: true,
        permission,
        serviceWorkerRegistered: true,
        subscriptionExists: true,
        currentDeviceSaved: result.currentDeviceSaved ?? true,
        endpoint: subscription.endpoint,
        lastSaved: result.latestUpdatedAt ?? undefined,
        savedCount: result.savedCount ?? undefined,
        enabled: result.enabled ?? true,
        dartEnabled: result.dartEnabled ?? true,
        secEnabled: result.secEnabled ?? true,
        onlyValidated: result.onlyValidated ?? false,
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

  async function updatePreferences(next: { enabled?: boolean; dartEnabled?: boolean; secEnabled?: boolean; onlyValidated?: boolean }) {
    if (!status?.endpoint || saving) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: status.endpoint,
          enabled: next.enabled ?? status.enabled ?? true,
          dartEnabled: next.dartEnabled ?? status.dartEnabled ?? true,
          secEnabled: next.secEnabled ?? status.secEnabled ?? true,
          onlyValidated: next.onlyValidated ?? status.onlyValidated ?? false,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "푸시 설정 저장 실패");
      }

      const nextStatus: PushDebugStatus = {
        ...(status ?? {}),
        enabled: result.enabled ?? true,
        dartEnabled: result.dartEnabled ?? true,
        secEnabled: result.secEnabled ?? true,
        onlyValidated: result.onlyValidated ?? false,
        lastSaved: result.latestUpdatedAt ?? status.lastSaved,
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
