import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  autoOverview,
  autoTeamsResponse,
  contract,
} from "../fixtures/auto-trend";
import {
  issueFixtureCookie,
  mockAuthenticatedRoutes,
} from "../browser/session-fixture";
import { mockOverviewSettings } from "../browser/overview-fixture";
import { fixtureTeamUsers } from "../browser/teams-fixture";

const reportDir = resolve(
  process.env.TREND_AXIS_REPORT_DIR ?? "../reports/proj318-axis-fix-20261104",
);
const screenshotsDir = join(reportDir, "screenshots");
const origin = "http://localhost:3187";
const complete = <T>(value: T) => ({
  value,
  status: "complete" as const,
  reasons: [],
});
const missing = (future: boolean) => ({
  value: null,
  status: "unavailable" as const,
  reasons: [future ? "upcoming" : "no_data"],
});
const scenarios = [
  {
    id: "24h",
    count: 24,
    intervalSeconds: 3600,
    startDate: "2026-11-04",
    endDate: "2026-11-04",
  },
  {
    id: "60-halfdays",
    count: 60,
    intervalSeconds: 43200,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  },
] as const;
type Scenario = (typeof scenarios)[number];
type Surface = "overview" | "teams";
type Layout = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  ticks: {
    index: number;
    text: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
  }[];
};
type Entry = {
  id: string;
  title: string;
  file: string;
  source: "fixture";
  mode: "auto";
  viewport: { width: number; height: number };
  checks: string[];
  layout: Layout;
};

function updateRange(
  meta:
    | ReturnType<typeof autoOverview>["meta"]
    | ReturnType<typeof autoTeamsResponse>["meta"],
  startDate: string,
  endDate: string,
  intervalSeconds: number,
) {
  const start = Date.parse(`${startDate}T00:00:00+09:00`);
  const end = Date.parse(`${endDate}T00:00:00+09:00`) + 86400_000;
  Object.assign(meta, {
    startDate,
    endDate,
    dayCount: (end - start) / 86400_000,
  });
  if (!meta.trendAggregation || !meta.collectionPolicy)
    throw Error("auto metadata expected");
  Object.assign(meta.trendAggregation, {
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
    intervalSeconds,
  });
  Object.assign(meta.collectionPolicy.annotations[0], {
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
  });
  return { start, end };
}

