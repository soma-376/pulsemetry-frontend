import { organizationKey } from "./query-keys";
import { AuthError, sessionFetch } from "./session";
import { retryAfterMs } from "./retry-after";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

export const count = z.number().int().nonnegative().nullable();
export const money = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((value) => Number.isFinite(Number(value)))
  .nullable();
export const reason = z.string().nullable();
export const availability = z.enum(["available", "partial", "unavailable"]);
export const coverage = z.object({
  status: z.enum(["complete", "partial", "none"]),
  observedDays: z.number().int().nonnegative(),
});
// 비교 기간과 그 관측은 서버가 비교를 켰을 때만 싣는다(비교 없음이면 null).
export const comparison = z.object({
  mode: z.enum(["none", "prev_week", "prev_period"]),
  status: z.enum(["available", "unavailable", "disabled"]),
  reason,
  startDate: z.iso.date().nullable().optional(),
  endDate: z.iso.date().nullable().optional(),
  coverage: coverage.nullable().optional(),
});
/** 카탈로그 제품별 사용. `kind`가 null이면 어느 등록 제품에도 매핑되지 않은 관측이다(이름도 null). */
export const productRef = z.object({
  kind: z.string().nullable(),
  displayName: z.string().nullable(),
});
export const productUsage = productRef.extend({
  activeUsers: count,
  sessionCount: count,
  totalTokens: count,
  equivalentCostUsd: money,
});
/** 값과 비교의 상태는 서버가 판정한다. 0은 유효한 값이고 null은 산출 불가다. */
const signedMoney = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/)
  .refine((v) => Number.isFinite(Number(v)))
  .nullable();
export const valueSchema = <T extends z.ZodType>(schema: T) =>
  z
    .object({
      value: schema,
      status: z.enum(["complete", "partial", "unavailable"]),
      reasons: z.array(z.string()),
    })
    .superRefine((v, ctx) => {
      if (
        ("value" in v && v.value === null) !== (v.status === "unavailable") ||
        (v.status === "complete" && v.reasons.length > 0) ||
        (v.status !== "complete" && !v.reasons.length)
      )
        ctx.addIssue({
          code: "custom",
          message: "값과 상태/사유가 일치하지 않습니다",
        });
    });
export const metricSchema = <T extends z.ZodType, D extends z.ZodType>(
  schema: T,
  delta: D,
) =>
  valueSchema(schema).safeExtend({
    comparison: z
      .object({
        status: z.enum(["available", "unavailable", "disabled"]),
        reasons: z.array(z.string()),
        previousValue: schema,
        absoluteChange: delta,
        percentChange: z.number().nullable(),
        change: z.enum(["increase", "decrease", "unchanged", "new"]).nullable(),
      })
      .superRefine((v, ctx) => {
        if (
          v.status === "available"
            ? ("previousValue" in v && v.previousValue === null) ||
              ("absoluteChange" in v && v.absoluteChange === null) ||
              v.change === null ||
              v.reasons.length > 0
            : ("previousValue" in v && v.previousValue !== null) ||
              ("absoluteChange" in v && v.absoluteChange !== null) ||
              v.percentChange !== null ||
              v.change !== null ||
              (v.status === "unavailable" && !v.reasons.length)
        )
          ctx.addIssue({
            code: "custom",
            message: "비교 상태와 값이 일치하지 않습니다",
          });
      }),
  });
