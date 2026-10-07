"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DAY_MS, TODAY, toIso, type DateRange } from "@/lib/date";
import type { CompareKey, RangeKey } from "@/types/domain";

/**
 * 전역 필터 — 툴바가 쓰고 페이지들이 구독합니다.
 * (dashboard) 레이아웃에 한 번만 선언되므로 페이지를 옮겨다녀도 선택이 유지됩니다.
 */

type FiltersValue = {
  range: RangeKey | null;
  setRange: (r: RangeKey) => void;
  compare: CompareKey;
  setCompare: (c: CompareKey) => void;
  dates: DateRange;
  setDates: (d: DateRange) => void;
  /** 5분 자동 갱신 */
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;
};

const FiltersContext = createContext<FiltersValue | null>(null);

const DEFAULT_DATES: DateRange = { start: "2026-09-07", end: "2026-09-13" };
const RANGE_DAYS: Record<RangeKey, number> = {
  "24h": 1,
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [range, updateRange] = useState<RangeKey | null>("7d");
  const [compare, setCompare] = useState<CompareKey>("prev_week");
  const [dates, updateDates] = useState<DateRange>(DEFAULT_DATES);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const value = useMemo<FiltersValue>(
    () => ({
      range,
      setRange: (next: RangeKey) => {
        updateRange(next);
        updateDates({
          start: toIso(
            new Date(TODAY.getTime() - (RANGE_DAYS[next] - 1) * DAY_MS),
          ),
          end: toIso(TODAY),
        });
      },
      compare,
      setCompare,
      dates,
      setDates: (next: DateRange) => {
        if (!next.end) return;
        updateRange(null);
        updateDates(next);
      },
      autoRefresh,
      toggleAutoRefresh: () => setAutoRefresh((v) => !v),
    }),
    [range, compare, dates, autoRefresh],
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
