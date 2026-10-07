"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { useQuery } from "@tanstack/react-query";
import {
  useDashboardPageExport,
  useDashboardPageRefresh,
} from "@/components/layout/DashboardHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { OverviewData } from "./OverviewData";
import { DashboardError, overviewQueryOptions } from "@/lib/api/overview";
import { overviewSettingsOptions } from "@/lib/api/overview-vendors";
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
  // 현재 계약은 기간별 사용량과 독립적으로 조회한다. 한 요청의 실패가 다른 카드를 지우지 않는다.
  const contracts = useQuery({
    ...overviewSettingsOptions(organizationId),
    enabled: configured,
    refetchInterval: autoRefresh ? 300_000 : false,
  });
  const denied =
    query.error instanceof DashboardError &&
    [401, 403, 404].includes(query.error.status);
  const contractsDenied =
    contracts.error instanceof DashboardError &&
    [401, 403, 404].includes(contracts.error.status);
  // 설정 조회의 404 는 활성 manifest 가 없는 조직 — 최초 수집 정책을 저장하기 전이라 조회할 계약이 없다(대시보드 명세). 조회 실패가 아니다.
  const contractsMissing =
    contracts.error instanceof DashboardError && contracts.error.status === 404;
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
      if (configured)
        void Promise.all([
          query.refetch({ cancelRefetch: false }),
          contracts.refetch({ cancelRefetch: false }),
        ]);
    },
    !configured || query.isFetching || contracts.isFetching,
  );
  return (
    <>
      {(!data || query.error) && (
        <PageContainer className="flex flex-col gap-8 pt-5 pb-10">
          {!data && (
            <h1 className="text-[18px] font-semibold tracking-[-0.01em]">
              개요
            </h1>
          )}
          {!configured ? (
            <EmptyState
              message="조회할 조직이 설정되지 않았습니다."
              description="관리자에게 문의해 주세요."
            />
          ) : (
            <>
              {query.isPending && (
                <LoadingState
                  message="개요 데이터를 불러오는 중입니다…"
                  className="min-h-[480px]"
                />
              )}
              {query.error && (
                <ErrorState
                  message={
                    <>
                      {query.error instanceof DashboardError
                        ? query.error.message
                        : "개요 데이터를 불러오지 못했습니다. 연결 상태를 확인해 주세요."}
                      {data && " 마지막으로 조회한 데이터를 표시합니다."}
                    </>
                  }
                  onRetry={() => void query.refetch({ cancelRefetch: false })}
                  retrying={query.isFetching}
                  retryLabel="다시 시도"
                />
              )}
            </>
          )}
        </PageContainer>
      )}
      {configured && data && (
        <OverviewData
          key={[organizationId, dates.start, dates.end, compare].join(":")}
          data={data}
          settings={contractsDenied ? undefined : contracts.data}
          contractsMessage={
            contractsMissing
              ? "수집 정책을 저장하기 전이라 계약 정보가 없습니다."
              : contracts.error
                ? "계약 정보를 불러오지 못했습니다."
                : contracts.isPending
                  ? "계약 정보를 불러오는 중입니다…"
                  : undefined
          }
          retryContracts={
            contracts.error && !contractsMissing
              ? () => void contracts.refetch({ cancelRefetch: false })
              : undefined
          }
        />
      )}
    </>
  );
}
