import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  apiJson,
  managementKey,
  ManagementError,
  orgPath,
  readOptions,
} from "./management";

export const contractInputSchema = z.object({
  status: z.enum(["required", "complete"]),
  missingFields: z.array(z.string()),
});
export const contractInputStatusSchema = z
  .object({
    organizationId: z.string(),
    asOf: z.iso.datetime({ offset: true }),
    requiredCount: z.number().int().nonnegative(),
    vendors: z.array(
      z.object({
        vendorId: z.string(),
        displayName: z.string(),
        missingFields: z.array(z.string()).min(1),
      }),
    ),
    expiredCount: z.number().int().nonnegative(),
    expiredContracts: z.array(
      z.object({
        vendorId: z.string(),
        displayName: z.string(),
        endDate: z.iso.date(),
      }),
    ),
  })
  .refine(
    (data) =>
      data.requiredCount === data.vendors.length &&
      new Set(data.vendors.map((v) => v.vendorId)).size ===
        data.vendors.length &&
      data.expiredCount === data.expiredContracts.length &&
      new Set(data.expiredContracts.map((v) => v.vendorId)).size ===
        data.expiredContracts.length,
  );
export type ExpiredContract = z.infer<
  typeof contractInputStatusSchema
>["expiredContracts"][number];
export async function fetchContractInputStatus(
  organizationId: string,
  signal?: AbortSignal,
) {
  const result = await apiJson(
    "dashboard",
    orgPath(organizationId, "/contract-input-status"),
    contractInputStatusSchema,
    { signal },
  );
  if (result.organizationId !== organizationId)
    throw new ManagementError("invalid_response", 422);
  return result;
}
export const contractInputStatusOptions = (organizationId: string) =>
  queryOptions({
    queryKey: managementKey(organizationId, "contract-input-status"),
    queryFn: ({ signal }) => fetchContractInputStatus(organizationId, signal),
    enabled: !!organizationId,
    ...readOptions,
  });

const FIELDS: Record<string, string> = {
  planId: "플랜",
  seats: "좌석 수",
  monthlyFeePerSeatUsd: "월 좌석 단가",
};
export function contractInputText(fields: string[]) {
  return (
    [...new Set(fields)]
      .map((field) => FIELDS[field] ?? "계약 정보")
      .join(" · ") + " 입력 필요"
  );
}
