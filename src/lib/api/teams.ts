import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, ManagementError, managementKey, orgPath, readOptions } from "./management";
import { availability, comparison, count, coverage, money, productUsage, reason, usage } from "./overview";

/**
 * 팀 분석 조회(`GET O/analytics/teams`·`/teams/{teamId}`·`/teams/{teamId}/users`).
 * 목록 → 상세 → 사용자가 같은 snapshot을 읽는다. 값은 서버가 센 그대로 두고 다시 집계하지 않는다.
 */

const modelUsage = z.object({ modelId: z.string(), displayName: z.string(), equivalentCostUsd: money, totalTokens: count });
const section = <T extends z.ZodType>(data: T) => z.object({ availability, reason, data: data.nullable() });
const observation = z.enum(["complete", "partial", "unobserved"]);
export const teamAnalyticsSchema = z.object({
  teamId: z.string().nullable(), teamName: z.string(),
  current: usage.nullable(), previous: usage.nullable(),
  modelMix: section(z.object({ sessionMixAvailable: z.boolean(), sessionMixReason: z.string(), models: z.array(modelUsage) })),
  // 누적 세션은 시작일부터 그날까지 완전 관측일 때만 값이다. null인 날부터 선을 끊는다.
  trend: z.array(z.object({ date: z.iso.date(), observation, equivalentCostUsd: money, totalTokens: count, cumulativeSessionCount: count })),
  products: z.array(productUsage),
});
export type TeamAnalytics = z.infer<typeof teamAnalyticsSchema>;
const metaSchema = z.object({
  organizationId: z.string(), startDate: z.iso.date(), endDate: z.iso.date(), timeZone: z.literal("Asia/Seoul"), dayCount: z.number().int().min(1),
  dataThrough: z.iso.datetime({ offset: true }).nullable(), dataState: z.enum(["ready", "partial", "no_data", "never_observed"]),
  currentCoverage: coverage, snapshotId: z.string(),
});
const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), totalCount: z.number().int().nonnegative(), nextCursor: z.string().nullable() });
export const teamsResponseSchema = z.object({
  meta: metaSchema, comparison, attributionBasis: z.literal("event_time"),
  totals: z.object({ current: usage.nullable(), previous: usage.nullable() }),
  sort: z.enum(["cost", "token", "session"]),
  teams: page(teamAnalyticsSchema), unassigned: teamAnalyticsSchema,
  modelScatter: section(z.object({ teamUsageCostShareThreshold: z.number(), models: z.array(modelUsage.extend({ usingTeamCount: count })) })),
});
export type TeamsResponse = z.infer<typeof teamsResponseSchema>;
const teamDetailSchema = z.object({ meta: metaSchema, comparison, team: teamAnalyticsSchema });
export const teamUserSchema = z.object({
  memberId: z.string(), account: z.string(), usage, lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
  mainModel: z.object({ modelId: z.string(), displayName: z.string() }).nullable(),
  cache: z.object({ readTokens: count, eligibleInputTokens: count, hitRatio: z.number().min(0).max(1).nullable() }),
});
export type TeamUser = z.infer<typeof teamUserSchema>;
export const teamUsersSchema = z.object({
  meta: metaSchema, team: z.object({ teamId: z.string().nullable(), teamName: z.string() }),
  summary: z.object({
    usage: usage.nullable(), averageEquivalentCostUsd: money, cacheReadTokens: count, cacheEligibleInputTokens: count,
    cacheHitRatio: z.number().min(0).max(1).nullable(), unidentifiedEquivalentCostUsd: money,
  }),
  users: page(teamUserSchema),
});
export type TeamUsersPage = z.infer<typeof teamUsersSchema>;

export type TeamsPeriod = { startDate: string; endDate: string; compare: "none" | "prev_week" | "prev_period" };
export type TeamsSort = "cost" | "token" | "session";
/** 목록의 모든 페이지를 한 snapshot으로 모은 결과. 조직 합계·산점도·미배정은 첫 페이지의 값이다(페이지와 무관한 전체 집계). */
export type TeamsView = Omit<TeamsResponse, "teams"> & { teams: TeamAnalytics[] };
/** 경로의 예약값. 미배정은 팀 ID가 없다. */
export const UNASSIGNED = "unassigned";
/** 서버의 한 페이지 최대 크기. */
export const TEAMS_PAGE_LIMIT = 50;
/** 사용자 표의 한 페이지. 서버 기본값과 같다. */
export const TEAM_USERS_PAGE = 12;

type Fetcher = <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) => Promise<T>;
const dashboardApi: Fetcher = (path, schema, signal) => apiJson("dashboard", path, schema, { signal });
const invalid = () => new ManagementError("invalid_response", 422);
const query = (values: Record<string, string | null | undefined>) =>
  new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => entry[1] != null)).toString();

/** 요청과 다른 조직·기간이거나 날짜가 빠진 추이는 버린다. */
function checkMeta(meta: z.infer<typeof metaSchema>, organizationId: string, period: { startDate: string; endDate: string }) {
  if (meta.organizationId !== organizationId || meta.startDate !== period.startDate || meta.endDate !== period.endDate) throw invalid();
}
function checkTrend(team: TeamAnalytics, meta: z.infer<typeof metaSchema>) {
  const start = Date.parse(meta.startDate);
  if (team.trend.length !== meta.dayCount || team.trend.some((point, index) => Date.parse(point.date) !== start + index * 86_400_000)) throw invalid();
}

