/**
 * 증감 표시 규칙.
 *
 * 색은 "오른 것이 나쁜 지표"와 "오른 것이 좋은 지표"가 뒤섞여 있어
 * 방향만 보고 칠하면 안 됩니다. good 플래그로 의미를 넘겨받습니다.
 */

/** 임계 미만의 변동은 회색 — 노이즈를 빨강으로 칠하지 않습니다 */
const NOISE_BAND = 0.05;

export function deltaColor(
  value: number,
  opts: { good?: boolean; bad?: boolean } = {},
) {
  if (opts.bad) return "var(--red)";
  if (opts.good) return value >= 0 ? "var(--green)" : "var(--red)";
  return "var(--gray)";
}

/** 비용성 지표 — 오르면 빨강, 내리면 초록, 그 사이는 회색 */
export function costDeltaColor(value: number) {
  if (value >= NOISE_BAND) return "var(--red)";
  if (value <= -NOISE_BAND) return "var(--green)";
  return "var(--text3)";
}

/** 전사 증가분 중 이 팀이 차지하는 몫이 유의미한지 */
export function contributionColor(contrib: number, orgIncrease: number) {
  if (contrib >= orgIncrease * 0.25) return "var(--red)";
  if (contrib < 0) return "var(--green)";
  return "var(--text)";
}
