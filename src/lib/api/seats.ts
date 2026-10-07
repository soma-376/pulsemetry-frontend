import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  apiJson,
  ManagementError,
  managementKey,
  orgPath,
  readOptions,
} from "./management";
import { operationSchema, type Operation } from "./operations";
import { reclaimCandidateSchema } from "./members";

/**
 * 좌석 원장 조회와 회수·복원 명령(서버 대시보드 명세 "좌석 원장 조회", enrollment 명세 §12 "좌석 회수·복원" — ADR 0048·0049).
 * 좌석은 서버 원장의 값이다. 회수는 미리보기 → 실행(작업)이고, 결과는 작업 조회로 본다 — 접수(202)를 성공으로 보이지 않는다.
 */
const count = z.number().int().nonnegative();
const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const availability = z.enum(["available", "partial", "unavailable"]);
const seatState = z.enum([
  "assigned",
  "pending_assignment",
  "pending_release",
  "released",
]);
const method = z.enum(["vendor_control", "admin_action"]);
const controlRef = z.object({
  operationId: z.string(),
  kind: z.enum(["seat_reclaim", "seat_restore"]),
});
const currentMeta = z.object({
  organizationId: z.string(),
  asOf: z.iso.datetime({ offset: true }),
  snapshotId: z.string(),
});

export const memberSeatSchema = z.object({
  seatAssignmentId: z.string(),
  version: z.number(),
  vendorId: z.string(),
  vendorName: z.string(),
  kind: z.string(),
  contractVersion: z.number().nullable(),
  tierId: z.string().nullable(),
  tierLabel: z.string().nullable(),
  vendorTier: z.string().nullable(),
  account: z.string(),
  accountKind: z.enum(["email"]),
  state: seatState,
  source: z.string(),
  memberLink: z.string().nullable(),
  assignedAt: z.iso.datetime({ offset: true }),
  releaseEffectiveOn: z.string().nullable(),
  releasedAt: z.iso.datetime({ offset: true }).nullable(),
  ledgerAvailability: availability,
  ledgerReason: z.string().nullable(),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
  idleDays: count.nullable(),
  reviewReason: z.string().nullable(),
  reclaimCandidate: z.boolean(),
  canReclaim: z.boolean(),
  reclaimReason: z.string().nullable(),
  reclaimMethod: method.nullable().optional(),
  lastControl: controlRef.nullable().optional(),
});
export type MemberSeat = z.infer<typeof memberSeatSchema>;
const memberSeatsSchema = z.object({
  meta: currentMeta,
  memberId: z.string(),
  policy: z.object({ idleDays: count, version: z.number() }),
  seats: z.array(memberSeatSchema),
});
export type MemberSeats = z.infer<typeof memberSeatsSchema>;

export const vendorSeatSchema = z.object({
  seatAssignmentId: z.string(),
  version: z.number(),
  account: z.string(),
  accountKind: z.enum(["email"]),
  state: seatState,
  source: z.string(),
  memberId: z.string().nullable(),
  memberAccount: z.string().nullable(),
  memberLink: z.string().nullable(),
  tierId: z.string().nullable(),
  tierLabel: z.string().nullable(),
  vendorTier: z.string().nullable(),
  assignedAt: z.iso.datetime({ offset: true }),
  releaseEffectiveOn: z.string().nullable(),
  releasedAt: z.iso.datetime({ offset: true }).nullable(),
  note: z.string().nullable(),
  canReclaim: z.boolean(),
  reclaimReason: z.string().nullable(),
  reclaimMethod: method.nullable(),
  lastControl: controlRef.nullable(),
});
export type VendorSeat = z.infer<typeof vendorSeatSchema>;
const vendorSeatsSchema = z.object({
  meta: currentMeta,
  vendorId: z.string(),
  ledgerAvailability: availability,
  ledgerReason: z.string().nullable(),
  seats: z.object({
    items: z.array(vendorSeatSchema),
    totalCount: count,
    nextCursor: z.string().nullable(),
  }),
});
export type VendorSeatsPage = z.infer<typeof vendorSeatsSchema>;

const candidatesSchema = z.object({
  meta: currentMeta,
  idleDays: count,
  candidates: z.object({
    availability,
    reason: z.string().nullable(),
    data: z
      .object({
        items: z.array(reclaimCandidateSchema),
        totalCount: count,
        nextCursor: z.string().nullable(),
      })
      .nullable(),
  }),
});
export type CandidatesPage = z.infer<typeof candidatesSchema>;

