import { test } from "node:test";
import assert from "node:assert/strict";
import { ManagementError } from "../src/lib/api/management";
import {
  fetchTeamDetail,
  fetchTeams,
  fetchTeamUsers,
  type TeamAnalytics,
  type TeamsView,
  type TeamUsersPage,
} from "../src/lib/api/teams";
import {
  cumulative,
  presentTeams,
  presentUsers,
  teamDetail,
} from "../src/lib/metrics/teams-presentation";

/*
 * 기대값은 팀 분석 요청서(docs/api/teams-api.md "화면과 필드 대응")와 대시보드 명세("팀 누적 세션", "제품별 사용")의 규칙에서 쓴다.
 */
const ORG = "11111111-1111-4111-8111-111111111111";
const period = {
  startDate: "2026-09-07",
  endDate: "2026-09-09",
  compare: "prev_week" as const,
};
const days = ["2026-09-07", "2026-09-08", "2026-09-09"];
type Usage = {
  activeUsers: number | null;
  sessionCount: number | null;
  equivalentCostUsd: string | null;
  tokens: {
    inputUncached: null;
    output: null;
    cacheRead: null;
    cacheWrite: null;
    total: number | null;
  };
};
const usage = (
  cost: string | null,
  users: number | null,
  sessions: number | null,
  tokens: number | null,
): Usage => ({
  activeUsers: users,
  sessionCount: sessions,
  equivalentCostUsd: cost,
  tokens: {
    inputUncached: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    total: tokens,
  },
});
const point = (
  date: string,
  cost: string | null,
  tokens: number | null,
  sessions: number | null,
  observation: "complete" | "partial" | "unobserved" = "complete",
) => ({
  date,
  status:
    observation === "unobserved"
      ? ("unavailable" as const)
      : observation === "partial"
        ? ("partial" as const)
        : ("complete" as const),
  reasons:
    observation === "unobserved"
      ? ["no_data"]
      : observation === "partial"
        ? ["current_period_incomplete"]
        : [],
  observation,
  equivalentCostUsd: cost,
  totalTokens: tokens,
  cumulativeSessionCount: sessions,
});
const product = (
  kind: string | null,
  cost: string | null,
  tokens: number | null,
  sessions: number | null,
  users: number | null = 1,
) => ({
  kind,
  displayName:
    kind === "claude_team"
      ? "Claude (Anthropic)"
      : kind === "openai_biz"
        ? "ChatGPT / Codex (OpenAI)"
        : null,
  activeUsers: users,
  sessionCount: sessions,
  totalTokens: tokens,
  equivalentCostUsd: cost,
});
const value = <T>(value: T | null) => ({
  value,
  status: value === null ? ("unavailable" as const) : ("complete" as const),
  reasons: value === null ? ["no_data"] : [],
});
const divide = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || b === 0 ? null : a / b;
const n = (a: string | null | undefined) => (a == null ? null : Number(a));
const money = (a: number | null) => (a == null ? null : a.toFixed(6));
const metric = <T extends string | number>(
  current: T | null,
  previous: T | null,
  convert: (n: number) => T,
) => ({
  ...value(current),
  comparison:
    current === null || previous === null
      ? {
          status: "unavailable" as const,
          reasons: ["no_data"],
          previousValue: null,
          absoluteChange: null,
          percentChange: null,
          change: null,
        }
      : {
          status: "available" as const,
          reasons: [],
          previousValue: previous,
          absoluteChange: convert(Number(current) - Number(previous)),
          percentChange:
            Number(previous) === 0
              ? Number(current) === 0
                ? 0
                : null
              : ((Number(current) - Number(previous)) / Number(previous)) * 100,
          change:
            Number(current) === Number(previous)
              ? ("unchanged" as const)
              : Number(previous) === 0
                ? ("new" as const)
                : Number(current) > Number(previous)
                  ? ("increase" as const)
                  : ("decrease" as const),
        },
});
/** 원시 숫자는 fixture 작성용이며 HTTP 응답은 화면 지표만 갖는다. */
const metrics = (
  current: Usage | null,
  previous: Usage | null = null,
): TeamAnalytics["metrics"] => ({
  activeUsers: value(current?.activeUsers ?? null),
  equivalentCostUsd: metric(
    current?.equivalentCostUsd ?? null,
    previous?.equivalentCostUsd ?? null,
    (n) => n.toFixed(6),
  ),
  sessionCount: metric(
    current?.sessionCount ?? null,
    previous?.sessionCount ?? null,
    (n) => n,
  ),
  totalTokens: metric(
    current?.tokens.total ?? null,
    previous?.tokens.total ?? null,
    (n) => n,
  ),
  equivalentCostPerUserUsd: metric(
    money(divide(n(current?.equivalentCostUsd), current?.activeUsers)),
    money(divide(n(previous?.equivalentCostUsd), previous?.activeUsers)),
    (n) => n.toFixed(6),
  ),
  equivalentCostPerSessionUsd: value(
    money(divide(n(current?.equivalentCostUsd), current?.sessionCount)),
  ),
  tokensPerUser: value(divide(current?.tokens.total, current?.activeUsers)),
  sessionsPerUser: value(divide(current?.sessionCount, current?.activeUsers)),
  tokensPerSession: value(divide(current?.tokens.total, current?.sessionCount)),
  effectiveCostPerMillionTokensUsd: value(
    money(
      divide(
        n(current?.equivalentCostUsd),
        current?.tokens.total === null || current?.tokens.total === undefined
          ? null
          : current.tokens.total / 1_000_000,
      ),
    ),
  ),
});
type TeamFixture = Partial<TeamAnalytics> & {
  current?: Usage | null;
  previous?: Usage | null;
};
const team = (
  teamId: string | null,
  teamName: string,
  extra: TeamFixture = {},
): TeamAnalytics => {
  const {
    current = usage("0.000000", 0, 0, 0),
    previous = usage("0.000000", 0, 0, 0),
    ...fields
  } = extra;
  return {
    teamId,
    teamName,
    metrics: metrics(current, previous),
    modelMix: {
      availability: "available",
      reason: null,
      data: {
        sessionMixAvailable: false,
        sessionMixReason: "multi_model_sessions",
        models: [],
      },
    },
    trend: days.map((date) => point(date, "0.000000", 0, 0)),
    products: [],
    ...fields,
  };
};
const meta = (snapshotId = "snapshot-1") => ({
  organizationId: ORG,
  startDate: period.startDate,
  endDate: period.endDate,
  timeZone: "Asia/Seoul" as const,
  dayCount: 3,
  dataThrough: "2026-09-09T15:00:00Z",
  dataState: "ready" as const,
  currentCoverage: { status: "complete" as const, observedDays: 3 },
  snapshotId,
});
const view = (
  teams: TeamAnalytics[],
  extra: Omit<Partial<TeamsView>, "totals"> & {
    totals?:
      | TeamAnalytics["metrics"]
      | { current: Usage | null; previous: Usage | null };
  } = {},
): TeamsView => {
  const { totals, ...fields } = extra;
  return {
    meta: meta(),
    comparison: {
      mode: "prev_week",
      status: "available",
      reason: null,
      startDate: "2026-08-31",
      endDate: "2026-09-02",
      coverage: { status: "complete", observedDays: 3 },
    },
    attributionBasis: "event_time",
    totals: totals
      ? "current" in totals
        ? metrics(totals.current, totals.previous)
        : totals
      : metrics(
          usage("30.000000", 5, 12, 3_000_000),
          usage("20.000000", 4, 10, 2_000_000),
        ),
    sort: "cost",
    teams,
    unassigned: team(null, "미배정"),
    modelScatter: {
      availability: "available",
      reason: null,
      data: { teamUsageCostShareThreshold: 0.05, models: [] },
    },
    ...fields,
  };
};

