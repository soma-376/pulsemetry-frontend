import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { valueSchema } from "./overview";
import {
  apiJson,
  ManagementError,
  managementKey,
  orgPath,
  readOptions,
} from "./management";

const count = z.number().int().nonnegative();
const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const usageSchema = z.object({
  sessionCount: valueSchema(count.nullable()),
  equivalentCostUsd: valueSchema(money.nullable()),
});
const teamRefSchema = z.object({
  teamId: z.string().nullable(),
  teamName: z.string(),
});
/** 서버가 준 값을 그대로 둔다. null은 미수집이고 0과 다르다. */
export const memberSchema = z.object({
  memberId: z.string(),
  account: z.string(),
  displayName: z.string(),
  team: teamRefSchema,
  role: z.string(),
  status: z.string(),
  version: z.number(),
  plannedVendorIds: z.array(z.string()).optional(),
  periodUsage: usageSchema.nullable(),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
  seatState: z.string(),
  activity: z.enum(["active", "candidate", "idle", "unobserved"]).optional(),
});
export type Member = z.infer<typeof memberSchema>;
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    totalCount: count,
    nextCursor: z.string().nullable(),
  });
const offsetPage = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    totalCount: count,
    nextOffset: count.nullable(),
  });
const section = <T extends z.ZodType>(data: T) =>
  z.object({
    availability: z.enum(["available", "partial", "unavailable"]),
    reason: z.string().nullable(),
    data: data.nullable(),
  });
const metaSchema = z.object({
  organizationId: z.string(),
  asOf: z.iso.datetime({ offset: true }),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  snapshotId: z.string(),
});
export const reclaimCandidateSchema = z.object({
  seatAssignmentId: z.string(),
  memberId: z.string(),
  account: z.string(),
  team: teamRefSchema,
  vendorId: z.string(),
  tierId: z.string().nullable(),
  version: z.number(),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
  idleDays: count,
  estimatedMonthlySavingsUsd: money.nullable(),
  canReclaim: z.boolean(),
  reason: z.string().nullable(),
  // 좌석의 벤더 계정(가산). account 는 구성원의 계정이다.
  vendorAccount: z.string().optional(),
});
export type ReclaimCandidate = z.infer<typeof reclaimCandidateSchema>;
export const membersDashboardSchema = z.object({
  meta: metaSchema,
  summary: z.object({
    rosterMembers: count,
    activeUsers: valueSchema(count.nullable()),
    unassignedMembers: count,
    periodUnassignedEquivalentCostUsd: valueSchema(money.nullable()),
    periodUnassignedCostShare: valueSchema(z.number().nonnegative().nullable()),
    reclaimCandidates: valueSchema(count.nullable()),
  }),
  policy: z.object({ idleDays: count, version: z.number() }),
  capabilities: z.object({
    invite: z.boolean(),
    assignTeam: z.boolean(),
    reclaimSeats: z.boolean(),
    restoreSeats: z.boolean(),
  }),
  members: offsetPage(memberSchema),
  unassigned: offsetPage(memberSchema),
  reclaimCandidates: section(page(reclaimCandidateSchema)),
});
const memberListSchema = z.object({
  meta: metaSchema,
  members: offsetPage(memberSchema),
});
type Dashboard = z.infer<typeof membersDashboardSchema>;
/** 요약·명단·미배정이 같은 snapshot이다. 명단은 첫 페이지이며 미배정은 배정 작업을 위해 모든 페이지를 담는다. */
export type MembersView = Omit<Dashboard, "members" | "unassigned"> & {
  members: Member[];
  initialMembers?: Dashboard["members"];
  unassigned: Member[];
};
export type MembersPeriod = { startDate: string; endDate: string };

const invalid = () => new ManagementError("invalid_response", 422);
/** 서버의 한 페이지 최대 크기. */
export const MEMBERS_PAGE_LIMIT = 100;

type Fetcher = <T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) => Promise<T>;
const dashboardApi: Fetcher = (path, schema, signal) =>
  apiJson("dashboard", path, schema, { signal });

export type MemberListFilters = {
  q?: string;
  status?: "all" | "active" | "candidate" | "idle" | "unobserved";
  sort?: "account" | "team" | "cost" | "activity";
  order?: "asc" | "desc";
  memberId?: string;
};
export async function fetchMemberPage(
  organizationId: string,
  period: MembersPeriod,
  snapshotId: string,
  offset: number,
  filters: MemberListFilters = {},
  signal?: AbortSignal,
  fetcher: Fetcher = dashboardApi,
  limit = 20,
  path = "/members",
) {
  const params = new URLSearchParams({
    ...period,
    timeZone: "Asia/Seoul",
    snapshotId,
    offset: String(offset),
    limit: String(limit),
    ...filters,
  });
  const result = await fetcher(
    orgPath(organizationId, `${path}?${params}`),
    memberListSchema,
    signal,
  );
  if (
    result.meta.organizationId !== organizationId ||
    result.meta.snapshotId !== snapshotId ||
    result.meta.startDate !== period.startDate ||
    result.meta.endDate !== period.endDate
  )
    throw invalid();
  const p = result.members;
  const end = offset + p.items.length;
  if (
    p.items.length > limit ||
    new Set(p.items.map((m) => m.memberId)).size !== p.items.length ||
    (p.nextOffset !== null &&
      (p.items.length === 0 || p.nextOffset !== end || end >= p.totalCount)) ||
    (p.nextOffset === null && end < p.totalCount)
  )
    throw invalid();
  return result;
}

