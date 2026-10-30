import { getHeapSpaceStatistics } from "node:v8";
import type { Meter } from "@opentelemetry/api";

export function registerHeapMetrics(meter: Meter) {
  const heap = meter.createObservableGauge("frontend.node.heap.space", {
    description:
      "V8 heap space statistics; available is not the container memory headroom",
    unit: "By",
  });
  heap.addCallback((result) => {
    // 영역 목록은 V8 버전에 따라 달라지므로 고정하지 않는다.
    for (const space of getHeapSpaceStatistics()) {
      for (const [kind, bytes] of Object.entries({
        total: space.space_size,
        used: space.space_used_size,
        available: space.space_available_size,
      })) {
        result.observe(bytes, { space: space.space_name, kind });
      }
    }
  });
}
