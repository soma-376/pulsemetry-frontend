"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertsDrawer } from "@/components/overview/AlertsDrawer";
import { Icon } from "@/components/ui/Icon";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/ui/use-toast";
import { alertsOptions } from "@/lib/api/alerts";
import { contractInputStatusOptions } from "@/lib/api/contract-input";
import { useFilters } from "@/hooks/dashboard/use-filters";

/** 미확인 알림과 아직 갱신하지 않은 계약. 헤더·드로어와 조회 캐시를 공유한다. */
export function NotificationBell({
  organizationId,
}: {
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const { autoRefresh } = useFilters();
  const { toast, showToast, dismissToast } = useToast();
  const query = useInfiniteQuery({
    ...alertsOptions(organizationId, "unacknowledged"),
    refetchInterval: autoRefresh ? 300_000 : false,
  });
  const contracts = useQuery(contractInputStatusOptions(organizationId));
  const failed = !!query.error || !!contracts.error;
  const alertCount = query.data?.pages[0]?.alerts.totalCount;
  const count =
    failed || alertCount === undefined || !contracts.data
      ? undefined
      : alertCount + contracts.data.expiredCount;
  const label = !organizationId
    ? "로그인 후 알림을 확인할 수 있습니다"
    : failed
      ? "알림, 미확인 건수 조회 실패. 열어서 다시 시도하세요"
      : count === undefined
        ? "알림, 미확인 건수 확인 중"
        : `알림, 미확인 ${count.toLocaleString("ko-KR")}건`;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!organizationId}
        onClick={() => setOpen(true)}
        className="relative mx-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text2 transition-colors hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-50"
      >
        <Icon name="bell" size={20} />
        {!!organizationId && (
          <span
            aria-hidden="true"
            className={`tnum absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card px-1 text-[10px] leading-none font-semibold ${count !== undefined && count > 0 ? "bg-red text-card" : "bg-sub text-text2"}`}
          >
            {failed
              ? "!"
              : count === undefined
                ? "…"
                : count > 99
                  ? "99+"
                  : count}
          </span>
        )}
      </button>
      <AlertsDrawer
        organizationId={organizationId}
        open={open}
        onClose={() => setOpen(false)}
        onAcknowledged={showToast}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
