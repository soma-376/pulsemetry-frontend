import type { Instrumentation } from "next";

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.OTEL_SDK_DISABLED === "false"
  ) {
    const { startTelemetry } = await import("./lib/telemetry/server");
    startTelemetry();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.OTEL_SDK_DISABLED === "false"
  ) {
    const { recordRequestError } = await import("./lib/telemetry/logging");
    await recordRequestError(error, request, context);
  }
};
