import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { DashboardHeaderProvider } from "./DashboardHeader";
import { useDashboardPageRefresh } from "@/hooks/dashboard/use-dashboard-page-refresh";
import { FiltersProvider } from "@/lib/filters";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/Button";
import {
  clearBackendSession,
  exchangeLogin,
  getSessionState,
} from "@/lib/api/session";
import { COMPANY_A } from "@/mocks/company-a";
import { notificationHandlers } from "../../../.storybook/fixtures/alerts";
import { onboardingHandlers } from "../../../.storybook/fixtures/onboarding";

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <FiltersProvider todayIso={COMPANY_A.asOf}>{children}</FiltersProvider>
    </QueryClientProvider>
  );
}
function PageBody({ name }: { name: string }) {
  const [refreshes, setRefreshes] = useState(0);
  useDashboardPageRefresh(() => setRefreshes((value) => value + 1), false);
  return (
    <>
      <div className="mt-6">
        <PageHeader page={name === "설정" ? "settings" : "overview"} />
      </div>
      <p>
        {name} 새로고침 {refreshes}
      </p>
    </>
  );
}
function Pages() {
  const pathname = usePathname();
  const [page, setPage] = useState(pathname === "/settings" ? "설정" : "개요");
  return (
    <DashboardHeaderProvider todayIso={COMPANY_A.asOf}>
      <div className="p-6">
        <div className="flex gap-2">
          <Button onClick={() => setPage("개요")}>개요 보기</Button>
          <Button onClick={() => setPage("설정")}>설정 보기</Button>
        </div>
        <PageBody key={page} name={page} />
      </div>
    </DashboardHeaderProvider>
  );
}
const meta = {
  title: "Layout/DashboardHeader",
  component: Pages,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/overview" } },
  },
  decorators: [
    (Story, context) => (
      <Providers key={context.id}>
        <Story />
      </Providers>
    ),
  ],
  async beforeEach({ msw, parameters }) {
    let requests = 0;
    msw.use(
      ...notificationHandlers(parameters.notificationScenario),
      http.get(
        "*/api/v1/organizations/:org/ingest-status",
        async ({ params }) => {
          requests++;
          if (
            parameters.scenario === "loading" ||
            (parameters.scenario === "refreshing" && requests > 1)
          )
            await delay("infinite");
          if (parameters.scenario === "error" && requests <= 3)
            return HttpResponse.json(
              { error: { code: "unavailable" } },
              { status: 503 },
            );
          if (
            parameters.scenario === "refresh-error" &&
            requests > 1 &&
            requests <= 4
          )
            return HttpResponse.json(
              { error: { code: "unavailable" } },
              { status: 503 },
            );
          return HttpResponse.json({
            organizationId: params.org,
            status: parameters.scenario === "empty" ? "empty" : "unknown",
            reason: "source_not_available",
            asOf: "2026-09-29T00:00:00Z",
            lastReceivedAt:
              parameters.scenario === "empty" ? null : "2026-09-28T23:58:00Z",
          });
        },
      ),
      ...onboardingHandlers("teams"),
    );
    await exchangeLogin(
      "storybook-code",
      "http://localhost/auth/callback",
      "v".repeat(43),
      COMPANY_A.organization.organizationId,
    );
    const ownSession = getSessionState();
    return () => {
      if (getSessionState() === ownSession) clearBackendSession();
    };
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
export const Empty: Story = {
  name: "수신 이력 없음",
  parameters: { scenario: "empty" },
};
export const Loading: Story = {
  name: "로딩 중에도 헤더 높이 유지",
  parameters: { scenario: "loading" },
  async play({ canvas }) {
    await canvas.findByText("수집 상태 확인 중…");
    await expect(
      canvas.getByLabelText("공통 헤더").getBoundingClientRect().height,
    ).toBe(65);
  },
};
export const Retry: Story = {
  name: "조회 실패·재시도 후 높이 유지",
  parameters: { scenario: "error" },
  async play({ canvas, userEvent }) {
    const retry = await canvas.findByRole(
      "button",
      { name: "다시 조회" },
      { timeout: 10000 },
    );
    const bar = canvas.getByLabelText("공통 헤더");
    await expect(bar.getBoundingClientRect().height).toBe(65);
    await userEvent.click(retry);
    await canvas.findByText("수집 상태 확인 불가");
    await expect(bar.getBoundingClientRect().height).toBe(65);
  },
};
export const Refreshing: Story = {
  name: "재조회 중 기존 수집 현황 유지",
  parameters: { scenario: "refreshing" },
  async play({ canvas, userEvent }) {
    await canvas.findByText("수집 상태 확인 불가");
    await userEvent.click(canvas.getByRole("button", { name: "새로고침" }));
    const refreshing = await canvas.findByRole("button", { name: "조회 중…" });
    await expect(refreshing).toBeDisabled();
    await expect(refreshing).toHaveAttribute("aria-busy", "true");
    await expect(
      canvas.queryByLabelText("수집 상태 갱신 중"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("수집 상태 확인 불가")).toBeVisible();
  },
};
export const RefreshFailed: Story = {
  name: "갱신 실패·기존 현황과 본문 위치 유지",
  parameters: { scenario: "refresh-error" },
  async play({ canvas, userEvent }) {
    const status = await canvas.findByText("수집 상태 확인 불가");
    const heading = canvas.getByRole("heading", { name: "개요" });
    const top = heading.getBoundingClientRect().top;
    await userEvent.click(canvas.getByRole("button", { name: "새로고침" }));
    const notice = await canvas.findByRole(
      "status",
      { name: "데이터 갱신 상태" },
      { timeout: 10000 },
    );
    await expect(status).toBeVisible();
    await expect(heading.getBoundingClientRect().top).toBe(top);
    await userEvent.click(
      within(notice).getByRole("button", { name: "다시 조회" }),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("status", { name: "데이터 갱신 상태" }),
      ).not.toBeInTheDocument(),
    );
  },
};
export const PageChange: Story = {
  name: "본문 교체에도 공통 영역 유지",
  async play({ canvas, userEvent }) {
    await canvas.findByText("수집 상태 확인 불가");
    const bar = canvas.getByLabelText("조직 수집 현황");
    await userEvent.click(canvas.getByRole("button", { name: "설정 보기" }));
    await waitFor(() =>
      expect(canvas.getByRole("heading", { name: "설정" })).toBeVisible(),
    );
    await expect(canvas.getByLabelText("조직 수집 현황")).toBe(bar);
    await userEvent.click(canvas.getByRole("button", { name: "새로고침" }));
    await canvas.findByText("설정 새로고침 1");
  },
};

export const Notifications: Story = {
  name: "알림 종 · 3건",
  parameters: { notificationScenario: "unread" },
};
export const AcknowledgeNotification: Story = {
  name: "알림 확인 → 배지 3건에서 2건",
  parameters: { notificationScenario: "unread" },
  async play({ canvas, userEvent }) {
    const bell = await canvas.findByRole("button", {
      name: "알림, 미확인 3건",
    });
    await userEvent.click(bell);
    const drawer = await canvas.findByRole("dialog", { name: "알림" });
    await userEvent.click(
      (
        await within(
          within(drawer).getByRole("list", { name: "알림 목록" }),
        ).findAllByRole("button", { name: /확인$/ })
      )[0],
    );
    await waitFor(() =>
      expect(bell).toHaveAttribute("aria-label", "알림, 미확인 2건"),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(bell).toHaveFocus());
  },
};
export const NoNotifications: Story = {
  name: "알림 0건",
  parameters: { notificationScenario: "empty" },
};
export const ManyNotifications: Story = {
  name: "알림 99+",
  parameters: { notificationScenario: "many" },
};
export const NotificationError: Story = {
  name: "알림 건수 조회 실패",
  parameters: { notificationScenario: "error" },
};
export const NotificationLoading: Story = {
  name: "알림 건수 조회 중",
  parameters: { notificationScenario: "loading" },
};
export const ExpiredContract: Story = {
  name: "만료된 계약 · 계약 갱신 링크",
  parameters: { notificationScenario: "expired" },
  async play({ canvas, userEvent }) {
    await userEvent.click(
      await canvas.findByRole("button", { name: "알림, 미확인 1건" }),
    );
    const drawer = within(await canvas.findByRole("dialog", { name: "알림" }));
    await drawer.findByText("만료된 계약이 있습니다");
    await expect(
      drawer.getByRole("link", { name: "계약 갱신" }),
    ).toHaveAttribute("href", "/settings?vendor=vendor%2Fexpired%3Ftest%3D1");
    await expect(
      drawer.queryByText("미확인 알림이 없습니다"),
    ).not.toBeInTheDocument();
    await userEvent.click(drawer.getByRole("button", { name: "확인함" }));
    await expect(
      drawer.queryByRole("link", { name: "계약 갱신" }),
    ).not.toBeInTheDocument();
    await userEvent.click(drawer.getByRole("button", { name: "전체" }));
    await drawer.findByRole("link", { name: "계약 갱신" });
  },
};
export const ContractNotificationError: Story = {
  name: "계약 만료 조회 실패 · 다른 알림 유지",
  parameters: { notificationScenario: "contract-error" },
  async play({ canvas, userEvent }) {
    await userEvent.click(
      await canvas.findByRole(
        "button",
        {
          name: "알림, 미확인 건수 조회 실패. 열어서 다시 시도하세요",
        },
        { timeout: 10000 },
      ),
    );
    const drawer = within(await canvas.findByRole("dialog", { name: "알림" }));
    await drawer.findByText("계약 만료 여부를 확인하지 못했습니다");
    await expect(drawer.getByRole("list", { name: "알림 목록" })).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "다시 조회" }),
    ).toBeEnabled();
  },
};
export const ContractNotificationLoading: Story = {
  name: "계약 만료 조회 중 · 다른 알림 유지",
  parameters: { notificationScenario: "contract-loading" },
};
export const ManagementPage: Story = {
  name: "관리 페이지 · 기간 선택 없음",
  parameters: { nextjs: { navigation: { pathname: "/settings" } } },
  async play({ canvas }) {
    await canvas.findByRole("button", { name: "알림, 미확인 0건" });
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
  },
};

export const PopulatedNotifications: Story = {
  name: "알림 100건 · 미등록 제품·비용 급증",
  parameters: { notificationScenario: "populated" },
  async play({ canvas, userEvent }) {
    await userEvent.click(
      await canvas.findByRole("button", { name: "알림, 미확인 60건" }),
    );
    const drawer = within(await canvas.findByRole("dialog", { name: "알림" }));
    const list = () => within(drawer.getByRole("list", { name: "알림 목록" }));
    await waitFor(() =>
      expect(list().getAllByRole("listitem")).toHaveLength(20),
    );
    await userEvent.click(drawer.getByRole("button", { name: "더 보기" }));
    await waitFor(() =>
      expect(list().getAllByRole("listitem")).toHaveLength(40),
    );
    await userEvent.click(drawer.getByRole("button", { name: "확인함" }));
    await drawer.findByText("40건", { exact: true });
    await userEvent.click(drawer.getByRole("button", { name: "전체" }));
    await drawer.findByText("100건", { exact: true });
  },
};
