import { contractSchema } from "./schemas/contract";
import { ADD_KINDS, ADMIN_EMAIL, buildVendorRows, NEW_VENDOR_ID, PLAN_SETS, TODAY, validateTiers, type VendorDraft } from "./settings";
import type { VendorRecord } from "@/mocks/vendors";

const emptyVendor: VendorRecord = {
  id: NEW_VENDOR_ID, name: "", short: "", product: "수동 추가 · 신호 없음", family: "generic",
  plan: null, manual: true, users: 0, distinct30: 0, firstSeen: "—", c: {},
};
export const NEW_CONTRACT_ROW = buildVendorRows({}, [emptyVendor]).find((row) => row.id === NEW_VENDOR_ID)!;

export function createManualContract(input: VendorDraft, id: string): VendorRecord {
  const draft = contractSchema().parse(input);
  const plan = PLAN_SETS.generic.find((item) => item.v === draft.plan)!;
  const name = draft.name || ADD_KINDS.find((kind) => kind.v === (draft.kind ?? "copilot"))!.label;
  return {
    ...emptyVendor, id, name, short: name, plan: plan.v,
    c: { tiers: plan.bill === "seat" ? validateTiers(draft.tiers!).tiers! : [], term: draft.term ?? "", reviewedAt: TODAY, reviewer: ADMIN_EMAIL },
  };
}
