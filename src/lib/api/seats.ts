import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, ManagementError, managementKey, orgPath, readOptions } from "./management";
import { operationSchema, type Operation } from "./operations";
import { reclaimCandidateSchema } from "./members";

/**
 * 좌석 원장 조회와 회수·복원 명령(서버 대시보드 명세 "좌석 원장 조회", enrollment 명세 §12 "좌석 회수·복원" — ADR 0048·0049).
 * 좌석은 서버 원장의 값이다. 회수는 미리보기 → 실행(작업)이고, 결과는 작업 조회로 본다 — 접수(202)를 성공으로 보이지 않는다.
 */
const count = z.number().int().nonnegative();
const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const availability = z.enum(["available", "partial", "unavailable"]);
const seatState = z.enum(["assigned", "pending_assignment", "pending_release", "released"]);
const method = z.enum(["vendor_control", "admin_action"]);
const controlRef = z.object({ operationId: z.string(), kind: z.enum(["seat_reclaim", "seat_restore"]) });
const currentMeta = z.object({ organizationId: z.string(), asOf: z.iso.datetime({ offset: true }), snapshotId: z.string() });

export const memberSeatSchema = z.object({
  seatAssignmentId: z.string(), version: z.number(), vendorId: z.string(), vendorName: z.string(), kind: z.string(),
  contractVersion: z.number().nullable(), tierId: z.string().nullable(), tierLabel: z.string().nullable(), vendorTier: z.string().nullable(),
  account: z.string(), accountKind: z.enum(["email", "github_login"]), state: seatState, source: z.string(), memberLink: z.string().nullable(),
  assignedAt: z.iso.datetime({ offset: true }), releaseEffectiveOn: z.string().nullable(), releasedAt: z.iso.datetime({ offset: true }).nullable(),
  ledgerAvailability: availability, ledgerReason: z.string().nullable(),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(), idleDays: count.nullable(), reviewReason: z.string().nullable(),
  reclaimCandidate: z.boolean(), canReclaim: z.boolean(), reclaimReason: z.string().nullable(),
  reclaimMethod: method.nullable().optional(), lastControl: controlRef.nullable().optional(),
});
export type MemberSeat = z.infer<typeof memberSeatSchema>;
const memberSeatsSchema = z.object({ meta: currentMeta, memberId: z.string(), policy: z.object({ idleDays: count, version: z.number() }), seats: z.array(memberSeatSchema) });
export type MemberSeats = z.infer<typeof memberSeatsSchema>;

export const vendorSeatSchema = z.object({
  seatAssignmentId: z.string(), version: z.number(), account: z.string(), accountKind: z.enum(["email", "github_login"]), state: seatState, source: z.string(),
  memberId: z.string().nullable(), memberAccount: z.string().nullable(), memberLink: z.string().nullable(),
  tierId: z.string().nullable(), tierLabel: z.string().nullable(), vendorTier: z.string().nullable(),
  assignedAt: z.iso.datetime({ offset: true }), releaseEffectiveOn: z.string().nullable(), releasedAt: z.iso.datetime({ offset: true }).nullable(), note: z.string().nullable(),
  canReclaim: z.boolean(), reclaimReason: z.string().nullable(), reclaimMethod: method.nullable(), lastControl: controlRef.nullable(),
});
export type VendorSeat = z.infer<typeof vendorSeatSchema>;
const vendorSeatsSchema = z.object({ meta: currentMeta, vendorId: z.string(), ledgerAvailability: availability, ledgerReason: z.string().nullable(),
  seats: z.object({ items: z.array(vendorSeatSchema), totalCount: count, nextCursor: z.string().nullable() }) });
export type VendorSeatsPage = z.infer<typeof vendorSeatsSchema>;

const candidatesSchema = z.object({ meta: currentMeta, idleDays: count,
  candidates: z.object({ availability, reason: z.string().nullable(), data: z.object({ items: z.array(reclaimCandidateSchema), totalCount: count, nextCursor: z.string().nullable() }).nullable() }) });
export type CandidatesPage = z.infer<typeof candidatesSchema>;

