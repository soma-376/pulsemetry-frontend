import { z } from "zod";
import { ADD_KINDS, PLAN_SETS, validateTiers } from "@/lib/settings";
import type { VendorFamily } from "@/mocks/vendors";
import { dateInputError } from "@/lib/date-input";
import { currentDateIso } from "@/lib/date";

export function contractSchema(family: VendorFamily = "generic") {
  return z.object({
    kind: z.string().optional(),
    name: z.string().trim().max(100, "표시 이름은 100자 이내로 입력하세요").optional(),
    plan: z.string().nullable().optional(),
    tiers: z.array(z.object({ label: z.string(), seats: z.string(), fee: z.string() })).optional(),
    term: z.string().optional(),
  }).superRefine((draft, ctx) => {
    const termError = dateInputError(draft.term ?? "", currentDateIso());
    if (termError) ctx.addIssue({ code: "custom", path: ["term"], message: termError });
    const plan = PLAN_SETS[family].find((item) => item.v === draft.plan);
    if (!plan) ctx.addIssue({ code: "custom", path: ["plan"], message: "플랜을 선택하세요" });
    if (draft.kind && !ADD_KINDS.some((kind) => kind.v === draft.kind)) ctx.addIssue({ code: "custom", path: ["kind"], message: "벤더를 선택하세요" });
    if (draft.kind === "other" && !draft.name) ctx.addIssue({ code: "custom", path: ["name"], message: "벤더 표시 이름을 입력하세요" });
    if (plan?.bill === "seat") {
      const validation = validateTiers(draft.tiers ?? []);
      validation.errors.forEach((errors, index) => Object.entries(errors).forEach(([field, message]) => {
        ctx.addIssue({ code: "custom", path: ["tiers", index, field], message });
      }));
      if (validation.totalError) ctx.addIssue({ code: "custom", path: ["tiers"], message: validation.totalError });
    }
  });
}
