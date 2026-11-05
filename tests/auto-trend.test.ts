import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  autoOverview,
  autoTeams,
  autoTeamsResponse,
  contract,
} from "./fixtures/auto-trend";
import { fetchOverview, overviewSchema } from "../src/lib/api/overview";
import {
  fetchTeams,
  fetchTeamDetail,
  teamAutoPointSchema,
  teamsOptions,
  teamDetailOptions,
} from "../src/lib/api/teams";
import {
  plannedTrendBuckets,
  validAutoTrend,
  trendAggregationSchema,
  type AutoPoint,
} from "../src/lib/api/trend-aggregation";
import { presentOverview } from "../src/lib/metrics/overview-presentation";
import {
  cumulative,
  knownCumulative,
  presentTeams,
} from "../src/lib/metrics/teams-presentation";
import { trendTimeline } from "../src/lib/metrics/trend-timeline";
import { nullableLinePath } from "../src/components/charts/scale";
import { overviewCsv, teamsCsv } from "../src/lib/csv-export";
import { TeamAxisPanel } from "../src/components/teams/TeamAxisPanel";
import { TrendFeedback } from "../src/components/charts/TrendFeedback";
import { ManagementError } from "../src/lib/api/management";
const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString();
const period = {
  startDate: contract.request.startDate,
  endDate: contract.request.endDate,
  timeZone: "Asia/Seoul" as const,
  compare: "none" as const,
};
const org = "11111111-1111-4111-8111-111111111111";
for (const [days, hours, count] of [
  [1, 3, 8],
  [2, 6, 8],
  [3, 12, 6],
  [6, 12, 12],
  [7, 24, 7],
  [12, 24, 12],
  [13, 48, 7],
  [24, 48, 12],
  [25, 72, 9],
  [36, 72, 12],
  [37, 168, 6],
  [84, 168, 12],
  [85, 336, 7],
  [168, 336, 12],
]) {
  test(`${days}일은 ${hours}시간 · ${count}개 구간이다`, () => {
    const start = Date.parse("2025-01-01T00:00:00+09:00"),
      end = start + days * DAY;
    const meta = {
      startDate: "2025-01-01",
      endDate: iso(Date.parse("2025-01-01") + (days - 1) * DAY).slice(0, 10),
      dayCount: days,
    };
    const aggregation = trendAggregationSchema.parse({
      mode: "auto",
      policyVersion: "calendar-buckets-v2",
      intervalSeconds: hours * 3600,
      intervalMonths: null,
      valueMode: "interval",
      rangeStart: iso(start),
      rangeEnd: iso(end),
      effectiveEnd: iso(end),
      asOf: iso(end),
    });
    const points: AutoPoint[] = Array.from({ length: count }, (_, i) => ({
      bucketStart: iso(start + i * hours * 3600_000),
      bucketEnd: iso(Math.min(end, start + (i + 1) * hours * 3600_000)),
      temporalState: "elapsed",
      usageRows: 0,
      pricedUsageRows: 0,
      unpricedUsageRows: 0,
    }));
    assert.equal(validAutoTrend(meta, aggregation, "interval", points), true);
    assert.equal(
      validAutoTrend(
        meta,
        { ...aggregation, intervalSeconds: hours * 7200 },
        "interval",
        points,
      ),
      false,
    );
    assert.equal(
      validAutoTrend(meta, aggregation, "interval", points.slice(1)),
      false,
    );
    assert.equal(
      trendTimeline(
        { ...aggregation, valueMode: "cumulative" },
        points,
      ).positions.at(-1),
      100,
    );
  });
}

