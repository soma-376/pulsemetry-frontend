import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
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
  activeUsers: count.nullable(),
  sessionCount: count.nullable(),
  equivalentCostUsd: money.nullable(),
  tokens: z.object({
    inputUncached: count.nullable(),
    output: count.nullable(),
    cacheRead: count.nullable(),
    cacheWrite: count.nullable(),
    total: count.nullable(),
  }),
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
  observation: z.string(),
  seatState: z.string(),
});
export type Member = z.infer<typeof memberSchema>;
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    totalCount: count,
    nextCursor: z.string().nullable(),
  });
const section = <T extends z.ZodType>(data: T) =>
  z.object({
    availability: z.enum(["available", "partial", "unavailable"]),
    reason: z.string().nullable(),
    data: data.nullable(),
  });
const metaSchema = z.object({
  organizationId: z.string(),
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
const seatSummarySchema = z.object({
  contracted: count,
  assigned: count,
  unallocated: count,
  activeInPeriod: count.nullable(),
  inactiveAssigned: count.nullable(),
  reclaimCandidates: count.nullable(),
  estimatedMonthlySavingsUsd: money.nullable(),
});
export const membersDashboardSchema = z.object({
  meta: metaSchema,
  asOf: z.iso.datetime({ offset: true }),
  summary: z.object({
    rosterMembers: count,
    activeUsers: count.nullable(),
    unassignedMembers: count,
    periodUnassignedEquivalentCostUsd: money.nullable(),
    periodTotalEquivalentCostUsd: money.nullable(),
    seats: section(seatSummarySchema),
  }),
  policy: z.object({ idleDays: count, version: z.number() }),
  capabilities: z.object({
    invite: z.boolean(),
    assignTeam: z.boolean(),
    reclaimSeats: z.boolean(),
    restoreSeats: z.boolean(),
  }),
  members: page(memberSchema),
  unassigned: page(memberSchema),
  reclaimCandidates: section(page(reclaimCandidateSchema)),
});
const memberListSchema = z.object({
  meta: metaSchema,
  members: page(memberSchema),
});
type Dashboard = z.infer<typeof membersDashboardSchema>;
/** 요약·명단·미배정이 같은 snapshot이다. 명단과 미배정은 모든 페이지를 담는다. */
export type MembersView = Omit<Dashboard, "members" | "unassigned"> & {
  members: Member[];
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

/** 첫 페이지 뒤의 모든 페이지를 같은 snapshot으로 읽는다. 첫 페이지만으로 검색·필터·합계를 만들지 않는다. */
async function restOfPages(
  fetcher: Fetcher,
  organizationId: string,
  path: string,
  period: MembersPeriod,
  snapshotId: string,
  first: { items: Member[]; totalCount: number; nextCursor: string | null },
  signal?: AbortSignal,
) {
  const items = [...first.items],
    cursors = new Set<string>();
  let cursor = first.nextCursor;
  while (cursor) {
    if (cursors.has(cursor)) throw invalid();
    cursors.add(cursor);
    const query = new URLSearchParams({
      ...period,
      timeZone: "Asia/Seoul",
      limit: String(MEMBERS_PAGE_LIMIT),
      cursor,
      snapshotId,
    });
    const next = await fetcher(
      orgPath(organizationId, `${path}?${query}`),
      memberListSchema,
      signal,
    );
    if (
      next.meta.organizationId !== organizationId ||
      next.meta.snapshotId !== snapshotId
    )
      throw invalid();
    items.push(...next.members.items);
    cursor = next.members.nextCursor;
  }
  if (
    new Set(items.map((member) => member.memberId)).size !== items.length ||
    items.length !== first.totalCount
  )
    throw invalid();
  return items;
}

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
      const members = await restOfPages(
        fetcher,
        organizationId,
        "/members",
        period,
        meta.snapshotId,
        dashboard.members,
        signal,
      );
      const unassigned = await restOfPages(
        fetcher,
        organizationId,
        "/members/unassigned",
        period,
        meta.snapshotId,
        dashboard.unassigned,
        signal,
      );
      return { ...dashboard, members, unassigned };
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