/** 전체 명단은 CSV 등 명시적인 전체 조회 동작에서만 읽는다. */
export async function fetchAllMembers(
  organizationId: string,
  period: MembersPeriod,
  snapshotId: string,
  signal?: AbortSignal,
  fetcher: Fetcher = dashboardApi,
) {
  const first = await fetchMemberPage(
    organizationId,
    period,
    snapshotId,
    0,
    {},
    signal,
    fetcher,
    MEMBERS_PAGE_LIMIT,
  );
  return restOfPages(
    fetcher,
    organizationId,
    "/members",
    period,
    snapshotId,
    first.members,
    signal,
  );
}
async function restOfPages(
  fetcher: Fetcher,
  organizationId: string,
  path: string,
  period: MembersPeriod,
  snapshotId: string,
  first: { items: Member[]; totalCount: number; nextOffset: number | null },
  signal?: AbortSignal,
) {
  const items = [...first.items];
  let offset = first.nextOffset;
  while (offset !== null) {
    if (offset !== items.length || offset >= first.totalCount) throw invalid();
    const next = await fetchMemberPage(
      organizationId,
      period,
      snapshotId,
      offset,
      {},
      signal,
      fetcher,
      MEMBERS_PAGE_LIMIT,
      path,
    );
    if (next.members.totalCount !== first.totalCount) throw invalid();
    items.push(...next.members.items);
    offset = next.members.nextOffset;
  }
  if (
    items.length !== first.totalCount ||
    new Set(items.map((m) => m.memberId)).size !== items.length
  )
    throw invalid();
  return items;
}
export const memberPagesOptions = (
  organizationId: string,
  period: MembersPeriod,
  snapshotId: string,
  filters: MemberListFilters,
) =>
  infiniteQueryOptions({
    queryKey: [
      ...managementKey(organizationId, "member-pages"),
      period.startDate,
      period.endDate,
      snapshotId,
      filters,
    ],
    queryFn: ({ signal, pageParam }) =>
      fetchMemberPage(
        organizationId,
        period,
        snapshotId,
        pageParam,
        filters,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.members.nextOffset,
    ...readOptions,
  });

export async function fetchMembersView(
  organizationId: string,
  period: MembersPeriod,
  signal?: AbortSignal,
  fetcher: Fetcher = dashboardApi,
): Promise<MembersView> {
  for (let attempt = 0; ; attempt++) {
    try {
      const query = new URLSearchParams({ ...period, timeZone: "Asia/Seoul" });
      const dashboard = await fetcher(
        orgPath(organizationId, `/members/dashboard?${query}`),
        membersDashboardSchema,
        signal,
      );
      const { meta } = dashboard;
      if (
        meta.organizationId !== organizationId ||
        meta.startDate !== period.startDate ||
        meta.endDate !== period.endDate
      )
        throw invalid();
      const first = dashboard.members;
      if (
        new Set(first.items.map((m) => m.memberId)).size !==
          first.items.length ||
        (first.nextOffset === null
          ? first.items.length !== first.totalCount
          : first.nextOffset !== first.items.length ||
            first.items.length === 0 ||
            first.nextOffset >= first.totalCount)
      )
        throw invalid();
      const unassigned = await restOfPages(
        fetcher,
        organizationId,
        "/members/unassigned",
        period,
        meta.snapshotId,
        dashboard.unassigned,
        signal,
      );
      return {
        ...dashboard,
        members: dashboard.members.items,
        initialMembers: dashboard.members,
        unassigned,
      };
    } catch (error) {
      // snapshot이 만료되면 섞어 쓰지 않고 첫 페이지부터 한 번 다시 읽는다.
      if (
        attempt === 0 &&
        error instanceof ManagementError &&
        error.code === "snapshot_expired"
      )
        continue;
      throw error;
    }
  }
}

export const membersOptions = (organizationId: string, period: MembersPeriod) =>
  queryOptions({
    queryKey: [
      ...managementKey(organizationId, "members"),
      period.startDate,
      period.endDate,
    ],
    queryFn: ({ signal }) => fetchMembersView(organizationId, period, signal),
    enabled: !!organizationId && !!period.startDate && !!period.endDate,
    ...readOptions,
  });
