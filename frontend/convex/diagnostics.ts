import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { createEventId } from "../shared/diagnostics/contract";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  query,
} from "./_generated/server";
import {
  DIAGNOSTIC_EVENT_RETENTION_MS,
  DIAGNOSTIC_HEALTH_WINDOW_MS,
  DIAGNOSTIC_MAX_EVENTS_PER_CLEANUP,
  DIAGNOSTIC_MAX_EVENTS_PER_OPERATION,
  DIAGNOSTIC_MAX_STORED_BYTES,
  DIAGNOSTIC_MAX_STORED_EVENTS,
  DIAGNOSTIC_MAX_STORED_OPERATIONS,
  DIAGNOSTIC_PURGE_BATCH,
  DIAGNOSTIC_RECEIPT_RETENTION_MS,
  DIAGNOSTIC_SUMMARY_RETENTION_MS,
  GENERATION_LEASE_MS,
} from "./lib/config";
import {
  diagnosticLevel,
  diagnosticOutcome,
  diagnosticSource,
  diagnosticStatus,
  diagnosticUsage,
} from "./schema";

const QUOTA_KEY = "global";

const eventFields = {
  eventId: v.string(),
  operationId: v.optional(v.string()),
  traceId: v.optional(v.string()),
  parentOperationId: v.optional(v.string()),
  runId: v.optional(v.string()),
  name: v.string(),
  level: diagnosticLevel,
  source: diagnosticSource,
  sequence: v.number(),
  stage: v.optional(v.string()),
  status: v.optional(diagnosticStatus),
  errorCode: v.optional(v.string()),
  safeMessage: v.optional(v.string()),
  retryable: v.optional(v.boolean()),
  durationMs: v.optional(v.number()),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  purpose: v.optional(v.string()),
  httpStatus: v.optional(v.number()),
  requestId: v.optional(v.string()),
  attempt: v.optional(v.number()),
  usage: v.optional(diagnosticUsage),
  storyId: v.optional(v.id("stories")),
  chapterId: v.optional(v.id("chapters")),
  timestamp: v.number(),
  bytesBefore: v.optional(v.number()),
  bytesAfter: v.optional(v.number()),
};

const operationFields = {
  operationId: v.string(),
  traceId: v.optional(v.string()),
  parentOperationId: v.optional(v.string()),
  runId: v.optional(v.string()),
  name: v.string(),
  source: diagnosticSource,
  storyId: v.optional(v.id("stories")),
  chapterId: v.optional(v.id("chapters")),
  startedAt: v.number(),
  queueDelayMs: v.optional(v.number()),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  purpose: v.optional(v.string()),
};

type StoredEvent = Omit<
  Doc<"diagnosticEvents">,
  "_id" | "_creationTime" | "bytes"
>;

type Quota = Doc<"diagnosticQuota">;

function eventSize(event: StoredEvent): number {
  // Two bytes per code unit is a safe UTF-8 upper bound and needs no
  // TextEncoder in the Convex runtime.
  return JSON.stringify(event).length * 2;
}

function bounded(value: number | undefined, fallback: number, max: number) {
  return Math.min(Math.max(value ?? fallback, 1), max);
}

