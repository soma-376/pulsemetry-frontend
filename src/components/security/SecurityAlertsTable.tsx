"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { alertTime } from "@/components/alerts/AlertsPanel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  acknowledgeAlert,
  ALERT_RULE_TEXT,
  alertQueryKeys,
  alertReasonText,
  alertsOptions,
  type Alert,
  type AlertStatus,
} from "@/lib/api/alerts";
import { ManagementError } from "@/lib/api/management";
import { int } from "@/lib/format";

const STATUS_OPTIONS: { value: AlertStatus; label: string }[] = [
  { value: "unacknowledged", label: "미확인" },
  { value: "acknowledged", label: "확인함" },
  { value: "all", label: "전체" },
];
/** 행의 대상 종류. 폐기한 모델·도구 규칙도 이력으로 남아 있어 함께 읽는다. */
const KIND_TEXT: Record<string, string> = {
  product_not_registered: "미등록 제품",
  model_not_allowed: "비허용 모델",
  tool_unapproved: "미승인 도구",
};
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_128px] gap-3 @3xl:grid-cols-[minmax(0,1.6fr)_84px_84px_112px_128px]";

const target = (alert: Alert) =>
  alert.evidence?.kind === "usage"
    ? alert.evidence.targetName
    : (alert.subject ?? "-");
const count = (value: number | null, unit: string) =>
  value === null ? "-" : `${int(value)}${unit}`;
/** 페이지 기준 시각(meta.asOf)과의 날짜 차이. 브라우저 시계에 기대지 않는다. */
function ago(value: string, asOf: string) {
  const days = Math.floor(
    (new Date(asOf).getTime() - new Date(value).getTime()) / 864e5,
  );
  return days <= 0 ? "오늘" : `${days}일 전`;
}

/**
 * 보안 화면의 보안 범주 알림 표(서버 ADR 0051 §6). 행마다 대상·구성원 수·위반 수·발견 시점과 확인을 두고,
 * 상세를 펼치면 묶음 구간과 구성원 계정을 보인다. 승인·차단·예외 명령은 서버에 없어 두지 않는다.
 */
