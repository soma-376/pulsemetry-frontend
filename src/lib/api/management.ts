import { organizationKey } from "./query-keys";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { sessionFetch } from "./session";
import { retryAfterMs } from "./overview";

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), fieldErrors: z.array(z.object({ field: z.string(), code: z.string() })).optional() }) });
const messages: Record<string, string> = {
  vendor_already_registered: "이미 등록된 제품입니다. 기존 제품의 계약을 수정하세요.",
  version_conflict: "다른 곳에서 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도하세요.",
  idempotency_conflict: "같은 요청의 내용이 변경되었습니다. 화면을 새로고침해 주세요.",
  onboarding_incomplete: "수집 정책을 저장하고 벤더를 하나 이상 등록하세요.",
  manifest_not_configured: "조직의 초기 수집 설정이 없습니다. 관리자에게 문의해 주세요.",
  team_name_conflict: "같은 이름의 팀이 있습니다.", invalid_plan: "선택한 제품의 플랜을 다시 확인하세요.",
  invalid_vendor: "등록 가능한 제품을 다시 선택하세요.", invalid_contract_period: "계약 날짜를 확인하세요. 시작일은 오늘부터 가능합니다.",
  forbidden: "관리자 권한이 필요합니다.", unauthenticated: "다시 로그인해 주세요.",
  not_found: "요청한 정보를 찾을 수 없습니다.", unavailable: "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
  catalog_changed: "카탈로그가 갱신되었습니다. 제품과 플랜을 다시 조회해 주세요.",
};
export class ManagementError extends Error {
  constructor(public code: string, public status: number, public retryAfter = 0, public fields: { field: string; code: string }[] = []) {
    const labels: Record<string, string> = { kind: "제품", displayName: "표시 이름", "contract.planId": "플랜", "contract.effectiveFrom": "계약 기간", "contract.effectiveTo": "계약 종료일", "contract.tiers": "좌석 구성", "contract.termNote": "계약 메모", teamName: "팀 이름" };
    const fieldMessage = fields.map(field => labels[field.field]).filter(Boolean).join(", ");
    super((messages[code] ?? "요청을 처리하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.") + (fieldMessage ? ` 확인할 항목: ${fieldMessage}` : ""));
  }
}
export async function apiJson<T>(service: "dashboard" | "enrollment", path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const base = service === "dashboard" ? process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? "http://localhost:8081" : process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ?? "http://localhost:8080";
  const response = await sessionFetch(`${base.replace(/\/$/, "")}/api/v1${path}`, { ...init, credentials: "omit", cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  if (!response.ok) {
    const parsed = errorSchema.safeParse(await response.json().catch(() => null));
    throw new ManagementError(parsed.success ? parsed.data.error.code : "unavailable", response.status, retryAfterMs(response.headers.get("Retry-After")), parsed.success ? parsed.data.error.fieldErrors : []);
  }
  const parsed = schema.safeParse(response.status === 204 ? undefined : await response.json());
  if (!parsed.success) throw new ManagementError("invalid_response", 422);
  return parsed.data;
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
export const policySavedSchema = z.object({ version: z.number(), collectRawContent: z.boolean(), confirmedAt: z.string(), application: z.literal("future_enrollments"), existingInstallationsUpdated: z.literal(false) });
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
