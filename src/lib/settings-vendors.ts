import { CONTRACT_STATUS } from "./contract-status";
import type { SettingsVendor } from "./api/settings";
import type { CatalogVendor } from "./api/vendor-catalog";
import { NEW_CONTRACT_ROW } from "./contracts";
import { int, usd } from "./format";
import type { VendorDraft, VendorRow } from "./settings";

/** 서버 응답을 기존 행 배치에 맞춘다. 관측 인원에서 좌석을 추측하지 않는다. */
export function settingsVendorRow(vendor: SettingsVendor, product?: CatalogVendor): VendorRow {
  const contract = vendor.contract;
  const status = CONTRACT_STATUS[vendor.contractStatus];
  const tone = status.color;
  return { ...NEW_CONTRACT_ROW, id: vendor.vendorId, kind: vendor.kind, short: vendor.displayName,
    product: product?.product ?? vendor.displayName, manual: vendor.source === "manual", plan: contract?.planId ?? null,
    noSignal: vendor.observation === "unobserved", setUp: !!contract, confirmed: !!contract,
    contract: { term: contract?.effectiveTo ?? "", planName: contract?.termNote ?? "", reviewedAt: contract?.confirmedAt },
    dot: tone, statusFg: tone, statusLabel: status.label,
    // 배정 좌석은 좌석 원장의 값이고(없으면 "-") 계약 좌석은 구매 수량이다 — 둘을 섞지 않는다.
    seatsText: `${vendor.seats?.data ? `배정 ${int(vendor.seats.data.assigned)}` : "배정 -"} / ${contract ? `${vendor.contractStatus === "expired" ? "마지막 계약 " : vendor.contractStatus === "scheduled" ? "예정 계약 " : ""}${int(contract.tiers.reduce((sum, tier) => sum + tier.seats, 0))}석` : "계약 -"}`,
    spendText: contract?.monthlySeatFeeUsd != null ? `${vendor.contractStatus === "expired" ? "마지막 계약 " : vendor.contractStatus === "scheduled" ? "예정 계약 " : ""}${usd(Number(contract.monthlySeatFeeUsd))} / 월` : "-",
    spendFg: contract?.monthlySeatFeeUsd != null ? "var(--text)" : "var(--text3)",
    openLabel: `${vendor.displayName} 계약 설정 열기`,
  };
}
export function settingsVendorDraft(vendor?: SettingsVendor): VendorDraft {
  return { kind: vendor?.kind ?? "", name: vendor?.displayName ?? "", plan: vendor?.contract?.planId ?? null,
    term: vendor?.contract?.effectiveTo ?? "", planName: vendor?.contract?.termNote ?? "",
    tiers: vendor?.contract?.tiers.map(tier => ({ label: tier.label, seats: String(tier.seats), fee: tier.monthlyFeePerSeatUsd })) ?? [{ label: "표준", seats: "", fee: "" }],
  };
}
