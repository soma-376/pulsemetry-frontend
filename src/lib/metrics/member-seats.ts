import { DAY_MS, fromIso } from "@/lib/date";
import type { MemberSeat } from "@/types/member-seat";

export const DEFAULT_SEAT_REVIEW_DAYS = 14;
export type SeatReview = "candidate" | "observed" | "hold" | "unassigned";

/** A missing signal alone does not prove that a paid seat is unused. */
export function reviewMemberSeat(seat: MemberSeat, asOf: string, idleDays: number) {
  const elapsed = (date: string) => (fromIso(asOf).getTime() - fromIso(date.slice(0, 10)).getTime()) / DAY_MS;
  let review: SeatReview = "hold";
  let reason = "배정 정보 확인 필요";
  if (seat.assignment === "unassigned") {
    review = "unassigned";
    reason = "배정이 해제된 좌석입니다";
  } else if (seat.assignment === "assigned" && seat.tier && seat.assignedOn) {
    if (!seat.lastObservedAt) reason = "최근 관측 기록 확인 필요";
    else if (elapsed(seat.assignedOn) < 0 || elapsed(seat.lastObservedAt) < 0) reason = "관측 날짜 확인 필요";
    else if (elapsed(seat.lastObservedAt) < idleDays) {
      review = "observed";
      reason = `최근 ${idleDays}일 내 사용 관측`;
    } else if (elapsed(seat.assignedOn) < idleDays) reason = "좌석 배정 후 관측 기간이 부족합니다";
    else if (!seat.coverage || seat.coverage.through !== asOf || elapsed(seat.coverage.from) < idleDays) {
      reason = "수집 누락 또는 관측 기간 부족으로 판단을 보류합니다";
    } else {
      review = "candidate";
      reason = `${idleDays}일 이상 사용 미관측 · 회수 전 실제 사용 여부 확인`;
    }
  }
  const labels: Record<SeatReview, string> = { candidate: "회수 후보", observed: "활성", hold: "판단 보류", unassigned: "대상 아님" };
  return { ...seat, review, reviewLabel: labels[review], reason };
}

export function buildMemberSeats(seats: MemberSeat[], asOf: string, idleDays = DEFAULT_SEAT_REVIEW_DAYS) {
  return seats.map((seat) => reviewMemberSeat(seat, asOf, idleDays));
}

export type MemberSeatRow = ReturnType<typeof reviewMemberSeat>;

/** Summary badges can coexist: recent use on one vendor does not clear another seat's candidate status. */
export function memberSeatStatus(seats: MemberSeatRow[], idleDays: number | null, threshold: number) {
  const active = seats.length ? seats.some((seat) => seat.review === "observed") : idleDays !== null && idleDays < threshold;
  const candidate = seats.some((seat) => seat.review === "candidate");
  const unobserved = seats.length ? seats.every((seat) => !seat.lastObservedAt) : idleDays === null;
  return { active, candidate, unobserved };
}

export function formatSeatActivity(value: string | null) {
  if (!value) return "관측 기록 없음";
  if (!value.includes("T")) return value.replaceAll("-", ".");
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replaceAll("-", ".");
}
