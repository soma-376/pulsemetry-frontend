"use client";

import { PageHeader } from "@/components/layout/PageHeader";

import { PageContainer } from "@/components/layout/PageContainer";
import { useQuery } from "@tanstack/react-query";
import {
  useDashboardPageExport,
  useDashboardPageRefresh,
} from "@/components/layout/DashboardHeader";
import { OverviewSkeleton } from "./OverviewSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { refreshFeedback } from "@/components/ui/RefreshNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { OverviewBody } from "./OverviewData";
import { DashboardError, overviewQueryOptions } from "@/lib/api/overview";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";
import { downloadCsv, overviewCsv } from "@/lib/csv-export";

export function OverviewContent() {
  const session = useBackendSession();
  const organizationId = session?.user.organizationId ?? "";
  const { compare, dates, autoRefresh } = useFilters();
  const configured = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
    organizationId,
  );
  const query = useQuery({
    ...overviewQueryOptions({
      organizationId,
      startDate: dates.start,
      endDate: dates.end ?? dates.start,
      compare,
      timeZone: "Asia/Seoul",
    }),
    enabled: configured,
    refetchInterval: (state) => {
      const error = state.state.error;
      if (
        error instanceof DashboardError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      )
        return false;
      return autoRefresh
        ? Math.max(
            300_000,
            error instanceof DashboardError ? error.retryAfterMs : 0,
          )
        : false;
    },
  });
  const denied =
    query.error instanceof DashboardError &&
    [401, 403, 404].includes(query.error.status);
  const data = denied ? undefined : query.data;
  // CSV 는 화면이 쓰는 같은 응답(기간·비교·서버 기준 시각)으로 만든다.
  useDashboardPageExport(
    data
      ? () =>
          downloadCsv(
            `overview_${data.meta.startDate}_${data.meta.endDate}.csv`,
            overviewCsv(
              data,
              session?.user.organizationName ?? data.meta.organizationId,
              new Date().toISOString(),
            ),
          )
      : null,
    "개요를 불러온 뒤 내보낼 수 있습니다",
  );
  useDashboardPageRefresh(
    () => {
      if (configured) void query.refetch({ cancelRefetch: false });
    },
    !configured || query.isFetching,
    data
      ? (refreshFeedback(query) ??
          (data.errors.length
            ? { paused: false, updatedAt: query.dataUpdatedAt, partial: true }
            : undefined))
      : undefined,
  );
  return (
    <PageContainer className="flex items-start gap-4 pt-6 pb-10">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <PageHeader page="overview" />
        {!data &&
          (!configured ? (
            <EmptyState
              message="조회할 조직이 설정되지 않았습니다."
              description="관리자에게 문의해 주세요."
            />
          ) : (
            <>
              {query.isPending && <OverviewSkeleton />}
              {query.error && (
                <ErrorState
                  message={
                    query.error instanceof DashboardError
                      ? query.error.message
                      : "개요 데이터를 불러오지 못했습니다. 연결 상태를 확인해 주세요."
                  }
                  onRetry={() => void query.refetch({ cancelRefetch: false })}
                  retrying={query.isFetching}
                  retryLabel="다시 시도"
                />
              )}
            </>
          ))}
        {configured && data && (
          <OverviewBody
            key={[organizationId, dates.start, dates.end, compare].join(":")}
            data={data}
          />
        )}
      </div>
    </PageContainer>
  );
}
