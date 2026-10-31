import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createServerLogger,
  type ServerLogRecord,
} from "../src/lib/server/logger";
import {
  connectServerLogger,
  captureConsoleLogs,
} from "../src/lib/telemetry/logging";
import {
  context,
  ROOT_CONTEXT,
  trace,
  type LogRecord,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";

test("structured logs work without telemetry and allow only safe metadata", () => {
  const lines: string[] = [];
  const logger = createServerLogger(
    (line) => {
      lines.push(line);
    },
    () => undefined,
  );
  const fields = {
    status: 429,
    source: "upstream" as const,
    code: "rate_limited",
    route: "/auth?token=secret",
    authorization: "Bearer secret",
    cookie: "secret",
    body: { email: "private@example.test" },
    error: new Error("secret"),
  };
  logger.warn("bff.request.failed", fields);
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.level, "WARN");
  assert.equal(record.code, "rate_limited");
  for (const key of ["route", "authorization", "cookie", "body", "error"])
    assert.equal(record[key], undefined);
  assert.doesNotMatch(lines[0], /secret|private/);
});

test("stdout and telemetry fail independently without changing application behavior", () => {
  const records: ServerLogRecord[] = [];
  const first = createServerLogger(
    () => {
      throw new Error("stdout down");
    },
    () => ({
      emit: (record) => {
        records.push(record);
      },
    }),
  );
  assert.doesNotThrow(() => first.error("test.failed"));
  assert.equal(records.length, 1);
  const lines: string[] = [];
  const second = createServerLogger(
    (line) => {
      lines.push(line);
    },
    () => ({
      context: () => {
        throw new Error("context down");
      },
      emit: () => {
        throw new Error("export down");
      },
    }),
  );
  assert.doesNotThrow(() => second.warn("test.failed"));
  assert.equal(lines.length, 1);
});

test("structured logging emits once with trace correlation even when console bridge is installed", () => {
  const manager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(manager);
  const records: LogRecord[] = [];
  const adapter = {
    enabled: () => true,
    emit: (record: LogRecord) => {
      records.push(record);
    },
  };
  connectServerLogger(adapter);
  const output: Pick<Console, "log" | "info" | "warn" | "error" | "debug"> = {
    log() {},
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
  captureConsoleLogs(output, adapter);
  const lines: string[] = [];
  const logger = createServerLogger((line) => {
    lines.push(line);
  });
  const span = {
    traceId: "1".repeat(32),
    spanId: "2".repeat(16),
    traceFlags: 1,
  };
  try {
    context.with(trace.setSpanContext(ROOT_CONTEXT, span), () =>
      logger.warn("bff.request.failed", { status: 429 }),
    );
    assert.equal(lines.length, 1);
    assert.equal(records.length, 1);
    assert.equal(JSON.parse(lines[0]).trace_id, span.traceId);
    assert.equal(records[0].attributes?.trace_id, span.traceId);
    assert.equal(records[0].severityText, "WARN");
    output.error("legacy error");
    assert.equal(records.length, 2);
  } finally {
    context.disable();
    manager.disable();
  }
});
