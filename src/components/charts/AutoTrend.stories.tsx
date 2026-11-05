import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import example from "../../../docs/api/overview-response.example.json";
import { plannedTrendBuckets } from "@/lib/api/trend-aggregation";
import { overviewSchema } from "@/lib/api/overview";
import { presentOverview } from "@/lib/metrics/overview-presentation";
import { UsageValueCard } from "../overview/UsageValueCard";

function Example({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const data = overviewSchema.parse(example);
  const plan = plannedTrendBuckets(startDate, endDate);
  const iso = (time: number) => new Date(time).toISOString();
  Object.assign(data.meta, { startDate, endDate, dayCount: plan.days });
  data.meta.trendAggregation = {
    mode: "auto",
    policyVersion: "calendar-buckets-v2",
    valueMode: "interval",
    rangeStart: iso(plan.start),
    rangeEnd: iso(plan.end),
    effectiveEnd: iso(plan.end),
    asOf: iso(plan.end),
    intervalSeconds: plan.seconds,
    intervalMonths: plan.seconds === null ? 1 : null,
  };
  data.meta.collectionPolicy = {
    policyVersion: "proj-315-pending",
    asOf: iso(plan.end),
    status: "pending",
    annotations: [
      {
        scope: "period",
        rangeStart: iso(plan.start),
        rangeEnd: iso(plan.end),
        teamId: null,
        reasons: ["policy_integration_pending"],
        evidenceRefs: [],
      },
    ],
  };
  const value = <T,>(v: T) => ({
    value: v,
    status: "complete" as const,
    reasons: [],
  });
  data.trend = {
    bucket: "auto",
    points: plan.starts.map((start, i) => ({
      bucketStart: iso(start),
      bucketEnd: iso(plan.starts[i + 1] ?? plan.end),
      temporalState: "elapsed",
      usageRows: 1,
      pricedUsageRows: 1,
      unpricedUsageRows: 0,
      equivalentCostUsd: value(
        String([10, 18, 15, 30, 24, 38, 32, 45, 39, 50, 48, 60][i]),
      ),
      knownEquivalentCostUsd: value(
        String([10, 18, 15, 30, 24, 38, 32, 45, 39, 50, 48, 60][i]),
      ),
      totalTokens: value((i + 1) * 1000),
    })),
  };
  return (
    <div className="@container w-full max-w-[1000px] p-6">
      <UsageValueCard
        model={presentOverview(overviewSchema.parse(data), endDate)}
      />
    </div>
  );
}
const meta = {
  id: "charts-auto-trend",
  title: "Charts/자동 버킷 날짜",
  component: Example,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SameYear: Story = {
  name: "같은 해 · 08/08",
  args: { startDate: "2026-08-08", endDate: "2026-08-19" },
  async play({ canvas }) {
    await expect(canvas.getByText("08/08", { exact: true })).toBeVisible();
  },
};
export const CrossYear: Story = {
  name: "연도 변경 · 2025.12",
  args: { startDate: "2025-12-01", endDate: "2026-11-30" },
  async play({ canvas }) {
    await expect(canvas.getByText("2025.12", { exact: true })).toBeVisible();
  },
};
