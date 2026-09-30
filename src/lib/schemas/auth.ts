import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("회사 이메일을 정확히 입력하세요")),
});
export const inquirySchema = loginSchema.extend({
  company: z.string().trim().min(1, "회사명을 입력하세요").max(100, "100자 이내로 입력하세요"),
});
export type LoginForm = z.infer<typeof loginSchema>;

/** 서버의 초대 코드 형식. 0·1과 헷갈리는 I·L·O·U는 쓰지 않는다. */
export const INVITATION_CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
/** 서버의 가입 규칙: 비밀번호는 12글자 이상, UTF-8로 72바이트 이하. */
export const signupSchema = z.object({
  code: z.string().trim().toUpperCase().regex(INVITATION_CODE, "초대 코드는 XXXX-XXXX-XXXX 형식입니다"),
  email: z.string().trim().toLowerCase().pipe(z.email("초대받은 회사 이메일을 정확히 입력하세요")),
  password: z.string().refine((value) => [...value].length >= 12, "비밀번호는 12글자 이상이어야 합니다")
    .refine((value) => new TextEncoder().encode(value).length <= 72, "비밀번호가 너무 깁니다"),
  confirm: z.string(),
}).refine((value) => value.password === value.confirm, { path: ["confirm"], message: "비밀번호가 서로 다릅니다" });
export type SignupForm = z.infer<typeof signupSchema>;
