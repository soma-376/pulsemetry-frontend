import { int, usd } from "@/lib/format";
import {
  ADMIN_EMAIL,
  VENDORS,
  type VendorContract,
  type VendorFamily,
  type VendorRecord,
} from "@/mocks/vendors";

/**
 * P5 설정.
 *
 * 이 화면의 전제 하나: **신호는 벤더의 존재만 증명합니다.**
 * 플랜·단가·좌석 수·계약 종료일은 텔레메트리에 없는 계약 정보라 사람이 입력해야 하고,
 * 그래서 "감지됨"과 "설정됨"을 끝까지 구분해서 보여줍니다.
 */

export const TODAY = "2026-09-17";

export type Plan = {
  v: string;
  label: string;
  bill: "seat" | "metered";
  /** 좌석료와 별개로 사용량이 청구되는 플랜 */
  usage: boolean;
  note: string;
};

/** 플랜은 청구 정보라 텔레메트리에 없습니다 — 벤더가 파는 목록에서 관리자가 고릅니다 */
export const PLAN_SETS: Record<VendorFamily, Plan[]> = {
  anthropic: [
    { v: "team", label: "Claude Team", bill: "seat", usage: false, note: "좌석당 정액 · 사용량 포함 · 최소 2석, 최대 150석" },
    { v: "enterprise", label: "Claude Enterprise", bill: "seat", usage: true, note: "좌석당 정액 + 토큰은 API 요율로 별도 청구" },
    { v: "api", label: "Anthropic API (종량제)", bill: "metered", usage: false, note: "좌석 없음 · 토큰 단가로만 청구" },
  ],
  openai: [
    { v: "business", label: "ChatGPT Business", bill: "seat", usage: false, note: "좌석당 정액 · 사용량 포함" },
    { v: "enterprise", label: "ChatGPT Enterprise", bill: "seat", usage: true, note: "좌석당 정액 + 사용량 별도 · 연간 계약" },
    { v: "api", label: "OpenAI API (종량제)", bill: "metered", usage: false, note: "좌석 없음 · 토큰 단가로만 청구" },
  ],
  generic: [
    { v: "seat_flat", label: "좌석 정액", bill: "seat", usage: false, note: "좌석당 정액 · 사용량 포함" },
    { v: "seat_usage", label: "좌석 + 사용량", bill: "seat", usage: true, note: "좌석당 정액 + 사용량 별도 청구" },
    { v: "metered", label: "종량제", bill: "metered", usage: false, note: "토큰 단가로만 청구" },
  ],
};

/** 신호가 없어 감지되지 않는 벤더 — 좌석만 보유하고 아무도 안 쓰는 계약이 여기 해당합니다 */
export const ADD_KINDS = [
  { v: "copilot", label: "GitHub Copilot Business" },
  { v: "gemini", label: "Google Gemini Code Assist" },
  { v: "azure_openai", label: "Azure OpenAI" },
  { v: "other", label: "기타 · 직접 입력" },
];

export const NEW_VENDOR_ID = "__new";

/** 드로어에서 편집 중인 계약 초안 — 문자열로 다룹니다(입력 중 상태를 숫자가 삼키면 안 됩니다) */
export type DraftTier = { label: string; seats: string; fee: string };

export type VendorDraft = {
  kind?: string;
  name?: string;
  plan?: string | null;
  tiers?: DraftTier[];
  term?: string;
  metered?: number;
};

/** 저장된 편집 — 벤더 id → 계약 패치. cleared 면 계약을 비운 상태입니다 */
export type VendorEdits = Record<
  string,
  (VendorContract & { plan?: string | null; cleared?: boolean; confirmed?: boolean; name?: string }) | undefined
>;

const toNumber = (v: string | number | undefined) =>
  parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;

export const tierSeats = (tiers: DraftTier[]) =>
  tiers.reduce((n, t) => n + Math.round(toNumber(t.seats)), 0);

export const tierSpend = (tiers: DraftTier[]) =>
  tiers.reduce((n, t) => n + Math.round(toNumber(t.seats)) * toNumber(t.fee), 0);

export const rowSpend = (t: DraftTier) =>
  Math.round(toNumber(t.seats)) * toNumber(t.fee);

