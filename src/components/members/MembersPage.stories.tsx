import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  dashboardPageMeta,
  normalStory,
  loadingStory,
  errorStory,
  type PageStoryArgs,
} from "../../../.storybook/dashboard-page";

const meta = {
  ...dashboardPageMeta("members"),
  tags: ["!autodocs"],
  id: "pages-members",
  title: "Pages/구성원",
} satisfies Meta<PageStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = { ...normalStory, name: "일반" };
export const Loading: Story = { ...loadingStory, name: "로딩" };
export const Error: Story = { ...errorStory, name: "에러" };
