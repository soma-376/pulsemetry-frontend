import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// 기본 대상은 3000번 개발 서버다. 다른 포트의 로컬 스택을 검증할 때만 E2E_BASE_URL을 지정한다.
const baseURL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const target = new URL(baseURL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.port) {
  throw new Error("E2E_BASE_URL은 포트를 포함한 로컬 주소여야 합니다. 예: http://localhost:3000");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: ".e2e-artifacts/backend",
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    // Real authentication responses contain tokens; keep them out of trace archives.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${target.port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
