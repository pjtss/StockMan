import webpush from "web-push";
import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import type { AlertItem, PushSubscriptionRecord } from "./types";

let configured = false;

export type PushAlertDeliverySummary = {
  disposition: "NO_DART_ALERTS" | "NO_ELIGIBLE_SUBSCRIPTIONS" | "PROVIDER_ACCEPTED_ALL" | "PARTIAL_OR_UNKNOWN" | "FAILED" | "UNKNOWN";
  alerts: number;
  subscriptionsLoaded: number;
  eligible: number;
  providerAccepted: number;
  expired: number;
  failed: number;
  unknown: number;
  cleanupFailed: number;
  skippedByPreference: number;
  deviceDelivery: "UNOBSERVED";
};

function emptyPushSummary(disposition: PushAlertDeliverySummary["disposition"], alerts = 0): PushAlertDeliverySummary {
  return {
    disposition,
    alerts,
    subscriptionsLoaded: 0,
    eligible: 0,
    providerAccepted: 0,
    expired: 0,
    failed: 0,
    unknown: 0,
    cleanupFailed: 0,
    skippedByPreference: 0,
    deviceDelivery: "UNOBSERVED",
  };
}

function configureWebPush() {
  if (configured) {
    return;
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID 환경변수가 설정되지 않았습니다.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function savePushSubscription(subscription: PushSubscriptionRecord) {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `
        INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, enabled, dart_enabled, intensity_enabled, rising_enabled, preview_mode, preference_revision)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GENERIC', 1)
        ON CONFLICT (endpoint) DO UPDATE SET
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          enabled = EXCLUDED.enabled,
          dart_enabled = EXCLUDED.dart_enabled,
          intensity_enabled = EXCLUDED.intensity_enabled,
          rising_enabled = EXCLUDED.rising_enabled,
          preview_mode = 'GENERIC',
          preference_revision = push_subscriptions.preference_revision + 1,
          updated_at = NOW()
        WHERE push_subscriptions.p256dh = EXCLUDED.p256dh
          AND push_subscriptions.auth = EXCLUDED.auth
      `,
      [
        subscription.endpoint,
        subscription.p256dh,
        subscription.auth,
        subscription.userAgent ?? null,
        subscription.enabled ?? false,
        subscription.dartEnabled ?? false,
        subscription.intensityEnabled ?? false,
        subscription.risingEnabled ?? false,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function updatePushSubscriptionPreferences(subscription: PushSubscriptionRecord) {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `
        UPDATE push_subscriptions
        SET
          enabled = COALESCE($2, enabled),
          dart_enabled = COALESCE($3, dart_enabled),
          intensity_enabled = COALESCE($4, intensity_enabled),
          rising_enabled = COALESCE($5, rising_enabled),
          preference_revision = preference_revision + 1,
          updated_at = NOW()
        WHERE endpoint = $1 AND p256dh = $6 AND auth = $7
      `,
      [
        subscription.endpoint,
        subscription.enabled ?? null,
        subscription.dartEnabled ?? null,
        subscription.intensityEnabled ?? null,
        subscription.risingEnabled ?? null,
        subscription.p256dh,
        subscription.auth,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function removePushSubscription(endpoint: string) {
  const client = await getPool().connect();

  try {
    await client.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  } finally {
    client.release();
  }
}

export async function loadPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `
        SELECT endpoint, p256dh, auth, user_agent, enabled, dart_enabled, preview_mode, preference_revision
        FROM push_subscriptions
        ORDER BY updated_at DESC
      `,
    );

    return rows.map((row) => {
      const preferenceRevision = Number(row.preference_revision);
      return {
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        userAgent: row.user_agent ?? undefined,
        enabled: row.enabled === true,
        dartEnabled: row.dart_enabled === true,
        previewMode: row.preview_mode === "GENERIC" ? "GENERIC" : undefined,
        preferenceRevision: Number.isSafeInteger(preferenceRevision) && preferenceRevision > 0 ? preferenceRevision : 0,
      };
    });
  } finally {
    client.release();
  }
}

export async function loadPushSubscriptionDebug(endpoint?: string, p256dh?: string, auth?: string) {
  const client = await getPool().connect();

  try {
    let currentDeviceSaved = false;
    let currentDevice = null as null | {
      enabled: boolean;
      dartEnabled: boolean;
      intensityEnabled: boolean;
      risingEnabled: boolean;
      previewMode: "GENERIC" | "DETAILED";
      preferenceRevision: number;
    };

    if (endpoint) {
      const result = await client.query(
        `
          SELECT enabled, dart_enabled, intensity_enabled, rising_enabled, preview_mode, preference_revision
          FROM push_subscriptions
          WHERE endpoint = $1
            AND ($2::text IS NULL OR (p256dh = $2 AND auth = $3))
          LIMIT 1
        `,
        [endpoint, p256dh ?? null, auth ?? null],
      );
      currentDeviceSaved = (result.rowCount ?? 0) > 0;
      if (currentDeviceSaved) {
        currentDevice = {
          enabled: result.rows[0].enabled === true,
          dartEnabled: result.rows[0].dart_enabled === true,
          intensityEnabled: result.rows[0].intensity_enabled === true,
          risingEnabled: result.rows[0].rising_enabled === true,
          previewMode: result.rows[0].preview_mode === "DETAILED" ? "DETAILED" : "GENERIC",
          preferenceRevision: Number(result.rows[0].preference_revision) || 0,
        };
      }
    }

    return { currentDeviceSaved, currentDevice };
  } finally {
    client.release();
  }
}

export async function sendPushAlerts(alerts: AlertItem[]): Promise<PushAlertDeliverySummary> {
  const dartAlerts = alerts.filter((alert) => alert.source === "DART");
  if (dartAlerts.length === 0) {
    return emptyPushSummary("NO_DART_ALERTS");
  }

  let subscriptions: PushSubscriptionRecord[];
  try {
    configureWebPush();
    subscriptions = await loadPushSubscriptions();
  } catch {
    return emptyPushSummary("UNKNOWN", dartAlerts.length);
  }

  const summary = emptyPushSummary("NO_ELIGIBLE_SUBSCRIPTIONS", dartAlerts.length);
  summary.subscriptionsLoaded = subscriptions.length;

  for (const alert of dartAlerts) {
    for (const subscription of subscriptions) {
      const preferenceRevision = subscription.preferenceRevision;
      const allowed = subscription.enabled === true
        && subscription.dartEnabled === true
        && subscription.previewMode === "GENERIC"
        && Number.isSafeInteger(preferenceRevision)
        && (preferenceRevision ?? 0) > 0;
      if (!allowed) {
        summary.skippedByPreference += 1;
        continue;
      }
      summary.eligible += 1;

      const notificationId = randomUUID();
      const payload = JSON.stringify({
        notificationId,
        preferenceRevision: preferenceRevision as number,
        previewMode: "GENERIC",
        privacyProjection: "GENERIC",
        title: "공시 알림",
        body: "새 공시를 확인하세요.",
        tag: `disclosure:${notificationId}`,
        actions: [{ action: "open_disclosures", title: "공시 목록 열기" }],
        opaqueTarget: "/disclosures",
        publicationEpoch: null,
        rendererRevision: "dart-generic-v1",
        priority: "normal",
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );
        summary.providerAccepted += 1;
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          summary.expired += 1;
          try {
            await removePushSubscription(subscription.endpoint);
          } catch {
            summary.cleanupFailed += 1;
          }
        } else if (statusCode === 0 || statusCode >= 500) {
          summary.unknown += 1;
        } else {
          summary.failed += 1;
        }
      }
    }
  }

  if (summary.eligible === 0) {
    summary.disposition = "NO_ELIGIBLE_SUBSCRIPTIONS";
  } else if (summary.providerAccepted === summary.eligible) {
    summary.disposition = "PROVIDER_ACCEPTED_ALL";
  } else if (summary.providerAccepted === 0 && summary.unknown === 0 && summary.failed + summary.expired === summary.eligible) {
    summary.disposition = "FAILED";
  } else {
    summary.disposition = "PARTIAL_OR_UNKNOWN";
  }

  return summary;
}
