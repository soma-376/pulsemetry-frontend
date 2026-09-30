import { test } from "node:test";
import assert from "node:assert/strict";
import { ManagementError } from "../src/lib/api/management";
import { fetchTeamDetail, fetchTeams, fetchTeamUsers, type TeamAnalytics, type TeamsView, type TeamUsersPage } from "../src/lib/api/teams";
import { cumulative, presentTeams, presentUsers, teamDetail } from "../src/lib/metrics/teams-presentation";

/*
 * 기대값은 팀 분석 요청서(docs/api/teams-api.md "화면과 필드 대응")와 대시보드 명세("팀 누적 세션", "제품별 사용")의 규칙에서 쓴다.
 */
const ORG = "11111111-1111-4111-8111-111111111111";
const period = { startDate: "2026-09-07", endDate: "2026-09-09", compare: "prev_week" as const };
const days = ["2026-09-07", "2026-09-08", "2026-09-09"];
type Usage = NonNullable<TeamAnalytics["current"]>;
const usage = (cost: string | null, users: number | null, sessions: number | null, tokens: number | null): Usage => ({
  activeUsers: users, sessionCount: sessions, equivalentCostUsd: cost,
  tokens: { inputUncached: null, output: null, cacheRead: null, cacheWrite: null, total: tokens },
});
const point = (date: string, cost: string | null, tokens: number | null, sessions: number | null, observation: "complete" | "partial" | "unobserved" = "complete") =>
  ({ date, observation, equivalentCostUsd: cost, totalTokens: tokens, cumulativeSessionCount: sessions });
const product = (kind: string | null, cost: string | null, tokens: number | null, sessions: number | null, users: number | null = 1) =>
  ({ kind, displayName: kind === "claude_team" ? "Claude (Anthropic)" : kind === "openai_biz" ? "ChatGPT / Codex (OpenAI)" : null, activeUsers: users, sessionCount: sessions, totalTokens: tokens, equivalentCostUsd: cost });
const team = (teamId: string | null, teamName: string, extra: Partial<TeamAnalytics> = {}): TeamAnalytics => ({
  teamId, teamName, current: usage("0.000000", 0, 0, 0), previous: usage("0.000000", 0, 0, 0),
  modelMix: { availability: "available", reason: null, data: { sessionMixAvailable: false, sessionMixReason: "multi_model_sessions", models: [] } },
  trend: days.map((date) => point(date, "0.000000", 0, 0)), products: [], ...extra,
});
const meta = (snapshotId = "snapshot-1") => ({
  organizationId: ORG, startDate: period.startDate, endDate: period.endDate, timeZone: "Asia/Seoul" as const, dayCount: 3,
  dataThrough: "2026-09-09T15:00:00Z", dataState: "ready" as const, currentCoverage: { status: "complete" as const, observedDays: 3 }, snapshotId,
});
const view = (teams: TeamAnalytics[], extra: Partial<TeamsView> = {}): TeamsView => ({
  meta: meta(), comparison: { mode: "prev_week", status: "available", reason: null, startDate: "2026-08-31", endDate: "2026-09-02", coverage: { status: "complete", observedDays: 3 } },
  attributionBasis: "event_time", totals: { current: usage("30.000000", 5, 12, 3_000_000), previous: usage("20.000000", 4, 10, 2_000_000) },
  sort: "cost", teams, unassigned: team(null, "미배정"),
  modelScatter: { availability: "available", reason: null, data: { teamUsageCostShareThreshold: 0.05, models: [] } }, ...extra,
});

