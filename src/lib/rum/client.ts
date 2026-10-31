import { entryPage, sanitizeRumBody } from "./payload";
import { createErrorGate } from "./error-gate";
import type { Faro } from "@grafana/faro-web-sdk";

let starting: Promise<void> | undefined;
let instance: Faro | undefined;
const reported = new WeakSet<Error>();
export async function reportBrowserError(
  error: Error & { digest?: string },
  source: "react-boundary" | "global-boundary" = "react-boundary",
) {
  if (reported.has(error)) return;
  reported.add(error);
  try {
    await startRum();
    instance?.api.pushError(error, {
      context: {
        source,
        ...(error.digest && /^[a-fA-F0-9]{1,64}$/.test(error.digest)
          ? { digest: error.digest }
          : {}),
      },
    });
  } catch {
    /* Error reporting must never break the fallback UI. */
  }
}
export function startRum() {
  return (starting ??= initialize().catch(() => {
    // 관측 실패가 화면 실행이나 오류 로그 수집 반복을 유발하지 않는다.
  }));
}
async function initialize() {
  const page = entryPage(window.location.pathname);
  const response = await fetch("/api/rum/config", {
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) return;
  const config = await response.json();
  if (config.enabled !== true || !["local", "dev"].includes(config.environment))
    return;
  const {
    initializeFaro,
    WebVitalsInstrumentation,
    ErrorsInstrumentation,
    FetchTransport,
  } = await import("@grafana/faro-web-sdk");
  const allowError = createErrorGate();
  instance = initializeFaro({
    app: { name: "pulsemetry-browser", environment: config.environment },
    instrumentations: [
      new WebVitalsInstrumentation(),
      new ErrorsInstrumentation(),
    ],
    metas: [],
    sessionTracking: { enabled: false, persistent: false },
    trackGeolocation: false,
    preventGlobalExposure: true,
    webVitalsInstrumentation: {
      reportAllChanges: false,
      trackAttributionSources: false,
    },
    batching: { enabled: true, sendTimeout: 1_000, itemLimit: 3 },
    transports: [
      new FetchTransport({
        url: new URL("/api/rum/collect", location.origin).href,
        requestCompression: false,
        requestTimeoutMs: 3_000,
        retry: { maxAttempts: 1 },
        requestOptions: { credentials: "omit", referrerPolicy: "no-referrer" },
      }),
    ],
    beforeSend(item) {
      if (item.type === "exception") {
        const clean = sanitizeRumBody(
          {
            meta: { page: { url: entryPage(window.location.pathname) } },
            exceptions: [item.payload],
          },
          config.environment,
        );
        const exception = clean?.exceptions?.[0];
        if (!exception) return null;
        const identity = [
          exception.type,
          exception.context,
          exception.stacktrace,
        ];
        if (!allowError(JSON.stringify([clean.meta.page.url, identity])))
          return null;
        return { type: item.type, payload: exception, meta: clean.meta };
      }
      if (item.type !== "measurement") return null;
      const clean = sanitizeRumBody(
        { meta: { page: { url: page } }, measurements: [item.payload] },
        config.environment,
      );
      return clean
        ? { type: item.type, payload: clean.measurements[0], meta: clean.meta }
        : null;
    },
  });
}
