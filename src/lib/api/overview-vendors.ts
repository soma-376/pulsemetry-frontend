import { contractStatusSchema } from "../contract-status";
import { organizationKey } from "./query-keys";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { sessionFetch } from "./session";
import { DashboardError, retryAfterMs, shouldRetryOverview } from "./overview";
const money = z.string().regex(/^\d+(?:\.\d+)?$/).nullable();
const meta = z.object({ organizationId: z.string(), asOf: z.string(), snapshotId: z.string() });
const vendor = z.object({
  vendorId: z.string(), displayName: z.string(), kind: z.string(), state: z.string(), contractStatus: contractStatusSchema,
  // 좌석 원장의 배정 좌석(서버 가산 — ADR 0048). 옛 서버에는 없다.
  seats: z.object({ availability: z.string(), reason: z.string().nullable(), data: z.object({ assigned: z.number().int().nonnegative(), contracted: z.number().int().nonnegative().nullable() }).nullable() }).optional(),
  contract: z.object({ planId: z.string(), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), monthlySeatFeeUsd: money,
    tiers: z.array(z.object({ tierId: z.string(), label: z.string(), seats: z.number().int().nonnegative(), monthlyFeePerSeatUsd: z.string().regex(/^\d+(?:\.\d+)?$/) })),
  }).nullable(),
});
const pageSchema = z.object({ items: z.array(vendor), totalCount: z.number().int().nonnegative(), nextCursor: z.string().nullable() });
export const overviewSettingsSchema = z.object({ meta,
  summary: z.object({ monthlySeatFeeUsd: money }),
  catalog: z.object({ plans: z.array(z.object({ planId: z.string(), kind: z.string(), displayName: z.string() })) }),
  vendors: pageSchema,
});
/** 제품별 회수 후보 수 — 회수 후보 목록 전체(같은 기준 시각의 모든 페이지)에서 센다. 목록을 다 읽지 못했거나 판정할 수 없으면 null. */
export type VendorCandidates = { availability: "available" | "partial"; byVendor: Record<string, number> } | null;
export type OverviewSettings = z.infer<typeof overviewSettingsSchema> & { candidates?: VendorCandidates };
const candidatePage = z.object({ meta: z.object({ organizationId: z.string() }),
  candidates: z.object({ availability: z.enum(["available", "partial", "unavailable"]), data: z.object({ items: z.array(z.object({ vendorId: z.string() })), nextCursor: z.string().nullable() }).nullable() }) });
/** 회수 후보를 끝까지 읽는다(최대 [MAX_CANDIDATE_PAGES]쪽). 실패하면 null — 계약 표 전체를 막지 않는다. */
async function vendorCandidates(organizationId: string, signal?: AbortSignal): Promise<VendorCandidates> {
  try {
    const byVendor: Record<string, number> = {};
    let cursor: string | null = null, availability: "available" | "partial" = "available";
    for (let page = 0; page < MAX_CANDIDATE_PAGES; page++) {
      const query = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
      const parsed = candidatePage.parse(await get(organizationId, `/seat-reclaim-candidates?${query}`, signal));
      if (parsed.meta.organizationId !== organizationId || parsed.candidates.availability === "unavailable" || !parsed.candidates.data) return null;
      if (parsed.candidates.availability === "partial") availability = "partial";
      for (const item of parsed.candidates.data.items) byVendor[item.vendorId] = (byVendor[item.vendorId] ?? 0) + 1;
      cursor = parsed.candidates.data.nextCursor;
      if (!cursor) return { availability, byVendor };
    }
    return null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
const MAX_CANDIDATE_PAGES = 20;
async function get(organizationId: string, path: string, signal?: AbortSignal) {
  const response = await sessionFetch(`/api/bff/dashboard/api/v1/organizations/${encodeURIComponent(organizationId)}${path}`, { signal, cache: "no-store" });
  if (!response.ok) throw new DashboardError("계약 정보를 불러오지 못했습니다.", response.status, retryAfterMs(response.headers.get("Retry-After")));
  return response.json();
}
export async function fetchOverviewSettings(organizationId: string, signal?: AbortSignal): Promise<OverviewSettings> {
  const parsed = overviewSettingsSchema.safeParse(await get(organizationId, "/settings", signal));
  if (!parsed.success || parsed.data.meta.organizationId !== organizationId) throw new DashboardError("계약 응답의 조직 또는 형식이 일치하지 않습니다.", 422);
  const result = parsed.data;
  const cursors = new Set<string>();
  let cursor = result.vendors.nextCursor;
  while (cursor) {
    if (cursors.has(cursor)) throw new DashboardError("계약 목록의 페이지가 중복되었습니다.", 422);
    cursors.add(cursor);
    const page = z.object({ meta, vendors: pageSchema }).parse(await get(organizationId, `/vendors?${new URLSearchParams({ cursor, snapshotId: result.meta.snapshotId, limit: "100" })}`, signal));
    if (page.meta.organizationId !== organizationId || page.meta.snapshotId !== result.meta.snapshotId) throw new DashboardError("계약 목록의 조회 기준이 일치하지 않습니다.", 422);
    result.vendors.items.push(...page.vendors.items);
    cursor = page.vendors.nextCursor;
  }
  result.vendors.nextCursor = null;
  return { ...result, candidates: await vendorCandidates(organizationId, signal) };
}
export const overviewSettingsOptions = (organizationId: string) => queryOptions({
  queryKey: [...organizationKey(organizationId), "overview-contracts"],
  queryFn: ({ signal }) => fetchOverviewSettings(organizationId, signal),
  enabled: !!organizationId, staleTime: 30_000, refetchOnWindowFocus: false,
  retry: shouldRetryOverview,
  retryDelay: (attempt, error) => Math.max(1000 * 2 ** attempt, error instanceof DashboardError ? error.retryAfterMs : 0),
});
