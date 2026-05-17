import { getPool } from "./db";
import type { AlertItem } from "./types";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Zero-config owner chat ID

export async function addTelegramSubscriber(chatId: string) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO telegram_subscribers (chat_id, enabled)
      VALUES ($1, TRUE)
      ON CONFLICT (chat_id) DO UPDATE SET enabled = TRUE, updated_at = NOW()
    `,
      [chatId]
    );
  } catch (error) {
    console.error("Failed to add Telegram subscriber:", error);
  } finally {
    client.release();
  }
}

export async function removeTelegramSubscriber(chatId: string) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `
      UPDATE telegram_subscribers
      SET enabled = FALSE, updated_at = NOW()
      WHERE chat_id = $1
    `,
      [chatId]
    );
  } catch (error) {
    console.error("Failed to remove Telegram subscriber:", error);
  } finally {
    client.release();
  }
}

export async function loadTelegramSubscribers(): Promise<string[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT chat_id FROM telegram_subscribers WHERE enabled = TRUE
    `
    );
    return rows.map((r) => r.chat_id);
  } catch (error) {
    console.error("Failed to load Telegram subscribers:", error);
    return [];
  } finally {
    client.release();
  }
}

export async function sendTelegramMessage(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });
  } catch (error) {
    console.error(`Failed to send Telegram message to ${chatId}:`, error);
  }
}

export async function sendTelegramAlerts(alerts: AlertItem[]) {
  if (!TELEGRAM_BOT_TOKEN || alerts.length === 0) return;

  // Gather subscribers
  const dbSubscribers = await loadTelegramSubscribers();
  const subscribers = new Set<string>(dbSubscribers);
  if (TELEGRAM_CHAT_ID) {
    subscribers.add(TELEGRAM_CHAT_ID);
  }

  if (subscribers.size === 0) return;

  for (const alert of alerts) {
    const title = alert.level ? `[${alert.level}]` : `[공시]`;
    const message = `
🔥 *${title} ${alert.company}*

*공시 제목*: ${alert.title}
*공시 시각*: ${new Date(alert.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
*상세 링크*: [바로가기](${alert.link})
    `.trim();

    for (const chatId of subscribers) {
      await sendTelegramMessage(chatId, message);
    }
  }
}
