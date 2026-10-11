import { expect, test, type Locator } from "./fixtures";
import { openDashboard } from "./helpers";
import { fixtureMembers, mockMembers } from "./members-fixture";
import { presentTeams } from "../../src/lib/metrics/teams-presentation";
import type { TeamsView } from "../../src/lib/api/teams";
import { testOrganizationId } from "./overview-fixture";
import { fixtureTeamUsers, teamsFixture } from "./teams-fixture";
import { usd } from "../../src/lib/format";

const collator = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});
const memberAccounts = (region: Locator) =>
  region
    .getByRole("button", { name: /구성원 상세$/ })
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        button.getAttribute("aria-label")!.replace(" 구성원 상세", ""),
      ),
    );

test("members sort the whole roster, keep sorting through more and put missing values last", async ({
  page,
}) => {
  const roster = fixtureMembers();
  await mockMembers(page, { members: roster });
  await openDashboard(page, "/members");
  const members = page.getByRole("region", {
    name: "구성원 목록",
    exact: true,
  });
  await expect(members).toBeVisible();
  // 서버의 첫 페이지는 20명이지만 정렬은 45명 전체에 적용한다.
  const alphabetical = roster.map((row) => row.account).sort(collator.compare);
  expect(await memberAccounts(members)).toEqual(alphabetical.slice(0, 20));
  await members
    .getByRole("button", { name: "사용자 정렬", exact: true })
    .click();
  expect(await memberAccounts(members)).toEqual(
    [...alphabetical].reverse().slice(0, 20),
  );
  await members
    .getByRole("button", { name: "다음 20명 더보기", exact: true })
    .click();
  expect(await memberAccounts(members)).toEqual(
    [...alphabetical].reverse().slice(0, 40),
  );
  const cost = members.getByRole("button", {
    name: "사용 환산액 정렬",
    exact: true,
  });
  await cost.click();
  await expect(cost).toHaveAccessibleDescription(/^내림차순 정렬 중/);
  const value = (row: (typeof roster)[number]) =>
    row.periodUsage ? Number(row.periodUsage.equivalentCostUsd) : null;
  const byCost = (direction: 1 | -1) =>
    [...roster].sort((a, b) => {
      const left = value(a),
        right = value(b);
      if ((left === null) !== (right === null)) return left === null ? 1 : -1;
      return (
        (left === null ? 0 : direction * (left - right!)) ||
        collator.compare(a.account, b.account)
      );
    });
  expect(await memberAccounts(members)).toEqual(
    byCost(-1)
      .slice(0, 40)
      .map((row) => row.account),
  );
  const search = members.getByRole("textbox", { name: "구성원 검색" });
  await search.fill("플랫폼");
  await search.press("Enter");
  expect(await memberAccounts(members)).toEqual(
    byCost(-1)
      .filter((row) => row.team.teamName === "플랫폼")
      .map((row) => row.account),
  );
  await search.fill("@codeworks.io");
  await search.press("Enter");
  // 검색 중에는 전부 보여 준다. 비용이 없는 구성원은 양방향 모두 마지막이다.
  const missing = roster.filter((row) => value(row) === null).length;
  expect(missing).toBeGreaterThan(0);
  expect(await memberAccounts(members)).toEqual(
    byCost(-1).map((row) => row.account),
  );
  await cost.click();
  await expect(cost).toHaveAccessibleDescription(/^오름차순 정렬 중/);
  expect(await memberAccounts(members)).toEqual(
    byCost(1).map((row) => row.account),
  );
  expect((await memberAccounts(members)).slice(-missing).sort()).toEqual(
    roster
      .filter((row) => value(row) === null)
      .map((row) => row.account)
      .sort(),
  );
  const activity = members.getByRole("button", {
    name: "최근 관측 정렬",
    exact: true,
  });
  await activity.click();
  const latest = [...roster].sort((a, b) => {
    if ((a.lastUsedAt === null) !== (b.lastUsedAt === null))
      return a.lastUsedAt === null ? 1 : -1;
    return (
      (a.lastUsedAt === null
        ? 0
        : Date.parse(b.lastUsedAt!) - Date.parse(a.lastUsedAt)) ||
      collator.compare(a.account, b.account)
    );
  });
  expect(await memberAccounts(members)).toEqual(
    latest.map((row) => row.account),
  );
  await members.screenshot({ path: "test-results/member-sorting.png" });
});

/** 화면이 받은 것과 같은 fixture 응답을 표시 모델로 바꾼다(서버가 준 값에서 기대값을 만든다). */
const teamsModel = (compare = "prev_week") => {
  const data = teamsFixture(
    new URL(
      `http://fixture/api/v1/organizations/${testOrganizationId}/analytics/teams?startDate=2026-09-07&endDate=2026-09-13&compare=${compare}`,
    ),
  );
  return presentTeams({
    ...data,
    teams: data.teams.items,
  } as unknown as TeamsView);
};

