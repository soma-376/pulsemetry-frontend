import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { completedOnboarding } from "./session-fixture";
import { createBff } from "../../src/lib/server/bff";
import { createValkeySessionStore } from "../../src/lib/server/valkey-session-store";
import { memorySessionCommands } from "../support/session-commands";

const org = "11111111-1111-4111-8111-111111111111";
const user = {
  memberId: "test-admin",
  organizationId: org,
  organizationName: "BFF 테스트",
  email: "bff@example.test",
  displayName: "관리자",
  role: "admin",
};
let server: Server,
  expired = false,
  refreshes = 0,
  revoked = false;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const path = new URL(req.url!, "http://localhost").pathname;
    res.setHeader("Content-Type", "application/json");
    const json = (value: unknown, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    const tokens = (suffix: string) => ({
      access_token: `browser-test-at-${suffix}`,
      refresh_token: `browser-test-rt-${suffix}`,
      token_type: "Bearer",
      expires_in: 300,
    });
    if (path === "/api/v1/auth/token") {
      revoked = false;
      return json(tokens("old"));
    }
    if (path === "/api/v1/auth/logout") {
      revoked = true;
      res.statusCode = 204;
      return res.end();
    }
    if (revoked) return json({}, 401);
    if (path === "/api/v1/auth/refresh") {
      refreshes++;
      if (refreshes > 1) {
        revoked = true;
        return json({}, 401);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return json(tokens("new"));
    }
    if (expired && req.headers.authorization === "Bearer browser-test-at-old")
      return json({}, 401);
    if (path === "/api/v1/auth/me") return json(user);
    if (path === `/api/v1/organizations/${org}/onboarding`)
      return json(completedOnboarding);
    if (path === `/api/v1/organizations/${org}/analytics/overview`)
      return json({ ok: true });
    return json({}, 404);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3110, "127.0.0.1", resolve);
  });
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

/**
 * mock suite에는 AWS Valkey가 없다. 브라우저 transport만 제품 BFF 처리기로 연결하고
 * 실제 세션 저장 로직에 기존 원자 명령 fixture를 주입한다. 고정 인증 응답을 반환하지 않는다.
 * Next Proxy와 브라우저의 Set-Cookie/HttpOnly 처리는 그대로 실행한다.
 * Next BFF route의 getBff 조립과 실제 Valkey·AWS IAM/TLS 연결은 이 테스트에 포함하지 않는다.
 * 저장소 원자 명령의 실제 Lua는 valkey.integration.ts가 별도로 검증한다.
 */
test.beforeEach(async ({ context, baseURL }) => {
  expired = false;
  refreshes = 0;
  revoked = false;
  const origin = new URL(baseURL!).origin;
  const config = {
    origin,
    keys: ["ab".repeat(32)],
    environment: "dev" as const,
  };
  const memory = memorySessionCommands();
  // 두 처리기 인스턴스가 같은 명령 저장소를 공유해 교차 탭 경쟁을 검증한다.
  const handlers = Array.from({ length: 2 }, () =>
    createBff({
      ...config,
      sessionStore: createValkeySessionStore(memory.commands, config),
      enrollmentUrl: "http://127.0.0.1:3110",
      dashboardUrl: "http://127.0.0.1:3110",
    }),
  );
  let nextHandler = 0;
  await context.route(`${origin}/api/bff/**`, async (route) => {
    const incoming = route.request();
    const response = await handlers[nextHandler++ % handlers.length].handle(
      new Request(incoming.url(), {
        method: incoming.method(),
        headers: await incoming.allHeaders(),
        body: incoming.postData() ?? undefined,
      }),
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
});

async function expectExpiredGate(page: Page) {
  const gate = page.getByRole("region", { name: "세션이 만료되었습니다" });
  await expect(gate).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "주 내비게이션" }),
  ).toHaveCount(0);
  const login = gate.getByRole("link", { name: "로그인 페이지로 이동" });
  await expect(login).toHaveAttribute("href", /^\/login\?redirecturl=/);
  await login.click();
  await expect(page).toHaveURL(/\/login\?redirecturl=/);
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
}

