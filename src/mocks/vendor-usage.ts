import { getVendorProduct } from "@/lib/vendor-catalog";
import type { VendorUsage } from "@/types/domain";

/** Explicit demo product attribution, never inferred from model names. */
export const USAGE_VENDORS = ["claude_team", "openai_biz"].map((id) => {
  const product = getVendorProduct(id)!;
  return { id, name: product.short, color: product.color };
});

// Claude's shares per metric; Codex receives the remainder. Cursor usage is not collected.
const CLAUDE_SHARE: Record<string, { cost: number; tokensM: number; sessions: number }> = {
  플랫폼: { cost: 0.82, tokensM: 0.68, sessions: 0.74 },
  결제: { cost: 0.76, tokensM: 0.61, sessions: 0.7 },
  데이터: { cost: 0.58, tokensM: 0.43, sessions: 0.49 },
  프론트엔드: { cost: 0.45, tokensM: 0.33, sessions: 0.38 },
  모바일: { cost: 0.67, tokensM: 0.51, sessions: 0.57 },
  미배정: { cost: 0.62, tokensM: 0.48, sessions: 0.53 },
};

export function demoVendorUsage(team: string, day: number, totals: Omit<VendorUsage, "vendorId">): VendorUsage[] {
  const share = CLAUDE_SHARE[team];
  if (!share) return [{ vendorId: null, ...totals }];
  const drift = 0.04 * Math.sin(day / 9);
  const claude = {
    cost: totals.cost * (share.cost + drift),
    tokensM: totals.tokensM * (share.tokensM + drift),
    sessions: Math.round(totals.sessions * (share.sessions + drift)),
  };
  return [
    { vendorId: "claude_team", ...claude },
    { vendorId: "openai_biz", cost: totals.cost - claude.cost, tokensM: totals.tokensM - claude.tokensM, sessions: totals.sessions - claude.sessions },
  ];
}
