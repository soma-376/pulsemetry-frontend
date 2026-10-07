"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertsPanel, alertTime } from "@/components/alerts/AlertsPanel";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { alertsOptions, type AlertStatus } from "@/lib/api/alerts";

/**
 * 개요의 알림 목록과 확인(서버 ADR 0051 §6). 목록·상세·확인은 운영 · 보안 화면과 같은 [AlertsPanel] 이다.
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
  // 부제목의 평가 시각 — 패널과 같은 조회(같은 캐시)다.
  const query = useInfiniteQuery({
    ...alertsOptions(organizationId, status),
    enabled: open && !!organizationId,
  });
  const first = query.data?.pages[0];
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="알림"
      subtitle={first ? `평가 ${alertTime(first.evaluation.asOf)}` : undefined}
    >
      <AlertsPanel
        organizationId={organizationId}
        enabled={open}
        status={status}
        onStatusChange={setStatus}
        onAcknowledged={onAcknowledged}
      />
    </DetailDrawer>
  );
}
