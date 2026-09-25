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

const seatPlan = (v: string, label: string, usage = false): Plan => ({
  v, label, bill: "seat", usage, note: "계약서에 기재된 좌석 수와 월 단가를 입력하세요",
});

/** 조직용 구독만 지원합니다. 제품 정보는 목 계약·좌석·사용량에서도 함께 사용합니다. */
export const VENDOR_CATALOG: VendorProduct[] = [
  {
    kind: "claude_team", label: "Claude (Anthropic)", short: "Claude",
    product: "Claude Code · claude.ai", family: "anthropic", color: "var(--purple)", allowsSeatTiers: true,
    plans: [seatPlan("team", "Team", true), seatPlan("enterprise", "Enterprise", true)],
  },
  {
    kind: "openai_biz", label: "ChatGPT / Codex (OpenAI)", short: "Codex",
    product: "ChatGPT · Codex", family: "openai", color: "var(--orange-ink)", allowsSeatTiers: false,
    plans: [seatPlan("business", "Business", true), seatPlan("enterprise", "Enterprise", true)],
  },
  {
    kind: "cursor", label: "Cursor", short: "Cursor",
    product: "Cursor", family: "generic", color: "var(--text2)", allowsSeatTiers: true,
    plans: [seatPlan("cursor_teams", "Teams", true), seatPlan("cursor_enterprise", "Enterprise", true)],
  },
  {
    kind: "copilot", label: "GitHub Copilot", short: "GitHub Copilot",
    product: "GitHub Copilot", family: "generic", color: "var(--text2)", allowsSeatTiers: false,
    plans: [seatPlan("copilot_business", "Business", true), seatPlan("copilot_enterprise", "Enterprise", true)],
  },
  {
    kind: "gemini", label: "Google Gemini Code Assist", short: "Gemini Code Assist",
    product: "Gemini Code Assist", family: "generic", color: "var(--text2)", allowsSeatTiers: false,
    plans: [seatPlan("gemini_standard", "Standard"), seatPlan("gemini_enterprise", "Enterprise")],
  },
  {
    kind: "other", label: "기타 조직 계약 · 직접 입력", short: "기타",
    product: "기타 조직 계약", family: "generic", color: "var(--text2)", allowsSeatTiers: true,
    plans: [seatPlan("seat_flat", "좌석 정액"), seatPlan("seat_usage", "좌석 + 사용량", true)],
  },
];

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
