import { expect, test } from "@playwright/test";
import { mockOverview, overviewFixture, overviewUrl, corsHeaders, mockOverviewSettings } from "./overview-fixture";
import { mockSession } from "./helpers";

// 대시보드는 세션이 있어야 조회한다 — 목 세션으로 연다.
test.beforeEach(async ({ page }) => { await mockSession(page); await mockOverviewSettings(page); });

/**
 * 기본 기간은 서버가 렌더링할 때의 서울 날짜로 정해진다(`src/app/(dashboard)/layout.tsx` 의 `todayIso`) — 브라우저 시계를 고정해도 바뀌지 않는다.
 * 같은 기계에서 도는 서버이므로 지금 시각의 서울 날짜에서 기대값을 낸다: 오늘을 포함한 최근 7일.
 */
function defaultPeriod() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const dots = (value: string) => value.replaceAll("-", ".");
  return { start: day(-6), second: day(-5), end: today, label: `${dots(day(-6))} ~ ${dots(today)}`, todayLabel: `${dots(today)} ~ ${dots(today)}` };
}

test("Spring을 직접 조회하고 기간·비교 변경과 수동 새로고침을 반영한다", async ({ page }) => {
  const period = defaultPeriod();
  const requests: URL[] = [];
  await mockOverview(page);
  page.on("request", (request) => { if (request.url().includes("/analytics/overview?")) requests.push(new URL(request.url())); });
  await page.goto("/overview");
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toContainText("$5,000.00");
  expect(requests[0].origin).toBe(process.env.MOCK_DASHBOARD_API_URL ?? "http://localhost:8081");
  expect(requests[0].searchParams.get("timeZone")).toBe("Asia/Seoul");
  expect(requests[0].searchParams.get("startDate")).toBe(period.start);
  expect(requests[0].searchParams.get("endDate")).toBe(period.end);
  await page.getByRole("combobox", { name: "비교", exact: true }).selectOption("none");
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).not.toContainText("전주 대비");
  expect(requests.at(-1)!.searchParams.get("compare")).toBe("none");
  await page.getByRole("button", { name: period.label, exact: true }).click();
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("button", { name: period.todayLabel, exact: true })).toBeVisible();
  await expect.poll(() => requests.at(-1)!.searchParams.get("startDate")).toBe(period.end);
  const count = requests.length;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect.poll(() => requests.length).toBe(count + 1);
  // 공통 헤더의 CSV 는 화면과 같은 응답(같은 기간·비교)으로 파일을 만든다.
  const csvButton = page.getByRole("button", { name: "CSV", exact: true });
  await expect(csvButton).toBeEnabled();
  const download = page.waitForEvent("download");
  await csvButton.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`overview_${period.end}_${period.end}.csv`);
  const text = await (await import("node:fs/promises")).readFile((await file.path())!, "utf8");
  expect(text.startsWith("\uFEFF화면,개요\r\n")).toBe(true);
  expect(text).toContain(`기간,${period.end} ~ ${period.end} (Asia/Seoul)`);
  expect(text).toContain("\r\nsection,date,observation,equivalentCostUsd,allocatedSeatCostUsd,totalTokens,reason\r\n");
});

test("날짜 탐색·모델 선택·팀 정렬이 실제 응답을 사용한다", async ({ page }) => {
  const period = defaultPeriod();
  await mockOverview(page);
  await page.goto("/overview");
  const slider = page.getByRole("slider", { name: "날짜별 환산가치. 좌우 방향키로 날짜를 이동하세요" });
  await expect(slider).toBeVisible();
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", new RegExp(period.start));
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", new RegExp(period.second));
  const model = page.getByRole("button", { name: /Model Pro/ });
  await model.click();
  await expect(model).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "모델 구성" })).toContainText("/M");
  const table = page.getByRole("table", { name: "팀별 요약" });
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table.locator("tbody tr").first()).toContainText("플랫폼");
  await table.getByRole("button", { name: /사용 환산액/ }).click();
  await expect(table.locator("tbody tr").first()).toContainText("데이터");
  await expect(table.locator("tbody tr").last()).toContainText("미배정");
});

