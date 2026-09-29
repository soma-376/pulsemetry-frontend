import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";

function ToastExample({ message }: { message: string }) {
  const { toast, showToast, dismissToast } = useToast();
  return <div className="flex flex-wrap gap-2 p-6">
    <Button onClick={() => showToast(message)}>알림 표시</Button>
    <Button onClick={() => showToast("계약 정보를 비웠습니다.")}>다른 알림 표시</Button>
    <Toast toast={toast} onDismiss={dismissToast} />
  </div>;
}

const meta = {
  title: "UI/Toast", component: ToastExample, parameters: { layout: "fullscreen" },
  args: { message: "변경사항을 저장했습니다." },
} satisfies Meta<typeof ToastExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  name: "성공 알림",
  async play({ canvas, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "알림 표시" });
    await userEvent.click(trigger);
    await expect(canvas.getByRole("status")).toHaveTextContent("변경사항을 저장했습니다.");
    await expect(trigger).toHaveFocus();
  },
};
export const AutoDismiss: Story = {
  name: "4초 후 자동 닫힘",
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "알림 표시" }));
    await canvas.findByRole("button", { name: "알림 닫기" });
    await waitFor(() => expect(canvas.queryByRole("button", { name: "알림 닫기" })).not.toBeInTheDocument(), { timeout: 6500 });
  },
};
export const Dismiss: Story = {
  name: "직접 닫기",
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "알림 표시" }));
    await userEvent.click(await canvas.findByRole("button", { name: "알림 닫기" }));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "알림 닫기" })).not.toBeInTheDocument());
  },
};
export const PausedOnHover: Story = {
  name: "마우스를 올리면 자동 닫힘 정지",
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "알림 표시" }));
    const close = await canvas.findByRole("button", { name: "알림 닫기" });
    await userEvent.hover(close);
    // 기본 표시 시간이 지나도 읽고 있는 알림을 유지한다.
    await new Promise(resolve => setTimeout(resolve, 4200));
    await expect(close).toBeVisible();
    await userEvent.unhover(close);
    await waitFor(() => expect(close).not.toBeInTheDocument(), { timeout: 5000 });
  },
};
export const PausedOnFocus: Story = {
  name: "키보드 포커스 시 자동 닫힘 정지",
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "알림 표시" }));
    await userEvent.tab(); // 다른 알림 표시
    await userEvent.tab(); // 알림 닫기
    const close = canvas.getByRole("button", { name: "알림 닫기" });
    await expect(close).toHaveFocus();
    await new Promise(resolve => setTimeout(resolve, 4200));
    await expect(close).toBeVisible();
    await userEvent.tab({ shift: true });
    await waitFor(() => expect(close).not.toBeInTheDocument(), { timeout: 5000 });
  },
};
export const LongMessage: Story = {
  name: "긴 알림·작은 화면",
  args: { message: "수집 정책을 저장했습니다. 이후 설치 등록부터 적용되며 이미 설치된 기기의 정책은 자동으로 변경되지 않습니다." },
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "알림 표시" }));
    await expect(canvas.getByRole("button", { name: "알림 닫기" })).toBeVisible();
  },
};
