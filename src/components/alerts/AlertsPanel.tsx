"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  acknowledgeAlert,
  ALERT_RULE_TEXT,
  alertQueryKeys,
  alertReasonText,
  alertsOptions,
  alertSummary,
  RULE_CATEGORY,
  type Alert,
  type AlertCategory,
  type AlertStatus,
} from "@/lib/api/alerts";
import { ManagementError } from "@/lib/api/management";
import { int } from "@/lib/format";

export const alertTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "-";
const STATUS_OPTIONS: { value: AlertStatus; label: string }[] = [
  { value: "unacknowledged", label: "미확인" },
  { value: "acknowledged", label: "확인함" },
  { value: "all", label: "전체" },
];
const CATEGORY_TEXT: Record<AlertCategory, string> = {
  security: "보안",
  cost: "비용",
};

/**
 * 알림 목록·상세·확인(서버 ADR 0051 §6). 개요의 알림 창과 운영 · 보안 화면이 같이 쓴다. 목록·건수는 서버 값이고, 확인하면 목록과 개요의 미확인 수를 다시 읽는다.
 * 규칙마다 마지막 평가를 함께 보여 준다 — "평가하지 않음"은 0건이 아니다. 확인을 되돌리는 명령은 없다.
 */
export function AlertsPanel({
  organizationId,
  enabled,
  category,
  status,
  onStatusChange,
  onAcknowledged,
}: {
  organizationId: string;
  enabled: boolean;
  /** 주면 그 범주의 알림·규칙만 */
  category?: AlertCategory;
  status: AlertStatus;
  onStatusChange: (status: AlertStatus) => void;
  onAcknowledged: (message: string) => void;
}) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    ...alertsOptions(organizationId, status, category),
    enabled: enabled && !!organizationId,
  });
  const refresh = () =>
    Promise.all(
      alertQueryKeys(organizationId).map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
  const acknowledge = useMutation({
    mutationFn: (alert: Alert) =>
      acknowledgeAlert(organizationId, alert.alertId, alert.version),
    onSuccess: () => {
      onAcknowledged("알림을 확인했습니다.");
      return refresh();
    },
    // 그 사이 묶음이 늘었다면(409) 최신 목록을 다시 읽는다.
    onError: (error) => {
      if (error instanceof ManagementError && error.code === "version_conflict")
        void refresh();
    },
  });
  const pages = query.data?.pages ?? [];
  const first = pages[0];
  const items = pages.flatMap((page) => page.alerts.items);
  const rules =
    first?.evaluation.rules.filter(
      (rule) =>
        rule.enabled && (!category || RULE_CATEGORY[rule.ruleId] === category),
    ) ?? [];
  const label = category ? `${CATEGORY_TEXT[category]} ` : "";
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="알림 상태"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(value) => {
          onStatusChange(value);
          acknowledge.reset();
        }}
      />
      {first && (
        <section
          aria-label="규칙별 평가"
          className="rounded-lg bg-sub p-3 text-xs"
        >
          {first.evaluation.availability === "unavailable" && (
            <p className="mb-2 text-orange-ink">
              {alertReasonText(first.evaluation.reason)}
            </p>
          )}
          {first.evaluation.availability === "available" && !rules.length && (
            <p className="text-text3">
              켜진 {label}규칙이 없습니다 — 설정의 알림 규칙에서 켤 수 있습니다.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {rules.map((rule) => (
              <li
                key={rule.ruleId}
                className="flex flex-wrap justify-between gap-2"
              >
                <span>
                  {ALERT_RULE_TEXT[rule.ruleId]?.title ?? rule.ruleId}
                </span>
                <span
                  className={
                    rule.status === "evaluated"
                      ? "text-text3"
                      : "text-orange-ink"
                  }
                >
                  {rule.status === null
                    ? "평가 전"
                    : rule.status === "evaluated"
                      ? `평가함 · ${alertTime(rule.evaluatedAt)}`
                      : `평가하지 않음 · ${alertReasonText(rule.reason)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!first && query.isPending && (
        <LoadingState variant="inline" message="알림을 불러오는 중입니다…" />
      )}
      {query.error && (
        <ErrorState
          variant="inline"
          message={query.error.message}
          retrying={query.isFetching}
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        />
      )}
      {acknowledge.error && (
        <ErrorState variant="inline" message={acknowledge.error.message} />
      )}
      {first && !items.length && (
        <EmptyState
          message={
            status === "unacknowledged"
              ? `미확인 ${label}알림이 없습니다`
              : `${label}알림이 없습니다`
          }
          description="켜진 규칙의 평가 결과만 알림이 됩니다."
        />
      )}
      {items.length > 0 && (
        <ul aria-label="알림 목록" className="flex flex-col gap-2">
          {items.map((alert) => {
            const title = ALERT_RULE_TEXT[alert.ruleId]?.title ?? alert.ruleId;
            return (
              <li
                key={alert.alertId}
                data-alert-id={alert.alertId}
                className="rounded-lg border border-border p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{title}</span>
                  <span className="flex gap-1 text-[11px]">
                    <span className="rounded bg-gray-tint px-1.5">
                      {CATEGORY_TEXT[alert.category]}
                    </span>
                    <span className="rounded bg-gray-tint px-1.5">
                      {alert.status === "open" ? "진행 중" : "끝남"}
                    </span>
                  </span>
                </div>
                <p className="mt-1.5 text-text2">{alertSummary(alert)}</p>
                <p className="mt-1 text-[11px] text-text3">
                  발생 {alertTime(alert.occurredAt)}
                  {alert.lastSeenAt !== alert.occurredAt
                    ? ` · 마지막 ${alertTime(alert.lastSeenAt)}`
                    : ""}
                  {alert.members.length > 0
                    ? ` · ${alert.members.map((member) => member.account ?? "구성원 정보 없음").join(", ")}`
                    : ""}
                </p>
                <details className="mt-1.5 text-[11px] text-text2">
                  <summary className="cursor-pointer text-text3">상세</summary>
                  <dl
                    aria-label={`${title} 상세`}
                    className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5"
                  >
                    <dt className="text-text3">규칙</dt>
                    <dd>{alert.ruleId}</dd>
                    <dt className="text-text3">대상</dt>
                    <dd>{alert.subject ?? "-"}</dd>
                    <dt className="text-text3">묶음 구간</dt>
                    <dd>
                      {alertTime(alert.windowStart)} ~{" "}
                      {alertTime(alert.windowEnd)}
                    </dd>
                    <dt className="text-text3">위반 수</dt>
                    <dd>
                      {alert.eventCount === null
                        ? "-"
                        : `${int(alert.eventCount)}건`}
                    </dd>
                    <dt className="text-text3">구성원</dt>
                    <dd>
                      {alert.memberCount === null
                        ? "-"
                        : `${int(alert.memberCount)}명`}
                      {alert.members.length
                        ? ` · ${alert.members.map((member) => member.account ?? member.memberId).join(", ")}`
                        : ""}
                    </dd>
                    <dt className="text-text3">확인</dt>
                    <dd>
                      {alert.acknowledgement
                        ? alertTime(alert.acknowledgement.acknowledgedAt)
                        : "미확인"}
                    </dd>
                  </dl>
                </details>
                <div className="mt-2 flex items-center justify-end gap-2">
                  {alert.acknowledgement ? (
                    <span className="text-[11px] text-text3">
                      확인함 · {alertTime(alert.acknowledgement.acknowledgedAt)}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      aria-label={`${title} ${alertTime(alert.occurredAt)} 확인`}
                      loading={
                        acknowledge.isPending &&
                        acknowledge.variables?.alertId === alert.alertId
                      }
                      loadingLabel="확인 중…"
                      disabled={acknowledge.isPending}
                      onClick={() => acknowledge.mutate(alert)}
                    >
                      확인
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {first && (
        <p className="text-[11px] text-text3">
          {int(first.alerts.totalCount)}건
        </p>
      )}
      {query.hasNextPage && (
        <Button
          size="sm"
          loading={query.isFetchingNextPage}
          loadingLabel="불러오는 중…"
          onClick={() => void query.fetchNextPage()}
        >
          더 보기
        </Button>
      )}
    </div>
  );
}
