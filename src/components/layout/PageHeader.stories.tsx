import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/Button";

const meta = {
  title: "Layout/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: { page: "overview" },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Teams: Story = {
  args: { page: "teams", actions: <Button>팀 관리</Button> },
};
export const Members: Story = {
  args: {
    page: "members",
    actions: (
      <>
        <Button>팀 관리</Button>
        <Button variant="primary">구성원 초대</Button>
      </>
    ),
  },
};
export const Operations: Story = { args: { page: "ops" } };
export const Settings: Story = { args: { page: "settings" } };
export const Narrow: Story = {
  args: Members.args,
  decorators: [
    (Story) => (
      <div className="max-w-[320px]">
        <Story />
      </div>
    ),
  ],
};