/** 첫 페이지부터 끝까지 같은 snapshot으로 읽는다. 첫 페이지만으로 정렬·합계를 만들지 않는다. */
export async function fetchTeams(organizationId: string, period: TeamsPeriod, signal?: AbortSignal, fetcher: Fetcher = dashboardApi, sort: TeamsSort = "cost"): Promise<TeamsView> {
  for (let attempt = 0; ; attempt++) {
    try {
      const base = { ...period, timeZone: "Asia/Seoul", sort, limit: String(TEAMS_PAGE_LIMIT) };
      const first = await fetcher(orgPath(organizationId, `/analytics/teams?${query(base)}`), teamsResponseSchema, signal);
      checkMeta(first.meta, organizationId, period);
      if (first.comparison.mode !== period.compare || first.sort !== sort) throw invalid();
      const items = [...first.teams.items], cursors = new Set<string>();
      let cursor = first.teams.nextCursor;
      while (cursor) {
        if (cursors.has(cursor)) throw invalid();
        cursors.add(cursor);
        const next = await fetcher(orgPath(organizationId, `/analytics/teams?${query({ ...base, cursor, snapshotId: first.meta.snapshotId })}`), teamsResponseSchema, signal);
        if (next.meta.snapshotId !== first.meta.snapshotId) throw invalid();
        checkMeta(next.meta, organizationId, period);
        items.push(...next.teams.items);
        cursor = next.teams.nextCursor;
      }
      if (items.length !== first.teams.totalCount || new Set(items.map((team) => team.teamId)).size !== items.length || items.some((team) => team.teamId === null)) throw invalid();
      for (const team of [...items, first.unassigned]) checkTrend(team, first.meta);
      return { ...first, teams: items };
    } catch (error) {
      // 다음 페이지를 읽는 사이 snapshot이 만료되면 섞어 쓰지 않고 첫 페이지부터 한 번 다시 읽는다.
      if (attempt === 0 && error instanceof ManagementError && error.code === "snapshot_expired") continue;
      throw error;
    }
  }
}

/** 직접 링크로 연 팀이 목록에 없을 때(그 기간에 사용이 없는 팀)만 부른다. 목록과 같은 snapshot이다. */
export async function fetchTeamDetail(organizationId: string, teamId: string, period: TeamsPeriod, snapshotId: string, signal?: AbortSignal, fetcher: Fetcher = dashboardApi) {
  const path = `/analytics/teams/${encodeURIComponent(teamId)}?${query({ ...period, timeZone: "Asia/Seoul", snapshotId })}`;
  const detail = await fetcher(orgPath(organizationId, path), teamDetailSchema, signal);
  checkMeta(detail.meta, organizationId, period);
  if (detail.meta.snapshotId !== snapshotId || (teamId !== UNASSIGNED && detail.team.teamId !== teamId)) throw invalid();
  checkTrend(detail.team, detail.meta);
  return detail.team;
}

/** 선택한 팀의 사용자 한 페이지. 비용 내림차순(동률 구성원 ID)이 서버 순서다. */
export async function fetchTeamUsers(organizationId: string, teamId: string, period: { startDate: string; endDate: string }, snapshotId: string,
  cursor: string | null, signal?: AbortSignal, fetcher: Fetcher = dashboardApi) {
  const path = `/analytics/teams/${encodeURIComponent(teamId)}/users?${query({ ...period, timeZone: "Asia/Seoul", snapshotId, limit: String(TEAM_USERS_PAGE), cursor })}`;
  const data = await fetcher(orgPath(organizationId, path), teamUsersSchema, signal);
  checkMeta(data.meta, organizationId, period);
  if (data.meta.snapshotId !== snapshotId || (teamId !== UNASSIGNED && data.team.teamId !== teamId)) throw invalid();
  return data;
}

export const teamsKey = (organizationId: string) => managementKey(organizationId, "team-analytics");

export const teamsOptions = (organizationId: string, period: TeamsPeriod) => queryOptions({
  queryKey: [...teamsKey(organizationId), "list", period.startDate, period.endDate, period.compare],
  queryFn: ({ signal }) => fetchTeams(organizationId, period, signal),
  enabled: !!organizationId && !!period.startDate && !!period.endDate,
  ...readOptions,
});

export const teamDetailOptions = (organizationId: string, teamId: string, period: TeamsPeriod, snapshotId: string) => queryOptions({
  queryKey: [...teamsKey(organizationId), "detail", snapshotId, teamId, period.startDate, period.endDate, period.compare],
  queryFn: ({ signal }) => fetchTeamDetail(organizationId, teamId, period, snapshotId, signal),
  ...readOptions,
});

export const teamUsersOptions = (organizationId: string, teamId: string, period: { startDate: string; endDate: string }, snapshotId: string) => infiniteQueryOptions({
  queryKey: [...teamsKey(organizationId), "users", snapshotId, teamId, period.startDate, period.endDate],
  queryFn: ({ signal, pageParam }) => fetchTeamUsers(organizationId, teamId, period, snapshotId, pageParam, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (last) => last.users.nextCursor,
  ...readOptions,
});
