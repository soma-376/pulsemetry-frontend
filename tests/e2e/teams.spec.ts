import type { Page } from "@playwright/test";
import { expect, test, dashboardBase, seedOrganizations } from "./fixtures";
import {
  authenticatedRequest,
  seedPeriod,
  selectPeriod,
  signIn,
} from "./helpers";
import type { TeamsResponse, TeamUsersPage } from "../../src/lib/api/teams";
import type { Overview } from "../../src/lib/api/overview";
import { usd } from "../../src/lib/format";
import { PreparationError } from "./harness";

// 팀 분석 화면과 개요의 제품 관측을 실제 서버·시드로 본다. 기대값은 백엔드 tools/dev-seed/README.md의 A 시나리오와 대시보드 명세에서 쓴다:
// 팀 플랫폼·제품·데이터·디자인 + 미배정 사용자, member2(플랫폼 → 제품 이동)·member6이 Claude Code와 Codex를 함께 사용 — 두 도구가 섞인 팀은 플랫폼·제품이고 데이터·디자인은 한 도구,
// 설치 등록일부터 기준일 4일 전까지의 날만 완전(누적 세션·비교의 근거), 최근 28일 환산 비용은 plan의 period_known_estimated_usd.
const A = seedOrganizations[0];
const TEAMS = ["플랫폼", "제품", "데이터", "디자인"];
const MIXED = ["플랫폼", "제품"];
const CLAUDE = "Claude (Anthropic)",
  CODEX = "ChatGPT / Codex (OpenAI)";

function seedDate() {
  const value = process.env.E2E_SEED_DATE ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new PreparationError(
      ".env.local의 E2E_SEED_DATE를 현재 DB 시드의 생성 기준일로 설정하세요.",
    );
  return new Date(`${value}T00:00:00Z`);
}
const day = (offset: number) =>
  new Date(seedDate().getTime() + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
function seedCostA() {
  const value = process.env.E2E_SEED_A_PERIOD_COST_USD ?? "";
  if (!/^\d+(\.\d+)?$/.test(value))
    throw new PreparationError(
      ".env.local의 E2E_SEED_A_PERIOD_COST_USD를 백엔드 `dev-seed plan <E2E_SEED_DATE>` 출력의 A period_known_estimated_usd로 설정하세요.",
    );
  return Number(value);
}

const teamsRequest =
  (start: string, end: string, compare?: string) => (url: URL) =>
    url.pathname === `/api/v1/organizations/${A.id}/analytics/teams` &&
    url.searchParams.get("startDate") === start &&
    url.searchParams.get("endDate") === end &&
    (!compare || url.searchParams.get("compare") === compare);

/** 팀 분석을 그 기간·비교로 다시 읽고 화면이 받은 첫 페이지 응답을 돌려준다. */
async function teamsFor(
  page: Page,
  start: string,
  end: string,
  compare: "prev_period" | "prev_week",
) {
  const response = page.waitForResponse((response) =>
    teamsRequest(start, end, compare)(new URL(response.url())),
  );
  await selectPeriod(page, start, end);
  if (
    (await page
      .getByRole("combobox", { name: "비교", exact: true })
      .inputValue()) !== compare
  ) {
    await page
      .getByRole("combobox", { name: "비교", exact: true })
      .selectOption(compare);
  } else {
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
  }
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().headers().authorization).toMatch(/^Bearer /);
  return (await result.json()) as TeamsResponse;
}

const panelNames = (page: Page) =>
  page
    .getByRole("region", { name: "팀별 사용량 비교", exact: true })
    .locator('button[aria-haspopup="dialog"]')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );

