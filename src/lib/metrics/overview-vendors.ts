import type { VendorRow } from "@/lib/settings";
import type { aggregateActivity } from "./activity";
import { getVendorProduct } from "@/lib/vendor-catalog";
import { buildMemberSeats, DEFAULT_SEAT_REVIEW_DAYS } from "./member-seats";
import { MEMBER_SEATS, SEAT_SNAPSHOT_DATE } from "@/mocks/member-seats";

type Activity = ReturnType<typeof aggregateActivity>;

/** Product-level observations and contracts stay separate; neither implies seat allocation. */
export function buildOverviewVendors(vendors: VendorRow[], activity: Activity, idleDays = DEFAULT_SEAT_REVIEW_DAYS, knownVendorIds: (string | null)[] = []) {
  const groups = new Map<string, VendorRow[]>();
  for (const vendor of vendors) {
    const key = vendor.kind && vendor.kind !== "other" ? vendor.kind : vendor.id;
    groups.set(key, [...groups.get(key) ?? [], vendor]);
  }
  const records = activity.days.flatMap((day) => day.teams.flatMap((team) => team.vendors));
  for (const vendorId of knownVendorIds) {
    const key = vendorId ?? "__unknown";
    if (!groups.has(key)) groups.set(key, []);
  }
  const seats = buildMemberSeats(MEMBER_SEATS, SEAT_SNAPSHOT_DATE, idleDays);
  return {
    snapshotDate: SEAT_SNAPSHOT_DATE,
    rows: [...groups].map(([id, contracts]) => {
      const product = getVendorProduct(id);
      const usage = records.filter((record) => (record.vendorId ?? "__unknown") === id);
      const observedUsers = new Set(usage.flatMap((record) => record.users)).size;
      const productSeats = seats.filter((seat) => seat.vendorId === id);
      const confirmed = contracts.filter((contract) => contract.confirmed && contract.isSeat);
      const registered = contracts.filter((contract) => contract.setUp);
      return {
        id, name: product?.short ?? contracts[0]?.short ?? "벤더 미확인",
        color: product?.color ?? "var(--text3)",
        observedUsers,
        candidates: productSeats.length ? productSeats.filter((seat) => seat.review === "candidate").length : null,
        purchased: confirmed.length ? confirmed.reduce((sum, contract) => sum + contract.seats, 0) : null,
        monthly: confirmed.length ? confirmed.reduce((sum, contract) => sum + contract.seatSpend, 0) : null,
        status: registered.length === 0 ? "미등록" : confirmed.length < registered.length ? "확인 대기" : "등록됨",
        contracts: (registered.length ? registered : contracts).map((contract) => ({
          id: contract.id, name: contract.short, plan: contract.planDef?.label ?? "플랜 미등록",
          tiers: contract.setUp ? contract.contract.tiers ?? [] : [],
          confirmed: contract.confirmed, term: contract.contract.term,
        })),
      };
    }),
  };
}

export function buildVendorTrend(activity: Activity) {
  const ids = [...new Set(activity.teams.flatMap((team) => team.vendors.filter((vendor) => vendor.cost > 0 || vendor.tokensM > 0 || vendor.sessions > 0).map((vendor) => vendor.vendorId ?? "__unknown")))];
  return ids.map((id) => {
    const product = getVendorProduct(id);
    return {
      id, name: product?.short ?? "벤더 미확인", color: product?.color ?? "var(--text3)",
      values: activity.days.map((day) => day.teams.reduce((total, team) => total + team.vendors.filter((vendor) => (vendor.vendorId ?? "__unknown") === id).reduce((sum, vendor) => sum + vendor.cost, 0), 0)),
    };
  });
}

export type OverviewVendorsModel = ReturnType<typeof buildOverviewVendors>;
