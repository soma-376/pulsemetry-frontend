import { z } from "zod";

const emailSchema = z.string().trim().pipe(z.email("이메일 형식이 아닙니다"));
const roleSchema = z.enum(["member", "lead", "viewer", "admin"], {
  error: "역할을 선택하세요",
});

/** 입력 중에는 비어 있는 초안과 초대 목록을 허용합니다. */
export const inviteFormSchema = z.object({
  draft: z.string().trim().refine(
    (value) => value === "" || emailSchema.safeParse(value).success,
    "이메일 형식이 아닙니다",
  ),
  team: z.string(),
  role: roleSchema,
  invitees: z.array(z.object({
    email: emailSchema,
    team: z.string().nullable(),
    role: roleSchema.nullable(),
  })),
}).superRefine(({ draft, invitees }, context) => {
  const emails = new Set<string>();
  invitees.forEach(({ email }, index) => {
    if (emails.has(email)) {
      context.addIssue({
        code: "custom",
        path: ["invitees", index, "email"],
        message: "이미 추가한 이메일입니다",
      });
    }
    emails.add(email);
  });
  if (draft && emails.has(draft)) {
    context.addIssue({
      code: "custom",
      path: ["draft"],
      message: "이미 추가한 이메일입니다",
    });
  }
});

/** 제출 시에는 초안을 모두 목록에 추가하고, 최소 한 명을 지정해야 합니다. */
export const inviteSubmissionSchema = inviteFormSchema
  .refine(({ draft }) => draft === "", {
    path: ["draft"],
    message: "Enter 또는 쉼표로 이메일을 추가한 뒤 초대하세요",
  })
  .refine(({ invitees }) => invitees.length > 0, {
    path: ["draft"],
    message: "초대할 이메일을 하나 이상 추가하세요",
  });

export type InviteForm = z.infer<typeof inviteFormSchema>;
