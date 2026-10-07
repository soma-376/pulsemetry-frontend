import { z } from "zod";

export const onboardingStepSchema = z.enum(["collection", "contracts", "team"]);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;
export const collectionSchema = z.object({
  promptRaw: z.boolean({ error: "프롬프트 원문 수집 여부를 선택하세요" }),
});
