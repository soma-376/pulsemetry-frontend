import { randomUUID } from "node:crypto";
import { metrics } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AlwaysOnSampler, BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { registerContainerMetrics } from "./container-metrics";
import { registerEventLoopMetrics } from "./event-loop-metrics";
import { registerHeapMetrics } from "./heap-metrics";
import { getTelemetryConfig } from "./config";
import { captureConsoleLogs } from "./logging";
import { createRequestMetricsProcessor } from "./request-metrics";

const state = globalThis as typeof globalThis & {
  pulsemetryTelemetrySdk?: NodeSDK;
};

export function startTelemetry() {
  if (state.pulsemetryTelemetrySdk) return state.pulsemetryTelemetrySdk;
  const config = getTelemetryConfig(process.env);
  if (!config) return;

  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource: defaultResource().merge(
      resourceFromAttributes({
        "service.name": config.serviceName,
        "service.instance.id": randomUUID(),
        "deployment.environment.name": config.environment,
        "process.runtime.name": "nodejs",
        "process.runtime.version": process.version,
      }),
    ),
    // Request metrics depend on recording every request, even when an incoming
    // traceparent has its sampled flag unset. Revisit before adding sampling.
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      createRequestMetricsProcessor(),
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: `${config.endpoint}/v1/traces`,
          timeoutMillis: 3_000,
        }),
      }),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${config.endpoint}/v1/metrics`,
          timeoutMillis: 3_000,
        }),
        exportIntervalMillis: 5_000,
        exportTimeoutMillis: 3_000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${config.endpoint}/v1/logs`,
          timeoutMillis: 3_000,
        }),
        scheduledDelayMillis: 1_000,
        exportTimeoutMillis: 3_000,
        maxQueueSize: 2_048,
        maxExportBatchSize: 512,
      }),
    ],
  });
  sdk.start();
  state.pulsemetryTelemetrySdk = sdk;
  captureConsoleLogs();

  const meter = metrics.getMeter("pulsemetry-frontend.runtime");
  registerHeapMetrics(meter);
  registerContainerMetrics(meter);
  registerEventLoopMetrics(meter);
  const memory = meter.createObservableGauge("frontend.node.memory", {
    description: "Node.js process memory; kinds overlap and must not be summed",
    unit: "By",
  });
  memory.addCallback((result) => {
    for (const [kind, bytes] of Object.entries(process.memoryUsage())) {
      result.observe(bytes, { kind });
    }
  });

  const cpu = meter.createObservableCounter("frontend.node.cpu.time", {
    description: "Cumulative process CPU time across all threads, not host CPU",
    unit: "s",
  });
  cpu.addCallback((result) => {
    const usage = process.cpuUsage();
    result.observe((usage.user + usage.system) / 1e6);
  });

  // Next.js owns process signals. Do not install an exit handler that competes
  // with its shutdown/restart lifecycle; export periodically during execution.
  return sdk;
}
