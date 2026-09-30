import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, ManagementError, managementKey, orgPath, readOptions } from "./management";

export const invitationSchema = z.object({
  invitationId: z.string(), email: z.string(), role: z.string(),
  createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
  installationUsedAt: z.iso.datetime({ offset: true }).nullable(), signupUsedAt: z.iso.datetime({ offset: true }).nullable(),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
  status: z.enum(["pending", "expired", "used", "revoked"]),
  memberId: z.string(), memberStatus: z.string(),
  team: z.object({ teamId: z.string(), teamName: z.string() }).nullable(),
  memberVersion: z.number(),
});
export type Invitation = z.infer<typeof invitationSchema>;
const pageSchema = z.object({ items: z.array(invitationSchema), nextCursor: z.string().nullable() });

type Fetcher = <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) => Promise<T>;
const enrollmentApi: Fetcher = (path, schema, signal) => apiJson("enrollment", path, schema, { signal });

async function allPages(fetcher: Fetcher, organizationId: string, status: "pending" | "expired", signal?: AbortSignal) {
  const items: Invitation[] = [], cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    // 다음 페이지에도 같은 필터를 보낸다.
    const query = new URLSearchParams({ limit: "100", status, memberStatus: "invited" });
    if (cursor) query.set("cursor", cursor);
    const result: z.infer<typeof pageSchema> = await fetcher(orgPath(organizationId, `/invitations?${query}`), pageSchema, signal);
    items.push(...result.items);
    cursor = result.nextCursor;
    if (cursor && cursors.has(cursor)) throw new ManagementError("invalid_response", 422);
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return items;
}

/**
 * 아직 합류하지 않은 사람의 초대 — 대기 중인 것과 만료된 것.
 * 가입이나 설치 중 하나를 마친 구성원의 초대는 `pending`이어도 대기자가 아니므로 구성원 상태로 거른다.
 */
export async function fetchWaitingInvitations(organizationId: string, signal?: AbortSignal, fetcher: Fetcher = enrollmentApi) {
  const pending = await allPages(fetcher, organizationId, "pending", signal);
  const expired = await allPages(fetcher, organizationId, "expired", signal);
  return [...pending, ...expired];
}

export const waitingInvitationsOptions = (organizationId: string) => queryOptions({
  queryKey: managementKey(organizationId, "waiting-invitations"),
  queryFn: ({ signal }) => fetchWaitingInvitations(organizationId, signal),
  enabled: !!organizationId,
  ...readOptions,
});
