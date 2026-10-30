import { z } from "zod";

export const entryPages = [
  "/",
  "/login",
  "/overview",
  "/teams",
  "/members",
  "/settings",
  "/ops",
  "/security",
  "/onboarding",
  "/other",
] as const;
export function entryPage(path: string) {
  return (
    entryPages.find(
      (page) => page !== "/" && (path === page || path.startsWith(page + "/")),
    ) ?? (path === "/" ? "/" : "/other")
  );
}
const measurement = z.object({
  type: z.literal("web-vitals"),
  values: z
    .object({
      lcp: z.number().finite().min(0).max(3_600_000).optional(),
      inp: z.number().finite().min(0).max(3_600_000).optional(),
      cls: z.number().finite().min(0).max(100).optional(),
    })
    .refine((v) => Object.keys(v).length === 1),
  context: z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }),
});
const body = z.object({
  meta: z.object({ page: z.object({ url: z.enum(entryPages) }) }),
  measurements: z.array(measurement).min(1).max(10),
});
// 브라우저와 서버 모두 허용목록으로 새 객체를 만들어 부가 정보가 통과하지 않게 한다.
export function sanitizeRumBody(
  input: unknown,
  environment: "local" | "dev",
  now = new Date(),
) {
  const parsed = body.safeParse(input);
  if (!parsed.success) return null;
  return {
    meta: {
      app: { name: "pulsemetry-browser", environment },
      page: parsed.data.meta.page,
    },
    measurements: parsed.data.measurements.map((item) => ({
      ...item,
      timestamp: now.toISOString(),
    })),
  };
}
