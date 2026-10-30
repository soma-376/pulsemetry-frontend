import { context } from "@opentelemetry/api";
import type { Meter } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { z } from "zod";

const statsSchema = z.object({
  read: z.string().datetime({ offset: true }),
  memory_stats: z.object({
    usage: z.number().finite().nonnegative(),
    limit: z.number().finite().positive(),
  }),
});

export function registerContainerMetrics(
  meter: Meter,
  endpoint = process.env.ECS_CONTAINER_METADATA_URI_V4,
  fetcher: typeof fetch = fetch,
) {
  // ECS가 주입한 컨테이너별 endpoint가 없는 로컬에서는 값을 추정하지 않는다.
  if (!endpoint) return;
  const usage = meter.createObservableGauge("container.memory.usage", {
    unit: "By",
    description: "ECS Docker memory usage including cache; not Node RSS",
  });
  const limit = meter.createObservableGauge("container.memory.limit", {
    unit: "By",
    description: "Container memory limit reported by ECS Docker stats",
  });
  const healthy = meter.createObservableGauge(
    "frontend.container.collection.success",
  );
  meter.addBatchObservableCallback(
    async (result) => {
      try {
        const response = await context.with(
          suppressTracing(context.active()),
          () =>
            fetcher(`${endpoint.replace(/\/+$/, "")}/stats`, {
              signal: AbortSignal.timeout(1_000),
              cache: "no-store",
              redirect: "error",
            }),
        );
        if (!response.ok) throw new Error("Container stats unavailable");
        const stats = statsSchema.parse(await response.json());
        const age = Date.now() - Date.parse(stats.read);
        if (age > 30_000 || age < -5_000)
          throw new Error("Stale container stats");
        result.observe(usage, stats.memory_stats.usage);
        result.observe(limit, stats.memory_stats.limit);
        result.observe(healthy, 1);
      } catch {
        // 실패를 0바이트 사용으로 오인하지 않게 메모리 값은 생략한다.
        result.observe(healthy, 0);
      }
    },
    [usage, limit, healthy],
  );
}
