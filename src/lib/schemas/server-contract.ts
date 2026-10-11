import { z } from "zod";
import type { CatalogPlan, CatalogVendor } from "@/lib/api/vendor-catalog";
import { currentDateIso } from "@/lib/date";
import { dateInputError } from "@/lib/date-input";

type ExistingContract = { effectiveFrom: string; effectiveTo: string | null };
export function minimumContractEnd(
  today: string,
  end: string | undefined,
  existing?: ExistingContract,
) {
  if (existing && existing.effectiveTo === end) return existing.effectiveFrom;
  return existing && existing.effectiveFrom > today
    ? existing.effectiveFrom
    : today;
}

export function serverVendorSchema(
  vendor: CatalogVendor | undefined,
  plans: CatalogPlan[],
  today = currentDateIso(),
  existing?: ExistingContract,
) {
  return z
    .object({
      kind: z.string().optional(),
      name: z.string().trim().max(100).optional(),
      plan: z.string().nullable().optional(),
      planName: z.string().trim().max(100).optional(),
      term: z.string().optional(),
      tiers: z
        .array(
          z.object({
            label: z.string().trim(),
            seats: z.string().trim(),
            fee: z.string().trim(),
          }),
        )
        .optional(),
    })
    .superRefine((draft, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: "custom", path, message });
      if (!vendor || vendor.id !== draft.kind) {
        issue(["kind"], "제품을 선택하세요");
        return;
      }
      if (vendor.id === "other" && !draft.name)
        issue(["name"], "제품 이름을 입력하세요");
      if (!draft.plan) {
        if (
          draft.term ||
          draft.planName ||
          draft.tiers?.some((t) => t.seats || t.fee)
        )
          issue(["plan"], "계약 정보를 저장하려면 플랜을 선택하세요");
        return;
      }
      if (!plans.some((p) => p.id === draft.plan))
        issue(["plan"], "선택한 제품의 플랜을 확인하세요");
      const dateError = dateInputError(
        draft.term ?? "",
        minimumContractEnd(today, draft.term, existing),
      );
      if (dateError) issue(["term"], dateError);
      const validation = validateServerTiers(
        draft.tiers ?? [],
        vendor.allowsSeatTiers,
      );
      if (validation.totalError) issue(["tiers"], validation.totalError);
      validation.errors.forEach((errors, index) => {
        for (const [field, message] of Object.entries(errors))
          issue(["tiers", index, field], message);
      });
    })
    .transform((draft) => ({
      kind: draft.kind!,
      displayName: draft.name || vendor!.displayName,
      ...(draft.plan
        ? {
            contract: {
              planId: draft.plan,
              effectiveFrom: existing?.effectiveFrom ?? today,
              effectiveTo: draft.term || null,
              termNote: draft.planName || null,
              tiers: draft.tiers!.map((t) => ({
                label: vendor!.allowsSeatTiers
                  ? t.label
                  : plans.find((p) => p.id === draft.plan)!.displayName,
                seats: Number(t.seats),
                monthlyFeePerSeatUsd: t.fee,
              })),
            },
          }
        : {}),
    }));
}

/** 전송 금액은 문자열로 보존하고 합계 상한은 고정 소수점 정수로 비교한다. */
export function validateServerTiers(
  tiers: { label: string; seats: string; fee: string }[],
  allowsSeatTiers: boolean,
) {
  let total = BigInt(0);
  let totalError =
    tiers.length < 1 || tiers.length > (allowsSeatTiers ? 3 : 1)
      ? "계약 좌석 구성을 확인하세요"
      : undefined;
  const errors = tiers.map((tier) => {
    const error: {
      label?: string;
      seats?: string;
      fee?: string;
      subtotal?: string;
    } = {};
    const seats = tier.seats.trim(),
      fee = tier.fee.trim();
    if (
      allowsSeatTiers &&
      (!tier.label.trim() || tier.label.trim().length > 100)
    )
      error.label = "좌석 유형은 1~100자로 입력하세요";
    const validSeats =
      /^\d+$/.test(seats) &&
      Number.isSafeInteger(Number(seats)) &&
      Number(seats) > 0;
    const validFee = /^\d+(?:\.\d{1,12})?$/.test(fee) && fee.length <= 40;
    if (!validSeats)
      error.seats = "좌석 수는 1 이상의 안전한 정수로 입력하세요";
    if (!validFee) error.fee = "월 단가는 0 이상, 소수점 12자리까지 입력하세요";
    if (validSeats && validFee) {
      const [whole, fraction = ""] = fee.split(".");
      total += BigInt(seats) * BigInt(whole + fraction.padEnd(12, "0"));
    }
    return error;
  });
  if (total > BigInt("9007199254740991") * BigInt("1000000000000"))
    totalError = "월 계약액이 허용 범위를 넘었습니다";
  const valid =
    !totalError && errors.every((error) => Object.keys(error).length === 0);
  return {
    errors,
    totalError,
    tiers: valid ? tiers : null,
    seats: valid ? tiers.reduce((sum, tier) => sum + Number(tier.seats), 0) : 0,
    spend: valid ? Number(total) / 1e12 : 0,
  };
}
