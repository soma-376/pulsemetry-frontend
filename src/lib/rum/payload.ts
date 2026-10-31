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
const exception = z.object({
  type: z.string().max(128),
  context: z
    .object({
      source: z
        .enum(["unhandled", "react-boundary", "global-boundary"])
        .optional(),
      digest: z
        .string()
        .regex(/^[a-fA-F0-9]{1,64}$/)
        .optional(),
    })
    .optional(),
  stacktrace: z
    .object({
      frames: z
        .array(
          z.object({
            filename: z.string().max(2048),
            lineno: z.number().int().min(0).max(10_000_000).optional(),
            colno: z.number().int().min(0).max(10_000_000).optional(),
          }),
        )
        .max(100),
    })
    .optional(),
});
const errorTypes = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "RangeError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "UnhandledRejection",
  "ChunkLoadError",
]);
function assetPath(filename: string) {
  try {
    const path = new URL(filename, "https://asset.invalid").pathname;
    return /^\/_next\/static\/[A-Za-z0-9_./\[\]-]{1,240}\.js$/.test(path)
      ? path
      : undefined;
  } catch {
    return undefined;
  }
}
const body = z
  .object({
    meta: z.object({ page: z.object({ url: z.enum(entryPages) }) }),
    measurements: z.array(measurement).max(10).default([]),
    exceptions: z.array(exception).max(10).default([]),
  })
  .refine(
    (v) =>
      v.measurements.length + v.exceptions.length > 0 &&
      v.measurements.length + v.exceptions.length <= 10,
  );
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
    ...(parsed.data.exceptions.length
      ? {
          exceptions: parsed.data.exceptions.map((item) => ({
            type: errorTypes.has(item.type) ? item.type : "Error",
            value: "Browser exception (message omitted)",
            timestamp: now.toISOString(),
            context: {
              source: item.context?.source ?? "unhandled",
              ...(item.context?.digest ? { digest: item.context.digest } : {}),
            },
            stacktrace: {
              frames: (item.stacktrace?.frames ?? [])
                .flatMap((frame) => {
                  const filename = assetPath(frame.filename);
                  return filename
                    ? [
                        {
                          filename,
                          function: "<anonymous>",
                          lineno: frame.lineno,
                          colno: frame.colno,
                        },
                      ]
                    : [];
                })
                .slice(0, 5),
            },
          })),
        }
      : {}),
  };
}
