import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { LoadingState } from "./LoadingState";
import { Button } from "./Button";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "UI/Feedback",
  parameters: { layout: "padded" },
  args: { onRetry: fn() },
  render: args => <ErrorState message="정보를 불러오지 못했습니다." onRetry={args.onRetry} />,
} satisfies Meta<{ onRetry: () => void }>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PageLoading: Story = {
  name: "본문 최초 로딩",
  render: () => <LoadingState message="설정을 불러오는 중입니다…" className="min-h-[480px]" />,
};
export const Refreshing: Story = {
  name: "새로고침·공통 헤더 버튼 진행 표시",
  render: () => <Button loading loadingLabel="조회 중…">새로고침</Button>,
};
export const Error: Story = {
  name: "조회 오류·재시도",
  render: args => <ErrorState message="정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." onRetry={args.onRetry} />,
  async play({ canvas, userEvent, args }) {
    await expect(canvas.getByRole("alert")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "다시 조회" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
export const Retrying: Story = {
  name: "재시도 중 중복 요청 방지",
  render: args => <ErrorState message="정보를 불러오지 못했습니다." onRetry={args.onRetry} retrying />,
  async play({ canvas, userEvent, args }) {
    const button = canvas.getByRole("button", { name: "조회 중…" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    await expect(args.onRetry).not.toHaveBeenCalled();
  },
};
export const Empty: Story = {
  name: "정상 조회·빈 결과",
  render: () => <EmptyState message="선택한 기간에 데이터가 없습니다" description="다른 기간을 선택해 주세요." />,
};
