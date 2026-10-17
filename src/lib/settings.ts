import { getVendorPlans } from "./vendor-catalog";
import { int, usd } from "@/lib/format";
import {
  ADMIN_EMAIL,
  VENDORS,
  type VendorContract,
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

export {
  ADD_KINDS,
  PLAN_SETS,
  getVendorPlans,
  type Plan,
} from "./vendor-catalog";

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
  planName?: string;
};

/** 저장된 편집 — 벤더 id → 계약 패치. cleared 면 계약을 비운 상태입니다 */
export type VendorEdits = Record<
  string,
  | (VendorContract & {
      plan?: string | null;
      cleared?: boolean;
      confirmed?: boolean;
      name?: string;
    })
  | undefined
>;

// 지수 표기로 직렬화되는 작은 단가도 편집 시 원래 소수 값으로 복원합니다.
const decimalText = (value: number) => {
  const [coefficient, exponent] = String(value).split("e");
  if (!exponent) return coefficient;
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
};

const normalizeDecimal = (text: string) => {
  const [whole, fraction = ""] = text.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
};

export type TierErrors = { seats?: string; fee?: string; subtotal?: string };

/** 표시와 저장에 같은 검증을 적용하고 잘못 입력한 행도 그대로 유지합니다. */
export function validateTiers(drafts: DraftTier[]) {
  const errors: TierErrors[] = [];
  const parsed: NonNullable<VendorContract["tiers"]> = [];
  for (const draft of drafts) {
    const error: TierErrors = {};
    const seatText = draft.seats.trim();
    const feeText = draft.fee.trim();
    const seats = Number(seatText);
    const fee = Number(feeText);
    if (!/^\d+$/.test(seatText) || seats < 1) {
      error.seats = "좌석 수는 1 이상의 정수로 입력하세요";
    } else if (!Number.isSafeInteger(seats)) {
      error.seats = "좌석 수가 계산 가능한 범위를 넘었습니다";
    }
    if (!/^\d+(\.\d+)?$/.test(feeText)) {
      error.fee = "월 단가는 0 이상의 숫자로 입력하세요 (예: 0, 12.345)";
    } else if (
      !Number.isFinite(fee) ||
      fee > Number.MAX_SAFE_INTEGER ||
      normalizeDecimal(feeText) !== normalizeDecimal(decimalText(fee))
    ) {
      error.fee = "월 단가의 크기 또는 정밀도가 계산 가능한 범위를 넘었습니다";
    }
    if (!error.seats && !error.fee && seats * fee > Number.MAX_SAFE_INTEGER) {
      error.subtotal = "소계가 계산 가능한 범위를 넘었습니다";
    }
    errors.push(error);
    parsed.push({ label: draft.label || "표준", seats, fee });
  }
  let totalError: string | undefined;
  if (drafts.length < 1 || drafts.length > MAX_TIERS) {
    totalError = `좌석 유형은 1~${MAX_TIERS}개 입력하세요`;
  }
  const fieldsValid = errors.every((error) => Object.keys(error).length === 0);
  const seats = fieldsValid
    ? parsed.reduce((sum, tier) => sum + tier.seats, 0)
    : 0;
  const spend = fieldsValid
    ? parsed.reduce((sum, tier) => sum + tier.seats * tier.fee, 0)
    : 0;
  if (
    !Number.isSafeInteger(seats) ||
    !Number.isFinite(spend) ||
    spend > Number.MAX_SAFE_INTEGER
  ) {
    totalError = "총 좌석 수 또는 월 계약액이 계산 가능한 범위를 넘었습니다";
  }
  const valid = fieldsValid && !totalError;
  return {
    errors,
    totalError,
    tiers: valid ? parsed : null,
    seats: valid ? seats : 0,
    spend: valid ? spend : 0,
  };
}

/** 계약 좌석은 문자열 입력으로 다루므로 목 데이터를 초안 형태로 변환합니다 */
export const toDraftTiers = (contract: VendorContract): DraftTier[] =>
  (contract.tiers ?? []).map((t) => ({
    label: t.label,
    seats: String(t.seats),
    fee: decimalText(t.fee),
  }));

export const EMPTY_TIER: DraftTier = { label: "표준", seats: "", fee: "" };

/** 좌석 유형은 3개까지 — 그 이상은 계약서가 아니라 요금표입니다 */
export const MAX_TIERS = 3;

export type VendorRow = ReturnType<typeof buildVendorRows>[number] & {
  inputNotice?: string;
  seatsStatus?: { label: string; reason: string };
  spendStatus?: { label: string; reason: string };
};

/**
 * 목록 한 줄을 만듭니다.
 *
 * `setUp`(입력 완료)과 `confirmed`(사람이 확인함)를 나눠 두는 게 핵심입니다.
 * 입력이 바뀌면 확인이 풀리고, 확인 전까지 조직 합계는 이전 확인값을 씁니다 —
 * 오타 한 번이 전사 지출을 바꾸지 못하게 하는 장치입니다.
 */
export function buildVendorRows(
  edits: VendorEdits,
  added: VendorRecord[],
  base: VendorRecord[] = VENDORS,
) {
  return [...base, ...added].map((v) => {
    const edit = edits[v.id] ?? {};
    const contract: VendorContract & { plan?: string | null } = edit.cleared
      ? { ...edit }
      : { ...v.c, ...edit };

    const plans = getVendorPlans(v.kind, v.family);
    const plan = edit.cleared
      ? (contract.plan ?? null)
      : (contract.plan ?? v.plan);
    const catalogPlan = plans.find((p) => p.v === plan) ?? null;
    const planDef =
      catalogPlan && v.kind === "other" && contract.planName
        ? { ...catalogPlan, label: contract.planName }
        : catalogPlan;
    const billing = planDef?.bill ?? null;
    const isSeat = billing === "seat";

    const tiers = toDraftTiers(contract);
    const draftTiers = tiers.length ? tiers : [EMPTY_TIER];
    const validation = validateTiers(draftTiers);
    const seats = validation.seats;
    const seatSpend = validation.spend;
    const metered = contract.metered ?? 0;

    // 좌석제는 좌석 수와 단가가 둘 다 있어야 금액이 성립합니다
    const setUp = !!billing && (!isSeat || validation.tiers !== null);
    const confirmed =
      setUp && edit.confirmed !== false && !!contract.reviewedAt;
    const spendMonthly = isSeat ? seatSpend : metered;
    const noSignal = v.users === 0 && v.distinct30 === 0;

    return {
      id: v.id,
      short: edit.name ?? v.short,
      product: v.product,
      family: v.family,
      kind: v.kind,
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

      dot: !setUp
        ? "var(--gray)"
        : confirmed
          ? "var(--green)"
          : "var(--orange-ink)",
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

export { ADMIN_EMAIL };
