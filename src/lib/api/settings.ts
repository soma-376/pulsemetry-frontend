import { contractStatusSchema } from "../contract-status";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  apiJson,
  managementKey,
  ManagementError,
  orgPath,
  readOptions,
} from "./management";
import { overviewSchema } from "./overview";
import { seatSourceSchema } from "./seats";
import { alertRuleSchema } from "./alerts";

const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const count = z.number().int().nonnegative();
const meta = z.object({ organizationId: z.string(), snapshotId: z.string() });
export const contractSchema = z.object({
  version: count,
  planId: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  termNote: z.string().nullable(),
  tiers: z.array(
    z.object({
      tierId: z.string(),
      label: z.string(),
      seats: count,
      monthlyFeePerSeatUsd: money,
    }),
  ),
  monthlySeatFeeUsd: money.nullable(),
  confirmedAt: z.string(),
  confirmedBy: z.string(),
});
const section = <T extends z.ZodType>(data: T) =>
  z.object({
    availability: z.enum(["available", "partial", "unavailable"]),
    reason: z.string().nullable(),
    data: data.nullable(),
  });
/** 벤더 청구 누계(서버 ADR 0050) — 환산 비용이나 계약액이 아니다. `equivalentCostUsd` 는 이 절에서 늘 null 이다. */
export const meteredPeriodSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  equivalentCostUsd: money.nullable(),
  actualBilledUsd: money.nullable(),
  billingKind: z.string().nullable().optional(),
  finalized: z.boolean().nullable().optional(),
  source: z.string().nullable().optional(),
  fetchedAt: z.string().nullable().optional(),
});
export const settingsVendorSchema = z.object({
  vendorId: z.string(),
  displayName: z.string(),
  kind: z.string(),
  source: z.string(),
  version: count,
  state: z.string(),
  contractStatus: contractStatusSchema,
  contract: contractSchema.nullable(),
  observation: z.string(),
  firstSeenAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  activeUsers7d: count.nullable(),
  activeUsers30d: count.nullable(),
  // 좌석 원천·좌석 수·종량 지출(서버 가산 — ADR 0048·0050). 옛 서버에는 없다.
  seatSource: seatSourceSchema.optional(),
  seats: section(
    z.object({
      assigned: count,
      contracted: count.nullable(),
      unallocated: count.nullable(),
    }),
  ).optional(),
  meteredMonthToDate: section(meteredPeriodSchema).optional(),
});
export type SettingsVendor = z.infer<typeof settingsVendorSchema>;
export const settingsVendorResponseSchema = z.object({
  meta,
  vendor: settingsVendorSchema,
});
const page = z.object({
  items: z.array(settingsVendorSchema),
  totalCount: count,
  nextCursor: z.string().nullable(),
});
export const settingsSchema = z.object({
  meta,
  ingest: overviewSchema.shape.ingest,
  capabilities: z.object({
    editContracts: z.boolean(),
    editCollectionPolicy: z.boolean(),
    editAlertRules: z.boolean(),
    notifyInstallations: z.boolean(),
  }),
  summary: z.object({
    configuredVendors: count,
    unconfiguredVendors: count,
    monthlySeatFeeUsd: money.nullable(),
    contractedSeats: count.nullable(),
    activeSeats7d: count.nullable(),
    assignedSeats: count.nullable().optional(),
    meteredMonthToDate: z.object({
      availability: z.string(),
      reason: z.string().nullable().optional(),
      data: z
        .object({
          actualBilledUsd: money.nullable(),
          equivalentCostUsd: money.nullable(),
        })
        .nullable(),
    }),
  }),
  vendors: page,
  // version 은 원문 선택이 실린 manifest 판이고, 회수 기준·집계 보존은 설정의 판(settingsVersion)으로 따로 저장한다(백엔드 ADR 0046).
  collectionPolicy: z.object({
    version: count,
    collectRawContent: z.boolean(),
    reclaimIdleDays: count,
    aggregateRetentionMonths: count.nullable(),
    settingsVersion: count,
    settingsUpdatedAt: z.string().nullable(),
    reclaimIdleDaysSource: z.enum(["organization", "default"]),
    options: z.object({
      reclaimIdleDays: z.array(count),
      aggregateRetentionMonths: z.array(count.nullable()),
    }),
    // 이 조직의 가장 최근 보존 정리 작업(ADR 0047). 새로고침 뒤에도 마지막 정리의 상태를 다시 조회한다.
    cleanupOperationId: z.string().nullable(),
    // 원문 보존 일수. 서버는 null 을 준다 — 원본 아카이브의 수명은 인프라 저장소 규칙이고 이 서비스가 조회하지 않는다(백엔드 ADR 0046).
    rawContentRetentionDays: count.nullable().optional(),
  }),
  // evidence: 판정 근거별 설치 수(서버 가산) — 최근 설치 보고 · 보고가 없어 쓴 적용 확인 기록 · 근거 없음.
  // 가산 전의 서버는 보내지 않는다 — 없으면 근거를 말하지 않는다("설치 보고 기준"처럼 꾸미지 않는다).
  policyRollout: z.object({
    desiredVersion: count,
    eligibleInstallations: count,
    appliedInstallations: count,
    outdatedInstallations: count,
    unknownInstallations: count,
    evidence: z
      .object({
        heartbeat: z.number().int().nonnegative(),
        appliedConfirmation: z.number().int().nonnegative(),
        none: z.number().int().nonnegative(),
      })
      .optional(),
  }),
  // 등록 제품 기준 알림 규칙의 저장값·가용성·사유(허브 ADR 0008).
  alertRules: z.array(alertRuleSchema),
});
export type Settings = z.infer<typeof settingsSchema>;
export async function fetchSettings(
  org: string,
  signal?: AbortSignal,
): Promise<Settings> {
  for (let attempt = 0; ; attempt++) {
    try {
      const data = await apiJson(
        "dashboard",
        orgPath(org, "/settings"),
        settingsSchema,
        { signal },
      );
      if (data.meta.organizationId !== org)
        throw new ManagementError("invalid_response", 422);
      const cursors = new Set<string>();
      let cursor = data.vendors.nextCursor;
      while (cursor) {
        if (cursors.has(cursor))
          throw new ManagementError("invalid_response", 422);
        cursors.add(cursor);
        const query = new URLSearchParams({
          cursor,
          snapshotId: data.meta.snapshotId,
          limit: "100",
        });
        const next = await apiJson(
          "dashboard",
          orgPath(org, `/vendors?${query}`),
          z.object({ meta, vendors: page }),
          { signal },
        );
        if (
          next.meta.organizationId !== org ||
          next.meta.snapshotId !== data.meta.snapshotId
        )
          throw new ManagementError("invalid_response", 422);
        data.vendors.items.push(...next.vendors.items);
        cursor = next.vendors.nextCursor;
      }
      data.vendors.nextCursor = null;
      return data;
    } catch (error) {
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
export const settingsOptions = (org: string) =>
  queryOptions({
    queryKey: managementKey(org, "settings"),
    queryFn: ({ signal }) => fetchSettings(org, signal),
    enabled: !!org,
    ...readOptions,
  });
export async function fetchSettingsVendor(
  org: string,
  id: string,
  signal?: AbortSignal,
) {
  const result = await apiJson(
    "dashboard",
    orgPath(org, `/vendors/${encodeURIComponent(id)}`),
    settingsVendorResponseSchema,
    { signal },
  );
  if (result.meta.organizationId !== org || result.vendor.vendorId !== id)
    throw new ManagementError("invalid_response", 422);
  return result.vendor;
}

export const settingsVendorOptions = (org: string, id: string | null) =>
  queryOptions({
    queryKey: [...managementKey(org, "settings-vendor"), id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error("조회할 벤더를 선택하세요.");
      return fetchSettingsVendor(org, id, signal);
    },
    ...readOptions,
    enabled: !!org && !!id,
  });
