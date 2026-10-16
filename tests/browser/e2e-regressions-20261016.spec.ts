import { expect, authenticatedTest as test } from "./fixtures";
import { mockOverview, mockIngestStatus } from "./overview-fixture";
import { mockTeams } from "./teams-fixture";
import { fixtureTeams, mockMembers } from "./members-fixture";
import { completedOnboarding, fixtureOrg } from "./session-fixture";

// 이 파일의 API는 브라우저 상태 회귀용 fixture다. 실제 수집 경로 검증은 별도 E2E 증거에 기록한다.
test("확인할 수 없는 총 토큰은 확정된 토큰 단위·설명을 표시하지 않는다", async ({
  page,
}) => {
  await mockOverview(page, (data) => {
    data.summary!.totalTokens = {
      value: null,
      status: "unavailable",
      reasons: ["token_semantics_incompatible"],
      comparison: {
        status: "unavailable",
        reasons: ["token_semantics_incompatible"],
        previousValue: null,
        absoluteChange: null,
        percentChange: null,
        change: null,
      },
    };
  });
  await page.goto("/overview");
  const tokens = page.getByRole("region", { name: "총 토큰 수", exact: true });
  await expect(tokens).toContainText("전체 토큰 수를 확인할 수 없습니다");
  await expect(tokens.getByText("토큰", { exact: true })).toHaveCount(0);
  await expect(tokens).toContainText("값 확인 불가");
  await expect(tokens.getByText("비교 불가", { exact: true })).toHaveCount(0);
});

test("비중을 확인할 수 없는 모델을 선택해도 확인 가능하다는 안내를 하지 않는다", async ({
  page,
}) => {
  await mockOverview(page, (data) => {
    for (const model of data.modelMix!.models)
      model.costShare = {
        value: null,
        status: "unavailable",
        reasons: ["pricing_missing"],
      };
  });
  await page.goto("/overview");
  const mix = page.getByRole("region", {
    name: "모델별 사용 환산액 비중",
    exact: true,
  });
  await expect(mix).toContainText("사용 환산액 비중을 확인할 수 없습니다");
  await expect(mix).toContainText("모델별 사용 정보만 확인할 수 있습니다");
  await expect(mix).not.toContainText(
    "모델을 선택하면 사용 환산액 비중을 확인할 수 있습니다",
  );
  const option = mix.getByRole("button").first();
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expect(mix).toContainText("모델별 사용 정보만 확인할 수 있습니다");
  await mix.getByRole("button", { name: "선택 해제", exact: true }).click();
  await expect(option).toHaveAttribute("aria-pressed", "false");
});

test("좁은 창 첫 진입과 새로고침은 내비게이션을 직접 접지 않아도 기간을 읽고 조작할 수 있다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOverview(page);
  await page.goto(
    "/overview?startDate=2026-09-07&endDate=2026-09-13&compare=none",
  );
  const nav = page.getByRole("navigation", { name: "주 내비게이션" });
  const toggle = nav.getByRole("button", { name: "내비게이션 접기/펼치기" });
  const dates = page.getByRole("button", { name: "2026.09.07 ~ 2026.09.13" });
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(
      page.getByRole("region", { name: "총 토큰 수", exact: true }),
    ).toBeVisible();
    await expect(nav).toHaveCSS("width", "56px");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(dates).toBeVisible();
    const bounds = (await dates.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(56);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await dates.click();
    const calendar = page.getByRole("dialog", { name: "기간 선택" });
    await expect(calendar).toBeVisible();
    const calendarBounds = (await calendar.boundingBox())!;
    expect(calendarBounds.x).toBeGreaterThanOrEqual(56);
    expect(calendarBounds.x + calendarBounds.width).toBeLessThanOrEqual(390);
    expect(
      await calendar.evaluate((node) => node.scrollWidth),
    ).toBeLessThanOrEqual(Math.ceil(calendarBounds.width));
    await page.keyboard.press("Escape");
    if (attempt === 0) await page.reload();
  }
  const main = page.getByRole("main");
  const compactBounds = (await main.boundingBox())!;
  await toggle.click();
  await expect(nav).toHaveCSS("width", "240px");
  await expect
    .poll(async () => (await main.boundingBox())!.x)
    .toBe(compactBounds.x);
  await expect
    .poll(async () => (await main.boundingBox())!.width)
    .toBe(compactBounds.width);
  expect(
    await main.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  await toggle.click();
  await expect(nav).toHaveCSS("width", "56px");
});

test("선택하지 않은 내비게이션은 창 크기에 맞춰 기존 펼침·접힘 배치를 사용한다", async ({
  page,
}) => {
  await mockOverview(page);
  await page.goto("/overview");
  const nav = page.getByRole("navigation", { name: "주 내비게이션" });
  await expect(nav).toHaveCSS("width", "240px");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav).toHaveCSS("width", "56px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(nav).toHaveCSS("width", "240px");
  expect((await page.getByRole("main").boundingBox())!.x).toBe(240);
});

