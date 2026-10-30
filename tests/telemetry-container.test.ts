import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { registerContainerMetrics } from "../src/lib/telemetry/container-metrics";

for (const scenario of [
  "valid",
  "missing",
  "failure",
  "stale",
  "invalid",
] as const) {
  test(`container memory: ${scenario}`, async () => {
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    const provider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 60_000,
        }),
      ],
    });
    let calls = 0;
    try {
      registerContainerMetrics(
        provider.getMeter("test"),
        scenario === "missing" ? "" : "http://169.254.170.2/v4/test",
        async (url, init) => {
          calls++;
          assert.equal(url, "http://169.254.170.2/v4/test/stats");
          assert.ok(init?.signal);
          if (scenario === "failure") throw new Error("unreachable");
          return Response.json({
            read: new Date(
              Date.now() - (scenario === "stale" ? 60_000 : 0),
            ).toISOString(),
            memory_stats: {
              usage: 128 * 1024 ** 2,
              limit: scenario === "invalid" ? 0 : 512 * 1024 ** 2,
            },
          });
        },
      );
      await provider.forceFlush();
      const metrics = exporter
        .getMetrics()
        .flatMap((r) => r.scopeMetrics)
        .flatMap((s) => s.metrics);
      const value = (name: string) =>
        metrics.find((m) => m.descriptor.name === name)?.dataPoints[0]?.value;
      if (scenario === "missing") {
        assert.equal(calls, 0);
        assert.equal(metrics.length, 0);
      } else if (scenario === "valid") {
        assert.equal(value("container.memory.usage"), 128 * 1024 ** 2);
        assert.equal(value("container.memory.limit"), 512 * 1024 ** 2);
        assert.equal(value("frontend.container.collection.success"), 1);
      } else {
        assert.equal(value("container.memory.usage"), undefined);
        assert.equal(value("container.memory.limit"), undefined);
        assert.equal(value("frontend.container.collection.success"), 0);
      }
    } finally {
      await provider.shutdown();
    }
  });
}
