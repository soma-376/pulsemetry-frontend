import assert from "node:assert/strict";
import { test } from "node:test";
import {
  context,
  logs,
  ROOT_CONTEXT,
  trace,
  SeverityNumber,
  type Logger,
  type LogRecord,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { suppressTracing } from "@opentelemetry/core";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  captureConsoleLogs,
  recordRequestError,
} from "../src/lib/telemetry/logging";

function fakeConsole() {
  const calls: unknown[][] = [];
  const write = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    output: {
      debug: write,
      log: write,
      info: write,
      warn: write,
      error: write,
    },
    calls,
  };
}

test("console bridge preserves output, severity, formatting and stack; installs once", () => {
  const { output, calls } = fakeConsole();
  const records: LogRecord[] = [];
  const logger: Logger = {
    enabled: () => true,
    emit: (record: LogRecord) => records.push(record),
  };
  captureConsoleLogs(output, logger);
  captureConsoleLogs(output, logger);
  output.info("rows=%d", 3);
  const error = new Error("invalid column");
  output.error("CSV failed", error);
  output.warn("slow");
  output.debug("debug");
  output.log("normal");
  assert.equal(calls.length, 5);
  assert.equal(records.length, 5);
  assert.equal(records[0].body, "rows=3");
  assert.deepEqual(
    records.map((r) => r.severityNumber),
    [
      SeverityNumber.INFO,
      SeverityNumber.ERROR,
      SeverityNumber.WARN,
      SeverityNumber.DEBUG,
      SeverityNumber.INFO,
    ],
  );
  assert.equal(records[1].attributes?.["exception.stacktrace"], error.stack);
});

test("telemetry failure or synchronous recursion does not interrupt console output", () => {
  const { output, calls } = fakeConsole();
  let count = 0;
  captureConsoleLogs(output, {
    enabled: () => true,
    emit() {
      count++;
      output.warn("exporter diagnostic");
      throw new Error("offline");
    },
  });
  assert.doesNotThrow(() => output.error("application error"));
  assert.equal(count, 1);
  assert.equal(calls.length, 2);
});

test("logs carry active trace IDs; SDK diagnostics are suppressed; request headers stay out", async () => {
  const manager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(manager);
  const exporter = new InMemoryLogRecordExporter();
  const provider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor({ exporter })],
  });
  logs.setGlobalLoggerProvider(provider);
  const { output, calls } = fakeConsole();
  captureConsoleLogs(output, provider.getLogger("test"));
  const spanContext = {
    traceId: "11111111111111111111111111111111",
    spanId: "2222222222222222",
    traceFlags: 1,
  };
  try {
    context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () =>
      output.error("traced failure"),
    );
    context.with(suppressTracing(ROOT_CONTEXT), () =>
      output.error("SDK diagnostic"),
    );
    await recordRequestError(
      new Error("request failed"),
      {
        method: "GET",
        path: "/test?token=secret",
        headers: { authorization: "secret" },
      },
      {
        routerKind: "App Router",
        routePath: "/test",
        routeType: "route",
        revalidateReason: undefined,
      },
    );
    await provider.forceFlush();
    const records = exporter.getFinishedLogRecords();
    assert.equal(records.length, 2);
    assert.equal(calls.length, 2);
    assert.equal(records[0].spanContext?.traceId, spanContext.traceId);
    assert.equal(records[1].attributes["log.source"], "next.request");
    assert.equal(records[1].attributes["http.route"], "/test");
    assert.ok(!JSON.stringify(records[1].attributes).includes("secret"));
  } finally {
    await provider.shutdown();
    logs.disable();
    context.disable();
    manager.disable();
  }
});
