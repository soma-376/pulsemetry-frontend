import { organizationKey } from "./query-keys";
import { AuthError, sessionFetch } from "./session";
import { retryAfterMs } from "./retry-after";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

export const count = z.number().int().nonnegative().nullable();
export const money = z.string().regex(/^\d+(?:\.\d+)?$/).refine((value) => Number.isFinite(Number(value))).nullable();
export const reason = z.string().nullable();
export const availability = z.enum(["available", "partial", "unavailable"]);
export const coverage = z.object({ status: z.enum(["complete", "partial", "none"]), observedDays: z.number().int().nonnegative() });
const teamPeriod = z.object({ activeUsers: count, equivalentCostUsd: money });
export const usage = teamPeriod.extend({ sessionCount: count, tokens: z.object({ inputUncached: count, output: count, cacheRead: count, cacheWrite: count, total: count }) });
// 비교 기간과 그 관측은 서버가 비교를 켰을 때만 싣는다(비교 없음이면 null).
export const comparison = z.object({ mode: z.enum(["none", "prev_week", "prev_period"]), status: z.enum(["available", "unavailable", "disabled"]), reason,
  startDate: z.iso.date().nullable().optional(), endDate: z.iso.date().nullable().optional(), coverage: coverage.nullable().optional() });
/** 카탈로그 제품별 사용. `kind`가 null이면 어느 등록 제품에도 매핑되지 않은 관측이다(이름도 null). */
export const productRef = z.object({ kind: z.string().nullable(), displayName: z.string().nullable() });
export const productUsage = productRef.extend({ activeUsers: count, sessionCount: count, totalTokens: count, equivalentCostUsd: money });
const seatPeriod = z.object({ contractedSeats: count, activeSeats: count, monthlyFeeUsd: money, allocatedFeeUsd: money, equivalentCostUsd: money, efficiency: z.number().nonnegative().nullable() });

/** 화면에서 소비하는 필드를 검증한다. 모르는 값과 실제 0은 구분한다. */
export const overviewSchema = z.object({
  meta: z.object({ organizationId: z.string(), generatedAt: z.iso.datetime({ offset: true }), dataThrough: z.iso.datetime({ offset: true }).nullable(), currency: z.literal("USD"), startDate: z.iso.date(), endDate: z.iso.date(), timeZone: z.literal("Asia/Seoul"), dayCount: z.number().int().min(1).max(366), dataState: z.enum(["ready", "partial", "no_data", "never_observed"]), currentCoverage: coverage }),
  comparison,
  ingest: z.object({ status: z.enum(["healthy", "delayed", "down", "empty", "unknown"]), reason, asOf: z.iso.datetime({ offset: true }), lastReceivedAt: z.iso.datetime({ offset: true }).nullable(), windowMinutes: z.number().positive(), activeInstallations: count, observedMembers: count, eligibleMembers: count, coverageRatio: z.number().min(0).max(1).nullable() }),
  usage: z.object({ current: usage.nullable(), previous: usage.nullable() }),
  seats: z.object({ availability, reason, allocationMethod: z.enum(["contract_proration", "estimated_30_day"]).nullable(), current: seatPeriod.nullable(), previous: seatPeriod.nullable(), reclaimEstimate: z.object({ idleSeats: count, monthlySavingsUsd: money, efficiencyAfterReclaim: z.number().nonnegative().nullable() }).nullable(),
    /** 범위 제품의 회수 후보 수(서버 가산 — ADR 0048). 판정할 수 없으면 null. */
    reclaimCandidates: count.optional() }),
  // 지금의 미확인 알림(서버 ADR 0051) — 조회 기간과 무관하다. asOf 는 마지막 평가 시각(평가 전이면 응답 시각).
  alerts: z.object({ availability, reason, asOf: z.string().optional(), unacknowledgedTotal: count, security: count, cost: count }),
  trend: z.object({ bucket: z.literal("day"), points: z.array(z.object({ date: z.iso.date(), observation: z.enum(["complete", "partial", "unobserved"]), equivalentCostUsd: money, allocatedSeatCostUsd: money, totalTokens: count })) }),
  modelMix: z.object({ availability, reason, models: z.array(z.object({ modelId: z.string(), displayName: z.string(), equivalentCostUsd: money, totalTokens: count, effectiveCostPerMillionTokensUsd: money })) }),
  teamUsage: z.object({ availability, reason, attributionBasis: z.literal("event_time"), totalTeamCount: z.number().int().nonnegative(), topTeams: z.array(z.object({ teamId: z.string(), teamName: z.string(), current: teamPeriod, previous: teamPeriod.nullable(), topModel: z.object({ modelId: z.string(), displayName: z.string(), share: z.number().min(0).max(1) }).nullable(), products: z.array(productRef) })), otherTeams: z.object({ count: z.number().int().nonnegative(), currentEquivalentCostUsd: money, previousEquivalentCostUsd: money }), unassigned: z.object({ current: teamPeriod, previous: teamPeriod.nullable(), products: z.array(productRef) }) }),
  // 선택 기간의 카탈로그 제품별 관측(가산 필드). 제품의 관측 인원은 좌석 수가 아니다.
  productUsage: z.object({ availability, reason, products: z.array(productUsage) }),
});

