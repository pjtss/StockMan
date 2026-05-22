import webpush from "web-push";
import { getPool } from "./db";
import type { AlertItem, PushSubscriptionRecord } from "./types";
import { fetchVolumeSpike, fetchNetBuying } from "./kis";

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
  const keyword = alert.keywords?.[0];

  if (alert.source === "TOP_RISING") {
    return [
      `📈 상승률: ${alert.title}`,
      `⏱️ 추가시간: ${seoulTime}`
    ].join("\n");
  }

  if (alert.source === "DART") {
    return [
      `📂 유형: ${alert.title}`,
      keyword ? `🔑 키워드: ${keyword}` : null,
      `⏱️ 시각: ${seoulTime}`
    ].filter(Boolean).join("\n");
  }

  return [
    `📂 서식: ${alert.title}`,
    `⏱️ 시각: ${seoulTime}`
  ].join("\n");
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
        INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, enabled, dart_enabled, sec_enabled, only_validated)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (endpoint) DO UPDATE SET
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          enabled = EXCLUDED.enabled,
          dart_enabled = EXCLUDED.dart_enabled,
          sec_enabled = EXCLUDED.sec_enabled,
          only_validated = EXCLUDED.only_validated,
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
        subscription.onlyValidated ?? false,
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
          only_validated = $5,
          updated_at = NOW()
        WHERE endpoint = $1
      `,
      [
        subscription.endpoint,
        subscription.enabled ?? true,
        subscription.dartEnabled ?? true,
        subscription.secEnabled ?? true,
        subscription.onlyValidated ?? false,
      ],
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
        SELECT endpoint, p256dh, auth, user_agent, enabled, dart_enabled, sec_enabled, only_validated
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
      onlyValidated: row.only_validated ?? false,
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
        SELECT endpoint, user_agent, updated_at, enabled, dart_enabled, sec_enabled, only_validated
        FROM push_subscriptions
        ORDER BY updated_at DESC
      `,
    );

    let currentDeviceSaved = false;
    let currentDevice = null as null | {
      enabled: boolean;
      dartEnabled: boolean;
      secEnabled: boolean;
      onlyValidated: boolean;
    };

    if (endpoint) {
      const result = await client.query(
        `
          SELECT enabled, dart_enabled, sec_enabled, only_validated
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
          onlyValidated: result.rows[0].only_validated ?? false,
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

  let validatedCompanies: string[] = [];
  const needsValidation = subscriptions.some((s) => s.onlyValidated);
  if (needsValidation) {
    try {
      const [vol, net] = await Promise.all([
        fetchVolumeSpike().catch(() => []),
        fetchNetBuying().catch(() => []),
      ]);
      validatedCompanies = [
        ...vol.map((v) => v.company.replace(/\s+/g, "").toLowerCase()),
        ...net.map((n) => n.company.replace(/\s+/g, "").toLowerCase()),
      ];
    } catch (e) {
      console.error("Failed to fetch KIS lists for validation:", e);
    }
  }

  for (const alert of alerts) {
    const isSuperBullish = alert.level === "최강호재";
    const isBullish = alert.level === "호재";

    const emoji = isSuperBullish ? "🚨" : isBullish ? "⚡" : "✨";
    let title = `${emoji} [${alert.level}] ${alert.company}`;
    if (alert.source === "TOP_RISING") {
      title = `📈 [상승률 TOP 10 신규] ${alert.company}`;
    }

    const actions = alert.source === "TOP_RISING"
      ? [
          {
            action: "open_terminal",
            title: "📊 실시간 대시보드",
          }
        ]
      : [
          {
            action: "open_origin",
            title: alert.source === "DART" ? "🔍 공시 원문 보기" : "🔍 EDGAR 조회",
          },
          {
            action: "open_terminal",
            title: "📊 실시간 대시보드",
          }
        ];

    const payload = JSON.stringify({
      title,
      body: buildNotificationBody(alert),
      url: alert.link,
      tag: `${alert.source}:${alert.company.replace(/\s+/g, "")}`,
      actions,
      priority: isSuperBullish ? "high" : "normal",
    });

    for (const subscription of subscriptions) {
      let allowed =
        subscription.enabled !== false &&
        (alert.source === "DART" || alert.source === "TOP_RISING"
          ? subscription.dartEnabled !== false
          : subscription.secEnabled !== false);

      if (allowed && subscription.onlyValidated && alert.source === "DART") {
        const compClean = alert.company.replace(/\s+/g, "").toLowerCase();
        const matched = validatedCompanies.some((vc) => vc.includes(compClean) || compClean.includes(vc));
        if (!matched) {
          allowed = false;
        }
      }

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
      level: "최강호재",
      company: "현대에너지솔루션",
      title: "단일판매ㆍ공급계약체결 (매출액 대비 85.4%)",
      keywords: ["공급계약"],
      link: "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260517000123",
      publishedAt: new Date().toISOString(),
    },
  ]);
}
