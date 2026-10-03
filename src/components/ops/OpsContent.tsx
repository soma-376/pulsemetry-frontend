"use client";

import { useState } from "react";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";
import { useDashboardPageExport } from "@/components/layout/DashboardHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Toast, useToast } from "@/components/ui/Toast";
import { fetchAlerts, type Alert, type AlertsPage, type AlertStatus } from "@/lib/api/alerts";
import { ManagementError } from "@/lib/api/management";
import { useBackendSession } from "@/lib/api/session";
import { alertsCsv, downloadCsv } from "@/lib/csv-export";

/**
 * 운영 · 보안 — 보안 범주 알림(비허용 모델 호출·미승인 도구 사용, 서버 ADR 0051)의 목록·상세·확인.
 * 세션 조회와 감사 로그는 이 화면의 범위가 아니다(감사 로그 저장소가 정해지지 않았다).
 */
export function OpsContent() {
  const session = useBackendSession();
  // 세션이 없을 때의 안내는 대시보드 레이아웃의 SessionGate 하나가 맡는다.
  if (!session) return null;
  return <OrganizationOps key={session.user.organizationId} organizationId={session.user.organizationId} organizationName={session.user.organizationName} />;
}

function OrganizationOps({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [status, setStatus] = useState<AlertStatus>("unacknowledged");
  const { toast, showToast, dismissToast } = useToast();
  // 화면의 상태 필터와 같은 조건의 보안 알림 전부 — 같은 snapshot 으로 끝까지 읽고, 만료되면 처음부터 한 번 다시 읽는다.
  const exportAlerts = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const first: AlertsPage = await fetchAlerts(organizationId, status, "security", null);
        const items: Alert[] = [...first.alerts.items];
        let cursor = first.alerts.nextCursor;
        while (cursor) {
          const next = await fetchAlerts(organizationId, status, "security", { cursor, snapshotId: first.meta.snapshotId });
          items.push(...next.alerts.items);
          cursor = next.alerts.nextCursor;
        }
        downloadCsv(`security_alerts_${status}_${first.meta.asOf.slice(0, 10)}.csv`, alertsCsv(first, items, organizationName, status, "security", new Date().toISOString()));
        return;
      } catch (error) {
        if (attempt === 0 && error instanceof ManagementError && error.code === "snapshot_expired") continue;
        throw error;
      }
    }
  };
  useDashboardPageExport(exportAlerts, "");
  return <PageContainer className="flex flex-col gap-4 pt-5 pb-10">
    <div className="flex flex-col gap-1">
      <h1 className="text-[18px] font-semibold tracking-[-0.01em]">운영 · 보안</h1>
      <p className="text-xs text-text2">보안 범주 알림 — 허용 목록 밖 모델 호출과 승인하지 않은 도구 사용 — 을 확인합니다. 알림은 설정에서 켠 규칙의 주기 평가 결과입니다.</p>
      <p className="text-xs text-text3">세션 조회와 감사 로그는 이 화면의 범위가 아닙니다.</p>
    </div>
    <section aria-label="보안 알림" className="max-w-[760px] rounded-lg border border-border bg-card p-4">
      <AlertsPanel organizationId={organizationId} enabled category="security" status={status} onStatusChange={setStatus} onAcknowledged={showToast} />
    </section>
    <Toast toast={toast} onDismiss={dismissToast} />
  </PageContainer>;
}
