import { z } from "zod";

export const contractStatusSchema = z.enum([
  "missing",
  "scheduled",
  "active",
  "expired",
]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;
export const CONTRACT_STATUS = {
  missing: { label: "계약 미입력", color: "var(--gray)" },
  scheduled: { label: "시작 예정", color: "var(--blue)" },
  active: { label: "유효", color: "var(--green)" },
  expired: { label: "계약 만료", color: "var(--orange-ink)" },
} satisfies Record<ContractStatus, { label: string; color: string }>;

export function contractSummaryNotice(
  vendors: { contractStatus: ContractStatus }[],
): string | null {
  const count = (status: ContractStatus) =>
    vendors.filter((vendor) => vendor.contractStatus === status).length;
  const reasons = [
    count("expired") ? `만료 ${count("expired")}건 제외` : "",
    count("scheduled") ? `시작 예정 ${count("scheduled")}건 제외` : "",
    count("missing") ? `미입력 ${count("missing")}건 제외` : "",
  ].filter(Boolean);
  return reasons.length ? reasons.join(" · ") : null;
}

export const contractSeatsLabel = (status: ContractStatus) =>
  status === "expired"
    ? "마지막 계약 좌석"
    : status === "scheduled"
      ? "예정 계약 좌석"
      : "계약 좌석";
export const contractAmountLabel = (status: ContractStatus) =>
  status === "expired"
    ? "마지막 계약 금액"
    : status === "scheduled"
      ? "예정 계약 금액"
      : "월 좌석 계약액";
