// 별도 운영 빌드·포트에서 실제 Chromium Web Vitals 전송을 검증한다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "@playwright/test";
const received = [];
const collector = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  received.push(JSON.parse(body));
  res.writeHead(202).end();
});
collector.listen(0, "127.0.0.1");
await once(collector, "listening");
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["scripts/start-standalone.mjs"], {
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next/rum-validation",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    OTEL_SDK_DISABLED: "true",
    RUM_ENABLED: "true",
    RUM_ENVIRONMENT: "local",
    BFF_ORIGIN: origin,
    FARO_COLLECTOR_URL: `http://127.0.0.1:${collector.address().port}/collect`,
  },
  stdio: ["ignore", "ignore", "inherit"],
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error("검증 서버 종료");
    try {
      const r = await fetch(origin + "/api/rum/config");
      if (r.ok && (await r.json()).enabled) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(origin + "/login?token=should-not-leak", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1500);
  // INP 전송 검증용 제어된 상호작용. 실제 로그인 화면의 성능 수치로 사용하지 않는다.
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "rum-validation-interaction";
    button.textContent = "RUM validation";
    button.style.cssText = "position:fixed;top:0;left:0;z-index:999999";
    button.onclick = () => {
      const end = performance.now() + 80;
      while (performance.now() < end) {
        /* 제어된 처리 지연 */
      }
      button.textContent = "Complete";
    };
    document.body.append(button);
  });
  await page.locator("#rum-validation-interaction").click();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
  await page.goto("about:blank");
  for (
    let i = 0;
    i < 20 &&
    !received.some((b) => b.measurements?.some((m) => "inp" in m.values));
    i++
  )
    await new Promise((r) => setTimeout(r, 250));
  const measurements = received.flatMap((b) => b.measurements);
  const names = new Set(measurements.flatMap((m) => Object.keys(m.values)));
  assert.ok(names.has("lcp"), "LCP 미수신");
  assert.ok(names.has("cls"), "CLS 미수신");
  assert.ok(names.has("inp"), "INP 미수신");
  assert.equal(JSON.stringify(received).includes("should-not-leak"), false);
  for (const body of received) {
    assert.deepEqual(Object.keys(body).sort(), ["measurements", "meta"]);
    assert.deepEqual(body.meta, {
      app: { name: "pulsemetry-browser", environment: "local" },
      page: { url: "/login" },
    });
  }
  console.log(
    "PASS 운영 빌드 Chromium → 동일 도메인 프록시 → 수신기: LCP/INP/CLS, 민감 정보 제외",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  if (child.exitCode === null) await once(child, "exit");
  await new Promise((resolve) => collector.close(resolve));
}
