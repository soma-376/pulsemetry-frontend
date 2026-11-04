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
  configuredTrendBucket,
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
  ...contract.request,
  bucket: "auto" as const,
  compare: "none" as const,
};
const org = "11111111-1111-4111-8111-111111111111";
for (const [days, interval, count] of [
  [1, 3600, 24],
  [2, 3600, 48],
  [3, 10800, 24],
  [7, 10800, 56],
  [8, 21600, 32],
  [15, 21600, 60],
  [16, 43200, 32],
  [30, 43200, 60],
  [31, 86400, 31],
  [60, 86400, 60],
  [61, 259200, 21],
  [180, 259200, 60],
  [181, 604800, 26],
  [366, 604800, 53],
]) {
  test(`${days}일 자동 간격 ${interval}초 · ${count}개와 마지막 짧은 구간`, () => {
    const start = Date.parse("2025-01-01T00:00:00+09:00"),
      end = start + days * DAY;
    const meta = {
      startDate: "2025-01-01",
      endDate: iso(Date.parse("2025-01-01") + (days - 1) * DAY).slice(0, 10),
      dayCount: days,
    };
    const aggregation = trendAggregationSchema.parse({
      mode: "auto",
      intervalSeconds: interval,
      valueMode: "interval",
      rangeStart: iso(start),
      rangeEnd: iso(end),
      asOf: iso(end),
    });
    const points: AutoPoint[] = Array.from({ length: count }, (_, i) => ({
      bucketStart: iso(start + i * interval * 1000),
      bucketEnd: iso(Math.min(end, start + (i + 1) * interval * 1000)),
      temporalState: "elapsed",
      usageRows: 0,
      pricedUsageRows: 0,
      unpricedUsageRows: 0,
    }));
    assert.equal(validAutoTrend(meta, aggregation, "interval", points), true);
    assert.equal(
      validAutoTrend(
        meta,
        { ...aggregation, intervalSeconds: interval * 2 },
        "interval",
        points,
      ),
      false,
    );
    assert.equal(
      validAutoTrend(meta, aggregation, "interval", points.slice(1)),
      false,
    );
    const timeline = trendTimeline(
      { ...aggregation, valueMode: "cumulative" },
      points,
    );
    assert.equal(timeline.positions.at(-1), 100);
    if (days === 61)
      assert.ok(
        Math.abs(
          timeline.positions.at(-1)! - timeline.positions.at(-2)! - 100 / 61,
        ) < 1e-10,
      );
  });
}

test("빌드 gate는 true만 자동 요청하며 cache에 day/auto를 구분한다", () => {
  const original = process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED;
  try {
    delete process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED;
    assert.equal(configuredTrendBucket(), "day");
    process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED = "false";
    assert.equal(configuredTrendBucket(), "day");
    process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED = "true";
    assert.equal(configuredTrendBucket(), "auto");
  } finally {
    if (original === undefined)
      delete process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED;
    else process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED = original;
  }
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
  assert.deepEqual(chart.cost.slice(0, 5), [3e-12, null, 0.3, 0, null]);
  assert.equal(chart.timeline?.positions[3], 12.5);
  const model = presentTeams(teams, "1900-01-01");
  assert.deepEqual(model.trend.cost[0].values.slice(0, 5), [
    3e-12,
    3e-12,
    0.300000000003,
    0.300000000003,
    null,
  ]);
  assert.deepEqual(cumulative(teams.teams[0].trend, "session").slice(0, 5), [
    1,
    1,
    3,
    4,
    null,
  ]);
  assert.deepEqual(
    knownCumulative(teams.teams[0].trend, "cost"),
    model.knownTrend.cost[0].values,
  );
  assert.equal(model.timeline?.positions[3], (3.5 / 24) * 100);
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
  assert.match(html, /2026-11-04 00:00 ~ 2026-11-04 01:00 KST/);
  assert.match(html, /\$0\.000000000003/);
  assert.match(model.trendFeedback.cost.series[0].notes[3], /집계 중/);
  assert.match(model.trendFeedback.cost.series[0].notes[4], /도래하지/);
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
    if (d.trend?.bucket === "auto") d.trend.points[4].usageRows = 0;
  });
  mutate((d) => {
    if (d.trend?.bucket === "auto")
      d.trend.points[4].equivalentCostUsd = {
        value: "0",
        status: "complete",
        reasons: [],
      };
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

test("정각 asOf는 해당 시작 버킷 집계 중이며 미래 null 계약을 검증한다", () => {
  const base = contract.expected.teamMeta.trendAggregation;
  const metadata = {
    startDate: period.startDate,
    endDate: period.endDate,
    dayCount: 1,
  };
  for (const offset of [-1, 0, 1]) {
    const asOf =
      Date.parse(contract.expected.teamTrend[3].bucketStart) + offset;
    const points = contract.expected.teamTrend.map((p) => {
      const temporalState =
        Date.parse(p.bucketEnd) <= asOf
          ? ("elapsed" as const)
          : Date.parse(p.bucketStart) <= asOf
            ? ("in_progress" as const)
            : ("upcoming" as const);
      return {
        ...p,
        temporalState,
        usageRows: temporalState === "upcoming" ? null : 0,
        pricedUsageRows: temporalState === "upcoming" ? null : 0,
        unpricedUsageRows: temporalState === "upcoming" ? null : 0,
      };
    });
    assert.equal(
      validAutoTrend(
        metadata,
        trendAggregationSchema.parse({ ...base, asOf: iso(asOf) }),
        "cumulative",
        points,
      ),
      true,
    );
    assert.equal(
      points[3].temporalState,
      offset < 0 ? "upcoming" : "in_progress",
    );
  }
});

test("auto 빈 기간도 24개 축을 수용하되 임의 0을 만들지 않는다", () => {
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
  assert.equal(presentOverview(data).chart.cost.length, 24);
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
    /chart_trend,team-a,자동 집계 팀,2026-11-03T17:00:00Z,2026-11-03T18:00:00Z,elapsed,2,cost,strict,0.300000000003,complete,/,
  );
  assert.match(
    csv,
    /cumulativeSessionCount_status,cumulativeSessionCount_reasons/,
  );
  assert.match(csv, /aggregationMode,auto/);
  assert.match(csv, /asOf,2026-11-03T18:30:00Z/);
  assert.match(csv, /upcoming,,cost,strict,,unavailable,upcoming/);
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
