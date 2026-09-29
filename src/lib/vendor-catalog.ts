import { SEED_CATALOG } from "@/mocks/catalog";

export type VendorFamily = "anthropic" | "openai" | "generic";

export type Plan = {
  v: string;
  label: string;
  bill: "seat" | "metered";
  usage: boolean;
  note: string;
};

type VendorProduct = {
  kind: string;
  label: string;
  short: string;
  product: string;
  family: VendorFamily;
  color: string;
  allowsSeatTiers: boolean;
  plans: Plan[];
};

/** API 연동 전 화면의 표시 메타데이터. 제품·플랜 ID와 기능은 백엔드에서 생성한 fixture를 사용한다. */
const presentation: Record<string, { short: string; color: string }> = {
  claude_team: { short: "Claude", color: "var(--purple)" },
  openai_biz: { short: "Codex", color: "var(--orange-ink)" },
  gemini: { short: "Gemini Code Assist", color: "var(--text2)" },
  other: { short: "기타", color: "var(--text2)" },
};
export const VENDOR_CATALOG: VendorProduct[] = SEED_CATALOG.items.map(product => ({
  kind: product.id, label: product.displayName,
  short: presentation[product.id]?.short ?? product.displayName,
  product: product.product,
  family: product.provider === "anthropic" || product.provider === "openai" ? product.provider : "generic",
  color: presentation[product.id]?.color ?? "var(--text2)",
  allowsSeatTiers: product.allowsSeatTiers,
  plans: SEED_CATALOG.plans[product.id].map(plan => ({
    v: plan.id, label: plan.displayName, bill: plan.billing, usage: plan.separateUsageBilling,
    note: "계약서에 기재된 좌석 수와 월 단가를 입력하세요",
  })),
}));

export const ADD_KINDS = VENDOR_CATALOG.map(({ kind, label }) => ({ v: kind, label }));

export function getVendorProduct(kind: string) {
  return VENDOR_CATALOG.find((product) => product.kind === kind);
}

// 기존 계약의 family 입력을 지원하되 플랜 목록의 원천은 카탈로그 하나로 유지합니다.
export const PLAN_SETS: Record<VendorFamily, Plan[]> = {
  anthropic: getVendorProduct("claude_team")!.plans,
  openai: getVendorProduct("openai_biz")!.plans,
  generic: getVendorProduct("other")!.plans,
};

export function getVendorPlans(kind?: string, family: VendorFamily = "generic"): Plan[] {
  return kind ? getVendorProduct(kind)?.plans ?? [] : PLAN_SETS[family];
}

export function allowsSeatTiers(kind?: string) {
  return kind ? getVendorProduct(kind)?.allowsSeatTiers ?? false : true;
}

export function vendorIdentity(kind: string) {
  const product = getVendorProduct(kind);
  if (!product) throw new Error(`Unknown vendor product: ${kind}`);
  return { kind, name: product.short, short: product.short, product: product.product, family: product.family };
}
