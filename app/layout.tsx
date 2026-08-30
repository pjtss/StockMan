import type { Metadata, Viewport } from "next";
import { PushProvider } from "@/components/push-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "⚡ STOCKMAN: 퀀트 모니터 터미널",
  description: "DART와 SEC 공시를 실시간으로 추출하여 수급과 교차 검증하는 프리미엄 STOCKMAN 퀀트 모니터 터미널",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Anti-FOUC: set theme before first paint
const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('stockman-theme');
      var preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', stored || preferred);
    } catch(e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <PushProvider>{children}</PushProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