/** 계약 좌석은 문자열 입력으로 다루므로 목 데이터를 초안 형태로 변환합니다 */
export const toDraftTiers = (contract: VendorContract): DraftTier[] =>
  (contract.tiers ?? []).map((t) => ({
    label: t.label,
    seats: String(t.seats),
    fee: t.fee.toFixed(2),
  }));

export const EMPTY_TIER: DraftTier = { label: "표준", seats: "", fee: "" };

/** 좌석 유형은 3개까지 — 그 이상은 계약서가 아니라 요금표입니다 */
export const MAX_TIERS = 3;

export type VendorRow = ReturnType<typeof buildVendorRows>[number];

/**
 * 목록 한 줄을 만듭니다.
 *
 * `setUp`(입력 완료)과 `confirmed`(사람이 확인함)를 나눠 두는 게 핵심입니다.
 * 입력이 바뀌면 확인이 풀리고, 확인 전까지 조직 합계는 이전 확인값을 씁니다 —
 * 오타 한 번이 전사 지출을 바꾸지 못하게 하는 장치입니다.
 */
export function buildVendorRows(edits: VendorEdits, added: VendorRecord[]) {
  return [...VENDORS, ...added].map((v) => {
    const edit = edits[v.id] ?? {};
    const contract: VendorContract & { plan?: string | null } = edit.cleared
      ? { ...edit }
      : { ...v.c, ...edit };

    const plans = PLAN_SETS[v.family];
    const plan = edit.cleared ? (contract.plan ?? null) : (contract.plan ?? v.plan);
    const planDef = plans.find((p) => p.v === plan) ?? null;
    const billing = planDef?.bill ?? null;
    const isSeat = billing === "seat";

    const tiers = toDraftTiers(contract);
    const draftTiers = tiers.length ? tiers : [EMPTY_TIER];
    const seats = tierSeats(draftTiers);
    const seatSpend = tierSpend(draftTiers);
    const metered = contract.metered ?? 0;

    // 좌석제는 좌석 수와 단가가 둘 다 있어야 금액이 성립합니다
    const setUp = !!billing && (isSeat ? seats > 0 && seatSpend > 0 : true);
    const confirmed = setUp && edit.confirmed !== false && !!contract.reviewedAt;
    const spendMonthly = isSeat ? seatSpend : metered;
    const noSignal = v.users === 0 && v.distinct30 === 0;

    return {
      id: v.id,
      short: edit.name ?? v.short,
      product: v.product,
      family: v.family,
      manual: !!v.manual,
      users: v.users,
      distinct30: v.distinct30,
      firstSeen: v.firstSeen,
      noSignal,

      plan,
      planDef,
      plans,
      billing,
      isSeat,
      seats,
      seatSpend,
      metered,
      spendMonthly,
      setUp,
      confirmed,
      contract,

      dot: !setUp ? "var(--gray)" : confirmed ? "var(--green)" : "var(--orange-ink)",
      statusLabel: !planDef
        ? "감지됨 · 미설정"
        : !setUp
          ? "입력 미완료"
          : confirmed
            ? "설정됨"
            : "확인 필요",
      statusFg: !setUp
        ? "var(--orange-ink)"
        : confirmed
          ? "var(--green)"
          : "var(--orange-ink)",
      seatsText: noSignal
        ? isSeat && setUp
          ? `${int(seats)}석 계약`
          : "신호 없음"
        : isSeat && setUp
          ? `${int(v.users)} / ${int(seats)}석`
          : `${int(v.users)}명 감지`,
      spendText: setUp ? `${usd(spendMonthly)} / 월` : "미입력",
      spendFg: setUp ? "var(--text)" : "var(--text3)",
      openLabel: `${edit.name ?? v.short} 계약 설정 열기`,
    };
  });
}

/**
 * 입력값과 신호를 대조한 한 줄.
 * 신호는 좌석 수의 하한을 증명합니다 — 활성 사용자가 계약 좌석보다 많으면 입력이 틀린 것입니다.
 */
