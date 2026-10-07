import type { Page } from "@playwright/test";
import { allowHttpErrors, expect, test, seedOrganizations } from "./fixtures";
import { editStoredSession, signIn, storedSession } from "./helpers";

const [A] = seedOrganizations;
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "주 내비게이션" });

/** 세션이 없을 때 대시보드 셸이 보이면 안 되는 것 — 목업 조직·역할 배지·로그아웃, 그리고 조직 데이터 조회. */
async function expectSignedOutShell(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
  await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
  await expect(nav(page)).toHaveCount(0);
}

test("AUTH-SHELL-ANON @p0 @read 로그인하지 않은 새 탭의 보호 경로는 같은 로그인 안내이고 목업 신원·조직 조회가 없다", async ({
  page,
}) => {
  const organizationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/organizations/"))
      organizationRequests.push(new URL(request.url()).pathname);
  });
  for (const path of ["/overview", "/members", "/settings", "/teams", "/ops"]) {
    await page.goto(path);
    await expectSignedOutShell(page);
  }
  expect(organizationRequests).toEqual([]);
});

test("AUTH-SHELL-LOGOUT-BACK @p0 @read 로그인하면 세션의 조직·계정·역할을 보이고, 로그아웃 뒤 뒤로 가도 로그인 안내다", async ({
  page,
}) => {
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/overview");
  const account = page.getByLabel("로그인한 계정");
  await expect(account).toContainText(A.name);
  await expect(account).toContainText("owner@seed-a.example.test");
  await expect(account).toContainText("관리자");
  await nav(page).getByRole("link", { name: "팀 분석" }).click();
  await expect(page).toHaveURL(/\/teams(?:\?.*)?$/);
  // 로그아웃 자체를 시험한다 — 서버가 세션을 폐기하고(204) 저장된 세션이 지워진다.
  const logout = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/bff/auth/logout") &&
      response.request().method() === "POST",
  );
  await nav(page)
    .getByRole("button", { name: "로그아웃", exact: true })
    .click();
  expect((await logout).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedSession(page)).toBeNull();
  const afterLogout: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/organizations/"))
      afterLogout.push(new URL(request.url()).pathname);
  });
  await page.goBack();
  await expectSignedOutShell(page);
  expect(afterLogout).toEqual([]);
});

test("AUTH-SHELL-EXPIRED @p1 @read 세션이 끝나 갱신이 거절되면 저장된 세션을 지우고 같은 로그인 안내를 보인다", async ({
  page,
}) => {
  allowHttpErrors({
    status: 401,
    path: /^\/api\/bff\/auth\/session$/,
    method: "GET",
    reason: "폐기된 RT로 BFF 세션 확인이 거절된다",
  });
  await signIn(page, "admin@seed-a.example.test");
  await page.goto("/overview");
  await expect(page.getByLabel("로그인한 계정")).toContainText("관리자");
  // 만료된 AT 와 서버가 모르는 RT — 개요 401 → 갱신 401 → 세션 종료.
  await editStoredSession(page, {
    access_token: "expired-access-token",
    refresh_token: "urt_" + "A".repeat(43),
  });
  const refresh = page.waitForResponse((response) =>
    response.url().endsWith("/api/bff/auth/session"),
  );
  await page.reload();
  expect((await refresh).status()).toBe(401);
  await expectSignedOutShell(page);
  expect(await storedSession(page)).toBeNull();
});
