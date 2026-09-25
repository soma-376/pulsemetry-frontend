"use client";

import { usd } from "@/lib/format";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { xAt, yAt } from "./scale";
import type { OverviewModel } from "@/lib/metrics/overview";

export function ChartInspector({ chart }: { chart: OverviewModel["chart"] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const index = selected ?? 0;
  const tick = chart.ticks[index];
  if (!tick) return null;
  const x = xAt(index, chart.ticks.length);
  const y = yAt(chart.cost[index], { max: chart.yMax });
  const single = chart.series.length === 1 ? chart.series[0] : null;
  const description = `${tick.date}, ${single?.name ?? "전체"} 환산가치 ${tick.cost}, 토큰 ${tick.tokens}, ${(single ? [] : chart.series).map((series) => `${series.name} ${usd(series.values[index])}`).join(", ")}`;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="날짜별 환산가치. 좌우 방향키로 날짜를 이동하세요"
      aria-valuemin={1}
      aria-valuemax={chart.ticks.length}
      aria-valuenow={index + 1}
      aria-valuetext={description}
      onFocus={() => setSelected((value) => value ?? 0)}
      onBlur={() => setSelected(null)}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setSelected(Math.max(0, Math.min(chart.ticks.length - 1, Math.round((event.clientX - rect.left) / rect.width * (chart.ticks.length - 1)))));
      }}
      onPointerDown={(event) => {
        event.currentTarget.focus();
        const rect = event.currentTarget.getBoundingClientRect();
        setSelected(Math.max(0, Math.min(chart.ticks.length - 1, Math.round((event.clientX - rect.left) / rect.width * (chart.ticks.length - 1)))));
      }}
      onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) setSelected(null); }}
      onKeyDown={(event) => {
        const offset = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
        if (offset) { event.preventDefault(); setSelected(Math.max(0, Math.min(chart.ticks.length - 1, index + offset))); }
        if (event.key === "Home") { event.preventDefault(); setSelected(0); }
        if (event.key === "End") { event.preventDefault(); setSelected(chart.ticks.length - 1); }
        if (event.key === "Escape") setSelected(null);
      }}
      className="absolute inset-0 z-10 cursor-crosshair rounded-sm"
    >
      <AnimatePresence>
        {selected !== null && (
          <motion.div key="inspection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute inset-y-0 border-l border-dashed border-text3" style={{ left: `${x}%` }} />
            <div className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-text3 shadow-sm" style={{ left: `${x}%`, top: `${y}%`, backgroundColor: single?.color }} />
            <div className="absolute top-2 w-[220px] max-w-full rounded-lg border border-border bg-card p-3 text-[11px] shadow-lg" style={{ left: x < 35 ? 0 : x > 65 ? undefined : "50%", right: x > 65 ? 0 : undefined, transform: x >= 35 && x <= 65 ? "translateX(-50%)" : undefined }}>
              <p className="mb-2 font-semibold">{tick.date}</p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
                <dt className="text-text3">{single ? `${single.name} 환산가치` : "환산가치"}</dt><dd className="tnum text-right font-medium text-purple">{tick.cost}</dd>
                {!single && chart.series.map((series) => <div key={series.id} className="contents"><dt style={{ color: series.color }}>{series.name}</dt><dd className="tnum text-right">{usd(series.values[index])}</dd></div>)}
                <dt className="text-text3">토큰</dt><dd className="tnum text-right">{tick.tokens}</dd>
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
