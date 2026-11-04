import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  autoOverview,
  autoTeamsResponse,
  contract,
} from "../fixtures/auto-trend";
import {
  mockAuthenticatedRoutes,
  issueFixtureCookie,
} from "../browser/session-fixture";
import {
  mockOverviewSettings,
  mockIngestStatus,
} from "../browser/overview-fixture";
import { fixtureTeamUsers } from "../browser/teams-fixture";
const period = `startDate=${contract.request.startDate}&endDate=${contract.request.endDate}&compare=none`;
const baseURL = "http://localhost:3187";
async function ready(page: Page) {
  await mockAuthenticatedRoutes(page);
  await issueFixtureCookie(page, { origin: baseURL });
  await mockOverviewSettings(page);
  await mockIngestStatus(page);
  await page.clock.setFixedTime(new Date(contract.asOf));
}
async function csv(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  return readFile((await (await pending).path())!, "utf8");
}
const fulfilled = <T>(value: T) => ({ value, status: "complete", reasons: [] });
function usersResponse(snapshot: string, offset: number) {
  const data = autoTeamsResponse(undefined, snapshot),
    team = data.teams.items[0];
  const users = fixtureTeamUsers(
    snapshot === "fresh" ? "fresh" : "original",
    13,
  );
  return {
    meta: data.meta,
    team: { teamId: team.teamId, teamName: team.teamName },
    summary: {
      usage: {
        activeUsers: team.metrics.activeUsers,
        sessionCount: team.metrics.sessionCount,
        totalTokens: team.metrics.totalTokens,
        equivalentCostUsd: team.metrics.equivalentCostUsd,
      },
      averageEquivalentCostUsd: "2.000000",
      cacheHitRatio: fulfilled(0.5),
      unidentifiedEquivalentCostUsd: "0.000000",
    },
    users: {
      items: users.slice(offset, offset + 12),
      totalCount: users.length,
      nextOffset: offset + 12 < users.length ? offset + 12 : null,
    },
  };
}
async function teams(page: Page) {
  await page.route("**/analytics/teams?*", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("bucket")).toBe(
      "auto",
    );
    await route.fulfill({ json: autoTeamsResponse() });
  });
  await page.route("**/analytics/teams/*/users?*", (route) =>
    route.fulfill({
      json: usersResponse(
        "fixture-auto-snapshot",
        Number(new URL(route.request().url()).searchParams.get("offset")),
      ),
    }),
  );
}

test("개요 자동 24개 축 · KST 범위 키보드 · Decimal CSV · 미래 null", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/analytics/overview?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("bucket")).toBe(
      "auto",
    );
    return route.fulfill({ json: autoOverview() });
  });
  await page.goto(`/overview?${period}`);
  const slider = page.getByRole("slider", { name: /1시간별 사용 환산액/ });
  await expect(slider).toHaveAttribute("aria-valuemax", "24");
  await slider.focus();
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /2026-11-04 00:00 ~ 2026-11-04 01:00 KST/,
  );
  await expect(slider).toHaveAttribute("aria-valuetext", /\$0\.000000000003/);
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /확인할 근거가 부족/);
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /집계 중/);
  await slider.press("End");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /2026-11-05 00:00 KST.*미도래/,
  );
  const text = await csv(page);
  expect(text).toContain("aggregationMode,auto");
  expect(text).toContain("0.000000000003,complete");
  expect(text).toMatch(/upcoming,,,unavailable,upcoming/);
});

