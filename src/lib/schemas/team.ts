import { z } from "zod";

export const teamFormSchema = z.object({
  name: z.string().trim().min(1, "팀 이름을 입력하세요").max(40, "팀 이름은 40자 이내로 입력하세요")
    .refine((name) => !["미배정", "팀 미배정"].includes(name), "미배정은 팀 이름으로 사용할 수 없습니다"),
});
export type TeamForm = z.infer<typeof teamFormSchema>;
