import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { completedOnboarding } from "./session-fixture";

const org = "11111111-1111-4111-8111-111111111111";
const user = { memberId: "test-admin", organizationId: org, organizationName: "BFF 테스트", email: "bff@example.test", displayName: "관리자", role: "admin" };
let server: Server, expired = false, refreshes = 0, revoked = false;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const path = new URL(req.url!, "http://localhost").pathname;
    res.setHeader("Content-Type", "application/json");
    const json = (value: unknown, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    const tokens = (suffix: string) => ({ access_token: `browser-test-at-${suffix}`, refresh_token: `browser-test-rt-${suffix}`, token_type: "Bearer", expires_in: 300 });
    if (path === "/v1/auth/token") { revoked = false; return json(tokens("old")); }
    if (path === "/v1/auth/logout") { revoked = true; res.statusCode = 204; return res.end(); }
    if (revoked) return json({}, 401);
    if (path === "/v1/auth/refresh") {
      refreshes++;
      if (refreshes > 1) { revoked = true; return json({}, 401); }
      await new Promise(resolve => setTimeout(resolve, 100));
      return json(tokens("new"));
    }
    if (expired && req.headers.authorization === "Bearer browser-test-at-old") return json({}, 401);
    if (path === "/v1/auth/me") return json(user);
    if (path === `/api/v1/organizations/${org}/onboarding`) return json(completedOnboarding);
    if (path === `/api/v1/organizations/${org}/analytics/overview`) return json({ ok: true });
    return json({}, 404);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(3110, "127.0.0.1", resolve); });
});
test.afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test("실제 BFF 쿠키는 JS에서 숨겨지고 두 탭의 동시 401은 한 번만 갱신한다", async ({ page, context }) => {
  await page.goto("/contact");
  const login = await page.evaluate(async organizationId => {
    const r = await fetch("/api/bff/auth/token", { method: "POST", headers: { "Content-Type": "application/json", "X-Pulsemetry-Request": "1" },
      body: JSON.stringify({ code: "uac_" + "c".repeat(43), code_verifier: "v".repeat(43), redirect_uri: location.origin + "/auth/callback", organizationId }) });
    return { status: r.status, body: await r.json() };
  }, org);
  expect(login).toEqual({ status: 200, body: { user } });
  const saved = (await context.cookies()).find(c => c.name === "pulsemetry-session")!;
  expect(saved.httpOnly).toBe(true); expect(saved.sameSite).toBe("Lax");
  expect(saved.value).not.toContain("browser-test-");
  expect(await page.evaluate(() => document.cookie)).not.toContain("pulsemetry-session");
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain("browser-test-");
  await page.reload();
  const restored = await page.evaluate(async () => (await fetch("/api/bff/auth/session", { headers: { "X-Pulsemetry-Request": "1" } })).json());
  expect(restored).toEqual({ user });
  const second = await context.newPage(); await second.goto("/contact");
  expired = true;
  const send = (tab: typeof page) => tab.evaluate(async organizationId => Promise.all(Array.from({ length: 10 }, async () => {
    const r = await fetch(`/api/bff/dashboard/api/v1/organizations/${organizationId}/analytics/overview`, { headers: { "X-Pulsemetry-Request": "1" } });
    return { status: r.status, body: await r.json() };
  })), org);
  const results = (await Promise.all([send(page), send(second)])).flat();
  expect(results.every(r => r.status === 200 && r.body.ok)).toBe(true);
  expect(refreshes).toBe(1);
  expect((await context.cookies()).find(c => c.name === "pulsemetry-session")!.value).not.toBe(saved.value);
  await second.goto("/overview");
  await expect(second.locator('nav a[href="/overview"]')).toBeVisible();
  const logout = await page.evaluate(async () => (await fetch("/api/bff/auth/logout", { method: "POST", headers: { "X-Pulsemetry-Request": "1" } })).status);
  expect(logout).toBe(204);
  expect((await context.cookies()).some(c => c.name === "pulsemetry-session")).toBe(false);
  await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(second).toHaveURL(/\/login$/);
  await expect(second.getByLabel("회사 이메일", { exact: true })).toBeVisible();
});


test("실제 화면 가드는 만료 AT를 BFF에서 갱신하고 폐기 RT는 순환 없이 로그인으로 보낸다", async ({ page }) => {
  expired = false; refreshes = 0; revoked = false;
  await page.goto("/contact");
  const status = await page.evaluate(async organizationId => (await fetch("/api/bff/auth/token", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Pulsemetry-Request": "1" },
    body: JSON.stringify({ code: "uac_" + "d".repeat(43), code_verifier: "v".repeat(43), redirect_uri: location.origin + "/auth/callback", organizationId }),
  })).status, org);
  expect(status).toBe(200);
  expired = true;
  await page.goto("/login");
  await expect(page).toHaveURL(/\/overview(?:\?.*)?$/);
  await expect(page.locator('nav a[href="/overview"]')).toBeVisible();
  expect(refreshes).toBe(1);
  revoked = true;
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
  expect((await page.context().cookies()).some(c => c.name === "pulsemetry-session")).toBe(true);
});
