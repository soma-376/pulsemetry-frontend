export type StackedSegment = {
  key: string;
  /** 비중 (0~1). 합이 1 이 아니면 남는 만큼 트랙이 비쳐 보입니다 */
  share: number;
  color: string;
  tip?: string;
};

export type StackedBarProps = {
  segments: StackedSegment[];
  /**
   * 세로 기둥으로 쌓습니다. 가로 막대는 "구성비"만 보여주지만,
   * 기둥은 높이로 크기까지 함께 보여줄 수 있습니다.
   */
  vertical?: boolean;
  /** 가로일 때 두께(px), 세로일 때 기둥 높이(CSS 길이) */
  size?: number | string;
  className?: string;
};

/**
 * 누적 막대 — 한 항목의 구성비를 보여줍니다.
 * 비중이 0 인 세그먼트는 렌더하지 않습니다(1px 짜리 색 조각이 범례를 오염시킵니다).
 */
export function StackedBar({
  segments,
  vertical = false,
  size,
  className,
}: StackedBarProps) {
  const visible = segments.filter((s) => s.share > 0);

  return (
    <span
      className={[
        "flex overflow-hidden bg-sub",
        vertical ? "flex-col rounded-t-[3px]" : "rounded-[3px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={vertical ? { height: size ?? "100%" } : { height: size ?? 16 }}
    >
      {visible.map((s) => (
        <span
          key={s.key}
          title={s.tip}
          style={
            vertical
              ? { width: "100%", height: `${(s.share * 100).toFixed(1)}%`, background: s.color }
              : { height: "100%", width: `${(s.share * 100).toFixed(1)}%`, background: s.color }
          }
        />
      ))}
    </span>
  );
}