test("기간에 데이터가 없으면 등록된 팀이 남아 있어도 빈 화면으로 표시한다", () => {
  for (const dataState of ["no_data", "never_observed"] as const) {
    const data = view([team("team-1", "플랫폼")], {
      meta: {
        ...meta(),
        dataState,
        currentCoverage: { status: "none", observedDays: 0 },
      },
      totals: { current: null, previous: null },
    });
    assert.equal(presentTeams(data).isEmpty, true);
    assert.equal(
      presentTeams(data).neverObserved,
      dataState === "never_observed",
    );
  }
  // 완전하게 관측한 실제 0은 빈 기간과 구별한다.
  assert.equal(presentTeams(view([team("team-1", "플랫폼")])).isEmpty, false);
});

test("누적 추이: 세션은 서버 누적값을 그대로 쓰고, 비용·토큰은 일별 값을 더하되 값이 없는 날부터 선을 끊는다", () => {
  // 여러 날에 걸친 세션은 서버가 한 번만 센다 — 일별 값을 더하면 3이 아니라 더 큰 값이 된다.
  const trend = [
    point("2026-09-07", "1.500000", 100, 2),
    point("2026-09-08", null, null, null, "unobserved"),
    point("2026-09-09", "2.000000", 50, null),
  ];
  assert.deepEqual(cumulative(trend, "session"), [2, null, null]);
  assert.deepEqual(cumulative(trend, "cost"), [1.5, null, null]);
  assert.deepEqual(cumulative(trend, "token"), [100, null, null]);
  const whole = [
    point("2026-09-07", "1.000000", 10, 1),
    point("2026-09-08", "0.000000", 0, 1),
    point("2026-09-09", "2.500000", 5, 3),
  ];
  assert.deepEqual(cumulative(whole, "cost"), [1, 1, 3.5]);
  assert.deepEqual(cumulative(whole, "session"), [1, 1, 3]);
});

