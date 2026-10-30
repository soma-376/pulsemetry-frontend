import assert from "node:assert/strict";
import { test } from "node:test";
import { ROOT_CONTEXT, SpanKind, trace } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { AlwaysOnSampler, TracerProvider } from "@opentelemetry/sdk-trace";
import { createRequestMetricsProcessor } from "../src/lib/telemetry/request-metrics";

test("request histogram counts only completed outer requests, keeps 4xx/5xx and bounded labels", async () => {
  const exporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60_000,
  });
  const meters = new MeterProvider({ readers: [reader] });
  const processor = createRequestMetricsProcessor(() =>
    meters.getMeter("test"),
  );
  const provider = new TracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [processor],
  });
  const tracer = provider.getTracer("next-test");
  try {
    // The upstream client must not be able to suppress local request metrics.
    const unsampledParent = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      traceFlags: 0,
      isRemote: true,
    });
    for (const status of [200, 200, 404, 503]) {
      const span = tracer.startSpan(
        "GET /secret?token=private",
        {
          kind: SpanKind.SERVER,
          startTime: [100, 0],
          attributes: {
            "next.span_type": "BaseServer.handleRequest",
            "http.method": "GET",
            "http.status_code": status,
            "http.target": "/secret?token=private",
            "http.route": "/users/[id]",
          },
        },
        unsampledParent,
      );
      span.end([100, 250_000_000]);
    }
    tracer
      .startSpan("GET /api/rum/config", {
        kind: SpanKind.SERVER,
        attributes: {
          "next.span_type": "BaseServer.handleRequest",
          "http.status_code": 200,
          "http.route": "/api/rum/config",
        },
      })
      .end();
    for (const [kind, type, status] of [
      [SpanKind.INTERNAL, "AppRender.getBodyResult", 200],
      [SpanKind.CLIENT, "BaseServer.handleRequest", 200],
      [SpanKind.SERVER, "BaseServer.handleRequest", undefined],
    ] as const) {
      tracer
        .startSpan("ignored", {
          kind,
          attributes: { "next.span_type": type, "http.status_code": status },
        })
        .end();
    }
    await meters.forceFlush();
    const histogram = exporter
      .getMetrics()
      .flatMap((r) => r.scopeMetrics)
      .flatMap((s) => s.metrics)
      .find((m) => m.descriptor.name === "frontend.http.server.duration");
    assert.ok(histogram);
    assert.equal(histogram.dataPoints.length, 3);
    for (const point of histogram.dataPoints) {
      assert.deepEqual(Object.keys(point.attributes).sort(), [
        "http.request.method",
        "http.response.status_code",
      ]);
      assert.ok(typeof point.value === "object" && "count" in point.value);
      const expected =
        point.attributes["http.response.status_code"] === 200 ? 2 : 1;
      assert.equal(point.value.count, expected);
      assert.equal(point.value.sum, expected * 0.25);
    }
  } finally {
    await provider.shutdown();
    await meters.shutdown();
  }
});
