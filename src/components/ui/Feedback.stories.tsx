import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { LoadingState } from "./LoadingState";
import { Button } from "./Button";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";
import { PeriodEmptyState } from "./PeriodEmptyState";

const meta = {
  title: "UI/Feedback",
  parameters: { layout: "padded" },
  args: { onRetry: fn(), onConnect: fn(), onReset: fn() },
  render: (args) => (
    <ErrorState message="정보를 불러오지 못했습니다." onRetry={args.onRetry} />
  ),
} satisfies Meta<{
  onRetry: () => void;
  onConnect: () => void;
  onReset: () => void;
}>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PageLoading: Story = {
  name: "본문 최초 로딩",
  render: () => (
    <LoadingState
      message="설정을 불러오는 중입니다…"
      className="min-h-[480px]"
    />
  ),
};
export const Refreshing: Story = {
  name: "새로고침·공통 헤더 버튼 진행 표시",
  render: () => (
    <Button loading loadingLabel="조회 중…">
      새로고침
    </Button>
  ),
};
export const Error: Story = {
  name: "조회 오류·재시도",
  render: (args) => (
    <ErrorState
      message="정보를 불러오지 못했습니다"
      description="일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
      onRetry={args.onRetry}
    />
  ),
  async play({ canvas, userEvent, args }) {
    await expect(canvas.getByRole("alert")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "다시 조회" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
export const Retrying: Story = {
  name: "재시도 중 중복 요청 방지",
  render: (args) => (
    <ErrorState
      message="정보를 불러오지 못했습니다."
      onRetry={args.onRetry}
      retrying
    />
  ),
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
  render: (args) => (
    <EmptyState
      message="선택한 기간에 데이터가 없습니다"
      description="조회 기간이나 필터를 바꾸면 다른 결과를 확인할 수 있습니다."
      action={<Button onClick={args.onReset}>필터 초기화</Button>}
    />
  ),
};

export const EmptyPeriod: Story = {
  name: "기간 조회 · 개요와 팀 분석 공통",
  render: () => <PeriodEmptyState />,
};

export const EmptyTeamPeriod: Story = {
  name: "기간 조회 · 선택 팀의 사용자 없음",
  render: () => <PeriodEmptyState scope="team" />,
};

export const NotConnected: Story = {
  name: "미연동·제품 연결 안내",
  render: (args) => (
    <EmptyState
      variant="not-connected"
      message="아직 연결된 제품이 없습니다"
      description="사용 중인 제품을 연결하고 사용 현황을 한곳에서 확인하세요."
      action={
        <Button variant="primary" onClick={args.onConnect}>
          제품 연결
        </Button>
      }
    />
  ),
};

export const WaitingForData: Story = {
  name: "연동 완료·첫 데이터 대기",
  render: () => (
    <EmptyState
      message="아직 수집된 데이터가 없습니다"
      description="제품 연결을 완료했습니다. 첫 데이터가 수집되면 이곳에 사용 현황이 표시됩니다."
    />
  ),
};

export const InlineError: Story = {
  name: "작은 영역·오류 안내",
  render: (args) => (
    <div className="flex h-10 items-center rounded-lg border border-border bg-sub px-4">
      <ErrorState
        variant="inline"
        className="min-w-0 flex-1"
        message="수집 상태를 불러오지 못했습니다."
        onRetry={args.onRetry}
      />
    </div>
  ),
};

export const ErrorWithRecovery: Story = {
  name: "저장 실패·복구 동작",
  render: (args) => (
    <ErrorState
      message="다른 곳에서 정보가 변경되었습니다"
      description="입력한 내용은 유지됩니다. 최신 정보를 확인한 뒤 다시 저장해 주세요."
    >
      <Button onClick={args.onRetry}>최신 내용 불러오기</Button>
    </ErrorState>
  ),
};

export const Comparison: Story = {
  name: "오류·빈 결과·미연동 비교",
  render: (args) => (
    <div className="mx-auto max-w-[1240px] space-y-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-text">상태별 안내</h1>
        <p className="mt-1 text-sm text-text2">
          오류 복구, 조회 조건 변경, 첫 연결에 필요한 안내를 비교합니다.
        </p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section className="min-w-0 space-y-3">
          <h2 className="text-xs font-medium text-text2">조회 실패</h2>
          <ErrorState
            message="정보를 불러오지 못했습니다"
            description="일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
            onRetry={args.onRetry}
          />
        </section>
        <section className="min-w-0 space-y-3">
          <h2 className="text-xs font-medium text-text2">
            정상 조회 · 빈 결과
          </h2>
          <EmptyState
            message="선택한 기간에 데이터가 없습니다"
            description="조회 기간이나 필터를 바꾸면 다른 결과를 확인할 수 있습니다."
            action={<Button onClick={args.onReset}>필터 초기화</Button>}
          />
        </section>
        <section className="min-w-0 space-y-3">
          <h2 className="text-xs font-medium text-text2">시작 전 · 미연동</h2>
          <EmptyState
            variant="not-connected"
            message="아직 연결된 제품이 없습니다"
            description="사용 중인 제품을 연결하고 사용 현황을 한곳에서 확인하세요."
            action={
              <Button variant="primary" onClick={args.onConnect}>
                제품 연결
              </Button>
            }
          />
        </section>
      </div>
    </div>
  ),
};

export const Narrow: Story = {
  name: "좁은 영역·긴 안내 문구",
  render: (args) => (
    <div className="mx-auto w-full max-w-[320px] space-y-4">
      <ErrorState
        message="제품의 사용 현황을 불러오지 못했습니다"
        description="연결 상태를 확인한 뒤 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요."
        onRetry={args.onRetry}
      />
      <EmptyState
        message="현재 조회 조건에 해당하는 데이터가 없습니다"
        description="기간을 넓히거나 적용한 필터를 초기화해 주세요."
        action={<Button onClick={args.onReset}>필터 초기화</Button>}
      />
      <EmptyState
        variant="not-connected"
        message="아직 연결된 제품이 없습니다"
        description="사용 중인 제품을 연결하면 팀의 사용 현황을 확인할 수 있습니다."
        action={
          <Button variant="primary" onClick={args.onConnect}>
            제품 연결
          </Button>
        }
      />
    </div>
  ),
};
