import { useEffect, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FiltersProvider } from "@/lib/filters";
import { clearBackendSession, seedLogin } from "@/lib/api/session";
import { COMPANY_A } from "@/mocks/company-a";
import { settingsHandlers, type SettingsScenario } from "../../../.storybook/fixtures/settings";
import { DashboardHeaderProvider } from "@/components/layout/DashboardHeader";
import { SettingsContent } from "./SettingsContent";

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}><FiltersProvider todayIso={COMPANY_A.asOf}><DashboardHeaderProvider todayIso={COMPANY_A.asOf}>{children}</DashboardHeaderProvider></FiltersProvider></QueryClientProvider>;
}
const meta = {
  title: "Pages/Settings", component: SettingsContent, tags: ["!autodocs"],
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/settings" } } },
  decorators: [(Story, context) => <Providers key={context.id}><Story /></Providers>],
  async beforeEach({ msw, parameters }) {
    msw.use(...settingsHandlers((parameters.scenario ?? "default") as SettingsScenario));
    await seedLogin(COMPANY_A.members.find(member => member.role === "admin")!.email);
    return () => clearBackendSession();
  },
} satisfies Meta<typeof SettingsContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RegisteredProducts: Story = { name: "등록 제품·계약 일부 미입력" };
export const Empty: Story = { name: "등록 제품 없음", parameters: { scenario: "empty" } };
export const Loading: Story = {
  name: "최초 조회·설정 본문 전체 로딩", parameters: { scenario: "loading" },
  async play({ canvas }) {
    await canvas.findByText("설정을 불러오는 중입니다…");
    await expect(canvas.queryByRole("region", { name: "벤더 연동" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "수집 정책" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "알림 규칙" })).not.toBeInTheDocument();
    await expect(canvas.queryByText("유효 계약 기준 월 합계")).not.toBeInTheDocument();
  },
};
export const LoadingThenLoaded: Story = {
  name: "최초 조회 완료·실제 빈 값 표시", parameters: { scenario: "slow-response" },
  async play({ canvas }) {
    await canvas.findByText("설정을 불러오는 중입니다…");
    await canvas.findByRole("region", { name: "벤더 연동" }, { timeout: 10000 });
    await expect(canvas.queryByText("설정을 불러오는 중입니다…")).not.toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "수집 정책" })).toBeVisible();
    await expect(canvas.getByRole("region", { name: "알림 규칙" })).toBeVisible();
    await expect(canvas.getByText("유효 계약 기준 월 합계")).toBeVisible();
  },
};
export const Refreshing: Story = {
  name: "새로고침·기존 화면 유지", parameters: { scenario: "refreshing" },
  async play({ canvas, userEvent }) {
    const vendors = await canvas.findByRole("region", { name: "벤더 연동" });
    const policy = canvas.getByRole("region", { name: "수집 정책" });
    await userEvent.click(canvas.getByRole("button", { name: "새로고침" }));
    await canvas.findByText("설정을 새로고침하는 중입니다…");
    await expect(vendors).toBeVisible(); await expect(policy).toBeVisible();
    await expect(canvas.getByText("연동 벤더 3")).toBeVisible();
    await expect(canvas.queryByText("설정을 불러오는 중입니다…")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "조회 중…" })).toBeDisabled();
  },
};
export const VendorLoading: Story = {
  name: "벤더 상세·선택한 행만 로딩", parameters: { scenario: "detail-loading" },
  async play({ canvas, canvasElement, userEvent }) {
    const row = await canvas.findByRole("button", { name: /Claude.*계약 설정 열기/ });
    await userEvent.click(row);
    await waitFor(() => expect(row).toHaveAttribute("aria-busy", "true"));
    await expect(canvas.getByRole("button", { name: /ChatGPT.*계약 설정 열기/ })).not.toHaveAttribute("aria-busy");
    await expect(canvas.getByRole("region", { name: "수집 정책" })).toBeVisible();
    await expect(canvas.queryByText("설정을 불러오는 중입니다…")).not.toBeInTheDocument();
    await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).not.toBeInTheDocument();
    const other = canvas.getByRole("button", { name: /ChatGPT.*계약 설정 열기/ });
    await userEvent.click(other);
    await waitFor(() => expect(other).toHaveAttribute("aria-busy", "true"));
    await expect(row).not.toHaveAttribute("aria-busy");
  },
};
export const VendorLoadError: Story = {
  name: "벤더 상세·조회 실패 후 재시도", parameters: { scenario: "detail-error" },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(await canvas.findByRole("button", { name: /Claude.*계약 설정 열기/ }));
    const retry = await canvas.findByRole("button", { name: "상세 다시 조회" }, { timeout: 10000 });
    await expect(canvas.getByRole("region", { name: "수집 정책" })).toBeVisible();
    await userEvent.click(retry);
    await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: /Claude.*계약 설정/ });
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
export const LoadError: Story = {
  name: "조회 실패·로딩 종료", parameters: { scenario: "load-error" },
  async play({ canvas }) {
    await canvas.findByRole("alert", {}, { timeout: 10000 });
    await expect(canvas.queryByText("설정을 불러오는 중입니다…")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "벤더 연동" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "다시 조회" })).toBeEnabled();
  },
};
export const SaveError: Story = {
  name: "저장 실패 시 입력 보존·재시도", parameters: { scenario: "save-error" },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(await canvas.findByRole("button", { name: /ChatGPT.*계약 설정 열기/ }));
    const screen = within(canvasElement.ownerDocument.body);
    const input = await screen.findByRole("textbox", { name: "표시 이름" });
    await userEvent.clear(input); await userEvent.type(input, "개발팀 Codex");
    await userEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("서버에 연결하지 못했습니다"));
    await expect(input).toHaveValue("개발팀 Codex");
    await userEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await canvas.findByRole("button", { name: "개발팀 Codex 계약 설정 열기" });
  },
};
export const Conflict: Story = {
  name: "동시 수정 충돌·명시적 다시 조회", parameters: { scenario: "conflict" },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(await canvas.findByRole("button", { name: /ChatGPT.*계약 설정 열기/ }));
    const screen = within(canvasElement.ownerDocument.body);
    const input = await screen.findByRole("textbox", { name: "표시 이름" });
    await userEvent.clear(input); await userEvent.type(input, "내 수정");
    await userEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    const reload = await screen.findByRole("button", { name: "입력 취소 후 최신 내용 불러오기" });
    await expect(input).toHaveValue("내 수정");
    await expect(screen.getByRole("button", { name: "변경사항 저장" })).toBeDisabled();
    await userEvent.click(reload);
    await waitFor(() => expect(input).toHaveValue("다른 관리자가 수정한 이름"));
  },
};