test("부분 관측과 알 수 없는 비용을 0으로 만들지 않는다", async ({ page }) => {
  await mockOverview(page, (data) => {
    data.meta.dataState = "partial";
    data.meta.currentCoverage.status = "partial";
    Object.assign(data.usage.current, { equivalentCostUsd: null });
    data.usage.current.tokens.total = 0;
    data.modelMix.availability = "partial";
    Object.assign(data.modelMix.models[0], { equivalentCostUsd: null });
  });
  await page.goto("/overview");
  // 선택 기간이 완전하지 않으면 비교하지 않고 그 이유를 보여 준다(0%로 그리지 않는다).
  await expect(page.getByText("선택 기간에 수집 근거가 완전하지 않은 날이 있습니다").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toContainText("-");
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toContainText("/ 0M");
  await expect(page.getByRole("region", { name: "모델 구성", exact: true }).locator("svg")).toHaveCount(0);
});

/** 갱신 토큰도 거절되는 서버 — 세션이 끝난 상황이다. */
async function rejectRefresh(page: import("@playwright/test").Page) {
  const calls = { count: 0 };
  await page.route("**/v1/auth/refresh", (route) => {
    const headers = { ...corsHeaders(page), "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    calls.count++;
    return route.fulfill({ status: 401, json: { error: "invalid_credentials", message: "사용자 인증 요청을 처리할 수 없습니다." }, headers });
  });
  return calls;
}

test("HTTP 401 에서 세션 갱신도 거절되면 세션을 지우고 대시보드 공통 로그인 안내를 보인다", async ({ page }) => {
  let calls = 0;
  await page.route(overviewUrl, async (route) => { calls++; await route.fulfill({ status: 401, json: { error: { code: "unauthenticated" } }, headers: corsHeaders(page) }); });
  const refresh = await rejectRefresh(page);
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "로그인이 필요합니다", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
  expect(refresh.count).toBe(1);
  expect(calls).toBe(1);
});

for (const status of [403, 503]) {
  test(`HTTP ${status} 오류는 목 데이터로 대체하지 않고 재시도할 수 있다`, async ({ page }) => {
    let calls = 0;
    let fail = true;
    await page.route(overviewUrl, async (route) => {
      calls++;
      await route.fulfill(fail ? { status, json: { error: { code: "test_error" } }, headers: corsHeaders(page) } : { json: overviewFixture(route.request().url()), headers: corsHeaders(page) });
    });
    await page.goto("/overview");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible({ timeout: 15_000 });
    expect(calls).toBe(status >= 500 ? 3 : 1);
    await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toContainText("$5,000.00");
  });
}

test("권한 상실 시 재조회 이전의 데이터도 숨긴다", async ({ page }) => {
  await mockOverview(page);
  await page.goto("/overview");
  const cost = page.getByRole("region", { name: "토큰 비용", exact: true });
  await expect(cost).toBeVisible();
  await page.route(overviewUrl, (route) => route.fulfill({ status: 403, json: {}, headers: corsHeaders(page) }));
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("권한이 없습니다");
  await expect(cost).toHaveCount(0);
});

test("세션이 끝나면 재조회 이전의 데이터도 숨기고 공통 로그인 안내를 보인다", async ({ page }) => {
  await mockOverview(page);
  await page.goto("/overview");
  const cost = page.getByRole("region", { name: "토큰 비용", exact: true });
  await expect(cost).toBeVisible();
  await page.route(overviewUrl, (route) => route.fulfill({ status: 401, json: {}, headers: corsHeaders(page) }));
  await rejectRefresh(page);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByRole("heading", { name: "로그인이 필요합니다", exact: true })).toBeVisible();
  await expect(cost).toHaveCount(0);
});

test("조회 중 상태와 잘못된 응답을 명확히 표시한다", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route(overviewUrl, async (route) => { await pending; await route.fulfill({ json: {}, headers: corsHeaders(page) }); });
  await page.goto("/overview");
  await expect(page.getByText("개요 데이터를 불러오는 중입니다…")).toBeVisible();
  release();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("데이터 계약과 일치하지 않습니다");
});

for (const state of ["no_data", "never_observed"]) {
  test(`${state}에서도 계약 정보는 유지하고 사용량은 비어 있음을 표시한다`, async ({ page }) => {
    await mockOverview(page, (data) => {
      data.meta.dataState = state;
      data.meta.currentCoverage = { status: "none", observedDays: 0 };
      Object.assign(data.usage, { current: null, previous: null });
      data.modelMix.models = [];
      data.teamUsage.topTeams = [];
      Object.assign(data.teamUsage.unassigned.current, { activeUsers: null, equivalentCostUsd: null });
      data.trend.points.forEach((point) => Object.assign(point, { observation: "unobserved", equivalentCostUsd: null, totalTokens: null }));
    });
    await page.goto("/overview");
    await expect(page.getByText(state === "no_data" ? "선택한 기간에 데이터가 없습니다" : "아직 수집된 신호가 없습니다")).toBeVisible();
    if (state === "never_observed") {
      // 첫 수집 안내 — 초대가 주 행동이고, 복사할 수 없는 빈 설치 명령·MDM·이미 끝낸 계약 입력을 내세우지 않는다.
      const steps = page.getByRole("list", { name: "첫 수집 단계" });
      await expect(steps).toContainText("구성원이 초대 메일의 설치 명령을 터미널에 붙여넣으면");
      await expect(page.getByRole("main")).not.toContainText(/MDM|설치 명령 ·|계약 정보 먼저 입력/);
      await expect(page.getByRole("main").getByRole("button", { name: "복사" })).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("link", { name: "구성원 초대", exact: true })).toHaveAttribute("href", "/members?invite=1");
      // 자동 갱신 기본값은 꺼짐 — 화면이 스스로 바뀐다고 약속하지 않는다.
      await expect(page.getByText(/자동 갱신이 꺼져 있습니다/)).toBeVisible();
    }
    await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "계약·좌석 현황" })).toContainText("100석");
  });
}

test("5분 자동 갱신과 작은 화면이 동작한다", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-13T12:00:00Z") });
  await mockOverview(page);
  let calls = 0;
  page.on("request", (request) => { if (request.url().includes("/analytics/overview?")) calls++; });
  await page.goto("/overview");
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /자동 갱신/ }).click();
  const before = calls;
  await page.clock.fastForward(300_001);
  await expect.poll(() => calls).toBe(before + 1);
  await page.screenshot({ path: "test-results/overview-api-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await expect(page.getByRole("navigation", { name: "주 내비게이션" })).toHaveCSS("width", "56px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/overview-api-mobile.png", fullPage: true });
});
