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
export type OverviewSettings = z.infer<typeof overviewSettingsSchema>;
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
  return result;
}
export const overviewSettingsOptions = (organizationId: string) => queryOptions({
  queryKey: [...organizationKey(organizationId), "overview-contracts"],
  queryFn: ({ signal }) => fetchOverviewSettings(organizationId, signal),
  enabled: !!organizationId, staleTime: 30_000, refetchOnWindowFocus: false,
  retry: shouldRetryOverview,
  retryDelay: (attempt, error) => Math.max(1000 * 2 ** attempt, error instanceof DashboardError ? error.retryAfterMs : 0),
});
