/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function receipt(
  t: ReturnType<typeof convexTest>,
  args: {
    dedupeKey: string;
    requestId?: string;
    costMicroUsd?: number;
    costBasis?: "reported" | "unknown";
    outcome?: "succeeded" | "failed" | "timeout" | "unknown";
    attempt?: number;
    durationMs?: number;
    storyId?: string;
    observedAt?: number;
  },
) {
  return await t.mutation(internal.diagnostics.recordReceipt, {
    dedupeKey: args.dedupeKey,
    provider: "surplus",
    model: "gemini-2.5-flash-image",
    purpose: "cover",
    requestId: args.requestId,
    attempt: args.attempt ?? 1,
    outcome: args.outcome ?? "succeeded",
    costMicroUsd: args.costMicroUsd,
    costBasis: args.costBasis ?? "unknown",
    durationMs: args.durationMs,
    storyId: args.storyId as never,
    observedAt: args.observedAt,
  });
}

test("receipts dedupe by provider request id and fill missing usage once", async () => {
  const t = convexTest(schema, modules);
  await receipt(t, {
    dedupeKey: "surplus:req-1",
    requestId: "req-1",
    costMicroUsd: 1200,
    costBasis: "reported",
    durationMs: 100,
  });
  await t.mutation(internal.diagnostics.recordReceipt, {
    dedupeKey: "surplus:req-1",
    provider: "surplus",
    requestId: "req-1",
    attempt: 1,
    outcome: "succeeded",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    durationMs: 200,
  });
  const receipts = await t.run((ctx) =>
    ctx.db.query("diagnosticReceipts").collect(),
  );
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    costMicroUsd: 1200,
    costBasis: "reported",
    durationMs: 100,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  });
});

test("usage keeps reported, settled and unknown charges distinguishable", async () => {
  const t = convexTest(schema, modules);
  await receipt(t, {
    dedupeKey: "surplus:known",
    requestId: "known",
    costMicroUsd: 1000,
    costBasis: "reported",
  });
  await receipt(t, {
    dedupeKey: "surplus:unknown",
    requestId: "unknown",
    costBasis: "unknown",
  });
  await receipt(t, {
    dedupeKey: "surplus:settled",
    requestId: "settled",
    costMicroUsd: 500,
    costBasis: "reported",
  });
  await t.mutation(internal.diagnostics.reconcileReceipt, {
    provider: "surplus",
    requestId: "settled",
    settlementState: "charged",
    settledCostMicroUsd: 700,
    currency: "USD",
  });

  const usage = await t.query(internal.diagnostics.usage, {
    since: 0,
    until: Date.now() + 60_000,
  });
  expect(usage.totals.attempts).toBe(3);
  expect(usage.totals.knownCostMicroUsd).toBe(1700);
  expect(usage.totals.settledCostMicroUsd).toBe(700);
  expect(usage.totals.reportedCostMicroUsd).toBe(1500);
  expect(usage.totals.unknownCostAttempts).toBe(1);
  expect(usage.currencies).toEqual(["USD"]);

  const settled = await t.run((ctx) =>
    ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", "surplus:settled"))
      .first(),
  );
  // Reconciliation records the settlement without rewriting the observation.
  expect(settled?.costMicroUsd).toBe(500);
  expect(settled?.settledCostMicroUsd).toBe(700);
  expect(settled?.settlementState).toBe("charged");
});

test("cleanup removes expired receipts", async () => {
  const t = convexTest(schema, modules);
  await receipt(t, {
    dedupeKey: "surplus:expired",
    requestId: "expired",
    costMicroUsd: 100,
    costBasis: "reported",
  });
  await t.run(async (ctx) => {
    const stored = await ctx.db.query("diagnosticReceipts").first();
    if (!stored) throw new Error("missing receipt");
    await ctx.db.patch(stored._id, { expiresAt: 0 });
  });
  const result = await t.mutation(internal.diagnostics.cleanupExpired, {
    limit: 10,
  });
  expect(result.receipts).toBe(1);
  expect(
    await t.run((ctx) => ctx.db.query("diagnosticReceipts").collect()),
  ).toHaveLength(0);
});

test("metrics derive bounded operation, provider and image rollups", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "fast",
    name: "write",
    source: "convex",
    startedAt: now - 1000,
    queueDelayMs: 20,
  });
  await t.mutation(internal.diagnostics.finishOperation, {
    operationId: "fast",
    status: "succeeded",
    endedAt: now,
    durationMs: 1000,
    attempts: 1,
    retries: 0,
  });
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "slow",
    name: "write",
    source: "convex",
    startedAt: now - 2000,
    queueDelayMs: 40,
  });
  await t.mutation(internal.diagnostics.finishOperation, {
    operationId: "slow",
    status: "failed",
    endedAt: now,
    durationMs: 2000,
    attempts: 2,
    retries: 1,
    errorCode: "PROVIDER_TIMEOUT",
  });
  await t.mutation(internal.diagnostics.startOperation, {
    operationId: "recovered",
    name: "write",
    source: "convex",
    startedAt: now - 3000,
  });
  await t.mutation(internal.diagnostics.finishOperation, {
    operationId: "recovered",
    status: "recovered",
    endedAt: now,
    durationMs: 3000,
  });

  await receipt(t, {
    dedupeKey: "surplus:req-a",
    requestId: "req-a",
    durationMs: 300,
    attempt: 1,
  });
  await receipt(t, {
    dedupeKey: "surplus:req-b",
    requestId: "req-b",
    durationMs: 500,
    attempt: 2,
  });
  await t.mutation(internal.diagnostics.recordEvent, {
    eventId: "compressed-1",
    operationId: "compress",
    name: "media.compressed",
    level: "info",
    source: "node",
    sequence: 1,
    timestamp: now,
    bytesBefore: 1000,
    bytesAfter: 250,
  });

  const metrics = await t.query(internal.diagnostics.metrics, {
    since: 0,
    until: now + 60_000,
  });
  expect(metrics.operations.count).toBe(3);
  expect(metrics.operations.statusCounts).toMatchObject({
    succeeded: 1,
    failed: 1,
    recovered: 1,
  });
  expect(metrics.operations.watchdogRecoveries).toBe(1);
  expect(metrics.operations.p50Ms).toBe(2000);
  expect(metrics.operations.p95Ms).toBe(3000);
  expect(metrics.operations.queueP50Ms).toBe(20);
  expect(metrics.provider.attempts).toBe(2);
  expect(metrics.provider.retryAttempts).toBe(1);
  expect(metrics.provider.retryRate).toBe(0.5);
  expect(metrics.provider.p50Ms).toBe(300);
  expect(metrics.images).toMatchObject({
    count: 1,
    bytesBefore: 1000,
    bytesAfter: 250,
    reductionPct: 75,
  });
});