export type Overview = z.infer<typeof overviewSchema>;
export type OverviewParams = { organizationId: string; startDate: string; endDate: string; timeZone: "Asia/Seoul"; compare: "none" | "prev_week" | "prev_period" };

export class DashboardError extends Error {
  constructor(message: string, public status = 0, public retryAfterMs = 0) { super(message); }
}

export { retryAfterMs };

export async function fetchOverview(params: OverviewParams, signal?: AbortSignal): Promise<Overview> {
  const { organizationId, ...filters } = params;
  const response = await sessionFetch(`/api/bff/dashboard/api/v1/organizations/${encodeURIComponent(organizationId)}/analytics/overview?${new URLSearchParams(filters)}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) {
    const messages: Record<number, string> = { 400: "조회 기간과 비교 조건을 확인해 주세요. 최대 366일까지 조회할 수 있습니다.", 401: "로그인이 필요합니다. 로그인 화면에서 회사 이메일을 입력해 주세요.", 403: "이 조직의 개요를 조회할 권한이 없습니다.", 404: "조회할 조직 또는 개요 API를 찾을 수 없습니다.", 429: "요청이 많습니다. 잠시 후 다시 시도해 주세요." };
    throw new DashboardError(messages[response.status] ?? "개요 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", response.status, retryAfterMs(response.headers.get("Retry-After")));
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new DashboardError("서버 응답 형식이 올바르지 않습니다.", 422); }
  const parsed = overviewSchema.safeParse(body);
  if (!parsed.success) throw new DashboardError("서버 응답이 개요 데이터 계약과 일치하지 않습니다.", 422);
  const data = parsed.data;
  if (data.meta.organizationId !== organizationId || data.meta.startDate !== params.startDate || data.meta.endDate !== params.endDate || data.meta.timeZone !== params.timeZone || data.comparison.mode !== params.compare) {
    throw new DashboardError("서버 응답의 조직 또는 조회 조건이 요청과 다릅니다.", 422);
  }
  const start = Date.parse(params.startDate);
  const days = (Date.parse(params.endDate) - start) / 86_400_000 + 1;
  if (data.meta.dayCount !== days || data.trend.points.length !== days || data.trend.points.some((point, index) => Date.parse(point.date) !== start + index * 86_400_000)) {
    throw new DashboardError("서버 응답의 일별 데이터에 누락 또는 중복이 있습니다.", 422);
  }
  return data;
}

export function shouldRetryOverview(failures: number, error: Error) {
  // 인증 실패(제한 429 포함)는 세션 갱신이 이미 기다렸다가 한 번 다시 시도한 결과다. 조회 재시도로 인증 요청을 늘리지 않는다.
  if (failures >= 2 || error.name === "AbortError" || error instanceof AuthError) return false;
  return !(error instanceof DashboardError) || ((error.status >= 500 || error.status === 429) && error.retryAfterMs <= 60_000);
}

export function overviewQueryOptions(params: OverviewParams) {
  return queryOptions({
    queryKey: [...organizationKey(params.organizationId), "overview", params] as const,
    queryFn: ({ signal }) => fetchOverview(params, signal),
    enabled: Boolean(params.organizationId && params.startDate && params.endDate),
    staleTime: 30_000,
    retry: shouldRetryOverview,
    retryDelay: (attempt, error) => Math.max(1000 * 2 ** attempt, error instanceof DashboardError ? error.retryAfterMs : 0),
    refetchOnWindowFocus: false,
  });
}
