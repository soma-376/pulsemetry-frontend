"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";
import { ExpiredContracts } from "@/components/alerts/ExpiredContracts";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { alertsOptions, type AlertStatus } from "@/lib/api/alerts";
import { contractInputStatusOptions } from "@/lib/api/contract-input";
import { ManagementError } from "@/lib/api/management";
import { int } from "@/lib/format";

function referenceTime(value: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}년 ${part("month")}월 ${part("day")}일 ${part("hour")}시 기준`;
}

/**
 * 공통 헤더·개요의 알림 목록과 확인(서버 ADR 0051 §6). 목록·상세·확인은 운영 · 보안 화면과 같은 [AlertsPanel] 이다.
 */
export function AlertsDrawer({
  organizationId,
  open,
  onClose,
  onAcknowledged,
}: {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  onAcknowledged: (message: string) => void;
}) {
  const [status, setStatus] = useState<AlertStatus>("unacknowledged");
  const query = useInfiniteQuery({
    ...alertsOptions(organizationId, status),
    enabled: open && !!organizationId,
  });
  const contracts = useQuery({
    ...contractInputStatusOptions(organizationId),
    enabled: open && !!organizationId,
  });
  const showContracts = status !== "acknowledged";
  const denied =
    contracts.error instanceof ManagementError &&
    [401, 403, 404].includes(contracts.error.status);
  const expiredContracts = denied
    ? []
    : (contracts.data?.expiredContracts ?? []);
  const asOf = query.data?.pages[0]?.meta.asOf;
  const alertCount = query.data?.pages[0]?.alerts.totalCount;
  const count =
    query.error ||
    alertCount === undefined ||
    (showContracts && (contracts.error || !contracts.data))
      ? undefined
      : alertCount + (showContracts ? contracts.data!.expiredCount : 0);
  // 목록 응답의 기준 시각을 표시하고, 로딩 중에도 부제목 한 줄의 공간을 유지한다.
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="알림"
      subtitle={asOf ? referenceTime(asOf) : "\u00a0"}
      titleAccessory={
        count !== undefined && (
          <span className="tnum text-sm text-text3">{int(count)}건</span>
        )
      }
    >
      <AlertsPanel
        organizationId={organizationId}
        enabled={open}
        status={status}
        onStatusChange={setStatus}
        onAcknowledged={onAcknowledged}
        showCount={false}
        hideEmptyState={
          showContracts &&
          (expiredContracts.length > 0 ||
            contracts.isPending ||
            !!contracts.error)
        }
      >
        {showContracts &&
          (contracts.isPending ||
            contracts.error ||
            expiredContracts.length > 0) && (
            <div className="flex flex-col gap-3">
              {!contracts.data && contracts.isPending && (
                <LoadingState
                  variant="inline"
                  message="계약 만료 여부를 확인하는 중입니다…"
                />
              )}
              {contracts.error && (
                <ErrorState
                  message="계약 만료 여부를 확인하지 못했습니다"
                  description={contracts.error.message}
                  retrying={contracts.isFetching}
                  onRetry={() =>
                    void contracts.refetch({ cancelRefetch: false })
                  }
                />
              )}
              <ExpiredContracts
                contracts={expiredContracts}
                onNavigate={onClose}
              />
            </div>
          )}
      </AlertsPanel>
    </DetailDrawer>
  );
}
