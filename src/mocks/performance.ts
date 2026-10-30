import type {
  Pair,
  PerformancePeriod,
  PerformanceScope,
  PerformanceView,
  ScopeSample,
} from "@/lib/api/performance";

/**
 * 성과 화면 예시 데이터 — 디자인 시안(성과 C안)의 표본 값.
 * 30일 기간을 가정한 값이며 선택한 기간에 따라 바뀌지 않는다.
 */
const pair = (current: number, previous: number): Pair => ({
  current,
  previous,
});

type Row = {
  members: number;
  active: [number, number];
  tokensM: [number, number];
  tickets: [number, number];
  cycleDays: [number, number];
  ticketLinkedPct: [number, number];
  mergedSharePct: [number, number];
  releaseDays: [number, number];
  wasteUsd: [number, number];
  reverts: number;
  hotfixes: number;
  ci: [number, number];
  releaseFailures: [number, number];
  rejectedPrs: [number, number];
  stalePrs: [number, number];
};

const ROWS: Record<PerformanceScope, Row> = {
  all: {
    members: 101,
    active: [97, 88],
    tokensM: [412, 318],
    tickets: [486, 421],
    cycleDays: [3.1, 3.8],
    ticketLinkedPct: [71, 66],
    mergedSharePct: [62, 58],
    releaseDays: [2.4, 3.2],
    wasteUsd: [1940, 1520],
    reverts: 14,
    hotfixes: 9,
    ci: [312, 268],
    releaseFailures: [6, 5],
    rejectedPrs: [74, 81],
    stalePrs: [23, 31],
  },
  platform: {
    members: 42,
    active: [40, 37],
    tokensM: [168, 130],
    tickets: [198, 171],
    cycleDays: [2.6, 3.2],
    ticketLinkedPct: [74, 69],
    mergedSharePct: [65, 61],
    releaseDays: [1.6, 2.1],
    wasteUsd: [820, 610],
    reverts: 6,
    hotfixes: 4,
    ci: [128, 104],
    releaseFailures: [2, 2],
    rejectedPrs: [28, 30],
    stalePrs: [7, 11],
  },
  payments: {
    members: 27,
    active: [25, 24],
    tokensM: [115, 96],
    tickets: [132, 124],
    cycleDays: [3.4, 3.9],
    ticketLinkedPct: [70, 66],
    mergedSharePct: [60, 57],
    releaseDays: [3.0, 3.4],
    wasteUsd: [540, 500],
    reverts: 4,
    hotfixes: 3,
    ci: [86, 80],
    releaseFailures: [2, 1],
    rejectedPrs: [21, 22],
    stalePrs: [6, 8],
  },
  data: {
    members: 20,
    active: [19, 15],
    tokensM: [66, 52],
    tickets: [88, 70],
    cycleDays: [3.3, 4.4],
    ticketLinkedPct: [68, 60],
    mergedSharePct: [58, 52],
    releaseDays: [3.8, 5.1],
    wasteUsd: [390, 260],
    reverts: 3,
    hotfixes: 1,
    ci: [61, 48],
    releaseFailures: [1, 1],
    rejectedPrs: [15, 18],
    stalePrs: [5, 7],
  },
  mobile: {
    members: 11,
    active: [9, 6],
    tokensM: [41, 25],
    tickets: [52, 46],
    cycleDays: [4.6, 4.9],
    ticketLinkedPct: [64, 60],
    mergedSharePct: [55, 50],
    releaseDays: [7.0, 7.5],
    wasteUsd: [190, 150],
    reverts: 1,
    hotfixes: 1,
    ci: [37, 36],
    releaseFailures: [1, 1],
    rejectedPrs: [10, 11],
    stalePrs: [5, 5],
  },
};

const sampleOf = (row: Row): ScopeSample => ({
  usage: {
    members: pair(row.members, row.members),
    activeMembers: pair(...row.active),
    tokensM: pair(...row.tokensM),
  },
  output: {
    completedTickets: pair(...row.tickets),
    cycleDays: pair(...row.cycleDays),
  },
  attribution: {
    ticketLinkedPct: pair(...row.ticketLinkedPct),
    mergedSharePct: pair(...row.mergedSharePct),
  },
  delivery: {
    releaseDays: pair(...row.releaseDays),
    wasteUsd: pair(...row.wasteUsd),
    reverts: row.reverts,
    hotfixes: row.hotfixes,
    ciFailures: pair(...row.ci),
    releaseFailures: pair(...row.releaseFailures),
    rejectedPrs: pair(...row.rejectedPrs),
    stalePrs: pair(...row.stalePrs),
  },
});

export function performanceSample(period: PerformancePeriod): PerformanceView {
  return {
    meta: { ...period, sample: true, usdPerMillionTokens: 50 },
    scopes: {
      all: sampleOf(ROWS.all),
      platform: sampleOf(ROWS.platform),
      payments: sampleOf(ROWS.payments),
      data: sampleOf(ROWS.data),
      mobile: sampleOf(ROWS.mobile),
    },
  };
}
