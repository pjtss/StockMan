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
  { name: "sync-top100", description: "NAS·AMS·NYS 상승률 TOP100을 해외 유니버스에 갱신합니다.", type: 1 },
  { name: "refresh-daily", description: "통합 종목 전체의 일봉 데이터를 DB에 갱신합니다.", type: 1 },
  { name: "refresh-us-daily", description: "해외 통합 종목 전체의 일봉 캐시를 갱신하고 디버깅 알림을 보냅니다.", type: 1 },
  { name: "refresh-kr-daily", description: "국내 통합 종목 전체의 일봉 캐시를 갱신하고 디버깅 알림을 보냅니다.", type: 1 },
  { name: "daily-filter-refresh", description: "DB의 최신 일봉 데이터로 전체 일봉 필터를 재평가하고 Webhook으로 전송합니다.", type: 1 },
  { name: "kr-bollinger-cache", description: "국내 일봉 볼린저밴드 하단 이하 캐시를 조회합니다.", type: 1 },
  { name: "us-bollinger-cache", description: "해외 일봉 볼린저밴드 하단 이하 캐시를 조회합니다.", type: 1 },
  { name: "kr-bollinger-middle-lower-cache", description: "국내 일봉 볼린저밴드 중단선~하단선 캐시를 조회합니다.", type: 1 },
  { name: "us-bollinger-middle-lower-cache", description: "해외 일봉 볼린저밴드 중단선~하단선 캐시를 조회합니다.", type: 1 },
  { name: "kr-golden-cross-cache", description: "국내 일봉 골든크로스 캐시를 조회합니다.", type: 1 },
  { name: "us-golden-cross-cache", description: "해외 일봉 골든크로스 캐시를 조회합니다.", type: 1 },
  { name: "bb-pullback-export", description: "국내·해외 다중 시간봉 볼린저밴드 결과를 HTML로 다운로드합니다.", type: 1, options: [{ name: "market", description: "조회 시장", type: 3, required: false, choices: [{ name: "전체", value: "ALL" }, { name: "국내", value: "KR" }, { name: "해외", value: "US" }] }] },
  { name: "bb-all-middle-above", description: "일·주·월봉 모두 BB 중단선 이상 종목을 HTML로 다운로드합니다.", type: 1, options: [{ name: "market", description: "조회 시장", type: 3, required: false, choices: [{ name: "전체", value: "ALL" }, { name: "국내", value: "KR" }, { name: "해외", value: "US" }] }] },
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
console.log(`Registered /refresh-us-daily (${guildId ? "guild" : "global"})`);
console.log(`Registered /refresh-kr-daily (${guildId ? "guild" : "global"})`);
console.log(`Registered /daily-filter-refresh (${guildId ? "guild" : "global"})`);
console.log(`Registered daily detection cache commands (${guildId ? "guild" : "global"})`);
console.log(`Registered /bb-pullback-export (${guildId ? "guild" : "global"})`);
console.log(`Registered /bb-all-middle-above (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-list (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-add (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-remove (${guildId ? "guild" : "global"})`);
console.log(`Registered /turnover-clear (${guildId ? "guild" : "global"})`);
