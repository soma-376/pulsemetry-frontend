import type {
  PerformanceMetricKey,
  SummaryView,
} from "@/lib/metrics/performance";
import { PerformanceKpiButton } from "./PerformanceKpiButton";

const GROUP_LAYOUT = [
  "basis-full grow",
  "basis-[340px] grow-[2]",
  "basis-[340px] grow-[2]",
];

/** 생산성·지출·도입 효용성과 실패한 작업. 각 카드는 아래 추이 그래프의 지표를 고른다. */
export function PerformanceSummary({
  summary,
  meta,
  selected,
  onSelect,
}: {
  summary: SummaryView;
  meta: string;
  selected: PerformanceMetricKey;
  onSelect: (key: PerformanceMetricKey) => void;
}) {
  const total = summary.failureTotal;
  const totalSelected = selected === total.key;
  return (
    <section
      aria-labelledby="perf-summary-title"
      className="flex max-w-[1100px] flex-col gap-[18px] rounded-[10px] border border-border bg-card p-5"
    >
      <div>
        <h2
          id="perf-summary-title"
          className="inline text-[15px] font-semibold"
        >
          성과 요약
        </h2>
        <span className="ml-1.5 text-[11.5px] text-text3">{meta}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {summary.groups.map((group, index) => (
          <div
            key={group.title}
            className={`flex min-w-0 shrink flex-col gap-3.5 rounded-lg border border-border p-4 ${GROUP_LAYOUT[index]}`}
          >
            <h3
              className="flex items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: group.color }}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: group.color }}
              />
              {group.title}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
              {group.cards.map((kpi) => (
                <PerformanceKpiButton
                  key={kpi.key}
                  kpi={kpi}
                  selected={selected === kpi.key}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-text2">실패한 작업</h3>
          <button
            type="button"
            aria-pressed={totalSelected}
            onClick={() => onSelect(total.key)}
            className="tnum cursor-pointer rounded-md border px-2.5 py-1 text-[12px] text-text3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: totalSelected ? total.color : "var(--border)",
              background: totalSelected
                ? `color-mix(in srgb, ${total.color} 7%, var(--card))`
                : "transparent",
            }}
          >
            합계{" "}
            <b className="text-[16px] font-semibold text-text">
              {total.value}
              {total.unit}
            </b>
            {total.delta && (
              <>
                {" · "}
                <b
                  className="font-semibold"
                  style={{ color: total.deltaColor }}
                >
                  {total.delta}
                </b>
                {total.previous && ` · 이전 ${total.previous}`}
              </>
            )}
          </button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
          {summary.failures.map((kpi) => (
            <PerformanceKpiButton
              key={kpi.key}
              kpi={kpi}
              size="sm"
              selected={selected === kpi.key}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
      <p className="text-[11px] text-text3">
        예시 데이터 · 카드를 누르면 아래 그래프가 그 지표의 8주 추이로 바뀝니다
        · 릴리스 주기: 운영 배포 태그 사이 평균 간격 · 평균 사이클 비용: 완료
        티켓 1건에 귀속된 AI 환산 금액 · 낭비된 비용: 나중에 revert되거나
        hotfix로 고친 PR에 귀속된 AI 환산 금액 · PR 방치: 7일 넘게 리뷰·머지
        없이 열린 PR
      </p>
    </section>
  );
}
