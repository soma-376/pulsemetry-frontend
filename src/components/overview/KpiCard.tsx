import { ComparisonUnavailableBadge } from "@/components/ui/ComparisonUnavailableBadge";
import { arrow } from "@/lib/format";

export type KpiCardProps = {
  label: string;
  value: string;
  unit: string;
  def: string;
  caption: string;
  captionTitle?: string;
  delta: string;
  up: boolean;
  /** 증감 글자색 — deltaTone 규칙(오르면 빨강, 내리면 파랑) */
  deltaColor: string;
  bad: boolean;
  showDelta: boolean;
  /** 증감률이 숫자일 때만 화살표를 그린다("신규"·"변화 없음"에는 없다) */
  showArrow?: boolean;
  /** 비교 기간의 값 — 서버가 비교를 냈을 때만 있다 */
  previousText?: string;
  noDelta: boolean;
  /** 비교 기준 문구 — "전주 대비" */
  compareLabel: string;
  /** 서버가 비교한 실제 기간 — "비교 기간 2026.08.31 ~ 2026.09.06" */
  compareTitle?: string;
  /** 비교가 불가능한 이유 */
  noDeltaReason: string;
  /** 현재 값의 누락·부분 관측 상태. 비교 상태와 별개다. */
  valueStatus?: { label: string; reason: string };
  supportingValue?: {
    label: string;
    value: string;
    exactValue: string;
  };
  /** 카드에서 여는 상세(예: 알림 목록) */
  action?: { label: string; onClick: () => void };
};

export function KpiCard({
  label,
  value,
  unit,
  def,
  delta,
  up,
  deltaColor,
  bad,
  showDelta,
  showArrow = true,
  previousText,
  noDelta,
  compareLabel,
  compareTitle,
  noDeltaReason,
  supportingValue,
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

      {supportingValue && (
        <div className="text-[11px] leading-[1.45] text-text2">
          <span
            className="tnum font-semibold"
            title={supportingValue.exactValue}
          >
            {supportingValue.label} {supportingValue.value}
          </span>
        </div>
      )}

      {showDelta && (
        <div className="tnum flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="font-semibold" style={{ color: deltaColor }}>
            {showArrow && `${arrow(up)} `}
            {delta}
          </span>
          {compareLabel && (
            <span title={compareTitle} className="text-text3">
              {compareLabel}
            </span>
          )}
          {previousText && (
            <span title={compareTitle} className="text-text3">
              · 이전 {previousText}
            </span>
          )}
        </div>
      )}

      {noDelta && value !== "-" && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <ComparisonUnavailableBadge reason={noDeltaReason} />
          {compareLabel && (
            <span title={compareTitle} className="text-text3">
              {compareLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
