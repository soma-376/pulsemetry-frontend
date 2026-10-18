"use client";

import { useState } from "react";
import { SortHeader } from "@/components/ui/SortHeader";
import { nextSort, sortRows, type SortState } from "@/lib/sort";
import { LineAreaChart } from "@/components/charts/LineAreaChart";
import { TrendFeedback } from "@/components/charts/TrendFeedback";
import { MetricStatusBadge } from "@/components/overview/KpiCard";
import { trendBadge } from "@/lib/metrics/trend-feedback";
import { costAxisLabel, trendAxisMax } from "@/lib/metrics/chart-axis";
import { knownMoneyText } from "@/lib/metrics/known-usage";
import { xAt } from "@/components/charts/scale";
import { ProgressBar } from "@/components/charts/ProgressBar";
import {
  knownTrendNote,
  type AxisKey,
  type TeamsModel,
  type TrendMode,
} from "@/lib/metrics/teams-presentation";

const AXIS_TABS: { key: AxisKey; label: string }[] = [
  { key: "cost", label: "비용" },
  { key: "token", label: "토큰" },
  { key: "session", label: "세션" },
];

const COLS =
  "grid grid-cols-[minmax(132px,1fr)_minmax(0,2fr)_minmax(74px,1fr)_minmax(74px,1fr)_minmax(66px,0.9fr)_24px] items-center gap-2.5";

type SortKey =
  "team" | "totalValue" | "perUserValue" | "unitValue" | "deltaValue";
const DEFAULT_SORT: SortState<SortKey> = {
  key: "totalValue",
  direction: "desc",
};

/**
 * 축 탭 + 팀별 누적 추이 + 팀 표.
 *
 * 표의 체크박스가 추이 선의 표시를 직접 제어합니다 — 6개 선이 한꺼번에 겹치면
 * 아무것도 못 읽으므로, 비교하고 싶은 팀만 남기는 것이 기본 사용법입니다.
 */
