import type {
  Finding,
  IngestState,
  ModelMeta,
  TeamSource,
  WasteSource,
} from "@/types/domain";

/**
 * P1 개요의 원시 수치. 파생값은 하나도 두지 않습니다 —
 * 모든 계산은 src/lib/metrics/* 순수 함수가 담당합니다.
 */

/** 조회 기간 (일). 전역 필터의 7d 에 해당합니다 */
export const RANGE_DAYS = 7;

export const PERIOD_LABEL = "2026-08-31 ~ 2026-09-07";

/* ── 수집 상태 ──────────────────────────────────────────────
   lagMinutes: 3(정상) / 45(지연) / 1080(중단)
  observedDays: 0(빈 조직) / 63(정상)
   이 두 값만 바꾸면 빈 상태·해칭·비교불가 분기를 전부 확인할 수 있습니다. */
export const INGEST: IngestState = {
  lagMinutes: 3,
  observedDays: 63,
  observedFrom: "2026-07-13",
  lastIngestAt: "9-13 09:02",
};

export const COVERAGE = {
  activeInstalls: 128,
  activeMembers: 154,
  coverageText: "83%",
};

export const INSTALL_CMD =
  "curl -fsSL https://get.pulsemetry.io | sh -s -- --org codeworks --token pm_live_8f3a";

/* ── 조직 기준 사실 · 아래 모든 델타와 팀 수치가 여기서 분해됩니다 ── */
export const ORG = {
  activeUsers: 117,
  prevUsers: 108,
  /** 전사 환산가치 증가율 */
  costGrowth: 0.124,
  /** 팀 귀속에 실패한 사용자 수 */
  unmappedUsers: 6,
  /** 팀 미배분 비용이 전체에서 차지하는 비중 */
  unattributedShare: 0.124,
  sessions: 2341,
  sessionsDelta: "+9.6%",
  alerts: 5,
  alertsDelta: "+2건",
};

/** 일별 환산가치(공시 단가 기준) — 9/3 스파이크 포함 */
export const DAILY_LISTED = [
  498.12, 541.8, 522.45, 1312.66, 560.21, 471.03, 402.88, 503.22,
];

/** 실측 토큰 (백만 단위) */
export const TOKENS = {
  inM: 266,
  outM: 62,
  cacheM: 741,
  prevTotalM: 984,
};

/* ── 주간 시계열 — W1.2 환산가치 vs 지출 ── */
export const WEEK_LABELS = [
  "7/13",
  "7/20",
  "7/27",
  "8/3",
  "8/10",
  "8/17",
  "8/24",
  "8/31",
];
export const WEEK_IN_TOKENS = [182, 196, 171, 214, 229, 205, 248, 266];
export const WEEK_OUT_TOKENS = [41, 44, 38, 48, 52, 46, 57, 62];
/** 주차가 갈수록 비싼 모델로 이동하는 믹스 드리프트 계수 */
export const WEEK_MIX_DRIFT = [1, 1, 1.005, 1.008, 1.02, 1.03, 1.06, 1.095];

/* ── 모델 ── */
export const MODEL_META: ModelMeta[] = [
  { v: "opus", name: "claude-opus-4-1", perM: 35.3 },
  { v: "sonnet", name: "claude-sonnet-4-5", perM: 13.52 },
  { v: "codex", name: "gpt-5-codex", perM: 15.77 },
  { v: "haiku", name: "claude-haiku-4-5", perM: 4.13 },
  { v: "sonnet37", name: "claude-sonnet-3-7", perM: 9.6 },
  { v: "mini", name: "gpt-5-mini", perM: 1.85 },
  { v: "opus4", name: "claude-opus-4", perM: 33.1 },
];

/** 상위 4개 모델에만 색을 주고 나머지는 "기타"로 묶습니다 */
export const MODEL_COLORS: Record<string, string> = {
  opus: "var(--purple)",
  sonnet: "var(--blue)",
  codex: "var(--orange)",
  haiku: "var(--green)",
};

/** 팀별 비용 배분 가중치 */
export const TEAM_COST_WEIGHTS: Record<string, number> = {
  플랫폼: 1180,
  결제: 742,
  데이터: 486,
  프론트엔드: 398,
  모바일: 214,
};

