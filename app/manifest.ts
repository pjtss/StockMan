import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "STOCKMAN QUANT",
    short_name: "STOCKMAN",
    description: "DART와 SEC 공시를 실시간으로 모니터링하고 KIS 수급 데이터와 교차 검증하는 프리미엄 퀀트 터미널",
    start_url: "/disclosures",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#00ffa3",
    lang: "ko",
  };
}
