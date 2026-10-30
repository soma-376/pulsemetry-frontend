"use client";

import { PageHeader } from "@/components/layout/PageHeader";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { alertTime } from "@/components/alerts/AlertsPanel";
import {
  useDashboardPageExport,
  useDashboardPageRefresh,
} from "@/components/layout/DashboardHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  PolicyRolloutSection,
  rolloutRatio,
} from "@/components/security/PolicyRolloutSection";
import { SecurityAlertsTable } from "@/components/security/SecurityAlertsTable";
import { SkeletonMetric } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  alertReasonText,
  alertsOptions,
  fetchAlerts,
  type Alert,
  type AlertsPage,
  type AlertStatus,
} from "@/lib/api/alerts";
import { ManagementError } from "@/lib/api/management";
import { settingsOptions } from "@/lib/api/settings";
import { refreshFeedback } from "@/components/ui/RefreshNotice";
import { useBackendSession } from "@/lib/api/session";
import { alertsCsv, downloadCsv } from "@/lib/csv-export";
import { int } from "@/lib/format";

const isDenied = (error: unknown) =>
  error instanceof ManagementError && [401, 403, 404].includes(error.status);
const EVALUATION_TEXT = {
  complete: "완료",
  partial: "일부",
  unavailable: "불가",
} as const;

/**
 * 보안 — 보안 범주 알림(미등록 제품 사용과 과거 알림 이력, 허브 ADR 0008)의 목록·상세·확인과 정책 적용 현황(ADR 0043).
 * 세션 조회와 감사 로그는 이 화면의 범위가 아니다(감사 로그 저장소가 정해지지 않았다).
 * 승인·차단·예외, 위험 카테고리, 구성원 메시지는 서버 데이터·명령이 없어 두지 않는다.
 */
export function SecurityContent() {
  const session = useBackendSession();
  // 세션이 없을 때의 안내는 대시보드 레이아웃의 SessionGate 하나가 맡는다.
  if (!session) return null;
  return (
    <OrganizationSecurity
      key={session.user.organizationId}
      organizationId={session.user.organizationId}
      organizationName={session.user.organizationName}
    />
  );
}

function OrganizationSecurity({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [status, setStatus] = useState<AlertStatus>("unacknowledged");
  const { toast, showToast, dismissToast } = useToast();
  // AlertsPanel이 조회하는 현재 필터의 캐시를 그대로 사용한다.
  // 표가 조회하는 현재 필터의 캐시를 그대로 사용한다.
  const query = useInfiniteQuery(
    alertsOptions(organizationId, status, "security"),
  );
  // 요약 카드는 필터와 무관하게 지금의 미확인 수다. 필터가 미확인이면 같은 캐시다.
  const pending = useInfiniteQuery(
    alertsOptions(organizationId, "unacknowledged", "security"),
  );
  const settings = useQuery(settingsOptions(organizationId));
  const denied = isDenied(query.error);
  const settingsDenied = isDenied(settings.error);
  useDashboardPageRefresh(
    () => {
      void query.refetch({ cancelRefetch: false });
      if (status !== "unacknowledged")
        void pending.refetch({ cancelRefetch: false });
      void settings.refetch({ cancelRefetch: false });
    },
    query.isFetching || pending.isFetching || settings.isFetching,
    denied
      ? undefined
      : refreshFeedback(query, pending, ...(settingsDenied ? [] : [settings])),
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
  const pendingPage = isDenied(pending.error)
    ? undefined
    : pending.data?.pages[0];
  const evaluation = pendingPage?.evaluation;
  const rollout = settingsDenied ? undefined : settings.data?.policyRollout;
  const ratio = rollout ? rolloutRatio(rollout) : null;
  return (
    <PageContainer className="flex flex-col gap-4 pt-6 pb-10">
      <PageHeader page="security" />
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          {pendingPage && evaluation ? (
            <>
              <StatCard
                label="미확인 보안 알림"
                // 평가하지 못한 상태의 0건은 0으로 읽히게 하지 않는다.
                value={
                  evaluation.status === "unavailable" &&
                  !pendingPage.alerts.totalCount
                    ? "-"
                    : int(pendingPage.alerts.totalCount)
                }
                unit="건"
                tone={
                  pendingPage.alerts.totalCount
                    ? "var(--orange-ink)"
                    : undefined
                }
                caption="미등록 제품 사용 · 이전 모델·도구 알림 이력"
              />
              <StatCard
                label="알림 평가"
                value={EVALUATION_TEXT[evaluation.status]}
                tone={
                  evaluation.status === "complete"
                    ? undefined
                    : "var(--orange-ink)"
                }
                caption={
                  evaluation.reasons.length
                    ? evaluation.reasons.map(alertReasonText).join(" · ")
                    : `마지막 평가 ${alertTime(evaluation.asOf)}`
                }
              />
            </>
          ) : pending.error && !pending.data ? (
            <>
              <StatCard
                label="미확인 보안 알림"
                value="-"
                caption="조회 실패"
              />
              <StatCard label="알림 평가" value="-" caption="조회 실패" />
            </>
          ) : (
            <>
              <SkeletonMetric />
              <SkeletonMetric />
            </>
          )}
          {rollout ? (
            <StatCard
              label="최신 정책 적용"
              value={ratio === null ? "-" : `${Math.round(ratio * 100)}%`}
              unit={`${int(rollout.appliedInstallations)} / ${int(rollout.eligibleInstallations)}대`}
              tone={
                ratio !== null && ratio < 0.85 ? "var(--orange-ink)" : undefined
              }
              caption={`정책 v${rollout.desiredVersion} · 미적용 ${int(rollout.outdatedInstallations + rollout.unknownInstallations)}대`}
            />
          ) : settingsDenied || (settings.error && !settings.data) ? (
            <StatCard
              label="최신 정책 적용"
              value="-"
              caption={settingsDenied ? "조회 권한 없음" : "조회 실패"}
            />
          ) : (
            <SkeletonMetric />
          )}
        </div>
      </div>
      <SecurityAlertsTable
        organizationId={organizationId}
        status={status}
        onStatusChange={setStatus}
        onAcknowledged={showToast}
      />
      <PolicyRolloutSection query={settings} denied={settingsDenied} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </PageContainer>
  );
}