test("team comparison sorts numbers, keeps chart selections and resets on axis changes", async ({
  page,
}) => {
  await openDashboard(page, "/teams");
  const panel = page.getByRole("region", {
    name: "팀별 사용량 비교",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const names = () =>
    panel
      .locator('button[aria-haspopup="dialog"]')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label")),
      );
  const model = teamsModel();
  const by = (
    axis: "cost" | "token" | "session",
    key: "totalValue" | "perUserValue" | "unitValue" | "deltaValue",
    direction = -1,
  ) =>
    [...model.axes[axis].rows]
      .sort(
        (a, b) =>
          direction * (a[key]! - b[key]!) || collator.compare(a.team, b.team),
      )
      .map((row) => row.team);
  await expect.poll(names).toEqual(by("cost", "totalValue"));
  await panel.getByRole("checkbox", { name: "플랫폼 추이 선 표시" }).uncheck();
  for (const [label, key] of [
    ["사용자당", "perUserValue"],
    ["세션당", "unitValue"],
    ["전주 대비", "deltaValue"],
  ] as const) {
    const header = panel.getByRole("button", {
      name: `${label} 정렬`,
      exact: true,
    });
    await header.click();
    expect(await names()).toEqual(by("cost", key));
    await header.click();
    expect(await names()).toEqual(by("cost", key, 1));
  }
  await expect(
    panel.getByRole("checkbox", { name: "플랫폼 추이 선 표시" }),
  ).not.toBeChecked();
  await panel.getByRole("button", { name: "팀 정렬", exact: true }).click();
  expect(await names()).toEqual(
    model.axes.cost.rows.map((row) => row.team).sort(collator.compare),
  );
  await panel.getByRole("button", { name: "플랫폼", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "플랫폼 팀", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "플랫폼 팀", exact: true }),
  ).not.toBeVisible();
  for (const [label, axis] of [
    ["토큰", "token"],
    ["세션", "session"],
  ] as const) {
    await panel.getByRole("tab", { name: label, exact: true }).click();
    expect(await names()).toEqual(by(axis, "totalValue"));
  }
  await panel
    .getByRole("button", { name: "전주 대비 정렬", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "비교", exact: true })
    .selectOption("none");
  await expect(
    panel.getByRole("button", { name: "증감 정렬", exact: true }),
  ).toBeDisabled();
  expect(await names()).toEqual(by("session", "totalValue"));
  await panel.screenshot({ path: "test-results/team-sorting.png" });
});

test("user usage sorts before pagination and totals the actual visible rows", async ({
  page,
}) => {
  await openDashboard(page, "/teams");
  const usage = page.getByRole("region", {
    name: "사용자별 사용량",
    exact: true,
  });
  await expect(usage).toBeVisible();
  const accounts = () =>
    usage
      .locator("span")
      .filter({ hasText: /^[\w.]+@codeworks\.io$/ })
      .allTextContents();
  // 서버가 비용 내림차순으로 12명씩 준다. 다른 열 정렬은 30명 전체를 모은 뒤에 한다.
  const users = fixtureTeamUsers("platform", 30);
  const cost = (row: (typeof users)[number]) =>
    Number(row.usage.equivalentCostUsd);
  const values = {
    sessionCount: (row: (typeof users)[number]) => row.usage.sessionCount,
    tokenValue: (row: (typeof users)[number]) => row.usage.tokens.total,
    cacheValue: (row: (typeof users)[number]) => row.cache.hitRatio,
    lastValue: (row: (typeof users)[number]) => Date.parse(row.lastUsedAt),
  };
  const by = (key: keyof typeof values) =>
    [...users].sort(
      (a, b) =>
        values[key](b) - values[key](a) ||
        collator.compare(a.account, b.account),
    );
  const initial = users.slice(0, 12);
  await expect.poll(accounts).toEqual(initial.map((row) => row.account));
  await expect(usage).toContainText(
    `${initial.length}명 합계 ${usd(initial.reduce((sum, row) => sum + cost(row), 0))}`,
  );
  await usage.getByRole("button", { name: /다음 \d+명 더보기/ }).click();
  await expect
    .poll(accounts)
    .toEqual(users.slice(0, 24).map((row) => row.account));
  const count = 24;
  for (const [label, key] of [
    ["세션", "sessionCount"],
    ["총 토큰", "tokenValue"],
    ["캐시 적중", "cacheValue"],
    ["마지막 사용", "lastValue"],
  ] as const) {
    const header = usage.getByRole("button", {
      name: `${label} 정렬`,
      exact: true,
    });
    await header.click();
    await expect.poll(accounts).toEqual(
      by(key)
        .slice(0, count)
        .map((row) => row.account),
    );
  }
  await usage.getByRole("button", { name: "계정 정렬", exact: true }).click();
  const alphabetical = [...users]
    .sort((a, b) => collator.compare(a.account, b.account))
    .slice(0, count);
  expect(await accounts()).toEqual(alphabetical.map((row) => row.account));
  await expect(usage).toContainText(
    `${count}명 합계 ${usd(alphabetical.reduce((sum, row) => sum + cost(row), 0))}`,
  );
  await usage.getByRole("button", { name: /다음 \d+명 더보기/ }).click();
  expect(await accounts()).toEqual(
    [...users]
      .sort((a, b) => collator.compare(a.account, b.account))
      .map((row) => row.account),
  );
  await expect(usage.getByRole("button", { name: /더보기/ })).toHaveCount(0);
  await usage.screenshot({ path: "test-results/user-sorting.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await usage
    .getByRole("button", { name: "환산 금액 정렬", exact: true })
    .click();
  await expect(
    usage.getByRole("button", { name: "환산 금액 정렬", exact: true }),
  ).toHaveAccessibleDescription(/^내림차순 정렬 중/);
  await usage.screenshot({ path: "test-results/user-sorting-mobile.png" });
});