async function readQuota(ctx: MutationCtx): Promise<Quota> {
  const existing = await ctx.db
    .query("diagnosticQuota")
    .withIndex("by_key", (q) => q.eq("key", QUOTA_KEY))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("diagnosticQuota", {
    key: QUOTA_KEY,
    events: 0,
    operations: 0,
    bytes: 0,
    dropped: 0,
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("diagnostic quota row was not created");
  return created;
}

async function adjustQuota(
  ctx: MutationCtx,
  delta: {
    events?: number;
    operations?: number;
    bytes?: number;
    dropped?: number;
  },
): Promise<void> {
  const quota = await readQuota(ctx);
  await ctx.db.patch(quota._id, {
    events: Math.max(0, quota.events + (delta.events ?? 0)),
    operations: Math.max(0, quota.operations + (delta.operations ?? 0)),
    bytes: Math.max(0, quota.bytes + (delta.bytes ?? 0)),
    dropped: Math.max(0, quota.dropped + (delta.dropped ?? 0)),
    updatedAt: Date.now(),
  });
}

/**
 * One quota-aware insert shared by normal events and watchdog notes. When the
 * deployment budget is reached every detail is dropped; console JSON remains.
 */
async function storeEvent(
  ctx: MutationCtx,
  event: StoredEvent,
): Promise<{ stored: boolean; reason?: "quota" }> {
  const bytes = eventSize(event);
  const quota = await readQuota(ctx);
  if (
    quota.events >= DIAGNOSTIC_MAX_STORED_EVENTS ||
    quota.bytes + bytes > DIAGNOSTIC_MAX_STORED_BYTES
  ) {
    await adjustQuota(ctx, { dropped: 1 });
    return { stored: false, reason: "quota" };
  }
  await ctx.db.insert("diagnosticEvents", { ...event, bytes });
  await adjustQuota(ctx, { events: 1, bytes });
  return { stored: true };
}

/**
 * Read-only round trip for the on-demand connection check. It deliberately
 * exposes nothing but a timestamp.
 */
export const ping = query({
  args: {},
  handler: () => ({ ok: true, timestamp: Date.now() }),
});

export const startOperation = internalMutation({
  args: operationFields,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_operation", (q) => q.eq("operationId", args.operationId))
      .first();
    if (existing) return;

    const quota = await readQuota(ctx);
    const summary = {
      ...args,
      status: "started" as const,
      createdAt: now,
      expiresAt: now + DIAGNOSTIC_SUMMARY_RETENTION_MS,
    };
    const summaryBytes = JSON.stringify(summary).length * 2;
    if (
      quota.operations >= DIAGNOSTIC_MAX_STORED_OPERATIONS ||
      quota.bytes + summaryBytes > DIAGNOSTIC_MAX_STORED_BYTES
    ) {
      await adjustQuota(ctx, { dropped: 1 });
      return;
    }
    await ctx.db.insert("diagnosticOperations", summary);
    await adjustQuota(ctx, {
      operations: 1,
      bytes: summaryBytes,
    });
  },
});

export const finishOperation = internalMutation({
  args: {
    operationId: v.string(),
    status: diagnosticStatus,
    endedAt: v.number(),
    durationMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    safeMessage: v.optional(v.string()),
    attempts: v.optional(v.number()),
    retries: v.optional(v.number()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    purpose: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_operation", (q) => q.eq("operationId", args.operationId))
      .first();
    if (!operation) return;
    await ctx.db.patch(operation._id, {
      status: args.status,
      endedAt: args.endedAt,
      durationMs: args.durationMs,
      errorCode: args.errorCode,
      safeMessage: args.safeMessage,
      attempts: args.attempts,
      retries: args.retries,
      provider: args.provider ?? operation.provider,
      model: args.model ?? operation.model,
      purpose: args.purpose ?? operation.purpose,
      expiresAt: Date.now() + DIAGNOSTIC_SUMMARY_RETENTION_MS,
    });
  },
});

export const recordEvent = internalMutation({
  args: eventFields,
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .first();
    if (duplicate) return { stored: true, duplicate: true };

    if (args.operationId) {
      const existing = await ctx.db
        .query("diagnosticEvents")
        .withIndex("by_operation_sequence", (q) =>
          q.eq("operationId", args.operationId),
        )
        .take(DIAGNOSTIC_MAX_EVENTS_PER_OPERATION);
      if (existing.length >= DIAGNOSTIC_MAX_EVENTS_PER_OPERATION) {
        await adjustQuota(ctx, { dropped: 1 });
        return { stored: false, reason: "operation_cap" };
      }
    }

    const now = Date.now();
    return await storeEvent(ctx, {
      ...args,
      createdAt: now,
      expiresAt: now + DIAGNOSTIC_EVENT_RETENTION_MS,
    });
  },
});

/**
 * Mutations cannot write diagnostics safely in their own transaction, so the
 * watchdog schedules this small note after committing the recovery.
 */
export const noteOperation = internalMutation({
  args: {
    operationId: v.string(),
    name: v.string(),
    status: diagnosticStatus,
    level: v.optional(diagnosticLevel),
    stage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    safeMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const operation = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_operation", (q) => q.eq("operationId", args.operationId))
      .first();
    if (operation) {
      await ctx.db.patch(operation._id, {
        status: args.status,
        endedAt: now,
        durationMs: now - operation.startedAt,
        errorCode: args.errorCode,
        safeMessage: args.safeMessage,
      });
    }
    await storeEvent(ctx, {
      eventId: createEventId("watchdog"),
      operationId: args.operationId,
      traceId: operation?.traceId,
      parentOperationId: operation?.parentOperationId,
      runId: operation?.runId,
      name: args.name,
      level: args.level ?? "warn",
      source: "convex",
      sequence: now,
      stage: args.stage,
      status: args.status,
      errorCode: args.errorCode,
      safeMessage: args.safeMessage,
      storyId: operation?.storyId,
      chapterId: operation?.chapterId,
      timestamp: now,
      createdAt: now,
      expiresAt: now + DIAGNOSTIC_EVENT_RETENTION_MS,
    });
  },
});

const receiptFields = {
  dedupeKey: v.string(),
  provider: v.string(),
  model: v.optional(v.string()),
  purpose: v.optional(v.string()),
  requestId: v.optional(v.string()),
  operationId: v.optional(v.string()),
  traceId: v.optional(v.string()),
  storyId: v.optional(v.id("stories")),
  chapterId: v.optional(v.id("chapters")),
  attempt: v.number(),
  outcome: diagnosticOutcome,
  httpStatus: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  usage: v.optional(diagnosticUsage),
  costMicroUsd: v.optional(v.number()),
  currency: v.optional(v.string()),
  costBasis: v.optional(
    v.union(
      v.literal("reported"),
      v.literal("estimated"),
      v.literal("settled"),
      v.literal("unknown"),
    ),
  ),
  observedAt: v.optional(v.number()),
};

type StoredReceipt = Doc<"diagnosticReceipts">;

function receiptCost(receipt: StoredReceipt): number | undefined {
  if (receipt.settledCostMicroUsd !== undefined) {
    return receipt.settledCostMicroUsd;
  }
  if (receipt.settlementState === "not_charged") return 0;
  if (receipt.costBasis !== "unknown" && receipt.costMicroUsd !== undefined) {
    return receipt.costMicroUsd;
  }
  return undefined;
}

interface UsageBucket {
  attempts: number;
  succeeded: number;
  failed: number;
  timeout: number;
  unknown: number;
  knownCostMicroUsd: number;
  settledCostMicroUsd: number;
  reportedCostMicroUsd: number;
  unknownCostAttempts: number;
}

function emptyUsageBucket(): UsageBucket {
  return {
    attempts: 0,
    succeeded: 0,
    failed: 0,
    timeout: 0,
    unknown: 0,
    knownCostMicroUsd: 0,
    settledCostMicroUsd: 0,
    reportedCostMicroUsd: 0,
    unknownCostAttempts: 0,
  };
}

function addUsage(bucket: UsageBucket, receipt: StoredReceipt): void {
  bucket.attempts += 1;
  bucket[receipt.outcome] += 1;
  const cost = receiptCost(receipt);
  if (cost === undefined) bucket.unknownCostAttempts += 1;
  else bucket.knownCostMicroUsd += cost;
  if (receipt.settledCostMicroUsd !== undefined) {
    bucket.settledCostMicroUsd += receipt.settledCostMicroUsd;
  }
  if (receipt.costBasis !== "unknown" && receipt.costMicroUsd !== undefined) {
    bucket.reportedCostMicroUsd += receipt.costMicroUsd;
  }
}

function bucketFor<T extends UsageBucket>(
  buckets: Record<string, T>,
  key: string,
  create: () => T,
): T {
  buckets[key] ??= create();
  return buckets[key] as T;
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(ratio * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}

/**
 * Receipts are observations, not the bill. A retried call may have several
 * attempt rows; each known charge is counted once, unknown attempts stay apart.
 */
export const recordReceipt = internalMutation({
  args: receiptFields,
  handler: async (ctx, args) => {
    const now = Date.now();
    const observedAt = args.observedAt ?? now;
    const usageCost = args.usage?.costMicroUsd;
    const costMicroUsd = args.costMicroUsd ?? usageCost;
    const currency =
      args.currency ??
      args.usage?.currency ??
      (costMicroUsd === undefined ? undefined : "USD");
    const costBasis =
      args.costBasis ??
      args.usage?.costBasis ??
      (costMicroUsd === undefined ? "unknown" : "reported");

    // Patch a shared row so concurrent observations with the same request id
    // serialize; Convex retries the loser and it then sees the first receipt.
    const quota = await readQuota(ctx);
    await ctx.db.patch(quota._id, { updatedAt: now });

    const existing = await ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
      .first();
    if (existing) {
      const patch: Partial<StoredReceipt> = {
        updatedAt: now,
        expiresAt: now + DIAGNOSTIC_RECEIPT_RETENTION_MS,
      };
      if (existing.requestId === undefined && args.requestId !== undefined) {
        patch.requestId = args.requestId;
      }
      if (existing.usage === undefined && args.usage !== undefined) {
        patch.usage = args.usage;
      }
      if (existing.durationMs === undefined && args.durationMs !== undefined) {
        patch.durationMs = args.durationMs;
      }
      // The first observation wins; a later header must not rewrite a charge.
      if (existing.costMicroUsd === undefined && costMicroUsd !== undefined) {
        patch.costMicroUsd = costMicroUsd;
        patch.currency = currency;
        patch.costBasis = costBasis;
      }
      await ctx.db.patch(existing._id, patch);
      return { deduped: true };
    }

    await ctx.db.insert("diagnosticReceipts", {
      dedupeKey: args.dedupeKey,
      provider: args.provider,
      model: args.model,
      purpose: args.purpose,
      requestId: args.requestId,
      operationId: args.operationId,
      traceId: args.traceId,
      storyId: args.storyId,
      chapterId: args.chapterId,
      attempt: args.attempt,
      outcome: args.outcome,
      httpStatus: args.httpStatus,
      durationMs: args.durationMs,
      usage: args.usage,
      costMicroUsd,
      currency,
      costBasis,
      settlementState: "unknown",
      observedAt,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + DIAGNOSTIC_RECEIPT_RETENTION_MS,
    });
    return { deduped: false };
  },
});

/** Admin reconciliation; the original observation is never overwritten. */
export const reconcileReceipt = internalMutation({
  args: {
    provider: v.string(),
    requestId: v.string(),
    settlementState: v.union(
      v.literal("charged"),
      v.literal("not_charged"),
      v.literal("unknown"),
    ),
    settledCostMicroUsd: v.optional(v.number()),
    currency: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_dedupe", (q) =>
        q.eq("dedupeKey", `${args.provider}:${args.requestId}`),
      )
      .first();
    if (!receipt) throw new Error("receipt not found for that request id");
    const now = Date.now();
    await ctx.db.patch(receipt._id, {
      settlementState: args.settlementState,
      settledCostMicroUsd:
        args.settlementState === "not_charged"
          ? 0
          : args.settlementState === "charged"
            ? args.settledCostMicroUsd
            : undefined,
      currency: args.currency ?? receipt.currency ?? "USD",
      reconciledAt: now,
      note: args.note?.slice(0, 200),
      updatedAt: now,
      expiresAt: now + DIAGNOSTIC_RECEIPT_RETENTION_MS,
    });
    return { reconciled: true };
  },
});

/** Bounded cost view. Unknown charges are counted, never treated as zero. */
export const usage = internalQuery({
  args: {
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const until = args.until ?? Date.now();
    const since = args.since ?? until - DIAGNOSTIC_RECEIPT_RETENTION_MS;
    const take = bounded(args.limit, 1_000, 5_000);
    const receipts = await ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_observed", (q) =>
        q.gte("observedAt", since).lte("observedAt", until),
      )
      .take(take);
    const totals = emptyUsageBucket();
    const byProvider: Record<string, UsageBucket> = {};
    const byPurpose: Record<string, UsageBucket> = {};
    const byModel: Record<string, UsageBucket> = {};
    for (const receipt of receipts) {
      addUsage(totals, receipt);
      addUsage(
        bucketFor(byProvider, receipt.provider, emptyUsageBucket),
        receipt,
      );
      addUsage(
        bucketFor(byPurpose, receipt.purpose ?? "unknown", emptyUsageBucket),
        receipt,
      );
      addUsage(
        bucketFor(byModel, receipt.model ?? "unknown", emptyUsageBucket),
        receipt,
      );
    }
    return {
      window: { since, until },
      receiptCount: receipts.length,
      truncated: receipts.length === take,
      currencies: [
        ...new Set(
          receipts
            .map((receipt) => receipt.currency)
            .filter((currency): currency is string => Boolean(currency)),
        ),
      ],
      coveragePct:
        totals.attempts > 0
          ? ((totals.attempts - totals.unknownCostAttempts) / totals.attempts) *
            100
          : 0,
      totals,
      byProvider,
      byPurpose,
      byModel,
    };
  },
});