test("TEAMS-A-PARTIAL @p0 @read 팀 목록·제품 비중·드로어·사용자 표가 서버 값이고, 완전하지 않은 날부터 누적 세션을 끊는다", async ({
  page,
}) => {
  const { start, end } = seedPeriod();
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/teams");
  await expect(
    page.getByRole("heading", { name: "팀 분석", exact: true }),
  ).toBeVisible();
  const body = await teamsFor(page, start, end, "prev_week");
  const panel = page.getByRole("region", {
    name: "팀별 사용량 비교",
    exact: true,
  });

  // 시드의 팀 넷과 미배정 사용자. 데모 팀(결제·모바일 등)은 없다.
  expect(body.teams.items.map((team) => team.teamName).sort()).toEqual(
    [...TEAMS].sort(),
  );
  expect(body.unassigned.current?.activeUsers).toBeGreaterThan(0);
  // 조직 활성 사용자는 팀을 옮긴 구성원을 두 번 세지 않는다(최근 28일 8명).
  expect(body.totals.current?.activeUsers).toBe(8);
  await expect
    .poll(() => panelNames(page).then((names) => [...names].sort()))
    .toEqual([...TEAMS, "미배정"].sort());
  await expect(panel).toContainText(usd(seedCostA()));
  // 기준일 전 3일이 완전하지 않아 비교하지 않는다(0%로 그리지 않는다).
  expect(body.comparison.status).toBe("unavailable");
  await expect(panel.getByRole("note")).toHaveText(
    "증감을 표시하지 않습니다 · 선택 기간에 수집 근거가 완전하지 않은 날이 있습니다",
  );

  // 누적 세션: 기준일 4일 전까지는 값, 그 뒤는 null — 서버 값이고 줄지 않는다. 화면은 끊긴 이유를 적는다.
  for (const team of [...body.teams.items, body.unassigned]) {
    const known = team.trend
      .filter((point) => point.date <= day(-4))
      .map((point) => point.cumulativeSessionCount);
    expect(
      known.every((value) => value !== null),
      team.teamName,
    ).toBe(true);
    expect(
      [...known].sort((a, b) => a! - b!),
      team.teamName,
    ).toEqual(known);
    expect(
      team.trend
        .filter((point) => point.date >= day(-3))
        .every((point) => point.cumulativeSessionCount === null),
      team.teamName,
    ).toBe(true);
  }
  await panel.getByRole("tab", { name: "세션", exact: true }).click();
  await expect(panel).toContainText(
    "누적 세션은 시작일부터 완전하게 수집된 날까지만 그립니다",
  );

  // 제품 비중: 두 도구가 섞인 팀은 조각 둘, 한 도구 팀은 한 조각(100%)이다.
  const mix = page.getByRole("region", { name: "팀별 벤더 비중", exact: true });
  await panel.getByRole("tab", { name: "비용", exact: true }).click();
  for (const name of [CLAUDE, CODEX])
    await expect(mix.getByText(name, { exact: true })).toBeVisible();
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const money = "\\$[\\d,]+\\.\\d{2}";
  const share = (team: string, name: string) =>
    `${escape(team)} · ${escape(name)} \\d+\\.\\d% · ${money}`;
  for (const team of TEAMS) {
    const bar = mix.getByRole("img", { name: new RegExp(`^${team} · `) });
    if (MIXED.includes(team))
      await expect(bar).toHaveAttribute(
        "aria-label",
        new RegExp(
          `^${escape(team)} · ${money} · ${share(team, CLAUDE)}, ${share(team, CODEX)}$`,
        ),
      );
    else
      await expect(bar).toHaveAttribute(
        "aria-label",
        new RegExp(
          `^${escape(team)} · ${money} · ${escape(team)} · (${escape(CLAUDE)}|${escape(CODEX)}) 100\\.0% · ${money}$`,
        ),
      );
  }
  const platform = body.teams.items.find((team) => team.teamName === "플랫폼")!;
  expect(platform.products.map((product) => product.kind)).toEqual([
    "claude_team",
    "openai_biz",
  ]);

  // 드로어는 그 행의 값이다(다시 조회하지 않는다).
  await panel.getByRole("button", { name: "플랫폼", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "플랫폼 팀", exact: true });
  await expect(drawer).toContainText("제품별 환산가치 비중");
  await expect(drawer).toContainText(CLAUDE);
  await expect(drawer).toContainText(CODEX);
  await page.keyboard.press("Escape");

  // 사용자 표: 같은 snapshot의 사용자 조회. 서버 순서(비용 내림차순)로 그리고, 다른 열 정렬은 모든 사용자를 모은 뒤에 한다.
  const usage = page.getByRole("region", {
    name: "사용자별 사용량",
    exact: true,
  });
  await usage.getByRole("button", { name: "플랫폼", exact: true }).click();
  await expect(
    usage.getByRole("button", { name: "플랫폼", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const usersQuery = new URLSearchParams({
    startDate: start,
    endDate: end,
    timeZone: "Asia/Seoul",
    snapshotId: body.meta.snapshotId,
    limit: "100",
  });
  const users = (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/analytics/teams/${platform.teamId}/users?${usersQuery}`,
    )
  ).body as TeamUsersPage;
  expect(users.users.nextCursor).toBeNull();
  const accounts = () => usage.locator("span.font-mono").allTextContents();
  await expect
    .poll(accounts)
    .toEqual(users.users.items.map((user) => user.account));
  await expect(usage).toContainText(`${users.users.totalCount}명 합계`);
  await usage.getByRole("button", { name: "세션 정렬", exact: true }).click();
  const bySessions = [...users.users.items].sort(
    (a, b) =>
      (b.usage.sessionCount ?? -1) - (a.usage.sessionCount ?? -1) ||
      a.account.localeCompare(b.account, "ko", { numeric: true }),
  );
  await expect.poll(accounts).toEqual(bySessions.map((user) => user.account));

  // cursor: 한 명씩 읽어도 같은 snapshot의 같은 사용자 집합이다(중복·누락 없음).
  const pages: string[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({
      startDate: start,
      endDate: end,
      timeZone: "Asia/Seoul",
      snapshotId: body.meta.snapshotId,
      limit: "1",
      ...(cursor ? { cursor } : {}),
    });
    const next = await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/analytics/teams/${platform.teamId}/users?${query}`,
    );
    expect(next.status).toBe(200);
    expect(next.body.meta.snapshotId).toBe(body.meta.snapshotId);
    pages.push(
      ...next.body.users.items.map((user: { account: string }) => user.account),
    );
    cursor = next.body.users.nextCursor;
  } while (cursor);
  expect(pages).toEqual(users.users.items.map((user) => user.account));

  // member2는 기간 중에 플랫폼 → 제품으로 옮겼다 — 이동 전·후 사용이 각 팀의 사용자로 나온다. 미배정 사용자는 member9다.
  const product = body.teams.items.find((team) => team.teamName === "제품")!;
  const accountsOf = async (teamId: string) => {
    const query = new URLSearchParams({
      startDate: start,
      endDate: end,
      timeZone: "Asia/Seoul",
      snapshotId: body.meta.snapshotId,
      limit: "100",
    });
    return (
      (
        await authenticatedRequest(
          page,
          dashboardBase(),
          `/api/v1/organizations/${A.id}/analytics/teams/${teamId}/users?${query}`,
        )
      ).body as TeamUsersPage
    ).users.items.map((user) => user.account);
  };
  expect(await accountsOf(platform.teamId!)).toContain(
    "member2@seed-a.example.test",
  );
  expect(await accountsOf(product.teamId!)).toContain(
    "member2@seed-a.example.test",
  );
  await usage.getByRole("button", { name: "미배정", exact: true }).click();
  await expect.poll(accounts).toEqual(["member9@seed-a.example.test"]);
});

test("TEAMS-A-COMPLETE @p0 @read 완전한 두 기간이면 증감과 끊기지 않은 누적 세션을 그리고, 직접 링크는 그 팀의 드로어를 연다", async ({
  page,
}) => {
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/teams");
  const body = await teamsFor(page, day(-21), day(-8), "prev_period");
  const panel = page.getByRole("region", {
    name: "팀별 사용량 비교",
    exact: true,
  });
  expect(body.comparison.status).toBe("available");
  await expect(panel.getByRole("note")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "이전 기간 대비 정렬", exact: true }),
  ).toBeEnabled();
  // 마지막 날의 누적 세션 = 그 팀의 기간 세션 수(명세 "팀 누적 세션").
  for (const team of body.teams.items) {
    expect(
      team.trend.every((point) => point.cumulativeSessionCount !== null),
      team.teamName,
    ).toBe(true);
    expect(team.trend.at(-1)!.cumulativeSessionCount, team.teamName).toBe(
      team.current!.sessionCount,
    );
  }
  await panel.getByRole("tab", { name: "세션", exact: true }).click();
  await expect(panel).not.toContainText("누적 세션은 시작일부터");
  // 증감 열은 비율·신규·변화 없음 중 하나다("-"가 아니다).
  const deltas = await panel
    .locator('button[aria-haspopup="dialog"]')
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.parentElement!.querySelectorAll(":scope > span")[3]
            ?.textContent,
      ),
    );
  expect(
    deltas.every((text) => /^([+−]\d+\.\d%|신규|변화 없음)$/.test(text ?? "")),
    JSON.stringify(deltas),
  ).toBe(true);

  // 개요 표의 팀 링크처럼 직접 연 팀은 드로어가 열린다.
  const design = body.teams.items.find((team) => team.teamName === "디자인")!;
  await page.goto(`/teams?team=${encodeURIComponent(design.teamId!)}`);
  await expect(
    page.getByRole("dialog", { name: "디자인 팀", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "디자인 팀", exact: true }),
  ).not.toBeVisible();
});

