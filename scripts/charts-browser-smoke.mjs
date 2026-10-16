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
      page.on("pageerror", (error) => failures.push(`${viewport.name}: uncaught browser error: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && HYDRATION_ERROR.test(message.text())) {
          failures.push(`${viewport.name}: ${message.text()}`);
        }
      });

      const response = await page.goto(new URL("/charts", baseUrl).href, { waitUntil: "domcontentloaded" });
      if (!response?.ok()) throw new Error(`${viewport.name} /charts returned HTTP ${response?.status() ?? "no response"}`);
      await page.getByRole("heading", { name: "티커 차트 조회" }).waitFor({ state: "visible" });
      await page.getByRole("textbox", { name: "티커 입력" }).waitFor({ state: "visible" });
      await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "티커 차트" }).waitFor({ state: "visible" });
      // Let initial client effects and auth/push status checks settle before checking runtime errors.
      await page.waitForTimeout(750);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length) throw new Error(`/charts browser hydration smoke failed: ${failures.join(" | ")}`);
  console.log("[deploy-verify] /charts browser hydration ok: desktop + mobile (Chrome)");
}