export const reclaimPreviewSchema = z.object({
  previewId: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
  eligibleSeatAssignmentIds: z.array(z.string()),
  rejected: z.array(
    z.object({ seatAssignmentId: z.string(), reason: z.string() }),
  ),
  estimatedMonthlySavingsUsd: money.nullable(),
  savingsEffectiveAt: z.string().nullable(),
  resultingUnallocatedSeats: count.nullable(),
  savingsBasis: z.string().nullable().optional(),
  targets: z
    .array(
      z.object({ seatAssignmentId: z.string(), vendorId: z.string(), method }),
    )
    .optional(),
});
export type ReclaimPreview = z.infer<typeof reclaimPreviewSchema>;

const dashboard = <T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) => apiJson("dashboard", path, schema, { signal });
const invalid = () => new ManagementError("invalid_response", 422);

export const memberSeatsOptions = (org: string, memberId: string | null) =>
  queryOptions({
    queryKey: [...managementKey(org, "member-seats"), memberId],
    queryFn: async ({ signal }) => {
      if (!memberId) throw new Error("조회할 구성원이 없습니다.");
      const data = await dashboard(
        orgPath(org, `/members/${encodeURIComponent(memberId)}/seats`),
        memberSeatsSchema,
        signal,
      );
      if (data.meta.organizationId !== org || data.memberId !== memberId)
        throw invalid();
      return data;
    },
    enabled: !!org && !!memberId,
    ...readOptions,
  });

/** 회수 후보의 다음 페이지들 — 구성원 화면이 실은 첫 페이지의 cursor 부터 잇는다(cursor 가 기준 시각을 담는다). */
export const candidatePagesOptions = (
  org: string,
  startCursor: string | null,
  limit = 20,
) =>
  infiniteQueryOptions({
    queryKey: [
      ...managementKey(org, "seat-reclaim-candidates"),
      startCursor,
      limit,
    ],
    queryFn: async ({ pageParam, signal }) => {
      const query = new URLSearchParams({
        limit: String(limit),
        cursor: pageParam,
      });
      const data = await dashboard(
        orgPath(org, `/seat-reclaim-candidates?${query}`),
        candidatesSchema,
        signal,
      );
      if (data.meta.organizationId !== org) throw invalid();
      return data;
    },
    initialPageParam: startCursor ?? "",
    getNextPageParam: (last) => last.candidates.data?.nextCursor ?? null,
    enabled: false,
    ...readOptions,
  });

/** 등록 제품 하나의 좌석 — 구성원에 잇지 않은 좌석까지(설정 권한). */
export const vendorSeatsOptions = (
  org: string,
  vendorId: string | null,
  limit = 50,
) =>
  infiniteQueryOptions({
    queryKey: [...managementKey(org, "vendor-seats"), vendorId, limit],
    queryFn: async ({ pageParam, signal }) => {
      if (!vendorId) throw new Error("조회할 제품이 없습니다.");
      const query = new URLSearchParams({ limit: String(limit) });
      if (pageParam) {
        query.set("cursor", pageParam.cursor);
        query.set("snapshotId", pageParam.snapshotId);
      }
      const data = await dashboard(
        orgPath(org, `/vendors/${encodeURIComponent(vendorId)}/seats?${query}`),
        vendorSeatsSchema,
        signal,
      );
      if (data.meta.organizationId !== org || data.vendorId !== vendorId)
        throw invalid();
      return data;
    },
    initialPageParam: null as { cursor: string; snapshotId: string } | null,
    getNextPageParam: (last) =>
      last.seats.nextCursor
        ? { cursor: last.seats.nextCursor, snapshotId: last.meta.snapshotId }
        : null,
    enabled: !!org && !!vendorId,
    ...readOptions,
  });

type Post = <T>(
  org: string,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
) => Promise<T>;

export const previewReclaim = (
  post: Post,
  org: string,
  seats: { seatAssignmentId: string; expectedVersion: number }[],
) => post(org, "/seat-reclaims/preview", { seats }, reclaimPreviewSchema);
export const executeReclaim = (
  post: Post,
  org: string,
  previewId: string,
): Promise<Operation> =>
  post(org, "/seat-reclaims", { previewId }, operationSchema);
