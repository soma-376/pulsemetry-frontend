import { organizationKey } from "./query-keys";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, ManagementError, readOptions } from "./management";
export const catalogVendorSchema = z.object({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
  product: z.string(),
  allowsSeatTiers: z.boolean(),
});
export const catalogPlanSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  billing: z.literal("seat"),
  separateUsageBilling: z.boolean(),
});
export const catalogPageSchema = z.object({
  catalogVersion: z.string(),
  items: z.array(catalogVendorSchema),
  totalCount: z.number(),
  nextCursor: z.string().nullable(),
});
export const catalogPlansSchema = z.object({
  catalogVersion: z.string(),
  vendor: catalogVendorSchema,
  plans: z.array(catalogPlanSchema),
});
export type CatalogVendor = z.infer<typeof catalogVendorSchema>;
export type CatalogPlan = z.infer<typeof catalogPlanSchema>;
export async function fetchVendorCatalog(signal?: AbortSignal) {
  // 기존 select UI를 유지하면서 서버의 모든 페이지를 읽는다. 커서 만료 시 첫 페이지부터 한 번 재시작한다.
  for (let attempt = 0; ; attempt++) {
    try {
      const items: CatalogVendor[] = [],
        cursors = new Set<string>();
      let cursor: string | null = null,
        version: string | undefined;
      do {
        const params = new URLSearchParams({ limit: "100" });
        if (cursor) params.set("cursor", cursor);
        const page = await apiJson(
          "dashboard",
          `/vendor-catalog?${params}`,
          catalogPageSchema,
          { signal },
        );
        if (version && version !== page.catalogVersion)
          throw new ManagementError("invalid_request", 400);
        version = page.catalogVersion;
        items.push(...page.items);
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor))
          throw new ManagementError("invalid_response", 422);
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return { items, catalogVersion: version! };
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof ManagementError &&
        error.status === 400
      )
        continue;
      throw error;
    }
  }
}
export const catalogOptions = (org: string) =>
  queryOptions({
    queryKey: [...organizationKey(org), "vendor-catalog"],
    queryFn: ({ signal }) => fetchVendorCatalog(signal),
    ...readOptions,
    staleTime: 300_000,
  });
export const plansOptions = (org: string, kind: string, version?: string) =>
  queryOptions({
    queryKey: [...organizationKey(org), "vendor-plans", kind, version],
    enabled: !!kind,
    queryFn: async ({ signal }) => {
      const data = await apiJson(
        "dashboard",
        `/vendor-catalog/${encodeURIComponent(kind)}/plans`,
        catalogPlansSchema,
        { signal },
      );
      if (
        data.vendor.id !== kind ||
        (version && data.catalogVersion !== version)
      )
        throw new ManagementError("catalog_changed", 409);
      return data;
    },
    ...readOptions,
    staleTime: 300_000,
  });
