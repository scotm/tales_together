/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

test("trace events and recent summaries page with cursors", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "op-test",
    traceId: "trace-test",
    name: "write",
    source: "convex",
    startedAt: 1,
  });
  for (let index = 1; index <= 5; index += 1) {
    await t.mutation(internal.diagnostics.recordEvent, event(index));
  }
  const first = await t.query(internal.diagnostics.trace, {
    operationId: "op-test",
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(first.events).toHaveLength(2);
  expect(first.isDone).toBe(false);
  expect(first.continueCursor).toBeTypeOf("string");
  const second = await t.query(internal.diagnostics.trace, {
    operationId: "op-test",
    paginationOpts: { numItems: 2, cursor: first.continueCursor },
  });
  expect(second.events).toHaveLength(2);
  expect(second.events[0]?.sequence).toBe(3);
  const last = await t.query(internal.diagnostics.trace, {
    operationId: "op-test",
    paginationOpts: { numItems: 2, cursor: second.continueCursor },
  });
  expect(last.events).toHaveLength(1);
  expect(last.isDone).toBe(true);

  for (let index = 1; index <= 3; index += 1) {
    await t.mutation(internal.diagnostics.startOperation, {
      operationId: `recent-${index}`,
      name: "write",
      source: "convex",
      startedAt: index,
    });
  }
  const recent = await t.query(internal.diagnostics.recent, {
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(recent.operations).toHaveLength(2);
  expect(recent.isDone).toBe(false);
  const nextRecent = await t.query(internal.diagnostics.recent, {
    paginationOpts: { numItems: 2, cursor: recent.continueCursor },
  });
  expect(nextRecent.operations).toHaveLength(2);
  expect(nextRecent.isDone).toBe(true);
});

test("cleanup continues in bounded batches until expired rows are gone", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let index = 0; index < 5; index += 1) {
      await ctx.db.insert("diagnosticEvents", {
        eventId: `burst-${index}`,
        name: "operation.failed",
        level: "error",
        source: "convex",
        sequence: index,
        timestamp: 0,
        createdAt: 0,
        expiresAt: 0,
      });
    }
  });
  const first = await t.mutation(internal.diagnostics.cleanupExpired, {
    limit: 2,
  });
  expect(first.events).toBe(2);
  expect(
    await t.run((ctx) => ctx.db.query("diagnosticEvents").collect()),
  ).toHaveLength(3);
  await t.finishAllScheduledFunctions(() => {});
  expect(
    await t.run((ctx) => ctx.db.query("diagnosticEvents").collect()),
  ).toHaveLength(0);
  const repeated = await t.mutation(internal.diagnostics.cleanupExpired, {
    limit: 2,
  });
  expect(repeated).toEqual({ events: 0, operations: 0 });
});

test("health reports stuck work, quota and retention backlog", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "stuck-operation",
    name: "write",
    source: "convex",
    startedAt: 1,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("diagnosticEvents", {
      eventId: "expired-health",
      name: "operation.failed",
      level: "error",
      source: "convex",
      sequence: 1,
      timestamp: 0,
      createdAt: 0,
      expiresAt: 0,
    });
    await ctx.db.insert("diagnosticOperations", {
      operationId: "auth-failure",
      name: "write",
      source: "convex",
      status: "failed",
      startedAt: Date.now(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      errorCode: "PROVIDER_AUTH_FAILED",
      safeMessage: "The provider rejected the credentials.",
    });
  });
  const health = await t.query(internal.diagnostics.health, {});
  expect(health.stuck.map((operation) => operation.operationId)).toContain(
    "stuck-operation",
  );
  expect(
    health.providerFailures.map((operation) => operation.operationId),
  ).toContain("auth-failure");
  expect(health.expired.events).toBe(1);
  expect(health.quota.dropped).toBeGreaterThanOrEqual(0);
  expect(health.limits.events).toBeGreaterThan(0);
});

test("purge removes one story's diagnostics and leaves the other story alone", async () => {
  const t = convexTest(schema, modules);
  const makeStory = (title: string) =>
    t.mutation(api.stories.create, {
      title,
      setting: "The seaside",
      centralProblem: "A lost kite",
      protagonistName: "Mira",
      protagonistQuirk: "Loves kites",
      visualDescription: "Yellow coat",
      backpackItems: [
        { id: "item_whisk", name: "Whisk" },
        { id: "item_jam", name: "Jam" },
        { id: "item_kazoo", name: "Kazoo" },
      ],
    });
  const firstStory = await makeStory("First");
  const secondStory = await makeStory("Second");

  await t.run(async (ctx) => {
    for (const [index, storyId] of [firstStory, secondStory].entries()) {
      await ctx.db.insert("diagnosticOperations", {
        operationId: `purge-op-${index}`,
        name: "write",
        source: "convex",
        storyId,
        status: "failed",
        startedAt: index,
        createdAt: index,
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.insert("diagnosticEvents", {
        eventId: `purge-event-${index}`,
        operationId: `purge-op-${index}`,
        name: "operation.failed",
        level: "error",
        source: "convex",
        sequence: index,
        storyId,
        timestamp: index,
        createdAt: index,
        expiresAt: Date.now() + 60_000,
      });
    }
  });

  await expect(
    t.mutation(internal.diagnostics.purgeStory, {
      storyId: firstStory,
      confirm: false,
      limit: 10,
    }),
  ).rejects.toThrow(/confirmation/);

  const result = await t.mutation(internal.diagnostics.purgeStory, {
    storyId: firstStory,
    confirm: true,
    limit: 10,
  });
  expect(result).toEqual({ events: 1, operations: 1 });
  const remaining = await t.run(async (ctx) => ({
    operations: await ctx.db.query("diagnosticOperations").collect(),
    events: await ctx.db.query("diagnosticEvents").collect(),
  }));
  expect(remaining.operations.map((operation) => operation.storyId)).toEqual([
    secondStory,
  ]);
  expect(remaining.events.map((event) => event.storyId)).toEqual([secondStory]);
});
