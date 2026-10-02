import { expect, test } from "@playwright/test";
import { mockOverview } from "./overview-fixture";
import { mockSession } from "./helpers";

/** 세션이 없으면 어느 대시보드 화면이든 같은 로그인 안내이고, 목업 조직·관리자 신분이나 로그아웃을 보이지 않는다. 조직 데이터를 조회하지 않는다. */
test("세션이 없으면 대시보드 화면마다 같은 로그인 안내이고 목업 신원을 보이지 않는다", async ({ page }) => {
  const organizationRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/v1/organizations/")) organizationRequests.push(request.url()); });
  for (const path of ["/overview", "/teams", "/ops", "/members", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "로그인이 필요합니다", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "로그인", exact: true })).toHaveAttribute("href", "/login");
    const nav = page.getByRole("navigation", { name: "주 내비게이션" });
    await expect(nav.getByRole("link", { name: "로그인", exact: true })).toBeVisible();
    await expect(nav).not.toContainText("코드웍스");
    await expect(nav).not.toContainText("관리자");
    await expect(nav.getByRole("link", { name: "로그아웃", exact: true })).toHaveCount(0);
  }
  expect(organizationRequests).toEqual([]);
});

test("세션이 있으면 사이드바가 세션의 조직·계정·역할을 보이고, 로그아웃 뒤 뒤로 가도 로그인 안내다", async ({ page }) => {
  await mockSession(page);
  await mockOverview(page);
  await page.route("**/v1/auth/logout", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-headers": "content-type" } }));
  await page.goto("/overview");
  const account = page.getByLabel("로그인한 계정");
  await expect(account).toContainText("코드웍스");
  await expect(account).toContainText("admin@seed-a.example.test");
  await expect(account).toContainText("관리자");
  // 다른 화면으로 옮긴 뒤 로그아웃한다(로그아웃은 지금 기록을 /login 으로 바꾼다). 뒤로 가면 앞 화면의 기록이다.
  await page.getByRole("navigation", { name: "주 내비게이션" }).getByRole("link", { name: "운영 · 보안" }).click();
  await expect(page).toHaveURL(/\/ops$/);
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "로그인이 필요합니다", exact: true })).toBeVisible();
  await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
});

test("내보낼 목록이 없는 화면의 CSV 는 꺼진 이유를 말한다", async ({ page }) => {
  await mockSession(page);
  await mockOverview(page);
  await page.goto("/ops");
  const csv = page.getByRole("button", { name: "CSV", exact: true });
  await expect(csv).toBeDisabled();
  await expect(csv).toHaveAttribute("title", "이 화면에는 CSV로 내보낼 목록이 없습니다");
});
