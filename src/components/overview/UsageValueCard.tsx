import { LineAreaChart } from "@/components/charts/LineAreaChart";
import { ChartInspector } from "@/components/charts/ChartInspector";
import { Widget } from "@/components/ui/Card";
import type { OverviewModel } from "@/lib/metrics/overview";

export function UsageValueCard({ model }: { model: OverviewModel }) {
  const { chart, observation, defs } = model;
  return <Widget id="w12" label="사용 환산액 추이" title="사용 환산액 추이" note="일별 · 포인터 또는 방향키로 탐색" def={defs.w12} className="col-span-3 @max-[1023px]:col-span-full">
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text2">
      {chart.series.length > 1 && <span className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-text3" />전체</span>}
      {chart.series.map((series) => <span key={series.id} className="flex items-center gap-2"><span className="h-0.5 w-4" style={{ background: series.color }} />{series.name}</span>)}
    </div>
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2">
      <div className="tnum flex h-[260px] flex-col justify-between text-right text-[11px] text-text3"><span>{chart.topLabel}</span><span>{chart.midLabel}</span><span>$0</span></div>
      <div className="relative h-[260px]">
        <div className="absolute inset-x-0 top-0 border-t border-border" />
        <div className="absolute inset-x-0 top-1/2 border-t border-border" />
        <div className="absolute inset-x-0 bottom-0 border-t border-border" />
        <LineAreaChart domain={{ max: chart.yMax }} observedFrom={observation.firstObservedIndex} series={[...(chart.series.length > 1 ? [{ values: chart.cost, color: "var(--text3)", width: 1, dash: "4 3" }] : []), ...chart.series.map((series) => ({ ...series, width: 2 }))]} />
        <ChartInspector chart={chart} />
      </div>
      <div />
      <div className="tnum relative h-5 text-[11px] text-text3">{chart.ticks.map((tick, index) => (index === 0 || index === chart.ticks.length - 1 || index % Math.max(1, Math.ceil(chart.ticks.length / 5)) === 0) && <span key={tick.date} className="absolute whitespace-nowrap" style={{ left: `${chart.ticks.length === 1 ? 50 : index / (chart.ticks.length - 1) * 100}%`, transform: index === 0 && chart.ticks.length > 1 ? undefined : index === chart.ticks.length - 1 && chart.ticks.length > 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{tick.label}</span>)}</div>
    </div>
    {observation.hasGap && <p className="mt-3 text-[11px] leading-5 text-text2">{observation.chartNote}</p>}
  </Widget>;
}
