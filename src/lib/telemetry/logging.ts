import { formatWithOptions, stripVTControlCharacters } from "node:util";
import { context, logs, SeverityNumber, type Logger } from "@opentelemetry/api";
import { isTracingSuppressed } from "@opentelemetry/core";
import type { Instrumentation } from "next";

const levels = {
  debug: SeverityNumber.DEBUG,
  log: SeverityNumber.INFO,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
} as const;

type ConsoleOutput = Pick<Console, keyof typeof levels>;
const installed = new WeakSet<ConsoleOutput>();

// Preserve terminal output; a logging failure must never fail an app request.
export function captureConsoleLogs(
  output: ConsoleOutput = console,
  logger: Logger = logs.getLogger("pulsemetry-frontend.console"),
) {
  if (installed.has(output)) return;
  installed.add(output);
  let emitting = false;
  for (const method of Object.keys(levels) as (keyof typeof levels)[]) {
    const original = output[method].bind(output);
    output[method] = (...args: unknown[]) => {
      original(...args);
      if (emitting || isTracingSuppressed(context.active())) return;
      emitting = true;
      try {
        const error = args.find((arg): arg is Error => arg instanceof Error);
        logger.emit({
          severityNumber: levels[method],
          severityText: method === "log" ? "INFO" : method.toUpperCase(),
          body: stripVTControlCharacters(
            formatWithOptions({ colors: false }, ...args),
          ),
          attributes: {
            "log.source": "console",
            ...(error && {
              "exception.type": error.name,
              "exception.message": error.message,
              "exception.stacktrace": error.stack,
            }),
          },
        });
      } catch {
        // Do not log exporter failures through the console bridge itself.
      } finally {
        emitting = false;
      }
    };
  }
}

export const recordRequestError: Instrumentation.onRequestError = (
  error,
  request,
  route,
) => {
  try {
    logs.getLogger("pulsemetry-frontend.request").emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: error instanceof Error ? error.message : String(error),
      attributes: {
        "log.source": "next.request",
        "http.request.method": request.method,
        "http.route": route.routePath,
        "next.route.type": route.routeType,
        ...(error instanceof Error && {
          "exception.type": error.name,
          "exception.message": error.message,
          "exception.stacktrace": error.stack,
        }),
      },
    });
  } catch {
    // Request headers, query strings and bodies are deliberately not collected.
  }
};
