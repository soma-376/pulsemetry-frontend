import { expect, test } from "./fixtures";
import { openDashboard, signIn } from "./helpers";
import { overviewUrl, settingsFixture, settingsUrl } from "./overview-fixture";

test("페이지 왕복은 개요 캐시를 재사용하고 재로그인 시에는 새로 조회한다", async ({ page }) => {
  let requests = 0;
  page.on("request", request => { if (request.method() === "GET" && request.url().includes("/analytics/overview?")) requests++; });
  await page.route(settingsUrl, route => route.fulfill({ json: settingsFixture(), headers: { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "authorization,content-type" } }));
  await openDashboard(page, "/overview");
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  const initialRequests = requests;
  expect(initialRequests).toBeGreaterThan(0);
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "개요", exact: true }).click();
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  expect(requests).toBe(initialRequests);
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const fresh = page.waitForResponse(overviewUrl);
  await signIn(page);
  await fresh;
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  expect(requests).toBeGreaterThan(initialRequests);
});
