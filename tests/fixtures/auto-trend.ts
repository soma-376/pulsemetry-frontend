import example from "../../docs/api/overview-response.example.json";
import teamsExample from "../../docs/api/teams-response.example.json";
import contract from "./auto-trend.fixture.json";
import { overviewSchema } from "../../src/lib/api/overview";
import { teamsResponseSchema, type TeamsView } from "../../src/lib/api/teams";
export { contract };
const comparison = {
  mode: "none",
  startDate: null,
  endDate: null,
  coverage: null,
};
const disabled = {
  status: "disabled",
  reasons: [],
  previousValue: null,
  absoluteChange: null,
  percentChange: null,
  change: null,
};
function metrics<T extends Record<string, unknown>>(base: T) {
  const result = structuredClone(base);
  for (const metric of Object.values(result)) {
    if (metric && typeof metric === "object" && "comparison" in metric)
      metric.comparison = disabled;
  }
  for (const [name, value] of Object.entries(contract.expected.totals)) {
    if (typeof value === "object" && result[name])
      Object.assign(result[name] as object, value);
    else Object.assign(result, { [name]: value });
  }
  return result;
}
const periodMeta = {
  startDate: contract.request.startDate,
  endDate: contract.request.endDate,
  dayCount: 1,
  currentCoverage: { status: "partial", observedDays: 1 },
};
export function autoOverview(
  organizationId = "11111111-1111-4111-8111-111111111111",
) {
  return overviewSchema.parse({
    ...structuredClone(example),
    meta: {
      ...example.meta,
      ...periodMeta,
      ...contract.expected.overviewMeta,
      organizationId,
    },
    comparison,
    summary: metrics(example.summary),
    trend: structuredClone(contract.expected.overviewTrend),
  });
}
export function autoTeamsResponse(
  organizationId = "11111111-1111-4111-8111-111111111111",
  snapshotId = "fixture-auto-snapshot",
) {
  const team = {
    ...structuredClone(teamsExample.teams.items[0]),
    teamId: "team-a",
    teamName: "자동 집계 팀",
    metrics: metrics(teamsExample.teams.items[0].metrics),
    trend: structuredClone(contract.expected.teamTrend),
  };
  return teamsResponseSchema.parse({
    ...structuredClone(teamsExample),
    meta: {
      ...teamsExample.meta,
      ...periodMeta,
      ...contract.expected.teamMeta,
      organizationId,
      snapshotId,
    },
    comparison: { ...comparison, status: "disabled", reason: null },
    teams: { items: [team], totalCount: 1, nextOffset: null },
    totals: metrics(teamsExample.totals),
    unassigned: { ...team, teamId: null, teamName: "미배정" },
  });
}
export function autoTeams(): TeamsView {
  const response = autoTeamsResponse();
  return { ...response, teams: response.teams.items };
}
