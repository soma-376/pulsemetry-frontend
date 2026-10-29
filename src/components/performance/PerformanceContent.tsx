"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useDashboardPageRefresh } from "@/components/layout/DashboardHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { refreshFeedback } from "@/components/ui/RefreshNotice";
import {
  parseScope,
  performanceQueryOptions,
  type PerformancePeriod,
  type PerformanceScope,
} from "@/lib/api/performance";
import { useBackendSession } from "@/lib/api/session";
import { rangeText } from "@/lib/date";
import { useFilters } from "@/lib/filters";
import {
  presentSummary,
  type PerformanceMetricKey,
} from "@/lib/metrics/performance";
import { presentTrend, scopeName } from "@/lib/metrics/performance-trend";
import { PerformanceScopeSelect } from "./PerformanceScopeSelect";
import { PerformanceSkeleton } from "./PerformanceSkeleton";
import { PerformanceSummary } from "./PerformanceSummary";
import { PerformanceTrendChart } from "./PerformanceTrendChart";

const COMPARE_TEXT = {
  prev_week: "전주 대비",
  prev_period: "이전 기간 대비",
  none: "",
} as const;

/**
 * 성과 — 생산성·지출·도입 효용성 요약과, 요약에서 고른 지표의 8주 추이.
 * 백엔드 API가 아직 없어 예시 데이터를 보여준다(`@/lib/api/performance`).
 * 범위는 URL(`scope`)에도 남겨 새로고침 뒤 복원하고, 고른 지표는 화면 상태에만 둔다.
 */
export function PerformanceContent() {
  const session = useBackendSession();
  // 세션이 없을 때의 안내는 대시보드 레이아웃의 SessionGate 하나가 맡는다.
  if (!session) return null;
  return (
    <OrganizationPerformance
      key={session.user.organizationId}
      organizationId={session.user.organizationId}
    />
  );
}

/** 기간 파라미터를 지우지 않도록 현재 주소에서 scope 만 바꾼다. */
function replaceScope(scope: PerformanceScope) {
  const url = new URL(window.location.href);
  if (scope === "all") url.searchParams.delete("scope");
  else url.searchParams.set("scope", scope);
  window.history.replaceState(window.history.state, "", url);
}

function OrganizationPerformance({
  organizationId,
}: {
  organizationId: string;
}) {
  const { compare, dates, autoRefresh } = useFilters();
  const period: PerformancePeriod = {
    startDate: dates.start,
    endDate: dates.end ?? dates.start,
    compare,
  };
  const query = useQuery({
    ...performanceQueryOptions(organizationId, period),
    refetchInterval: autoRefresh ? 300_000 : false,
  });
  const data = query.data;
  useDashboardPageRefresh(
    () => void query.refetch({ cancelRefetch: false }),
    query.isFetching,
    data ? refreshFeedback(query) : undefined,
  );

  // 첫 화면은 URL의 범위를 따르고, 이후 선택은 화면 상태로 두고 URL에 남긴다.
  const initialScope = useSearchParams().get("scope");
  const [scope, setScope] = useState(() => parseScope(initialScope));
  const changeScope = (next: PerformanceScope) => {
    setScope(next);
    replaceScope(next);
  };
  const [metric, setMetric] = useState<PerformanceMetricKey>("done");
  const showDelta = compare !== "none";
  const summary = useMemo(
    () => data && presentSummary(data, scope, { showDelta }),
    [data, scope, showDelta],
  );
  const trend = useMemo(
    () =>
      data &&
      presentTrend(data, scope, metric, {
        endIso: data.meta.endDate,
        showDelta,
      }),
    [data, scope, metric, showDelta],
  );
  const meta = [
    scopeName(scope),
    rangeText({ start: period.startDate, end: period.endDate }),
    COMPARE_TEXT[compare],
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageContainer className="flex flex-col gap-6 pt-6 pb-10">
      <PageHeader
        page="ops"
        actions={
          <PerformanceScopeSelect value={scope} onChange={changeScope} />
        }
      />
      {query.isPending ? (
        <PerformanceSkeleton />
      ) : !summary ? (
        <ErrorState
          message="성과를 불러오지 못했습니다."
          description="잠시 후 다시 조회해 주세요."
          onRetry={() => void query.refetch({ cancelRefetch: false })}
          retrying={query.isFetching}
        />
      ) : (
        <>
          <PerformanceSummary
            summary={summary}
            meta={meta}
            selected={metric}
            onSelect={setMetric}
          />
          {trend ? (
            <PerformanceTrendChart trend={trend} />
          ) : (
            <p className="max-w-[1100px] rounded-[10px] border border-border bg-card p-5 text-[12px] text-text3">
              이 지표는 선택한 범위에서 추이를 계산할 수 없습니다.
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}