function fixtures(scenario: Scenario) {
  const overview = autoOverview();
  const teams = autoTeamsResponse();
  if (scenario.count === 60) {
    // 시간축 레이아웃 전용 명시 fixture: 각 12시간 구간에 비용 1 USD/토큰 10의 기록 하나.
    // 실제 SQL 집계 검증은 별도의 실제 API suite가 담당한다.
    const { start } = updateRange(
      overview.meta,
      scenario.startDate,
      scenario.endDate,
      scenario.intervalSeconds,
    );
    updateRange(
      teams.meta,
      scenario.startDate,
      scenario.endDate,
      scenario.intervalSeconds,
    );
    overview.meta.dataState = "ready";
    teams.meta.dataState = "ready";
    overview.meta.currentCoverage = { status: "complete", observedDays: 30 };
    teams.meta.currentCoverage = { status: "complete", observedDays: 30 };
    const boundaries = Array.from({ length: 60 }, (_, i) => ({
      bucketStart: new Date(start + i * 43200_000).toISOString(),
      bucketEnd: new Date(start + (i + 1) * 43200_000).toISOString(),
      temporalState: "elapsed" as const,
      usageRows: 1,
    }));
    overview.trend = {
      bucket: "auto",
      points: boundaries.map((point) => ({
        ...point,
        pricedUsageRows: 1,
        unpricedUsageRows: 0,
        equivalentCostUsd: complete("1.000000"),
        knownEquivalentCostUsd: complete("1.000000"),
        totalTokens: complete(10),
      })),
    };
    if (!overview.summary) throw Error("summary fixture expected");
    Object.assign(overview.summary.equivalentCostUsd, complete("60.000000"));
    Object.assign(overview.summary.totalTokens, complete(600));
    Object.assign(overview.summary.activeUsers, complete(1));
    Object.assign(overview.summary.sessionCount, complete(1));
    Object.assign(
      overview.summary.equivalentCostPerUserUsd,
      complete("60.000000"),
    );
    overview.summary.equivalentCostPerSessionUsd = complete("60.000000");
    overview.summary.sessionsPerUser = complete(1);
    overview.summary.knownEquivalentCostUsd = complete("60.000000");
    overview.summary.pricedUsageRows = 60;
    overview.summary.unpricedUsageRows = 0;
    const trend = boundaries.map((point, i) => ({
      ...point,
      pricedUsageRows: i + 1,
      unpricedUsageRows: 0,
      cumulativeEquivalentCostUsd: complete(`${i + 1}.000000`),
      cumulativeKnownEquivalentCostUsd: complete(`${i + 1}.000000`),
      cumulativeTotalTokens: complete((i + 1) * 10),
      cumulativeSessionCount: complete(1),
    }));
    for (const team of [...teams.teams.items, teams.unassigned])
      team.trend = structuredClone(trend);
    for (const metrics of [
      teams.totals,
      ...teams.teams.items.map((team) => team.metrics),
    ]) {
      Object.assign(metrics.equivalentCostUsd, complete("60.000000"));
      Object.assign(metrics.totalTokens, complete(600));
      Object.assign(metrics.activeUsers, complete(1));
      Object.assign(metrics.sessionCount, complete(1));
      Object.assign(metrics.equivalentCostPerUserUsd, complete("60.000000"));
      metrics.equivalentCostPerSessionUsd = complete("60.000000");
      metrics.sessionsPerUser = complete(1);
      metrics.tokensPerUser = complete(600);
      metrics.tokensPerSession = complete(600);
      metrics.effectiveCostPerMillionTokensUsd = complete("100000.000000");
      metrics.knownEquivalentCostUsd = complete("60.000000");
      metrics.pricedUsageRows = 60;
      metrics.unpricedUsageRows = 0;
    }
  }
  // 레이아웃 비교의 선 하나를 일정하게 유지한다. 원시 미배정 데이터 필드는 CSV에 남는다.
  teams.unassigned.metrics.pricedUsageRows = 0;
  teams.unassigned.metrics.unpricedUsageRows = 0;
  return { overview, teams };
}
type Fixtures = ReturnType<typeof fixtures>;

async function ready(page: Page, data: Fixtures) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAuthenticatedRoutes(page);
  await issueFixtureCookie(page, { origin });
  await mockOverviewSettings(page);
  await page.clock.setFixedTime(new Date(contract.asOf));
  await page.route("**/analytics/overview?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("bucket")).toBe(
      "auto",
    );
    return route.fulfill({ json: data.overview });
  });
  await page.route("**/analytics/teams?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("bucket")).toBe(
      "auto",
    );
    return route.fulfill({ json: data.teams });
  });
  await page.route("**/analytics/teams/*/users?*", (route) => {
    const team = data.teams.teams.items[0] ?? data.teams.unassigned;
    return route.fulfill({
      json: {
        meta: data.teams.meta,
        team: { teamId: team.teamId, teamName: team.teamName },
        summary: {
          usage: {
            activeUsers: team.metrics.activeUsers,
            sessionCount: team.metrics.sessionCount,
            totalTokens: team.metrics.totalTokens,
            equivalentCostUsd: team.metrics.equivalentCostUsd,
          },
          averageEquivalentCostUsd: "2.000000",
          cacheHitRatio: complete(0.5),
          unidentifiedEquivalentCostUsd: "0.000000",
        },
        users: {
          items: fixtureTeamUsers("axis", 1),
          totalCount: 1,
          nextOffset: null,
        },
      },
    });
  });
}

const chart = (page: Page, surface: Surface) =>
  page.getByRole("region", {
    name: surface === "overview" ? "사용 환산액 추이" : "팀별 사용량 비교",
    exact: true,
  });
