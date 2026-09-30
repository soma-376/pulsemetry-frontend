import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, ManagementError, managementKey, orgPath, readOptions, type createCommands } from "./management";

const timestamp = z.iso.datetime({ offset: true });
/** 초대 메일의 발송 상태. 코드 발급과 별개의 사실이다 — `sent`는 메일 서버가 받았다는 뜻이다. */
export const deliverySchema = z.object({
  status: z.string(), reason: z.string().nullable(), queuedAt: timestamp.nullable(), lastAttemptAt: timestamp.nullable(),
  sentAt: timestamp.nullable(), failureCode: z.string().nullable(), attempts: z.number().int().nonnegative(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export const invitationSchema = z.object({
  invitationId: z.string(), email: z.string(), role: z.string(),
  createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
  installationUsedAt: z.iso.datetime({ offset: true }).nullable(), signupUsedAt: z.iso.datetime({ offset: true }).nullable(),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
  status: z.enum(["pending", "expired", "used", "revoked"]),
  memberId: z.string(), memberStatus: z.string(),
  team: z.object({ teamId: z.string(), teamName: z.string() }).nullable(),
  memberVersion: z.number(),
  delivery: deliverySchema,
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

/** 발송이 아직 끝나지 않은 초대가 있는가. 있으면 목록을 짧은 주기로 다시 읽는다. */
export const deliveryPending = (invitations: readonly Invitation[] | undefined) =>
  !!invitations?.some((invitation) => invitation.status === "pending" && ["queued", "sending"].includes(invitation.delivery.status));
/** 발송 작업이 끝났는지 보려고 목록을 다시 읽는 주기. */
export const DELIVERY_POLL_MS = 4_000;

export const waitingInvitationsOptions = (organizationId: string) => queryOptions({
  queryKey: managementKey(organizationId, "waiting-invitations"),
  queryFn: ({ signal }) => fetchWaitingInvitations(organizationId, signal),
  enabled: !!organizationId,
  ...readOptions,
});

type Post = ReturnType<typeof createCommands>;
/** 서버가 한 요청에서 받는 초대의 최대 인원. */
export const INVITATION_LIMIT = 100;
export type InvitationRequest = { email: string; teamId: string | null; role: string };
export const invitationResultSchema = z.object({
  email: z.string(), invitationId: z.string().nullable(),
  status: z.enum(["issued", "already_member", "already_invited", "rejected"]),
  reason: z.string().nullable(), expiresAt: z.iso.datetime({ offset: true }).nullable(), code: z.string().nullable(),
  // 발급한 항목에만 있다.
  delivery: deliverySchema.nullable(),
});
export type InvitationResult = z.infer<typeof invitationResultSchema>;
const issuedSchema = z.object({ results: z.array(invitationResultSchema) });
export const reissuedSchema = z.object({ invitationId: z.string(), replacesInvitationId: z.string(), code: z.string(), expiresAt: z.iso.datetime({ offset: true }), delivery: deliverySchema });
export type ReissuedInvitation = z.infer<typeof reissuedSchema>;

/** 초대 코드를 발급한다. 메일을 켠 서버는 초대 메일도 적재한다 — 발급과 발송은 다른 상태다(`delivery`). 코드는 이 응답에만 있다. */
export const issueInvitations = async (post: Post, organizationId: string, invitations: InvitationRequest[]) =>
  (await post(organizationId, "/invitations/batch", { invitations }, issuedSchema)).results;
/** 기존 코드를 폐기하고 새 코드를 발급한다. 초대 ID도 바뀌고, 메일을 켠 서버는 새 코드의 메일을 다시 보낸다. */
export const reissueInvitation = (post: Post, organizationId: string, invitationId: string) =>
  post(organizationId, `/invitations/${encodeURIComponent(invitationId)}/reissue`, {}, reissuedSchema);
export const revokeInvitation = (post: Post, organizationId: string, invitationId: string) =>
  post(organizationId, `/invitations/${encodeURIComponent(invitationId)}/revoke`, {}, z.undefined());
