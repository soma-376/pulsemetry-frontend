"use client";

import { DateRangePicker } from "@/components/layout/DateRangePicker";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useFilters } from "@/lib/filters";
import type { CompareKey } from "@/types/domain";

/**
 * 전역 필터 툴바.
 * 설정 화면처럼 필터가 무의미한 페이지는 이걸 렌더하지 않습니다 —
 * 그래서 레이아웃이 아니라 페이지가 직접 얹습니다.
 */
export function FilterToolbar() {
  const {
    compare,
    setCompare,
    dates,
    setDates,
    autoRefresh,
    toggleAutoRefresh,
  } = useFilters();

  return (
    <div
      role="toolbar"
      aria-label="전역 필터"
      className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-card px-4 py-2 @min-[1180px]:h-14 @min-[1180px]:flex-nowrap @min-[1180px]:py-0"
    >
      <DateRangePicker value={dates} onChange={setDates} />

      <label className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-text2">
        비교
        <Select
          value={compare}
          onChange={(e) => setCompare(e.target.value as CompareKey)}
        >
          <option value="prev_period">이전 기간</option>
          <option value="prev_week">전주</option>
          <option value="none">없음</option>
        </Select>
      </label>

      <span
        title="테넌트 기본 타임존 Asia/Seoul"
        className="text-[11px] whitespace-nowrap text-text3"
      >
        KST
      </span>

      <div className="hidden flex-1 @min-[1180px]:block" />

      <Button
        onClick={toggleAutoRefresh}
        aria-pressed={autoRefresh}
        title="새로고침 · 자동 갱신 5분"
      >
        새로고침
        <span className="flex items-center gap-1 text-[11px] text-text3">
          <span
            className="relative h-3 w-[22px] rounded-full transition-colors"
            style={{
              background: autoRefresh ? "var(--blue)" : "var(--gray)",
            }}
          >
            <span
              className="absolute top-0.5 h-2 w-2 rounded-full bg-white transition-[left]"
              style={{ left: autoRefresh ? 12 : 2 }}
            />
          </span>
          5분
        </span>
      </Button>

      <Button>CSV</Button>

      <ThemeToggle />
    </div>
  );
}