export const restoreReclaim = (
  post: Post,
  org: string,
  operationId: string,
): Promise<Operation> =>
  post(
    org,
    `/seat-reclaims/${encodeURIComponent(operationId)}/restore`,
    {},
    operationSchema,
  );
/** 관리자가 벤더 콘솔에서 조치했다고 확인한다(조치 대기 대상만). */
export const confirmAdminAction = (
  post: Post,
  org: string,
  operationId: string,
  seatAssignmentId: string,
): Promise<Operation> =>
  post(
    org,
    `/operations/${encodeURIComponent(operationId)}/targets/${encodeURIComponent(seatAssignmentId)}/confirm`,
    {},
    operationSchema,
  );
/** 관리자 조치를 하지 않기로 한다 — 원장은 그대로다. */
export const cancelAdminAction = (
  post: Post,
  org: string,
  operationId: string,
  seatAssignmentId: string,
): Promise<Operation> =>
  post(
    org,
    `/operations/${encodeURIComponent(operationId)}/targets/${encodeURIComponent(seatAssignmentId)}/cancel`,
    {},
    operationSchema,
  );

/** 좌석 상태 */
export const SEAT_STATE_TEXT: Record<MemberSeat["state"], string> = {
  assigned: "배정",
  pending_assignment: "배정 대기(초대 수락 전)",
  pending_release: "해제 예정",
  released: "해제",
};
/** 좌석의 상태를 정한 원천 */
export const SEAT_SOURCE_TEXT: Record<string, string> = {
  connector: "벤더 동기화",
  manual: "관리자 기록",
  csv: "CSV 가져오기",
  vendor_control: "벤더 API 회수·복원",
  admin_action: "관리자 조치 확인",
};
export const METHOD_TEXT: Record<z.infer<typeof method>, string> = {
  vendor_control: "벤더 API로 해지",
  admin_action: "벤더 콘솔에서 직접 해지 후 확인",
};

/** 좌석·회수의 서버 사유 코드(대시보드 명세 "좌석 원장 조회"·enrollment 명세 §12). 모르는 코드는 코드 그대로 보여 준다. */
const SEAT_REASONS: Record<string, string> = {
  // 원장 가용성
  seat_sync_pending: "벤더 동기화가 아직 성공하지 않았습니다",
  seat_sync_failing: "벤더 동기화가 실패하고 있습니다",
  seat_sync_outdated: "벤더 동기화가 오래되었습니다",
  seat_source_not_recorded: "이 제품은 좌석을 기록하지 않았습니다",
  seat_source_provisional: "연결 전 임시 기록입니다",
  // 검토
  not_assigned: "배정 좌석이 아닙니다",
  seat_unlinked: "구성원에 잇지 않은 좌석입니다",
  seat_source_unavailable: "좌석 원장을 쓸 수 없습니다",
  product_unobservable: "이 제품의 사용은 관측하지 않습니다",
  in_use: "기준 기간 안에 사용했습니다",
  observation_incomplete: "관측이 부족해 판정하지 않았습니다",
  // 회수 가능 여부·미리보기 거절
  management_disabled: "관리 기능이 꺼진 서버입니다",
  control_in_progress: "끝나지 않은 회수·복원이 있습니다",
  plan_mismatch: "연결한 커넥터가 지금 계약 플랜과 다릅니다",
  vendor_account_unknown:
    "벤더 내부 ID가 없어 API로 해지할 수 없습니다(연결 전 기록)",
  connector_unavailable: "이 서버에 벤더 연결 기능이 없습니다",
  version_conflict: "다른 곳에서 좌석이 바뀌었습니다",
  not_found: "좌석을 찾을 수 없습니다",
  seat_reassigned: "이미 다시 배정된 좌석입니다",
  not_restorable: "해제 예정 좌석은 벤더 API로만 되살릴 수 있습니다",
  // 대상 실패
  cancelled: "관리자가 조치를 취소함",
  seat_changed: "실행 전에 좌석이 바뀌어 벤더를 부르지 않음",
  connection_removed: "벤더 연결이 지워짐",
  invalid_credentials: "벤더가 자격증명을 거절함",
  insufficient_permission: "자격증명의 권한 부족",
  vendor_rejected: "벤더가 요청을 거절함",
  directory_managed: "IdP가 관리하는 구성원이라 벤더가 거절함",
  rate_limited: "벤더 호출 한도 초과",
  vendor_unavailable: "벤더 일시 장애",
  invalid_response: "벤더 응답을 해석하지 못함",
  credential_key_unavailable: "자격증명 암호화 키가 없음",
  control_error: "처리 중 오류",
  // 동기화 실패
  invalid_listing: "벤더 목록을 원장에 넣을 수 없음(계정 형식·중복)",
  sync_error: "동기화 중 오류",
  claim_lost: "다른 실행이 가져감",
  billing_error: "청구 읽기 중 오류",
  // 종량 지출(벤더 청구 누계 — 서버 ADR 0050)
  billing_not_supported: "이 플랜에는 청구 조회 API가 없습니다",
  billing_source_not_connected: "벤더 연결이 없습니다",
  billing_sync_pending: "청구 누계를 아직 읽지 않았습니다",
  billing_sync_failing: "청구 누계 읽기가 실패하고 있습니다",
  billing_sync_outdated: "청구 누계를 읽은 지 오래되었습니다",
  billing_periods_differ: "벤더마다 정산 기간이 달라 더하지 않습니다",
  not_applicable: "등록한 제품이 없습니다",
};
export const seatReasonText = (reason: string | null | undefined) =>
  reason ? (SEAT_REASONS[reason] ?? reason) : "-";