test("월말·윤년·366일은 원래 날짜의 월 경계를 유지하고 13번째 잔여를 합친다", () => {
  const plan = plannedTrendBuckets("2024-01-31", "2025-01-30");
  assert.equal(plan.starts.length, 12);
  assert.equal(plan.seconds, null);
  assert.equal(plan.starts[1], Date.parse("2024-02-29T00:00:00+09:00"));
  assert.equal(plan.starts[2], Date.parse("2024-03-31T00:00:00+09:00"));
  for (const startDate of [
    "2024-01-31",
    "2024-02-29",
    "2025-01-01",
    "2026-08-31",
  ]) {
    for (let days = 1; days <= 366; days++) {
      const endDate = iso(Date.parse(startDate) + (days - 1) * DAY).slice(
        0,
        10,
      );
      const p = plannedTrendBuckets(startDate, endDate);
      assert.ok(p.starts.length >= 6 && p.starts.length <= 12);
    }
  }
  const p = plannedTrendBuckets("2025-01-01", "2026-01-01");
  assert.equal(p.starts.length, 12);
  const aggregation = trendAggregationSchema.parse({
    mode: "auto",
    policyVersion: "calendar-buckets-v2",
    intervalSeconds: null,
    intervalMonths: 1,
    valueMode: "interval",
    rangeStart: iso(p.start),
    rangeEnd: iso(p.end),
    effectiveEnd: iso(p.end),
    asOf: iso(p.end),
  });
  const points: AutoPoint[] = p.starts.map((start, i) => ({
    bucketStart: iso(start),
    bucketEnd: iso(p.starts[i + 1] ?? p.end),
    temporalState: "elapsed",
    usageRows: 0,
    pricedUsageRows: 0,
    unpricedUsageRows: 0,
  }));
  assert.equal(
    validAutoTrend(
      { startDate: "2025-01-01", endDate: "2026-01-01", dayCount: 366 },
      aggregation,
      "interval",
      points,
    ),
    true,
  );
  assert.equal(trendTimeline(aggregation, points).intervalLabel, "1개월");
  assert.equal(points.at(-1)!.bucketEnd, "2026-01-01T15:00:00.000Z");
});

test("day/auto 요청의 캐시를 구분한다", () => {
  assert.notDeepEqual(
    teamsOptions(org, period).queryKey,
    teamsOptions(org, { ...period, bucket: "day" }).queryKey,
  );
  assert.notDeepEqual(
    teamDetailOptions(org, "team-a", period, "snapshot").queryKey,
    teamDetailOptions(org, "team-a", { ...period, bucket: "day" }, "snapshot")
      .queryKey,
  );
});

test("공유 계약의 실제 Decimal/빈 구간/현재/미래를 보존하고 팀 누적값을 다시 더하지 않는다", () => {
  const overview = autoOverview(),
    teams = autoTeams();
  const chart = presentOverview(overview, "1900-01-01").chart;
  assert.deepEqual(chart.cost.slice(0, 5), [3e-12, null, 0.3, 0]);
  assert.equal(chart.timeline?.positions[3], (9 / 10.5) * 100);
  const model = presentTeams(teams, "1900-01-01");
  assert.deepEqual(
    model.trend.cost[0].values.slice(0, 5),
    [3e-12, 3e-12, 0.300000000003, 0.300000000003],
  );
  assert.deepEqual(
    cumulative(teams.teams[0].trend, "session").slice(0, 5),
    [1, 1, 3, 4],
  );
  assert.deepEqual(
    knownCumulative(teams.teams[0].trend, "cost"),
    model.knownTrend.cost[0].values,
  );
  assert.equal(model.timeline?.positions[3], 100);
  assert.match(
    nullableLinePath([1, 2, 3], { max: 3 }, 0, [0, 50, 60]),
    /L60,0$/,
  );
  const html = renderToStaticMarkup(
    createElement(TrendFeedback, {
      model: model.trendFeedback.cost,
      max: 1,
      format: String,
      label: "시간 범위",
    }),
  );
  assert.match(html, /2026-11-04 00:00 ~ 2026-11-04 03:00 KST/);
  assert.match(html, /\$0\.000000000003/);
  assert.match(model.trendFeedback.cost.series[0].notes[3], /집계 중/);
  assert.equal(model.timeline?.states.includes("upcoming"), false);
});

test("auto parser는 gap/중복/혼합/잘못된시간상태/미래0/정책기준 불일치를 거부한다", () => {
  const mutate = (change: (data: ReturnType<typeof autoOverview>) => void) => {
    const data = autoOverview();
    change(data);
    assert.equal(overviewSchema.safeParse(data).success, false);
  };
  mutate((d) => {
    if (d.trend?.bucket === "auto")
      d.trend.points[1].bucketStart = d.trend.points[0].bucketStart;
  });
  mutate((d) => {
    if (d.trend?.bucket === "auto") d.trend.points.pop();
  });
  mutate((d) => {
    if (d.trend?.bucket === "auto") d.trend.points[3].temporalState = "elapsed";
  });
  mutate((d) => {
    if (d.trend?.bucket === "auto") d.trend.points[3].usageRows = null;
  });
  mutate((d) => {
    if (d.trend?.bucket === "auto")
      d.trend.points[3].bucketEnd = "2026-11-04T15:00:00Z";
  });
  mutate((d) => {
    d.meta.collectionPolicy!.asOf = "2026-11-03T18:00:00Z";
  });
  mutate((d) => {
    delete d.meta.snapshotId;
  });
  const raw = autoOverview();
  if (raw.trend?.bucket !== "auto") throw Error();
  assert.equal(
    overviewSchema.safeParse({
      ...raw,
      trend: {
        ...raw.trend,
        points: raw.trend.points.map((p) => ({ ...p, date: "2026-11-04" })),
      },
    }).success,
    false,
  );
});

