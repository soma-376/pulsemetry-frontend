export type StatCardProps = {
  label: string;
  value: string;
  /** 값 뒤에 붙는 단위 — "명", "석", "건" */
  unit?: string;
  /** 값 아래 설명 한 줄 */
  caption?: string;
  /** 값 색 — 경고는 orange/red 토큰을 넘깁니다 */
  tone?: string;
  /** sm: 표 위 요약(18px) · md: 페이지 상단 지표(28px) */
  size?: "sm" | "md";
  /** 값의 출처 표시 — 측정 / 파생 / 해당 없음 을 구분해야 숫자를 믿을 수 있습니다 */
  badge?: { text: string; bg: string; fg: string };
};

/**
 * 숫자 한 개짜리 카드.
 *
 * P6 좌석 지표와 P2 사용자 요약이 같은 모양이라 하나로 씁니다.
 * 증감·정의 툴팁이 붙는 P1 KPI 는 읽는 방식이 달라서 KpiCard 로 따로 둡니다 —
 * 옵션을 더 얹어 한 컴포넌트로 합치면 양쪽 다 읽기 어려워집니다.
 */
export function StatCard({
  label,
  value,
  unit,
  caption,
  tone = "var(--text)",
  size = "md",
  badge,
}: StatCardProps) {
  const big = size === "md";

  return (
    <div
      className={[
        "flex min-w-0 flex-col rounded-lg border border-border bg-card",
        big ? "gap-1.5 px-4 py-3.5" : "gap-1 px-3.5 py-3",
      ].join(" ")}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={[
            "overflow-hidden text-ellipsis whitespace-nowrap",
            big ? "text-[12px] text-text2" : "text-[11.5px] text-text3",
          ].join(" ")}
        >
          {label}
        </span>
        {badge && (
          <span
            className="rounded-[3px] px-1 text-[10px] leading-[15px] font-semibold whitespace-nowrap"
            style={{ background: badge.bg, color: badge.fg }}
          >
            {badge.text}
          </span>
        )}
      </span>

      <span className="tnum flex min-w-0 items-baseline gap-[3px] leading-[1.1] tracking-[-0.02em]">
        <span
          className={big ? "text-[28px] font-semibold" : "text-[18px] font-semibold"}
          style={{ color: tone }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[11px] font-medium tracking-normal text-text3">
            {unit}
          </span>
        )}
      </span>

      {caption && (
        <span className="pretty text-[11px] text-text3">{caption}</span>
      )}
    </div>
  );
}
