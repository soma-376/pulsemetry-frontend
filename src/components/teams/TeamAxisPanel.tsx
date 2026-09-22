"use client";

import { LineAreaChart } from "@/components/charts/LineAreaChart";
import { ProgressBar } from "@/components/charts/ProgressBar";
import type { AxisKey, TeamsModel } from "@/lib/metrics/teams";

const AXIS_TABS: { key: AxisKey; label: string }[] = [
  { key: "cost", label: "비용" },
  { key: "token", label: "토큰" },
  { key: "session", label: "세션" },
];

const COLS =
  "grid grid-cols-[minmax(132px,1fr)_minmax(0,2fr)_minmax(74px,1fr)_minmax(74px,1fr)_minmax(66px,0.9fr)_24px] items-center gap-2.5";

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
}: {
  model: TeamsModel;
  axis: AxisKey;
  onAxisChange: (next: AxisKey) => void;
  hidden: Record<string, boolean>;
  onToggleTeam: (team: string) => void;
  onOpenTeam: (team: string) => void;
}) {
  const ax = model.axes[axis];
  const shown = model.trend[axis].filter((s) => !hidden[s.team]);
  const isEmpty = shown.length === 0;
  const max =
    Math.max(...shown.flatMap((s) => s.values), 1) * 1.08;

  return (
    <section aria-label="팀별 사용량 비교" className="flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-6">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
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
                onClick={() => onAxisChange(t.key)}
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

        <div className="flex items-baseline gap-2">
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
        </div>
      </div>

      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">팀별 누적 추이</span>
      </div>

      <div className="mb-[18px] grid grid-cols-[56px_minmax(0,1fr)] gap-2">
        <div className="tnum flex h-[196px] flex-col justify-between text-right text-[11px] text-text3">
          <span>{isEmpty ? "" : ax.format(max)}</span>
          <span>{isEmpty ? "" : ax.format(max / 2)}</span>
          <span>{isEmpty ? "" : "0"}</span>
        </div>

        <div className="relative h-[196px]">
          <div className="absolute top-0 right-0 left-0 border-t border-border" />
          <div className="absolute top-1/2 right-0 left-0 border-t border-border" />
          <div className="absolute right-0 bottom-0 left-0 border-t border-text3" />

          {!isEmpty && (
            <LineAreaChart
              domain={{ max }}
              series={shown.map((s) => ({ values: s.values, color: s.color }))}
            />
          )}

          {isEmpty && (
            <div className="pretty absolute inset-0 flex items-center justify-center text-center text-[12px] text-text3">
              표에서 팀을 하나 이상 선택하세요
            </div>
          )}
        </div>

        <div />
        <div className="tnum flex justify-between text-[11px] text-text3">
          {model.dayLabels
            .filter((_, i) => i % 2 === 0 || i === model.dayLabels.length - 1)
            .map((label) => (
              <span key={label}>{label}</span>
            ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-text2">{ax.title}</span>
        <span className="text-[11px] text-text3">체크박스로 추이 표시 · 행을 눌러 상세 보기</span>
      </div>

      <div className={`${COLS} border-b border-border px-0.5 pb-2 text-[11px] text-text3`}>
        <span>팀</span>
        <span>{ax.c1}</span>
        <span className="text-right">{ax.c2}</span>
        <span className="text-right">{ax.c3}</span>
        <span className="text-right">{model.compareLabel || "증감"}</span>
        <span aria-hidden="true" />
      </div>

      {ax.rows.map((r) => {
        const on = !hidden[r.team];
        return (
        <div
          key={r.team}
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
            onClick={() => onOpenTeam(r.team)}
            className="absolute inset-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          />
          <span className="pointer-events-none flex min-w-0 items-center gap-2">
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggleTeam(r.team)}
              aria-label={`${r.team} 추이 선 표시`}
              className="pointer-events-auto relative z-10 h-[14px] w-[14px] shrink-0 cursor-pointer"
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
            <span className="tnum min-w-[70px] shrink-0 text-right text-[12px] font-semibold whitespace-nowrap">
              {r.v1}
            </span>
          </div>

          <span className="pointer-events-none tnum text-right text-[12px] text-text2">{r.v2}</span>
          <span className="pointer-events-none tnum text-right text-[12px] text-text2">{r.v3}</span>
          <span
            className="pointer-events-none tnum text-right text-[12px] font-semibold whitespace-nowrap"
            style={{ color: r.deltaColor }}
          >
            {r.delta}
          </span>
          <span aria-hidden="true" className="pointer-events-none flex items-center justify-center text-text3">›</span>
        </div>
        );
      })}
    </section>
  );
}