test("팀 자동 서버 누적 그대로 · 비용/토큰만 · 세션 API/CSV 유지", async ({
  page,
}) => {
  await ready(page);
  await teams(page);
  await page.goto(`/teams?${period}`);
  const panel = page.getByRole("region", { name: "팀별 사용량 비교" });
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(
    panel.getByRole("tab", { name: "세션", exact: true }),
  ).toHaveCount(0);
  const slider = panel.getByRole("slider");
  await slider.focus();
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /집계 중/);
  const line = panel.locator("svg path").first();
  await expect(line).toHaveAttribute("d", /L14\.58,/);
  const text = await csv(page);
  expect(text).toMatch(
    /chart_trend,team-a,자동 집계 팀,2026-11-03T17:00:00Z,2026-11-03T18:00:00Z,elapsed,2,cost,strict,0.300000000003/,
  );
  expect(text).toContain(
    "cumulativeSessionCount_status,cumulativeSessionCount_reasons",
  );
  expect(text).toContain("sessionCount_status");
  await panel.getByRole("tab", { name: "토큰", exact: true }).click();
  expect(await csv(page)).toContain(",token,strict,100,complete,");
  await page.setViewportSize({ width: 390, height: 844 });
  await slider.focus();
  await slider.press("Home");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(slider).toHaveAttribute("aria-valuetext", /KST/);
});

test("CSV 사용자 페이지 만료 시 목록·사용자를 새 snapshot으로 전부 재시작", async ({
  page,
}) => {
  await ready(page);
  let fresh = false;
  const seen: string[] = [];
  await page.route("**/analytics/teams?*", (route) =>
    route.fulfill({
      json: autoTeamsResponse(undefined, fresh ? "fresh" : "old"),
    }),
  );
  await page.route("**/analytics/teams/*/users?*", (route) => {
    const params = new URL(route.request().url()).searchParams,
      snapshot = params.get("snapshotId")!,
      offset = Number(params.get("offset"));
    expect(params.has("bucket")).toBe(false);
    seen.push(`${snapshot}:${offset}`);
    if (snapshot === "old" && offset === 12) {
      fresh = true;
      return route.fulfill({
        status: 409,
        json: { error: { code: "snapshot_expired", message: "expired" } },
      });
    }
    return route.fulfill({ json: usersResponse(snapshot, offset) });
  });
  await page.goto(`/teams?${period}`);
  await expect(
    page.getByText("original01@codeworks.io", { exact: true }),
  ).toBeVisible();
  const text = await csv(page);
  expect(text).toContain("snapshot,fresh");
  expect(text).toContain("fresh13@codeworks.io");
  expect(text).not.toContain("original01@codeworks.io");
  expect(seen).toContain("old:12");
  expect(seen.slice(-2)).toEqual(["fresh:0", "fresh:12"]);
});

