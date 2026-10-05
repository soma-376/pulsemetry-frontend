import { expect, test, type Page, type Route } from "@playwright/test";
import { mockSeedAuth, openDashboard, signIn } from "./helpers";


/** 인증 요청 제한(429) 안내 — 서버(enrollment ADR 0052)는 `Retry-After`를 CORS 로 노출한다. 목 응답도 같은 헤더를 준다. */
const cors = (page: Page) => ({
  "access-control-allow-origin": new URL(page.url() === "about:blank" ? test.info().project.use.baseURL! : page.url()).origin,
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-expose-headers": "Retry-After",
});
const limited = (page: Page, seconds: number) => ({ status: 429, headers: { ...cors(page), "Retry-After": String(seconds) },
  json: { error: "rate_limited", message: "사용자 인증 요청을 처리할 수 없습니다." } });
const session = async (page: Page) => (await page.context().cookies()).find(cookie => cookie.name === "pulsemetry-session") ?? null;

test("로그인 429는 인증 실패가 아니라 대기 안내이고, 그동안 버튼을 잠갔다가 같은 이메일로 다시 로그인한다", async ({ page }) => {
  await mockSeedAuth(page);
  let attempts = 0;
  await page.route("**/api/bff/auth/organizations", async (route) => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 429, headers: { "Retry-After": "2" }, json: { error: "rate_limited", message: "로그인 요청이 많아 잠시 제한되었습니다." } });
    return route.fallback();
  });
  await page.goto("/login");
  await page.getByLabel("회사 이메일", { exact: true }).fill("admin@seed-a.example.test");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  await expect(page.locator("#login-message")).toHaveText("요청이 많아 잠시 제한되었습니다. 2초 뒤에 다시 시도해 주세요.");
  await expect(page.getByText(/시드 적재와 서버 설정|백엔드 시드 계정 인증/)).toHaveCount(0);
  const locked = page.getByRole("button", { name: /초 뒤 다시 시도$/ });
  await expect(locked).toBeDisabled();
  await locked.click({ force: true });
  expect(attempts).toBe(1);
  await expect(page.getByLabel("회사 이메일", { exact: true })).toHaveValue("admin@seed-a.example.test");
  const submit = page.getByRole("button", { name: "회사 계정으로 계속", exact: true });
  await expect(submit).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator("#login-message")).toHaveText("");
  await submit.click();
  await expect(page).toHaveURL(/\/onboarding$/);
  expect(attempts).toBe(2);
});

async function limitLogoutOnce(page: Page) {
  const calls = { count: 0 };
  await page.route("**/api/bff/auth/logout", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors(page) });
    calls.count++;
    return calls.count === 1 ? route.fulfill(limited(page, 2)) : route.fallback();
  });
  return calls;
}

test("온보딩의 로그아웃 429는 세션을 유지하고 남은 시간 동안 다시 보내지 않는다", async ({ page }) => {
  await page.goto("/login");
  await signIn(page);
  await expect(page).toHaveURL(/\/onboarding$/);
  const calls = await limitLogoutOnce(page);
  const logout = page.getByRole("link", { name: "로그아웃", exact: true });
  await logout.click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("요청이 많아 잠시 제한되었습니다. 2초 뒤에 다시 시도해 주세요.");
  await expect(page).toHaveURL(/\/onboarding$/);
  expect(await session(page)).not.toBeNull();
  const waiting = page.getByRole("link", { name: /^로그아웃 · \d+초 뒤$/ });
  await expect(waiting).toHaveAttribute("aria-disabled", "true");
  // aria-disabled 는 Playwright 가 기다리므로 강제로 눌러 잠금 처리를 본다.
  await waiting.click({ force: true });
  expect(calls.count).toBe(1);
  await expect(logout).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/요청이 많아 잠시 제한/)).toHaveCount(0);
  await logout.click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls.count).toBe(2);
  expect(await session(page)).toBeNull();
});

test("사이드바의 로그아웃 429도 같은 안내와 잠금이다", async ({ page }) => {
  await openDashboard(page, "/overview");
  const calls = await limitLogoutOnce(page);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("navigation").getByRole("alert")).toHaveText("요청이 많아 잠시 제한되었습니다. 2초 뒤에 다시 시도해 주세요.");
  await expect(page.getByRole("button", { name: /^로그아웃 · \d+초 뒤$/ })).toHaveAttribute("aria-disabled", "true");
  expect(await session(page)).not.toBeNull();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/login$/);
  expect(calls.count).toBe(2);
});

test("세션 확인 429는 로그아웃하지 않고 재시도할 수 있다", async ({ page }) => {
  await page.goto("/login");
  await signIn(page);
  const before = await session(page);
  let calls = 0;
  await page.route("**/api/bff/auth/session", route => ++calls === 1
    ? route.fulfill(limited(page, 1)) : route.fallback());
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "요청이 많아" })).toBeVisible();
  expect(await session(page)).toEqual(before);
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("radio", { name: /^수집하지 않음/ })).toBeVisible();
  expect(calls).toBe(2);
});
