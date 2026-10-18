"use client";

import { PageHeader } from "@/components/layout/PageHeader";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";
import { useDashboardPageExport } from "@/hooks/dashboard/use-dashboard-page-export";
import { useDashboardPageRefresh } from "@/hooks/dashboard/use-dashboard-page-refresh";
import { PageContainer } from "@/components/layout/PageContainer";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/ui/use-toast";
import {
  alertsOptions,
  fetchAlerts,
  type Alert,
  type AlertsPage,
  type AlertStatus,
} from "@/lib/api/alerts";
import { ManagementError } from "@/lib/api/management";
import { refreshFeedback } from "@/components/ui/RefreshNotice";
import { useBackendSession } from "@/hooks/auth/use-backend-session";
import { alertsCsv, downloadCsv } from "@/lib/csv-export";

/**
 * 운영 · 보안 — 보안 범주 알림(미등록 제품 사용과 과거 알림 이력, 허브 ADR 0008)의 목록·상세·확인.
 * 세션 조회와 감사 로그는 이 화면의 범위가 아니다(감사 로그 저장소가 정해지지 않았다).
 */
export function OpsContent() {
  const session = useBackendSession();
  // 세션이 없을 때의 안내는 대시보드 레이아웃의 SessionGate 하나가 맡는다.
  if (!session) return null;
  return (
    <OrganizationOps
      key={session.user.organizationId}
      organizationId={session.user.organizationId}
      organizationName={session.user.organizationName}
    />
  );
}

function OrganizationOps({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [status, setStatus] = useState<AlertStatus>("unacknowledged");
  const { toast, showToast, dismissToast } = useToast();
  // AlertsPanel이 조회하는 현재 필터의 캐시를 그대로 사용한다.
  const query = useInfiniteQuery(
    alertsOptions(organizationId, status, "security"),
  );
  const denied =
    query.error instanceof ManagementError &&
    [401, 403, 404].includes(query.error.status);
  useDashboardPageRefresh(
    () => {
      void query.refetch({ cancelRefetch: false });
    },
    query.isFetching,
    denied ? undefined : refreshFeedback(query),
  );
  // 화면의 상태 필터와 같은 조건의 보안 알림 전부 — 같은 snapshot 으로 끝까지 읽고, 만료되면 처음부터 한 번 다시 읽는다.
  const exportAlerts = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const first: AlertsPage = await fetchAlerts(
          organizationId,
          status,
          "security",
          null,
        );
        const items: Alert[] = [...first.alerts.items];
        let cursor = first.alerts.nextCursor;
        while (cursor) {
          const next = await fetchAlerts(organizationId, status, "security", {
            cursor,
            snapshotId: first.meta.snapshotId,
          });
          items.push(...next.alerts.items);
          cursor = next.alerts.nextCursor;
        }
        downloadCsv(
          `security_alerts_${status}_${first.meta.asOf.slice(0, 10)}.csv`,
          alertsCsv(
            first,
            items,
            organizationName,
            status,
            "security",
            new Date().toISOString(),
          ),
        );
        return;
      } catch (error) {
        if (
          attempt === 0 &&
          error instanceof ManagementError &&
          error.code === "snapshot_expired"
        )
          continue;
        throw error;
      }
    }
  };
  useDashboardPageExport(exportAlerts, "");
  return (
    <PageContainer className="flex flex-col gap-6 pt-6 pb-10">
      <PageHeader page="ops" />
      <section
        aria-label="보안 알림"
        className="max-w-[760px] rounded-lg border border-border bg-card p-4"
      >
        <AlertsPanel
          organizationId={organizationId}
          enabled
          category="security"
          status={status}
          onStatusChange={setStatus}
          onAcknowledged={showToast}
          refreshInHeader
        />
      </section>
      <Toast toast={toast} onDismiss={dismissToast} />
    </PageContainer>
  );
}
