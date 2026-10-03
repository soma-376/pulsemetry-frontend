import { useEffect, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrganizationProvider } from "@/lib/organization-store";
import { clearBackendSession, exchangeLogin } from "@/lib/api/session";
import { onboardingHandlers, type OnboardingScenario } from "../../../.storybook/fixtures/onboarding";
import { COMPANY_A } from "@/mocks/company-a";
import { OnboardingFlow } from "./OnboardingFlow";

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return <OrganizationProvider><QueryClientProvider client={client}>{children}</QueryClientProvider></OrganizationProvider>;
}

const meta = {
  title: "Pages/Onboarding",
  component: OnboardingFlow,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/onboarding" } } },
  decorators: [(Story, context) => <Providers key={context.id}><Story /></Providers>],
  async beforeEach({ msw, parameters }) {
    msw.use(...onboardingHandlers((parameters.scenario ?? "collection") as OnboardingScenario));
    await exchangeLogin("storybook-code", "http://localhost/auth/callback", "v".repeat(43), COMPANY_A.organization.organizationId);
    return () => clearBackendSession();
  },
} satisfies Meta<typeof OnboardingFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collection: Story = { name: "1. 수집 정책" };
export const Vendors: Story = { name: "2. 벤더·플랜 등록", parameters: { scenario: "vendors" } };
export const Teams: Story = { name: "3. 팀 구성·건너뛰기", parameters: { scenario: "teams" } };
export const Loading: Story = { name: "설정 조회 중", parameters: { scenario: "loading" } };
export const LoadError: Story = { name: "조회 실패·재시도", parameters: { scenario: "load-error" } };
export const SaveError: Story = {
  name: "벤더 등록 실패·재시도",
  parameters: { scenario: "save-error" },
  async play({ canvas, userEvent }) {
    const product = await canvas.findByRole("combobox", { name: "제품" });
    await waitFor(() => expect(product).toBeEnabled());
    await userEvent.selectOptions(product, "claude_team");
    await userEvent.type(canvas.getByRole("textbox", { name: "표시 이름" }), "개발팀 Claude");
    await userEvent.click(canvas.getByRole("button", { name: "벤더 등록" }));
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("서버에 연결하지 못했습니다"), { timeout: 15000 });
    await expect(canvas.getByRole("textbox", { name: "표시 이름" })).toHaveValue("개발팀 Claude");
  },
};
