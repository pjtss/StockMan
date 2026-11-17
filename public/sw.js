self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const validGenericProjection = payload?.privacyProjection === "GENERIC"
    && payload.previewMode === "GENERIC"
    && typeof payload.notificationId === "string"
    && Number.isSafeInteger(payload.preferenceRevision)
    && payload.preferenceRevision > 0
    && payload.title === "공시 알림"
    && payload.body === "새 공시를 확인하세요."
    && typeof payload.tag === "string"
    && payload.tag.startsWith("disclosure:")
    && Array.isArray(payload.actions)
    && payload.actions.length === 1
    && payload.actions[0]?.action === "open_disclosures"
    && payload.actions[0]?.title === "공시 목록 열기"
    && payload.opaqueTarget === "/disclosures"
    && payload.publicationEpoch === null
    && payload.rendererRevision === "dart-generic-v1";

  if (!validGenericProjection) {
    return;
  }

  event.waitUntil((async () => {
    try {
      const subscription = await self.registration.pushManager.getSubscription();
      const keys = subscription?.toJSON().keys;
      if (!subscription?.endpoint || !keys?.p256dh || !keys?.auth) return;

      const response = await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({ endpoint: subscription.endpoint, keys }),
      });
      if (!response.ok) return;
      const current = await response.json();
      if (
        current.currentDeviceSaved !== true
        || current.enabled !== true
        || current.dartEnabled !== true
        || current.previewMode !== "GENERIC"
        || current.preferenceRevision !== payload.preferenceRevision
      ) return;

      await self.registration.showNotification("공시 알림", {
        body: "새 공시를 확인하세요.",
        tag: payload.tag,
        icon: "/manifest-icon-192.maskable.png",
        badge: "/manifest-icon-192.maskable.png",
        actions: [{ action: "open_disclosures", title: "공시 목록 열기" }],
        data: {
          notificationId: payload.notificationId,
          preferenceRevision: payload.preferenceRevision,
          previewMode: "GENERIC",
          privacyProjection: "GENERIC",
          publicationEpoch: null,
          rendererRevision: "dart-generic-v1",
          opaqueTarget: "/disclosures",
        },
      });
    } catch {
      // Preference state must be verifiable before showing a filing notification.
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;

  if (
    data?.privacyProjection !== "GENERIC"
    || data.previewMode !== "GENERIC"
    || data.opaqueTarget !== "/disclosures"
    || data.publicationEpoch !== null
    || data.rendererRevision !== "dart-generic-v1"
  ) {
    return;
  }

  const targetUrl = new URL("/disclosures", self.location.origin).toString();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
