import { z } from "zod";

export const memberRoleSchema = z.enum(["member", "lead", "viewer", "admin"], {
  error: "역할을 선택하세요",
});

export const memberAssignmentSchema = z.object({
  team: z.string(),
  role: memberRoleSchema,
});

export type MemberRole = z.infer<typeof memberRoleSchema>;
export type MemberAssignment = z.infer<typeof memberAssignmentSchema>;