/** Bounded duration/error/service view over summaries, receipts and media. */
export const metrics = internalQuery({
  args: {
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const until = args.until ?? Date.now();
    const since = args.since ?? until - DIAGNOSTIC_HEALTH_WINDOW_MS;
    const take = bounded(args.limit, 1_000, 5_000);
    const operations = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_started", (q) =>
        q.gte("startedAt", since).lte("startedAt", until),
      )
      .take(take);
    const receipts = await ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_observed", (q) =>
        q.gte("observedAt", since).lte("observedAt", until),
      )
      .take(take);
    const events = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", since).lte("timestamp", until),
      )
      .take(take);

    const statusCounts: Record<string, number> = {};
    const byOperation: Record<string, Record<string, number>> = {};
    const durations: number[] = [];
    const queueDelays: number[] = [];
    for (const operation of operations) {
      statusCounts[operation.status] =
        (statusCounts[operation.status] ?? 0) + 1;
      byOperation[operation.name] ??= {};
      byOperation[operation.name][operation.status] =
        (byOperation[operation.name][operation.status] ?? 0) + 1;
      if (
        operation.status !== "started" &&
        operation.durationMs !== undefined
      ) {
        durations.push(operation.durationMs);
      }
      if (operation.queueDelayMs !== undefined) {
        queueDelays.push(operation.queueDelayMs);
      }
    }

    const receiptDurations = receipts
      .map((receipt) => receipt.durationMs)
      .filter((value): value is number => value !== undefined);
    const retryAttempts = receipts.filter(
      (receipt) => receipt.attempt > 1,
    ).length;

    const imageEvents = events.filter(
      (event) =>
        event.name === "media.compressed" &&
        event.bytesBefore !== undefined &&
        event.bytesAfter !== undefined,
    );
    const bytesBefore = imageEvents.reduce(
      (sum, event) => sum + (event.bytesBefore ?? 0),
      0,
    );
    const bytesAfter = imageEvents.reduce(
      (sum, event) => sum + (event.bytesAfter ?? 0),
      0,
    );

    return {
      window: { since, until },
      truncated:
        operations.length === take ||
        receipts.length === take ||
        events.length === take,
      operations: {
        count: operations.length,
        statusCounts,
        byOperation,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        maxMs: durations.length > 0 ? Math.max(...durations) : null,
        queueP50Ms: percentile(queueDelays, 0.5),
        queueP95Ms: percentile(queueDelays, 0.95),
        watchdogRecoveries: operations.filter(
          (operation) => operation.status === "recovered",
        ).length,
      },
      provider: {
        attempts: receipts.length,
        retryAttempts,
        retryRate: receipts.length > 0 ? retryAttempts / receipts.length : 0,
        p50Ms: percentile(receiptDurations, 0.5),
        p95Ms: percentile(receiptDurations, 0.95),
      },
      images: {
        count: imageEvents.length,
        bytesBefore,
        bytesAfter,
        reductionPct:
          bytesBefore > 0
            ? ((bytesBefore - bytesAfter) / bytesBefore) * 100
            : 0,
      },
    };
  },
});