test("누적 추이: 세션은 서버 누적값을 그대로 쓰고, 비용·토큰은 일별 값을 더하되 값이 없는 날부터 선을 끊는다", () => {
  // 여러 날에 걸친 세션은 서버가 한 번만 센다 — 일별 값을 더하면 3이 아니라 더 큰 값이 된다.
  const trend = [point("2026-09-07", "1.500000", 100, 2), point("2026-09-08", null, null, null, "unobserved"), point("2026-09-09", "2.000000", 50, null)];
  assert.deepEqual(cumulative(trend, "session"), [2, null, null]);
  assert.deepEqual(cumulative(trend, "cost"), [1.5, null, null]);
  assert.deepEqual(cumulative(trend, "token"), [100, null, null]);
  const whole = [point("2026-09-07", "1.000000", 10, 1), point("2026-09-08", "0.000000", 0, 1), point("2026-09-09", "2.500000", 5, 3)];
  assert.deepEqual(cumulative(whole, "cost"), [1, 1, 3.5]);
  assert.deepEqual(cumulative(whole, "session"), [1, 1, 3]);
});

test("팀 표: 사용자당·단가 열은 서버 값의 비율이고 분모가 없거나 0이면 비운다", () => {
  const model = presentTeams(view([
    team("team-a", "플랫폼", { current: usage("20.000000", 4, 8, 2_000_000), previous: usage("10.000000", 2, 8, 1_000_000) }),
    team("team-b", "데이터", { current: usage("10.000000", 0, null, null), previous: usage("0.000000", 0, 0, 0) }),
  ]));
  const cost = model.axes.cost.rows, token = model.axes.token.rows, session = model.axes.session.rows;
  assert.deepEqual(cost.map((row) => [row.team, row.totalValue, row.perUserValue, row.unitValue]), [["플랫폼", 20, 5, 2.5], ["데이터", 10, null, null]]);
  assert.deepEqual(cost.map((row) => [row.v1, row.v2, row.v3]), [["$20.00", "$5.00", "$2.50"], ["$10.00", "-", "-"]]);
  // 백만 토큰당 비용 = 비용 / 토큰 × 1,000,000, 세션당 토큰 = 토큰 / 세션.
  assert.deepEqual(token.map((row) => [row.totalValue, row.unitValue, row.v1]), [[2_000_000, 10, "2.0M"], [null, null, "-"]]);
  assert.deepEqual(session.map((row) => [row.totalValue, row.unitValue]), [[8, 250_000], [null, null]]);
  // 증감은 같은 팀의 이전 값 대비. 이전 0이면 비율이 아니라 신규다.
  assert.deepEqual(cost.map((row) => row.delta), ["+100.0%", "신규"]);
  assert.deepEqual(session.map((row) => row.delta), ["+0.0%", "-"]);
  assert.equal(model.axes.cost.total, "$30.00");
  assert.equal(model.axes.cost.delta, "+50.0%");
  assert.equal(model.showDelta, true);
});

test("비교를 내지 않은 응답은 증감을 그리지 않고 사유를 남긴다", () => {
  // 이전 값이 실려 와도 서버가 비교를 내지 않았으면 증감을 만들지 않는다.
  const partial = presentTeams(view([team("team-a", "플랫폼", { current: usage("20.000000", 4, 8, 2_000_000), previous: usage("10.000000", 4, 8, 1) })], {
    meta: { ...meta(), dataState: "partial", currentCoverage: { status: "partial", observedDays: 2 } },
    comparison: { mode: "prev_week", status: "unavailable", reason: "source_not_available", startDate: "2026-08-31", endDate: "2026-09-02", coverage: { status: "complete", observedDays: 3 } },
    totals: { current: usage("20.000000", 4, 8, 2_000_000), previous: null },
  }));
  assert.equal(partial.showDelta, false);
  assert.deepEqual(partial.axes.cost.rows.map((row) => [row.delta, row.deltaValue]), [["-", null]]);
  assert.equal(partial.axes.cost.delta, "");
  assert.equal(partial.comparisonReason, "선택 기간에 수집 근거가 완전하지 않은 날이 있습니다");
  assert.match(partial.headerNote, /선택 3일 중 2일 관측/);
  const none = presentTeams(view([team("team-a", "플랫폼")], { comparison: { mode: "none", status: "disabled", reason: null } }));
  assert.equal(none.compareLabel, "");
  assert.equal(none.comparisonReason, "");
});

