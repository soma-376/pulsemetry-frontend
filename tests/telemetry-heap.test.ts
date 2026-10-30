import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { registerHeapMetrics } from "../src/lib/telemetry/heap-metrics";

test("실제 V8 영역별 용량을 바이트 단위로 내보낸다", async () => {
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
  try {
    registerHeapMetrics(provider.getMeter("test"));
    await provider.forceFlush();
    const metric = exporter
      .getMetrics()
      .flatMap((r) => r.scopeMetrics)
      .flatMap((s) => s.metrics)
      .find((m) => m.descriptor.name === "frontend.node.heap.space");
    assert.ok(metric);
    assert.equal(metric.descriptor.unit, "By");
    assert.ok(metric.dataPoints.length > 0);
    const spaces = new Map<string, Set<string>>();
    for (const point of metric.dataPoints) {
      assert.equal(typeof point.value, "number");
      assert.ok(Number.isFinite(point.value) && Number(point.value) >= 0);
      const space = String(point.attributes.space);
      assert.ok(space.length > 0);
      const kinds = spaces.get(space) ?? new Set<string>();
      kinds.add(String(point.attributes.kind));
      spaces.set(space, kinds);
    }
    for (const kinds of spaces.values())
      assert.deepEqual(kinds, new Set(["total", "used", "available"]));
  } finally {
    await provider.shutdown();
  }
});
