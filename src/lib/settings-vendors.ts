import type { SettingsVendor } from "./api/settings";
import type { CatalogVendor } from "./api/vendor-catalog";
import { NEW_CONTRACT_ROW } from "./contracts";
import { int, usd } from "./format";
import type { VendorDraft, VendorRow } from "./settings";

/** 서버 응답을 기존 행 배치에 맞춘다. 관측 인원에서 좌석을 추측하지 않는다. */
export function settingsVendorRow(vendor: SettingsVendor, product?: CatalogVendor): VendorRow {
  const contract = vendor.contract;
  const status = vendor.state === "configured" ? { label: "계약 입력됨", color: "var(--green)" } : { label: "계약 확인 필요", color: "var(--orange-ink)" };
  const tone = status.color;
  return { ...NEW_CONTRACT_ROW, id: vendor.vendorId, kind: vendor.kind, short: vendor.displayName,
    product: product?.product ?? vendor.displayName, manual: vendor.source === "manual", plan: contract?.planId ?? null,
    noSignal: vendor.observation === "unobserved", setUp: !!contract, confirmed: !!contract,
    contract: { term: contract?.effectiveTo ?? "", planName: contract?.termNote ?? "", reviewedAt: contract?.confirmedAt },
    dot: tone, statusFg: tone, statusLabel: status.label,
    seatsText: contract ? `${int(contract.tiers.reduce((sum, tier) => sum + tier.seats, 0))}석` : "-",
    spendText: contract?.monthlySeatFeeUsd != null ? `${usd(Number(contract.monthlySeatFeeUsd))} / 월` : "-",
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