test("제품 BFF 처리기의 쿠키는 JS에서 숨겨지고 두 탭의 동시 401은 한 번만 갱신한다", async ({
  page,
  context,
}) => {
  await page.goto("/contact");
  const login = await page.evaluate(async (organizationId) => {
    const r = await fetch("/api/bff/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pulsemetry-Request": "1",
      },
      body: JSON.stringify({
        code: "uac_" + "c".repeat(43),
        code_verifier: "v".repeat(43),
        redirect_uri: location.origin + "/auth/callback",
        organizationId,
      }),
    });
    return { status: r.status, body: await r.json() };
  }, org);
  expect(login).toEqual({ status: 200, body: { user } });
  const saved = (await context.cookies()).find(
    (c) => c.name === "pulsemetry-session",
  )!;
  expect(saved.httpOnly).toBe(true);
  expect(saved.sameSite).toBe("Lax");
  expect(saved.value).not.toContain("browser-test-");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "pulsemetry-session",
  );
  expect(
    await page.evaluate(() => JSON.stringify(sessionStorage)),
  ).not.toContain("browser-test-");
  await page.reload();
  const restored = await page.evaluate(async () =>
    (
      await fetch("/api/bff/auth/session", {
        headers: { "X-Pulsemetry-Request": "1" },
      })
    ).json(),
  );
  expect(restored).toEqual({ user });
  const second = await context.newPage();
  await second.goto("/contact");
  expired = true;
  const send = (tab: typeof page) =>
    tab.evaluate(
      async (organizationId) =>
        Promise.all(
          Array.from({ length: 10 }, async () => {
            const r = await fetch(
              `/api/bff/dashboard/api/v1/organizations/${organizationId}/analytics/overview`,
              { headers: { "X-Pulsemetry-Request": "1" } },
            );
            return { status: r.status, body: await r.json() };
          }),
        ),
      org,
    );
  const results = (await Promise.all([send(page), send(second)])).flat();
  expect(results.every((r) => r.status === 200 && r.body.ok)).toBe(true);
  expect(refreshes).toBe(1);
  // 토큰은 공유 저장소에서 바뀌고 브라우저의 불변 참조 쿠키는 재발급하지 않는다.
  expect(
    (await context.cookies()).find((c) => c.name === "pulsemetry-session")!
      .value,
  ).toBe(saved.value);
  await second.goto("/overview");
  await expect(
    second
      .getByRole("navigation", { name: "주 내비게이션" })
      .getByRole("link", { name: "개요", exact: true }),
  ).toBeVisible();
  const logout = await page.evaluate(
    async () =>
      (
        await fetch("/api/bff/auth/logout", {
          method: "POST",
          headers: { "X-Pulsemetry-Request": "1" },
        })
      ).status,
  );
  expect(logout).toBe(204);
  expect(
    (await context.cookies()).some((c) => c.name === "pulsemetry-session"),
  ).toBe(false);
  await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expectExpiredGate(second);
});

test("실제 화면 가드는 제품 BFF 처리기로 만료 AT를 갱신하고 폐기 RT는 재로그인을 안내한다", async ({
  page,
}) => {
  await page.goto("/contact");
  const status = await page.evaluate(
    async (organizationId) =>
      (
        await fetch("/api/bff/auth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pulsemetry-Request": "1",
          },
          body: JSON.stringify({
            code: "uac_" + "d".repeat(43),
            code_verifier: "v".repeat(43),
            redirect_uri: location.origin + "/auth/callback",
            organizationId,
          }),
        })
      ).status,
    org,
  );
  expect(status).toBe(200);
  expired = true;
  await page.goto("/login");
  await expect(page).toHaveURL(/\/overview(?:\?.*)?$/);
  await expect(
    page
      .getByRole("navigation", { name: "주 내비게이션" })
      .getByRole("link", { name: "개요", exact: true }),
  ).toBeVisible();
  expect(refreshes).toBe(1);
  revoked = true;
  await page.goto("/overview");
  await expectExpiredGate(page);
  expect(
    (await page.context().cookies()).some(
      (c) => c.name === "pulsemetry-session",
    ),
  ).toBe(true);
});
