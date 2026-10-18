"use client";

import { usd } from "@/lib/format";
import type { OverviewChart } from "@/lib/metrics/overview-presentation";
import { trendFeedback } from "@/lib/metrics/trend-feedback";
import { knownMoneyText } from "@/lib/metrics/known-usage";
import { TrendFeedback } from "./TrendFeedback";

export function ChartInspector({ chart }: { chart: OverviewChart }) {
  const feedback =
    chart.feedback ??
    trendFeedback(
      chart.ticks.map((tick) => tick.date),
      chart.series.map((series) => ({
        ...series,
        reasons: chart.ticks.map((tick) => tick.status ?? ""),
        extras: chart.ticks.map((tick) => `토큰 ${tick.tokens}`),
      })),
    );
  return (
    <TrendFeedback
      model={feedback}
      max={chart.yMax}
      format={(value) =>
        value === null
          ? "-"
          : chart.knownCostNote
            ? knownMoneyText(String(value))
            : usd(value)
      }
      label="날짜별 사용 환산액. 좌우 방향키로 날짜를 이동하세요"
    />
  );
}
