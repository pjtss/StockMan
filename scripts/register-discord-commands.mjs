const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
if (!applicationId || !botToken) throw new Error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required");
const endpoint = guildId ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands` : `https://discord.com/api/v10/applications/${applicationId}/commands`;
const response = await fetch(endpoint, { method: "PUT", headers: { authorization: `Bot ${botToken}`, "content-type": "application/json" }, body: JSON.stringify([
  { name: "ticker", description: "미국 주식 티커 정보를 조회합니다.", type: 1, options: [{ name: "symbol", description: "예: AAPL", type: 3, required: true, max_length: 15 }] },
  { name: "daily-breakout", description: "관심종목 중 5거래일 고가 돌파 종목을 조회합니다.", type: 1 },
  { name: "mfi-oversold", description: "저장된 미국 종목 중 일봉 MFI 20 이하 종목을 조회합니다.", type: 1 },
]) });
if (!response.ok) throw new Error(`Discord command registration failed: ${response.status} ${await response.text()}`);
console.log(`Registered /ticker (${guildId ? "guild" : "global"})`);
console.log(`Registered /daily-breakout (${guildId ? "guild" : "global"})`);
console.log(`Registered /mfi-oversold (${guildId ? "guild" : "global"})`);
