"use client";

import { useState } from "react";
import {
  trendGaps,
  type TrendFeedback as Feedback,
} from "@/lib/metrics/trend-feedback";
import { xAt, yAt } from "./scale";

/** 개요·팀 분석이 공유하는 누락 구간, 끝점, 키보드/포인터 상세. */
export function TrendFeedback({
  model,
  max,
  format,
  label,
}: {
  model: Feedback;
  max: number;
  format: (value: number | null) => string;
  label: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const count = model.dates.length;
  if (!count || !model.series.length) return null;
  const index = Math.min(selected ?? 0, count - 1);
  const x = xAt(index, count);
  const description = [
    model.dates[index],
    ...model.series.map(
      (s) =>
        `${s.name} ${format(s.values[index])}. ${s.notes[index]} ${s.extras?.[index] ?? ""}`,
    ),
  ].join(" · ");
  return (
    <>
      {trendGaps(model).map((gap) => {
        const left = count === 1 ? 0 : Math.max(0, xAt(gap.start - 0.5, count));
        const right =
          count === 1 ? 100 : Math.min(100, xAt(gap.end + 0.5, count));
        return (
          <div
            key={gap.start}
            aria-hidden="true"
            data-trend-gap={gap.label}
            className="pointer-events-none absolute inset-y-0 overflow-hidden border-x border-dashed border-border bg-gray-tint/50"
            style={{ left: `${left}%`, width: `${right - left}%` }}
          >
            {right - left >= 22 && (
              <span className="block p-2 text-center text-[10px] leading-4 break-keep text-text3">
                {gap.label}
              </span>
            )}
          </div>
        );
      })}
      {model.series.map((s) => {
        const last = s.values.findLastIndex((v) => v !== null);
        return s.values.map((value, i) =>
          value !== null && (i === last || s.values[i + 1] === null) ? (
            <span
              key={`${s.id}-${i}`}
              role="img"
              aria-label={`${s.name} ${i === last ? "마지막 표시" : "구간 끝"} ${model.dates[i]} ${format(value)}`}
              className="pointer-events-none absolute z-[1] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
              style={{
                left: `${xAt(i, count)}%`,
                top: `${yAt(value, { max })}%`,
                backgroundColor: s.color,
              }}
            />
          ) : null,
        );
      })}
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={index + 1}
        aria-valuetext={description}
        onFocus={() => setSelected((v) => v ?? 0)}
        onBlur={() => setSelected(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setSelected(
            Math.max(
              0,
              Math.min(
                count - 1,
                Math.round(
                  ((event.clientX - rect.left) / rect.width) * (count - 1),
                ),
              ),
            ),
          );
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          const rect = event.currentTarget.getBoundingClientRect();
          setSelected(
            Math.max(
              0,
              Math.min(
                count - 1,
                Math.round(
                  ((event.clientX - rect.left) / rect.width) * (count - 1),
                ),
              ),
            ),
          );
        }}
        onPointerLeave={(event) => {
          if (document.activeElement !== event.currentTarget) setSelected(null);
        }}
        onKeyDown={(event) => {
          const offset =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? -1
                : 0;
          if (offset) {
            event.preventDefault();
            setSelected(Math.max(0, Math.min(count - 1, index + offset)));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setSelected(event.key === "Home" ? 0 : count - 1);
          } else if (event.key === "Escape") setSelected(null);
        }}
        className="absolute inset-0 z-10 cursor-crosshair rounded-sm outline-offset-4"
      >
        {selected !== null && (
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            <div
              className="absolute inset-y-0 border-l border-dashed border-text3"
              style={{ left: `${x}%` }}
            />
            {model.series.map((s) =>
              s.values[index] !== null ? (
                <span
                  key={s.id}
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
                  style={{
                    left: `${x}%`,
                    top: `${yAt(s.values[index]!, { max })}%`,
                    backgroundColor: s.color,
                  }}
                />
              ) : null,
            )}
            <div
              onPointerMove={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className="pointer-events-auto absolute top-2 max-h-[min(420px,60vh)] w-[320px] max-w-full overflow-y-auto rounded-lg border border-border bg-card p-3 text-[11px] shadow-lg [overflow-wrap:anywhere]"
              style={{
                left: x <= 50 ? 0 : undefined,
                right: x > 50 ? 0 : undefined,
              }}
            >
              <p className="mb-2 font-semibold">{model.dates[index]}</p>
              {model.series.map((s) => (
                <div key={s.id} className="mb-2 last:mb-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0" style={{ color: s.color }}>
                      {s.name}
                    </span>
                    <span className="tnum shrink-0 font-semibold">
                      {format(s.values[index])}
                    </span>
                  </div>
                  {s.extras?.[index] && (
                    <p className="mt-1 text-text2">{s.extras[index]}</p>
                  )}
                  {s.notes[index] && (
                    <p className="mt-1 leading-4 text-text3">
                      {s.notes[index]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
