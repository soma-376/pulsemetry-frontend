/**
 * 증감 표시 규칙 — 개요·팀 분석이 같은 규칙을 쓴다.
 * 지표의 좋고 나쁨과 상관없이 오르면 빨강, 내리면 파랑이다.
 * 0·신규·변화 없음·계산할 수 없는 변화는 회색이다.
 */
export function deltaTone(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio) || ratio === 0)
    return "var(--text2)";
  return ratio > 0 ? "var(--red)" : "var(--blue)";
}

/** 전사 증가분 중 이 팀이 차지하는 몫이 유의미한지 */
export function contributionColor(contrib: number, orgIncrease: number) {
  if (contrib >= orgIncrease * 0.25) return "var(--red)";
  if (contrib < 0) return "var(--green)";
  return "var(--text)";
}