test("팀 표: 사용자당·단가 열은 서버 값의 비율이고 분모가 없거나 0이면 비운다", () => {
  const model = presentTeams(
    view([
      team("team-a", "플랫폼", {
        current: usage("20.000000", 4, 8, 2_000_000),
        previous: usage("10.000000", 2, 8, 1_000_000),
      }),
      team("team-b", "데이터", {
        current: usage("10.000000", 0, null, null),
        previous: usage("0.000000", 0, 0, 0),
      }),
    ]),
  );
  const cost = model.axes.cost.rows,
    token = model.axes.token.rows,
    session = model.axes.session.rows;
  assert.deepEqual(
    cost.map((row) => [
      row.team,
      row.totalValue,
      row.perUserValue,
      row.unitValue,
    ]),
    [
      ["플랫폼", 20, 5, 2.5],
      ["데이터", 10, null, null],
    ],
  );
  assert.deepEqual(
    cost.map((row) => [row.v1, row.v2, row.v3]),
    [
      ["$20.00", "$5.00", "$2.50"],
      ["$10.00", "-", "-"],
    ],
  );
  // 백만 토큰당 비용 = 비용 / 토큰 × 1,000,000, 세션당 토큰 = 토큰 / 세션.
  assert.deepEqual(
    token.map((row) => [row.totalValue, row.unitValue, row.v1]),
    [
      [2_000_000, 10, "2.0M"],
      [null, null, "-"],
    ],
  );
  assert.deepEqual(
    session.map((row) => [row.totalValue, row.unitValue]),
    [
      [8, 250_000],
      [null, null],
    ],
  );
  // 증감은 같은 팀의 이전 값 대비. 이전 0이면 비율이 아니라 신규다.
  assert.deepEqual(
    cost.map((row) => row.delta),
    ["+100.0%", "신규"],
  );
  assert.deepEqual(
    session.map((row) => row.delta),
    ["+0.0%", "-"],
  );
  assert.equal(model.axes.cost.total, "$30.00");
  assert.equal(model.axes.cost.delta, "+50.0%");
  assert.equal(model.showDelta, true);
});

test("비교를 내지 않은 응답은 증감을 그리지 않고 사유를 남긴다", () => {
  // 이전 값이 실려 와도 서버가 비교를 내지 않았으면 증감을 만들지 않는다.
  const partial = presentTeams(
    view(
      [
        team("team-a", "플랫폼", {
          current: usage("20.000000", 4, 8, 2_000_000),
          previous: usage("10.000000", 4, 8, 1),
        }),
      ],
      {
        meta: {
          ...meta(),
          dataState: "partial",
          currentCoverage: { status: "partial", observedDays: 2 },
        },
        comparison: {
          mode: "prev_week",
          status: "unavailable",
          reason: "source_not_available",
          startDate: "2026-08-31",
          endDate: "2026-09-02",
          coverage: { status: "complete", observedDays: 3 },
        },
        totals: {
          current: usage("20.000000", 4, 8, 2_000_000),
          previous: null,
        },
      },
    ),
  );
  assert.equal(partial.showDelta, false);
  assert.deepEqual(
    partial.axes.cost.rows.map((row) => [row.delta, row.deltaValue]),
    [["-", null]],
  );
  assert.equal(partial.axes.cost.delta, "");
  assert.equal(
    partial.comparisonReason,
    "선택 기간에 수집 근거가 완전하지 않은 날이 있습니다",
  );
  assert.match(partial.headerNote, /선택 3일 중 2일 관측/);
  const none = presentTeams(
    view([team("team-a", "플랫폼")], {
      comparison: { mode: "none", status: "disabled", reason: null },
    }),
  );
  assert.equal(none.compareLabel, "");
  assert.equal(none.comparisonReason, "");
});