test("팀 직접 링크를 닫으면 team만 제거되어 새로고침 뒤 상세가 다시 열리지 않는다", async ({
  page,
}) => {
  await mockTeams(page);
  await mockIngestStatus(page);
  await page.goto(
    "/teams?team=team_platform&startDate=2026-09-07&endDate=2026-09-13&compare=none&keep=value#users",
  );
  const drawer = page.getByRole("dialog", { name: "플랫폼 팀", exact: true });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL((url) => {
    return (
      !url.searchParams.has("team") &&
      url.searchParams.get("startDate") === "2026-09-07" &&
      url.searchParams.get("endDate") === "2026-09-13" &&
      url.searchParams.get("compare") === "none" &&
      url.searchParams.get("keep") === "value" &&
      url.hash === "#users"
    );
  });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "팀별 사용량 비교" }),
  ).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page
    .getByRole("region", { name: "팀별 사용량 비교" })
    .getByRole("button", { name: "플랫폼", exact: true })
    .click();
  await expect(drawer).toBeVisible();
});

test("구성원 자동 갱신은 열린 상세와 아직 저장하지 않은 팀 선택을 보존한다", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-16T02:00:00Z") });
  const state = await mockMembers(page, { invitations: [] });
  await mockIngestStatus(page);
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/onboarding`,
    (route) => route.fulfill({ json: completedOnboarding }),
  );
  let refreshes = 0;
  page.on("request", (request) => {
    if (request.url().includes("/members/dashboard?")) refreshes++;
  });
  await page.goto("/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  await expect(list).toBeVisible();
  await page.getByRole("button", { name: /자동 갱신/ }).click();
  await list
    .getByRole("button", { name: /구성원 상세$/ })
    .first()
    .click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  const selectedTeam = drawer.getByRole("combobox", {
    name: "팀",
    exact: true,
  });
  const before = await selectedTeam.inputValue();
  const next = fixtureTeams.find((team) => team.teamId !== before)!.teamId;
  await selectedTeam.selectOption(next);
  const count = refreshes;
  await page.clock.fastForward(300_001);
  await expect.poll(() => refreshes).toBeGreaterThan(count);
  await expect(drawer).toBeVisible();
  await expect(selectedTeam).toHaveValue(next);
  expect(state.commands).toHaveLength(0);
});

test("좁은 팀 화면은 표를 가로로 읽고 추이 양끝 날짜를 겹침 없이 확인할 수 있다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTeams(page);
  await mockIngestStatus(page);
  await page.goto(
    "/teams?startDate=2026-09-07&endDate=2026-09-13&compare=none",
  );
  const panel = page.getByRole("region", {
    name: "팀별 사용량 비교",
    exact: true,
  });
  const table = panel.getByRole("region", {
    name: "팀별 지표 표",
    exact: true,
  });
  await expect(table).toBeVisible();
  expect(
    await panel.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    await table.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeGreaterThan(100);
  await expect(panel.getByText("9/7", { exact: true })).toBeVisible();
  await expect(panel.getByText("9/13", { exact: true })).toBeVisible();
  await expect(panel.getByText("9/10", { exact: true })).toBeHidden();
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  const sort = table.getByRole("button", {
    name: "사용자당 정렬",
    exact: true,
  });
  await sort.click();
  await expect(sort).toHaveAccessibleDescription(/내림차순 정렬 중/);
});

test("전체 사용자를 모아 정렬하는 동안 빈 임시 목록을 0명·0달러 합계로 표시하지 않는다", async ({
  page,
}) => {
  await mockTeams(page);
  await mockIngestStatus(page);
  let release = () => {};
  const nextPage = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname.endsWith("/users") && url.searchParams.has("cursor"),
    async (route) => {
      await nextPage;
      await route.fallback();
    },
  );
  await page.goto(
    "/teams?startDate=2026-09-07&endDate=2026-09-13&compare=none",
  );
  const users = page.getByRole("region", {
    name: "사용자별 사용량",
    exact: true,
  });
  await expect(users).toContainText("12명 합계");
  try {
    await users.getByRole("button", { name: "계정 정렬", exact: true }).click();
    await expect(users).toContainText("전체 30명을 모아 정렬하는 중입니다");
    await expect(users).not.toContainText("0명 합계");
    await expect(users.getByRole("button", { name: /더보기/ })).toBeDisabled();
  } finally {
    release();
  }
  await expect(users).not.toContainText("모아 정렬하는 중입니다");
  await expect(users).toContainText("12명 합계");
  await expect(
    users.getByRole("button", { name: "계정 정렬", exact: true }),
  ).toHaveAccessibleDescription(/오름차순 정렬 중/);
});
