import { defineConfig } from "@playwright/test";
import auto from "./playwright.auto.config";

/** 격리 Testcontainers API에 실제 HTTP 요청을 전달한다. 인증 쿠키/전달 계층만 테스트 fixture다. */
export default defineConfig({
  ...auto,
  testDir: "./tests/auto-api",
  workers: 1,
  timeout: 60_000,
  use: { ...auto.use, trace: "off" },
});
