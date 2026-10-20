import { PageNavigation } from "@/components/page-navigation";
import { IntradayDetectionPage } from "@/components/intraday-detection-page";

export default function IntradayPage() {
  return (
    <>
      <PageNavigation current="intraday" />
      <main className="page-shell">
        <section className="hero">
          <div className="kicker">LIVE DETECTION</div>
          <h1>최종 탐지 후보</h1>
          <p>상승률 TOP 100 중 필터를 통과한 탐지 후보와, 미국 집중 관측 풀의 최근 1~10분 분봉 거래대금을 확인합니다.</p>
        </section>
        <IntradayDetectionPage />
      </main>
    </>
  );
}
