import { vendorIdentity, type VendorFamily } from "@/lib/vendor-catalog";
export type { VendorFamily } from "@/lib/vendor-catalog";
import type { SeatTier } from "@/types/domain";

/**
 * 벤더 계약 — P5 설정 화면의 입력이 원천입니다.
 * P1 개요의 "지출"과 P6 구성원의 좌석 수가 전부 여기서 파생되므로,
 * 세 페이지가 같은 숫자를 보게 하는 경계입니다.
 *
 * 신호는 벤더의 "존재"만 증명합니다 — 플랜·단가·좌석 수·계약 종료일은
 * 텔레메트리에 없는 계약 정보라 관리자가 입력해야 합니다.
 * users/distinct30/firstSeen 만 측정값이고 c(contract) 는 전부 수동 입력입니다.
 */



export type VendorContract = {
  planName?: string;
  tiers?: SeatTier[];
  /** 종량제 계약의 실측 월 비용 */
  metered?: number;
  /** 계약 종료일 (YYYY-MM-DD) */
  term?: string;
  reviewedAt?: string;
  reviewer?: string;
  nextReview?: string;
};

export type VendorRecord = {
  id: string;
  name: string;
  /** 목록에 쓰는 짧은 이름 */
  short: string;
  product: string;
  family: VendorFamily;
  kind?: string;
  /** 선택된 플랜 키. 미설정이면 null */
  plan: string | null;
  /** 수동 추가한 벤더 — 신호가 없습니다 */
  manual?: boolean;

  /* ── 여기부터 측정값 ── */
  /** 7일 고유 사용자 */
  users: number;
  /** 30일 누적 고유 사용자 */
  distinct30: number;
  firstSeen: string;

  /* ── 여기부터 수동 입력 계약 ── */
  c: VendorContract;
};

export const ADMIN_EMAIL = "admin@codeworks.io";

export const VENDORS: VendorRecord[] = [
  {
    id: "claude_team",
    ...vendorIdentity("claude_team"),
    plan: "team",
    users: 117,
    distinct30: 131,
    firstSeen: "2026-02-11",
    c: {
      tiers: [
        { label: "표준", seats: 125, fee: 20 },
        { label: "프리미엄", seats: 23, fee: 100 },
      ],
      term: "2026-12-31",
      reviewedAt: "2026-09-01",
      reviewer: ADMIN_EMAIL,
      nextReview: "2026-11-01",
    },
  },
  {
    id: "openai_biz",
    ...vendorIdentity("openai_biz"),
    // 감지는 됐지만 계약이 등록되지 않아 합계에서 빠져 있습니다
    plan: null,
    users: 34,
    distinct30: 41,
    firstSeen: "2026-07-04",
    c: {},
  },
  {
    id: "cursor",
    ...vendorIdentity("cursor"),
    plan: null,
    users: 11,
    distinct30: 14,
    firstSeen: "2026-08-29",
    c: {},
  },
];

/** 좌석제 계약의 좌석 종류 전부 — 표준 125석 × $20 + 프리미엄 23석 × $100 = $4,800/월 */
export const SEAT_TIERS: SeatTier[] = VENDORS.flatMap((v) => v.c.tiers ?? []);

/** 유휴 좌석 회수액을 계산할 때 쓰는 기준 단가 (가장 낮은 등급) */
export const STD_SEAT_FEE = SEAT_TIERS[0].fee;
