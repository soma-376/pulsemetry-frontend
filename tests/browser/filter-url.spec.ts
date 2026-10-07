import { expect, authenticatedTest as test } from "./fixtures";
import { mockOverview } from "./overview-fixture";
import { mockTeams } from "./teams-fixture";
import { currentDateIso } from "../../src/lib/date";
import { defaultDashboardFilters } from "../../src/lib/filter-query";

test.beforeEach(async ({ page }) => {
  await mockOverview(page);
  await mockTeams(page);
});

test("공유 URL과 새로고침·페이지 이동·뒤로가기가 같은 조회 조건을 사용한다", async ({
  page,
}) => {
  const requests: URL[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/analytics/overview?"))
      requests.push(new URL(request.url()));
  });
  await page.goto(
    "/overview?startDate=2026-09-01&endDate=2026-09-13&compare=none&marker=keep#chart",
  );
  const period = page.getByRole("button", {
    name: "2026.09.01 ~ 2026.09.13",
    exact: true,
  });
  await expect(period).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "비교", exact: true }),
  ).toHaveValue("none");
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0].searchParams.get("startDate")).toBe("2026-09-01");
  expect(requests[0].searchParams.get("compare")).toBe("none");
  await page.reload();
  await expect(period).toBeVisible();
  const historyLength = await page.evaluate(() => history.length);
  await page
    .getByRole("combobox", { name: "비교", exact: true })
    .selectOption("prev_period");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("compare") === "prev_period",
  );
  expect(new URL(page.url()).searchParams.get("marker")).toBe("keep");
  expect(new URL(page.url()).hash).toBe("#chart");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const nav = page.getByRole("navigation", { name: "주 내비게이션" });
  await nav.getByRole("link", { name: "팀 분석", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/teams" &&
      url.searchParams.get("startDate") === "2026-09-01" &&
      url.searchParams.get("compare") === "prev_period",
  );
  await page.goBack();
  await expect(period).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "비교", exact: true }),
  ).toHaveValue("prev_period");
  await page.goForward();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/teams" &&
      url.searchParams.get("endDate") === "2026-09-13",
  );
});

test("기본값과 잘못된 URL은 이번 주·전주로 복구하고 잘못된 기간으로 요청하지 않는다", async ({
  page,
}) => {
  const defaults = defaultDashboardFilters(currentDateIso());
  const requests: URL[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/analytics/overview?"))
      requests.push(new URL(request.url()));
  });
  await page.goto(
    "/overview?startDate=2026-02-30&endDate=2026-01-01&compare=bad",
  );
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("startDate") === defaults.dates.start &&
      url.searchParams.get("endDate") === defaults.dates.end &&
      url.searchParams.get("compare") === "prev_week",
  );
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(
    requests.every(
      (url) =>
        url.searchParams.get("startDate") === defaults.dates.start &&
        url.searchParams.get("endDate") === defaults.dates.end,
    ),
  ).toBe(true);
  await page.goto("/overview");
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("startDate") === defaults.dates.start &&
      url.searchParams.get("compare") === "prev_week",
  );
});

test("기간은 적용할 때만 URL에 저장하고 계약 이동 링크에도 전달한다", async ({
  page,
}) => {
  await page.goto(
    "/overview?startDate=2026-09-01&endDate=2026-09-13&compare=none",
  );
  await page
    .getByRole("button", { name: "2026.09.01 ~ 2026.09.13", exact: true })
    .click();
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("startDate")).toBe("2026-09-01");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("startDate") === currentDateIso() &&
      url.searchParams.get("endDate") === currentDateIso(),
  );
  const link = page.getByRole("link", {
    name: "Claude 계약 설정 열기",
    exact: true,
  });
  await expect(link).toBeVisible();
  const target = new URL((await link.getAttribute("href"))!, page.url());
  expect(target.pathname).toBe("/settings");
  expect(target.searchParams.get("vendor")).toBe("claude-contract");
  expect(target.searchParams.get("compare")).toBe("none");
  expect(target.searchParams.get("startDate")).toBe(currentDateIso());
});

test("로그아웃 버튼은 역할 배지와 같은 줄에 있고 사이드바를 접어도 사용할 수 있다", async ({
  page,
}) => {
  await page.goto("/overview");
  const account = page.getByLabel("로그인한 계정", { exact: true });
  const logout = account.getByRole("button", { name: "로그아웃", exact: true });
  await expect(logout).toBeVisible();
  const roleBox = await account
    .getByText("관리자", { exact: true })
    .boundingBox();
  const logoutBox = await logout.boundingBox();
  expect(
    Math.abs(
      roleBox!.y + roleBox!.height / 2 - (logoutBox!.y + logoutBox!.height / 2),
    ),
  ).toBeLessThan(2);
  expect(logoutBox!.x).toBeGreaterThan(roleBox!.x);
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
});