test("미배정은 실제 사용이 있을 때만 행이 되고 막대는 팀 색을 쓰지 않는다", () => {
  const withoutUsage = presentTeams(view([team("team-a", "플랫폼", { current: usage("1.000000", 1, 1, 10) })]));
  assert.deepEqual(withoutUsage.axes.cost.rows.map((row) => row.key), ["team-a"]);
  const withUsage = presentTeams(view([team("team-a", "플랫폼", { current: usage("1.000000", 1, 1, 10) })], {
    unassigned: team(null, "미배정", { current: usage("3.000000", 1, 1, 10) }),
  }));
  const unassigned = withUsage.axes.cost.rows.find((row) => row.key === "unassigned")!;
  assert.deepEqual([unassigned.team, unassigned.unmapped, unassigned.fill], ["미배정", true, "var(--gray)"]);
  // 선 색은 비용 순서로 배정한다(미배정 3 > 플랫폼 1).
  assert.deepEqual(withUsage.teams.map((item) => item.key), ["unassigned", "team-a"]);
  assert.equal(withUsage.isEmpty, false);
  assert.equal(presentTeams(view([])).isEmpty, true);
});

test("제품 비중: 조각은 서버의 팀·제품 값이고 매핑 없는 관측은 미확인 제품으로 끝에 둔다", () => {
  const model = presentTeams(view([
    team("team-a", "플랫폼", { current: usage("10.000000", 2, 4, null), products: [product("claude_team", "6.000000", 300, 3), product("openai_biz", "3.000000", 200, 1), product(null, "1.000000", null, null)] }),
    team("team-b", "데이터", { current: usage("5.000000", 1, 2, 100), products: [product("claude_team", "5.000000", 100, 2)] }),
  ]));
  const cost = model.productMix("cost");
  assert.deepEqual(cost.legend.map((item) => item.name), ["Claude (Anthropic)", "ChatGPT / Codex (OpenAI)", "미확인 제품"]);
  assert.deepEqual(cost.columns.map((column) => [column.team, column.totalText, column.segments.map((segment) => [segment.key, segment.share])]), [
    ["플랫폼", "$10.00", [["claude_team", 0.6], ["openai_biz", 0.3], ["__unmapped", 0.1]]],
    ["데이터", "$5.00", [["claude_team", 1]]],
  ]);
  assert.equal(cost.columns[0].topText, "Claude (Anthropic) 60%");
  // 팀 토큰 합계가 없으면(의미가 다른 토큰) 제품 토큰을 쌓아 비중을 만들지 않는다.
  const token = model.productMix("token");
  assert.deepEqual(token.columns.map((column) => [column.team, column.totalText, column.segments.length, column.topText]), [["데이터", "100", 1, "Claude (Anthropic) 100%"], ["플랫폼", "-", 0, "비중 확인 불가"]]);
  assert.equal(token.incomplete, true);
  // 세션 축은 제품별 세션 수(세션 키에 제품이 들어 있어 팀 세션을 나눈다).
  assert.deepEqual(model.productMix("session").columns.find((column) => column.team === "플랫폼")!.segments.length, 0);
  const drawer = model.details.find((detail) => detail.key === "team-a")!;
  assert.deepEqual(drawer.products.map((item) => [item.name, item.share]), [["Claude (Anthropic)", 60], ["ChatGPT / Codex (OpenAI)", 30], ["미확인 제품", 10]]);
});

test("모델 산점도는 금액·토큰이 있는 모델만 점으로 그리고 평균 단가는 조직 합계에서 낸다", () => {
  const model = presentTeams(view([team("team-a", "플랫폼", { current: usage("1.000000", 1, 1, 1) })], {
    modelScatter: { availability: "partial", reason: "source_not_available", data: { teamUsageCostShareThreshold: 0.05, models: [
      { modelId: "m1", displayName: "Model 1", equivalentCostUsd: "20.000000", totalTokens: 2_000_000, usingTeamCount: 2 },
      { modelId: "m2", displayName: "Model 2", equivalentCostUsd: null, totalTokens: 500, usingTeamCount: null },
    ] } },
  }));
  assert.deepEqual(model.scatter.points.map((item) => [item.key, item.x, item.y, item.size, item.sub]), [["m1", 2, 20, 18, "$10.00/M"]]);
  assert.equal(model.scatter.avgPerM, 10);
  assert.match(model.scatter.note, /모델 1개는 점으로 그리지 않습니다/);
});

