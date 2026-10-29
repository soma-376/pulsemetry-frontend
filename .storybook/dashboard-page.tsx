import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { SetupWorker } from "msw/browser";
import { expect } from "storybook/test";
import { OrganizationProvider } from "@/lib/organization-store";
import { FiltersProvider } from "@/lib/filters";
import {
  clearBackendSession,
  exchangeLogin,
  getSessionState,
} from "@/lib/api/session";
import { overviewQueryOptions } from "@/lib/api/overview";
import { teamsOptions } from "@/lib/api/teams";
import { membersOptions } from "@/lib/api/members";
import { settingsOptions } from "@/lib/api/settings";
import { alertsOptions } from "@/lib/api/alerts";
import { DashboardHeaderProvider } from "@/components/layout/DashboardHeader";
import { OverviewContent } from "@/components/overview/OverviewContent";
import { TeamsContent } from "@/components/teams/TeamsContent";
import { MembersContent } from "@/components/members/MembersContent";
import { PerformanceContent } from "@/components/performance/PerformanceContent";
import { SecurityContent } from "@/components/security/SecurityContent";
import { SettingsContent } from "@/components/settings/SettingsContent";
import { COMPANY_A } from "@/mocks/company-a";
import { onboardingHandlers } from "./fixtures/onboarding";
import {
  dashboardHandlers,
  DASHBOARD_TODAY,
  STORY_ORG,
  type DashboardPage,
  type PageState,
} from "./fixtures/dashboard";

export type PageStoryArgs = { errorMode: "initial" | "refresh" };
const contents = {
  overview: OverviewContent,
  teams: TeamsContent,
  members: MembersContent,
  ops: PerformanceContent,
  security: SecurityContent,
  settings: SettingsContent,
};
const loadingMessages = {
  overview: "개요 데이터를",
  teams: "팀 분석을",
  members: "구성원을",
  ops: "성과를",
  security: "알림을",
  settings: "설정을",
};

async function loadLastSuccessfulResponse(
  client: QueryClient,
  page: DashboardPage,
) {
  const period = {
    startDate: "2026-09-07",
    endDate: DASHBOARD_TODAY,
    compare: "prev_week" as const,
  };
  switch (page) {
    case "overview":
      await client.fetchQuery(
        overviewQueryOptions({
          organizationId: STORY_ORG,
          ...period,
          timeZone: "Asia/Seoul",
        }),
      );
      break;
    case "teams":
      await client.fetchQuery(teamsOptions(STORY_ORG, period));
      break;
    case "members":
      await client.fetchQuery(membersOptions(STORY_ORG, period));
      break;
    case "settings":
      await client.fetchQuery(settingsOptions(STORY_ORG));
      break;
    case "ops":
      break;
    case "security":
      await client.fetchInfiniteQuery(
        alertsOptions(STORY_ORG, "unacknowledged", "security"),
      );
      break;
  }
}

