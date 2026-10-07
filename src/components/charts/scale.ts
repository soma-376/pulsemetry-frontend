/**
 * 차트 좌표 변환.
 *
 * 모든 차트는 viewBox="0 0 100 100" + preserveAspectRatio="none" 으로 그리고
 * 실제 크기는 CSS 가 정합니다. 선 굵기는 vectorEffect="non-scaling-stroke" 로
 * 늘어나지 않게 막습니다. 그래서 스케일 함수가 이 두 줄이면 충분합니다.
 */

export type Point = [x: number, y: number];

export type Domain = { max: number; min?: number };

/** i 번째 값의 x 좌표 (0~100) — 양 끝을 가장자리에 붙입니다 */
export const xAt = (i: number, count: number) =>
  count <= 1 ? 50 : (i / (count - 1)) * 100;

/** 값의 y 좌표 (0~100, 위가 0) */
export const yAt = (v: number, { max, min = 0 }: Domain) =>
  100 - ((v - min) / (max - min)) * 100;

export function points(values: number[], domain: Domain): Point[] {
  return values.map((v, i) => [
    Number(xAt(i, values.length).toFixed(2)),
    Number(yAt(v, domain).toFixed(2)),
  ]);
}

export const pathOf = (pts: Point[]) =>
  pts.map((p, i) => (i ? "L" : "M") + p[0] + "," + p[1]).join(" ");

export const linePath = (values: number[], domain: Domain) =>
  pathOf(points(values, domain));

/**
 * 두 계열 사이를 채우는 닫힌 경로.
 * 위/아래 어느 쪽이 큰지는 호출부가 색으로 표현합니다.
 */
export function bandPath(upper: Point[], lower: Point[]) {
  if (!upper.length || !lower.length) return "";
  return (
    pathOf(upper) +
    " L" +
    [...lower]
      .reverse()
      .map((p) => p.join(","))
      .join(" L") +
    " Z"
  );
}

/**
 * 막대처럼 열 중앙을 지나는 선 — 양 끝이 가장자리에 붙지 않습니다.
 * (막대 차트 위에 추세선을 얹을 때)
 */
export const centeredPath = (values: number[], domain: Domain) =>
  values
    .map(
      (v, i) =>
        (i ? "L" : "M") +
        (((i + 0.5) / values.length) * 100).toFixed(2) +
        "," +
        yAt(v, domain).toFixed(2),
    )
    .join(" ");
