import { z } from "zod";
import { loginSchema } from "@/lib/schemas/auth";

const organizations: Record<string, string> = {
  "seed-a.example.test": "1b59ab21-1788-35e0-bfd7-23baa88a35b4",
  "seed-b.example.test": "db1c8c6b-6970-38c6-821a-eb5e61b7a180",
  "seed-c.example.test": "4769355c-a20e-327f-89fc-fef69e94dfb6",
};
export function resolveSeedAccount(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return null;
  const [name, domain] = parsed.data.email.split("@");
  const organizationId = organizations[domain];
  if (!organizationId || !["owner", "admin"].includes(name)) return null;
  return { email: parsed.data.email, organizationId };
}
export const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), token_type: z.literal("Bearer"), expires_in: z.number().positive() });
export const userSchema = z.object({ memberId: z.string(), organizationId: z.uuid(), organizationName: z.string(), email: z.email(), displayName: z.string().nullable(), role: z.enum(["admin", "member"]) });