export function contractCheck(input: {
  isSeat: boolean;
  isMetered: boolean;
  setUp: boolean;
  noSignal: boolean;
  users: number;
  distinct30: number;
  seats: number;
  stdFee: number;
}) {
  const { isSeat, isMetered, setUp, noSignal, users, distinct30, seats, stdFee } = input;

  if (isSeat && setUp) {
    if (noSignal)
      return {
        note: "대조할 신호가 없습니다 · 입력값이 유일한 출처이므로 인보이스와 직접 확인해야 합니다",
        fg: "var(--text2)",
      };
    if (users > seats)
      return {
        note: `활성 ${int(users)}명이 계약 ${int(seats)}석보다 많습니다 — 신호가 좌석의 하한을 증명하므로 입력값이 틀렸습니다`,
        fg: "var(--red)",
      };
    if (distinct30 > seats)
      return {
        note: `30일 누적 ${int(distinct30)}명 > 계약 ${int(seats)}석 · 좌석 회전이거나 입력 오류입니다`,
        fg: "var(--orange-ink)",
      };
    return {
      note: `활성 ${int(users)}명 ≤ 계약 ${int(seats)}석 · 미사용 ${int(seats - users)}석 (표준 기준 월 ${usd((seats - users) * stdFee)})`,
      fg: "var(--green)",
    };
  }

  if (isMetered)
    return {
      note: "토큰을 직접 세므로 비용이 입력 없이 확정됩니다 · 벤더 콘솔 합계와 오차 0.4%",
      fg: "var(--green)",
    };

  return null;
}

/** 상단 요약 4장 — 0 과 "해당 없음"을 구분합니다 */
export function vendorSummary(rows: VendorRow[]) {
  const done = rows.filter((r) => r.setUp);
  const pending = rows.filter((r) => !r.setUp);
  const seatRows = done.filter((r) => r.isSeat);

  const seatSpendAll = seatRows.reduce((n, r) => n + r.seatSpend, 0);
  const meteredAll = done.filter((r) => !r.isSeat).reduce((n, r) => n + r.metered, 0);
  const seatsAll = seatRows.reduce((n, r) => n + r.seats, 0);
  const activeAll = seatRows.reduce((n, r) => n + r.users, 0);
  const pendingUsers = pending.reduce((n, r) => n + r.users, 0);

  const gray = { bg: "var(--gray-tint)", fg: "var(--text2)" };
  const green = { bg: "var(--green-tint)", fg: "var(--green)" };

  return [
    {
      label: "좌석 지출",
      badge: { text: "파생", ...gray },
      value: usd(seatSpendAll),
      note: `좌석제 계약 ${seatRows.length}곳 합`,
      tone: "var(--text)",
    },
    // 종량제 계약이 없으면 $0.00 이 아니라 "해당 없음" — 0 과 미해당은 다릅니다
    done.some((r) => !r.isSeat)
      ? {
          label: "종량 지출",
          badge: { text: "측정", ...green },
          value: usd(meteredAll),
          note: "토큰 실측 · 입력 없이 확정",
          tone: "var(--text)",
        }
      : {
          label: "종량 지출",
          badge: { text: "해당 없음", ...gray },
          value: "—",
          note: "종량제 계약이 없습니다",
          tone: "var(--text3)",
        },
    {
      label: "활성 좌석",
      badge: { text: "측정", ...green },
      value: `${int(activeAll)} / ${int(seatsAll)}`,
      note: seatsAll
        ? `${((activeAll / seatsAll) * 100).toFixed(0)}% · 미사용 ${int(seatsAll - activeAll)}석`
        : "계약 좌석 미입력",
      tone: "var(--text)",
    },
    {
      label: "미설정 벤더",
      badge: { text: "측정", ...green },
      value: `${pending.length}곳`,
      note: `감지 ${int(pendingUsers)}명 · 합계에 미포함`,
      tone: pending.length ? "var(--orange-ink)" : "var(--text)",
    },
  ];
}

/* ── 수집 정책 ───────────────────────────────────────── */

export const POLICY_VERSION = 1;

export const KEEP_NOTES: Record<string, string> = {
  "12": "최근 1년만 남깁니다 · 전년 동월 비교는 경계에서 끊깁니다",
  "24": "2년 보관 · 전년 동월 비교가 가능합니다",
  "36": "3년 보관 · 2년 전 같은 달까지 비교할 수 있습니다",
  none: "삭제하지 않고 계속 보관합니다 · 감사 범위와 용량이 계속 늘어납니다",
};

/** 보존 기간의 길이 순서 — 줄이는 방향만 확인을 받습니다 */
export const KEEP_ORDER: Record<string, number> = { "12": 1, "24": 2, "36": 3, none: 4 };