test("드로어: 증가 기여는 두 기간이 모두 있을 때만, 모델 비중은 팀 금액 대비다", () => {
  const analytics = team("team-a", "플랫폼", {
    current: usage("20.000000", 4, 8, 2_000_000), previous: usage("15.000000", 5, 6, 1),
    modelMix: { availability: "available", reason: null, data: { sessionMixAvailable: false, sessionMixReason: "multi_model_sessions", models: [
      { modelId: "m1", displayName: "Model 1", equivalentCostUsd: "15.000000", totalTokens: 1 }, { modelId: "m2", displayName: "Model 2", equivalentCostUsd: null, totalTokens: 1 },
    ] } },
  });
  const detail = teamDetail(analytics, true);
  assert.deepEqual([detail.contribText, detail.perUserText, detail.perUserDelta], ["+$5.00", "$5.00", "+66.7%"]);
  assert.deepEqual(detail.models.map((item) => item.share), [75, null]);
  assert.deepEqual([teamDetail(analytics, false).contribText, teamDetail(analytics, false).perUserDelta], ["-", "-"]);
});

const userPage = (items: TeamUsersPage["users"]["items"], nextCursor: string | null, total = 3): TeamUsersPage => ({
  meta: meta(), team: { teamId: "team-a", teamName: "플랫폼" },
  summary: { usage: usage("30.000000", 3, 9, 900), averageEquivalentCostUsd: "10.000000", cacheReadTokens: 100, cacheEligibleInputTokens: 400, cacheHitRatio: 0.25, unidentifiedEquivalentCostUsd: "2.000000" },
  users: { items, totalCount: total, nextCursor },
});
const user = (id: string, cost: string | null, lastUsedAt: string | null = "2026-09-09T01:00:00Z") => ({
  memberId: id, account: `${id}@example.test`, usage: usage(cost, 1, 3, 300), lastUsedAt,
  mainModel: { modelId: "m1", displayName: "Model 1" }, cache: { readTokens: 1, eligibleInputTokens: 2, hitRatio: 0.5 },
});

test("사용자 표: 평균 대비는 서버 평균과의 차이이고 금액을 모르는 사용자가 있으면 합계를 만들지 않는다", () => {
  const data = presentUsers([userPage([user("u1", "15.000000"), user("u2", "10.000000")], "c1"), userPage([user("u3", null, "2026-09-01T01:00:00Z")], null)]);
  assert.deepEqual(data.rows.map((row) => [row.account, row.deviationText, row.last]), [["u1@example.test", "+50%", "9/9"], ["u2@example.test", "", "9/9"], ["u3@example.test", "-", "9/1"]]);
  assert.equal(data.rows[2].lastColor, "var(--orange-ink)");
  assert.equal(data.sumNote(data.rows.slice(0, 2)), "2명 합계 $25.00 · 팀 전체 $30.00 · 미식별 $2.00");
  assert.equal(data.sumNote(data.rows), "3명 합계 - · 팀 전체 $30.00 · 미식별 $2.00");
  assert.deepEqual(data.stats.map((stat) => stat.value), ["3", "9", "900", "$30.00", "25%"]);
  assert.equal(data.totalCount, 3);
});

const listPage = (items: TeamAnalytics[], total: number, nextCursor: string | null, snapshotId = "snapshot-1") =>
  ({ ...view(items), meta: meta(snapshotId), teams: { items, totalCount: total, nextCursor } });

async function withFetch<T>(handler: (url: URL) => Response, run: (urls: URL[]) => Promise<T>) {
  const original = global.fetch, urls: URL[] = [];
  global.fetch = async (input) => { const url = new URL(String(input)); urls.push(url); return handler(url); };
  try { return await run(urls); } finally { global.fetch = original; }
}

