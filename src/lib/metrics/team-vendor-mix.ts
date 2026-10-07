import type { VendorUsage } from "@/types/domain";
import { USAGE_VENDORS } from "@/mocks/vendor-usage";

type MixTeam = { team: string; unmapped: boolean; vendors: VendorUsage[] };

/** Each axis uses its own vendor totals, rather than reusing cost proportions. */
export function buildTeamVendorMix(teams: MixTeam[], metric: "cost" | "tokensM" | "sessions", format: (value: number) => string) {
  const unknown = { id: "__unknown", name: "벤더 미확인", color: "var(--gray)" };
  const rows = teams.map((team) => {
    const amounts = new Map<string, { id: string; name: string; color: string; value: number }>();
    for (const usage of team.vendors) {
      const vendor = USAGE_VENDORS.find((item) => item.id === usage.vendorId) ?? unknown;
      const previous = amounts.get(vendor.id)?.value ?? 0;
      amounts.set(vendor.id, { ...vendor, value: previous + usage[metric] });
    }
    return { ...team, amounts: [...amounts.values()], total: [...amounts.values()].reduce((sum, vendor) => sum + vendor.value, 0) };
  }).sort((a, b) => b.total - a.total || a.team.localeCompare(b.team, "ko"));
  const max = Math.max(...rows.map((team) => team.total), 1);
  const legend = [...USAGE_VENDORS, unknown].filter((vendor) => rows.some((team) => team.amounts.some((item) => item.id === vendor.id && item.value > 0)));
  return {
    yTop: format(max), yMid: format(max / 2), legend,
    columns: rows.map((team) => {
      const segments = legend.flatMap((vendor) => {
        const value = team.amounts.find((item) => item.id === vendor.id)?.value ?? 0;
        if (value <= 0 || team.total <= 0) return [];
        const share = value / team.total;
        return [{ key: vendor.id, share, value, color: vendor.color, tip: `${team.team} · ${vendor.name} ${(share * 100).toFixed(1)}% · ${format(value)}` }];
      });
      const top = [...segments].sort((a, b) => b.value - a.value)[0];
      return {
        team: team.team, unmapped: team.unmapped, totalValue: team.total,
        height: `${((team.total / max) * 100).toFixed(1)}%`, totalText: format(team.total), segments,
        topText: top ? `${legend.find((vendor) => vendor.id === top.key)!.name} ${(top.share * 100).toFixed(0)}%` : "관측 없음",
      };
    }),
  };
}
