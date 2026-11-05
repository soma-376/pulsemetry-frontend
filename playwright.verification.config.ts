import { defineConfig } from "@playwright/test";
import auto from "./playwright.auto.config";

/** 로컬 실제 API 검증과 보조 오류 상태 촬영은 결과 폴더를 분리한다. */
const mode = process.env.VERIFICATION_TREND_MODE ?? "auto";
const server = Array.isArray(auto.webServer)
  ? auto.webServer[0]
  : auto.webServer;
export default defineConfig({
  ...auto,
  testDir:
    process.env.VERIFICATION_SUITE === "states"
      ? "./tests/verification-states"
      : "./tests/verification-api",
  workers: 1,
  timeout: 120_000,
  outputDir: `./test-results/verification-${mode}`,
  use: {
    ...auto.use,
    baseURL: "http://localhost:3198",
    viewport: { width: 1440, height: 1100 },
    trace: "off",
  },
  webServer: {
    ...server,
    command: "npm run build && npm run start",
    url: "http://localhost:3198/login",
    timeout: 180_000,
    env: {
      ...server?.env,
      PORT: "3198",
      BFF_ORIGIN: "http://localhost:3198",
    },
  },
});
