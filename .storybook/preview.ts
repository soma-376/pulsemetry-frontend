import { notificationHandlers } from "./fixtures/alerts";
import { setupWorker } from "msw/browser";
import { mswLoader } from "msw-storybook-addon/csf3";
import type { Preview } from "@storybook/nextjs-vite";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "../src/app/globals.css";

const preview: Preview = {
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker(...notificationHandlers());
      await worker.start({
        quiet: true,
        onUnhandledRequest(request, print) {
          const path = new URL(request.url).pathname;
          if (path.startsWith("/api/") || path.startsWith("/v1/"))
            print.error();
        },
      });
      return worker;
    }),
  ],
  parameters: {
    nextjs: { appDirectory: true },
    options: {
      storySort: {
        order: [
          "Pages",
          [
            "개요",
            ["일반", "로딩", "에러", "세부 사례"],
            "팀 분석",
            ["일반", "로딩", "에러"],
            "구성원",
            ["일반", "로딩", "에러"],
            "운영·보안",
            ["일반", "로딩", "에러"],
            "설정",
            ["일반", "로딩", "에러", "세부 사례"],
            "Onboarding",
          ],
          "Layout",
          "UI",
        ],
      },
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { disable: true },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-theme",
    }),
  ],
  tags: ["autodocs"],
};

export default preview;
