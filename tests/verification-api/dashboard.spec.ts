import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  completedOnboarding,
  fixtureUser,
  issueFixtureCookie,
} from "../browser/session-fixture";
import { overviewSchema } from "../../src/lib/api/overview";
import { teamsResponseSchema } from "../../src/lib/api/teams";

type Scenario = {
  organizationId: string;
  organizationName: string;
  memberId: string;
  teamId: string;
  authorization: string;
  equivalentCostUsd: string;
  totalTokens: number;
  sessions: number;
  sessionSortUserIds: string[];
  unassignedCostUsd: string | null;
  unassignedTokens: number;
};
type Harness = {
  baseURL: string;
  startDate: string;
  endDate: string;
  today: string;
  futureDate: string;
  scenarios: Record<"main" | "zeroUsage" | "unpricedUsage", Scenario>;
};
const mode = process.env.VERIFICATION_TREND_MODE ?? "auto";
const report = path.resolve(
  process.env.VERIFICATION_REPORT_DIR ?? "../reports/proj318-e2e-20261104",
);
async function loadHarness(): Promise<Harness> {
  const h = JSON.parse(
    await readFile(
      process.env.VERIFICATION_API_CONFIG ??
        "/tmp/proj318-verification-api.json",
      "utf8",
    ),
  ) as Harness;
  if (!["localhost", "127.0.0.1"].includes(new URL(h.baseURL).hostname))
    throw Error("격리 로컬 API만 검증합니다");
  return h;
}

/** 분석·조회 응답은 실제 HTTP로 전달한다. 세션/온보딩만 fixture다. */
async function connect(
  page: Page,
  h: Harness,
  s: Scenario,
  expiry?: { snapshotId: string | null },
) {
  const requests: { path: string; status: number }[] = [];
  await issueFixtureCookie(page, { origin: "http://localhost:3198" });
  await page.route("**/api/bff/auth/session", (route) =>
    route.fulfill({
      json: {
        user: {
          ...fixtureUser,
          organizationId: s.organizationId,
          organizationName: s.organizationName,
          memberId: s.memberId,
        },
      },
    }),
  );
  await page.route(
    `**/api/v1/organizations/${s.organizationId}/onboarding`,
    (r) =>
      r.fulfill({
        json: { ...completedOnboarding, organizationId: s.organizationId },
      }),
  );
  await page.route("**/api/bff/dashboard/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint =
      url.pathname.replace(/^\/api\/bff\/dashboard/, "") + url.search;
    expect(route.request().method()).toBe("GET");
    const response = await page.request.get(
      new URL(endpoint, h.baseURL).toString(),
      {
        headers: { Authorization: s.authorization },
      },
    );
    requests.push({ path: endpoint, status: response.status() });
    if (
      response.status() === 409 &&
      url.searchParams.get("snapshotId") === expiry?.snapshotId
    ) {
      expect((await response.json()).error.code).toBe("snapshot_expired");
    } else expect(response.status(), endpoint).toBe(200);
    await route.fulfill({
      status: response.status(),
      contentType: "application/json",
      body: await response.body(),
    });
  });
  return requests;
}

function recorder(page: Page, width: number, group: string) {
  const entries: object[] = [];
  return async (
    slug: string,
    title: string,
    feature: string,
    target?: Locator,
  ) => {
    if (target) {
      await expect(target).toBeVisible();
      await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
    } else await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    const file = `screenshots/real-${mode}-${width}-${slug}.png`;
    await mkdir(path.join(report, "screenshots"), { recursive: true });
    await page.screenshot({
      path: path.join(report, file),
      animations: "disabled",
    });
    entries.push({
      id: `real-${mode}-${width}-${slug}`,
      title,
      file,
      feature,
      mode,
      viewport: { width, height: 1100 },
      source: "real-api",
      checks: [
        "실제 Spring API · PostgreSQL · ClickHouse 응답",
        "화면 핵심 값과 동작 단언 후 촬영",
      ],
    });
    await writeFile(
      path.join(report, `actual-${mode}-${width}-${group}.json`),
      JSON.stringify({ source: "real-api", entries }, null, 2),
    );
  };
}
async function csv(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await pending;
  await mkdir(path.join(report, "downloads"), { recursive: true });
  const output = path.join(report, "downloads", name);
  await download.saveAs(output);
  return readFile(output, "utf8");
}
function expectSnapshotCsv(content: string, snapshotId: string | undefined) {
  if (!snapshotId) throw Error("실제 API 응답의 snapshotId가 필요합니다");
  // URL-safe 무작위 ID가 '-'로 시작하면 기존 CSV 수식 방어가 작은따옴표를 붙인다.
  const encoded = `${/^[=+\-@]/.test(snapshotId) ? "'" : ""}${snapshotId}`;
  expect(
    content.split(/\r?\n/).find((line) => line.startsWith("snapshot,")),
  ).toBe(`snapshot,${encoded}`);
}
const range = (h: Harness) =>
  `startDate=${h.startDate}&endDate=${h.endDate}&compare=none`;

