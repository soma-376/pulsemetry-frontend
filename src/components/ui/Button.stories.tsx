import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { Button } from "./Button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "변경사항 저장", variant: "default", size: "md", disabled: false, onClick: fn() },
  argTypes: {
    variant: { control: "select", options: ["default", "primary", "ghost", "danger"] },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Primary: Story = { args: { variant: "primary" } };
export const Ghost: Story = { args: { variant: "ghost", children: "취소" } };
export const Danger: Story = { args: { variant: "danger", children: "좌석 회수" } };
export const Disabled: Story = { args: { variant: "primary", disabled: true } };
export const Small: Story = { args: { size: "sm", children: "다시 보내기" } };
export const Loading: Story = {
  args: { variant: "primary", loading: true, loadingLabel: "저장 중…" },
  async play({ canvas, userEvent, args }) {
    const button = canvas.getByRole("button", { name: "저장 중…" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
