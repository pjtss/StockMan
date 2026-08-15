const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
if (!applicationId || !botToken) throw new Error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required");
const endpoint = guildId ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands` : `https://discord.com/api/v10/applications/${applicationId}/commands`;
const response = await fetch(endpoint, { method: "PUT", headers: { authorization: `Bot ${botToken}`, "content-type": "application/json" }, body: JSON.stringify([
  { name: "ticker", description: "미국 주식 티커 정보를 조회합니다.", type: 1, options: [{ name: "symbol", description: "예: AAPL", type: 3, required: true, max_length: 15 }] },
  { name: "news", description: "티커 관련 KIS 뉴스를 조회합니다. 기간은 관리자 기본값을 사용합니다.", type: 1, options: [{ name: "symbol", description: "예: AAPL", type: 3, required: true, max_length: 15 }] },
  { name: "daily-breakout", description: "통합 종목 테이블 전체에서 5거래일 고가 돌파 종목을 조회합니다.", type: 1 },
  { name: "daily-obv", description: "통합 종목 테이블 전체에서 일봉 OBV 상승 종목을 조회합니다.", type: 1 },
  { name: "mfi-oversold", description: "저장된 미국 종목 중 일봉 MFI 30 이하 종목을 조회합니다.", type: 1 },
  { name: "dmi", description: "저장된 미국 종목의 일봉 DMI를 조회합니다.", type: 1 },
  { name: "macd", description: "저장된 미국 종목의 일봉 MACD를 조회합니다.", type: 1 },
  { name: "daily-trend", description: "OBV·MACD·MFI·볼린저·DMI·거래량 기반 급등 추세를 조회합니다.", type: 1 },
  { name: "short-squeeze", description: "티커의 공매도 압박·숏스퀴즈 가능성을 평가합니다.", type: 1, options: [{ name: "symbol", description: "미국 티커", type: 3, required: true }] },
  { name: "vwap", description: "관심종목 중 당일 VWAP 상회 종목을 조회합니다.", type: 1 },
  { name: "sync-top100", description: "NAS·AMS·NYS 상승률 TOP100을 통합 티커 테이블에 갱신합니다.", type: 1 },
  { name: "refresh-daily", description: "통합 종목 전체의 일봉 데이터를 DB에 갱신합니다.", type: 1 },
  { name: "daily-filter-refresh", description: "DB의 최신 일봉 데이터로 전체 일봉 필터를 재평가하고 Webhook으로 전송합니다.", type: 1 },
  { name: "turnover-list", description: "시총 대비 거래대금 지속 탐지 종목 목록을 조회합니다.", type: 1 },
  { name: "turnover-add", description: "시총 대비 거래대금 지속 탐지 종목을 추가합니다.", type: 1, options: [{ name: "symbol", description: "예: AAPL", type: 3, required: true, max_length: 15 }] },
  { name: "turnover-remove", description: "시총 대비 거래대금 지속 탐지 종목을 삭제합니다.", type: 1, options: [{ name: "symbol", description: "예: AAPL", type: 3, required: true, max_length: 15 }] },
  { name: "turnover-clear", description: "시총 대비 거래대금 지속 탐지 종목을 모두 삭제합니다.", type: 1 },
]) });
if (!response.ok) throw new Error(`Discord command registration failed: ${response.status} ${await response.text()}`);
console.log(`Registered /ticker (${guildId ? "guild" : "global"})`);
console.log(`Registered /news (${guildId ? "guild" : "global"})`);
console.log(`Registered /daily-breakout (${guildId ? "guild" : "global"})`);
console.log(`Registered /mfi-oversold (${guildId ? "guild" : "global"})`);
console.log(`Registered /dmi (${guildId ? "guild" : "global"})`);
console.log(`Registered /macd (${guildId ? "guild" : "global"})`);
console.log(`Registered /daily-trend (${guildId ? "guild" : "global"})`);
console.log(`Registered /vwap (${guildId ? "guild" : "global"})`);
console.log(`Registered /sync-top100 (${guildId ? "guild" : "global"})`);
console.log(`Registered /refresh-daily (${guildId ? "guild" : "global"})`);
console.log(`Registered /daily-filter-refresh (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-list (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-add (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-remove (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-clear (${guildId ? "guild" : "global"})`);
