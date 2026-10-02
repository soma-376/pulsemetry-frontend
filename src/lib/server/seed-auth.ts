import { z } from "zod";
import { loginSchema } from "@/lib/schemas/auth";

const organizations: Record<string, string> = {
  "seed-a.example.test": "1b59ab21-1788-35e0-bfd7-23baa88a35b4",
  "seed-b.example.test": "db1c8c6b-6970-38c6-821a-eb5e61b7a180",
  "seed-c.example.test": "4769355c-a20e-327f-89fc-fef69e94dfb6",
  // 파괴적 시험용 빈 조직(백엔드 tools/dev-seed — 명시할 때만 적재한다). D 는 조직과 오너뿐, E 는 정책 1판과 설치 초대 코드.
  "seed-d.example.test": "e77dd38f-4e6c-33ff-84bd-79c8a53ba900",
  "seed-e.example.test": "bd6fe5c2-6fdd-3433-b77e-5d5334b0bb8e",
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
