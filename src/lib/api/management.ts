import { organizationKey } from "./query-keys";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { sessionFetch } from "./session";
import { retryAfterMs } from "./overview";

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), fieldErrors: z.array(z.object({ field: z.string(), code: z.string() })).optional() }),
  /** 구조화된 사유(예: CSV 가져오기의 행별 오류) — 서버가 가산으로 싣는다. */
  details: z.unknown().optional() });
const messages: Record<string, string> = {
  vendor_already_registered: "이미 등록된 제품입니다. 기존 제품의 계약을 수정하세요.",
  version_conflict: "다른 곳에서 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도하세요.",
  idempotency_conflict: "같은 요청의 내용이 변경되었습니다. 화면을 새로고침해 주세요.",
  onboarding_incomplete: "수집 정책을 저장하고 벤더를 하나 이상 등록하세요.",
  manifest_not_configured: "조직의 초기 수집 설정이 없습니다. 관리자에게 문의해 주세요.",
  team_name_conflict: "같은 이름의 팀이 있습니다.", invalid_plan: "선택한 제품의 플랜을 다시 확인하세요.",
  invalid_vendor: "등록 가능한 제품을 다시 선택하세요.", invalid_contract_period: "계약 날짜를 확인하세요. 시작일은 오늘부터 가능합니다.",
  forbidden: "관리자 권한이 필요합니다.", unauthenticated: "다시 로그인해 주세요.",
  vendor_not_found: "선택한 제품을 찾을 수 없습니다. 제품 목록을 확인하세요.",
  not_found: "요청한 정보를 찾을 수 없습니다.", unavailable: "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
  catalog_changed: "카탈로그가 갱신되었습니다. 제품과 플랜을 다시 조회해 주세요.",
  role_not_assignable: "지정할 수 없는 역할입니다.", owner_role_immutable: "소유자의 역할은 바꿀 수 없습니다.",
  self_role_change: "자기 역할은 바꿀 수 없습니다.", member_suspended: "정지된 구성원은 변경할 수 없습니다.",
  member_not_active: "아직 합류하지 않은 구성원입니다. 초대 대기 목록에서 초대를 다시 보내세요.",
  invitation_unavailable: "이미 사용했거나 취소된 초대입니다. 목록을 다시 확인하세요.",
  notification_channel_unavailable: "메일 발송이 설정되지 않아 알림을 보낼 수 없습니다. 서버 관리자에게 메일 설정을 요청하세요.",
  installation_unavailable: "이미 새 정책을 적용했거나 알림을 보낼 수 없는 설치가 포함돼 있습니다. 목록을 다시 불러왔습니다.",
  snapshot_expired: "목록이 갱신되었습니다. 처음부터 다시 불러옵니다.",
  // 좌석 원장·회수·벤더 연결(서버 enrollment 명세 §12)
  preview_stale: "확인 창을 연 뒤 좌석이 바뀌었습니다. 다시 확인하세요.", preview_expired: "확인한 지 5분이 지났습니다. 다시 확인하세요.",
  preview_used: "이미 실행한 확인입니다. 작업 상태를 확인하세요.", no_eligible_seats: "회수할 수 있는 좌석이 없습니다.",
  restore_not_available: "되돌릴 수 없는 회수입니다(기한이 지났거나 되돌릴 좌석이 없습니다).",
  not_awaiting_admin_action: "조치 대기 중인 대상이 아닙니다. 작업 상태를 다시 확인하세요.",
  seat_changed: "확인 사이에 좌석이 다른 상태가 되었습니다. 좌석을 다시 확인하세요.",
  connector_managed: "벤더 연결이 있는 제품은 동기화가 좌석을 정합니다. 연결 전에만 직접 기록할 수 있습니다.",
  seat_already_held: "이미 배정된 계정입니다.", seat_not_releasable: "배정 상태인 좌석만 해제할 수 있습니다.",
  // 알림 규칙·목록·확인(서버 ADR 0051)
  alert_rule_unavailable: "이 규칙은 아직 켤 수 없습니다. 아래 사유를 확인하세요.", alert_list_in_use: "켜진 규칙이 쓰는 목록은 비울 수 없습니다. 규칙을 먼저 끄세요.",
  invalid_tier: "지금 계약에 없는 좌석 유형입니다.", invalid_csv: "CSV 파일 형식을 확인하세요.", seat_import_invalid: "오류가 있는 행이 있어 아무것도 적용하지 않았습니다.",
  connector_unavailable: "이 계약 플랜에는 연결할 수 있는 커넥터가 없습니다.", credential_key_unavailable: "서버의 자격증명 암호화 키가 없습니다. 서버 관리자에게 문의하세요.",
};
export class ManagementError extends Error {
  constructor(public code: string, public status: number, public retryAfter = 0, public fields: { field: string; code: string }[] = [], public details: unknown = undefined) {
    const labels: Record<string, string> = { kind: "제품", displayName: "표시 이름", "contract.planId": "플랜", "contract.effectiveFrom": "계약 기간", "contract.effectiveTo": "계약 종료일", "contract.tiers": "좌석 구성", "contract.termNote": "계약 메모", teamName: "팀 이름", teamId: "팀", plannedVendorIds: "사용 예정 제품", role: "역할", memberId: "구성원", assignments: "배정 목록", installationIds: "설치 목록", expectedPolicyVersion: "정책 판", entries: "목록 항목(줄마다 하나, 끝의 * 만 허용, 200자·200개 이하)" };
    const fieldMessage = fields.map(field => labels[field.field]).filter(Boolean).join(", ");
    super((messages[code] ?? "요청을 처리하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.") + (fieldMessage ? ` 확인할 항목: ${fieldMessage}` : ""));
  }
}
export async function apiJson<T>(service: "dashboard" | "enrollment", path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  return (await apiResponse(service, path, schema, init)).data;
}
/** 본문과 함께 응답 헤더(`Location`·`Retry-After`)가 필요한 호출용. 오류 처리는 [apiJson]과 같다. */
export async function apiResponse<T>(service: "dashboard" | "enrollment", path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<{ data: T; headers: Headers }> {
  const response = await sessionFetch(`/api/bff/${service}/api/v1${path}`, { ...init, cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  if (!response.ok) {
    const parsed = errorSchema.safeParse(await response.json().catch(() => null));
    throw new ManagementError(parsed.success ? parsed.data.error.code : "unavailable", response.status, retryAfterMs(response.headers.get("Retry-After")),
      parsed.success ? parsed.data.error.fieldErrors : [], parsed.success ? parsed.data.details : undefined);
  }
  const parsed = schema.safeParse(response.status === 204 ? undefined : await response.json());
  if (!parsed.success) throw new ManagementError("invalid_response", 422);
  return { data: parsed.data, headers: response.headers };
}
export const orgPath = (organizationId: string, path: string) => `/organizations/${encodeURIComponent(organizationId)}${path}`;
export const managementKey = (org: string, name: string) => [...organizationKey(org), name] as const;
export const readOptions = { staleTime: 30_000, refetchOnWindowFocus: false,
  retry: (count: number, error: Error) => count < 2 && (error instanceof TypeError || (error instanceof ManagementError && (error.status === 429 || error.status >= 500))),
  retryDelay: (attempt: number, error: Error) => Math.max(1000 * 2 ** attempt, error instanceof ManagementError ? error.retryAfter : 0),
};
/** 실패한 POST 재시도는 키와 본문을 유지한다. 성공 후 새 동작에만 새 키를 발급한다. */
export function createCommands() {
  const pending = new Map<string, string>();
  return async <T>(org: string, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> => {
    const json = JSON.stringify(body), identity = `${org}:${path}:${json}`;
    const key = pending.get(identity) ?? crypto.randomUUID();
    pending.set(identity, key);
    const result = await apiJson("enrollment", orgPath(org, path), schema, { method: "POST", headers: { "Idempotency-Key": key }, body: json });
    pending.delete(identity);
    return result;
  };
}
export const onboardingSchema = z.object({ organizationId: z.string(), completed: z.boolean(), completedAt: z.string().nullable(),
  policy: z.object({ confirmed: z.boolean(), confirmedAt: z.string().nullable(), version: z.number(), collectRawContent: z.boolean().nullable() }),
  selectedVendorCount: z.number().int().nonnegative(), canComplete: z.boolean(), nextStep: z.enum(["collection", "vendors", "team", "complete"]),
});
export type OnboardingState = z.infer<typeof onboardingSchema>;
export async function fetchOnboarding(org: string, signal?: AbortSignal) {
  const data = await apiJson("enrollment", orgPath(org, "/onboarding"), onboardingSchema, { signal });
  if (data.organizationId !== org) throw new ManagementError("invalid_response", 422);
  return data;
}
export const onboardingOptions = (org: string) => queryOptions({ queryKey: managementKey(org, "onboarding"), queryFn: ({ signal }) => fetchOnboarding(org, signal), ...readOptions });
/** 수집 정책 저장의 응답. 원문 선택을 보내지 않은 저장이면 `collectRawContent`·`confirmedAt`은 지금 값(없으면 null)이다. */
export const policySavedSchema = z.object({ version: z.number(), collectRawContent: z.boolean().nullable(), confirmedAt: z.string().nullable(),
  application: z.literal("future_enrollments"), existingInstallationsUpdated: z.literal(false),
  reclaimIdleDays: z.number().nullable(), aggregateRetentionMonths: z.number().nullable(), settingsVersion: z.number(), settingsUpdatedAt: z.string().nullable(),
  cleanupOperationId: z.string().nullable() });
export const managedVendorSchema = z.object({ vendorId: z.string(), displayName: z.string(), kind: z.string(), source: z.string(), version: z.number(), state: z.string(), contract: z.object({ planId: z.string() }).passthrough().nullable() });
export const vendorResponseSchema = z.object({ vendor: managedVendorSchema });
export type ManagedVendor = z.infer<typeof managedVendorSchema>;
export const teamSchema = z.object({ teamId: z.string(), teamName: z.string(), version: z.number() });
export type ServerTeam = z.infer<typeof teamSchema>;
const metaSchema = z.object({ organizationId: z.string(), snapshotId: z.string() });
async function directory<T>(org: string, path: string, field: "vendors" | "teams", item: z.ZodType<T>, signal?: AbortSignal) {
  const schema = z.object({ meta: metaSchema, [field]: z.object({ items: z.array(item), nextCursor: z.string().nullable() }) });
  const items: T[] = [], cursors = new Set<string>();
  let cursor: string | null = null, snapshotId: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    if (snapshotId) params.set("snapshotId", snapshotId);
    const raw = await apiJson("dashboard", orgPath(org, `${path}?${params}`), schema, { signal });
    const meta = raw.meta as z.infer<typeof metaSchema>;
    const page = raw[field] as { items: T[]; nextCursor: string | null };
    if (meta.organizationId !== org || (snapshotId && meta.snapshotId !== snapshotId)) throw new ManagementError("invalid_response", 422);
    snapshotId = meta.snapshotId;
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new ManagementError("invalid_response", 422);
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return items;
}
export const vendorsOptions = (org: string) => queryOptions({ queryKey: managementKey(org, "vendors"), queryFn: ({ signal }) => directory(org, "/vendors", "vendors", managedVendorSchema, signal), ...readOptions });
export const teamsOptions = (org: string) => queryOptions({ queryKey: managementKey(org, "teams"), queryFn: ({ signal }) => directory(org, "/teams", "teams", teamSchema, signal), ...readOptions });
