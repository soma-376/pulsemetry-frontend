"use client";

import { motion } from "motion/react";

export type DonutSlice = {
  /** 이 조각의 비중. 단위는 자유 — 합계로 정규화합니다 */
  share: number;
  color: string;
};

export type DonutProps = {
  slices: DonutSlice[];
  /** 링 반지름 (viewBox 100 기준) */
  radius?: number;
  /** 링 두께 */
  thickness?: number;
  /** 조각 사이 간격 — 인접한 색이 붙어 보이지 않게 */
  gap?: number;
  /** 비어 있는 링의 배경색 */
  trackColor?: string;
  className?: string;
  activeIndex?: number | null;
  onHover?: (index: number | null) => void;
  onSelect?: (index: number) => void;
};

/**
 * stroke-dasharray 도넛.
 *
 * arc 를 path 로 그리지 않고 원 하나에 dasharray/dashoffset 을 주는 방식입니다.
 * 조각 수만큼 <circle> 을 겹쳐 쌓으면 되고, 각도 삼각함수가 전혀 필요 없습니다.
 */
export function Donut({
  slices,
  radius = 38,
  thickness = 13,
  gap = 1.6,
  trackColor = "var(--sub)",
  className,
  activeIndex = null,
  onHover,
  onSelect,
}: DonutProps) {
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((n, s) => n + s.share, 0);
  if (total <= 0) return null;

  const fractions = slices.map((s) => s.share / total);
  // 각 조각의 시작 위치 = 앞선 조각들의 합. 조각 수가 한 자릿수라 누적 합으로 충분합니다.
  const arcs = slices.map((s, i) => ({
    color: s.color,
    length: Math.max(fractions[i] * circumference - gap, 0),
    offset:
      -fractions.slice(0, i).reduce((a, b) => a + b, 0) * circumference -
      gap / 2,
  }));

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
      onPointerLeave={() => onHover?.(null)}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <circle
        cx={50}
        cy={50}
        r={radius}
        style={{ fill: "none", stroke: trackColor, strokeWidth: thickness }}
      />
      {arcs.map((a, i) => (
        <motion.circle
          key={i}
          cx={50}
          cy={50}
          r={radius}
          transform="rotate(-90 50 50)"
          onPointerEnter={() => onHover?.(i)}
          onClick={() => onSelect?.(i)}
          initial={false}
          animate={{ opacity: activeIndex === null || activeIndex === i ? 1 : 0.28, strokeWidth: activeIndex === i ? thickness + 3 : thickness }}
          style={{
            cursor: onSelect ? "pointer" : undefined,
            pointerEvents: "stroke",
            fill: "none",
            stroke: a.color,
            strokeDasharray: `${a.length.toFixed(2)} ${circumference.toFixed(2)}`,
            strokeDashoffset: a.offset.toFixed(2),
          }}
        />
      ))}
    </svg>
  );
}
