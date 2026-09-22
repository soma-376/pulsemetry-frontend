import { LineAreaChart } from "@/components/charts/LineAreaChart";
import { ChartInspector } from "@/components/charts/ChartInspector";
import { Widget } from "@/components/ui/Card";
import { arrow, pct } from "@/lib/format";
import type { OverviewModel } from "@/lib/metrics/overview";

/**
 * W1.2 환산가치 vs 지출.
 *
 * 좌석제 계약이 물을 수 있는 유일한 질문 — "이 좌석들이 종량제보다 나은가" — 에
 * 한 화면으로 답합니다. 두 선 사이의 밴드 면적이 곧 이득(또는 손해)입니다.
 */
export function ValueVsSpendCard({ model }: { model: OverviewModel }) {
  const { chart, seat, verdict, observation, defs, compareLabel } = model;

  // 지출선의 세로 위치 — 눈금선과 라벨이 같은 값을 써야 어긋나지 않습니다
  const spendTop = `${(100 - ((chart.spend[0] ?? 0) / chart.yMax) * 100).toFixed(1)}%`;

  return (
    <Widget
      id="w12"
      label="환산가치 vs 지출"
      title="환산가치 vs 지출"
      note="일별 · 포인터 또는 방향키로 탐색"
      def={defs.w12}
      className="col-span-3 @max-[1023px]:col-span-full"
      action={
        <div className="flex gap-3 text-[11px] text-text2">
          <span className="flex items-center gap-[5px]">
            <span className="h-0 w-3.5 border-t-2 border-dashed border-text3" />
            지출(좌석료)
          </span>
          <span className="flex items-center gap-[5px]">
            <span className="h-0 w-3.5 border-t-2 border-solid border-purple" />
            환산가치
          </span>
        </div>
      }
    >
      {/* 판정 — 차트를 읽기 전에 결론부터 말합니다 */}
      <div
        className="mb-3.5 flex items-start gap-2.5 rounded-md border px-3 py-2.5"
        style={{ background: verdict.bg, borderColor: verdict.border }}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className="text-[12.5px] font-semibold"
            style={{ color: verdict.color }}
          >
            {verdict.title}
          </span>
          <span className="pretty text-[11.5px] text-text2">
            {verdict.detail}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[38px_minmax(0,1fr)_138px] gap-2 @max-[720px]:grid-cols-[32px_minmax(0,1fr)]">
        {/* y축 */}
        <div className="tnum flex h-[260px] flex-col justify-between text-right text-[11px] text-text3">
          <span>{chart.topLabel}</span>
          <span>{chart.midLabel}</span>
          <span>$0</span>
        </div>

        {/* 플롯 */}
        <div className="relative h-[260px]">
          <div className="absolute top-0 right-0 left-0 border-t border-border" />
          <div
            className="absolute right-0 left-0 border-t border-dashed border-text3 opacity-70"
            style={{ top: spendTop }}
          />
          <span
            className="tnum absolute right-1 -translate-y-1/2 rounded-[3px] bg-card px-1 text-[10.5px] font-semibold text-text2"
            style={{ top: spendTop }}
          >
            지출 {chart.spendLabel}
          </span>
          <div className="absolute top-1/2 right-0 left-0 border-t border-border" />
          <div className="absolute right-0 bottom-0 left-0 border-t border-border" />

          <LineAreaChart
            domain={{ max: chart.yMax }}
            observedFrom={observation.firstObservedIndex}
            band={{
              from: chart.spend,
              to: chart.cost,
              color: seat.above ? "var(--green)" : "var(--red)",
            }}
            series={[{ values: chart.cost, color: "var(--purple)", width: 2 }]}
          />
          <ChartInspector chart={chart} />
        </div>

        {/* 결론 수치 */}
        <div className="flex flex-col justify-center gap-4 border-l border-border pl-3.5 @max-[720px]:hidden">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[11.5px] text-text2">좌석 효율</span>
            <span
              className="tnum text-[26px] leading-[1.1] font-semibold tracking-[-0.02em]"
              style={{ color: verdict.color }}
            >
              {model.kpis[2].value}
            </span>
            {model.showDelta && <span
              className="tnum text-[12px] font-semibold"
              style={{
                color: seat.effGrowth >= 0 ? "var(--green)" : "var(--red)",
              }}
            >
              {arrow(seat.effGrowth >= 0)} {pct(seat.effGrowth)}{" "}
              <span className="font-normal text-text3">{compareLabel}</span>
            </span>}
          </div>
        </div>

        {/* x축 — 플롯 열에만 맞춥니다 */}
        <div />
        <div className="tnum relative h-5 text-[11px] text-text3">
          {chart.ticks.map((t, i) => (i === 0 || i === chart.ticks.length - 1 || i % Math.max(1, Math.ceil(chart.ticks.length / 5)) === 0) && (
            <span
              key={t.label}
              className="absolute whitespace-nowrap"
              style={{
                left: `${chart.ticks.length === 1 ? 50 : i / (chart.ticks.length - 1) * 100}%`,
                transform: i === 0 && chart.ticks.length > 1 ? undefined : i === chart.ticks.length - 1 && chart.ticks.length > 1 ? "translateX(-100%)" : "translateX(-50%)",
                color: t.preObserved ? "var(--border)" : "var(--text3)",
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className="@max-[720px]:hidden" />
      </div>

      {observation.hasGap && (
        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-text2">
          <span
            aria-hidden="true"
            className="h-2.5 w-4 shrink-0 border border-border"
            style={{
              background:
                "repeating-linear-gradient(45deg,var(--border) 0 2px,transparent 2px 5px)",
            }}
          />
          <span className="pretty">{observation.chartNote}</span>
        </div>
      )}
    </Widget>
  );
}
