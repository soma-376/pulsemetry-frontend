import type { AutoPoint, TrendAggregation } from "../api/trend-aggregation";

export const trendDateLabel = (date: string, crossesYear: boolean) =>
  crossesYear
    ? date.slice(0, 7).replace("-", ".")
    : date.slice(5, 10).replace("-", "/");

export const intervalLabel = (seconds: number) =>
  seconds < 86400 ? `${seconds / 3600}시간` : `${seconds / 86400}일`;
const kst = (timestamp: string) =>
  new Date(Date.parse(timestamp) + 9 * 3600_000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
export const temporalLabel = (state: AutoPoint["temporalState"]) =>
  state === "in_progress"
    ? "집계 중"
    : state === "upcoming"
      ? "미도래"
      : "집계 완료";

export function trendTimeline(
  aggregation: TrendAggregation,
  points: AutoPoint[],
) {
  const start = Date.parse(aggregation.rangeStart),
    end = Date.parse(aggregation.effectiveEnd);
  const crossesYear =
    kst(aggregation.rangeStart).slice(0, 4) !==
    kst(new Date(Date.parse(aggregation.rangeEnd) - 1).toISOString()).slice(
      0,
      4,
    );
  const position = (timestamp: number) =>
    end > start ? ((timestamp - start) / (end - start)) * 100 : 0;
  return {
    intervalLabel:
      aggregation.intervalMonths === 1
        ? "1개월"
        : intervalLabel(aggregation.intervalSeconds!),
    asOf: aggregation.asOf,
    positions: points.map((point) =>
      position(
        aggregation.valueMode === "interval"
          ? Date.parse(point.bucketStart)
          : point.temporalState === "in_progress"
            ? Math.min(
                Date.parse(point.bucketEnd),
                Date.parse(aggregation.asOf),
              )
            : Date.parse(point.bucketEnd),
      ),
    ),
    bounds: points.map(
      (point) =>
        [
          position(Date.parse(point.bucketStart)),
          position(Date.parse(point.bucketEnd)),
        ] as [number, number],
    ),
    states: points.map((point) => point.temporalState),
    labels: points.map(
      (point) =>
        `${kst(point.bucketStart)} ~ ${kst(point.bucketEnd)} KST (종료 미포함) · ${temporalLabel(point.temporalState)}`,
    ),
    ticks: points.map((point) => {
      const time = kst(
        aggregation.valueMode === "interval"
          ? point.bucketStart
          : point.temporalState === "in_progress"
            ? aggregation.asOf
            : point.bucketEnd,
      );
      return trendDateLabel(time, crossesYear);
    }),
  };
}
export type TrendTimeline = ReturnType<typeof trendTimeline>;
