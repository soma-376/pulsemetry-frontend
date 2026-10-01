import { infiniteQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson, managementKey, ManagementError, orgPath, readOptions } from "./management";
import { organizationKey } from "./query-keys";

/**
 * 알림 규칙·목록·알림(서버 ADR 0051). 규칙 켜기·목록 교체·확인은 enrollment-api, 알림 목록은 dashboard-api 다.
 * 규칙을 켤 수 있는지(가용성·사유)와 미확인 수는 서버가 정한다 — 화면은 세지 않는다.
 */
const version = z.number().int().nonnegative();
export const alertRuleSchema = z.object({
  ruleId: z.string(), version, enabled: z.boolean(), availability: z.enum(["available", "unavailable"]), reason: z.string().nullable(),
  threshold: z.object({ value: z.number(), unit: z.string() }), evaluationWindow: z.string(), comparisonWindow: z.string().nullable(),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;
export const alertListSchema = z.object({ listId: z.enum(["allowed_models", "approved_tools"]), version, entries: z.array(z.string()), updatedAt: z.string().nullable() });
export type AlertList = z.infer<typeof alertListSchema>;
export const alertListsSchema = z.object({ allowedModels: alertListSchema, approvedTools: alertListSchema });

/** 규칙을 켜거나 끈다(`PATCH O/settings/alert-rules/{ruleId}`). 근거가 없는 규칙을 켜면 422 `alert_rule_unavailable`. */
export const saveAlertRule = (org: string, ruleId: string, expectedVersion: number, enabled: boolean) =>
  apiJson("enrollment", orgPath(org, `/settings/alert-rules/${encodeURIComponent(ruleId)}`), alertRuleSchema,
    { method: "PATCH", body: JSON.stringify({ expectedVersion, enabled }) });

/** 목록을 통째로 바꾼다(`PUT O/settings/alert-lists/{listId}`). 응답의 규칙 상태로 토글의 가용성을 바꾼다. */
export const saveAlertList = (org: string, listId: AlertList["listId"], expectedVersion: number, entries: string[]) =>
  apiJson("enrollment", orgPath(org, `/settings/alert-lists/${listId}`), z.object({ list: alertListSchema, alertRules: z.array(alertRuleSchema) }),
    { method: "PUT", body: JSON.stringify({ expectedVersion, entries }) });

/** 줄마다 하나 — 앞뒤 공백을 지우고 빈 줄·중복을 뺀다. 형식 검사는 서버가 한다. */
export const parseEntries = (text: string) => [...new Set(text.split("\n").map((line) => line.trim()).filter(Boolean))];

const alertSchema = z.object({
  alertId: z.string(), version: z.number().int().min(1), ruleId: z.string(), category: z.enum(["security", "cost"]), status: z.enum(["open", "closed"]),
  occurredAt: z.string(), lastSeenAt: z.string(), windowStart: z.string(), windowEnd: z.string(),
  subject: z.string().nullable(), eventCount: z.number().int().nonnegative().nullable(), memberCount: z.number().int().nonnegative().nullable(),
  members: z.array(z.object({ memberId: z.string(), account: z.string().nullable() })),
  summary: z.record(z.string(), z.unknown()),
  acknowledgement: z.object({ acknowledgedAt: z.string(), acknowledgedBy: z.string() }).nullable(),
});
export type Alert = z.infer<typeof alertSchema>;
const evaluationSchema = z.object({
  availability: z.enum(["available", "unavailable"]), reason: z.string().nullable(), asOf: z.string().nullable(),
  rules: z.array(z.object({ ruleId: z.string(), enabled: z.boolean(), evaluatedAt: z.string().nullable(), status: z.enum(["evaluated", "not_evaluated", "failed"]).nullable(),
    reason: z.string().nullable(), windowStart: z.string().nullable(), windowEnd: z.string().nullable() })),
});
export const alertsResponseSchema = z.object({
  meta: z.object({ organizationId: z.string(), snapshotId: z.string(), asOf: z.string() }),
  evaluation: evaluationSchema,
  alerts: z.object({ items: z.array(alertSchema), totalCount: version, nextCursor: z.string().nullable() }),
});
export type AlertsPage = z.infer<typeof alertsResponseSchema>;
export type AlertStatus = "unacknowledged" | "acknowledged" | "all";

/** 알림 목록(`GET O/alerts`) — 첫 페이지의 현재 상태 토큰으로 다음 페이지를 읽는다. */
export const alertsOptions = (org: string, status: AlertStatus) => infiniteQueryOptions({
  queryKey: [...managementKey(org, "alerts"), status] as const,
  queryFn: async ({ pageParam, signal }) => {
    const query = new URLSearchParams({ status, limit: "20" });
    if (pageParam) { query.set("cursor", pageParam.cursor); query.set("snapshotId", pageParam.snapshotId); }
    const page = await apiJson("dashboard", orgPath(org, `/alerts?${query}`), alertsResponseSchema, { signal });
    if (page.meta.organizationId !== org) throw new ManagementError("invalid_response", 422);
    return page;
  },
  initialPageParam: null as { cursor: string; snapshotId: string } | null,
  getNextPageParam: (last) => last.alerts.nextCursor ? { cursor: last.alerts.nextCursor, snapshotId: last.meta.snapshotId } : null,
  enabled: !!org,
  ...readOptions,
});

/** 알림 확인(`POST O/alerts/{alertId}/acknowledge`). 이미 확인한 알림은 같은 기록이 돌아온다. */
export const acknowledgeAlert = (org: string, alertId: string, expectedVersion: number) =>
  apiJson("enrollment", orgPath(org, `/alerts/${encodeURIComponent(alertId)}/acknowledge`),
    z.object({ alertId: z.string(), version: z.number(), acknowledgedAt: z.string(), acknowledgedBy: z.string() }),
    { method: "POST", body: JSON.stringify({ expectedVersion }) });

/** 확인 뒤 다시 읽을 조회 — 알림 목록과 개요(미확인 수). */
export const alertQueryKeys = (org: string) => [managementKey(org, "alerts"), [...organizationKey(org), "overview"]] as const;

export const ALERT_RULE_TEXT: Record<string, { title: string; note: string }> = {
  spend_spike: { title: "비용 급증 알림", note: "직전 완전한 7일 비용이 그 앞 7일보다 크게 늘었을 때" },
  quota_exceeded: { title: "한도 초과 알림", note: "좌석 한도에 걸려 요청이 차단될 때" },
  model_not_allowed: { title: "비허용 모델 호출 알림", note: "허용 목록에 없는 모델이 호출될 때" },
  tool_unapproved: { title: "미승인 도구 연결 알림", note: "승인 목록에 없는 도구가 쓰일 때" },
};

/** 규칙·평가·개요 알림의 서버 사유 코드. 모르는 코드는 코드 그대로 보여 준다. */
const REASONS: Record<string, string> = {
  completeness_not_available: "설치의 수집 구간 보고가 아직 없어 기간이 완전한지 판단할 수 없습니다",
  source_not_available: "한도 초과를 가리키는 검증된 관측이 없어 켤 수 없습니다",
  allowed_models_not_configured: "모델 허용 목록을 먼저 입력하세요",
  approved_tools_not_configured: "승인 도구 목록을 먼저 입력하세요",
  evaluation_not_configured: "켜진 알림 규칙이 없습니다",
  evaluation_pending: "규칙을 켰지만 아직 평가 전입니다",
  period_incomplete: "두 기간 중 완전히 관측되지 않은 날이 있어 평가하지 않았습니다",
  cost_not_available: "비용을 알 수 없는 사용이 있어 평가하지 않았습니다",
  no_previous_spend: "앞 7일 비용이 0이라 증가율이 없습니다",
  period_not_settled: "아직 확정된 날이 없습니다",
  evaluation_error: "평가 중 오류가 났습니다 — 다음 주기에 다시 평가합니다",
};
export const alertReasonText = (reason: string | null | undefined) => reason ? REASONS[reason] ?? reason : "-";

const usdText = (value: unknown) => typeof value === "string" ? `$${Number(value).toFixed(2)}` : "-";

/** 알림 한 줄 요약 — 서버가 준 값만 쓴다. */
export function alertSummary(alert: Alert): string {
  const s = alert.summary;
  if (alert.ruleId === "spend_spike") {
    const ratio = typeof s.increaseRatio === "number" ? `+${Math.round(s.increaseRatio * 100)}%` : "-";
    return `${s.currentStartDate ?? "-"}~${s.currentEndDate ?? "-"} ${usdText(s.currentCostUsd)} · 앞 7일 ${usdText(s.previousCostUsd)} · ${ratio}`;
  }
  const what = alert.ruleId === "model_not_allowed" ? "모델" : "도구";
  return `${what} ${alert.subject ?? "-"} · ${alert.eventCount ?? "-"}건 · 구성원 ${alert.memberCount ?? "-"}명`;
}
