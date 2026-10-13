import { overviewSchema } from "@/lib/api/overview";
import { teamsResponseSchema } from "@/lib/api/teams";
import { presentOverview } from "@/lib/metrics/overview-presentation";
import { presentTeams, type AxisKey } from "@/lib/metrics/teams-presentation";
import { UsageValueCard } from "../overview/UsageValueCard";
import { TeamAxisPanel } from "../teams/TeamAxisPanel";
import overviewExample from "../../../docs/api/overview-response.example.json";
import teamsExample from "../../../docs/api/teams-response.example.json";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";
import { trendFeedback, trendBadge } from "@/lib/metrics/trend-feedback";
import { LineAreaChart } from "./LineAreaChart";
import { TrendFeedback } from "./TrendFeedback";
import { MetricStatusBadge } from "../overview/KpiCard";

const dates = Array.from(
  { length: 7 },
  (_, i) => `2026-10-${String(i + 5).padStart(2, "0")}`,
);
const source = { id: "platform", name: "플랫폼팀", color: "var(--purple)" };
const inputs = {
  zero: [
    {
      ...source,
      values: [10, 20, 0, 0, 30, 40, 0],
      observations: dates.map(() => "complete" as const),
    },
  ],
  unknown: [
    {
      ...source,
      values: [10, 20, null, null, 30, null, null],
      observations: dates.map((_, i) =>
        [2, 3, 5, 6].includes(i)
          ? ("unobserved" as const)
          : ("complete" as const),
      ),
    },
  ],
  cumulative: [
    {
      ...source,
      values: [10, 20, 30, null, null, null, null],
      observations: dates.map((_, i) =>
        i >= 3 ? ("unobserved" as const) : ("complete" as const),
      ),
    },
    {
      ...source,
      id: "design",
      name: "디자인팀",
      color: "var(--blue)",
      values: [5, 10, 10, 15, 25, null, null],
      observations: dates.map((_, i) =>
        i >= 5 ? ("unobserved" as const) : ("complete" as const),
      ),
    },
  ],
};

function Example({
  scenario,
  today = dates[6],
}: {
  scenario: keyof typeof inputs;
  today?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const model = trendFeedback(
    dates,
    inputs[scenario].filter((_, i) => !hidden || i === 1),
    { today, cumulative: scenario === "cumulative" },
  );
  const badge = trendBadge(model);
  return (
    <section className="relative w-full max-w-[800px] rounded-lg border border-border bg-card p-6 text-text">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h2>사용 추이</h2>
        {badge && <MetricStatusBadge {...badge} />}
      </div>
      <div className="relative mx-1 h-[240px] border-b border-border">
        <LineAreaChart domain={{ max: 50 }} series={model.series} />
        <TrendFeedback
          model={model}
          max={50}
          format={(v) => (v === null ? "-" : `$${v}`)}
          label="날짜별 사용 추이"
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-text3">
        <span>10/5</span>
        <span>10/11</span>
      </div>
      {scenario === "cumulative" && (
        <button
          className="mt-4 rounded border border-border p-2 text-xs"
          onClick={() => setHidden(!hidden)}
        >
          플랫폼팀 {hidden ? "표시" : "숨기기"}
        </button>
      )}
    </section>
  );
}

const meta = {
  title: "Charts/사용 추이 상태",
  component: Example,
  parameters: { layout: "padded" },
  args: { scenario: "unknown" },
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConfirmedZero: Story = {
  name: "휴일 · 확인된 0",
  args: { scenario: "zero" },
  async play({ canvas }) {
    const slider = canvas.getByRole("slider");
    await userEvent.click(slider);
    await userEvent.keyboard("{Home}{ArrowRight}{ArrowRight}");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("확인된 0"),
    );
  },
};
export const UnknownUsage: Story = {
  name: "휴일 · 사용 여부 확인 불가",
  async play({ canvas }) {
    const slider = canvas.getByRole("slider");
    await userEvent.click(slider);
    await userEvent.keyboard("{Home}{ArrowRight}{ArrowRight}");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("미사용과 수집 공백을 구분할 수 없습니다"),
    );
  },
};
export const TeamCutoffs: Story = {
  name: "팀별 종료일",
  args: { scenario: "cumulative" },
};
export const Future: Story = {
  name: "미래 구간",
  args: { scenario: "cumulative", today: dates[4] },
  async play({ canvas }) {
    const slider = canvas.getByRole("slider");
    await userEvent.click(slider);
    await userEvent.keyboard("{End}");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("아직 도래하지 않은 날짜"),
    );
  },
};

function DashboardExamples() {
  const [axis, setAxis] = useState<AxisKey>("cost");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const overview = overviewSchema.parse(overviewExample);
  overview.trend!.points = dates.map((date, i) => ({
    date,
    observation: i >= 4 ? "unobserved" : "complete",
    equivalentCostUsd: {
      value: i >= 4 ? null : String([10, 20, 0, 30][i]),
      status: i >= 4 ? "unavailable" : "complete",
      reasons: [],
    },
    totalTokens: {
      value: i >= 4 ? null : [100, 200, 0, 300][i],
      status: i >= 4 ? "unavailable" : "complete",
      reasons: [],
    },
  }));
  const teams = teamsResponseSchema.parse(teamsExample);
  teams.teams.items = teams.teams.items.slice(0, 2).map((team, teamIndex) => ({
    ...team,
    trend: dates.map((date, i) => ({
      date,
      observation: i >= teamIndex + 3 ? "unobserved" : "complete",
      equivalentCostUsd:
        i >= teamIndex + 3 ? null : String(i === 2 ? 0 : 10 + teamIndex * 5),
      totalTokens: i >= teamIndex + 3 ? null : i === 2 ? 0 : 100,
      cumulativeSessionCount: i >= teamIndex + 3 ? null : i >= 2 ? 2 : i + 1,
      status:
        i >= teamIndex + 3 ? ("unavailable" as const) : ("complete" as const),
      reasons: i >= teamIndex + 3 ? ["no_data"] : [],
    })),
  }));
  for (const value of Object.values(teams.unassigned.metrics)) {
    value.value = null;
    value.status = "unavailable";
    value.reasons = ["no_data"];
  }
  const teamModel = presentTeams(
    { ...teams, teams: teams.teams.items },
    dates[6],
  );
  return (
    <div className="@container grid w-full max-w-[1000px] gap-6 text-text">
      <UsageValueCard model={presentOverview(overview, dates[6])} />
      <TeamAxisPanel
        model={teamModel}
        axis={axis}
        onAxisChange={setAxis}
        hidden={hidden}
        onToggleTeam={(key) =>
          setHidden((current) => ({ ...current, [key]: !current[key] }))
        }
        onOpenTeam={() => {}}
      />
    </div>
  );
}
export const DashboardCards: Story = {
  name: "개요·팀 분석 적용",
  render: () => <DashboardExamples />,
};