const timeAxis = (region: Locator) => region.getByTestId("trend-time-axis");
async function layout(axis: Locator): Promise<Layout> {
  return axis.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const ticks = Array.from(
      element.querySelectorAll<HTMLElement>("[data-tick-index]"),
    )
      .filter(
        (tick) =>
          !tick.closest('[aria-hidden="true"]') &&
          tick.getClientRects().length > 0 &&
          getComputedStyle(tick).visibility !== "hidden" &&
          getComputedStyle(tick).display !== "none",
      )
      .map((tick) => {
        const box = tick.getBoundingClientRect();
        return {
          index: Number(tick.dataset.tickIndex),
          text: tick.textContent?.trim() ?? "",
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
        };
      })
      .sort((a, b) => a.left - b.left);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      ticks,
    };
  });
}
function violations(measured: Layout, count: number) {
  const issues: string[] = [];
  if (measured.width <= 0) issues.push("축의 너비가 0이다");
  if (measured.ticks.length < 2) issues.push("양끝 눈금이 없다");
  if (measured.ticks[0]?.index !== 0) issues.push("첫 구간 눈금이 없다");
  if (measured.ticks.at(-1)?.index !== count - 1)
    issues.push("마지막 구간 눈금이 없다");
  for (const [i, tick] of measured.ticks.entries()) {
    if (!tick.text || tick.width <= 0) issues.push(`${tick.index}: 빈 눈금`);
    if (
      tick.left < measured.left - 0.01 ||
      tick.right > measured.right + 0.01 ||
      tick.top < measured.top - 0.01 ||
      tick.bottom > measured.bottom + 0.01
    )
      issues.push(`${tick.index}: 축 경계를 벗어남`);
    for (const previous of measured.ticks.slice(0, i)) {
      // DOM의 소수 픽셀 오차만 반올림한다. 실제 보이는 라벨 간격 기준은 8px이다.
      const gap = Math.round((tick.left - previous.right) * 1000) / 1000;
      const verticalOverlap =
        Math.min(tick.bottom, previous.bottom) -
        Math.max(tick.top, previous.top);
      // 양끝을 한 행에 놓을 수 없는 극단 폭에서는 세로로 분리한 두 행도 허용한다.
      if (verticalOverlap > 0.01 && gap < 8)
        issues.push(`${previous.index}→${tick.index}: 같은 행 간격 ${gap}px`);
      if (previous.index >= tick.index)
        issues.push("눈금 순서가 바뀌거나 중복됨");
    }
  }
  return issues;
}
async function assertLayout(page: Page, axis: Locator, count: number) {
  await expect(axis).toBeVisible();
  await expect(axis).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await expect
    .poll(async () => violations(await layout(axis), count), {
      message: "표시 눈금은 축 안에서 8px 이상 떨어지고 양끝을 보존해야 한다",
    })
    .toEqual([]);
  return layout(axis);
}
async function sidebar(page: Page, expanded: boolean) {
  const toggle = page.getByRole("button", {
    name: "내비게이션 접기/펼치기",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) !== String(expanded))
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
  await expect(
    page.getByRole("navigation", { name: "주 내비게이션" }),
  ).toHaveCSS("width", expanded ? "240px" : "56px");
}
async function keyboard(
  region: Locator,
  count: number,
  firstStart: string,
  lastEnd: string,
) {
  const slider = region.getByRole("slider");
  await expect(slider).toHaveAttribute("aria-valuemax", String(count));
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "1");
  const kst = (instant: string) =>
    new Date(Date.parse(instant) + 9 * 3600_000)
      .toISOString()
      .slice(0, 16)
      .replace("T", " ");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    new RegExp(kst(firstStart)),
  );
  // 생략된 중간 눈금도 데이터 탐색에서는 한 구간씩 빠짐없이 접근한다.
  for (let i = 1; i < count; i++) {
    await slider.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", String(i + 1));
  }
  await slider.press("Home");
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(count));
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    new RegExp(kst(lastEnd)),
  );
  await slider.press("Escape");
}
async function csv(
  page: Page,
  surface: Surface,
  data: Fixtures,
  count: number,
) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const text = await readFile((await (await pending).path())!, "utf8");
  const points =
    surface === "overview"
      ? data.overview.trend?.points
      : data.teams.teams.items[0]?.trend;
  if (!points) throw Error("CSV source points expected");
  const prefix =
    surface === "overview"
      ? "trend,"
      : `trend,${data.teams.teams.items[0].teamId},`;
  const rows = text.split(/\r?\n/).filter((row) => row.startsWith(prefix));
  expect(rows).toHaveLength(count);
  const startColumn = surface === "overview" ? 1 : 3;
  expect(rows.map((row) => row.split(",")[startColumn])).toEqual(
    points.map((point) => {
      if (!("bucketStart" in point)) throw Error("auto point expected");
      return point.bucketStart;
    }),
  );
  if (surface === "teams") {
    expect(
      text
        .split(/\r?\n/)
        .filter((row) =>
          row.startsWith(`chart_trend,${data.teams.teams.items[0].teamId},`),
        ),
    ).toHaveLength(count);
    expect(text).toContain("cumulativeSessionCount_status");
  }
}
async function capture(
  page: Page,
  region: Locator,
  id: string,
  title: string,
  count: number,
  entries: Entry[],
) {
  await region.scrollIntoViewIfNeeded();
  // sticky 공통 헤더 아래에 차트 전체가 들어오도록 main 내부 스크롤을 맞춘다.
  await region.evaluate((element) => {
    const main = element.closest("main");
    const header = document.querySelector('[aria-label="공통 헤더"]');
    if (main && header)
      main.scrollTop +=
        element.getBoundingClientRect().top -
        header.getBoundingClientRect().bottom -
        16;
  });
  const measured = await assertLayout(page, timeAxis(region), count);
  const box = await region.boundingBox();
  const viewport = page.viewportSize()!;
  if (!box) throw Error("chart region expected");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.01);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.01);
  await mkdir(screenshotsDir, { recursive: true });
  const file = `screenshots/axis-${id}.png`;
  await page.screenshot({
    path: join(reportDir, file),
    animations: "disabled",
    clip: box,
  });
  entries.push({
    id: `axis-${id}`,
    title,
    file,
    source: "fixture",
    mode: "auto",
    viewport,
    layout: measured,
    checks: [
      `원본 ${count}개 구간의 첫·마지막 눈금 보존`,
      "모든 표시 라벨이 시간축 경계 안에 존재",
      "같은 행의 실측 라벨 간격 최소 8px·다른 행의 세로 겹침 없음",
    ],
  });
}
async function saveEntries(id: string, entries: Entry[]) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    join(reportDir, `trend-axis-layout-${id}.json`),
    JSON.stringify({ entries }, null, 2) + "\n",
  );
}