test("미배정은 실제 사용이 있을 때만 행이 되고 막대는 팀 색을 쓰지 않는다", () => {
  const withoutUsage = presentTeams(
    view([team("team-a", "플랫폼", { current: usage("1.000000", 1, 1, 10) })]),
  );
  assert.deepEqual(
    withoutUsage.axes.cost.rows.map((row) => row.key),
    ["team-a"],
  );
  const withUsage = presentTeams(
    view([team("team-a", "플랫폼", { current: usage("1.000000", 1, 1, 10) })], {
      unassigned: team(null, "미배정", {
        current: usage("3.000000", 1, 1, 10),
      }),
    }),
  );
  const unassigned = withUsage.axes.cost.rows.find(
    (row) => row.key === "unassigned",
  )!;
  assert.deepEqual(
    [unassigned.team, unassigned.unmapped, unassigned.fill],
    ["미배정", true, "var(--gray)"],
  );
  // 선 색은 비용 순서로 배정한다(미배정 3 > 플랫폼 1).
  assert.deepEqual(
    withUsage.teams.map((item) => item.key),
    ["unassigned", "team-a"],
  );
  assert.equal(withUsage.isEmpty, false);
  assert.equal(presentTeams(view([])).isEmpty, true);
});

test("제품 비중: 조각은 서버의 팀·제품 값이고 매핑 없는 관측은 미확인 제품으로 끝에 둔다", () => {
  const model = presentTeams(
    view([
      team("team-a", "플랫폼", {
        current: usage("10.000000", 2, 4, null),
        products: [
          product("claude_team", "6.000000", 300, 3),
          product("openai_biz", "3.000000", 200, 1),
          product(null, "1.000000", null, null),
        ],
      }),
      team("team-b", "데이터", {
        current: usage("5.000000", 1, 2, 100),
        products: [product("claude_team", "5.000000", 100, 2)],
      }),
    ]),
  );
  const cost = model.productMix("cost");
  assert.deepEqual(
    cost.legend.map((item) => item.name),
    ["Claude (Anthropic)", "ChatGPT / Codex (OpenAI)", "미확인 제품"],
  );
  assert.deepEqual(
    cost.columns.map((column) => [
      column.team,
      column.totalText,
      column.segments.map((segment) => [segment.key, segment.share]),
    ]),
    [
      [
        "플랫폼",
        "$10.00",
        [
          ["claude_team", 0.6],
          ["openai_biz", 0.3],
          ["__unmapped", 0.1],
        ],
      ],
      ["데이터", "$5.00", [["claude_team", 1]]],
    ],
  );
  assert.equal(cost.columns[0].topText, "Claude (Anthropic) 60%");
  // 팀 토큰 합계가 없으면(의미가 다른 토큰) 제품 토큰을 쌓아 비중을 만들지 않는다.
  const token = model.productMix("token");
  assert.deepEqual(
    token.columns.map((column) => [
      column.team,
      column.totalText,
      column.segments.length,
      column.topText,
    ]),
    [
      ["데이터", "100", 1, "Claude (Anthropic) 100%"],
      ["플랫폼", "-", 0, "비중 확인 불가"],
    ],
  );
  assert.equal(token.incomplete, true);
  // 세션 축은 제품별 세션 수(세션 키에 제품이 들어 있어 팀 세션을 나눈다).
  assert.deepEqual(
    model
      .productMix("session")
      .columns.find((column) => column.team === "플랫폼")!.segments.length,
    0,
  );
  const drawer = model.details.find((detail) => detail.key === "team-a")!;
  assert.deepEqual(
    drawer.products.map((item) => [item.name, item.share]),
    [
      ["Claude (Anthropic)", 60],
      ["ChatGPT / Codex (OpenAI)", 30],
      ["미확인 제품", 10],
    ],
  );
});

