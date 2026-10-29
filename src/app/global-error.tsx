"use client";

import { useLayoutEffect } from "react";
import { RenderErrorState } from "@/components/ui/RenderErrorState";
import {
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  themeBootstrapScript,
} from "@/lib/theme-config";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

/** 루트 레이아웃을 대체하므로 문서·스타일·테마를 직접 제공합니다. */
export default function GlobalError({ retry }: { retry: () => void }) {
  useLayoutEffect(() => {
    // 클라이언트에서 루트 문서를 교체하면 head의 스크립트가 재실행되지 않을 수 있습니다.
    let theme = window.matchMedia(SYSTEM_THEME_QUERY).matches
      ? "dark"
      : "light";
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") theme = saved;
    } catch {
      // 저장소를 사용할 수 없으면 시스템 테마를 유지합니다.
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, []);

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <title>화면 오류 · Pulsemetry</title>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <main className="flex min-h-dvh items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg">
            <RenderErrorState retry={retry} />
          </div>
        </main>
      </body>
    </html>
  );
}
