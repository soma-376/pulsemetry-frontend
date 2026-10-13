import { seatReasonText } from "../api/seats";

export type SettingsValue = {
  value: unknown;
  status: "complete" | "partial" | "unavailable";
  reasons: string[];
};
const REASONS: Record<string, string> = {
  contract_missing: "계약 미입력 벤더는 합계에서 제외됩니다.",
  contract_expired: "만료 계약은 합계에서 제외됩니다.",
  contract_scheduled: "시작 예정 계약은 합계에서 제외됩니다.",
  contract_amount_unavailable: "계약 금액을 확인할 수 없습니다.",
  observation_incomplete: "최근 7일의 수집 근거가 완전하지 않습니다.",
  value_unavailable: "값을 확인할 수 없습니다.",
  not_applicable: "집계할 등록 제품이 없습니다.",
};
export function settingsValueStatus(...values: (SettingsValue | undefined)[]) {
  const incomplete = values.filter(
    (value) => value && value.status !== "complete",
  );
  if (!incomplete.length) return undefined;
  const reasons = [...new Set(incomplete.flatMap((value) => value!.reasons))];
  return {
    label: incomplete.some((value) => value!.status === "unavailable")
      ? "값 확인 불가"
      : "일부 집계",
    reason: reasons
      .map((reason) => REASONS[reason] ?? seatReasonText(reason))
      .join(" "),
  };
}
