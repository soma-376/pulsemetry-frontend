export type ProgressBarProps = {
  /** "64.2%" 형태의 채움 너비 */
  width: string;
  color?: string;
  /** 비교 기간 값 위치에 세로 기준선을 긋습니다 */
  markerAt?: string;
  height?: number;
  /** 채움을 흐리게 (미배분 행 등) */
  dim?: boolean;
  title?: string;
  className?: string;
};

/**
 * 가로 막대. SVG 가 아니라 div 인 이유는 원본이 그렇고,
 * 텍스트와 같은 행에서 baseline 을 맞추기가 훨씬 쉽기 때문입니다.
 */
export function ProgressBar({
  width,
  color = "var(--purple)",
  markerAt,
  height = 9,
  dim = false,
  title,
  className,
}: ProgressBarProps) {
  return (
    <span
      title={title}
      className={className}
      style={{
        display: "block",
        position: "relative",
        height,
        borderRadius: 2,
        background: "var(--sub)",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          borderRadius: 2,
          width,
          background: color,
          opacity: dim ? 0.5 : 1,
        }}
      />
      {markerAt && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -2,
            bottom: -2,
            width: 1,
            background: "var(--text3)",
            left: markerAt,
          }}
        />
      )}
    </span>
  );
}