test("asOf 이전·정각·직후에 미래와 길이 0인 구간을 만들지 않는다", () => {
  const base = contract.expected.teamMeta.trendAggregation;
  const meta = {
    startDate: period.startDate,
    endDate: period.endDate,
    dayCount: 1,
  };
  const start = Date.parse(base.rangeStart);
  for (const delta of [-1, 0, 1, 10800_000 - 1, 10800_000, 10800_000 + 1]) {
    const asOf = start + delta,
      effectiveEnd = Math.max(start, asOf);
    const points: AutoPoint[] = [start, start + 10800_000]
      .filter((s) => s < effectiveEnd)
      .map((s) => ({
        bucketStart: iso(s),
        bucketEnd: iso(Math.min(s + 10800_000, effectiveEnd)),
        temporalState: asOf < s + 10800_000 ? "in_progress" : "elapsed",
        usageRows: 0,
        pricedUsageRows: 0,
        unpricedUsageRows: 0,
      }));
    const aggregation = trendAggregationSchema.parse({
      ...base,
      asOf: iso(asOf),
      effectiveEnd: iso(effectiveEnd),
    });
    assert.equal(validAutoTrend(meta, aggregation, "cumulative", points), true);
    assert.ok(
      trendTimeline(aggregation, points).positions.every(Number.isFinite),
    );
    assert.equal(points.length, delta <= 0 ? 0 : delta <= 10800_000 ? 1 : 2);
  }
});

test("auto 빈 기간도 현재까지의 축을 수용하되 임의 0을 만들지 않는다", () => {
  const data = autoOverview();
  data.meta.dataState = "no_data";
  data.summary = null;
  data.modelMix = null;
  data.teamUsage = null;
  if (data.trend?.bucket !== "auto") throw Error();
  data.trend.points = data.trend.points.map((p) => ({
    ...p,
    usageRows: p.temporalState === "upcoming" ? null : 0,
    pricedUsageRows: p.temporalState === "upcoming" ? null : 0,
    unpricedUsageRows: p.temporalState === "upcoming" ? null : 0,
    equivalentCostUsd: {
      value: null,
      status: "unavailable",
      reasons: [p.temporalState === "upcoming" ? "upcoming" : "no_data"],
    },
    knownEquivalentCostUsd: {
      value: null,
      status: "unavailable",
      reasons: [p.temporalState === "upcoming" ? "upcoming" : "no_data"],
    },
    totalTokens: {
      value: null,
      status: "unavailable",
      reasons: [p.temporalState === "upcoming" ? "upcoming" : "no_data"],
    },
  }));
  assert.equal(overviewSchema.safeParse(data).success, true);
  assert.equal(presentOverview(data).chart.cost.length, 4);
  assert.ok(presentOverview(data).chart.cost.every((v) => v === null));
});

test("지표별 결손은 정상 비용/토큰을 숨기지 않고 CSV가 Decimal와 세션 상태를 보존한다", () => {
  const view = autoTeams();
  const point = teamAutoPointSchema.parse({
    ...contract.expected.teamTrend[2],
    ...contract.metricCases[0].expectedFinalCumulative,
  });
  view.teams[0].trend[2] = point;
  const model = presentTeams(view);
  assert.equal(model.trend.token[0].values[2], 30);
  assert.equal(model.trend.cost[0].values[2], null);
  assert.doesNotMatch(model.trendFeedback.token.series[0].notes[2], /세션/);
  const csv = teamsCsv(autoTeams(), "조직", "now", null, {
    axis: "cost",
    mode: "strict",
  });
  assert.match(
    csv,
    /chart_trend,team-a,자동 집계 팀,2026-11-03T21:00:00Z,2026-11-04T00:00:00Z,elapsed,2,cost,strict,0.300000000003,complete,/,
  );
  assert.match(
    csv,
    /cumulativeSessionCount_status,cumulativeSessionCount_reasons/,
  );
  assert.match(csv, /aggregationMode,auto/);
  assert.match(csv, /asOf,2026-11-04T01:30:00Z/);
  assert.doesNotMatch(csv, /upcoming/);
  assert.match(csv, /effectiveEnd,2026-11-04T01:30:00Z/);
  assert.match(
    overviewCsv(autoOverview(), "org", "now"),
    /0.000000000003,complete/,
  );
});

