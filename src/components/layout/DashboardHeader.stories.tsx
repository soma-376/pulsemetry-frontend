import { useEffect, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { DashboardHeaderProvider, useDashboardPageRefresh } from "./DashboardHeader";
import { FiltersProvider } from "@/lib/filters";
import { Button } from "@/components/ui/Button";
import { clearBackendSession, exchangeLogin } from "@/lib/api/session";
import { COMPANY_A } from "@/mocks/company-a";
import { onboardingHandlers } from "../../../.storybook/fixtures/onboarding";

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}><FiltersProvider todayIso={COMPANY_A.asOf}>{children}</FiltersProvider></QueryClientProvider>;
}
function PageBody({ name }: { name: string }) {
  const [refreshes, setRefreshes] = useState(0);
  useDashboardPageRefresh(() => setRefreshes(value => value + 1), false);
  return <><h1 className="mt-4">{name}</h1><p>{name} 새로고침 {refreshes}</p></>;
}
function Pages() {
  const [page, setPage] = useState("개요");
  return <DashboardHeaderProvider todayIso={COMPANY_A.asOf}>
    <div className="p-6"><div className="flex gap-2">
      <Button onClick={() => setPage("개요")}>개요 보기</Button>
      <Button onClick={() => setPage("설정")}>설정 보기</Button>
    </div><PageBody key={page} name={page} /></div>
  </DashboardHeaderProvider>;
}
const meta = {
  title: "Layout/DashboardHeader", component: Pages,
  parameters: { layout: "fullscreen" },
  decorators: [(Story, context) => <Providers key={context.id}><Story /></Providers>],
  async beforeEach({ msw, parameters }) {
    let requests = 0;
    msw.use(http.get("*/api/v1/organizations/:org/ingest-status", async ({ params }) => {
      requests++;
      if (parameters.scenario === "loading" || (parameters.scenario === "refreshing" && requests > 1)) await delay("infinite");
      if (parameters.scenario === "error" && requests <= 3) return HttpResponse.json({ error: { code: "unavailable" } }, { status: 503 });
      return HttpResponse.json({ organizationId: params.org, status: parameters.scenario === "empty" ? "empty" : "unknown",
        reason: "source_not_available", asOf: "2026-09-29T00:00:00Z", lastReceivedAt: parameters.scenario === "empty" ? null : "2026-09-28T23:58:00Z" });
    }), ...onboardingHandlers("teams"));
    await exchangeLogin("storybook-code", "http://localhost/auth/callback", "v".repeat(43), COMPANY_A.organization.organizationId);
    return () => clearBackendSession();
  },
} satisfies Meta<typeof Pages>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unknown: Story = {
  name: "수신 이력 있음·정상 여부 판단 불가",
  async play({ canvas }) {
    await canvas.findByText("수집 상태 확인 불가");
    await expect(canvas.queryByText("수집 정상")).not.toBeInTheDocument();
  },
};
export const Empty: Story = { name: "수신 이력 없음", parameters: { scenario: "empty" } };
export const Loading: Story = {
  name: "로딩 중에도 헤더 높이 유지", parameters: { scenario: "loading" },
  async play({ canvas }) {
    await canvas.findByText("수집 상태 확인 중…");
    await expect(canvas.getByLabelText("조직 수집 현황").getBoundingClientRect().height).toBe(40);
  },
};
export const Retry: Story = {
  name: "조회 실패·재시도 후 높이 유지", parameters: { scenario: "error" },
  async play({ canvas, userEvent }) {
    const retry = await canvas.findByRole("button", { name: "다시 조회" }, { timeout: 10000 });
    const bar = canvas.getByLabelText("조직 수집 현황");
    await expect(bar.getBoundingClientRect().height).toBe(40);
    await userEvent.click(retry);
    await canvas.findByText("수집 상태 확인 불가");
    await expect(bar.getBoundingClientRect().height).toBe(40);
  },
};
export const Refreshing: Story = {
  name: "재조회 중 기존 수집 현황 유지", parameters: { scenario: "refreshing" },
  async play({ canvas, userEvent }) {
    await canvas.findByText("수집 상태 확인 불가");
    await userEvent.click(canvas.getByRole("button", { name: "새로고침" }));
    const refreshing = await canvas.findByRole("button", { name: "조회 중…" });
    await expect(refreshing).toBeDisabled();
    await expect(refreshing).toHaveAttribute("aria-busy", "true");
    await expect(canvas.queryByLabelText("수집 상태 갱신 중")).not.toBeInTheDocument();
    await expect(canvas.getByText("수집 상태 확인 불가")).toBeVisible();
  },
};
export const PageChange: Story = {
  name: "본문 교체에도 공통 영역 유지",
  async play({ canvas, userEvent }) {
    await canvas.findByText("수집 상태 확인 불가");
    const bar = canvas.getByLabelText("조직 수집 현황");
    await userEvent.click(canvas.getByRole("button", { name: "설정 보기" }));
    await waitFor(() => expect(canvas.getByRole("heading", { name: "설정" })).toBeVisible());
    await expect(canvas.getByLabelText("조직 수집 현황")).toBe(bar);
    await userEvent.click(canvas.getByRole("button", { name: "새로고침" }));
    await canvas.findByText("설정 새로고침 1");
  },
};