function DashboardPagePreview({
  page,
  state,
  errorMode,
  worker,
}: PageStoryArgs & {
  page: DashboardPage;
  state: PageState;
  worker: Pick<SetupWorker, "resetHandlers">;
}) {
  const [ready, setReady] = useState<QueryClient | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  useEffect(() => {
    const client = new QueryClient();
    const response: { state: PageState } = { state: "normal" };
    let active = true;
    worker.resetHandlers(...dashboardHandlers(page, response));
    void (async () => {
      try {
        // 가짜 오류 UI를 얹지 않고 정상 HTTP 응답을 캐시한 뒤 실제 재조회를 실패시킨다.
        if (state === "error" && errorMode === "refresh") {
          await loadLastSuccessfulResponse(client, page);
          await client.invalidateQueries({ refetchType: "none" });
        }
        if (!active) return;
        response.state = state;
        setReady(client);
      } catch (error) {
        if (active)
          setSetupError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      active = false;
      client.clear();
    };
  }, [page, state, errorMode, worker]);
  if (setupError) return <p role="alert">스토리 준비 실패: {setupError}</p>;
  if (!ready) return null;
  const Content = contents[page];
  const today = page === "settings" ? COMPANY_A.asOf : DASHBOARD_TODAY;
  return (
    <OrganizationProvider>
      <QueryClientProvider client={ready}>
        <FiltersProvider todayIso={today}>
          <div className="@container min-h-screen bg-bg text-text">
            <DashboardHeaderProvider todayIso={today}>
              <main>
                <Content />
              </main>
            </DashboardHeaderProvider>
          </div>
        </FiltersProvider>
      </QueryClientProvider>
    </OrganizationProvider>
  );
}

export function dashboardPageMeta(page: DashboardPage): Meta<PageStoryArgs> {
  return {
    tags: ["!autodocs"],
    parameters: {
      layout: "fullscreen",
      nextjs: { navigation: { pathname: `/${page}` } },
    },
    args: { errorMode: "initial" },
    argTypes: {
      errorMode: {
        name: "에러 상황",
        description: "최초 조회 실패 또는 마지막 데이터를 유지하는 갱신 실패",
        options: ["initial", "refresh"],
        control: {
          type: "inline-radio",
          labels: { initial: "최초 조회 실패", refresh: "갱신 실패" },
        },
      },
    },
    async beforeEach({ msw }) {
      msw.use(...onboardingHandlers("teams"));
      await exchangeLogin(
        "storybook-code",
        "http://localhost/auth/callback",
        "v".repeat(43),
        STORY_ORG,
      );
      const ownSession = getSessionState();
      return () => {
        if (getSessionState() === ownSession) clearBackendSession();
      };
    },
    render: (args, context) => (
      <DashboardPagePreview
        key={`${context.id}:${args.errorMode}`}
        page={page}
        state={context.parameters.pageState ?? "normal"}
        {...args}
        worker={context.msw}
      />
    ),
    async play({ canvas, parameters, args }) {
      await expect(
        await canvas.findByRole("banner", { name: "공통 헤더" }),
      ).toBeVisible();
      const loading = `${loadingMessages[page]} 불러오는 중입니다…`;
      if (parameters.pageState === "loading") {
        await expect(await canvas.findByText(loading)).toBeInTheDocument();
        await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
        return;
      }
      if (parameters.pageState === "error" && args.errorMode === "initial") {
        await expect(
          await canvas.findByRole("alert", {}, { timeout: 10000 }),
        ).toBeVisible();
        await expect(canvas.queryByText(loading)).not.toBeInTheDocument();
        await expect(
          canvas.queryByRole("status", { name: "데이터 갱신 상태" }),
        ).not.toBeInTheDocument();
        return;
      }
      if (parameters.pageState === "error") {
        await expect(
          await canvas.findByRole(
            "status",
            { name: "데이터 갱신 상태" },
            { timeout: 10000 },
          ),
        ).toBeVisible();
      }
      if (page === "members")
        await expect(
          await canvas.findByRole("textbox", { name: "구성원 검색" }),
        ).toBeVisible();
      else if (page === "security")
        await expect(
          await canvas.findByRole("list", { name: "알림 목록" }),
        ).toBeVisible();
      else
        await expect(
          await canvas.findByRole("region", {
            name: {
              overview: "사용 환산액",
              teams: "팀별 사용량 비교",
              settings: "계약 벤더",
              ops: "성과 요약",
            }[page],
          }),
        ).toBeVisible();
      await expect(canvas.queryByText(loading)).not.toBeInTheDocument();
      await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    },
  };
}
export const normalStory: StoryObj<PageStoryArgs> = {
  name: "일반",
  parameters: { pageState: "normal" },
  argTypes: { errorMode: { table: { disable: true } } },
};
export const loadingStory: StoryObj<PageStoryArgs> = {
  name: "로딩",
  parameters: { pageState: "loading" },
  argTypes: { errorMode: { table: { disable: true } } },
};
export const errorStory: StoryObj<PageStoryArgs> = {
  name: "에러",
  parameters: { pageState: "error" },
};