export const reclaimPreviewSchema = z.object({
  previewId: z.string(), expiresAt: z.iso.datetime({ offset: true }),
  eligibleSeatAssignmentIds: z.array(z.string()), rejected: z.array(z.object({ seatAssignmentId: z.string(), reason: z.string() })),
  estimatedMonthlySavingsUsd: money.nullable(), savingsEffectiveAt: z.string().nullable(), resultingUnallocatedSeats: count.nullable(),
  savingsBasis: z.string().nullable().optional(),
  targets: z.array(z.object({ seatAssignmentId: z.string(), vendorId: z.string(), method })).optional(),
});
export type ReclaimPreview = z.infer<typeof reclaimPreviewSchema>;

const dashboard = <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) => apiJson("dashboard", path, schema, { signal });
const invalid = () => new ManagementError("invalid_response", 422);

export const memberSeatsOptions = (org: string, memberId: string | null) => queryOptions({
  queryKey: [...managementKey(org, "member-seats"), memberId],
  queryFn: async ({ signal }) => {
    if (!memberId) throw new Error("조회할 구성원이 없습니다.");
    const data = await dashboard(orgPath(org, `/members/${encodeURIComponent(memberId)}/seats`), memberSeatsSchema, signal);
    if (data.meta.organizationId !== org || data.memberId !== memberId) throw invalid();
    return data;
  },
  enabled: !!org && !!memberId,
  ...readOptions,
});

/** 회수 후보의 다음 페이지들 — 구성원 화면이 실은 첫 페이지의 cursor 부터 잇는다(cursor 가 기준 시각을 담는다). */
export const candidatePagesOptions = (org: string, startCursor: string | null, limit = 20) => infiniteQueryOptions({
  queryKey: [...managementKey(org, "seat-reclaim-candidates"), startCursor, limit],
  queryFn: async ({ pageParam, signal }) => {
    const query = new URLSearchParams({ limit: String(limit), cursor: pageParam });
    const data = await dashboard(orgPath(org, `/seat-reclaim-candidates?${query}`), candidatesSchema, signal);
    if (data.meta.organizationId !== org) throw invalid();
    return data;
  },
  initialPageParam: startCursor ?? "",
  getNextPageParam: (last) => last.candidates.data?.nextCursor ?? null,
  enabled: false,
  ...readOptions,
});

/** 등록 제품 하나의 좌석 — 구성원에 잇지 않은 좌석까지(설정 권한). */
export const vendorSeatsOptions = (org: string, vendorId: string | null, limit = 50) => infiniteQueryOptions({
  queryKey: [...managementKey(org, "vendor-seats"), vendorId, limit],
  queryFn: async ({ pageParam, signal }) => {
    if (!vendorId) throw new Error("조회할 제품이 없습니다.");
    const query = new URLSearchParams({ limit: String(limit) });
    if (pageParam) { query.set("cursor", pageParam.cursor); query.set("snapshotId", pageParam.snapshotId); }
    const data = await dashboard(orgPath(org, `/vendors/${encodeURIComponent(vendorId)}/seats?${query}`), vendorSeatsSchema, signal);
    if (data.meta.organizationId !== org || data.vendorId !== vendorId) throw invalid();
    return data;
  },
  initialPageParam: null as { cursor: string; snapshotId: string } | null,
  getNextPageParam: (last) => last.seats.nextCursor ? { cursor: last.seats.nextCursor, snapshotId: last.meta.snapshotId } : null,
  enabled: !!org && !!vendorId,
  ...readOptions,
});

type Post = <T>(org: string, path: string, body: unknown, schema: z.ZodType<T>) => Promise<T>;

export const previewReclaim = (post: Post, org: string, seats: { seatAssignmentId: string; expectedVersion: number }[]) =>
  post(org, "/seat-reclaims/preview", { seats }, reclaimPreviewSchema);
export const executeReclaim = (post: Post, org: string, previewId: string): Promise<Operation> =>
  post(org, "/seat-reclaims", { previewId }, operationSchema);
export const restoreReclaim = (post: Post, org: string, operationId: string): Promise<Operation> =>
  post(org, `/seat-reclaims/${encodeURIComponent(operationId)}/restore`, {}, operationSchema);
/** 관리자가 벤더 콘솔에서 조치했다고 확인한다(조치 대기 대상만). */
export const confirmAdminAction = (post: Post, org: string, operationId: string, seatAssignmentId: string): Promise<Operation> =>
  post(org, `/operations/${encodeURIComponent(operationId)}/targets/${encodeURIComponent(seatAssignmentId)}/confirm`, {}, operationSchema);
