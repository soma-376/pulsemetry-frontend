import { expect } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  dashboardPageMeta,
  normalStory,
  loadingStory,
  errorStory,
  type PageStoryArgs,
} from "../../../.storybook/dashboard-page";

const meta = {
  ...dashboardPageMeta("overview"),
  tags: ["!autodocs"],
  id: "pages-overview",
  title: "Pages/개요",
} satisfies Meta<PageStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = { ...normalStory, name: "일반" };
export const Loading: Story = { ...loadingStory, name: "로딩" };
export const Error: Story = { ...errorStory, name: "에러" };

export const PartialRetry: Story = {
  name: "부분 실패 · 공통 재시도로 복구",
  parameters: { pageState: "partial_retry" },
  async play({ canvas }) {
    await expect(
      await canvas.findByText("사용 추이를 불러오지 못했습니다"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("region", { name: "사용 환산액" }),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "다시 조회" }),
    ).toHaveLength(1);
  },
};
export const EmptyPeriod: Story = {
  name: "선택 기간 데이터 없음",
  parameters: { pageState: "no_data" },
  async play({ canvas }) {
    await expect(
      await canvas.findByText("선택한 기간에 데이터가 없습니다"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("table", { name: "팀별 요약" }),
    ).not.toBeInTheDocument();
  },
};

export const Pending: Story = {
  name: "집계 중",
  parameters: { pageState: "pending" },
};
export const CollectionGap: Story = {
  name: "수집 불완전",
  parameters: { pageState: "collection_gap" },
};
