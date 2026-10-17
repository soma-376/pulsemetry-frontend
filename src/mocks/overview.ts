// 기존 Codeworks UI 데모. A회사 백엔드 시드는 ./company-a.ts 참조 (README.md).
import type {
  IngestState,
  ModelMeta,
  TeamSource,
  WasteSource,
} from "@/types/domain";

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
  {
    team: "모바일",
    users: 15,
    prevUsers: 14,
    costW: 214,
    gainW: 3,
    cause: "—",
  },
];

/** 팀 미배분분의 증가 기여 가중치 */
export const UNATTRIBUTED_GAIN_WEIGHT = 34;