/** 관리자 조치를 하지 않기로 한다 — 원장은 그대로다. */
export const cancelAdminAction = (post: Post, org: string, operationId: string, seatAssignmentId: string): Promise<Operation> =>
  post(org, `/operations/${encodeURIComponent(operationId)}/targets/${encodeURIComponent(seatAssignmentId)}/cancel`, {}, operationSchema);

/** 좌석 상태 */
export const SEAT_STATE_TEXT: Record<MemberSeat["state"], string> = {
  assigned: "배정", pending_assignment: "배정 대기(초대 수락 전)", pending_release: "해제 예정", released: "해제",
};
/** 좌석의 상태를 정한 원천 */
export const SEAT_SOURCE_TEXT: Record<string, string> = {
  connector: "벤더 동기화", manual: "관리자 기록", csv: "CSV 가져오기", vendor_control: "벤더 API 회수·복원", admin_action: "관리자 조치 확인",
};
export const METHOD_TEXT: Record<z.infer<typeof method>, string> = {
  vendor_control: "벤더 API로 해지", admin_action: "벤더 콘솔에서 직접 해지 후 확인",
};

/** 좌석·회수의 서버 사유 코드(대시보드 명세 "좌석 원장 조회"·enrollment 명세 §12). 모르는 코드는 코드 그대로 보여 준다. */
const SEAT_REASONS: Record<string, string> = {
  // 원장 가용성
  seat_sync_pending: "벤더 동기화가 아직 성공하지 않았습니다", seat_sync_failing: "벤더 동기화가 실패하고 있습니다",
  seat_sync_outdated: "벤더 동기화가 오래되었습니다", seat_source_not_recorded: "이 제품은 좌석을 기록하지 않았습니다",
  seat_source_provisional: "연결 전 임시 기록입니다",
  // 검토
  not_assigned: "배정 좌석이 아닙니다", seat_unlinked: "구성원에 잇지 않은 좌석입니다", seat_source_unavailable: "좌석 원장을 쓸 수 없습니다",
  product_unobservable: "이 제품의 사용은 관측하지 않습니다", in_use: "기준 기간 안에 사용했습니다", observation_incomplete: "관측이 부족해 판정하지 않았습니다",
  // 회수 가능 여부·미리보기 거절
  management_disabled: "관리 기능이 꺼진 서버입니다", control_in_progress: "끝나지 않은 회수·복원이 있습니다",
  plan_mismatch: "연결한 커넥터가 지금 계약 플랜과 다릅니다", vendor_account_unknown: "벤더 내부 ID가 없어 API로 해지할 수 없습니다(연결 전 기록)",
  connector_unavailable: "이 서버에 벤더 연결 기능이 없습니다", version_conflict: "다른 곳에서 좌석이 바뀌었습니다", not_found: "좌석을 찾을 수 없습니다",
  seat_reassigned: "이미 다시 배정된 좌석입니다", not_restorable: "해제 예정 좌석은 벤더 API로만 되살릴 수 있습니다",
  // 대상 실패
  cancelled: "관리자가 조치를 취소함", seat_changed: "실행 전에 좌석이 바뀌어 벤더를 부르지 않음", connection_removed: "벤더 연결이 지워짐",
  invalid_credentials: "벤더가 자격증명을 거절함", insufficient_permission: "자격증명의 권한 부족", vendor_rejected: "벤더가 요청을 거절함",
  directory_managed: "IdP가 관리하는 구성원이라 벤더가 거절함", rate_limited: "벤더 호출 한도 초과", vendor_unavailable: "벤더 일시 장애",
  invalid_response: "벤더 응답을 해석하지 못함", credential_key_unavailable: "자격증명 암호화 키가 없음", control_error: "처리 중 오류",
};
export const seatReasonText = (reason: string | null | undefined) => reason ? SEAT_REASONS[reason] ?? reason : "-";

/** 관리자가 벤더 콘솔에서 할 일 */
export const ACTION_TEXT: Record<string, string> = {
  release_in_vendor_console: "벤더 관리 콘솔에서 이 계정의 좌석(구성원)을 해지한 뒤 '해지 완료 확인'을 누르세요.",
  restore_in_vendor_console: "벤더 관리 콘솔에서 이 계정을 다시 초대·배정한 뒤 '배정 완료 확인'을 누르세요.",
};