/** 팀별 모델 구성 · 각 행의 합은 1.000 */
export const MODEL_SHARE: Record<string, Record<string, number>> = {
  플랫폼: {
    opus: 0.56,
    sonnet: 0.3,
    haiku: 0.033,
    codex: 0.07,
    sonnet37: 0.02,
    mini: 0.012,
    opus4: 0.005,
  },
  결제: {
    opus: 0.43,
    sonnet: 0.41,
    haiku: 0.045,
    codex: 0.075,
    sonnet37: 0.02,
    mini: 0.015,
    opus4: 0.005,
  },
  데이터: {
    opus: 0.32,
    sonnet: 0.495,
    haiku: 0.057,
    codex: 0.09,
    sonnet37: 0.02,
    mini: 0.013,
    opus4: 0.005,
  },
  프론트엔드: {
    opus: 0.15,
    sonnet: 0.47,
    haiku: 0.27,
    codex: 0.07,
    sonnet37: 0.02,
    mini: 0.015,
    opus4: 0.005,
  },
  모바일: {
    opus: 0.23,
    sonnet: 0.53,
    haiku: 0.125,
    codex: 0.07,
    sonnet37: 0.025,
    mini: 0.015,
    opus4: 0.005,
  },
  미배정: {
    opus: 0.29,
    sonnet: 0.385,
    haiku: 0.115,
    codex: 0.17,
    sonnet37: 0.02,
    mini: 0.015,
    opus4: 0.005,
  },
};

/** 도넛 중앙 문구가 쓰는 최상위 모델의 토큰 비중(%) */
export const TOP_MODEL_TOKEN_SHARE = 27;

/* ── W1.6 사용 낭비 ── */
export const WASTE: WasteSource[] = [
  { title: "캐시 미스", rate: 18.4, cost: 214, prev: 191 },
  { title: "재시도 · 중단", rate: 11.2, cost: 138, prev: 144 },
  { title: "과대 컨텍스트", rate: 9.1, cost: 96, prev: 73 },
];

/* ── W1.7 팀별 사용량 ── */
export const TEAM_SOURCES: TeamSource[] = [
  {
    team: "플랫폼",
    users: 32,
    prevUsers: 29,
    costW: 1180,
    gainW: 180,
    cause: "opus 전환 (비중 +18pt)",
  },
  {
    team: "결제",
    users: 21,
    prevUsers: 19,
    costW: 742,
    gainW: 95,
    cause: "캐시 효율 저하 (read −22pt)",
  },
  {
    team: "데이터",
    users: 18,
    prevUsers: 17,
    costW: 486,
    gainW: 12,
    cause: "사용량 증가 (정상)",
  },
  {
    team: "프론트엔드",
    users: 25,
    prevUsers: 24,
    costW: 398,
    gainW: -8,
    cause: "haiku 전환 (절감)",
  },
  { team: "모바일", users: 15, prevUsers: 14, costW: 214, gainW: 3, cause: "—" },
];

/** 팀 미배분분의 증가 기여 가중치 */
export const UNATTRIBUTED_GAIN_WEIGHT = 34;

/* ── 시나리오 findings (기본 off) ── */
export const FINDINGS: Finding[] = [
  {
    sev: "이상",
    widget: "W1.2",
    href: "#w12",
    title: "9/3 비용이 이동평균 대비 +340%",
    evidence: [
      { k: "cost 9/3", v: "$1,312.66" },
      { k: "MA(7d) 9/2", v: "$298.41" },
      { k: "team", v: "데이터 (+$856)" },
    ],
    action:
      "query_source=subagent 비중 71% → 에이전트 루프 의심. 데이터 팀 9/3 14h 세션을 P3 세션 조회(사유 필수)로 확인.",
  },
  {
    sev: "주의",
    widget: "W1.3",
    href: "#w13",
    title: "데이터 팀 비용이 활성 사용자당 2.1×(전사 평균 대비)",
    evidence: [
      { k: "cost_per_active_user", v: "$42.41 vs $19.98" },
      { k: "model", v: "claude-opus-4-1 58%" },
    ],
    action: "모델 티어 확인 — S1-2 모델 티어 미스매치로 이어서 실행.",
  },
];