test("모델 산점도는 금액·토큰이 있는 모델만 점으로 그리고 평균 단가는 조직 합계에서 낸다", () => {
  const model = presentTeams(
    view([team("team-a", "플랫폼", { current: usage("1.000000", 1, 1, 1) })], {
      modelScatter: {
        availability: "partial",
        reason: "source_not_available",
        data: {
          teamUsageCostShareThreshold: 0.05,
          models: [
            {
              status: "complete",
              reasons: [],
              modelId: "m1",
              displayName: "Model 1",
              equivalentCostUsd: "20.000000",
              totalTokens: 2_000_000,
              usingTeamCount: 2,
            },
            {
              status: "complete",
              reasons: [],
              modelId: "m2",
              displayName: "Model 2",
              equivalentCostUsd: null,
              totalTokens: 500,
              usingTeamCount: null,
            },
          ],
        },
      },
    }),
  );
  assert.deepEqual(
    model.scatter.points.map((item) => [
      item.key,
      item.x,
      item.y,
      item.size,
      item.sub,
    ]),
    [["m1", 2, 20, 18, "$10.00/M"]],
  );
  assert.equal(model.scatter.avgPerM, 10);
  assert.match(model.scatter.note, /모델 1개는 점으로 그리지 않습니다/);
});

test("드로어: 증가 기여는 두 기간이 모두 있을 때만, 모델 비중은 팀 금액 대비다", () => {
  const analytics = team("team-a", "플랫폼", {
    current: usage("20.000000", 4, 8, 2_000_000),
    previous: usage("15.000000", 5, 6, 1),
    modelMix: {
      availability: "available",
      reason: null,
      data: {
        sessionMixAvailable: false,
        sessionMixReason: "multi_model_sessions",
        models: [
          {
            status: "complete",
            reasons: [],
            modelId: "m1",
            displayName: "Model 1",
            equivalentCostUsd: "15.000000",
            totalTokens: 1,
          },
          {
            status: "complete",
            reasons: [],
            modelId: "m2",
            displayName: "Model 2",
            equivalentCostUsd: null,
            totalTokens: 1,
          },
        ],
      },
    },
  });
  const detail = teamDetail(analytics, true);
  assert.deepEqual(
    [detail.contribText, detail.perUserText, detail.perUserDelta],
    ["+$5.00", "$5.00", "+66.7%"],
  );
  assert.deepEqual(
    detail.models.map((item) => item.share),
    [75, null],
  );
  assert.deepEqual(
    [
      teamDetail(analytics, false).contribText,
      teamDetail(analytics, false).perUserDelta,
    ],
    ["-", "-"],
  );
});

const userPage = (
  items: TeamUsersPage["users"]["items"],
  nextOffset: number | null,
  total = 3,
): TeamUsersPage => ({
  meta: meta(),
  team: { teamId: "team-a", teamName: "플랫폼" },
  summary: {
    usage: {
      activeUsers: value(3),
      sessionCount: value(9),
      totalTokens: value(900),
      equivalentCostUsd: value("30.000000"),
    },
    averageEquivalentCostUsd: "10.000000",
    cacheHitRatio: value(0.25),
    unidentifiedEquivalentCostUsd: "2.000000",
  },
  users: { items, totalCount: total, nextOffset },
});
const user = (
  id: string,
  cost: string | null,
  lastUsedAt: string | null = "2026-09-09T01:00:00Z",
) => ({
  memberId: id,
  account: `${id}@example.test`,
  usage: {
    equivalentCostUsd: value(cost),
    sessionCount: value(3),
    totalTokens: value(300),
  },
  lastUsedAt,
  mainModel: { modelId: "m1", displayName: "Model 1" },
  cacheHitRatio: value(0.5),
});

