import { overviewSchema, type Overview } from "../../src/lib/api/overview";
import {
  teamsResponseSchema,
  type TeamsResponse,
} from "../../src/lib/api/teams";
import { plannedTrendBuckets } from "../../src/lib/api/trend-aggregation";

/** UI 목 응답 전용. 실제 일별 데이터를 분할하는 집계 로직이 아니다. */
function plan(
  meta: { startDate: string; endDate: string },
  valueMode: "interval" | "cumulative",
) {
  const buckets = plannedTrendBuckets(meta.startDate, meta.endDate);
  const iso = (n: number) => new Date(n).toISOString();
  return {
    meta: {
      trendAggregation: {
        mode: "auto" as const,
        policyVersion: "calendar-buckets-v2",
        valueMode,
        rangeStart: iso(buckets.start),
        rangeEnd: iso(buckets.end),
        asOf: iso(buckets.end),
        effectiveEnd: iso(buckets.end),
        intervalSeconds: buckets.seconds,
        intervalMonths: buckets.seconds === null ? 1 : null,
      },
      collectionPolicy: {
        policyVersion: "proj-315-pending",
        asOf: iso(buckets.end),
        status: "pending" as const,
        annotations: [
          {
            scope: "period" as const,
            rangeStart: iso(buckets.start),
            rangeEnd: iso(buckets.end),
            teamId: null,
            reasons: ["policy_integration_pending"],
            evidenceRefs: [],
          },
        ],
      },
    },
    points: buckets.starts.map((start, i) => ({
      bucketStart: iso(start),
      bucketEnd: iso(buckets.starts[i + 1] ?? buckets.end),
      temporalState: "elapsed" as const,
      usageRows: 1,
      pricedUsageRows: 1,
      unpricedUsageRows: 0,
    })),
  };
}
const value = <T>(v: T) => ({
  value: v,
  status: v === null ? ("unavailable" as const) : ("complete" as const),
  reasons: v === null ? ["no_data"] : [],
});
export function automaticOverviewFixture(data: Overview) {
  const generated = plan(data.meta, "interval");
  const points = data.trend?.points ?? [];
  return overviewSchema.parse({
    ...data,
    meta: {
      ...data.meta,
      ...generated.meta,
      snapshotId: data.meta.snapshotId ?? "fixture-auto-snapshot",
    },
    trend:
      data.trend === null
        ? null
        : {
            bucket: "auto",
            points: generated.points.map((point, i) => {
              const source = points[i % points.length];
              return {
                ...point,
                equivalentCostUsd: source?.equivalentCostUsd ?? value(null),
                knownEquivalentCostUsd:
                  source?.knownEquivalentCostUsd ??
                  source?.equivalentCostUsd ??
                  value(null),
                totalTokens: source?.totalTokens ?? value(null),
              };
            }),
          },
  });
}
export function automaticTeamsFixture(data: TeamsResponse) {
  const generated = plan(data.meta, "cumulative");
  const convert = (team: TeamsResponse["unassigned"]) => ({
    ...team,
    trend: generated.points.map((point, i) => {
      const source = team.trend[i % team.trend.length];
      if (source && "bucketStart" in source) return source;
      return {
        ...point,
        cumulativeEquivalentCostUsd: value(source?.equivalentCostUsd ?? null),
        cumulativeKnownEquivalentCostUsd: value(
          source?.knownEquivalentCostUsd ?? source?.equivalentCostUsd ?? null,
        ),
        cumulativeTotalTokens: value(source?.totalTokens ?? null),
        cumulativeSessionCount: value(source?.cumulativeSessionCount ?? null),
      };
    }),
  });
  return teamsResponseSchema.parse({
    ...data,
    meta: {
      ...data.meta,
      ...generated.meta,
      snapshotId: data.meta.snapshotId ?? "fixture-auto-snapshot",
    },
    teams: { ...data.teams, items: data.teams.items.map(convert) },
    unassigned: convert(data.unassigned),
  });
}
