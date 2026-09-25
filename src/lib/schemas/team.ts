import { z } from "zod";

export const TEAM_NAME_HINT = "한글·영문·숫자·공백과 - _ . ( ) & / 사용 가능 · 최대 40자";
const TEAM_NAME_CHARACTERS = /^[가-힣A-Za-z0-9 ._()&/-]+$/;

export const teamFormSchema = z.object({
  name: z.string().trim().min(1, "팀 이름을 입력하세요").max(40, "팀 이름은 40자 이내로 입력하세요")
    .refine((name) => !name || TEAM_NAME_CHARACTERS.test(name), "이모지와 허용되지 않은 문자는 사용할 수 없습니다")
    .refine((name) => !name || /[가-힣A-Za-z0-9]/.test(name), "팀 이름에 한글·영문·숫자를 하나 이상 포함하세요")
    .refine((name) => !["미배정", "팀 미배정"].includes(name), "미배정은 팀 이름으로 사용할 수 없습니다"),
});
export type TeamForm = z.infer<typeof teamFormSchema>;