const countMetric = metricSchema(count, z.number().int().nullable());
const moneyMetric = metricSchema(money, signedMoney);
const teamValues = {
  products: z.array(productRef),
  activeUsers: valueSchema(count),
  equivalentCostUsd: moneyMetric,
};
export const overviewSchema = z
  .object({
    meta: z.object({
      organizationId: z.string(),
      generatedAt: z.iso.datetime({ offset: true }),
      dataThrough: z.iso.datetime({ offset: true }).nullable(),
      currency: z.literal("USD"),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      timeZone: z.literal("Asia/Seoul"),
      dayCount: z.number().int().min(1).max(366),
      dataState: z.enum(["ready", "partial", "no_data", "never_observed"]),
      currentCoverage: coverage,
    }),
    comparison: z.object({
      mode: z.enum(["none", "prev_week", "prev_period"]),
      startDate: z.iso.date().nullable(),
      endDate: z.iso.date().nullable(),
      coverage: coverage.nullable(),
    }),
    summary: z
      .object({
        activeUsers: countMetric,
        equivalentCostUsd: moneyMetric,
        knownEquivalentCostUsd: valueSchema(money).optional(),
        pricedUsageRows: z.number().int().nonnegative().optional(),
        unpricedUsageRows: z.number().int().nonnegative().optional(),
        sessionCount: countMetric,
        equivalentCostPerUserUsd: moneyMetric,
        totalTokens: countMetric,
        sessionsPerUser: valueSchema(z.number().nonnegative().nullable()),
        equivalentCostPerSessionUsd: valueSchema(money),
      })
      .nullable(),
    trend: z
      .object({
        bucket: z.literal("day"),
        points: z.array(
          z.object({
            date: z.iso.date(),
            observation: z.enum(["complete", "partial", "unobserved"]),
            equivalentCostUsd: valueSchema(money),
            knownEquivalentCostUsd: valueSchema(money).optional(),
            pricedUsageRows: z.number().int().nonnegative().optional(),
            unpricedUsageRows: z.number().int().nonnegative().optional(),
            totalTokens: valueSchema(count),
          }),
        ),
      })
      .nullable(),
    modelMix: z
      .object({
        models: z.array(
          z.object({
            modelId: z.string(),
            displayName: z.string(),
            equivalentCostUsd: valueSchema(money),
            totalTokens: valueSchema(count),
            effectiveCostPerMillionTokensUsd: valueSchema(money),
            costShare: valueSchema(z.number().min(0).max(1).nullable()),
          }),
        ),
      })
      .nullable(),
    teamUsage: z
      .object({
        attributionBasis: z.literal("event_time"),
        totalTeamCount: z.number().int().nonnegative(),
        topTeams: z.array(
          z.object({ teamId: z.string(), teamName: z.string(), ...teamValues }),
        ),
        unassigned: z.object(teamValues).nullable(),
      })
      .nullable(),
    errors: z.array(
      z.object({
        section: z.enum(["summary", "trend", "modelMix", "teamUsage"]),
        code: z.string(),
        retryable: z.boolean(),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    const empty =
      v.meta.dataState === "no_data" || v.meta.dataState === "never_observed";
    const failed = v.errors.map((e) => e.section);
    if (new Set(failed).size !== failed.length || (empty && failed.length))
      ctx.addIssue({
        code: "custom",
        message: "중복되거나 빈 기간의 오류입니다",
      });
    for (const section of [
      "summary",
      "trend",
      "modelMix",
      "teamUsage",
    ] as const) {
      if (
        empty
          ? v[section] !== null
          : (v[section] === null) !== failed.includes(section)
      )
        ctx.addIssue({
          code: "custom",
          message: "영역과 오류 상태가 일치하지 않습니다",
        });
    }
  });
export type OverviewValue<T> = {
  value: T | null;
  status: "complete" | "partial" | "unavailable";
  reasons: string[];
};
export type OverviewMetric<T> = OverviewValue<T> & {
  comparison: {
    status: "available" | "unavailable" | "disabled";
    reasons: string[];
    previousValue: T | null;
    absoluteChange: T | null;
    percentChange: number | null;
    change: "increase" | "decrease" | "unchanged" | "new" | null;
  };
};

export type Overview = z.infer<typeof overviewSchema>;
export type OverviewParams = {
  organizationId: string;
  startDate: string;
  endDate: string;
  timeZone: "Asia/Seoul";
  compare: "none" | "prev_week" | "prev_period";
};

export class DashboardError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}

export { retryAfterMs };

export async function fetchOverview(
  params: OverviewParams,
  signal?: AbortSignal,
): Promise<Overview> {
  const { organizationId, ...filters } = params;
  const response = await sessionFetch(
    `/api/bff/dashboard/api/v1/organizations/${encodeURIComponent(organizationId)}/analytics/overview?${new URLSearchParams(filters)}`,
    { signal, cache: "no-store", headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: "조회 기간과 비교 조건을 확인해 주세요. 최대 366일까지 조회할 수 있습니다.",
      401: "로그인이 필요합니다. 로그인 화면에서 회사 이메일을 입력해 주세요.",
      403: "이 조직의 개요를 조회할 권한이 없습니다.",
      404: "조회할 조직 또는 개요 API를 찾을 수 없습니다.",
      429: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    };
    throw new DashboardError(
      messages[response.status] ??
        "개요 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      response.status,
      retryAfterMs(response.headers.get("Retry-After")),
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DashboardError("서버 응답 형식이 올바르지 않습니다.", 422);
  }
  const parsed = overviewSchema.safeParse(body);
  if (!parsed.success)
    throw new DashboardError(
      "서버 응답이 개요 데이터 계약과 일치하지 않습니다.",
      422,
    );
  const data = parsed.data;
  if (
    data.meta.organizationId !== organizationId ||
    data.meta.startDate !== params.startDate ||
    data.meta.endDate !== params.endDate ||
    data.meta.timeZone !== params.timeZone ||
    data.comparison.mode !== params.compare
  ) {
    throw new DashboardError(
      "서버 응답의 조직 또는 조회 조건이 요청과 다릅니다.",
      422,
    );
  }
  const start = Date.parse(params.startDate);
  const days = (Date.parse(params.endDate) - start) / 86_400_000 + 1;
  if (
    data.meta.dayCount !== days ||
    (data.trend !== null &&
      (data.trend.points.length !== days ||
        data.trend.points.some(
          (point, index) =>
            Date.parse(point.date) !== start + index * 86_400_000,
        )))
  ) {
    throw new DashboardError(
      "서버 응답의 일별 데이터에 누락 또는 중복이 있습니다.",
      422,
    );
  }
  return data;
}

export function shouldRetryOverview(failures: number, error: Error) {
  // 인증 실패(제한 429 포함)는 세션 갱신이 이미 기다렸다가 한 번 다시 시도한 결과다. 조회 재시도로 인증 요청을 늘리지 않는다.
  if (
    failures >= 2 ||
    error.name === "AbortError" ||
    error instanceof AuthError
  )
    return false;
  return (
    !(error instanceof DashboardError) ||
    ((error.status >= 500 || error.status === 429) &&
      error.retryAfterMs <= 60_000)
  );
}

export function overviewQueryOptions(params: OverviewParams) {
  return queryOptions({
    queryKey: [
      ...organizationKey(params.organizationId),
      "overview",
      params,
    ] as const,
    queryFn: ({ signal }) => fetchOverview(params, signal),
    enabled: Boolean(
      params.organizationId && params.startDate && params.endDate,
    ),
    staleTime: 30_000,
    retry: shouldRetryOverview,
    retryDelay: (attempt, error) =>
      Math.max(
        1000 * 2 ** attempt,
        error instanceof DashboardError ? error.retryAfterMs : 0,
      ),
    refetchOnWindowFocus: false,
  });
}