export function TeamAxisPanel({
  model,
  axis,
  onAxisChange,
  hidden,
  onToggleTeam,
  onOpenTeam,
  trendMode,
  onTrendModeChange,
}: {
  model: TeamsModel;
  axis: AxisKey;
  onAxisChange: (next: AxisKey) => void;
  /** 팀 키(팀 ID 또는 `unassigned`) → 선 숨김 */
  hidden: Record<string, boolean>;
  onToggleTeam: (key: string) => void;
  onOpenTeam: (key: string) => void;
  trendMode?: TrendMode;
  onTrendModeChange?: (mode: TrendMode) => void;
}) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [localTrendMode, setLocalTrendMode] = useState<TrendMode>("strict");
  const mode = axis === "session" ? "strict" : (trendMode ?? localTrendMode);
  const activeSort =
    sort.key === "deltaValue" && !model.showDelta ? DEFAULT_SORT : sort;
  const ax = model.axes[axis];
  const rows = sortRows(
    ax.rows,
    (row) => row[activeSort.key],
    activeSort.direction,
    (row) => row.team,
  );
  const selectedTrend =
    mode === "known" && axis !== "session"
      ? model.knownTrend[axis]
      : model.trend[axis];
  const selectedFeedback =
    mode === "known" && axis !== "session"
      ? model.knownTrendFeedback[axis]
      : model.trendFeedback[axis];
  const shown = selectedTrend.filter((s) => !hidden[s.key]);
  const feedback = {
    ...selectedFeedback,
    series: selectedFeedback.series.filter((s) => !hidden[s.id]),
  };
  const status = trendBadge(feedback);
  const isEmpty = shown.length === 0;
  // 누적선의 값은 서버 값의 합이라 0보다 작지 않다. 값이 하나도 없으면(모든 날이 확인 불가) 선을 그리지 않는다.
  const known = shown
    .flatMap((s) => s.values)
    .filter((value): value is number => value !== null);
  const max = trendAxisMax(known, 1.08);
  const axisLabel = (value: number) =>
    axis === "cost" ? costAxisLabel(value, max) : ax.format(value);

  return (
    <section
      aria-label="팀별 사용량 비교"
      className="relative flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-6"
    >
      <div className="relative mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="지표 축"
          className="flex gap-0.5 rounded-md border border-border bg-sub p-0.5"
        >
          {AXIS_TABS.map((t) => {
            const active = t.key === axis;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (t.key !== axis) {
                    setSort(DEFAULT_SORT);
                    onAxisChange(t.key);
                  }
                }}
                className="h-7 cursor-pointer rounded-md border-0 px-3.5 text-[12px] font-semibold whitespace-nowrap"
                style={{
                  background: active ? "var(--text)" : "transparent",
                  color: active ? "var(--card)" : "var(--text2)",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[11px] text-text2">전사</span>
          <span className="tnum text-[24px] font-semibold tracking-[-0.02em]">
            {ax.total}
          </span>
          <span
            className="tnum text-[11px] font-semibold"
            style={{ color: ax.deltaColor }}
          >
            {ax.delta}
          </span>
          {ax.status && <MetricStatusBadge {...ax.status} />}
          {model.compareLabel && ax.delta === "-" && ax.deltaReason && (
            <MetricStatusBadge label="비교 불가" reason={ax.deltaReason} />
          )}
        </div>
      </div>

      <div className="relative mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">팀별 누적 추이</span>
        {axis !== "session" && (
          <div
            role="group"
            aria-label="누적 집계 기준"
            className="flex gap-1 rounded-md border border-border bg-sub p-0.5"
          >
            {(
              [
                ["strict", "전체 누적"],
                ["known", "확인된 값 누적"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => (onTrendModeChange ?? setLocalTrendMode)(key)}
                className="cursor-pointer rounded px-2 py-1 text-[11px] font-semibold"
                style={{
                  background: mode === key ? "var(--text)" : "transparent",
                  color: mode === key ? "var(--card)" : "var(--text2)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {status && <MetricStatusBadge {...status} />}
      </div>
      {mode === "known" && axis !== "session" && (
        <p className="mb-4 text-[11px] leading-5 text-text2">
          {knownTrendNote(axis)}
        </p>
      )}

      <div className="mb-[18px] grid grid-cols-[minmax(56px,max-content)_minmax(0,1fr)] gap-2">
        <div className="tnum flex h-[196px] flex-col justify-between text-right text-[11px] text-text3">
          <span>{isEmpty || !known.length ? "" : axisLabel(max)}</span>
          <span>{isEmpty || !known.length ? "" : axisLabel(max / 2)}</span>
          <span>{isEmpty ? "" : "0"}</span>
        </div>

        <div className="relative h-[196px]">
          <div className="absolute top-0 right-0 left-0 border-t border-border" />
          <div className="absolute top-1/2 right-0 left-0 border-t border-border" />
          <div className="absolute right-0 bottom-0 left-0 border-t border-text3" />

          {!isEmpty && (
            <>
              <LineAreaChart
                domain={{ max }}
                series={shown.map((s) => ({
                  values: s.values,
                  color: s.color,
                }))}
              />
              <TrendFeedback
                key={`${axis}-${mode}`}
                model={feedback}
                max={max}
                format={
                  mode === "known" && axis === "cost"
                    ? (value) =>
                        value === null ? "-" : knownMoneyText(String(value))
                    : ax.format
                }
                label={`${mode === "known" ? "확인된 값 누적" : "전체 누적"}. 날짜별 팀 사용량. 좌우 방향키로 날짜를 이동하세요`}
              />
            </>
          )}

          {isEmpty && (
            <div className="pretty absolute inset-0 flex items-center justify-center text-center text-[12px] text-text3">
              표에서 팀을 하나 이상 선택하세요
            </div>
          )}
        </div>

        <div />
        <div className="tnum relative h-5 @container text-[11px] text-text3">
          {model.dayLabels.map(
            (label, i) =>
              (i % Math.max(1, Math.ceil((model.dayLabels.length - 1) / 6)) ===
                0 ||
                i === model.dayLabels.length - 1) && (
                <span
                  key={i}
                  className={`absolute whitespace-nowrap ${i !== 0 && i !== model.dayLabels.length - 1 ? "@max-[300px]:hidden" : ""}`}
                  style={{
                    left: `${xAt(i, model.dayLabels.length)}%`,
                    transform:
                      model.dayLabels.length === 1
                        ? "translateX(-50%)"
                        : i === 0
                          ? undefined
                          : i === model.dayLabels.length - 1
                            ? "translateX(-100%)"
                            : "translateX(-50%)",
                  }}
                >
                  {label}
                </span>
              ),
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-text2">{ax.title}</span>
        <span className="text-[11px] text-text3">
          체크박스로 추이 표시 · 행을 눌러 상세 보기
        </span>
      </div>

      <div
        className="relative overflow-x-auto"
        role="region"
        aria-label="팀별 지표 표"
        tabIndex={0}
      >
        <div className="min-w-[640px]">
          <div
            className={`${COLS} border-b border-border px-0.5 pb-2 text-[11px] text-text3`}
          >
            {(
              [
                ["team", "팀"],
                ["totalValue", ax.c1],
                ["perUserValue", ax.c2],
                ["unitValue", ax.c3],
                ["deltaValue", model.compareLabel || "증감"],
              ] as const
            ).map(([key, label], index) => (
              <SortHeader
                key={key}
                label={label}
                align={index < 2 ? "left" : "right"}
                initial={key === "team" ? "asc" : "desc"}
                direction={
                  activeSort.key === key ? activeSort.direction : undefined
                }
                disabled={key === "deltaValue" && !model.showDelta}
                onClick={() =>
                  setSort(
                    nextSort(activeSort, key, key === "team" ? "asc" : "desc"),
                  )
                }
              />
            ))}
            <span aria-hidden="true" />
          </div>

          {rows.map((r) => {
            const on = !hidden[r.key];
            return (
              <div
                key={r.key}
                className={`${COLS} relative cursor-pointer border-b border-border px-0.5 py-2.5 transition-colors hover:bg-hover`}
                style={{
                  // 꺼진 팀은 흐리게 — 표에서 사라지면 값을 비교할 수 없습니다
                  opacity: on ? 1 : 0.5,
                }}
              >
                <button
                  type="button"
                  aria-label={r.team}
                  aria-haspopup="dialog"
                  onClick={() => onOpenTeam(r.key)}
                  className="absolute inset-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                />
                <span className="pointer-events-none flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggleTeam(r.key)}
                    aria-label={`${r.team} 추이 선 표시`}
                    className="pointer-events-auto z-10 h-[14px] w-[14px] shrink-0 cursor-pointer"
                    style={{ accentColor: r.series }}
                  />
                  <span
                    className="min-w-0 overflow-hidden px-1 py-0.5 text-left text-[12px] text-ellipsis whitespace-nowrap"
                    style={{
                      fontWeight: r.unmapped ? 600 : 500,
                      color: r.unmapped ? "var(--orange-ink)" : "var(--text)",
                    }}
                  >
                    {r.team}
                  </span>
                </span>

                <div className="pointer-events-none flex min-w-0 items-center gap-2">
                  <ProgressBar
                    width={r.width}
                    color={r.fill}
                    height={9}
                    className="min-w-0 flex-1"
                  />
                  <span className="tnum flex min-w-[70px] shrink-0 flex-col items-end gap-1 text-right text-[12px] font-semibold">
                    {r.v1}
                    {r.status && (
                      <span className="pointer-events-auto z-10">
                        <MetricStatusBadge {...r.status} />
                      </span>
                    )}
                  </span>
                </div>

                <span className="pointer-events-none tnum flex min-w-0 flex-col items-end gap-1 text-right text-[12px] text-text2">
                  {r.v2}
                  {r.perUserStatus && (
                    <span className="pointer-events-auto z-10">
                      <MetricStatusBadge
                        label={r.perUserValue === null ? "확인 불가" : "일부"}
                        reason={r.perUserStatus.reason}
                      />
                    </span>
                  )}
                </span>
                <span className="pointer-events-none tnum flex min-w-0 flex-col items-end gap-1 text-right text-[12px] text-text2">
                  {r.v3}
                  {r.unitStatus && (
                    <span className="pointer-events-auto z-10">
                      <MetricStatusBadge
                        label={r.unitValue === null ? "확인 불가" : "일부"}
                        reason={r.unitStatus.reason}
                      />
                    </span>
                  )}
                </span>
                <span
                  title={r.deltaReason}
                  className="pointer-events-none tnum inline-flex justify-end text-right text-[12px] font-semibold whitespace-nowrap"
                  style={{ color: r.deltaColor }}
                >
                  {model.compareLabel &&
                  r.totalValue !== null &&
                  r.delta === "-" &&
                  r.deltaReason ? (
                    <span className="pointer-events-auto z-10">
                      <MetricStatusBadge
                        label="비교 불가"
                        reason={r.deltaReason}
                      />
                    </span>
                  ) : (
                    r.delta
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none flex items-center justify-center text-text3"
                >
                  ›
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