export function SecurityAlertsTable({
  organizationId,
  status,
  onStatusChange,
  onAcknowledged,
}: {
  organizationId: string;
  status: AlertStatus;
  onStatusChange: (status: AlertStatus) => void;
  onAcknowledged: (message: string) => void;
}) {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const query = useInfiniteQuery(
    alertsOptions(organizationId, status, "security"),
  );
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
  const unavailable =
    first?.evaluation.status === "unavailable" && status === "unacknowledged";

  return (
    <section
      aria-label="보안 알림"
      className="@container min-w-0 rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-baseline gap-2">
          <h2
            title="계약 벤더로 등록하지 않은 AI 제품의 사용 · 이전 모델·도구 알림 이력 포함"
            className="text-sm font-semibold"
          >
            미등록 AI 사용
          </h2>
          {first && (
            <span className="tnum text-[11.5px] text-text3">
              {int(first.alerts.totalCount)}건
            </span>
          )}
        </div>
        <SegmentedControl
          label="알림 상태"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value) => {
            onStatusChange(value);
            acknowledge.reset();
          }}
        />
      </div>

      {!first && query.isPending && <SkeletonRows rows={4} />}
      {query.error && !first && (
        <ErrorState
          variant="inline"
          message={query.error.message}
          retrying={query.isFetching}
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        />
      )}
      {acknowledge.error && (
        <div className="mb-3">
          <ErrorState variant="inline" message={acknowledge.error.message} />
        </div>
      )}
      {first && !items.length && (
        <EmptyState
          className="border-0"
          message={
            unavailable
              ? "알림 평가 결과를 확인할 수 없습니다"
              : status === "unacknowledged"
                ? "미확인 보안 알림이 없습니다"
                : "보안 알림이 없습니다"
          }
          description={
            first.evaluation.reasons.length > 0
              ? first.evaluation.reasons.map(alertReasonText).join(" · ")
              : undefined
          }
        />
      )}

      {first && items.length > 0 && (
        <>
          <div
            aria-hidden="true"
            className={`${COLUMNS} border-b border-border px-1 pb-2 text-[11px] text-text3`}
          >
            <span>대상</span>
            <span className="hidden text-right @3xl:block">구성원</span>
            <span className="hidden text-right @3xl:block">위반</span>
            <span className="hidden pl-7 @3xl:block">발견</span>
            <span className="text-right">조치</span>
          </div>
          <ul aria-label="알림 목록">
            {items.map((alert) => {
              const title =
                ALERT_RULE_TEXT[alert.ruleId]?.title ?? alert.ruleId;
              const open = !!expanded[alert.alertId];
              const found = ago(alert.occurredAt, first.meta.asOf);
              const detailsId = `alert-${alert.alertId}-detail`;
              return (
                <li
                  key={alert.alertId}
                  data-alert-id={alert.alertId}
                  className="border-b border-border"
                >
                  <div className={`${COLUMNS} items-center px-1 py-2.5`}>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="truncate text-[13px] font-semibold">
                        {target(alert)}
                      </span>
                      <span className="truncate text-[11px] text-text3">
                        {KIND_TEXT[alert.ruleId] ?? title} ·{" "}
                        {alert.status === "open" ? "진행 중" : "끝남"}
                        <span className="@3xl:hidden">
                          {" "}
                          · {count(alert.memberCount, "명")} · {found}
                        </span>
                      </span>
                    </span>
                    <span className="tnum hidden text-right text-[12.5px] font-semibold @3xl:block">
                      {count(alert.memberCount, "명")}
                    </span>
                    <span className="tnum hidden text-right text-xs text-text2 @3xl:block">
                      {count(alert.eventCount, "건")}
                    </span>
                    <span
                      title={`발생 ${alertTime(alert.occurredAt)}`}
                      className="tnum hidden pl-7 text-xs text-text2 @3xl:block"
                    >
                      {found}
                    </span>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={open}
                        aria-controls={detailsId}
                        onClick={() =>
                          setExpanded((current) => ({
                            ...current,
                            [alert.alertId]: !current[alert.alertId],
                          }))
                        }
                      >
                        상세
                      </Button>
                      {alert.acknowledgement ? (
                        <span
                          title={alertTime(
                            alert.acknowledgement.acknowledgedAt,
                          )}
                          className="text-[11.5px] whitespace-nowrap text-text3"
                        >
                          확인함
                        </span>
                      ) : (
                        <Button
                          size="sm"
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
                  </div>
                  {open && (
                    <AlertDetail id={detailsId} alert={alert} title={title} />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {query.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            size="sm"
            loading={query.isFetchingNextPage}
            loadingLabel="불러오는 중…"
            onClick={() => void query.fetchNextPage()}
          >
            더 보기
          </Button>
        </div>
      )}
    </section>
  );
}

function AlertDetail({
  id,
  alert,
  title,
}: {
  id: string;
  alert: Alert;
  title: string;
}) {
  // 서버는 구성원 일부만 실을 수 있다 — 나머지는 수로만 말한다.
  const rest =
    alert.memberCount === null
      ? 0
      : Math.max(0, alert.memberCount - alert.members.length);
  return (
    <div
      id={id}
      className="mx-1 mb-2.5 rounded-md border border-border bg-bg text-[11.5px] @3xl:ml-7"
    >
      <dl
        aria-label={`${title} 상세`}
        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-3 py-2.5 break-words text-text2 [overflow-wrap:anywhere]"
      >
        <dt className="text-text3">규칙</dt>
        <dd>{alert.ruleId}</dd>
        <dt className="text-text3">대상</dt>
        <dd>{alert.subject ?? "-"}</dd>
        <dt className="text-text3">묶음 구간</dt>
        <dd>
          {alertTime(alert.windowStart)} ~ {alertTime(alert.windowEnd)}
        </dd>
        <dt className="text-text3">발생 · 마지막</dt>
        <dd>
          {alertTime(alert.occurredAt)} · {alertTime(alert.lastSeenAt)}
        </dd>
        <dt className="text-text3">위반 수</dt>
        <dd>{count(alert.eventCount, "건")}</dd>
        <dt className="text-text3">확인</dt>
        <dd>
          {alert.acknowledgement
            ? alertTime(alert.acknowledgement.acknowledgedAt)
            : "미확인"}
        </dd>
      </dl>
      <div className="border-t border-border">
        <div className="px-3 py-1.5 text-[11px] text-text3">
          구성원 {count(alert.memberCount, "명")}
        </div>
        {alert.members.map((member) => (
          <div
            key={member.memberId}
            className="truncate border-t border-border px-3 py-2 text-[12.5px]"
          >
            {member.account ?? (
              <span className="text-text3">
                구성원 정보 없음 · {member.memberId}
              </span>
            )}
          </div>
        ))}
        {rest > 0 && (
          <div className="border-t border-border px-3 py-2 text-text3">
            외 {int(rest)}명
          </div>
        )}
      </div>
    </div>
  );
}
