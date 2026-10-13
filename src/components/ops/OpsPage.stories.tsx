import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  dashboardPageMeta,
  normalStory,
  loadingStory,
  errorStory,
  type PageStoryArgs,
} from "../../../.storybook/dashboard-page";

const meta = {
  ...dashboardPageMeta("ops"),
  tags: ["!autodocs"],
  id: "pages-ops",
  title: "Pages/운영·보안",
} satisfies Meta<PageStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = { ...normalStory, name: "일반" };
export const Loading: Story = { ...loadingStory, name: "로딩" };
export const Error: Story = { ...errorStory, name: "에러" };
