import { arrow } from "@/lib/format";
import { deltaColor } from "@/lib/metrics/deltas";

export type KpiCardProps = {
  label: string;
  value: string;
  unit: string;
  def: string;
  caption: string;
  captionTitle?: string;
  delta: string;
  up: boolean;
  good: boolean;
  bad: boolean;
  showDelta: boolean;
  /** 증감률이 숫자일 때만 화살표를 그린다("신규"·"변화 없음"에는 없다) */
  showArrow?: boolean;
  /** 비교 기간의 값 — 서버가 비교를 냈을 때만 있다 */
  previousText?: string;
  noDelta: boolean;
  /** 비교 기준 문구 — "전주 대비" */
  compareLabel: string;
  /** 비교가 불가능한 이유 */
  noDeltaReason: string;
  /** 현재 값의 누락·부분 관측 상태. 비교 상태와 별개다. */
  valueStatus?: { label: string; reason: string };
  /** 카드에서 여는 상세(예: 알림 목록) */
  action?: { label: string; onClick: () => void };
};

export function KpiCard({
  label,
  value,
  unit,
  def,
  caption,
  captionTitle,
  delta,
  up,
  good,
  bad,
  showDelta,
  showArrow = true,
  previousText,
  noDelta,
  compareLabel,
  noDeltaReason,
  valueStatus,
  action,
}: KpiCardProps) {
  return (
    <div
      role="region"
      aria-label={label}
      className="relative flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span title={def} className="min-w-0 text-[12px] text-text2">
          {label}
        </span>
        {valueStatus && (
          <MetricStatusBadge
            label={valueStatus.label}
            reason={valueStatus.reason}
          />
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 cursor-pointer rounded px-1 text-[11px] text-text2 hover:bg-hover hover:text-text"
          >
            {action.label}
          </button>
        )}
      </div>

      <div className="tnum flex flex-wrap items-baseline gap-[3px] leading-[1.1] tracking-[-0.02em]">
        <span
          className="min-w-0 max-w-full text-[30px] font-semibold"
          style={{ color: bad ? "var(--red)" : "var(--text)" }}
        >
          {value}
        </span>
        <span className="text-[12px] font-medium tracking-normal text-text3">
          {unit}
        </span>
      </div>

      {showDelta && (
        <div className="tnum flex flex-wrap items-center gap-1.5 text-[12px]">
          <span
            className="font-semibold"
            style={{
              color: showArrow
                ? deltaColor(up ? 1 : -1, { good, bad })
                : "var(--text2)",
            }}
          >
            {showArrow && `${arrow(up)} `}
            {delta}
          </span>
          {compareLabel && <span className="text-text3">{compareLabel}</span>}
          {previousText && (
            <span className="text-text3">· 이전 {previousText}</span>
          )}
        </div>
      )}

      {noDelta && value !== "-" && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <MetricStatusBadge label="비교 불가" reason={noDeltaReason} />
          {compareLabel && <span className="text-text3">{compareLabel}</span>}
        </div>
      )}

      <div
        title={captionTitle}
        className="pretty text-[11px] leading-[1.45] text-text3"
      >
        {caption}
      </div>
    </div>
  );
}

/** 짧은 상태를 항상 표시하고, 사유는 포인터·키보드 초점에서 확인한다. */
export function MetricStatusBadge({
  label,
  reason,
}: {
  label: string;
  reason: string;
}) {
  return (
    <span
      tabIndex={0}
      aria-label={`${label}: ${reason}`}
      className="group inline-flex shrink-0 cursor-help rounded-[3px] bg-gray-tint px-1.5 py-0.5 text-[10.5px] leading-[14px] font-semibold whitespace-nowrap text-text2 outline-offset-2"
    >
      {label}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full right-0 left-0 z-20 mt-1 hidden rounded-md border border-border bg-card p-2.5 text-left text-xs leading-5 font-normal whitespace-normal text-text2 shadow-lg group-hover:block group-focus-visible:block"
      >
        {reason}
      </span>
    </span>
  );
}
