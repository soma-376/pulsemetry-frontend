export function getTelemetryConfig(env: NodeJS.ProcessEnv) {
  // Opt in explicitly: ordinary dev, tests, builds and deployments stay off.
  if (env.OTEL_SDK_DISABLED !== "false") return null;

  const environment = env.OTEL_DEPLOYMENT_ENVIRONMENT?.trim();
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!environment || !endpoint) {
    throw new Error(
      "Telemetry requires OTEL_DEPLOYMENT_ENVIRONMENT and OTEL_EXPORTER_OTLP_ENDPOINT",
    );
  }

  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("OTEL_EXPORTER_OTLP_ENDPOINT must use HTTP or HTTPS");
  }

  return {
    environment,
    endpoint: endpoint.replace(/\/+$/, ""),
    serviceName: env.OTEL_SERVICE_NAME?.trim() || "pulsemetry-frontend",
  };
}
