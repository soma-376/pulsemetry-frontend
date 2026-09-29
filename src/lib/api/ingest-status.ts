import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, managementKey, ManagementError, orgPath, readOptions } from "./management";

export const ingestStatusSchema = z.object({
  organizationId: z.string(),
  status: z.enum(["healthy", "delayed", "down", "empty", "unknown"]),
  reason: z.string().nullable(),
  asOf: z.iso.datetime({ offset: true }),
  lastReceivedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type IngestStatus = z.infer<typeof ingestStatusSchema>;

export async function fetchIngestStatus(organizationId: string, signal?: AbortSignal) {
  const result = await apiJson("dashboard", orgPath(organizationId, "/ingest-status"), ingestStatusSchema, { signal });
  if (result.organizationId !== organizationId) throw new ManagementError("invalid_response", 422);
  return result;
}

export const ingestStatusOptions = (organizationId: string) => queryOptions({
  queryKey: managementKey(organizationId, "ingest-status"),
  queryFn: ({ signal }) => fetchIngestStatus(organizationId, signal),
  enabled: !!organizationId,
  ...readOptions,
});
