import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { completedOnboarding, fixtureUser, issueFixtureCookie } from "./session-fixture";

async function sessionRoutes(page: Page, options: { completed?: boolean; status?: number; onboardingStatus?: number } = {}) {
  const state = { completed: options.completed ?? true, status: options.status ?? 200, onboardingStatus: options.onboardingStatus ?? 200, requests: 0, anonymous: false };
  await issueFixtureCookie(page);
  // 화면별 데이터는 이 테스트의 대상이 아니다. 인증 실패로 오인되는 실제 서버 요청을 방지한다.
  await page.route("**/api/bff/**", route => route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "fixture" } } }));
  await page.route("**/api/bff/auth/session", route => {
    state.requests++;
    return route.fulfill({ status: state.status, json: { user: state.anonymous ? null : fixtureUser } });
  });
  await page.route("**/api/v1/organizations/*/onboarding", route => route.fulfill({ status: state.onboardingStatus,
    json: state.onboardingStatus === 200 ? { ...completedOnboarding, completed: state.completed,
      ...(!state.completed ? { completedAt: null, policy: { confirmed: false, confirmedAt: null, version: 1, collectRawContent: null }, nextStep: "collection" } : {}) }
      : { error: { code: state.onboardingStatus === 403 ? "forbidden" : "unavailable", message: "fixture" } } }));
  return state;
}
const loginForm = (page: Page) => page.getByLabel("회사 이메일", { exact: true });
const dashboard = (page: Page) => page.locator('nav a[href="/overview"]');

for (const cookie of ["missing", "tampered", "expired"] as const) {
  test(`Proxy: ${cookie} 쿠키는 보호 경로·하위 경로를 렌더링 전에 차단한다`, async ({ page }) => {
    const request = page.context().request;
    if (cookie !== "missing") await issueFixtureCookie(page, { tampered: cookie === "tampered", expired: cookie === "expired" });
    for (const path of ["/", "/overview", "/teams/child", "/members", "/settings", "/ops/child", "/onboarding/child"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location, response.url()).pathname).toBe("/login");
      expect(response.headers()["cache-control"]).toBe("no-store");
    }
    const api = await request.get("/api/bff/dashboard/api/v1/organizations/test/settings", { headers: { "X-Pulsemetry-Request": "1" } });
    expect(api.status()).toBe(401); expect(api.headers()["content-type"]).toContain("application/json");
    expect((await request.get("/contact", { maxRedirects: 0 })).status()).toBe(200);
    expect((await request.get("/auth/callback", { maxRedirects: 0 })).status()).toBe(200);
  });
}

test("로그인 상태 확인 중에는 폼을 숨기고 완료 사용자는 overview로 이동한다", async ({ page }) => {
    const request = page.context().request;
  await sessionRoutes(page);
  // 유효한 쿠키만으로 login을 서버에서 리다이렉트하지 않는다.
  expect((await request.get("/login", { maxRedirects: 0 })).status()).toBe(200);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/bff/auth/session", async route => { await held; await route.fulfill({ json: { user: fixtureUser } }); });
  await page.goto("/login");
  await expect(page.getByRole("status")).toContainText("로그인 상태를 확인");
  await expect(loginForm(page)).toHaveCount(0);
  release();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(dashboard(page)).toBeVisible();
  await page.reload();
  await expect(dashboard(page)).toBeVisible();
  for (const path of ["/onboarding", "/"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/overview$/);
    await expect(dashboard(page)).toBeVisible();
  }
});

test("온보딩 미완료 사용자는 login·루트·모든 보호 경로에서 onboarding으로 이동한다", async ({ page }) => {
  await sessionRoutes(page, { completed: false });
  for (const path of ["/login", "/", "/overview", "/teams", "/members", "/settings", "/ops"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("radio", { name: /^수집하지 않음/ })).toBeVisible();
    await expect(dashboard(page)).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByRole("radio", { name: /^수집하지 않음/ })).toBeVisible();
});

test("폐기된 세션은 쿠키가 남아 있어도 로그인 폼을 표시하며 순환하지 않는다", async ({ page }) => {
  const state = await sessionRoutes(page, { status: 401 });
  const organizationRequests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/v1/organizations/")) organizationRequests.push(request.url());
  });
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login$/);
  await expect(loginForm(page)).toBeVisible();
  expect(state.requests).toBe(2);
  await page.reload();
  await expect(loginForm(page)).toBeVisible();
  expect(state.requests).toBe(3);
  await expect(dashboard(page)).toHaveCount(0);
  expect(organizationRequests).toEqual([]);
});

