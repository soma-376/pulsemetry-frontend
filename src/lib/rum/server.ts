import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { sanitizeRumBody } from "./payload";

export function rumConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.RUM_ENABLED !== "true" ||
    !["local", "dev"].includes(env.RUM_ENVIRONMENT ?? "")
  )
    return null;
  const endpoint = env.FARO_COLLECTOR_URL;
  const origin = env.BFF_ORIGIN;
  if (!endpoint || !origin) return null;
  try {
    const url = new URL(endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/collect" ||
      url.search ||
      url.hash
    )
      return null;
    return {
      endpoint,
      origin: new URL(origin).origin,
      environment: env.RUM_ENVIRONMENT as "local" | "dev",
    };
  } catch {
    return null;
  }
}
export function createRumHandler(
  fetcher: typeof fetch = fetch,
  clock = Date.now,
) {
  // IP를 저장하지 않는 프로세스 전체 제한. 두 태스크의 합산 제한은 Alloy가 담당한다.
  let tokens = 40;
  let last = clock();
  return async (request: Request, config = rumConfig()) => {
    const reply = (status: number) =>
      new Response(null, { status, headers: { "Cache-Control": "no-store" } });
    if (!config) return reply(404);
    if (request.headers.get("origin") !== config.origin) return reply(403);
    if (
      request.headers.get("content-type")?.split(";")[0] !==
        "application/json" ||
      request.headers.has("content-encoding")
    )
      return reply(415);
    const now = clock();
    tokens = Math.min(40, tokens + Math.max(0, now - last) * 0.02);
    last = now;
    if (tokens < 1) return reply(429);
    tokens--;
    if (Number(request.headers.get("content-length")) > 16_384)
      return reply(413);
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        (async () => {
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 16_384) throw new Error("oversize");
            chunks.push(value);
          }
          return Buffer.concat(chunks).toString("utf8");
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), 2_000);
        }),
      ]);
      const clean = sanitizeRumBody(JSON.parse(raw), config.environment);
      if (!clean) return reply(400);
      const response = await context.with(
        suppressTracing(context.active()),
        () =>
          fetcher(config.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(clean),
            signal: AbortSignal.timeout(2_000),
            redirect: "error",
            cache: "no-store",
          }),
      );
      await response.body?.cancel();
      return reply(response.ok ? 202 : response.status === 429 ? 429 : 503);
    } catch (error) {
      return reply(
        error instanceof SyntaxError
          ? 400
          : error instanceof Error && error.message === "oversize"
            ? 413
            : 503,
      );
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => {});
    }
  };
}
