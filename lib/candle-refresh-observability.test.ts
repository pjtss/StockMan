import { describe, expect, it } from "vitest";
import { measureCandleRefresh } from "./candle-refresh-observability";
describe("candle refresh observability", () => {
  it("records successful timeframe metrics", async () => { const r=await measureCandleRefresh({market:"KR",timeframe:"D",instrumentCount:10},async()=>({ok:true,savedCandleCount:35})); expect(r.metric).toMatchObject({market:"KR",timeframe:"D",instrumentCount:10,successCount:1,failureCount:0,savedCandleCount:35,status:"COMPLETED"}); });
  it("records failures without throwing", async () => { const r=await measureCandleRefresh({market:"US",timeframe:"M",instrumentCount:10},async()=>{throw new Error("x")}); expect(r.metric).toMatchObject({market:"US",timeframe:"M",failureCount:1,status:"FAILED"}); });
});