for (const width of [1440, 390]) {
  if (width === 1440)
    test(`${mode} 실제 snapshot 만료는 409 후 새 목록·사용자·CSV로 복구한다`, async ({
      page,
    }) => {
      const h = await loadHarness();
      const s = h.scenarios.main;
      const expiry = { snapshotId: null as string | null };
      const requests = await connect(page, h, s, expiry);
      const firstResponse = page.waitForResponse((r) =>
        /\/analytics\/teams\?/.test(r.url()),
      );
      await page.goto(`/teams?${range(h)}`);
      const first = teamsResponseSchema.parse(
        await (await firstResponse).json(),
      );
      const users = page.getByRole("region", { name: "사용자별 사용량" });
      await users
        .getByRole("button", { name: "플랫폼팀", exact: true })
        .click();
      await expect(users).toContainText("alice@example.test");
      const pg = JSON.parse(
        await readFile(
          process.env.VERIFICATION_POSTGRES_CONFIG ??
            "/tmp/proj318-verification-postgres-private.json",
          "utf8",
        ),
      ) as {
        organizationId: string;
        verifiedTenantName: string;
        dockerImage: string;
        dockerExecPsqlPrefix: string[];
      };
      expect(pg.organizationId).toBe(s.organizationId);
      expect(pg.verifiedTenantName).toBe("Pulsemetry 실 API 검증");
      expect(pg.dockerImage).toMatch(/^postgres:/);
      expect(pg.dockerExecPsqlPrefix[0]).toBe("docker");
      expect(s.organizationId).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(first.meta.snapshotId).toMatch(/^[a-zA-Z0-9_-]+$/);
      expiry.snapshotId = first.meta.snapshotId;
      // 하네스가 만든 정확한 컨테이너·조직·snapshot 한 건만 만료한다. 원천 데이터는 변경하지 않는다.
      const sql = `UPDATE dashboard_cache.snapshots SET expires_at=ready_at + interval '1 microsecond' WHERE tenant_id='${s.organizationId}'::uuid AND snapshot_id='${first.meta.snapshotId}' AND status='ready' RETURNING snapshot_id;`;
      const result = await promisify(execFile)(pg.dockerExecPsqlPrefix[0], [
        ...pg.dockerExecPsqlPrefix.slice(1),
        "-c",
        sql,
      ]);
      expect(result.stdout).toContain(first.meta.snapshotId);
      const recoveryResponse = page.waitForResponse(
        (r) => /\/analytics\/teams\?/.test(r.url()) && r.status() === 200,
      );
      await users
        .getByRole("button", { name: "세션 정렬", exact: true })
        .click();
      const recovered = teamsResponseSchema.parse(
        await (await recoveryResponse).json(),
      );
      expect(recovered.meta.snapshotId).not.toBe(first.meta.snapshotId);
      await expect(users).toContainText("alice@example.test");
      await expect
        .poll(() =>
          requests.some(
            (r) => r.status === 409 && r.path.includes(first.meta.snapshotId),
          ),
        )
        .toBe(true);
      await expect
        .poll(() =>
          requests.some(
            (r) =>
              r.status === 200 &&
              r.path.includes("/users?") &&
              r.path.includes(recovered.meta.snapshotId) &&
              r.path.includes("sort=session"),
          ),
        )
        .toBe(true);
      const content = await csv(page, `${mode}-snapshot-recovered.csv`);
      expectSnapshotCsv(content, recovered.meta.snapshotId);
      expect(content).not.toContain(first.meta.snapshotId);
      await recorder(page, width, "recovery")(
        "snapshot-recovered",
        "실제 snapshot 만료: 자동 재조회·세션 정렬·CSV 복구",
        "PROJ-317",
        users,
      );
      await writeFile(
        path.join(report, `requests-${mode}-recovery.json`),
        JSON.stringify(requests, null, 2),
      );
    });
  test(`${mode} ${width}px 실제 분석·팀·CSV·세션 보존`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    const h = await loadHarness();
    const s = h.scenarios.main;
    const requests = await connect(page, h, s);
    const capture = recorder(page, width, "main");
    const response = page.waitForResponse((r) =>
      r.url().includes("/analytics/overview?"),
    );
    await page.goto(`/overview?${range(h)}`);
    const data = overviewSchema.parse(await (await response).json());
    expect(data.summary!.equivalentCostUsd.value).toBe(s.equivalentCostUsd);
    expect(data.summary!.sessionCount.value).toBe(s.sessions);
    expect(data.summary!.totalTokens.value).toBe(s.totalTokens);
    await expect(
      page.getByRole("region", { name: "세션 수", exact: true }),
    ).toContainText("6개");
    if (mode === "auto") {
      expect(data.trend!.points).toHaveLength(60);
      expect(data.meta.trendAggregation?.intervalSeconds).toBe(43200);
    }
    await capture(
      "overview",
      "개요: 세션 카드 보존과 사용 환산액",
      "PROJ-317 · 세션 보존",
    );
    const slider = page.getByRole("slider").first();
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuetext", /2026-09-01/);
    await capture(
      "overview-tooltip",
      mode === "auto" ? "개요: 12시간 · 60구간 탐색" : "개요: 일별 호환 모드",
      "PROJ-317",
      slider,
    );
    await page.keyboard.press("Escape");
    const overviewCsv = await csv(page, `${mode}-${width}-overview.csv`);
    expect(overviewCsv).toContain(s.equivalentCostUsd);
    expect(overviewCsv).toContain("summary,sessionCount,");
    // 기존 일별 개요 응답에는 snapshotId가 없으며 자동 모드에서만 제공한다.
    if (mode === "auto") expectSnapshotCsv(overviewCsv, data.meta.snapshotId);

    if (mode === "day") {
      const lossButton = page.getByRole("button", {
        name: /최근 7일 보고된 전송 손실 7건/,
      });
      await expect(lossButton).toBeVisible();
      await lossButton.click();
      const lossDrawer = page.getByRole("dialog", { name: "전송 손실 상세" });
      await expect(lossDrawer).toContainText("platform-laptop");
      await expect(lossDrawer).toContainText("retired-workstation");
      await expect(lossDrawer).toContainText("폐기");
      await capture(
        "loss-detail",
        "전송 손실: 7건 · 활성/폐기 기기 상세",
        "PROJ-316",
        lossDrawer,
      );
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /알림, 미확인 1건/ }).click();
      const alerts = page.getByRole("dialog", { name: "알림", exact: true });
      await expect(alerts).toContainText("보고 공백 지속");
      await alerts.getByText("상세", { exact: true }).click();
      await expect(alerts).toContainText("168시간 도달");
      await capture(
        "report-gap",
        "알림함: 7일 보고 공백의 실제 근거",
        "PROJ-316",
        alerts,
      );
      await page.keyboard.press("Escape");
    }

    const teamsResponse = page.waitForResponse((r) =>
      /\/analytics\/teams\?/.test(r.url()),
    );
    await page.goto(
      `/teams?${range(h)}&team=${s.teamId}&${width === 1440 ? "axis" : "tab"}=session`,
    );
    const teams = teamsResponseSchema.parse(await (await teamsResponse).json());
    const team = teams.teams.items.find((t) => t.teamId === s.teamId)!;
    expect(team.metrics.sessionCount.value).toBe(3);
    const drawer = page.getByRole("dialog", {
      name: "플랫폼팀 팀",
      exact: true,
    });
    await expect(drawer).toContainText("3개");
    await expect(drawer).toContainText("$12.00");
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("team") === s.teamId &&
        url.searchParams.get("startDate") === h.startDate &&
        url.searchParams.get("compare") === "none",
    );
    await capture(
      "team-detail",
      "팀 상세: 기존 세션 3개와 환산액 보존",
      "PROJ-318 · 세션 보존",
      drawer,
    );
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    const panel = page.getByRole("region", { name: "팀별 사용량 비교" });
    await expect(panel.getByRole("tab")).toHaveText(["비용", "토큰"]);
    await expect(
      panel.getByRole("tab", { name: "비용", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(
      (url) =>
        !url.searchParams.has("team") &&
        url.searchParams.get("startDate") === h.startDate &&
        url.searchParams.get("compare") === "none",
    );
    await capture(
      "teams-cost",
      "팀 분석: 비용 누적 · 세션당 환산액",
      "PROJ-317 · PROJ-318",
      panel,
    );
    const users = page.getByRole("region", { name: "사용자별 사용량" });
    await users.getByRole("button", { name: "플랫폼팀", exact: true }).click();
    await expect(users).toContainText("alice@example.test");
    if (width === 1440) {
      await users
        .getByRole("button", { name: "세션 정렬", exact: true })
        .click();
      await expect
        .poll(() =>
          requests.some(
            (r) =>
              r.path.includes("/users?") && r.path.includes("sort=session"),
          ),
        )
        .toBe(true);
      await expect(users.getByText(/^(alice|bob)@example\.test$/)).toHaveText([
        "alice@example.test",
        "bob@example.test",
      ]);
    }
    await capture(
      "team-users",
      "팀 사용자: 세션 수·정렬 유지",
      "PROJ-318 · 세션 보존",
      users,
    );
    const costCsv = await csv(page, `${mode}-${width}-teams-cost.csv`);
    expect(costCsv).toContain("sessionCount_status");
    expect(costCsv).toContain("team_users,");
    expect(costCsv).toMatch(/^chart_trend,.*cost,strict,/m);
    await panel.getByRole("tab", { name: "토큰", exact: true }).click();
    await capture(
      "teams-token",
      "팀 분석: 토큰 누적 · 비용/토큰 두 탭",
      "PROJ-317 · PROJ-318",
      panel,
    );
    const vendors = page.getByRole("region", {
      name: "팀별 벤더 비중",
      exact: true,
    });
    await capture(
      "team-vendors",
      "팀 분석: 선택한 토큰 축의 벤더 비중",
      "PROJ-318",
      vendors,
    );
    const tokenCsv = await csv(page, `${mode}-${width}-teams-token.csv`);
    expect(tokenCsv).toMatch(/^chart_trend,.*token,strict,/m);
    expect(tokenCsv).not.toMatch(/^chart_trend,.*session,/m);
    expect(tokenCsv).toContain("cumulativeSessionCount");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await writeFile(
      path.join(report, `requests-${mode}-${width}-main.json`),
      JSON.stringify(requests, null, 2),
    );
  });

  test(`${mode} ${width}px 실제 미배정 0원·미환산 사용과 구성원 관측`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const h = await loadHarness();
    const capture = recorder(page, width, "unassigned");
    for (const key of ["zeroUsage", "unpricedUsage"] as const) {
      await page.unrouteAll({ behavior: "wait" });
      const s = h.scenarios[key];
      await connect(page, h, s);
      const pending = page.waitForResponse((r) =>
        /\/analytics\/teams\?/.test(r.url()),
      );
      await page.goto(`/teams?${range(h)}`);
      const data = teamsResponseSchema.parse(await (await pending).json());
      expect(
        data.unassigned.metrics.pricedUsageRows! +
          data.unassigned.metrics.unpricedUsageRows!,
      ).toBe(1);
      expect(data.unassigned.metrics.equivalentCostUsd.value).toBe(
        s.unassignedCostUsd,
      );
      expect(data.unassigned.metrics.totalTokens.value).toBe(
        s.unassignedTokens,
      );
      expect(data.unassigned.metrics.sessionCount.value).toBeNull();
      const panel = page.getByRole("region", { name: "팀별 사용량 비교" });
      await expect(
        panel.getByRole("checkbox", { name: /미배정/ }),
      ).toBeVisible();
      await expect(
        panel.getByRole("checkbox", { name: /미배정/ }),
      ).toBeChecked();
      await capture(
        `${key}-teams`,
        key === "zeroUsage"
          ? "미배정: 0원·0토큰이어도 사용 행 보존"
          : "미배정: 미환산·세션 결손이어도 사용 행 보존",
        "PROJ-318",
        panel,
      );
      const content = await csv(page, `${mode}-${width}-${key}-teams.csv`);
      expect(content).toContain("session_identity_missing");
      if (key === "unpricedUsage") expect(content).toContain("pricing_missing");
      // 구성원 화면의 최근 7일 고정 기간은 최근 시드 행으로 검증한다.
      await page.goto("/members");
      const roster = page.getByRole("region", {
        name: "구성원 목록",
        exact: true,
      });
      const row = roster.getByRole("button", {
        name: "unassigned@example.test 구성원 상세",
        exact: true,
      });
      await expect(row.getByText("활성", { exact: true })).toBeVisible();
      if (key === "zeroUsage") await expect(row).toContainText("$0.00");
      await capture(
        `${key}-members`,
        key === "zeroUsage"
          ? "구성원: 0원 사용의 활성 관측"
          : "구성원: 미환산 사용의 활성 관측",
        "PROJ-318 · 구성원 보존",
        roster,
      );
      const membersCsv = await csv(page, `${mode}-${width}-${key}-members.csv`);
      expect(membersCsv).toContain("unassigned@example.test");
      expect(membersCsv).toContain("session_identity_missing");
      await row.click();
      const drawer = page.getByRole("dialog");
      await expect(
        drawer.getByRole("region", { name: "팀 및 역할", exact: true }),
      ).toContainText(
        key === "zeroUsage" ? "0원 사용 구성원" : "미환산 사용 구성원",
      );
      await expect(
        drawer.getByRole("button", { name: "벤더 좌석", exact: true }),
      ).toBeVisible();
      await capture(
        `${key}-member-detail`,
        "구성원 상세: 팀·역할·계정 정보 (하네스 관리 비활성)",
        "PROJ-318 · 구성원 보존",
        drawer,
      );
      await page.keyboard.press("Escape");
    }
  });

  if (mode === "auto")
    test(`${width}px 실제 오늘·미래 자동 시간축`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      const h = await loadHarness();
      await connect(page, h, h.scenarios.main);
      const capture = recorder(page, width, "temporal");
      const pending = page.waitForResponse((r) =>
        r.url().includes("/analytics/overview?"),
      );
      await page.goto(
        `/overview?startDate=${h.today}&endDate=${h.today}&compare=none`,
      );
      const data = overviewSchema.parse(await (await pending).json());
      expect(data.summary!.equivalentCostUsd.value).toBe("0.750000");
      expect(data.trend!.points).toHaveLength(24);
      const slider = page.getByRole("slider").first();
      await slider.scrollIntoViewIfNeeded();
      await slider.focus();
      await page.keyboard.press("End");
      await expect(slider).toHaveAttribute("aria-valuetext", /KST/);
      await capture(
        "today-future-tail",
        "오늘: 시간별 관측과 미도래 구간",
        "PROJ-317",
        slider,
      );
      await page.goto(
        `/teams?startDate=${h.today}&endDate=${h.today}&compare=none`,
      );
      const teamSlider = page.getByRole("slider").first();
      await teamSlider.scrollIntoViewIfNeeded();
      await teamSlider.focus();
      await capture(
        "today-teams",
        "오늘 팀 누적: 기준 시각까지만 집계",
        "PROJ-317",
        teamSlider,
      );
      const futurePending = page.waitForResponse((r) =>
        r.url().includes("/analytics/overview?"),
      );
      await page.goto(
        `/overview?startDate=${h.futureDate}&endDate=${h.futureDate}&compare=none`,
      );
      const future = overviewSchema.parse(await (await futurePending).json());
      expect(future.trend!.points).toHaveLength(24);
      for (const point of future.trend!.points) {
        expect("temporalState" in point && point.temporalState).toBe(
          "upcoming",
        );
        expect(point.equivalentCostUsd.value).toBeNull();
      }
      await capture(
        "future-overview",
        "미래 조회: 값은 비우고 시간축 보존",
        "PROJ-317",
        page.getByRole("slider").first(),
      );
    });
}