for (const status of [403, 429, 503]) {
  for (const source of ["session", "onboarding"] as const) {
    test(`${source} ${status}는 세션을 보존하고 권한 안내 또는 재시도를 제공한다`, async ({ page, context }) => {
      const state = await sessionRoutes(page, source === "session" ? { status } : { onboardingStatus: status });
      const before = (await context.cookies()).find(c => c.name === "pulsemetry-session")!.value;
      await page.goto("/overview");
      await expect(page.getByRole("alert").first()).toBeVisible();
      if (status === 403) await expect(page.getByRole("alert").first()).toContainText("권한");
      await expect(dashboard(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/overview$/);
      expect((await context.cookies()).find(c => c.name === "pulsemetry-session")!.value).toBe(before);
      state.status = 200; state.onboardingStatus = 200;
      await page.getByRole("button", { name: "다시 시도", exact: true }).click();
      await expect(dashboard(page)).toBeVisible();
    });
  }
}

test("네트워크 오류는 로그아웃하지 않고 재시도 후 화면을 복구한다", async ({ page }) => {
  await sessionRoutes(page);
  await page.route("**/api/bff/auth/session", route => route.abort("failed"));
  await page.goto("/login");
  await expect(page.getByRole("alert").first()).toContainText("연결 상태");
  await expect(loginForm(page)).toHaveCount(0);
  await page.unroute("**/api/bff/auth/session");
  await page.route("**/api/bff/auth/session", route => route.fulfill({ json: { user: fixtureUser } }));
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
});

test("클라이언트 이동과 포커스 복귀에 재확인하며 동시 확인 요청을 공유한다", async ({ page, context }) => {
  const state = await sessionRoutes(page);
  await page.goto("/overview");
  await expect(dashboard(page)).toBeVisible();
  const initial = state.requests;
  await page.locator('nav a[href="/settings"]').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dashboard(page)).toBeVisible();
  expect(state.requests).toBe(initial + 1);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route("**/api/bff/auth/session", async route => { requests++; await held; await route.fulfill({ json: { user: fixtureUser } }); });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status").filter({ hasText: "로그인 상태를 확인" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dashboard(page)).toBeHidden();
  release();
  await expect(dashboard(page)).toBeVisible();
  expect(requests).toBe(1);
  await page.unroute("**/api/bff/auth/session");
  await page.route("**/api/bff/auth/session", route => route.fulfill({ json: { user: null } }));
  const other = await context.newPage();
  await other.goto("/contact");
  await context.clearCookies({ name: "pulsemetry-session" });
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await expect(loginForm(page)).toBeVisible();
  await expect(dashboard(page)).toHaveCount(0);
});

test("포커스 재확인 동안 온보딩 입력을 숨겨 보존한다", async ({ page }) => {
  await sessionRoutes(page, { completed: false });
  await page.goto("/onboarding");
  const radio = page.getByRole("radio", { name: /^수집하지 않음/ });
  await radio.check();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/bff/auth/session", async route => { await held; await route.fulfill({ json: { user: fixtureUser } }); });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(radio).toBeHidden();
  release();
  await expect(radio).toBeVisible();
  await expect(radio).toBeChecked();
});

test("미로그인 상태의 포커스 재확인도 작성한 이메일을 보존한다", async ({ page }) => {
  await page.route("**/api/bff/auth/session", route => route.fulfill({ json: { user: null } }));
  await page.goto("/login");
  await loginForm(page).fill("draft@example.test");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/bff/auth/session", async route => { await held; await route.fulfill({ json: { user: null } }); });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(loginForm(page)).toBeHidden();
  release();
  await expect(loginForm(page)).toBeVisible();
  await expect(loginForm(page)).toHaveValue("draft@example.test");
});

test("뒤로가기 캐시에서 복원된 login은 현재 쿠키 세션을 다시 확인한다", async ({ page }) => {
  const state = await sessionRoutes(page);
  state.anonymous = true;
  await page.goto("/login");
  await expect(loginForm(page)).toBeVisible();
  state.anonymous = false;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page).toHaveURL(/\/overview$/);
  await expect(dashboard(page)).toBeVisible();
});

test("보호 화면의 뒤로가기 캐시는 숨긴 뒤 로그아웃된 현재 세션으로 재검사한다", async ({ page }) => {
  const state = await sessionRoutes(page);
  await page.goto("/overview");
  await expect(dashboard(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect(dashboard(page)).toBeHidden();
  state.anonymous = true;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page).toHaveURL(/\/login$/);
  await expect(loginForm(page)).toBeVisible();
  await expect(dashboard(page)).toHaveCount(0);
});