/** 관리자가 벤더 콘솔에서 할 일 */
export const ACTION_TEXT: Record<string, string> = {
  release_in_vendor_console:
    "벤더 관리 콘솔에서 이 계정의 좌석(구성원)을 해지한 뒤 '해지 완료 확인'을 누르세요.",
  restore_in_vendor_console:
    "벤더 관리 콘솔에서 이 계정을 다시 초대·배정한 뒤 '배정 완료 확인'을 누르세요.",
};

// ---- 좌석 원천(벤더 연결)·수동 기록 (enrollment 명세 §12 "벤더 연결"·"좌석 수동 기록") ----

const syncState = z.object({
  status: z.enum(["pending", "succeeded", "failing"]),
  lastSucceededAt: z.string().nullable(),
  lastFailedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export const seatSourceSchema = z.object({
  authority: z.enum(["connector", "manual"]),
  provisional: z.boolean(),
  connector: z
    .object({
      connectorId: z.string(),
      accountKind: z.enum(["email"]),
      capabilities: z.array(z.string()),
      settingKeys: z.array(z.string()),
      supported: z.array(z.string()),
    })
    .nullable(),
  connection: z
    .object({
      connectionId: z.string(),
      version: z.number(),
      connectorId: z.string(),
      settings: z.record(z.string(), z.string()),
      credential: z.object({ configured: z.boolean(), updatedAt: z.string() }),
      check: z.object({ status: z.string(), checkedAt: z.string().nullable() }),
      sync: syncState,
      createdAt: z.string(),
      updatedAt: z.string(),
      billing: syncState.nullable().optional(),
    })
    .nullable(),
});
export type SeatSource = z.infer<typeof seatSourceSchema>;
const connectionResponse = z.object({ seatSource: seatSourceSchema });

const enrollment = <T>(path: string, schema: z.ZodType<T>, init: RequestInit) =>
  apiJson("enrollment", path, schema, init);
/** 연결 추가·교체 — 자격증명은 이 요청에만 싣고 화면·저장소에 남기지 않는다. 응답에도 없다. */
export const saveConnection = (
  org: string,
  vendorId: string,
  expectedVersion: number,
  settings: Record<string, string>,
  credential: string,
) =>
  enrollment(
    orgPath(org, `/vendors/${encodeURIComponent(vendorId)}/connection`),
    connectionResponse,
    {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, settings, credential }),
    },
  );
export const deleteConnection = (
  org: string,
  vendorId: string,
  version: number,
) =>
  enrollment(
    orgPath(org, `/vendors/${encodeURIComponent(vendorId)}/connection`),
    z.undefined(),
    { method: "DELETE", headers: { "If-Match": `"connection-${version}"` } },
  );
export const verifyConnection = (org: string, vendorId: string) =>
  enrollment(
    orgPath(org, `/vendors/${encodeURIComponent(vendorId)}/connection/verify`),
    connectionResponse,
    { method: "POST" },
  );
/** 지금 동기화 — 다음 주기 실행이 가져간다(작업 `seat_sync`). */
export const requestSync = (
  post: Post,
  org: string,
  vendorId: string,
): Promise<Operation> =>
  post(
    org,
    `/vendors/${encodeURIComponent(vendorId)}/connection/sync`,
    {},
    operationSchema,
  );

