import { chromium } from "playwright";

const HYDRATION_ERROR = /hydration|hydrated|server rendered html|text content does not match|did not match/i;

export async function runChartsBrowserSmoke(baseUrl) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failures = [];
  try {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.route("**/api/stock/chart?*", (route) => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: "005930",
          company: "삼성전자",
          candles: [
            { date: "20261124", open: 70000, high: 71000, low: 69500, close: 70500, volume: 1200000 },
            { date: "20261125", open: 70500, high: 72000, low: 70000, close: 71500, volume: 1350000 },
          ],
          indicators: { rsi14: 52, macd: 120, macdSignal: 100, macdHist: 20, bbUpper: 73000, bbMiddle: 70000, bbLower: 67000 },
          latestPrice: 71500,
          latestChange: "+1000",
          latestChangeRate: "+1.42%",
          candleDataUpdatedAt: "2026-11-25T06:00:00.000Z",
        }),
      }));
      page.on("pageerror", (error) => failures.push(`${viewport.name}: uncaught browser error: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && HYDRATION_ERROR.test(message.text())) {
          failures.push(`${viewport.name}: ${message.text()}`);
        }
      });

      const response = await page.goto(new URL("/charts", baseUrl).href, { waitUntil: "domcontentloaded" });
      if (!response?.ok()) throw new Error(`${viewport.name} /charts returned HTTP ${response?.status() ?? "no response"}`);
      await page.getByRole("heading", { name: "티커 차트 조회" }).waitFor({ state: "visible" });
      const tickerInput = page.getByRole("textbox", { name: "티커 입력" });
      await tickerInput.waitFor({ state: "visible" });
      await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "티커 차트" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "해외", exact: true }).click();
      await page.getByPlaceholder("예: AAPL, NVDA, MSFT").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "국내", exact: true }).click();
      await page.getByPlaceholder("예: 005930, 000270, 012330").waitFor({ state: "visible" });
      await tickerInput.fill("005930");
      await page.locator("article").filter({ hasText: "005930" }).getByRole("button", { name: "차트 보기" }).click();
      const modal = page.getByRole("dialog");
      await modal.waitFor({ state: "visible", timeout: 30_000 });
      const closeButton = modal.getByRole("button", { name: "닫기" });
      await closeButton.waitFor({ state: "visible" });
      if (viewport.name === "mobile") {
        await page.waitForTimeout(300);
        const layout = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const close = dialog?.querySelector('button[aria-label="닫기"]');
          const chart = dialog?.querySelector('#chart-panel > div:nth-child(2)');
          const dialogRect = dialog?.getBoundingClientRect();
          const closeRect = close?.getBoundingClientRect();
          const chartRect = chart?.getBoundingClientRect();
          return {
            viewportWidth: document.documentElement.clientWidth,
            viewportHeight: document.documentElement.clientHeight,
            documentWidth: document.documentElement.scrollWidth,
            dialogWidth: dialogRect?.width ?? 0,
            dialogHeight: dialogRect?.height ?? 0,
            closeWidth: closeRect?.width ?? 0,
            closeHeight: closeRect?.height ?? 0,
            closeRight: closeRect?.right ?? 0,
            closeBottom: closeRect?.bottom ?? 0,
            chartWidth: chartRect?.width ?? 0,
            chartHeight: chartRect?.height ?? 0,
          };
        });
        if (layout.viewportWidth !== 390) throw new Error(`mobile viewport width expected 390px, got ${layout.viewportWidth}px`);
        if (layout.documentWidth > layout.viewportWidth) throw new Error(`mobile document overflows horizontally: ${JSON.stringify(layout)}`);
        if (layout.dialogWidth !== layout.viewportWidth || layout.dialogHeight !== layout.viewportHeight) throw new Error(`mobile chart modal does not fill the viewport: ${JSON.stringify(layout)}`);
        if (layout.closeWidth < 44 || layout.closeHeight < 44 || layout.closeRight > layout.viewportWidth || layout.closeBottom > layout.viewportHeight) throw new Error(`mobile close control is too small or outside the viewport: ${JSON.stringify(layout)}`);
        if (layout.chartWidth < 300 || layout.chartHeight < 200) throw new Error(`mobile chart area is too small: ${JSON.stringify(layout)}`);
      }
      await closeButton.click();
      await modal.waitFor({ state: "hidden" });
      // Let initial client effects and auth/push status checks settle before checking runtime errors.
      await page.waitForTimeout(750);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length) throw new Error(`/charts browser hydration smoke failed: ${failures.join(" | ")}`);
  console.log("[deploy-verify] /charts chart modal interaction + mobile layout ok: desktop + 390px mobile (Chrome)");
}
