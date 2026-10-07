import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import { OrganizationProvider } from "@/lib/organization-store";
import { themeBootstrapScript } from "@/lib/theme-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulsemetry",
  description: "AI 코딩 도구 사용량 · 비용 관리 콘솔",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* paint 전에 테마를 확정해 깜빡임을 없앱니다 */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">
        <ThemeProvider><OrganizationProvider>{children}</OrganizationProvider></ThemeProvider>
      </body>
    </html>
  );
}
