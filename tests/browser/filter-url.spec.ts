import { expect, authenticatedTest as test } from "./fixtures";
import { mockOverview } from "./overview-fixture";
import { mockTeams } from "./teams-fixture";
import { currentDateIso } from "../../src/lib/date";
import { defaultDashboardFilters } from "../../src/lib/filter-query";
import { completedOnboarding, fixtureOrg } from "./session-fixture";

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

test("기간은 적용할 때만 URL에 저장하고 팀 분석 이동 링크에도 전달한다", async ({
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
  const link = page.getByRole("link", { name: "전체 4팀 보기 →", exact: true });
  await expect(link).toBeVisible();
  const target = new URL((await link.getAttribute("href"))!, page.url());
  expect(target.pathname).toBe("/teams");
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

test("관리 페이지에서는 기간·비교를 숨기고 구성원 사용량은 최근 7일을 조회한다", async ({
  page,
}) => {
  const { mockMembers } = await import("./members-fixture");
  await mockMembers(page, { invitations: [] });
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/onboarding`,
    (route) => route.fulfill({ json: completedOnboarding }),
  );
  const requests: URL[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/members/dashboard?"))
      requests.push(new URL(request.url()));
  });
  await page.goto(
    "/members?startDate=2026-01-01&endDate=2026-01-28&compare=prev_week",
  );
  await expect(
    page.getByRole("heading", { name: "구성원", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("toolbar").getByRole("combobox", { name: "비교" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("toolbar")
      .getByRole("button", { name: /^\d{4}\.\d{2}\.\d{2} ~ / }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/members" &&
      !url.searchParams.has("startDate") &&
      !url.searchParams.has("endDate") &&
      !url.searchParams.has("compare"),
  );
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0].searchParams.get("endDate")).toBe(currentDateIso());
  expect(
    (Date.parse(requests[0].searchParams.get("endDate")!) -
      Date.parse(requests[0].searchParams.get("startDate")!)) /
      86400000,
  ).toBe(6);
});

test("관리 페이지는 깨끗한 URL을 사용하고 분석 페이지로 복귀하면 마지막 조건을 복원한다", async ({
  page,
}) => {
  const { mockMembers } = await import("./members-fixture");
  const { serveSettings } = await import("./onboarding-fixture");
  await mockMembers(page, { invitations: [] });
  serveSettings(page);
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/onboarding`,
    (route) => route.fulfill({ json: completedOnboarding }),
  );
  await page.goto(
    "/overview?startDate=2026-09-01&endDate=2026-09-13&compare=none",
  );
  const nav = page.getByRole("navigation", { name: "주 내비게이션" });
  await expect(
    page.getByRole("button", { name: "2026.09.01 ~ 2026.09.13", exact: true }),
  ).toBeVisible();
  for (const [name, path] of [
    ["구성원", "/members"],
    ["운영 · 보안", "/ops"],
    ["설정", "/settings"],
  ]) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "href",
      path,
    );
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === path &&
        !url.searchParams.has("startDate") &&
        !url.searchParams.has("endDate") &&
        !url.searchParams.has("compare"),
    );
  }
  await nav.getByRole("link", { name: "팀 분석", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/teams" &&
      url.searchParams.get("startDate") === "2026-09-01" &&
      url.searchParams.get("endDate") === "2026-09-13" &&
      url.searchParams.get("compare") === "none",
  );
  await page.goBack();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/settings" && url.search === "",
  );
  await nav.getByRole("link", { name: "개요", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2026.09.01 ~ 2026.09.13", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "비교", exact: true }),
  ).toHaveValue("none");
});
