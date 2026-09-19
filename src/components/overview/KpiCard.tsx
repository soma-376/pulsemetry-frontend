import { arrow } from "@/lib/format";
import { deltaColor } from "@/lib/metrics/deltas";

export type KpiCardProps = {
  label: string;
  value: string;
  unit: string;
  def: string;
  caption: string;
  delta: string;
  up: boolean;
  good: boolean;
  bad: boolean;
  showDelta: boolean;
  noDelta: boolean;
  /** 비교 기준 문구 — "전주 대비" */
  compareLabel: string;
  /** 비교가 불가능한 이유 */
  noDeltaReason: string;
  /** 수집이 끊긴 경우 기준 시각을 각주로 답니다 */
  staleAt?: string;
};

export function KpiCard({
  label,
  value,
  unit,
  def,
  caption,
  delta,
  up,
  good,
  bad,
  showDelta,
  noDelta,
  compareLabel,
  noDeltaReason,
  staleAt,
}: KpiCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-1.5">
        <span
          title={def}
          className="overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-text2"
        >
          {label}
        </span>
      </div>

      <div className="tnum flex flex-wrap items-baseline gap-[3px] leading-[1.1] tracking-[-0.02em]">
        <span
          className="text-[30px] font-semibold"
          style={{ color: bad ? "var(--red)" : "var(--text)" }}
        >
          {value}
        </span>
        <span className="text-[12px] font-medium tracking-normal text-text3">
          {unit}
        </span>
      </div>

      {showDelta && (
        <div className="tnum flex items-center gap-1.5 text-[12px]">
          <span
            className="font-semibold"
            style={{ color: deltaColor(up ? 1 : -1, { good, bad }) }}
          >
            {arrow(up)} {delta}
          </span>
          {compareLabel && <span className="text-text3">{compareLabel}</span>}
        </div>
      )}

      {noDelta && (
        <div className="flex items-center gap-1.5 text-[11.5px]">
          <span className="inline-flex h-[18px] items-center rounded-[3px] bg-gray-tint px-1.5 text-[10.5px] font-semibold whitespace-nowrap text-text2">
            비교 불가
          </span>
          <span className="whitespace-nowrap text-text3">{noDeltaReason}</span>
        </div>
      )}

      {staleAt && (
        <div className="text-[11px] font-semibold whitespace-nowrap text-orange-ink">
          기준 {staleAt} · 이후 신호 없음
        </div>
      )}

      <div className="pretty text-[11px] leading-[1.45] text-text3">
        {caption}
      </div>
    </div>
  );
}
