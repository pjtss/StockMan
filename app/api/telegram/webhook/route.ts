import { NextResponse } from "next/server";
import { addTelegramSubscriber, removeTelegramSubscriber, sendTelegramMessage } from "@/lib/telegram";
import { getPool, ensureSchema } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const message = payload.message;

    if (!message || !message.text || !message.chat || !message.chat.id) {
      return NextResponse.json({ ok: true });
    }

    await ensureSchema();

    const chatId = String(message.chat.id);
    const text = (message.text as string).trim();

    if (text.startsWith("/start")) {
      await addTelegramSubscriber(chatId);
      await sendTelegramMessage(
        chatId,
        "👋 *안녕하세요! RSS 대시보드 알림 봇입니다.*\n\n이제 강호재 공시가 감지되면 실시간으로 이곳에 받아볼 수 있습니다.\n\n*사용 가능한 명령어:*\n• `/summary [종목명]`: 종목의 최근 공시 이력 조회\n• `/stop`: 알림 구독 중단"
      );
    } else if (text.startsWith("/stop")) {
      await removeTelegramSubscriber(chatId);
      await sendTelegramMessage(chatId, "📴 *알림 구독이 취소되었습니다.* 언제든지 `/start`를 보내 다시 구독을 시작할 수 있습니다.");
    } else if (text.startsWith("/summary")) {
      const parts = text.split(/\s+/);
      if (parts.length < 2) {
        await sendTelegramMessage(chatId, "⚠️ *종목명을 함께 입력해 주세요.*\n예: `/summary 삼성전자`");
      } else {
        const companyName = parts.slice(1).join(" ").trim();
        const client = await getPool().connect();
        try {
          const { rows } = await client.query(
            `
              SELECT company, title, judgment, published_at, link
              FROM filings
              WHERE company ILIKE $1
              ORDER BY published_at DESC
              LIMIT 5
            `,
            [`%${companyName}%`]
          );

          if (rows.length === 0) {
            await sendTelegramMessage(chatId, `🔍 *'${companyName}' 종목의 최근 공시 내역을 찾을 수 없습니다.*`);
          } else {
            let responseText = `🔍 *'${companyName}' 최근 공시 내역 (최대 5건):*\n\n`;
            rows.forEach((row, index) => {
              responseText += `${index + 1}. *[${row.judgment}] ${row.company}*\n• 제목: ${row.title}\n• 링크: [바로가기](${row.link})\n\n`;
            });
            await sendTelegramMessage(chatId, responseText.trim());
          }
        } catch (dbErr) {
          console.error("DB Query error in telegram summary:", dbErr);
          await sendTelegramMessage(chatId, "⚠️ 공시 조회 중 기술적 오류가 발생했습니다.");
        } finally {
          client.release();
        }
      }
    } else {
      await sendTelegramMessage(chatId, "❓ *지원하지 않는 명령어입니다.*\n사용 가능한 명령어: `/summary [종목명]`, `/stop`, `/start`");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
