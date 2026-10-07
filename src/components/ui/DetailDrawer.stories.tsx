import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { Button } from "./Button";
import { DetailDrawer } from "./DetailDrawer";

const meta = {
  title: "UI/DetailDrawer",
  component: DetailDrawer,
  // dialog가 문서 전체를 덮지 않도록 Docs에서도 별도 iframe에 렌더링합니다.
  parameters: {
    layout: "fullscreen",
    docs: { story: { inline: false, height: 600 } },
  },
  args: {
    open: false,
    title: "구성원 상세",
    subtitle: "member@example.com",
    onClose: fn(),
    children: (
      <p className="text-sm text-text2">
        팀·역할과 벤더 좌석 정보를 표시하는 영역입니다.
      </p>
    ),
  },
  render: function Render(args) {
    const [{ open }, updateArgs] = useArgs<{ open: boolean }>();
    return (
      <>
        <div className="p-6">
          <Button onClick={() => updateArgs({ open: true })}>상세 열기</Button>
        </div>
        <DetailDrawer
          {...args}
          open={open}
          onClose={() => {
            args.onClose();
            updateArgs({ open: false });
          }}
        />
      </>
    );
  },
} satisfies Meta<typeof DetailDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LongContent: Story = {
  args: {
    title: "벤더 좌석",
    children: (
      <div className="space-y-3">
        {Array.from({ length: 20 }, (_, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-sub p-4"
          >
            좌석 {index + 1}
          </div>
        ))}
      </div>
    ),
  },
};