const savedSeatSchema = z.object({
  seat: z
    .object({
      seatAssignmentId: z.string(),
      version: z.number(),
      account: z.string(),
      state: seatState,
    })
    .passthrough(),
  warnings: z.array(z.string()),
  provisional: z.boolean(),
});
export type SavedSeat = z.infer<typeof savedSeatSchema>;
/** 수동 배정(커넥터가 없거나 연결 전인 제품만 — 연결이 있으면 409 connector_managed). 해제된 좌석을 다시 배정하면 그 판을 보낸다. */
export const assignSeat = (
  post: Post,
  org: string,
  vendorId: string,
  body: {
    account: string;
    tierId?: string | null;
    note?: string | null;
    expectedVersion?: number;
  },
) =>
  post(
    org,
    `/vendors/${encodeURIComponent(vendorId)}/seats`,
    body,
    savedSeatSchema,
  );
export const releaseSeat = (
  post: Post,
  org: string,
  vendorId: string,
  seatId: string,
  expectedVersion: number,
) =>
  post(
    org,
    `/vendors/${encodeURIComponent(vendorId)}/seats/${encodeURIComponent(seatId)}/release`,
    { expectedVersion },
    savedSeatSchema,
  );
/** 보정 — 구성원 연결·계약 등급·메모. 권위와 무관하게 된다. */
export const correctSeat = (
  org: string,
  vendorId: string,
  seatId: string,
  body: {
    expectedVersion: number;
    tierId?: string | null;
    note?: string | null;
    memberId?: string | null;
    memberLink?: "automatic";
  },
) =>
  enrollment(
    orgPath(
      org,
      `/vendors/${encodeURIComponent(vendorId)}/seats/${encodeURIComponent(seatId)}`,
    ),
    savedSeatSchema,
    { method: "PATCH", body: JSON.stringify(body) },
  );

export const seatImportSchema = z.object({
  mode: z.enum(["preview", "apply"]),
  applied: z.boolean(),
  digest: z.string(),
  summary: z.record(z.string(), z.number()),
  rows: z.array(
    z.object({
      line: z.number(),
      account: z.string(),
      action: z.string().nullable(),
      seatAssignmentId: z.string().nullable(),
      errors: z.array(z.object({ field: z.string(), code: z.string() })),
    }),
  ),
  warnings: z.array(z.string()),
});
export type SeatImport = z.infer<typeof seatImportSchema>;
/** CSV 가져오기 — 미리보기는 쓰지 않고, 적용은 오류가 하나도 없을 때만 한 번에 한다(오류면 422 + 행별 오류). 파일의 행만 바꾼다. */
export const importSeats = (
  post: Post,
  org: string,
  vendorId: string,
  mode: "preview" | "apply",
  csv: string,
) =>
  post(
    org,
    `/vendors/${encodeURIComponent(vendorId)}/seats/import`,
    { mode, csv },
    z.object({ import: seatImportSchema, provisional: z.boolean() }),
  );

export const IMPORT_ACTION_TEXT: Record<string, string> = {
  create: "새 배정",
  reassign: "다시 배정",
  update: "변경",
  release: "해제",
  unchanged: "그대로",
};
export const IMPORT_ERROR_TEXT: Record<string, string> = {
  required: "필수",
  invalid_account: "계정 형식이 틀림",
  duplicate_account: "같은 계정이 두 번",
  not_found: "없는 좌석",
  invalid_status: "상태는 assigned·released",
  seat_not_changeable: "해제 예정·배정 대기는 벤더 제어의 몫",
  invalid_tier: "지금 계약에 없는 유형",
  ambiguous_tier: "유형 이름이 여럿과 맞음",
  not_applicable: "해제 행에 쓸 수 없음",
  invalid_email: "이메일 형식이 틀림",
  member_not_found: "구성원이 없음",
  member_ambiguous: "같은 이메일의 구성원이 여럿",
  column_count: "열 수가 머리글과 다름",
};
export const CHECK_TEXT: Record<string, string> = {
  unverified: "확인 전",
  verified: "확인됨",
  invalid_credentials: "자격증명 거절",
  insufficient_permission: "권한 부족",
  unavailable: "확인하지 못함(일시 장애)",
};
export const SYNC_TEXT: Record<z.infer<typeof syncState>["status"], string> = {
  pending: "아직 성공 없음",
  succeeded: "성공",
  failing: "실패 중",
};