/** 회수 후보 수는 기준일에 따라 달라집니다 (P6 구성원과 같은 명부) */
export const RECLAIM_BY_IDLE: Record<string, number> = { "7": 9, "14": 9, "30": 6, "60": 2 };

export const STALE_INSTALLS = [
  { id: "inst_8f3a41c0", mail: "***@codeworks.io", team: "데이터", ver: "v0.9", last: "2시간 전" },
  { id: "inst_2b71c9e4", mail: "***@codeworks.io", team: "결제", ver: "v0.9", last: "1일 전" },
  { id: "inst_5d0e77ab", mail: "***@codeworks.io", team: "플랫폼", ver: "v0.8", last: "3일 전" },
  { id: "inst_c194a2f7", mail: "***@vendor.dev", team: "모바일", ver: "v0.9", last: "6시간 전" },
];

export type PolicyAsk =
  | { kind: "prompt"; value: boolean }
  | { kind: "keep"; value: string };

/**
 * 되돌릴 수 없는 변경에만 확인을 받습니다.
 * 프롬프트 수집은 켜든 끄든 수집 정책 버전이 올라가 전 설치에 배포되므로 양방향,
 * 보존 기간은 줄일 때만 — 늘리는 건 아무것도 지우지 않습니다.
 */
export function policyCopy(ask: PolicyAsk, currentKeep: string) {
  const version = { k: "수집 정책 버전", v: `v${POLICY_VERSION} → v${POLICY_VERSION + 1}` };
  const foot = "각 설치가 다음 실행 때 새 정책을 받아갑니다 · 변경은 감사 로그에 기록됩니다";

  if (ask.kind === "prompt") {
    return ask.value
      ? {
          title: "프롬프트 원문 수집을 켭니다",
          badge: { text: "개인정보 범위 변경", bg: "var(--red-tint)", fg: "var(--red)" },
          body: "이 순간부터 프롬프트와 응답 본문이 저장됩니다 · 코드, 고객 정보, 자격증명이 함께 들어올 수 있습니다",
          rows: [version, { k: "적용 대상", v: "설치 128대 전체" }, { k: "과거 기간", v: "소급 적용 없음" }],
          foot,
          okLabel: "켜기",
          danger: true,
        }
      : {
          title: "프롬프트 원문 수집을 끕니다",
          badge: { text: "수집 정책 배포", bg: "var(--blue-tint)", fg: "var(--blue)" },
          body: "이후 본문은 저장되지 않고 길이와 토큰 수만 집계됩니다 · 이미 저장된 원문은 보존 기간까지 남습니다",
          rows: [version, { k: "적용 대상", v: "설치 128대 전체" }, { k: "기존 원문", v: "보존 기간까지 유지" }],
          foot,
          okLabel: "끄기",
          danger: false,
        };
  }

  return {
    title: "집계 보존 기간을 줄입니다",
    badge: { text: "데이터 삭제", bg: "var(--red-tint)", fg: "var(--red)" },
    body: "새 기간을 넘는 집계는 삭제되고 복구할 수 없습니다 · 그만큼 과거 비교가 불가능해집니다",
    rows: [
      {
        k: "보존 기간",
        v: `${currentKeep === "none" ? "미적용" : `${currentKeep}개월`} → ${ask.value === "none" ? "미적용" : `${ask.value}개월`}`,
      },
      version,
    ],
    foot: "삭제는 즉시 반영되지 않고 다음 집계 주기에 수행됩니다 · 변경은 감사 로그에 기록됩니다",
    okLabel: "줄이기",
    danger: true,
  };
}

/* ── 알림 규칙 ───────────────────────────────────────── */

export const ALERT_RULES = [
  { id: "spend_spike", title: "비용 급증 알림", desc: "팀 사용량이 전주 대비 급증할 때", threshold: "+40%" },
  { id: "quota_exceeded", title: "한도 초과 알림", desc: "좌석 한도에 걸려 요청이 차단될 때", threshold: "5명" },
  { id: "model_not_allowed", title: "비허용 모델 호출 알림", desc: "허용목록에 없는 모델이 호출될 때", threshold: "1회" },
  { id: "tool_unapproved", title: "미승인 도구 연결 알림", desc: "승인되지 않은 도구가 연결될 때", threshold: "1회" },
];

export { ADMIN_EMAIL };
