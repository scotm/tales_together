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
  DIAGNOSTIC_SUMMARY_RETENTION_MS,
  GENERATION_LEASE_MS,
} from "./lib/config";
import {
  diagnosticLevel,
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

    if (events.length === take || operations.length === take) {
      await ctx.scheduler.runAfter(0, internal.diagnostics.cleanupExpired, {
        limit: take,
      });
    }
    return { events: events.length, operations: operations.length };
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

    if (events.length === take || operations.length === take) {
      await ctx.scheduler.runAfter(0, internal.diagnostics.purgeStory, {
        storyId,
        confirm: true,
        limit: take,
      });
    }
    return { events: events.length, operations: operations.length };
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
      },
      limits: {
        events: DIAGNOSTIC_MAX_STORED_EVENTS,
        operations: DIAGNOSTIC_MAX_STORED_OPERATIONS,
        bytes: DIAGNOSTIC_MAX_STORED_BYTES,
      },
    };
  },
});
