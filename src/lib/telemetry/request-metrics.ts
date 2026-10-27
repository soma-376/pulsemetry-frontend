import { metrics, SpanKind, type Meter } from "@opentelemetry/api";
import type { SpanProcessor } from "@opentelemetry/sdk-trace";

// Use only Next's outer request span: render/fetch spans would double-count.
// No raw URL, query string, request ID or user ID becomes a metric label.
export function createRequestMetricsProcessor(
  getMeter: () => Meter = () => metrics.getMeter("pulsemetry-frontend.http"),
): SpanProcessor {
  // NodeSDK installs the meter provider in start(), after constructing processors.
  let duration: ReturnType<Meter["createHistogram"]> | undefined;
  return {
    onStart() {},
    onEnd(span) {
      if (
        span.kind !== SpanKind.SERVER ||
        span.attributes["next.span_type"] !== "BaseServer.handleRequest"
      ) {
        return;
      }
      const status = Number(
        span.attributes["http.response.status_code"] ??
          span.attributes["http.status_code"],
      );
      if (!Number.isInteger(status) || status < 100 || status > 599) return;

      const rawMethod =
        span.attributes["http.request.method"] ??
        span.attributes["http.method"];
      const method =
        typeof rawMethod === "string" &&
        /^(GET|HEAD|POST|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH)$/.test(
          rawMethod,
        )
          ? rawMethod
          : "OTHER";
      duration ??= getMeter().createHistogram("frontend.http.server.duration", {
        description: "Completed Next.js request spans; excludes child spans",
        unit: "s",
        advice: {
          explicitBucketBoundaries: [
            0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
          ],
        },
      });
      duration.record(span.duration[0] + span.duration[1] / 1e9, {
        "http.request.method": method,
        "http.response.status_code": status,
      });
    },
    async forceFlush() {},
    async shutdown() {},
  };
}
