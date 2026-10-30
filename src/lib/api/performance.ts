import { queryOptions } from "@tanstack/react-query";
import { performanceSample } from "@/mocks/performance";
import type { CompareKey } from "@/types/domain";
import { organizationKey } from "./query-keys";

/** 성과 화면의 범위. 전체는 조직 합계, 나머지는 예시 데이터의 4개 팀이다. */
export const PERFORMANCE_SCOPES = {
  all: "전체",
  platform: "플랫폼",
  payments: "결제",
  data: "데이터",
  mobile: "모바일",
} as const;
export type PerformanceScope = keyof typeof PERFORMANCE_SCOPES;
export const TEAM_SCOPES = [
  "platform",
  "payments",
  "data",
  "mobile",
] as const satisfies readonly PerformanceScope[];

export function parseScope(value: string | null): PerformanceScope {
  return value && value in PERFORMANCE_SCOPES
    ? (value as PerformanceScope)
    : "all";
}

/** 현재 기간 값과 이전 기간 값. 백엔드가 값을 주지 못하면 null 이다. */
export type Pair = { current: number | null; previous: number | null };

export type ScopeSample = {
  usage: {
    members: Pair;
    activeMembers: Pair;
    /** 토큰 사용량(백만 단위) */
    tokensM: Pair;
  };
  output: {
    completedTickets: Pair;
    /** 티켓 In Progress → Done 중앙값(일) */
    cycleDays: Pair;
  };
  attribution: {
    /** 완료 티켓에 귀속된 토큰 비율(%) */
    ticketLinkedPct: Pair;
    /** 머지된 PR에 귀속된 토큰 비율(%) */
    mergedSharePct: Pair;
  };
  delivery: {
    /** 운영 배포 사이 평균 간격(일) */
    releaseDays: Pair;
    /** revert·hotfix 대상 PR에 귀속된 AI 환산 금액(USD) */
    wasteUsd: Pair;
    reverts: number | null;
    hotfixes: number | null;
    ciFailures: Pair;
    releaseFailures: Pair;
    rejectedPrs: Pair;
    stalePrs: Pair;
  };
};

export type PerformancePeriod = {
  startDate: string;
  endDate: string;
  compare: CompareKey;
};

export type PerformanceView = {
  meta: PerformancePeriod & {
    /** 예시 데이터 여부. 화면에 "예시 데이터"를 표시한다. */
    sample: boolean;
    /** 토큰 100만 개당 환산 금액(USD) */
    usdPerMillionTokens: number;
  };
  scopes: Record<PerformanceScope, ScopeSample>;
};

/** 범위는 키에 넣지 않는다. 전체 평균을 함께 그리므로 한 응답에 모든 범위가 들어 있다. */
export const performanceKey = (org: string, period: PerformancePeriod) =>
  [
    ...organizationKey(org),
    "performance",
    period.startDate,
    period.endDate,
    period.compare,
  ] as const;

/**
 * 성과 데이터를 주는 백엔드 API가 아직 없어 예시 데이터가 유일한 출처다(실패 시 대체가 아니다).
 * API가 생기면 이 본문을 `apiJson` + zod 스키마 조회로 바꾸고 `@/mocks/performance` 는 지운다.
 */
export async function fetchPerformance(
  _org: string,
  period: PerformancePeriod,
  signal?: AbortSignal,
): Promise<PerformanceView> {
  signal?.throwIfAborted();
  return performanceSample(period);
}

export const performanceQueryOptions = (
  org: string,
  period: PerformancePeriod,
) =>
  queryOptions({
    queryKey: performanceKey(org, period),
    queryFn: ({ signal }) => fetchPerformance(org, period, signal),
    staleTime: Infinity,
  });
