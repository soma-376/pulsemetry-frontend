export type ScatterPoint = {
  key: string;
  /** 데이터 단위 (도메인 기준) */
  x: number;
  y: number;
  /** 점 지름 (px) — 값이 아니라 세 번째 차원을 나타냅니다 */
  size: number;
  color: string;
  label: string;
  /** 라벨 아래 보조 문구 */
  sub?: string;
  tip?: string;
};

export type ScatterPlotProps = {
  points: ScatterPoint[];
  xMax: number;
  yMax: number;
  /**
   * 원점을 지나는 기준선의 기울기 (y/x). 전사 평균 단가처럼
   * "이 선 위면 비싼 쪽"을 한눈에 보여주는 용도입니다.
   */
  referenceSlope?: number;
  className?: string;
};

/**
 * 산점도.
 *
 * 점과 라벨은 SVG 가 아니라 절대배치한 HTML 입니다 — preserveAspectRatio="none"
 * 로 늘린 좌표계 안에서 원을 그리면 타원이 되고 글자도 찌그러지기 때문입니다.
 * 늘어나도 괜찮은 기준선만 SVG 로 그립니다.
 */
export function ScatterPlot({
  points,
  xMax,
  yMax,
  referenceSlope,
  className,
}: ScatterPlotProps) {
  // 기준선이 위쪽 경계를 뚫지 않도록 x 를 잘라냅니다
  const refX = referenceSlope
    ? Math.min(xMax, yMax / referenceSlope)
    : 0;

  return (
    <div className={["relative h-full w-full", className].filter(Boolean).join(" ")}>
      {referenceSlope ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
          }}
        >
          <path
            d={`M0,100 L${((refX / xMax) * 100).toFixed(2)},${(100 - ((refX * referenceSlope) / yMax) * 100).toFixed(2)}`}
            style={{
              fill: "none",
              stroke: "var(--text3)",
              strokeWidth: 1,
              strokeDasharray: "4 3",
              vectorEffect: "non-scaling-stroke",
            }}
          />
        </svg>
      ) : null}

      {points.map((p) => {
        const xp = (p.x / xMax) * 100;
        const yp = (p.y / yMax) * 100;
        // 오른쪽 끝에 붙은 점은 라벨을 왼쪽으로 넘깁니다
        const flip = xp > 58;
        const offset = p.size / 2 + 7;

        return (
          <div key={p.key}>
            <span
              title={p.tip}
              className="absolute rounded-full"
              style={{
                left: `${xp.toFixed(1)}%`,
                bottom: `${yp.toFixed(1)}%`,
                width: p.size,
                height: p.size,
                transform: "translate(-50%, 50%)",
                background: p.color,
                boxShadow: "0 0 0 1.5px var(--card)",
              }}
            />
            <span
              className="absolute text-[11px] leading-[1.2] font-semibold whitespace-nowrap"
              style={{
                // 위아래 경계에 라벨이 걸리지 않게 가둡니다
                bottom: `${Math.min(Math.max(yp, 8), 88).toFixed(1)}%`,
                left: flip ? "auto" : `calc(${xp.toFixed(1)}% + ${offset}px)`,
                right: flip
                  ? `calc(${(100 - xp).toFixed(1)}% + ${offset}px)`
                  : "auto",
                textAlign: flip ? "right" : "left",
                transform: "translateY(50%)",
                color: p.color,
              }}
            >
              {p.label}
              {p.sub && (
                <span className="tnum block font-normal text-text2">
                  {p.sub}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
