import type { VendorRow } from "@/lib/settings";

type VendorSeatRow = {
  id: string;
  vendorId: string;
  vendor: string;
  plan: string;
  tier: string | null;
  purchased: number | null;
  workspace: null;
  assigned: null;
  unassigned: null;
  metered: boolean;
  status: string;
};

/** Current contract inventory. Usage observations cannot establish seat assignments. */
export function buildVendorSeats(vendors: VendorRow[]) {
  const rows = vendors.flatMap<VendorSeatRow>((vendor) => {
    const tiers = vendor.isSeat && vendor.setUp ? vendor.contract.tiers ?? [] : [];
    const base = {
      vendorId: vendor.id,
      vendor: vendor.short,
      plan: vendor.planDef?.label ?? "플랜 미등록",
      workspace: null,
      assigned: null,
      unassigned: null,
      metered: vendor.billing === "metered",
      status: !vendor.setUp ? "계약 확인 필요" : !vendor.confirmed ? "계약 확인 대기" : "계약 확인됨",
    };
    return tiers.length
      ? tiers.map((tier, index) => ({ ...base, id: `${vendor.id}:${index}`, tier: tier.label, purchased: tier.seats }))
      : [{ ...base, id: vendor.id, tier: null, purchased: null }];
  });
  const confirmed = vendors.filter((vendor) => vendor.confirmed && vendor.isSeat);
  return {
    rows,
    confirmedSeats: confirmed.reduce((sum, vendor) => sum + vendor.seats, 0),
    monthlyContractAmount: confirmed.length ? confirmed.reduce((sum, vendor) => sum + vendor.seatSpend, 0) : null,
    pendingContracts: vendors.filter((vendor) => !vendor.confirmed).length,
  };
}

export type VendorSeatsModel = ReturnType<typeof buildVendorSeats>;