for (const scenario of scenarios)
  for (const surface of ["overview", "teams"] as const) {
    test(`${surface} ${scenario.id}: 실제 눈금 간격·resize·사이드바·키보드·CSV`, async ({
      page,
    }) => {
      const data = fixtures(scenario);
      await ready(page, data);
      const period = `startDate=${scenario.startDate}&endDate=${scenario.endDate}&compare=none`;
      await page.goto(`/${surface}?${period}`);
      const region = chart(page, surface);
      const axis = timeAxis(region);
      const points =
        surface === "overview"
          ? data.overview.trend?.points
          : data.teams.teams.items[0].trend;
      const first = points?.[0];
      const last = points?.at(-1);
      if (
        !first ||
        !last ||
        !("bucketStart" in first) ||
        !("bucketEnd" in last)
      )
        throw Error("auto points expected");
      await keyboard(region, scenario.count, first.bucketStart, last.bucketEnd);
      await csv(page, surface, data, scenario.count);
      const entries: Entry[] = [];
      const captured = new Set<string>();
      for (const width of [1440, 1024, 768, 390, 320, 1440]) {
        await page.setViewportSize({ width, height: 1200 });
        for (const expanded of [true, false]) {
          await sidebar(page, expanded);
          await assertLayout(page, axis, scenario.count);
          // 좁은 화면의 펼친 사이드바는 본문 위에 겹치는 기존 동작이므로 캡처는 접은 상태를 쓴다.
          const photograph =
            (width === 1440 && expanded) ||
            ((width === 390 || (width === 320 && scenario.count === 24)) &&
              !expanded);
          const id = `${surface}-${scenario.id}-${width}`;
          if (photograph && !captured.has(id)) {
            await capture(
              page,
              region,
              id,
              `${surface === "overview" ? "개요" : "팀 누적"} · ${scenario.count}구간 · ${width}px`,
              scenario.count,
              entries,
            );
            captured.add(id);
          }
          if (
            surface === "overview" &&
            scenario.count === 24 &&
            width === 390 &&
            !expanded
          ) {
            const slider = region.getByRole("slider");
            await slider.focus();
            await slider.press("End");
            await expect(slider).toHaveAttribute("aria-valuetext", /미도래/);
            await capture(
              page,
              region,
              "overview-24h-390-tooltip",
              "개요 · 모바일 양끝 눈금과 미도래 구간 탐색",
              scenario.count,
              entries,
            );
            await slider.press("Escape");
          }
        }
      }
      await saveEntries(`${surface}-${scenario.id}`, entries);
    });
  }

