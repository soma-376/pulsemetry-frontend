import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("회사 이메일을 정확히 입력하세요")),
});
export const inquirySchema = loginSchema.extend({
  company: z.string().trim().min(1, "회사명을 입력하세요").max(100, "100자 이내로 입력하세요"),
});
export type LoginForm = z.infer<typeof loginSchema>;
