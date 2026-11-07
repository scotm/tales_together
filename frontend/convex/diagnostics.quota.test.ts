/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

vi.mock("./lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/config")>()),
  DIAGNOSTIC_MAX_STORED_EVENTS: 1,
  DIAGNOSTIC_MAX_STORED_OPERATIONS: 10,
  DIAGNOSTIC_MAX_STORED_BYTES: 1_000_000,
}));

const modules = import.meta.glob("./**/*.ts");

function event(index: number) {
  return {
    eventId: `quota-event-${index}`,
    operationId: "quota-op",
    name: "operation.failed",
    level: "error" as const,
    source: "convex" as const,
    sequence: index,
    timestamp: index,
  };
}

test("the deployment event quota drops detail and counts the drop", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "quota-op",
    name: "write",
    source: "convex",
    startedAt: 1,
  });
  const first = await t.mutation(internal.diagnostics.recordEvent, event(1));
  const second = await t.mutation(internal.diagnostics.recordEvent, event(2));
  expect(first).toMatchObject({ stored: true });
  expect(second).toMatchObject({ stored: false, reason: "quota" });

  const quota = await t.run((ctx) => ctx.db.query("diagnosticQuota").first());
  expect(quota).toMatchObject({ events: 1, dropped: 1 });
  expect(
    await t.run((ctx) => ctx.db.query("diagnosticEvents").collect()),
  ).toHaveLength(1);
});

test("cleanup returns event and byte capacity to the quota", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "quota-op",
    name: "write",
    source: "convex",
    startedAt: 1,
  });
  await t.mutation(internal.diagnostics.recordEvent, event(1));
  await t.run(async (ctx) => {
    const stored = await ctx.db.query("diagnosticEvents").first();
    if (!stored) throw new Error("missing event");
    await ctx.db.patch(stored._id, { expiresAt: 0 });
  });
  await t.mutation(internal.diagnostics.cleanupExpired, { limit: 10 });
  const quota = await t.run((ctx) => ctx.db.query("diagnosticQuota").first());
  expect(quota?.events).toBe(0);
  expect(quota?.bytes).toBeGreaterThan(0);
});
