import { defineConfig } from "@playwright/test";

// 목 테스트는 필요한 API를 가로챈다. 가로채지 않은 요청이 닿을 주소만 바꿀 수 있게 한다(기본은 로컬 개발 포트).
const enrollmentUrl = process.env.MOCK_ENROLLMENT_API_URL ?? "http://localhost:8080";
const dashboardUrl = process.env.MOCK_DASHBOARD_API_URL ?? "http://localhost:8081";

export default defineConfig({
  testDir: "./tests/browser",
  // Avoid saturating the local server with one worker per CPU core.
  workers: 2,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3107",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Build with fixture configuration instead of reusing the real API dev server.
    command: "npm run build && npm run start -- --port 3107",
    url: "http://localhost:3107/overview",
    reuseExistingServer: false,
    timeout: 120000,
    // 대시보드는 세션이 있어야 조회한다 — 목 테스트는 목 세션(tests/browser/helpers.ts mockSession)이나 목 로그인을 쓴다. 로그인 화면은 데모 시나리오를 켠다.
    env: { NEXT_PUBLIC_DEMO_LOGIN: "true", NEXT_PUBLIC_DASHBOARD_API_URL: dashboardUrl, NEXT_PUBLIC_ENROLLMENT_API_URL: enrollmentUrl, ENROLLMENT_API_URL: enrollmentUrl },
  },
});
