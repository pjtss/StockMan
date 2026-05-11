import webpush from "web-push";
import { getPool } from "./db";
import type { AlertItem, PushSubscriptionRecord } from "./types";

let configured = false;

function formatSeoulTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildNotificationBody(alert: AlertItem): string {
  const seoulTime = formatSeoulTime(alert.publishedAt);

  if (alert.source === "DART") {
    const keyword = alert.keywords?.[0];
    return [alert.title, keyword ? `키워드: ${keyword}` : null, seoulTime].filter(Boolean).join(" | ");
  }

  return [alert.title, seoulTime].filter(Boolean).join(" | ");
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
    await client.query(
      `
        INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, enabled, dart_enabled, sec_enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (endpoint) DO UPDATE SET
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          enabled = EXCLUDED.enabled,
          dart_enabled = EXCLUDED.dart_enabled,
          sec_enabled = EXCLUDED.sec_enabled,
          updated_at = NOW()
      `,
      [
        subscription.endpoint,
        subscription.p256dh,
        subscription.auth,
        subscription.userAgent ?? null,
        subscription.enabled ?? true,
        subscription.dartEnabled ?? true,
        subscription.secEnabled ?? true,
      ],
    );
  } finally {
    client.release();
  }
}

export async function updatePushSubscriptionPreferences(subscription: PushSubscriptionRecord) {
  const client = await getPool().connect();

  try {
    await client.query(
      `
        UPDATE push_subscriptions
        SET
          enabled = $2,
          dart_enabled = $3,
          sec_enabled = $4,
          updated_at = NOW()
        WHERE endpoint = $1
      `,
      [subscription.endpoint, subscription.enabled ?? true, subscription.dartEnabled ?? true, subscription.secEnabled ?? true],
    );
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
        SELECT endpoint, p256dh, auth, user_agent, enabled, dart_enabled, sec_enabled
        FROM push_subscriptions
        ORDER BY updated_at DESC
      `,
    );

    return rows.map((row) => ({
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      userAgent: row.user_agent ?? undefined,
      enabled: row.enabled ?? true,
      dartEnabled: row.dart_enabled ?? true,
      secEnabled: row.sec_enabled ?? true,
    }));
  } finally {
    client.release();
  }
}

export async function loadPushSubscriptionDebug(endpoint?: string) {
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `
        SELECT endpoint, user_agent, updated_at, enabled, dart_enabled, sec_enabled
        FROM push_subscriptions
        ORDER BY updated_at DESC
      `,
    );

    let currentDeviceSaved = false;
    let currentDevice = null as null | {
      enabled: boolean;
      dartEnabled: boolean;
      secEnabled: boolean;
    };

    if (endpoint) {
      const result = await client.query(
        `
          SELECT enabled, dart_enabled, sec_enabled
          FROM push_subscriptions
          WHERE endpoint = $1
          LIMIT 1
        `,
        [endpoint],
      );
      currentDeviceSaved = (result.rowCount ?? 0) > 0;
      if (currentDeviceSaved) {
        currentDevice = {
          enabled: result.rows[0].enabled ?? true,
          dartEnabled: result.rows[0].dart_enabled ?? true,
          secEnabled: result.rows[0].sec_enabled ?? true,
        };
      }
    }

    return {
      count: rows.length,
      currentDeviceSaved,
      currentDevice,
      latest:
        rows.length > 0
          ? {
              endpoint: rows[0].endpoint,
              userAgent: rows[0].user_agent ?? "",
              updatedAt: new Date(rows[0].updated_at).toISOString(),
            }
          : null,
    };
  } finally {
    client.release();
  }
}

export async function sendPushAlerts(alerts: AlertItem[]) {
  if (alerts.length === 0) {
    return;
  }

  configureWebPush();
  const subscriptions = await loadPushSubscriptions();

  for (const alert of alerts) {
    const payload = JSON.stringify({
      title: `[${alert.level}] ${alert.company}`,
      body: buildNotificationBody(alert),
      url: alert.link,
      tag: `${alert.source}:${alert.externalId}`,
    });

    for (const subscription of subscriptions) {
      const allowed =
        subscription.enabled !== false &&
        (alert.source === "DART" ? subscription.dartEnabled !== false : subscription.secEnabled !== false);

      if (!allowed) {
        continue;
      }

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
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(subscription.endpoint);
        }
      }
    }
  }
}



export async function sendTestPush() {
  await sendPushAlerts([
    {
      source: "DART",
      externalId: `test-${Date.now()}`,
      level: "테스트호재",
      company: "PJT RSS",
      title: "테스트 푸시 알림입니다.",
      link: "https://pjt-rss.netlify.app/sec",
      publishedAt: new Date().toISOString(),
    },
  ]);
}
