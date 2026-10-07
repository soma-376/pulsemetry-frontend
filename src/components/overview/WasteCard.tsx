import { ProgressBar } from "@/components/charts/ProgressBar";
import { Widget } from "@/components/ui/Card";
import type { OverviewModel } from "@/lib/metrics/overview";

/**
 * W1.6 사용 낭비 — 좌석을 쓰면서 새는 비용.
 * 벤더 청구서에는 구분되어 나타나지 않으므로 여기서만 보입니다.
 */
export function WasteCard({ model }: { model: OverviewModel }) {
  const { waste, compareLabel } = model;

  return (
    <Widget
      id="w16"
      label="사용 낭비"
      title="사용 낭비"
      def={waste.def}
      className="col-span-2 @max-[1023px]:col-span-full"
      action={
        <span className="tnum text-[11px] whitespace-nowrap text-text3">
          {waste.totalNote}
        </span>
      }
    >
      <div className="mb-4 flex items-baseline gap-1.5">
        <span className="tnum text-[26px] leading-none font-semibold tracking-[-0.02em] text-orange-ink">
          {waste.total}
        </span>
        <span className="text-[12px] text-text3">/ 월</span>
      </div>

      <div className="flex flex-col gap-3.5">
        {waste.rows.map((w) => (
          <div key={w.title} className="flex min-w-0 flex-col gap-[5px]">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <span className="min-w-0 flex-1 overflow-hidden text-[12.5px] font-semibold text-ellipsis whitespace-nowrap">
                {w.title}
              </span>
              <span className="tnum text-[13px] font-semibold whitespace-nowrap">
                {w.cost}
              </span>
              <span className="tnum w-[42px] text-right text-[11px] whitespace-nowrap text-text3">
                {w.rate}
              </span>
            </div>

            <ProgressBar
              width={w.barWidth}
              color="var(--orange-ink)"
              markerAt={w.prevWidth}
            />

            <div className="flex items-baseline gap-1.5">
              <span
                className="tnum text-[11px] font-semibold whitespace-nowrap"
                style={{ color: w.deltaColor }}
              >
                {w.delta}
              </span>
              <span className="text-[11px] whitespace-nowrap text-text3">
                {compareLabel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}
