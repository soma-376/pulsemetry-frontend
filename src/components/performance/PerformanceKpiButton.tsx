import type { KpiView } from "@/lib/metrics/performance";

/** 성과 요약 카드. 누르면 아래 추이 그래프가 이 지표로 바뀐다. */
export function PerformanceKpiButton({
  kpi,
  selected,
  onSelect,
  size = "lg",
}: {
  kpi: KpiView;
  selected: boolean;
  onSelect: (key: KpiView["key"]) => void;
  size?: "lg" | "sm";
}) {
  const large = size === "lg";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(kpi.key)}
      className={`flex min-w-0 cursor-pointer flex-col rounded-md border px-3 py-2.5 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 ${large ? "gap-1" : "gap-0.5"}`}
      style={{
        borderColor: selected ? kpi.color : "var(--border)",
        background: selected
          ? `color-mix(in srgb, ${kpi.color} 7%, var(--card))`
          : large
            ? "transparent"
            : "var(--sub)",
      }}
    >
      <span
        className={
          large ? "text-[12px] text-text2" : "text-[11.5px] text-text2"
        }
      >
        {kpi.label}
      </span>
      <span className="tnum flex items-baseline gap-1">
        <span
          className={
            large
              ? "text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] text-text"
              : "text-[20px] leading-[1.15] font-semibold text-text"
          }
        >
          {kpi.value}
        </span>
        {kpi.unit && (
          <span
            className={`font-medium text-text3 ${large ? "text-[12px]" : "text-[11px]"}`}
          >
            {kpi.unit}
          </span>
        )}
      </span>
      {kpi.delta && (
        <span
          className={`tnum text-text3 ${large ? "text-[12px]" : "text-[11px]"}`}
        >
          <b className="font-semibold" style={{ color: kpi.deltaColor }}>
            {kpi.delta}
          </b>
          {kpi.previous && ` · 이전 ${kpi.previous}`}
        </span>
      )}
      {kpi.caption && (
        <span className="text-[11px] text-text3">{kpi.caption}</span>
      )}
    </button>
  );
}
