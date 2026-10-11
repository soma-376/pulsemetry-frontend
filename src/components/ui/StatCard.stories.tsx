import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatCard } from "./StatCard";

const meta = {
  title: "UI/StatCard",
  component: StatCard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
  args: { label: "활성 구성원", value: "24", unit: "명" },
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Unknown: Story = { args: { value: "-" } };
export const Zero: Story = { args: { value: "0" } };
export const ReclaimCandidate: Story = {
  args: {
    label: "회수 후보",
    value: "3",
    unit: "석",
    tone: "var(--orange)",
    size: "sm",
  },
};
