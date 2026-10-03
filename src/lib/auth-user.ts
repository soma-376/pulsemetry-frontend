import { z } from "zod";

export const authUserSchema = z.object({
  memberId: z.string(), organizationId: z.uuid(), organizationName: z.string(),
  email: z.email(), displayName: z.string().nullable(), role: z.enum(["admin", "member"]),
});
export type AuthUser = z.infer<typeof authUserSchema>;