test("사용자 표: 평균 대비는 서버 평균과의 차이이고 금액을 모르는 사용자가 있으면 합계를 만들지 않는다", () => {
  const data = presentUsers([
    userPage([user("u1", "15.000000"), user("u2", "10.000000")], 1),
    userPage([user("u3", null, "2026-09-01T01:00:00Z")], null),
  ]);
  assert.deepEqual(
    data.rows.map((row) => [row.account, row.deviationText, row.last]),
    [
      ["u1@example.test", "+50%", "9/9"],
      ["u2@example.test", "", "9/9"],
      ["u3@example.test", "-", "9/1"],
    ],
  );
  assert.equal(data.rows[2].lastColor, "var(--orange-ink)");
  assert.equal(
    data.sumNote(data.rows.slice(0, 2)),
    "2명 합계 $25.00 · 팀 전체 $30.00 · 미식별 $2.00",
  );
  assert.equal(
    data.sumNote(data.rows),
    "3명 합계 - · 팀 전체 $30.00 · 미식별 $2.00",
  );
  assert.deepEqual(
    data.stats.map((stat) => stat.value),
    ["3", "9", "900", "$30.00", "25%"],
  );
  assert.equal(data.totalCount, 3);
});

const listPage = (
  items: TeamAnalytics[],
  total: number,
  nextOffset: number | null,
  snapshotId = "snapshot-1",
) => ({
  ...view(items),
  meta: meta(snapshotId),
  teams: { items, totalCount: total, nextOffset },
});

async function withFetch<T>(
  handler: (url: URL) => Response,
  run: (urls: URL[]) => Promise<T>,
) {
  const original = global.fetch,
    urls: URL[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    urls.push(url);
    return handler(url);
  };
  try {
    return await run(urls);
  } finally {
    global.fetch = original;
  }
}

test("팀 목록은 모든 페이지를 같은 snapshot으로 읽는다", async () => {
  await withFetch(
    (url) =>
      Response.json(
        url.searchParams.get("offset") === "1"
          ? listPage([team("team-b", "데이터")], 2, null)
          : listPage([team("team-a", "플랫폼")], 2, 1),
      ),
    async (urls) => {
      const result = await fetchTeams(ORG, period);
      assert.deepEqual(
        result.teams.map((item) => item.teamId),
        ["team-a", "team-b"],
      );
      assert.equal(urls.length, 2);
      assert.deepEqual(
        [
          urls[0].searchParams.get("sort"),
          urls[0].searchParams.get("limit"),
          urls[0].searchParams.get("compare"),
          urls[0].searchParams.get("snapshotId"),
        ],
        ["cost", "50", "prev_week", null],
      );
      assert.deepEqual(
        [
          urls[1].searchParams.get("offset"),
          urls[1].searchParams.get("snapshotId"),
        ],
        ["1", "snapshot-1"],
      );
    },
  );
});

test("다른 snapshot의 페이지·빠진 날짜·개수 불일치는 버리고, snapshot 만료는 첫 페이지부터 한 번만 다시 읽는다", async () => {
  await withFetch(
    (url) =>
      Response.json(
        url.searchParams.get("offset")
          ? listPage([team("team-b", "데이터")], 2, null, "snapshot-2")
          : listPage([team("team-a", "플랫폼")], 2, 1),
      ),
    async () =>
      assert.rejects(
        fetchTeams(ORG, period),
        (error) =>
          error instanceof ManagementError && error.code === "invalid_response",
      ),
  );
  await withFetch(
    () =>
      Response.json(
        listPage(
          [
            team("team-a", "플랫폼", {
              trend: [point("2026-09-07", null, null, null)],
            }),
          ],
          1,
          null,
        ),
      ),
    async () =>
      assert.rejects(
        fetchTeams(ORG, period),
        (error) =>
          error instanceof ManagementError && error.code === "invalid_response",
      ),
  );
  await withFetch(
    () => Response.json(listPage([team("team-a", "플랫폼")], 2, null)),
    async () =>
      assert.rejects(
        fetchTeams(ORG, period),
        (error) =>
          error instanceof ManagementError && error.code === "invalid_response",
      ),
  );
  let firstPages = 0;
  const expired = () =>
    Response.json(
      { error: { code: "snapshot_expired", message: "expired" } },
      { status: 409 },
    );
  await withFetch(
    (url) => {
      if (!url.searchParams.get("offset")) {
        firstPages++;
        return Response.json(
          listPage([team("team-a", "플랫폼")], 2, 1, `snapshot-${firstPages}`),
        );
      }
      return firstPages === 1
        ? expired()
        : Response.json(
            listPage([team("team-b", "데이터")], 2, null, "snapshot-2"),
          );
    },
    async () => {
      const result = await fetchTeams(ORG, period);
      assert.equal(result.meta.snapshotId, "snapshot-2");
      assert.equal(firstPages, 2);
    },
  );
  await withFetch(
    (url) =>
      url.searchParams.get("offset")
        ? expired()
        : Response.json(listPage([team("team-a", "플랫폼")], 2, 1)),
    async () =>
      assert.rejects(
        fetchTeams(ORG, period),
        (error) =>
          error instanceof ManagementError && error.code === "snapshot_expired",
      ),
  );
});

