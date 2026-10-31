// 별도 운영 빌드·포트에서 실제 Chromium Web Vitals 전송을 검증한다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";

// Bundle the real fallback components in a test-only React boundary. No debug
// route or error trigger is added to the deployed Next application.
async function boundaryBundle() {
  const entry = resolve(".next/rum-boundary-test.ts");
  const result = await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "@": resolve("src") } },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env": "{}",
    },
    plugins: [
      {
        name: "rum-boundary-test",
        resolveId(id) {
          if (id === entry) return "\0" + entry;
        },
        load(id) {
          if (id !== "\0" + entry) return;
          return `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import RootError from ${JSON.stringify(resolve("src/app/error.tsx"))};
          import DashboardError from ${JSON.stringify(resolve("src/app/(dashboard)/error.tsx"))};
          import GlobalError from ${JSON.stringify(resolve("src/app/global-error.tsx"))};
          const kind = new URLSearchParams(location.search).get("kind");
          const Fallback = kind === "global" ? GlobalError : kind === "dashboard" ? DashboardError : RootError;
          function Broken() { throw new TypeError("should-not-leak boundary"); }
          class Boundary extends React.Component {
            state = { error: null, recovered: false };
            static getDerivedStateFromError(error) { return { error }; }
            render() {
              if (this.state.error) return React.createElement(Fallback, {
                error: this.state.error,
                retry: () => this.setState({ error: null, recovered: true }),
              });
              const content = this.state.recovered ? React.createElement("p", null, "Recovered") : React.createElement(Broken);
              return kind === "global" ? React.createElement("html", null, React.createElement("body", null, content)) : content;
            }
          }
          createRoot(kind === "global" ? document : document.getElementById("root"), { onCaughtError() {} }).render(React.createElement(Boundary));
        `;
        },
      },
    ],
    build: {
      write: false,
      lib: { entry, name: "RumBoundaryTest", formats: ["iife"] },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs
    .flatMap((output) => output.output)
    .find((output) => output.type === "chunk").code;
}
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
  const outgoing = [];
  page.on("request", (req) => {
    if (req.url().endsWith("/api/rum/collect"))
      outgoing.push(req.postData() ?? "");
  });
  await page.evaluate(() => {
    setTimeout(() => {
      throw new TypeError("should-not-leak browser exception");
    }, 0);
    void Promise.reject(new RangeError("should-not-leak rejected promise"));
  });
  for (
    let i = 0;
    i < 30 && received.flatMap((body) => body.exceptions ?? []).length < 2;
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 100));
  const exceptions = received.flatMap((body) => body.exceptions ?? []);
  assert.ok(
    exceptions.some((error) => error.type === "TypeError"),
    "미처리 오류 미수신",
  );
  assert.ok(
    exceptions.some((error) => error.type === "RangeError"),
    "Promise rejection 미수신",
  );
  assert.equal(
    outgoing.join("").includes("should-not-leak"),
    false,
    "브라우저 전송 전 정제 실패",
  );
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
    assert.deepEqual(
      Object.keys(body).sort(),
      body.exceptions
        ? ["exceptions", "measurements", "meta"]
        : ["measurements", "meta"],
    );
    assert.deepEqual(body.meta, {
      app: { name: "pulsemetry-browser", environment: "local" },
      page: { url: "/login" },
    });
  }
  const bundle = await boundaryBundle();
  for (const kind of ["root", "dashboard", "global"]) {
    const fallback = await browser.newPage();
    fallback.setDefaultTimeout(10_000);
    fallback.on("pageerror", (error) =>
      console.error("boundary harness:", error.message),
    );
    await fallback.route(origin + "/__rum_boundary_test*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body><div id="root"></div></body></html>',
      }),
    );
    await fallback.goto(origin + "/__rum_boundary_test?kind=" + kind);
    const before = received.flatMap((body) => body.exceptions ?? []).length;
    await fallback.addScriptTag({ content: bundle });
    await fallback
      .getByRole("button", { name: "다시 시도", exact: true })
      .waitFor();
    for (
      let i = 0;
      i < 30 &&
      received.flatMap((body) => body.exceptions ?? []).length === before;
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    const errors = received
      .flatMap((body) => body.exceptions ?? [])
      .slice(before);
    assert.equal(errors.length, 1, `${kind} boundary must emit exactly once`);
    assert.equal(
      errors[0].context.source,
      kind === "global" ? "global-boundary" : "react-boundary",
    );
    await fallback
      .getByRole("button", { name: "다시 시도", exact: true })
      .click();
    await fallback.getByText("Recovered", { exact: true }).waitFor();
    await fallback.close();
  }
  assert.equal(JSON.stringify(received).includes("should-not-leak"), false);
  console.log(
    "PASS 운영 빌드 Chromium → 동일 도메인 프록시 → 수신기: LCP/INP/CLS, 미처리 오류·Promise rejection, 3개 React boundary 수집·재시도, 민감 정보 제외",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  if (child.exitCode === null) await once(child, "exit");
  await new Promise((resolve) => collector.close(resolve));
}
