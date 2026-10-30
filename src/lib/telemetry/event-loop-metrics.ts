import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import type { Meter } from "@opentelemetry/api";

export function registerEventLoopMetrics(meter: Meter) {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let previous = performance.eventLoopUtilization();
  const p95 = meter.createObservableGauge("nodejs.eventloop.lag.p95", {
    unit: "s",
    description:
      "Event loop delay p95 since previous collection; 20ms sampling resolution",
  });
  const max = meter.createObservableGauge("nodejs.eventloop.lag.max", {
    unit: "s",
    description: "Maximum event loop delay since previous collection",
  });
  const utilization = meter.createObservableGauge(
    "nodejs.eventloop.utilization",
    {
      description:
        "Event loop active fraction since previous collection (0 to 1); not CPU usage",
    },
  );
  const collect: Parameters<Meter["addBatchObservableCallback"]>[0] = (
    result,
  ) => {
    const current = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(current, previous);
    previous = current;
    if (Number.isFinite(delta.utilization)) {
      result.observe(utilization, delta.utilization);
    }
    // 표본이 없으면 지연 0을 만들지 않고 같은 수집 구간의 통계를 내보낸다.
    if (histogram.count > 0) {
      result.observe(p95, histogram.percentile(95) / 1e9);
      result.observe(max, histogram.max / 1e9);
    }
    histogram.reset();
  };
  const instruments = [p95, max, utilization];
  meter.addBatchObservableCallback(collect, instruments);
  return () => {
    histogram.disable();
    meter.removeBatchObservableCallback(collect, instruments);
  };
}
