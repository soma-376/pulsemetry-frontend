"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FiltersProvider } from "@/lib/filters";
import {
  readFilterQuery,
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
  const filters = readFilterQuery(searchParams, todayIso);
  // 기본값과 잘못된 값도 URL에 확정해 공유·새로고침에서 같은 기간을 복원한다.
  useEffect(() => {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = withFilterQuery(
      current,
      readFilterQuery(new URLSearchParams(window.location.search), todayIso),
    );
    if (current !== next) window.history.replaceState(null, "", next);
  }, [pathname, searchParams, todayIso]);
  const change = (next: DashboardFilters) => {
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
