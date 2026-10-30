import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { registerEventLoopMetrics } from "../src/lib/telemetry/event-loop-metrics";

test("이벤트 루프 구간 통계와 단위를 내보내고 모니터를 정리한다", async () => {
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
  const meter = provider.getMeter("test");
  const registration = mock.method(meter, "addBatchObservableCallback");
  const dispose = registerEventLoopMetrics(meter);
  try {
    await setTimeout(100);
    await provider.forceFlush();
    const metrics = exporter
      .getMetrics()
      .flatMap((r) => r.scopeMetrics)
      .flatMap((s) => s.metrics);
    const metric = (name: string) =>
      metrics.find((m) => m.descriptor.name === name);
    const p95 = metric("nodejs.eventloop.lag.p95");
    const max = metric("nodejs.eventloop.lag.max");
    const elu = metric("nodejs.eventloop.utilization");
    assert.ok(p95 && max && elu);
    assert.equal(p95.descriptor.unit, "s");
    assert.equal(max.descriptor.unit, "s");
    assert.ok(Number(p95.dataPoints[0].value) > 0);
    assert.ok(
      Number(max.dataPoints[0].value) >= Number(p95.dataPoints[0].value),
    );
    assert.ok(
      Number(elu.dataPoints[0].value) >= 0 &&
        Number(elu.dataPoints[0].value) <= 1,
    );
    // 같은 이벤트 루프 턴의 재수집은 이전 지연 표본을 재사용하지 않는다.
    const callback = registration.mock.calls[0].arguments[0];
    const observed: unknown[] = [];
    await callback({
      observe: (instrument) => {
        observed.push(instrument);
      },
    });
    // SDK가 이전 게이지를 보존할 수 있으므로 새 callback 관측 자체를 확인한다.
    assert.equal(observed.length, 1);
  } finally {
    dispose();
    await provider.shutdown();
  }
});