test("팀 목록은 모든 페이지를 같은 snapshot으로 읽는다", async () => {
  await withFetch((url) => Response.json(url.searchParams.get("cursor") === "c1" ? listPage([team("team-b", "데이터")], 2, null) : listPage([team("team-a", "플랫폼")], 2, "c1")), async (urls) => {
    const result = await fetchTeams(ORG, period);
    assert.deepEqual(result.teams.map((item) => item.teamId), ["team-a", "team-b"]);
    assert.equal(urls.length, 2);
    assert.deepEqual([urls[0].searchParams.get("sort"), urls[0].searchParams.get("limit"), urls[0].searchParams.get("compare"), urls[0].searchParams.get("snapshotId")], ["cost", "50", "prev_week", null]);
    assert.deepEqual([urls[1].searchParams.get("cursor"), urls[1].searchParams.get("snapshotId")], ["c1", "snapshot-1"]);
  });
});

test("다른 snapshot의 페이지·빠진 날짜·개수 불일치는 버리고, snapshot 만료는 첫 페이지부터 한 번만 다시 읽는다", async () => {
  await withFetch((url) => Response.json(url.searchParams.get("cursor") ? listPage([team("team-b", "데이터")], 2, null, "snapshot-2") : listPage([team("team-a", "플랫폼")], 2, "c1")),
    async () => assert.rejects(fetchTeams(ORG, period), (error) => error instanceof ManagementError && error.code === "invalid_response"));
  await withFetch(() => Response.json(listPage([team("team-a", "플랫폼", { trend: [point("2026-09-07", null, null, null)] })], 1, null)),
    async () => assert.rejects(fetchTeams(ORG, period), (error) => error instanceof ManagementError && error.code === "invalid_response"));
  await withFetch(() => Response.json(listPage([team("team-a", "플랫폼")], 2, null)),
    async () => assert.rejects(fetchTeams(ORG, period), (error) => error instanceof ManagementError && error.code === "invalid_response"));
  let firstPages = 0;
  const expired = () => Response.json({ error: { code: "snapshot_expired", message: "expired" } }, { status: 409 });
  await withFetch((url) => {
    if (!url.searchParams.get("cursor")) { firstPages++; return Response.json(listPage([team("team-a", "플랫폼")], 2, "c1", `snapshot-${firstPages}`)); }
    return firstPages === 1 ? expired() : Response.json(listPage([team("team-b", "데이터")], 2, null, "snapshot-2"));
  }, async () => {
    const result = await fetchTeams(ORG, period);
    assert.equal(result.meta.snapshotId, "snapshot-2");
    assert.equal(firstPages, 2);
  });
  await withFetch((url) => url.searchParams.get("cursor") ? expired() : Response.json(listPage([team("team-a", "플랫폼")], 2, "c1")),
    async () => assert.rejects(fetchTeams(ORG, period), (error) => error instanceof ManagementError && error.code === "snapshot_expired"));
});

test("상세와 사용자는 목록의 snapshot을 넘기고 다른 팀의 응답을 버린다", async () => {
  await withFetch((url) => url.pathname.endsWith("/users")
    ? Response.json(userPage([user("u1", "1.000000")], null, 1))
    : Response.json({ meta: meta(), comparison: view([]).comparison, team: team("team-a", "플랫폼") }), async (urls) => {
    assert.equal((await fetchTeamDetail(ORG, "team-a", period, "snapshot-1")).teamId, "team-a");
    await assert.rejects(fetchTeamDetail(ORG, "team-b", period, "snapshot-1"), (error) => error instanceof ManagementError && error.code === "invalid_response");
    const page = await fetchTeamUsers(ORG, "team-a", period, "snapshot-1", "c9");
    assert.equal(page.users.items.length, 1);
    assert.match(urls[0].pathname, /\/analytics\/teams\/team-a$/);
    assert.deepEqual([urls[2].searchParams.get("snapshotId"), urls[2].searchParams.get("cursor"), urls[2].searchParams.get("limit")], ["snapshot-1", "c9", "12"]);
  });
});