test("자동과 일별 팀 탭은 비용/토큰만 선택하며 세션 데이터는 보존한다", () => {
  const model = presentTeams(autoTeams());
  const html = renderToStaticMarkup(
    createElement(TeamAxisPanel, {
      model,
      axis: "cost",
      onAxisChange: () => {},
      hidden: {},
      onToggleTeam: () => {},
      onOpenTeam: () => {},
    }),
  );
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.equal(model.axes.session.total, "4");
});

test("팀 다음 페이지의 snapshot/간격/시간축을 검증하며 상세와 사용자도 같은 metadata를 요구한다", async () => {
  const first = autoTeamsResponse();
  first.teams.nextOffset = 1;
  first.teams.totalCount = 2;
  const second = structuredClone(first);
  second.teams.nextOffset = null;
  second.teams.items[0].teamId = "other";
  second.meta.trendAggregation!.asOf = "2026-11-03T18:31:00Z";
  await assert.rejects(
    fetchTeams(org, period, undefined, async (path, schema) =>
      schema.parse(path.includes("offset=") ? second : first),
    ),
    ManagementError,
  );
  const detail = {
    meta: second.meta,
    comparison: first.comparison,
    team: first.teams.items[0],
  };
  await assert.rejects(
    fetchTeamDetail(
      org,
      "team-a",
      period,
      first.meta.snapshotId,
      undefined,
      async (_path, schema) => schema.parse(detail),
      first.meta,
    ),
    ManagementError,
  );
});

test("개요는 auto 요청에 day 응답을 받으면 수용하지 않는다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(autoOverview()), { status: 200 });
  try {
    await assert.rejects(
      fetchOverview({
        organizationId: org,
        startDate: period.startDate,
        endDate: period.endDate,
        timeZone: "Asia/Seoul",
        compare: "none",
        bucket: "day",
      }),
      /조회 조건/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("자동 값 결손을 사용 여부나 이전 일별 공백으로 추정하지 않는다", () => {
  const view = autoTeams();
  const point = teamAutoPointSchema.parse({
    ...contract.expected.teamTrend[2],
    ...contract.metricCases[0].expectedFinalCumulative,
  });
  view.teams[0].trend[1] = {
    ...point,
    bucketStart: contract.expected.teamTrend[1].bucketStart,
    bucketEnd: contract.expected.teamTrend[1].bucketEnd,
  };
  view.teams[0].trend[2] = point;
  const feedback = presentTeams(view).trendFeedback.cost;
  assert.doesNotMatch(feedback.series[0].notes[1], /사용 여부|이전 날짜/);
  assert.doesNotMatch(feedback.series[0].notes[2], /사용 여부|이전 날짜/);
  const overview = autoOverview();
  if (overview.trend?.bucket !== "auto") throw Error();
  overview.trend.points[2].equivalentCostUsd = {
    value: null,
    status: "unavailable",
    reasons: ["pricing_missing"],
  };
  overview.trend.points[2].knownEquivalentCostUsd = {
    value: null,
    status: "unavailable",
    reasons: ["pricing_missing"],
  };
  assert.doesNotMatch(
    presentOverview(overview).chart.feedback!.series[0].notes[2],
    /사용 여부|이전 날짜/,
  );
});

test("기본 자동 조회는 bucket 없이 요청하고 자동 응답을 검증한다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      new URL(String(input), "http://localhost").searchParams.has("bucket"),
      false,
    );
    return Response.json(autoOverview());
  };
  try {
    await fetchOverview({ organizationId: org, ...period });
  } finally {
    globalThis.fetch = original;
  }
  await fetchTeams(org, period, undefined, async (path, schema) => {
    assert.equal(
      new URL(path, "http://localhost").searchParams.has("bucket"),
      false,
    );
    return schema.parse(autoTeamsResponse());
  });
});
