"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DAY_MS, fromIso, toIso, type DateRange } from "@/lib/date";
import {
  defaultDashboardFilters,
  withFilterQuery,
  type DashboardFilters,
} from "@/lib/filter-query";
import type { CompareKey, RangeKey } from "@/types/domain";

type FiltersValue = {
  range: RangeKey | null;
  setRange: (r: RangeKey) => void;
  compare: CompareKey;
  setCompare: (c: CompareKey) => void;
  dates: DashboardFilters["dates"];
  setDates: (d: DateRange) => void;
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;
};
const FiltersContext = createContext<FiltersValue | null>(null);
const RANGE_DAYS: Record<RangeKey, number> = {
  "24h": 1,
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

/** 대시보드에서는 URL이 값을 소유한다. Storybook 등 독립 화면에서는 메모리 상태로 사용할 수 있다. */
export function FiltersProvider({
  children,
  todayIso = "2026-09-13",
  value: controlled,
  onChange,
}: {
  children: React.ReactNode;
  todayIso?: string;
  value?: DashboardFilters;
  onChange?: (next: DashboardFilters) => void;
}) {
  const [local, setLocal] = useState(() => defaultDashboardFilters(todayIso));
  const [autoRefresh, setAutoRefresh] = useState(false);
  const filters = controlled ?? local;
  const change = onChange ?? setLocal;
  const value = useMemo<FiltersValue>(
    () => ({
      ...filters,
      range:
        filters.dates.end === todayIso
          ? ((Object.entries(RANGE_DAYS).find(
              ([, days]) =>
                toIso(
                  new Date(fromIso(todayIso).getTime() - (days - 1) * DAY_MS),
                ) === filters.dates.start,
            )?.[0] as RangeKey | undefined) ?? null)
          : null,
      setRange: (next) =>
        change({
          ...filters,
          dates: {
            start: toIso(
              new Date(
                fromIso(todayIso).getTime() - (RANGE_DAYS[next] - 1) * DAY_MS,
              ),
            ),
            end: todayIso,
          },
        }),
      setCompare: (compare) => change({ ...filters, compare }),
      setDates: (dates) => {
        if (dates.end)
          change({ ...filters, dates: { start: dates.start, end: dates.end } });
      },
      autoRefresh,
      toggleAutoRefresh: () => setAutoRefresh((value) => !value),
    }),
    [filters, change, autoRefresh, todayIso],
  );
  return (
    <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within <FiltersProvider>");
  return ctx;
}

/** 전역 필터가 없는 독립 카드에서는 원래 링크를 사용한다. */
export function useDashboardHref() {
  const filters = useContext(FiltersContext);
  return (href: string) => (filters ? withFilterQuery(href, filters) : href);
}
