/**
 * 표시 포맷 — 원본 DC 스크립트의 usd/int/pct 와 동일한 규칙.
 * 음수 기호는 하이픈이 아니라 U+2212(−) 를 씁니다(원본과 동일).
 */

const MINUS = "−";

export const usd = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const int = (n: number) => n.toLocaleString("en-US");

/** 비율 → "+12.4%" / "−8.1%" (v 는 0.124 같은 소수) */
export const pct = (v: number) =>
  (v >= 0 ? "+" : MINUS) + Math.abs(v * 100).toFixed(1) + "%";

/** 금액 → "+$1,234.00" / "−$1,234.00" */
export const signedUsd = (n: number) =>
  (n >= 0 ? "+" : MINUS) + usd(Math.abs(n));

/** 부호에 따른 삼각형 — 원본의 arrow 규칙 */
export const arrow = (up: boolean) => (up ? "▲" : "▼");

/** 분 단위 지연 → "3분 전" / "2시간 전" / "1일 전" */
export const lagText = (minutes: number) => {
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
};
