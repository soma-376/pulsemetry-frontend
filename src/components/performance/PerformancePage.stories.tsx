import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  dashboardPageMeta,
  normalStory,
  type PageStoryArgs,
} from "../../../.storybook/dashboard-page";

// 성과는 백엔드 API 없이 예시 데이터를 보여주므로 로딩·에러 스토리를 두지 않는다.
const meta = {
  ...dashboardPageMeta("ops"),
  tags: ["!autodocs"],
  id: "pages-performance",
  title: "Pages/성과",
} satisfies Meta<PageStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = { ...normalStory, name: "일반" };
export const TeamScope: Story = {
  ...normalStory,
  name: "팀 범위",
  parameters: {
    ...normalStory.parameters,
    nextjs: { navigation: { pathname: "/ops", query: { scope: "platform" } } },
  },
};
