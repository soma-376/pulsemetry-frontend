import { StackedBar } from "@/components/charts/StackedBar";
import type { AxisKey, TeamsModel } from "@/lib/metrics/teams";

/**
 * 팀별 모델 믹스.
 *
 * 왼쪽 표가 "얼마나 썼나"라면 이쪽은 "무엇으로 썼나"입니다.
 * 기둥 높이는 선택한 축의 실제 값이라 크기와 구성을 한 번에 읽습니다 —
 * 100% 로 정규화하면 구성비만 남아서, 조금 쓰는 팀과 많이 쓰는 팀이 같은 높이가 됩니다.
 * 기둥 순서는 선택한 축을 따라가므로 왼쪽 표와 같은 줄에서 읽힙니다.
 */
export function TeamModelMixCard({
  model,
  axis,
}: {
  model: TeamsModel;
  axis: AxisKey;
}) {
  const { yTop, yMid, columns } = model.mix(axis);

  return (
    <section
      aria-label="팀별 모델 믹스"
      className="col-span-3 flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-4 @max-[1100px]:col-span-full"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <span className="min-w-0 text-[12px] font-semibold">팀별 모델 믹스</span>
        <div className="flex flex-wrap gap-2.5">
          {model.legend.map((l) => (
            <span
              key={l.key}
              className="flex items-center gap-[5px] text-[11px] whitespace-nowrap text-text2"
            >
              <span
                className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
                style={{ background: l.color }}
              />
              {l.short}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
        {/* y축 — 기둥 위 총액 라벨이 들어갈 20px 을 비워두고 시작합니다 */}
        <div className="tnum relative h-[226px] text-[11px] text-text3">
          <span className="absolute top-5 right-0 -translate-y-1/2 whitespace-nowrap">
            {yTop}
          </span>
          <span className="absolute top-[123px] right-0 -translate-y-1/2 whitespace-nowrap">
            {yMid}
          </span>
          <span className="absolute top-[226px] right-0 -translate-y-1/2">0</span>
        </div>

        <div className="flex h-[226px] items-end gap-2.5 border-b border-l border-border px-1 pt-5">
          {columns.map((c) => (
            <div
              key={c.team}
              className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span
                className="relative flex w-full max-w-[56px] flex-col"
                style={{ height: c.height }}
              >
                <span className="tnum absolute right-0 bottom-full left-0 pb-1 text-center text-[10.5px] whitespace-nowrap text-text2">
                  {c.totalText}
                </span>
                <StackedBar segments={c.segments} vertical />
              </span>
            </div>
          ))}
        </div>

        <div />
        <div className="flex gap-2.5 px-1 pt-1.5">
          {columns.map((c) => (
            <div
              key={c.team}
              className="flex min-w-0 flex-1 flex-col items-center gap-px"
            >
              <span
                className="max-w-full overflow-hidden text-[11px] font-medium text-ellipsis whitespace-nowrap"
                style={{ color: c.unmapped ? "var(--orange-ink)" : "var(--text)" }}
              >
                {c.team}
              </span>
              <span className="max-w-full overflow-hidden text-[10px] text-ellipsis whitespace-nowrap text-text3">
                {c.topText}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
