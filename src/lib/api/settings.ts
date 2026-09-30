import { contractStatusSchema } from "../contract-status";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, managementKey, ManagementError, orgPath, readOptions } from "./management";
import { overviewSchema } from "./overview";

const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const count = z.number().int().nonnegative();
const meta = z.object({ organizationId: z.string(), snapshotId: z.string() });
export const contractSchema = z.object({
  version: count, planId: z.string(), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), termNote: z.string().nullable(),
  tiers: z.array(z.object({ tierId: z.string(), label: z.string(), seats: count, monthlyFeePerSeatUsd: money })),
  monthlySeatFeeUsd: money.nullable(), confirmedAt: z.string(), confirmedBy: z.string(),
});
export const settingsVendorSchema = z.object({
  vendorId: z.string(), displayName: z.string(), kind: z.string(), source: z.string(), version: count,
  state: z.string(), contractStatus: contractStatusSchema, contract: contractSchema.nullable(), observation: z.string(),
  firstSeenAt: z.string().nullable(), lastSeenAt: z.string().nullable(), activeUsers7d: count.nullable(), activeUsers30d: count.nullable(),
});
export type SettingsVendor = z.infer<typeof settingsVendorSchema>;
export const settingsVendorResponseSchema = z.object({ meta, vendor: settingsVendorSchema });
const page = z.object({ items: z.array(settingsVendorSchema), totalCount: count, nextCursor: z.string().nullable() });
export const settingsSchema = z.object({
  meta, ingest: overviewSchema.shape.ingest,
  capabilities: z.object({ editContracts: z.boolean(), editCollectionPolicy: z.boolean(), editAlertRules: z.boolean(), notifyInstallations: z.boolean() }),
  summary: z.object({ configuredVendors: count, unconfiguredVendors: count, monthlySeatFeeUsd: money.nullable(), contractedSeats: count.nullable(), activeSeats7d: count.nullable(),
    meteredMonthToDate: z.object({ availability: z.string(), data: z.object({ actualBilledUsd: money.nullable(), equivalentCostUsd: money.nullable() }).nullable() }),
  }),
  vendors: page,
  // version 은 원문 선택이 실린 manifest 판이고, 회수 기준·집계 보존은 설정의 판(settingsVersion)으로 따로 저장한다(백엔드 ADR 0046).
  collectionPolicy: z.object({ version: count, collectRawContent: z.boolean(), reclaimIdleDays: count, aggregateRetentionMonths: count.nullable(),
    settingsVersion: count, settingsUpdatedAt: z.string().nullable(), reclaimIdleDaysSource: z.enum(["organization", "default"]),
    options: z.object({ reclaimIdleDays: z.array(count), aggregateRetentionMonths: z.array(count.nullable()) }),
    // 이 조직의 가장 최근 보존 정리 작업(ADR 0047). 새로고침 뒤에도 마지막 정리의 상태를 다시 조회한다.
    cleanupOperationId: z.string().nullable() }),
  policyRollout: z.object({ desiredVersion: count, eligibleInstallations: count, appliedInstallations: count, outdatedInstallations: count, unknownInstallations: count }),
  alertRules: z.array(z.object({ ruleId: z.string(), enabled: z.boolean(), availability: z.string(), threshold: z.object({ value: z.number(), unit: z.string() }) })),
});
export type Settings = z.infer<typeof settingsSchema>;
export async function fetchSettings(org: string, signal?: AbortSignal): Promise<Settings> {
  for (let attempt = 0; ; attempt++) {
    try {
      const data = await apiJson("dashboard", orgPath(org, "/settings"), settingsSchema, { signal });
      if (data.meta.organizationId !== org) throw new ManagementError("invalid_response", 422);
      const cursors = new Set<string>();
      let cursor = data.vendors.nextCursor;
      while (cursor) {
        if (cursors.has(cursor)) throw new ManagementError("invalid_response", 422);
        cursors.add(cursor);
        const query = new URLSearchParams({ cursor, snapshotId: data.meta.snapshotId, limit: "100" });
        const next = await apiJson("dashboard", orgPath(org, `/vendors?${query}`), z.object({ meta, vendors: page }), { signal });
        if (next.meta.organizationId !== org || next.meta.snapshotId !== data.meta.snapshotId) throw new ManagementError("invalid_response", 422);
        data.vendors.items.push(...next.vendors.items);
        cursor = next.vendors.nextCursor;
      }
      data.vendors.nextCursor = null;
      return data;
    } catch (error) {
      if (attempt === 0 && error instanceof ManagementError && error.code === "snapshot_expired") continue;
      throw error;
    }
  }
}
export const settingsOptions = (org: string) => queryOptions({ queryKey: managementKey(org, "settings"), queryFn: ({ signal }) => fetchSettings(org, signal), enabled: !!org, ...readOptions });
export async function fetchSettingsVendor(org: string, id: string, signal?: AbortSignal) {
  const result = await apiJson("dashboard", orgPath(org, `/vendors/${encodeURIComponent(id)}`), settingsVendorResponseSchema, { signal });
  if (result.meta.organizationId !== org || result.vendor.vendorId !== id) throw new ManagementError("invalid_response", 422);
  return result.vendor;
}

export const settingsVendorOptions = (org: string, id: string | null) => queryOptions({
  queryKey: [...managementKey(org, "settings-vendor"), id],
  queryFn: ({ signal }) => {
    if (!id) throw new Error("조회할 벤더를 선택하세요.");
    return fetchSettingsVendor(org, id, signal);
  },
  ...readOptions,
  enabled: !!org && !!id,
});
