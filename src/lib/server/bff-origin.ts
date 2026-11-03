/** localhost 허용은 dev 세션 환경에만 적용하며 포트까지 정확히 비교한다. */
export function createBffOriginPolicy(config: {
  origin: string;
  environment?: string;
  localOrigins?: string[];
}) {
  const primary = new URL(config.origin).origin;
  const locals = new Set<string>();
  if (config.localOrigins?.length && config.environment !== "dev")
    throw new Error("BFF_LOCAL_ORIGINS는 dev 환경에서만 설정할 수 있습니다.");
  for (const value of config.localOrigins ?? []) {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.hostname !== "localhost" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      value !== url.origin
    )
      throw new Error(
        "BFF_LOCAL_ORIGINS에는 정확한 localhost origin을 설정하세요.",
      );
    locals.add(url.origin);
  }
  const allowed = (value: string | null) =>
    value !== null && (value === primary || locals.has(value));
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const headers = [
    "content-type",
    "x-pulsemetry-request",
    "idempotency-key",
    "if-match",
  ];
  function cors(request: Request, response: Response) {
    response.headers.append("Vary", "Origin");
    const origin = request.headers.get("origin");
    if (allowed(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin!);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set(
        "Access-Control-Expose-Headers",
        "Retry-After, ETag, Location",
      );
    }
    return response;
  }
  function preflight(request: Request) {
    const requested = (
      request.headers.get("access-control-request-headers") ?? ""
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const valid =
      allowed(request.headers.get("origin")) &&
      methods.includes(
        request.headers.get("access-control-request-method") ?? "",
      ) &&
      requested.includes("x-pulsemetry-request") &&
      requested.every((value) => headers.includes(value));
    const response = new Response(null, {
      status: valid ? 204 : 403,
      headers: { "Cache-Control": "no-store" },
    });
    if (!valid) return response;
    response.headers.set("Access-Control-Allow-Methods", methods.join(", "));
    response.headers.set("Access-Control-Allow-Headers", headers.join(", "));
    response.headers.append(
      "Vary",
      "Access-Control-Request-Method, Access-Control-Request-Headers",
    );
    return cors(request, response);
  }
  return {
    allowed,
    cors,
    preflight,
    allowsCrossSite: (value: string | null) =>
      value !== null && locals.has(value),
    allowsCallback: (callback: string, requestOrigin: string | null) =>
      allowed(requestOrigin) && callback === `${requestOrigin}/auth/callback`,
  };
}

export function runtimeBffOriginPolicy() {
  return createBffOriginPolicy({
    origin: process.env.BFF_ORIGIN!,
    environment: process.env.BFF_SESSION_ENV,
    localOrigins: process.env.BFF_LOCAL_ORIGINS?.split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  });
}
