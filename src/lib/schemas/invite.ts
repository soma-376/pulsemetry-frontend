import { z } from "zod";
import { INVITATION_LIMIT } from "@/lib/api/invitations";
import { memberRoleSchema as roleSchema } from "./member";

export const plannedVendorIdsSchema = z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)).max(100)
  .refine(ids => new Set(ids).size === ids.length, "같은 제품을 중복 선택할 수 없습니다");

const emailSchema = z.string().trim().pipe(z.email("이메일 형식이 아닙니다"));

/** 입력 중에는 비어 있는 초안과 초대 목록을 허용합니다. */
export const inviteFormSchema = z.object({
  draft: z.string().trim().refine(
    (value) => value === "" || emailSchema.safeParse(value).success,
    "이메일 형식이 아닙니다",
  ),
  team: z.string(),
  role: roleSchema,
  plannedVendorIds: plannedVendorIdsSchema.optional(),
  invitees: z.array(z.object({
    email: emailSchema,
    team: z.string().nullable(),
    role: roleSchema.nullable(),
    plannedVendorIds: plannedVendorIdsSchema.nullable().optional(),
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
  })
  .refine(({ invitees }) => invitees.length <= INVITATION_LIMIT, {
    path: ["draft"],
    message: `한 번에 ${INVITATION_LIMIT}명까지 초대할 수 있습니다`,
  });

export type InviteForm = z.infer<typeof inviteFormSchema>;