/** Deletes one bounded batch, then reschedules until the expired rows are gone. */
export const cleanupExpired = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = bounded(limit, DIAGNOSTIC_MAX_EVENTS_PER_CLEANUP, 500);
    const now = Date.now();
    const events = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(take);
    let eventBytes = 0;
    for (const event of events) {
      eventBytes += event.bytes ?? eventSize(event);
      await ctx.db.delete(event._id);
    }

    const operations = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(take);
    let operationBytes = 0;
    for (const operation of operations) {
      operationBytes += JSON.stringify(operation).length * 2;
      await ctx.db.delete(operation._id);
    }

    if (events.length > 0 || operations.length > 0) {
      await adjustQuota(ctx, {
        events: -events.length,
        operations: -operations.length,
        bytes: -(eventBytes + operationBytes),
      });
    }

    const receipts = await ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(take);
    for (const receipt of receipts) await ctx.db.delete(receipt._id);

    if (
      events.length === take ||
      operations.length === take ||
      receipts.length === take
    ) {
      await ctx.scheduler.runAfter(0, internal.diagnostics.cleanupExpired, {
        limit: take,
      });
    }
    return {
      events: events.length,
      operations: operations.length,
      receipts: receipts.length,
    };
  },
});

/** Admin-only removal of every diagnostic row tied to one private story. */
export const purgeStory = internalMutation({
  args: {
    storyId: v.id("stories"),
    confirm: v.boolean(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { storyId, confirm, limit }) => {
    if (!confirm) throw new Error("purge requires explicit confirmation");
    const take = bounded(limit, DIAGNOSTIC_PURGE_BATCH, 500);

    const events = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_story_timestamp", (q) => q.eq("storyId", storyId))
      .take(take);
    let eventBytes = 0;
    for (const event of events) {
      eventBytes += event.bytes ?? eventSize(event);
      await ctx.db.delete(event._id);
    }

    const operations = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_story_started", (q) => q.eq("storyId", storyId))
      .take(take);
    let operationBytes = 0;
    for (const operation of operations) {
      operationBytes += JSON.stringify(operation).length * 2;
      await ctx.db.delete(operation._id);
    }

    if (events.length > 0 || operations.length > 0) {
      await adjustQuota(ctx, {
        events: -events.length,
        operations: -operations.length,
        bytes: -(eventBytes + operationBytes),
      });
    }

    const receipts = await ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_story_observed", (q) => q.eq("storyId", storyId))
      .take(take);
    for (const receipt of receipts) await ctx.db.delete(receipt._id);

    if (
      events.length === take ||
      operations.length === take ||
      receipts.length === take
    ) {
      await ctx.scheduler.runAfter(0, internal.diagnostics.purgeStory, {
        storyId,
        confirm: true,
        limit: take,
      });
    }
    return {
      events: events.length,
      operations: operations.length,
      receipts: receipts.length,
    };
  },
});

/**
 * Bounded admin read: one operation and a page of transitions. The default
 * keeps the old CLI shape; callers can follow `continueCursor`.
 */
export const trace = internalQuery({
  args: {
    operationId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, { operationId, paginationOpts }) => {
    const operation = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_operation", (q) => q.eq("operationId", operationId))
      .first();
    const result = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_operation_sequence", (q) =>
        q.eq("operationId", operationId),
      )
      .order("asc")
      .paginate({
        ...paginationOpts,
        numItems: bounded(paginationOpts?.numItems, 100, 100),
        cursor: paginationOpts?.cursor ?? null,
      });
    return {
      operation,
      events: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Bounded admin read: newest summaries, paginated by start time. */
export const recent = internalQuery({
  args: {
    storyId: v.optional(v.id("stories")),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, { storyId, paginationOpts }) => {
    const opts = {
      ...paginationOpts,
      numItems: bounded(paginationOpts?.numItems, 25, 100),
      cursor: paginationOpts?.cursor ?? null,
    };
    const result = storyId
      ? await ctx.db
          .query("diagnosticOperations")
          .withIndex("by_story_started", (q) => q.eq("storyId", storyId))
          .order("desc")
          .paginate(opts)
      : await ctx.db
          .query("diagnosticOperations")
          .withIndex("by_started")
          .order("desc")
          .paginate(opts);
    return {
      operations: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Bounded operator health view; no story content or raw errors. */
export const health = internalQuery({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { now, limit }) => {
    const at = now ?? Date.now();
    const take = bounded(limit, 20, 100);
    const stuck = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_status_started", (q) =>
        q.eq("status", "started").lt("startedAt", at - GENERATION_LEASE_MS),
      )
      .take(take);
    const failed = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_status_started", (q) =>
        q
          .eq("status", "failed")
          .gte("startedAt", at - DIAGNOSTIC_HEALTH_WINDOW_MS),
      )
      .order("desc")
      .take(take);
    const degraded = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_status_started", (q) =>
        q
          .eq("status", "degraded")
          .gte("startedAt", at - DIAGNOSTIC_HEALTH_WINDOW_MS),
      )
      .order("desc")
      .take(take);
    const quota = await ctx.db
      .query("diagnosticQuota")
      .withIndex("by_key", (q) => q.eq("key", QUOTA_KEY))
      .first();
    const expiredEvents = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_expires", (q) => q.lte("expiresAt", at))
      .take(take);
    const expiredOperations = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_expires", (q) => q.lte("expiresAt", at))
      .take(take);
    const expiredReceipts = await ctx.db
      .query("diagnosticReceipts")
      .withIndex("by_expires", (q) => q.lte("expiresAt", at))
      .take(take);

    return {
      now: at,
      stuck,
      failed,
      degraded,
      providerFailures: failed.filter(
        (operation) =>
          operation.errorCode === "PROVIDER_AUTH_FAILED" ||
          operation.errorCode === "PROVIDER_FUNDING_REQUIRED" ||
          operation.errorCode === "PROVIDER_RATE_LIMITED",
      ),
      storageFailures: failed.filter(
        (operation) =>
          operation.errorCode === "STORAGE_FAILED" ||
          operation.errorCode === "IMAGE_COMPRESSION_FAILED" ||
          operation.errorCode === "EXPORT_MISSING_ASSET",
      ),
      quota: quota ?? {
        events: 0,
        operations: 0,
        bytes: 0,
        dropped: 0,
      },
      expired: {
        events: expiredEvents.length,
        operations: expiredOperations.length,
        receipts: expiredReceipts.length,
      },
      limits: {
        events: DIAGNOSTIC_MAX_STORED_EVENTS,
        operations: DIAGNOSTIC_MAX_STORED_OPERATIONS,
        bytes: DIAGNOSTIC_MAX_STORED_BYTES,
      },
    };
  },
});