export const ContractLifecycle: Story = {
  name: "계약 정정·비우기·삭제·재등록",
  async play({ canvas, canvasElement, userEvent }) {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: /Claude.*계약 설정 열기/ }));
    const fee = (await screen.findAllByRole("textbox", { name: "월 단가" }))[0];
    await userEvent.clear(fee); await userEvent.type(fee, "25");
    await userEvent.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await canvas.findByText("$400.00 / 월");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await canvas.findByText("변경사항을 저장했습니다.");
    await userEvent.click(canvas.getByRole("button", { name: /Claude.*계약 설정 열기/ }));
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: "월 단가" })[0]).toHaveValue("25"));
    await userEvent.click(screen.getByRole("button", { name: "계약 비우기" }));
    await userEvent.click(screen.getByRole("button", { name: "계약 비우기 확인" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await canvas.findByText("계약 정보를 비웠습니다.");
    await expect(canvas.getAllByText("계약 미입력", { exact: true })).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: /Claude.*계약 설정 열기/ }));
    await userEvent.click(await screen.findByRole("button", { name: "벤더 삭제" }));
    await userEvent.click(screen.getByRole("button", { name: "제품 삭제 확인" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await canvas.findByText("벤더를 삭제했습니다.");
    await canvas.findByText("연동 벤더 2");
    await userEvent.click(canvas.getByRole("button", { name: "벤더 추가" }));
    const product = await screen.findByRole("combobox", { name: "제품" });
    await expect(within(product).queryByRole("option", { name: /ChatGPT/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(product, "claude_team");
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "벤더 추가" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await canvas.findByText("벤더를 추가했습니다.");
    await canvas.findByText("연동 벤더 3");
  },
};

export const PolicySaved: Story = {
  name: "수집 정책 저장·성공 알림",
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(await canvas.findByRole("button", { name: "프롬프트 원문 수집" }));
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole("dialog", { name: "수집 정책 변경" });
    await userEvent.click(within(dialog).getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await canvas.findByText("수집 정책을 저장했습니다.");
    await waitFor(() => expect(canvas.getByRole("button", { name: "프롬프트 원문 수집" })).toHaveAttribute("aria-pressed", "true"));
  },
};

export const ExpiredCopilot: Story = {
  name: "A 회사·Copilot 계약 만료",
  async play({ canvas, canvasElement, userEvent }) {
    const row = await canvas.findByRole("button", { name: /GitHub Copilot.*계약 설정 열기/ });
    await expect(row).toHaveTextContent("계약 만료");
    await expect(row).toHaveTextContent("마지막 계약");
    await canvas.findByText(/만료 1건 제외/);
    await expect(canvas.getByText("$360", { exact: true })).toBeVisible();
    await expect(canvas.getByText("- / 10", { exact: true })).toBeVisible();
    await userEvent.click(row);
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
    await expect(within(dialog).getByText("계약 만료", { exact: true })).toBeVisible();
    await expect(within(dialog).getByText("마지막 계약 금액")).toBeVisible();
  },
};

export const ScheduledContract: Story = {
  name: "계약 시작 예정", parameters: { scenario: "scheduled" },
  async play({ canvas }) {
    const row = await canvas.findByRole("button", { name: /Claude.*계약 설정 열기/ });
    await expect(row).toHaveTextContent("시작 예정");
    await expect(row).toHaveTextContent("예정 계약");
    await expect(canvas.getByText("$0", { exact: true })).toBeVisible();
    await expect(canvas.getByText("- / 0", { exact: true })).toBeVisible();
    await expect(canvas.getByText(/시작 예정 1건 제외/)).toBeVisible();
  },
};
