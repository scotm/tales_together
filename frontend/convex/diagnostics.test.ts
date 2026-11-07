/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function event(index: number) {
  return {
    eventId: `evt-${index}`,
    operationId: "op-test",
    traceId: "trace-test",
    name: "operation.stage",
    level: "info" as const,
    source: "convex" as const,
    sequence: index,
    timestamp: index,
  };
}

test("a trace returns one deduplicated, bounded operation timeline", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "op-test",
    traceId: "trace-test",
    name: "write",
    source: "convex",
    startedAt: 1,
  });
  await t.mutation(internal.diagnostics.recordEvent, event(1));
  await t.mutation(internal.diagnostics.recordEvent, event(1));
  await t.mutation(internal.diagnostics.finishOperation, {
    operationId: "op-test",
    status: "failed",
    endedAt: 5,
    durationMs: 4,
    errorCode: "PROVIDER_TIMEOUT",
    safeMessage: "The provider timed out.",
  });

  const trace = await t.query(internal.diagnostics.trace, {
    operationId: "op-test",
  });
  expect(trace.events).toHaveLength(1);
  expect(trace.operation).toMatchObject({
    status: "failed",
    errorCode: "PROVIDER_TIMEOUT",
    durationMs: 4,
  });
});

test("per-operation event detail is capped", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "op-test",
    traceId: "trace-test",
    name: "write",
    source: "convex",
    startedAt: 1,
  });
  for (let index = 0; index < 60; index += 1) {
    await t.mutation(internal.diagnostics.recordEvent, event(index));
  }
  const trace = await t.query(internal.diagnostics.trace, {
    operationId: "op-test",
  });
  expect(trace.events).toHaveLength(50);
});

test("expired diagnostics are deleted in bounded batches", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let index = 0; index < 5; index += 1) {
      await ctx.db.insert("diagnosticEvents", {
        eventId: `expired-${index}`,
        name: "operation.failed",
        level: "error",
        source: "convex",
        sequence: index,
        timestamp: 0,
        createdAt: 0,
        expiresAt: 0,
      });
    }
    await ctx.db.insert("diagnosticOperations", {
      operationId: "expired-operation",
      name: "write",
      source: "convex",
      status: "failed",
      startedAt: 0,
      createdAt: 0,
      expiresAt: 0,
    });
  });
  const result = await t.mutation(internal.diagnostics.cleanupExpired, {
    limit: 10,
  });
  expect(result).toEqual({ events: 5, operations: 1 });
  const remaining = await t.run(async (ctx) => ({
    events: await ctx.db.query("diagnosticEvents").collect(),
    operations: await ctx.db.query("diagnosticOperations").collect(),
  }));
  expect(remaining.events).toHaveLength(0);
  expect(remaining.operations).toHaveLength(0);
});

test("a watchdog note closes the summary without rewriting the original run", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "write-run-1",
    traceId: "trace-test",
    name: "write",
    source: "convex",
    startedAt: 1,
  });
  await t.mutation(internal.diagnostics.noteOperation, {
    operationId: "write-run-1",
    name: "operation.recovered",
    status: "recovered",
    stage: "writing_watchdog",
    errorCode: "WRITING_WATCHDOG_RECOVERED",
  });
  const trace = await t.query(internal.diagnostics.trace, {
    operationId: "write-run-1",
  });
  expect(trace.operation?.status).toBe("recovered");
  expect(trace.events[0]?.name).toBe("operation.recovered");
});
