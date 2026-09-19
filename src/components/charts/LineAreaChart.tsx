import { bandPath, pathOf, points, xAt, yAt, type Domain } from "./scale";

/**
 * 해칭 패턴은 모든 차트에서 동일하므로 id 를 공유합니다.
 * (같은 정의가 중복 선언돼도 첫 번째가 쓰이고 결과는 같습니다 — 훅 없이 서버에서 렌더됩니다)
 */
const HATCH_ID = "pm-preobs-hatch";

export type Series = {
  values: number[];
  color: string;
  /** 선 굵기 (px, 스케일에 영향받지 않음) */
  width?: number;
  /** "4 3" 같은 dash 패턴 */
  dash?: string;
  opacity?: number;
};

export type Band = {
  /** 밴드의 두 경계 계열 */
  from: number[];
  to: number[];
  color: string;
  opacity?: number;
};

export type LineAreaChartProps = {
  domain: Domain;
  series: Series[];
  band?: Band;
  /**
   * 관측 이전 구간. 이 인덱스 앞쪽은 선을 그리지 않고 해칭으로 막습니다.
   * 신호가 없는 구간을 0 으로 찍으면 거짓말이 되기 때문입니다.
   */
  observedFrom?: number;
  className?: string;
};

/**
 * 다중 선 + 영역 밴드 + 관측 이전 해칭.
 * W1.2 환산가치 vs 지출, P2 팀별 추이가 같은 컴포넌트를 씁니다.
 */
export function LineAreaChart({
  domain,
  series,
  band,
  observedFrom = 0,
  className,
}: LineAreaChartProps) {
  const count = series[0]?.values.length ?? 0;
  const hasGap = observedFrom > 0 && count > 1;
  const boundaryX = hasGap ? (observedFrom / (count - 1)) * 100 : 0;

  /**
   * 관측 구간만 그립니다 — 잘린 앞쪽은 해칭이 대신합니다.
   * x 좌표는 반드시 전체 길이 기준으로 먼저 계산한 뒤 잘라야 합니다.
   * 값을 먼저 자르면 남은 점들이 폭 전체로 다시 펴져 선이 엉뚱한 곳을 지납니다.
   */
  const observed = (values: number[]) =>
    points(values, domain).slice(observedFrom);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        display: "block",
      }}
    >
      {hasGap && (
        <defs>
          <pattern
            id={HATCH_ID}
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={5}
              style={{ stroke: "var(--border)", strokeWidth: 2 }}
            />
          </pattern>
        </defs>
      )}

      {hasGap && (
        <>
          <rect
            x={0}
            y={0}
            width={boundaryX}
            height={100}
            style={{ fill: `url(#${HATCH_ID})`, stroke: "none" }}
          />
          <line
            x1={boundaryX}
            y1={0}
            x2={boundaryX}
            y2={100}
            style={{
              stroke: "var(--text3)",
              strokeWidth: 1,
              vectorEffect: "non-scaling-stroke",
            }}
          />
        </>
      )}

      {band && (
        <path
          d={bandPath(observed(band.from), observed(band.to))}
          style={{
            fill: band.color,
            opacity: band.opacity ?? 0.14,
            stroke: "none",
          }}
        />
      )}

      {series.map((s, i) => (
        <path
          key={i}
          d={pathOf(observed(s.values))}
          style={{
            fill: "none",
            stroke: s.color,
            strokeWidth: s.width ?? 2,
            strokeDasharray: s.dash ?? "none",
            opacity: s.opacity ?? 1,
            vectorEffect: "non-scaling-stroke",
            strokeLinejoin: "round",
            strokeLinecap: "round",
          }}
        />
      ))}
      {count === 1 && series.map((s, i) => (
        <ellipse key={`point-${i}`} cx={xAt(0, count)} cy={yAt(s.values[0], domain)} rx={0.8} ry={1.2} fill={s.color} />
      ))}
    </svg>
  );
}
