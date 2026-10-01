"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { acknowledgeAlert, ALERT_RULE_TEXT, alertQueryKeys, alertReasonText, alertsOptions, alertSummary, type Alert, type AlertStatus } from "@/lib/api/alerts";
import { ManagementError } from "@/lib/api/management";
import { int } from "@/lib/format";

const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";
const STATUS_OPTIONS: { value: AlertStatus; label: string }[] = [{ value: "unacknowledged", label: "미확인" }, { value: "acknowledged", label: "확인함" }, { value: "all", label: "전체" }];

/**
 * 개요의 알림 목록과 확인(서버 ADR 0051 §6). 목록·건수는 서버 값이고, 확인하면 목록과 개요의 미확인 수를 다시 읽는다.
 * 규칙마다 마지막 평가를 함께 보여 준다 — "평가하지 않음"은 0건이 아니다.
 */
export function AlertsDrawer({ organizationId, open, onClose, onAcknowledged }: {
  organizationId: string; open: boolean; onClose: () => void; onAcknowledged: (message: string) => void;
}) {
  const [status, setStatus] = useState<AlertStatus>("unacknowledged");
  const client = useQueryClient();
  const query = useInfiniteQuery({ ...alertsOptions(organizationId, status), enabled: open && !!organizationId });
  const refresh = () => Promise.all(alertQueryKeys(organizationId).map((queryKey) => client.invalidateQueries({ queryKey })));
  const acknowledge = useMutation({
    mutationFn: (alert: Alert) => acknowledgeAlert(organizationId, alert.alertId, alert.version),
    onSuccess: () => { onAcknowledged("알림을 확인했습니다."); return refresh(); },
    // 그 사이 묶음이 늘었다면(409) 최신 목록을 다시 읽는다.
    onError: (error) => { if (error instanceof ManagementError && error.code === "version_conflict") void refresh(); },
  });
  const pages = query.data?.pages ?? [];
  const first = pages[0];
  const items = pages.flatMap((page) => page.alerts.items);
  return <DetailDrawer open={open} onClose={onClose} title="알림" subtitle={first ? `평가 ${time(first.evaluation.asOf)}` : undefined}>
    <div className="flex flex-col gap-4">
      <SegmentedControl label="알림 상태" options={STATUS_OPTIONS} value={status} onChange={(value) => { setStatus(value); acknowledge.reset(); }} />
      {first && <section aria-label="규칙별 평가" className="rounded-lg bg-sub p-3 text-xs">
        {first.evaluation.availability === "unavailable" && <p className="mb-2 text-orange-ink">{alertReasonText(first.evaluation.reason)}</p>}
        <ul className="flex flex-col gap-1">{first.evaluation.rules.filter((rule) => rule.enabled).map((rule) => <li key={rule.ruleId} className="flex flex-wrap justify-between gap-2">
          <span>{ALERT_RULE_TEXT[rule.ruleId]?.title ?? rule.ruleId}</span>
          <span className={rule.status === "evaluated" ? "text-text3" : "text-orange-ink"}>
            {rule.status === null ? "평가 전" : rule.status === "evaluated" ? `평가함 · ${time(rule.evaluatedAt)}` : `평가하지 않음 · ${alertReasonText(rule.reason)}`}</span>
        </li>)}</ul>
      </section>}
      {!first && query.isPending && <LoadingState variant="inline" message="알림을 불러오는 중입니다…" />}
      {query.error && <ErrorState variant="inline" message={query.error.message} retrying={query.isFetching} onRetry={() => void query.refetch({ cancelRefetch: false })} />}
      {acknowledge.error && <ErrorState variant="inline" message={acknowledge.error.message} />}
      {first && !items.length && <EmptyState message={status === "unacknowledged" ? "미확인 알림이 없습니다" : "알림이 없습니다"} description="켜진 규칙의 평가 결과만 알림이 됩니다." />}
      {items.length > 0 && <ul aria-label="알림 목록" className="flex flex-col gap-2">
        {items.map((alert) => {
          const title = ALERT_RULE_TEXT[alert.ruleId]?.title ?? alert.ruleId;
          return <li key={alert.alertId} data-alert-id={alert.alertId} className="rounded-lg border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{title}</span>
              <span className="flex gap-1 text-[11px]">
                <span className="rounded bg-gray-tint px-1.5">{alert.category === "security" ? "보안" : "비용"}</span>
                <span className="rounded bg-gray-tint px-1.5">{alert.status === "open" ? "진행 중" : "끝남"}</span>
              </span>
            </div>
            <p className="mt-1.5 text-text2">{alertSummary(alert)}</p>
            <p className="mt-1 text-[11px] text-text3">발생 {time(alert.occurredAt)}{alert.lastSeenAt !== alert.occurredAt ? ` · 마지막 ${time(alert.lastSeenAt)}` : ""}
              {alert.members.length > 0 ? ` · ${alert.members.map((member) => member.account ?? "구성원 정보 없음").join(", ")}` : ""}</p>
            <div className="mt-2 flex items-center justify-end gap-2">
              {alert.acknowledgement ? <span className="text-[11px] text-text3">확인함 · {time(alert.acknowledgement.acknowledgedAt)}</span>
                : <Button size="sm" variant="primary" aria-label={`${title} ${time(alert.occurredAt)} 확인`} loading={acknowledge.isPending && acknowledge.variables?.alertId === alert.alertId}
                  loadingLabel="확인 중…" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(alert)}>확인</Button>}
            </div>
          </li>;
        })}
      </ul>}
      {first && <p className="text-[11px] text-text3">{int(first.alerts.totalCount)}건</p>}
      {query.hasNextPage && <Button size="sm" loading={query.isFetchingNextPage} loadingLabel="불러오는 중…" onClick={() => void query.fetchNextPage()}>더 보기</Button>}
    </div>
  </DetailDrawer>;
}
