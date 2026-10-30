import type { TrendView } from "@/lib/metrics/performance-trend";

/** 선택한 지표의 8주 추이. 팀 범위면 전체 평균을 점선으로 함께 그린다. */
export function PerformanceTrendChart({ trend }: { trend: TrendView }) {
  return (
    <section
      aria-labelledby="perf-trend-title"
      className="flex max-w-[1100px] flex-col gap-3.5 rounded-[10px] border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-[1px]"
            style={{ background: trend.color }}
          />
          <h2
            id="perf-trend-title"
            className="inline text-[15px] font-semibold"
          >
            {trend.title}
          </h2>
          <span className="ml-1.5 text-[11.5px] text-text3">{trend.meta}</span>
        </div>
        <div className="flex flex-wrap gap-4 text-[12px] text-text2">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[3px] w-[18px] rounded-sm"
              style={{ background: trend.color }}
            />
            {trend.scopeName}
          </span>
          {trend.hasAverage && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-[18px] border-t-2 border-dashed border-text3"
              />
              전체 평균
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
        <div className="tnum flex h-[240px] flex-col items-end justify-between text-[11px] text-text3">
          {trend.yLabels.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div
          role="img"
          aria-label={trend.aria}
          className="relative h-[240px] border-t border-b border-t-border border-b-text3"
        >
          <div className="absolute inset-x-0 top-1/2 border-t border-border" />
          <div className="absolute top-[-1px] bottom-0 left-1/2 border-l border-dashed border-text3" />
          <span className="absolute top-1 right-[calc(50%+6px)] text-[10.5px] text-text3">
            ← 비교 기간
          </span>
          <span className="absolute top-1 left-[calc(50%+6px)] text-[10.5px] text-text3">
            선택 기간 →
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            {trend.averageLine && (
              <polyline
                points={trend.averageLine}
                fill="none"
                stroke="var(--text3)"
                strokeWidth={2}
                strokeDasharray="6 5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <polyline
              points={trend.line}
              fill="none"
              stroke={trend.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {trend.points.map((point, index) => (
            <div
              key={index}
              aria-hidden="true"
              className="absolute"
              style={{ left: `${point.x}%`, bottom: `${point.y}%` }}
            >
              <span
                className="absolute h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full"
                style={{
                  background: trend.color,
                  boxShadow: "0 0 0 2px var(--card)",
                }}
              />
              <span className="tnum absolute -translate-x-1/2 -translate-y-[calc(100%+6px)] text-[10.5px] font-semibold whitespace-nowrap text-text2">
                {point.label}
              </span>
            </div>
          ))}
        </div>
        <span />
        <div aria-hidden="true" className="tnum flex text-[11px] text-text3">
          {trend.weeks.map((week) => (
            <span key={week.label} className="flex-1 text-center">
              {week.label}
            </span>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {trend.weeks.map((week) => (
          <li key={week.label}>
            {week.label}주 {trend.scopeName} {week.value}
            {week.average && `, 전체 평균 ${week.average}`}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
        {trend.stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-0.5 rounded-md bg-sub px-3 py-2.5"
          >
            <span className="text-[11.5px] text-text2">{stat.label}</span>
            <span
              className="tnum text-[20px] leading-[1.15] font-semibold"
              style={{ color: stat.valueColor }}
            >
              {stat.value}
            </span>
            {(stat.emphasis || stat.detail) && (
              <span className="tnum text-[11px] text-text3">
                {stat.emphasis && (
                  <b
                    className="font-semibold"
                    style={{ color: stat.emphasisColor }}
                  >
                    {stat.emphasis}
                  </b>
                )}
                {stat.emphasis && stat.detail && " · "}
                {stat.detail}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text3">{trend.note}</p>
    </section>
  );
}
