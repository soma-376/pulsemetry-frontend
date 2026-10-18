import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { FiltersProvider } from "@/lib/filters";
import { overviewSchema } from "@/lib/api/overview";
import example from "../../../docs/api/overview-response.example.json";
import { OverviewData } from "./OverviewData";

const data = overviewSchema.parse(example);
const meta = {
  id: "pages-overview-details",
  title: "Pages/개요/세부 사례",
  component: OverviewData,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/overview" } },
  },
  decorators: [
    (Story) => (
      <FiltersProvider>
        <main className="@container min-h-screen bg-bg">
          <Story />
        </main>
      </FiltersProvider>
    ),
  ],
  args: { data },
} satisfies Meta<typeof OverviewData>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {
  name: "기간 비교 · KPI 5개",
  async play({ canvas }) {
    for (const name of [
      "사용자 수",
      "사용 환산액",
      "세션 수",
      "사용자당 환산액",
      "총 토큰 수",
    ]) {
      await expect(canvas.getByRole("region", { name })).toBeVisible();
    }
    await expect(
      canvas.queryByRole("region", { name: "계약·좌석 현황" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("region", { name: "사용자당 환산액" }),
    ).toHaveTextContent("12.5%");
  },
};
const partial = structuredClone(data);
partial.meta.currentCoverage = { status: "partial", observedDays: 4 };
partial.meta.dataState = "partial";
if (partial.summary)
  for (const metric of Object.values(partial.summary)) {
    if (typeof metric !== "object" || !metric) continue;
    metric.status = "partial";
    metric.reasons = ["current_period_incomplete"];
    if ("comparison" in metric)
      metric.comparison = {
        status: "unavailable",
        reasons: ["current_period_incomplete"],
        previousValue: null,
        absoluteChange: null,
        percentChange: null,
        change: null,
      };
  }
export const UnavailableComparison: Story = {
  name: "관측 부족 · 비교 불가",
  args: { data: partial },
  async play({ canvas }) {
    const card = within(canvas.getByRole("region", { name: "사용 환산액" }));
    await expect(card.getByText("일부 관측", { exact: true })).toBeVisible();
    await expect(card.getByText("비교 불가", { exact: true })).toBeVisible();
  },
};
const noUsers = structuredClone(data);
if (noUsers.summary) {
  noUsers.summary.activeUsers.value = 0;
  noUsers.summary.equivalentCostPerUserUsd = {
    value: null,
    status: "unavailable",
    reasons: ["zero_denominator"],
    comparison: {
      status: "unavailable",
      reasons: ["zero_denominator"],
      previousValue: null,
      absoluteChange: null,
      percentChange: null,
      change: null,
    },
  };
}
export const NoUsers: Story = {
  name: "관측 인원 0명 · 사용자당 계산 불가",
  args: { data: noUsers },
};
export const PartialFailure: Story = {
  name: "추이 조회 실패 · 정상 영역 유지",
  args: {
    data: {
      ...data,
      trend: null,
      errors: [
        { section: "trend", code: "source_unavailable", retryable: true },
      ],
    },
  },
  async play({ canvas }) {
    await expect(
      canvas.getByText("사용 추이를 불러오지 못했습니다"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("region", { name: "사용 환산액" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /다시/ }),
    ).not.toBeInTheDocument();
  },
};
export const NoData: Story = {
  name: "선택 기간 데이터 없음",
  args: {
    data: {
      ...data,
      meta: {
        ...data.meta,
        dataState: "no_data",
        currentCoverage: { status: "none", observedDays: 0 },
      },
      summary: null,
      trend: null,
      modelMix: null,
      teamUsage: null,
      errors: [],
    },
  },
};
