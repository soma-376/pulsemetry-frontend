import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import { QueryProvider } from "@/lib/query-provider";
import { OrganizationProvider } from "@/lib/organization-store";
import { themeBootstrapScript } from "@/lib/theme-config";
// 동적 서브셋을 직접 import해 Next.js와 Storybook 모두 폰트 파일 경로를 해석하게 합니다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
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
        <ThemeProvider><OrganizationProvider><QueryProvider>{children}</QueryProvider></OrganizationProvider></ThemeProvider>
      </body>
    </html>
  );
}
