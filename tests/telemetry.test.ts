import assert from "node:assert/strict";
import { test } from "node:test";
import { getTelemetryConfig } from "../src/lib/telemetry/config";

test("ordinary development and production do not enable exporting", () => {
  for (const NODE_ENV of ["development", "production", "test"] as const) {
    assert.equal(getTelemetryConfig({ NODE_ENV }), null);
  }
});

test("a local production build is still local when explicitly configured", () => {
  assert.deepEqual(
    getTelemetryConfig({
      NODE_ENV: "production",
      OTEL_SDK_DISABLED: "false",
      OTEL_DEPLOYMENT_ENVIRONMENT: "local",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:14318/",
    }),
    {
      environment: "local",
      endpoint: "http://127.0.0.1:14318",
      serviceName: "pulsemetry-frontend",
    },
  );
});

test("enabled telemetry requires an explicit destination and environment", () => {
  assert.throws(() =>
    getTelemetryConfig({ NODE_ENV: "test", OTEL_SDK_DISABLED: "false" }),
  );
  assert.throws(() =>
    getTelemetryConfig({
      NODE_ENV: "test",
      OTEL_SDK_DISABLED: "false",
      OTEL_DEPLOYMENT_ENVIRONMENT: "local",
      OTEL_EXPORTER_OTLP_ENDPOINT: "file:///tmp/metrics",
    }),
  );
});
