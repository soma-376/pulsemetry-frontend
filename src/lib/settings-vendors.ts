import { settingsValueStatus } from "./metrics/settings-presentation";
import { contractInputText } from "./api/contract-input";
import { CONTRACT_STATUS } from "./contract-status";
import type { SettingsVendor, SettingsVendorRow } from "./api/settings";
import type { CatalogVendor } from "./api/vendor-catalog";
import { NEW_CONTRACT_ROW } from "./contracts";
import { int, usd } from "./format";
import type { VendorDraft, VendorRow } from "./settings";

/** 서버가 산출한 목록 값을 표시한다. 관측 인원에서 좌석을 추측하지 않는다. */
export function settingsVendorRow(
  vendor: SettingsVendorRow,
  product?: CatalogVendor,
): VendorRow {
  const status = CONTRACT_STATUS[vendor.contractStatus];
  const prefix =
    vendor.contractStatus === "expired"
      ? "마지막 계약 "
      : vendor.contractStatus === "scheduled"
        ? "예정 계약 "
        : "";
  return {
    ...NEW_CONTRACT_ROW,
    id: vendor.vendorId,
    kind: vendor.kind,
    short: vendor.displayName,
    product: product?.product ?? vendor.displayName,
    dot: status.color,
    statusFg: status.color,
    statusLabel: status.label,
    seatsText: `배정 ${vendor.assignedSeats.value === null ? "-" : int(vendor.assignedSeats.value)} / ${vendor.contractSeats.value === null ? "계약 -" : `${prefix}${int(vendor.contractSeats.value)}석`}`,
    spendText:
      vendor.monthlySeatFeeUsd.value === null
        ? "-"
        : `${prefix}${usd(vendor.monthlySeatFeeUsd.value)} / 월`,
    spendFg:
      vendor.monthlySeatFeeUsd.value === null ? "var(--text3)" : "var(--text)",
    inputNotice:
      vendor.contractInput.status === "required"
        ? contractInputText(vendor.contractInput.missingFields)
        : undefined,
    seatsStatus: settingsValueStatus(vendor.assignedSeats),
    spendStatus: settingsValueStatus(vendor.monthlySeatFeeUsd),
    openLabel: `${vendor.displayName} 계약 설정 열기`,
  };
}

/** 편집기는 단건 상세를 사용한다. 목록 응답에 계약 등급을 다시 싣지 않는다. */
export function settingsVendorDetailRow(
  vendor: SettingsVendor,
  product?: CatalogVendor,
): VendorRow {
  const contract = vendor.contract;
  const count =
    contract?.tiers.reduce(
      (sum, tier) => sum + BigInt(tier.seats),
      BigInt(0),
    ) ?? null;
  const row = settingsVendorRow(
    {
      vendorId: vendor.vendorId,
      displayName: vendor.displayName,
      kind: vendor.kind,
      source: vendor.source,
      version: vendor.version,
      contractStatus: vendor.contractStatus,
      contractInput:
        vendor.contractInput ??
        (contract
          ? { status: "complete", missingFields: [] }
          : {
              status: "required",
              missingFields: ["planId", "seats", "monthlyFeePerSeatUsd"],
            }),
      contractSeats: {
        value: count,
        status: count === null ? "unavailable" : "complete",
        reasons: count === null ? ["contract_missing"] : [],
      },
      monthlySeatFeeUsd: {
        value: contract?.monthlySeatFeeUsd ?? null,
        status:
          contract?.monthlySeatFeeUsd == null ? "unavailable" : "complete",
        reasons:
          contract?.monthlySeatFeeUsd == null
            ? ["contract_amount_unavailable"]
            : [],
      },
      assignedSeats: {
        value: vendor.seats?.data?.assigned ?? null,
        status: !vendor.seats?.data
          ? "unavailable"
          : vendor.seats.availability === "available"
            ? "complete"
            : "partial",
        reasons: vendor.seats?.reason ? [vendor.seats.reason] : [],
      },
    },
    product,
  );
  return {
    ...row,
    manual: vendor.source === "manual",
    plan: contract?.planId ?? null,
    noSignal: vendor.observation === "unobserved",
    setUp: !!contract,
    confirmed: !!contract,
    contract: {
      term: contract?.effectiveTo ?? "",
      planName: contract?.termNote ?? "",
      reviewedAt: contract?.confirmedAt,
    },
  };
}
export function settingsVendorDraft(vendor?: SettingsVendor): VendorDraft {
  return {
    kind: vendor?.kind ?? "",
    name: vendor?.displayName ?? "",
    plan: vendor?.contract?.planId ?? null,
    term: vendor?.contract?.effectiveTo ?? "",
    planName: vendor?.contract?.termNote ?? "",
    tiers: vendor?.contract?.tiers.map((tier) => ({
      label: tier.label,
      seats: String(tier.seats),
      fee: tier.monthlyFeePerSeatUsd,
    })) ?? [{ label: "표준", seats: "", fee: "" }],
  };
}
