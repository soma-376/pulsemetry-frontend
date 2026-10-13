"use client";

import type { ReactNode } from "react";
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
  alertsOptions,
  alertSummary,
  alertReasonText,
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
 * 확인을 되돌리는 명령은 없다.
 */
export function AlertsPanel({
  organizationId,
  enabled,
  category,
  status,
  onStatusChange,
  onAcknowledged,
  showCount = true,
  refreshInHeader = false,
  hideEmptyState = false,
  children,
}: {
  organizationId: string;
  enabled: boolean;
  /** 주면 그 범주의 알림·규칙만 */
  category?: AlertCategory;
  status: AlertStatus;
  onStatusChange: (status: AlertStatus) => void;
  onAcknowledged: (message: string) => void;
  showCount?: boolean;
  refreshInHeader?: boolean;
  hideEmptyState?: boolean;
  children?: ReactNode;
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
  const denied =
    query.error instanceof ManagementError &&
    [401, 403, 404].includes(query.error.status);
  const pages = denied ? [] : (query.data?.pages ?? []);
  const first = pages[0];
  const items = pages.flatMap((page) => page.alerts.items);
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

      {children}

      {!first && query.isPending && (
        <LoadingState variant="inline" message="알림을 불러오는 중입니다…" />
      )}
      {query.error && (!first || !refreshInHeader) && (
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
      {first &&
        !items.length &&
        (!hideEmptyState ||
          (first.evaluation.status === "unavailable" &&
            status === "unacknowledged")) && (
          <EmptyState
            message={
              first.evaluation.status === "unavailable" &&
              status === "unacknowledged"
                ? "알림 평가 결과를 확인할 수 없습니다"
                : status === "unacknowledged"
                  ? `미확인 ${label}알림이 없습니다`
                  : `${label}알림이 없습니다`
            }
            description={
              first.evaluation.reasons.length > 0
                ? first.evaluation.reasons.map(alertReasonText).join(" · ")
                : undefined
            }
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
                <p className="mt-1.5 break-words text-text2 [overflow-wrap:anywhere]">
                  {alertSummary(alert)}
                </p>
                <p className="mt-1 break-words text-[11px] text-text3 [overflow-wrap:anywhere]">
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
                    className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 break-words [overflow-wrap:anywhere]"
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
      {showCount && first && (
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