for (const state of ["empty", "future"] as const) {
  test(`${state}: 빈 기간·전체 미래의 개요와 팀에서도 양끝 시간축 보존`, async ({
    page,
  }) => {
    const data = fixtures(scenarios[0]);
    const startDate = state === "future" ? "2026-11-05" : "2026-11-04";
    const { start } = updateRange(
      data.overview.meta,
      startDate,
      startDate,
      3600,
    );
    updateRange(data.teams.meta, startDate, startDate, 3600);
    data.overview.meta.dataState = "no_data";
    data.overview.meta.currentCoverage = { status: "none", observedDays: 0 };
    data.overview.summary = null;
    data.overview.modelMix = null;
    data.overview.teamUsage = null;
    data.teams.meta.dataState = "no_data";
    data.teams.meta.currentCoverage = { status: "none", observedDays: 0 };
    data.teams.teams = { items: [], totalCount: 0, nextOffset: null };
    if (data.overview.trend?.bucket !== "auto")
      throw Error("auto fixture expected");
    data.overview.trend.points = data.overview.trend.points.map((point, i) => {
      const future = state === "future" || point.temporalState === "upcoming";
      return {
        ...point,
        bucketStart: new Date(start + i * 3600_000).toISOString(),
        bucketEnd: new Date(start + (i + 1) * 3600_000).toISOString(),
        temporalState: future ? ("upcoming" as const) : point.temporalState,
        usageRows: future ? null : 0,
        pricedUsageRows: future ? null : 0,
        unpricedUsageRows: future ? null : 0,
        equivalentCostUsd: missing(future),
        knownEquivalentCostUsd: missing(future),
        totalTokens: missing(future),
      };
    });
    data.teams.unassigned.trend = data.teams.unassigned.trend.map(
      (point, i) => {
        if (!("bucketStart" in point)) throw Error("auto fixture expected");
        const future = state === "future" || point.temporalState === "upcoming";
        return {
          ...point,
          bucketStart: new Date(start + i * 3600_000).toISOString(),
          bucketEnd: new Date(start + (i + 1) * 3600_000).toISOString(),
          temporalState: future ? ("upcoming" as const) : point.temporalState,
          usageRows: future ? null : 0,
          pricedUsageRows: future ? null : 0,
          unpricedUsageRows: future ? null : 0,
          cumulativeEquivalentCostUsd: missing(future),
          cumulativeKnownEquivalentCostUsd: missing(future),
          cumulativeTotalTokens: missing(future),
          cumulativeSessionCount: missing(future),
        };
      },
    );
    for (const metrics of [data.teams.totals, data.teams.unassigned.metrics]) {
      metrics.pricedUsageRows = 0;
      metrics.unpricedUsageRows = 0;
      for (const metric of Object.values(metrics))
        if (metric && typeof metric === "object")
          Object.assign(metric, missing(state === "future"));
    }
    await ready(page, data);
    const entries: Entry[] = [];
    for (const surface of ["overview", "teams"] as const) {
      await page.goto(
        `/${surface}?startDate=${startDate}&endDate=${startDate}&compare=none`,
      );
      const region = chart(page, surface);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1200 });
        await sidebar(page, width === 1440);
        await assertLayout(page, timeAxis(region), 24);
        if (width === 390)
          await capture(
            page,
            region,
            `${surface}-${state}-390`,
            `${surface === "overview" ? "개요" : "팀 누적"} · ${state === "future" ? "전체 미래" : "빈 기간"} · 모바일`,
            24,
            entries,
          );
      }
      const slider = region.getByRole("slider");
      await slider.focus();
      await slider.press("Home");
      await expect(slider).toHaveAttribute("aria-valuenow", "1");
      await slider.press("End");
      await expect(slider).toHaveAttribute("aria-valuenow", "24");
      await expect(slider).toHaveAttribute("aria-valuetext", /미도래/);
    }
    await saveEntries(state, entries);
  });
}
