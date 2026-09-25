import { getVendorProduct } from "@/lib/vendor-catalog";
import type { MemberSeat } from "@/types/member-seat";

export const SEAT_SNAPSHOT_DATE = "2026-09-13";

// Explicit vendor assignments for the demo. Never derive these from model usage or contracts.
const common = {
  assignment: "assigned" as const,
  assignedOn: "2026-06-01",
  coverage: { from: "2026-06-01", through: SEAT_SNAPSHOT_DATE },
};
const specificSeats: MemberSeat[] = [
  { ...common, id: "seat-claude-jiwon", account: "jiwon.kim@codeworks.io", vendorId: "claude_team", vendor: getVendorProduct("claude_team")!.short, tier: "표준", lastObservedAt: "2026-08-20T10:30:00+09:00" },
  { ...common, id: "seat-codex-jiwon", account: "jiwon.kim@codeworks.io", vendorId: "openai_biz", vendor: getVendorProduct("openai_biz")!.short, tier: "표준", lastObservedAt: "2026-09-12T10:30:00+09:00" },
  { ...common, id: "seat-claude-seoyeon", account: "seoyeon.kim@codeworks.io", vendorId: "claude_team", vendor: getVendorProduct("claude_team")!.short, tier: "프리미엄", lastObservedAt: "2026-08-01T10:30:00+09:00" },
  { ...common, id: "seat-codex-seoyeon", account: "seoyeon.kim@codeworks.io", vendorId: "openai_biz", vendor: getVendorProduct("openai_biz")!.short, tier: "표준", lastObservedAt: "2026-08-25T10:30:00+09:00" },
  { ...common, id: "seat-claude-minjun", account: "minjun.kim@codeworks.io", vendorId: "claude_team", vendor: getVendorProduct("claude_team")!.short, tier: null, assignment: "unknown", lastObservedAt: "2026-08-01T10:30:00+09:00" },
  { ...common, id: "seat-codex-haeun", account: "haeun.kim@codeworks.io", vendorId: "openai_biz", vendor: getVendorProduct("openai_biz")!.short, tier: "표준", lastObservedAt: "2026-08-01T10:30:00+09:00", coverage: null },
  { ...common, id: "seat-claude-doyun", account: "doyun.kim@codeworks.io", vendorId: "claude_team", vendor: getVendorProduct("claude_team")!.short, tier: "표준", assignment: "unassigned", lastObservedAt: "2026-08-01T10:30:00+09:00" },
  { ...common, id: "seat-codex-sujin", account: "sujin.kim@codeworks.io", vendorId: "openai_biz", vendor: getVendorProduct("openai_biz")!.short, tier: "표준", lastObservedAt: null, coverage: null },
];

// Include examples in the first alphabetical page, without changing the user's sort order.
// These are independent seat fixtures, not assignments inferred from usage or contract totals.
type Scenario = "active" | "multi-active" | "mixed" | "candidate" | "waiting" | "partial" | "new";
const profiles: [string, Scenario][] = [
  ["chaewon.cho", "multi-active"], ["chaewon.choi", "mixed"],
  ["chaewon.jung", "waiting"], ["chaewon.kang", "candidate"],
  ["chaewon.kim", "active"], ["chaewon.lee", "mixed"], ["chaewon.park", "new"],
  ["dain.cho", "waiting"], ["dain.choi", "active"], ["dain.jung", "mixed"],
  ["dain.kang", "candidate"], ["dain.kim", "multi-active"],
  ["dain.lee", "partial"], ["dain.park", "waiting"],
  ["doyun.cho", "mixed"], ["doyun.choi", "active"], ["doyun.jung", "waiting"],
  ["doyun.kang", "multi-active"], ["doyun.lee", "candidate"],
  ["doyun.park", "new"], ["doyun.yoon", "mixed"],
  ["gunwoo.cho", "active"], ["gunwoo.choi", "mixed"], ["gunwoo.jung", "waiting"],
  ["gunwoo.kang", "candidate"], ["gunwoo.kim", "multi-active"],
  ["gunwoo.lee", "partial"], ["gunwoo.park", "waiting"],
];
const products = [
  { vendorId: "claude_team", vendor: getVendorProduct("claude_team")!.short, tiers: ["표준", "프리미엄"] },
  { vendorId: "openai_biz", vendor: getVendorProduct("openai_biz")!.short, tiers: ["표준", "표준"] },
  { vendorId: "cursor", vendor: getVendorProduct("cursor")!.short, tiers: ["표준", "표준"] },
];

const variedSeats: MemberSeat[] = profiles.flatMap(([name, scenario], index) => {
  const count = scenario === "active" || scenario === "new" ? 1 : scenario === "multi-active" || scenario === "mixed" ? 3 : 2;
  return Array.from({ length: count }, (_, position): MemberSeat => {
    const product = products[(index + position) % products.length];
    const old = scenario === "candidate" || (scenario === "mixed" && position === 0) || scenario === "partial";
    const date = old ? `2026-08-${String(16 + index % 12).padStart(2, "0")}` : `2026-09-${String(10 + (index + position) % 4).padStart(2, "0")}`;
    const time = `${String(9 + index % 9).padStart(2, "0")}:${String((index * 7 + position * 13) % 60).padStart(2, "0")}`;
    const waiting = scenario === "waiting" || scenario === "new";
    return {
      ...common,
      id: `seat-${product.vendorId}-${name}`,
      account: `${name}@codeworks.io`,
      vendorId: product.vendorId,
      vendor: product.vendor,
      tier: product.tiers[index % product.tiers.length],
      assignedOn: waiting ? "2026-09-12" : common.assignedOn,
      lastObservedAt: waiting ? null : `${date}T${time}:00+09:00`,
      coverage: waiting ? null : scenario === "partial" ? { from: "2026-09-10", through: SEAT_SNAPSHOT_DATE } : common.coverage,
    };
  });

});

export const MEMBER_SEATS: MemberSeat[] = [...specificSeats, ...variedSeats];
