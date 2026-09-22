import { usd } from "@/lib/format";
import type { SeatTier } from "@/types/domain";

/**
 * 좌석 경제성 — 좌석제 계약이 물을 수 있는 유일한 질문에 답하는 계산.
 *
 *   지출(spend)      = 계약 좌석 × 좌석료 × (조회일수 / 30)   ← 실제 청구액
 *   환산가치(equiv)  = 사용 토큰 × 벤더 공시 단가             ← 같은 사용량을 종량제로 샀다면
 *   좌석 효율        = 환산가치 ÷ 지출
 *
 * 1.00× 가 종량제와 본전입니다. 그 아래면 좌석이 값을 못 하고 있는 것.
 */

export type SeatEconomics = ReturnType<typeof seatEconomics>;

export function seatEconomics(params: {
  tiers: SeatTier[];
  /** 기간 내 활성 사용자 수 */
  activeUsers: number;
  /** 기간 환산가치 (USD) */
  equivValue: number;
  /** 비교 기간 환산가치 (USD) */
  prevEquivValue: number;
  rangeDays: number;
  /** 유휴 좌석 회수액 계산에 쓰는 기준 단가 */
  stdFee: number;
}) {
  const { tiers, activeUsers, equivValue, prevEquivValue, rangeDays, stdFee } =
    params;

  const seats = tiers.reduce((n, t) => n + t.seats, 0);
  const seatSpendMonthly = tiers.reduce((n, t) => n + t.seats * t.fee, 0);
  const spend = (seatSpendMonthly * rangeDays) / 30;

  const idleSeats = seats - activeUsers;
  const idleWasteMonthly = idleSeats * stdFee;

  const seatEff = equivValue / spend;
  // 지출은 계약이라 기간 내에 변하지 않습니다 — 효율 증감은 환산가치 증감이 그대로 따라옵니다
  const prevSeatEff = prevEquivValue / spend;
  const effGrowth = seatEff / prevSeatEff - 1;

  const gainOverMetered = equivValue - spend;
  const above = equivValue >= spend;

  /** 유휴 좌석을 전부 회수했을 때의 효율 */
  const reclaimedSpend =
    ((seatSpendMonthly - idleSeats * stdFee) * rangeDays) / 30;
  const seatEffIfReclaimed = equivValue / reclaimedSpend;

  return {
    seats,
    seatSpendMonthly,
    spend,
    idleSeats,
    idleWasteMonthly,
    seatEff,
    effGrowth,
    gainOverMetered,
    above,
    seatEffIfReclaimed,
    seatEffText: seatEff.toFixed(2),
  };
}

/** W1.2 상단 판정 배너 문구 */
export function seatVerdict(e: SeatEconomics, equivValue: number) {
  return {
    title: e.above
      ? `좌석 효율 ${e.seatEffText}× — 종량제 대비 ${usd(e.gainOverMetered)} 절약`
      : `좌석 효율 ${e.seatEffText}× — 좌석이 값을 못 하고 있습니다`,
    detail: `종량제 환산 ${usd(equivValue)} · 지출 ${usd(e.spend)} · 유휴 ${e.idleSeats}석`,
    color: e.above ? "var(--green)" : "var(--red)",
    bg: e.above ? "var(--sub)" : "var(--red-tint)",
    border: e.above ? "var(--border)" : "var(--red)",
  };
}
