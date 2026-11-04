import { z } from "zod";

export type TrendBucket = "day" | "auto";
/** 공개 환경 변수는 빌드 시 고정된다. PROJ-315 정책 검증 전에는 활성화하지 않는다. */
export const configuredTrendBucket = (): TrendBucket =>
  process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED === "true" ? "auto" : "day";

export const TREND_INTERVALS = [
  3600, 10800, 21600, 43200, 86400, 259200, 604800,
] as const;
export const trendAggregationSchema = z.strictObject({
  mode: z.literal("auto"),
  intervalSeconds: z.number().int().positive(),
  valueMode: z.enum(["interval", "cumulative"]),
  rangeStart: z.iso.datetime({ offset: true }),
  rangeEnd: z.iso.datetime({ offset: true }),
  asOf: z.iso.datetime({ offset: true }),
});
export type TrendAggregation = z.infer<typeof trendAggregationSchema>;
export const collectionPolicySchema = z.strictObject({
  policyVersion: z.literal("proj-315-pending"),
  asOf: z.iso.datetime({ offset: true }),
  status: z.literal("pending"),
  annotations: z
    .array(
      z.strictObject({
        scope: z.literal("period"),
        rangeStart: z.iso.datetime({ offset: true }),
        rangeEnd: z.iso.datetime({ offset: true }),
        teamId: z.null(),
        reasons: z.tuple([z.literal("policy_integration_pending")]),
        evidenceRefs: z.array(z.string()).length(0),
      }),
    )
    .length(1),
});
export type CollectionPolicy = z.infer<typeof collectionPolicySchema>;
export function validCollectionPolicy(
  policy: CollectionPolicy | undefined,
  aggregation: TrendAggregation,
) {
  const annotation = policy?.annotations[0];
  return (
    !!policy &&
    !!annotation &&
    Date.parse(policy.asOf) === Date.parse(aggregation.asOf) &&
    Date.parse(annotation.rangeStart) === Date.parse(aggregation.rangeStart) &&
    Date.parse(annotation.rangeEnd) === Date.parse(aggregation.rangeEnd)
  );
}
export const autoPointFields = {
  bucketStart: z.iso.datetime({ offset: true }),
  bucketEnd: z.iso.datetime({ offset: true }),
  temporalState: z.enum(["elapsed", "in_progress", "upcoming"]),
  usageRows: z.number().int().nonnegative().nullable(),
  pricedUsageRows: z.number().int().nonnegative().nullable(),
  unpricedUsageRows: z.number().int().nonnegative().nullable(),
};
export type AutoPoint = {
  bucketStart: string;
  bucketEnd: string;
  temporalState: "elapsed" | "in_progress" | "upcoming";
  usageRows: number | null;
  pricedUsageRows: number | null;
  unpricedUsageRows: number | null;
};

/** 요청 시작 KST 자정에 정렬한 실제 간격·연속성·시간 상태를 검증한다. */
export function validAutoTrend(
  meta: { startDate: string; endDate: string; dayCount: number },
  aggregation: TrendAggregation,
  valueMode: TrendAggregation["valueMode"],
  points?: AutoPoint[],
) {
  const start = Date.parse(`${meta.startDate}T00:00:00+09:00`);
  const end = Date.parse(`${meta.endDate}T00:00:00+09:00`) + 86_400_000;
  const duration = end - start;
  const interval = TREND_INTERVALS.find(
    (seconds) => Math.ceil(duration / (seconds * 1000)) <= 60,
  );
  if (
    meta.dayCount !== duration / 86_400_000 ||
    meta.dayCount < 1 ||
    meta.dayCount > 366 ||
    aggregation.valueMode !== valueMode ||
    aggregation.intervalSeconds !== interval ||
    Date.parse(aggregation.rangeStart) !== start ||
    Date.parse(aggregation.rangeEnd) !== end
  )
    return false;
  if (!points) return true;
  const step = aggregation.intervalSeconds * 1000;
  const asOf = Date.parse(aggregation.asOf);
  return (
    points.length === Math.ceil(duration / step) &&
    points.length <= 60 &&
    points.every((point, index) => {
      const from = start + index * step,
        to = Math.min(from + step, end);
      const temporalState =
        to <= asOf ? "elapsed" : from <= asOf ? "in_progress" : "upcoming";
      const counts = [
        point.usageRows,
        point.pricedUsageRows,
        point.unpricedUsageRows,
      ];
      return (
        Date.parse(point.bucketStart) === from &&
        Date.parse(point.bucketEnd) === to &&
        point.temporalState === temporalState &&
        counts.every((value) =>
          temporalState === "upcoming" ? value === null : value !== null,
        )
      );
    })
  );
}

export const sameAggregation = (
  a: TrendAggregation | undefined,
  b: TrendAggregation | undefined,
) => JSON.stringify(a) === JSON.stringify(b);

export function upcomingValuesValid(
  point: AutoPoint,
  values: { value: unknown; status: string; reasons: string[] }[],
) {
  return (
    point.temporalState !== "upcoming" ||
    values.every(
      (value) =>
        value.value === null &&
        value.status === "unavailable" &&
        value.reasons.length === 1 &&
        value.reasons[0] === "upcoming",
    )
  );
}
