import { z } from "zod";

export type TrendBucket = "day" | "auto";
/** 공개 환경 변수는 빌드 시 고정된다. PROJ-315 정책 검증 전에는 활성화하지 않는다. */
export const configuredTrendBucket = (): TrendBucket =>
  process.env.NEXT_PUBLIC_AUTO_TREND_ENABLED === "true" ? "auto" : "day";

export const trendAggregationSchema = z.strictObject({
  mode: z.literal("auto"),
  policyVersion: z.literal("calendar-buckets-v2"),
  intervalSeconds: z.number().int().positive().nullable(),
  intervalMonths: z.literal(1).nullable(),
  valueMode: z.enum(["interval", "cumulative"]),
  rangeStart: z.iso.datetime({ offset: true }),
  rangeEnd: z.iso.datetime({ offset: true }),
  effectiveEnd: z.iso.datetime({ offset: true }),
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

/** 서버 계약의 날짜 경계만 검증한다. 사용값을 재집계하지 않는다(허브 ADR 0033). */
export function plannedTrendBuckets(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00+09:00`);
  const end = Date.parse(`${endDate}T00:00:00+09:00`) + 86_400_000;
  const days = (end - start) / 86_400_000;
  const seconds =
    days === 1
      ? 10800
      : days === 2
        ? 21600
        : days <= 6
          ? 43200
          : days <= 12
            ? 86400
            : days <= 24
              ? 172800
              : days <= 36
                ? 259200
                : days <= 84
                  ? 604800
                  : days <= 168
                    ? 1209600
                    : null;
  const [year, month, day] = startDate.split("-").map(Number);
  const starts: number[] = [];
  for (let i = 0; i < 12; i++) {
    // 원래 날짜에서 월을 더한다. 1월 31일 → 2월 말 → 3월 31일이다.
    const lastDay = new Date(Date.UTC(year, month + i, 0)).getUTCDate();
    const from =
      seconds === null
        ? Date.UTC(year, month - 1 + i, Math.min(day, lastDay)) - 9 * 3600_000
        : start + i * seconds * 1000;
    if (from >= end) break;
    starts.push(from);
  }
  return { start, end, days, seconds, starts };
}

export function validAutoTrend(
  meta: { startDate: string; endDate: string; dayCount: number },
  aggregation: TrendAggregation,
  valueMode: TrendAggregation["valueMode"],
  points?: AutoPoint[],
) {
  const plan = plannedTrendBuckets(meta.startDate, meta.endDate);
  const asOf = Date.parse(aggregation.asOf);
  const effectiveEnd = Math.max(plan.start, Math.min(plan.end, asOf));
  if (
    !Number.isFinite(asOf) ||
    meta.dayCount !== plan.days ||
    plan.days < 1 ||
    plan.days > 366 ||
    plan.starts.length < 6 ||
    plan.starts.length > 12 ||
    aggregation.policyVersion !== "calendar-buckets-v2" ||
    aggregation.valueMode !== valueMode ||
    aggregation.intervalSeconds !== plan.seconds ||
    aggregation.intervalMonths !== (plan.seconds === null ? 1 : null) ||
    Date.parse(aggregation.rangeStart) !== plan.start ||
    Date.parse(aggregation.rangeEnd) !== plan.end ||
    Date.parse(aggregation.effectiveEnd) !== effectiveEnd
  )
    return false;
  if (!points) return true;
  const visible = plan.starts.filter((start) => start < effectiveEnd);
  return (
    points.length === visible.length &&
    points.every((point, index) => {
      const plannedEnd = plan.starts[index + 1] ?? plan.end;
      return (
        Date.parse(point.bucketStart) === visible[index] &&
        Date.parse(point.bucketEnd) === Math.min(plannedEnd, effectiveEnd) &&
        point.temporalState ===
          (asOf < plannedEnd ? "in_progress" : "elapsed") &&
        [point.usageRows, point.pricedUsageRows, point.unpricedUsageRows].every(
          (v) => v !== null,
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
