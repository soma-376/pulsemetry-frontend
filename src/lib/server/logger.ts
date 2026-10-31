// Node-only logger. Browser errors use a separate RUM collection path.
import process from "node:process";

export type LogFields = {
  source?: "bff" | "upstream";
  route?: string;
  method?: string;
  status?: number;
  code?: string;
  upstreamService?: "enrollment" | "dashboard";
  upstreamStatus?: number;
  durationMs?: number;
};
type Level = "INFO" | "WARN" | "ERROR";
export type ServerLogRecord = LogFields & {
  timestamp: string;
  level: Level;
  event: string;
  trace_id?: string;
  span_id?: string;
};
type Transport = {
  context?: () => { trace_id: string; span_id: string } | undefined;
  emit: (record: ServerLogRecord) => void;
};
// Like the telemetry SDK, keep the connection across development hot reloads.
const state = globalThis as typeof globalThis & {
  pulsemetryServerLogTransport?: Transport;
};
export function setServerLogTransport(next: Transport) {
  state.pulsemetryServerLogTransport = next;
}

// Fixed metadata only: never accept request/response bodies, headers or Error
// messages (which may contain tokens). Callers supply static route templates.
export function createServerLogger(
  write = (line: string, level: Level) => {
    (level === "INFO" ? process.stdout : process.stderr).write(line);
  },
  getTransport = () => state.pulsemetryServerLogTransport,
) {
  function record(level: Level, event: string, fields: LogFields = {}) {
    try {
      const clean: LogFields = {};
      for (const key of ["status", "upstreamStatus", "durationMs"] as const) {
        const value = fields[key];
        if (typeof value === "number" && Number.isFinite(value))
          clean[key] = value;
      }
      for (const key of [
        "source",
        "route",
        "method",
        "code",
        "upstreamService",
      ] as const) {
        const value = fields[key];
        if (typeof value === "string" && /^[\w./:[\]-]{1,160}$/.test(value))
          Object.assign(clean, { [key]: value });
      }
      const target = getTransport();
      let correlation: ReturnType<NonNullable<Transport["context"]>>;
      try {
        correlation = target?.context?.();
      } catch {
        /* Logging is best effort. */
      }
      const entry: ServerLogRecord = {
        ...clean,
        timestamp: new Date().toISOString(),
        level,
        event: /^[\w.-]{1,100}$/.test(event) ? event : "invalid_log_event",
        ...correlation,
      };
      // Direct stdout/stderr bypasses the legacy console bridge, avoiding two
      // OTel records for a single event. Both destinations fail independently.
      try {
        write(`${JSON.stringify(entry)}\n`, level);
      } catch {
        /* Best effort. */
      }
      try {
        target?.emit(entry);
      } catch {
        /* Never recurse through console. */
      }
    } catch {
      /* Logging must not change the HTTP response. */
    }
  }
  return {
    info: (event: string, fields?: LogFields) => record("INFO", event, fields),
    warn: (event: string, fields?: LogFields) => record("WARN", event, fields),
    error: (event: string, fields?: LogFields) =>
      record("ERROR", event, fields),
  };
}
export type ServerLogger = ReturnType<typeof createServerLogger>;
export const logger = createServerLogger();