test("OVERVIEW-PRODUCTS @p0 @read 개요의 벤더 관측 인원·팀별 사용 벤더와 설정의 관측 지표가 서버의 제품별 관측이다", async ({
  page,
}) => {
  const { start, end } = seedPeriod();
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/overview");
  await expect(
    page.getByRole("region", { name: "사용 관측 인원", exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1/organizations/${A.id}/analytics/overview` &&
      url.searchParams.get("startDate") === start &&
      url.searchParams.get("endDate") === end
    );
  });
  await selectPeriod(page, start, end);
  const overview = (await (await response).json()) as Overview;
  // 매핑된 두 도구가 관측됐다. 관측 인원은 좌석 수가 아니다.
  expect(overview.productUsage.products.map((product) => product.kind)).toEqual(
    ["claude_team", "openai_biz"],
  );
  const settings = await authenticatedRequest(
    page,
    dashboardBase(),
    `/api/v1/organizations/${A.id}/settings`,
  );
  const vendors = settings.body.vendors.items as {
    kind: string;
    displayName: string;
  }[];
  const table = page.getByRole("table", { name: "계약·좌석 현황" });
  for (const vendor of vendors) {
    const cell = table
      .getByRole("row")
      .filter({
        has: page.getByRole("button", {
          name: `${vendor.displayName} 벤더 상세`,
          exact: true,
        }),
      })
      .getByRole("cell")
      .nth(2);
    const product = overview.productUsage.products.find(
      (item) => item.kind === vendor.kind,
    );
    // Copilot·Cursor는 수집 도구가 아니라 관측이 없다 — "미관측"이고 추측한 값이 아니다.
    await expect(cell).toHaveText(
      product ? `${product.activeUsers}명` : "미관측",
    );
  }
  const summary = page.getByRole("table", { name: "팀별 요약" });
  for (const team of overview.teamUsage.topTeams) {
    const cell = summary
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", { name: team.teamName, exact: true }),
      })
      .getByRole("cell")
      .nth(1);
    await expect(cell).toHaveText(
      MIXED.includes(team.teamName)
        ? `${CLAUDE} · ${CODEX}`
        : /^(Claude \(Anthropic\)|ChatGPT \/ Codex \(OpenAI\))$/,
    );
  }

  // 설정의 등록 제품 관측 지표(기준일 전날까지 7·30일)도 서버 값 그대로다. 관측 제품이 매핑되는 제품만 값이 생긴다.
  await page.goto("/settings");
  const observed = (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/settings`,
    )
  ).body.vendors.items as {
    kind: string;
    displayName: string;
    observation: string;
    activeUsers7d: number | null;
    activeUsers30d: number | null;
  }[];
  expect(
    observed
      .filter((vendor) => vendor.observation !== "unobserved")
      .map((vendor) => vendor.kind)
      .sort(),
  ).toEqual(["claude_team", "openai_biz"]);
  for (const vendor of observed.filter((item) =>
    ["claude_team", "cursor"].includes(item.kind),
  )) {
    await page
      .getByRole("button", {
        name: `${vendor.displayName} 계약 설정 열기`,
        exact: true,
      })
      .click();
    const drawer = page.getByRole("dialog", {
      name: `${vendor.displayName} 계약 설정`,
      exact: true,
    });
    const text = (value: number | null) =>
      value === null ? "-" : `${value}명`;
    await expect(drawer).toContainText(
      `활성 사용자 (7일)${text(vendor.activeUsers7d)}`,
    );
    await expect(drawer).toContainText(
      `30일 누적 사용자${text(vendor.activeUsers30d)}`,
    );
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
  }
});
