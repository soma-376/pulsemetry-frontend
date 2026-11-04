import type { AutoPoint, TrendAggregation } from "../api/trend-aggregation";

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
    end = Date.parse(aggregation.rangeEnd);
  const position = (timestamp: number) =>
    ((timestamp - start) / (end - start)) * 100;
  return {
    intervalLabel: intervalLabel(aggregation.intervalSeconds),
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
      return aggregation.intervalSeconds < 86400
        ? `${time.slice(5, 10)} ${time.slice(11)}`
        : time.slice(5, 10);
    }),
  };
}
export type TrendTimeline = ReturnType<typeof trendTimeline>;
