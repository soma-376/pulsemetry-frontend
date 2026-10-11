"use client";

import { DateRangePicker } from "@/components/layout/DateRangePicker";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useFilters } from "@/lib/filters";
import type { CompareKey } from "@/types/domain";

/** 공통 대시보드 헤더에서 한 번 렌더링하는 기간·조회 도구. */
export function FilterToolbar({
  todayIso,
  onRefresh,
  refreshing = false,
  csv,
}: {
  todayIso?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 화면이 등록한 CSV 내보내기. 사유가 있으면 끈다. */
  csv?: {
    disabledReason: string | null;
    exporting: boolean;
    onExport: () => void;
  };
}) {
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
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-card px-4 py-2 @min-[1180px]:h-14 @min-[1180px]:flex-nowrap @min-[1180px]:py-0"
    >
      <DateRangePicker value={dates} onChange={setDates} todayIso={todayIso} />

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

      {onRefresh && (
        <Button
          onClick={onRefresh}
          loading={refreshing}
          loadingLabel="조회 중…"
        >
          새로고침
        </Button>
      )}
      <Button
        onClick={toggleAutoRefresh}
        aria-pressed={autoRefresh}
        title="자동 갱신 5분"
      >
        {onRefresh ? "자동 갱신" : "새로고침"}
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

      <Button
        disabled={!csv || !!csv.disabledReason}
        title={csv?.disabledReason ?? "이 화면의 조건으로 CSV를 내려받습니다"}
        loading={csv?.exporting}
        loadingLabel="CSV 만드는 중…"
        onClick={() => csv?.onExport()}
      >
        CSV
      </Button>

      <ThemeToggle />
    </div>
  );
}