test("상세와 사용자는 목록의 snapshot을 넘기고 다른 팀의 응답을 버린다", async () => {
  await withFetch(
    (url) =>
      url.pathname.endsWith("/users")
        ? Response.json(userPage([user("u1", "1.000000")], null, 1))
        : Response.json({
            meta: meta(),
            comparison: view([]).comparison,
            team: team("team-a", "플랫폼"),
          }),
    async (urls) => {
      assert.equal(
        (await fetchTeamDetail(ORG, "team-a", period, "snapshot-1")).teamId,
        "team-a",
      );
      await assert.rejects(
        fetchTeamDetail(ORG, "team-b", period, "snapshot-1"),
        (error) =>
          error instanceof ManagementError && error.code === "invalid_response",
      );
      const page = await fetchTeamUsers(ORG, "team-a", period, "snapshot-1", 9);
      assert.equal(page.users.items.length, 1);
      assert.match(urls[0].pathname, /\/analytics\/teams\/team-a$/);
      assert.deepEqual(
        [
          urls[2].searchParams.get("snapshotId"),
          urls[2].searchParams.get("offset"),
          urls[2].searchParams.get("limit"),
        ],
        ["snapshot-1", "9", "12"],
      );
    },
  );
});

test("화면은 서버가 준 지표별 비교 불가와 파생 값의 상태를 유지한다", () => {
  const analytics = team("team-a", "플랫폼", {
    current: usage("20.000000", 4, 8, 2_000_000),
    previous: usage("10.000000", 2, 8, 1_000_000),
  });
  analytics.metrics.equivalentCostUsd.comparison = {
    status: "unavailable",
    reasons: ["pricing_version_mixed"],
    previousValue: null,
    absoluteChange: null,
    percentChange: null,
    change: null,
  };
  analytics.metrics.equivalentCostPerUserUsd = {
    ...analytics.metrics.equivalentCostPerUserUsd,
    value: null,
    status: "unavailable",
    reasons: ["member_identity_missing"],
  };
  const model = presentTeams(view([analytics]));
  assert.equal(model.axes.cost.rows[0].delta, "-");
  assert.equal(
    model.axes.cost.rows[0].perUserValue,
    null,
    "서버가 평균을 금지했으면 비용/인원으로 다시 만들지 않는다",
  );
  assert.equal(
    model.axes.session.rows[0].delta,
    "+0.0%",
    "다른 정상 지표의 비교는 유지한다",
  );
});

test("팀 추이는 날짜별 서버 사유를 전달하고 미래는 누락으로 표시하지 않는다", () => {
  const analytics = team("team-a", "플랫폼", {
    trend: [
      {
        ...point(days[0], "1", 100, 1, "partial"),
        reasons: ["collection_gap"],
      },
      point(days[1], null, null, null, "unobserved"),
      point(days[2], null, null, null, "unobserved"),
    ],
  });
  const model = presentTeams(view([analytics]), days[0]);
  assert.match(model.trendFeedback.cost.series[0].notes[0], /보고 공백/);
  assert.equal(
    model.trendFeedback.cost.series[0].notes[1],
    "아직 도래하지 않은 날짜입니다.",
  );
  assert.equal(
    model.trendNote("cost"),
    "",
    "미래의 null만으로 누적선이 끊겼다고 안내하지 않는다",
  );
  assert.deepEqual(model.trend.cost[0].values, [1, null, null]);
});

