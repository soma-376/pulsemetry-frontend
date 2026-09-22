/** 도메인 타입 — 목 데이터와 계산 레이어가 공유하는 계약 */

export type RangeKey = "24h" | "7d" | "28d" | "90d";
export type CompareKey = "prev_week" | "prev_period" | "none";

/** 좌석 종류 — P5 설정의 벤더 계약 입력이 원천 */
export type SeatTier = {
  label: string;
  seats: number;
  /** 월 단가 (USD) */
  fee: number;
};

export type Vendor = {
  id: string;
  name: string;
  product: string;
  family: "anthropic" | "openai" | "generic";
  plan: string;
  /** 좌석제 계약만 tiers 를 가집니다 */
  tiers?: SeatTier[];
  configured: boolean;
};

/** 수집 상태 — 값을 0으로 내리지 않고 마지막 확정값을 유지하기 위한 입력 */
export type IngestState = {
  /** 마지막 적재로부터 경과 분 */
  lagMinutes: number;
  /** 데몬 설치 이후 관측된 일수. 0 이면 신호가 한 번도 없었던 조직 */
  observedDays: number;
  /** 관측 시작일 (YYYY-MM-DD) */
  observedFrom: string;
  /** 마지막 확정 적재 시각 표시용 */
  lastIngestAt: string;
};

export type ModelMeta = {
  /** 내부 키 */
  v: string;
  name: string;
  /** 백만 토큰당 공시 단가 (USD) */
  perM: number;
};

export type TeamSource = {
  team: string;
  users: number;
  prevUsers: number;
  /** 비용 배분 가중치 */
  costW: number;
  /** 전사 증가분 배분 가중치 (음수 = 절감) */
  gainW: number;
  /** 증감 원인 판정 문구 */
  cause: string;
};

export type WasteSource = {
  title: string;
  /** 해당 항목 비율(%) */
  rate: number;
  /** 월 환산 낭비액 (USD) */
  cost: number;
  /** 비교 기간 값 */
  prev: number;
};

export type Finding = {
  sev: "이상" | "주의" | "정보";
  widget: string;
  href: string;
  title: string;
  evidence: { k: string; v: string }[];
  action: string;
};