test("자동 시간축 불연속 응답은 실제 조회 오류로 표시한다", async ({
  page,
}) => {
  await ready(page);
  const data = autoOverview();
  if (data.trend?.bucket !== "auto") throw Error();
  data.trend.points.splice(1, 1);
  await page.route("**/analytics/overview?*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/overview?${period}`);
  await expect(
    page.getByText("서버 응답이 개요 데이터 계약과 일치하지 않습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("slider")).toHaveCount(0);
});

test("자동 빈 기간도 24개 시간축과 미도래 키보드 탐색을 유지한다", async ({
  page,
}) => {
  await ready(page);
  const overview = autoOverview();
  overview.meta.dataState = "no_data";
  overview.summary = null;
  overview.modelMix = null;
  overview.teamUsage = null;
  if (overview.trend?.bucket !== "auto") throw Error();
  const missing = (upcoming: boolean) => ({
    value: null,
    status: "unavailable" as const,
    reasons: [upcoming ? "upcoming" : "no_data"],
  });
  overview.trend.points = overview.trend.points.map((p) => ({
    ...p,
    usageRows: p.temporalState === "upcoming" ? null : 0,
    pricedUsageRows: p.temporalState === "upcoming" ? null : 0,
    unpricedUsageRows: p.temporalState === "upcoming" ? null : 0,
    equivalentCostUsd: missing(p.temporalState === "upcoming"),
    knownEquivalentCostUsd: missing(p.temporalState === "upcoming"),
    totalTokens: missing(p.temporalState === "upcoming"),
  }));
  await page.route("**/analytics/overview?*", (route) =>
    route.fulfill({ json: overview }),
  );
  await page.goto(`/overview?${period}`);
  const overviewSlider = page.getByRole("slider");
  await expect(overviewSlider).toHaveAttribute("aria-valuemax", "24");
  await overviewSlider.focus();
  await overviewSlider.press("End");
  await expect(overviewSlider).toHaveAttribute("aria-valuetext", /미도래/);
  const data = autoTeamsResponse();
  data.meta.dataState = "no_data";
  data.teams = { items: [], nextOffset: null, totalCount: 0 };
  for (const metrics of [data.totals, data.unassigned.metrics])
    for (const metric of Object.values(metrics)) {
      if (typeof metric === "object" && metric) {
        metric.value = null;
        metric.status = "unavailable";
        metric.reasons = ["no_data"];
      }
    }
  data.unassigned.trend = data.unassigned.trend.map((p) => {
    if (!("bucketStart" in p)) throw Error();
    return {
      ...p,
      usageRows: p.temporalState === "upcoming" ? null : 0,
      pricedUsageRows: p.temporalState === "upcoming" ? null : 0,
      unpricedUsageRows: p.temporalState === "upcoming" ? null : 0,
      cumulativeEquivalentCostUsd: missing(p.temporalState === "upcoming"),
      cumulativeKnownEquivalentCostUsd: missing(p.temporalState === "upcoming"),
      cumulativeTotalTokens: missing(p.temporalState === "upcoming"),
      cumulativeSessionCount: missing(p.temporalState === "upcoming"),
    };
  });
  await page.route("**/analytics/teams?*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/teams?${period}`);
  const teamSlider = page.getByRole("slider");
  await expect(teamSlider).toHaveAttribute("aria-valuemax", "24");
  await teamSlider.focus();
  await teamSlider.press("End");
  await expect(teamSlider).toHaveAttribute("aria-valuetext", /미도래/);
});

test("30일 60개 자동 구간은 좁은 화면에서도 실제 시간과 명시적 0을 설명한다", async ({
  page,
}) => {
  await ready(page);
  const data = autoOverview();
  const start = Date.parse("2026-09-01T00:00:00+09:00"),
    end = Date.parse("2026-10-01T00:00:00+09:00");
  data.meta.startDate = "2026-09-01";
  data.meta.endDate = "2026-09-30";
  data.meta.dayCount = 30;
  Object.assign(data.meta.trendAggregation!, {
    intervalSeconds: 43200,
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
  });
  Object.assign(data.meta.collectionPolicy!.annotations[0], {
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
  });
  data.trend = {
    bucket: "auto",
    points: Array.from({ length: 60 }, (_, i) => ({
      bucketStart: new Date(start + i * 43200_000).toISOString(),
      bucketEnd: new Date(start + (i + 1) * 43200_000).toISOString(),
      temporalState: "elapsed",
      usageRows: i === 0 ? 1 : 0,
      pricedUsageRows: i === 0 ? 1 : 0,
      unpricedUsageRows: 0,
      equivalentCostUsd:
        i === 0
          ? { value: "0.000000", status: "complete", reasons: [] }
          : { value: null, status: "unavailable", reasons: ["no_data"] },
      knownEquivalentCostUsd:
        i === 0
          ? { value: "0.000000", status: "complete", reasons: [] }
          : { value: null, status: "unavailable", reasons: ["no_data"] },
      totalTokens:
        i === 0
          ? { value: 0, status: "complete", reasons: [] }
          : { value: null, status: "unavailable", reasons: ["no_data"] },
    })),
  };
  await page.route("**/analytics/overview?*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/overview?startDate=2026-09-01&endDate=2026-09-30&compare=none",
  );
  const slider = page.getByRole("slider");
  await expect(slider).toHaveAttribute("aria-valuemax", "60");
  await slider.focus();
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /기록된 사용량에서 확인된 0/,
  );
  await expect(slider).not.toHaveAttribute(
    "aria-valuetext",
    /수집 근거가 확인된 0/,
  );
  await slider.press("End");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /2026-09-30 12:00 ~ 2026-10-01 00:00 KST/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