test("미배정은 no_data인 전부 null 값에서 숨기지만 식별·가격 누락만으로 숨기지 않는다", () => {
  const unassigned = team(null, "미배정", { current: null });
  const withoutData = presentTeams(
    view([team("team-a", "플랫폼")], { unassigned }),
  );
  assert.ok(
    withoutData.axes.cost.rows.every((row) => row.key !== "unassigned"),
  );
  for (const key of [
    "activeUsers",
    "sessionCount",
    "totalTokens",
    "equivalentCostUsd",
  ] as const) {
    unassigned.metrics[key].reasons = [
      "member_identity_missing",
      "pricing_missing",
    ];
  }
  const withUnknownUsage = presentTeams(
    view([team("team-a", "플랫폼")], { unassigned }),
  );
  assert.ok(
    withUnknownUsage.axes.cost.rows.some((row) => row.key === "unassigned"),
  );
  assert.equal(
    presentUsers([userPage([], null)]).stats.find((stat) => stat.key === "세션")
      ?.sub,
    "개",
  );
});

test("팀 추이의 토큰·가격·세션 결손은 해당 축에만 표시하고 다른 정상 축을 부분 집계로 낮추지 않는다", () => {
  const analytics = team("team-a", "플랫폼", {
    trend: [
      {
        ...point(days[0], "1", null, 28),
        status: "partial",
        reasons: [
          "token_semantics_incompatible",
          "token_data_incomplete",
          "no_data",
        ],
      },
      {
        ...point(days[1], null, 100, 30),
        status: "partial",
        reasons: ["pricing_missing"],
      },
      {
        ...point(days[2], "3", 200, null),
        status: "partial",
        reasons: ["session_identity_missing"],
      },
    ],
  });
  const model = presentTeams(view([analytics]), days[2]);
  const cost = model.trendFeedback.cost.series[0];
  const token = model.trendFeedback.token.series[0];
  const session = model.trendFeedback.session.series[0];
  assert.equal(
    cost.notes[0],
    "",
    "토큰 확인 불가가 정상 비용의 상태를 낮추지 않는다",
  );
  assert.equal(
    session.notes[0],
    "",
    "28개 세션에는 토큰 결손 사유를 표시하지 않는다",
  );
  assert.equal(session.observations?.[0], "complete");
  assert.equal(cost.observations?.[0], "complete");
  assert.match(token.notes[0], /토큰/);
  assert.match(cost.notes[1], /단가/);
  assert.doesNotMatch(token.notes[1], /단가/);
  assert.equal(session.notes[1], "");
  assert.match(session.notes[2], /세션/);
  assert.doesNotMatch(cost.notes[2], /세션/);
  assert.doesNotMatch(token.notes[2], /세션/);
  assert.deepEqual(session.values, [28, 30, null]);
});

test("팀 상세는 현재 값의 상태와 비교 불가 사유를 각각 보존한다", () => {
  const analytics = team("team-a", "플랫폼", {
    current: usage("20", 4, 8, null),
    previous: usage("10", 2, 4, 100),
  });
  analytics.metrics.equivalentCostUsd.status = "partial";
  analytics.metrics.equivalentCostUsd.reasons = ["collection_gap"];
  analytics.metrics.equivalentCostUsd.comparison = {
    status: "unavailable",
    reasons: ["collection_gap"],
    previousValue: null,
    absoluteChange: null,
    percentChange: null,
    change: null,
  };
  analytics.metrics.equivalentCostPerUserUsd.comparison = {
    status: "unavailable",
    reasons: ["previous_period_incomplete"],
    previousValue: null,
    absoluteChange: null,
    percentChange: null,
    change: null,
  };
  const detail = teamDetail(analytics, true);
  assert.equal(detail.costText, "$20.00");
  assert.equal(detail.statuses.cost?.label, "관측 근거 부족");
  assert.match(detail.statuses.cost?.reason ?? "", /보고 공백/);
  assert.equal(detail.statuses.users, undefined);
  assert.equal(detail.statuses.tokens?.label, "값 확인 불가");
  assert.equal(detail.statuses.sessions, undefined);
  assert.equal(detail.comparisons.contribution.status, "unavailable");
  assert.equal(detail.comparisons.perUser.status, "unavailable");
  assert.match(detail.comparisons.perUser.reason, /비교 기간/);
  assert.equal(detail.contribText, "-");
  assert.equal(detail.sessions, "8");
});
