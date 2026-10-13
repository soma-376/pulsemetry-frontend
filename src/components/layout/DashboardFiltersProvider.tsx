"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FiltersProvider } from "@/lib/filters";
import {
  defaultDashboardFilters,
  resolveDashboardFilters,
  withFilterQuery,
  type DashboardFilters,
} from "@/lib/filter-query";

export function DashboardFiltersProvider({
  children,
  todayIso,
}: {
  children: React.ReactNode;
  todayIso: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [selection, setSelection] = useState(() => ({
    routeKey,
    filters: resolveDashboardFilters(
      pathname,
      searchParams,
      todayIso,
      defaultDashboardFilters(todayIso),
    ),
  }));
  let filters = selection.filters;
  if (selection.routeKey !== routeKey) {
    // 공통 레이아웃에 마지막 조건을 보관한다. URL 변경은 자식의 API 조회 전에 반영한다.
    filters = resolveDashboardFilters(
      pathname,
      searchParams,
      todayIso,
      selection.filters,
    );
    setSelection({ routeKey, filters });
  }
  // 분석 화면은 조건을 URL에 확정하고, 관리 화면의 오래된 링크에서는 조건만 제거한다.
  useEffect(() => {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = withFilterQuery(current, filters);
    if (current !== next) window.history.replaceState(null, "", next);
  }, [pathname, searchParams, filters]);
  const change = (next: DashboardFilters) => {
    setSelection({ routeKey, filters: next });
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    // Next의 History 연동으로 searchParams만 갱신한다. 페이지 이동·스크롤 초기화·방문 기록 추가는 없다.
    window.history.replaceState(null, "", withFilterQuery(current, next));
  };
  return (
    <FiltersProvider todayIso={todayIso} value={filters} onChange={change}>
      {children}
    </FiltersProvider>
  );
}
