import { v } from "convex/values";
import { createEventId } from "../shared/diagnostics/contract";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, query } from "./_generated/server";
import {
  DIAGNOSTIC_EVENT_RETENTION_MS,
  DIAGNOSTIC_MAX_EVENTS_PER_CLEANUP,
  DIAGNOSTIC_MAX_EVENTS_PER_OPERATION,
  DIAGNOSTIC_SUMMARY_RETENTION_MS,
} from "./lib/config";
import {
  diagnosticLevel,
  diagnosticSource,
  diagnosticStatus,
  diagnosticUsage,
} from "./schema";

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
    await ctx.db.insert("diagnosticOperations", {
      ...args,
      status: "started",
      createdAt: now,
      expiresAt: now + DIAGNOSTIC_SUMMARY_RETENTION_MS,
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
    if (duplicate) return;

    if (args.operationId) {
      const existing = await ctx.db
        .query("diagnosticEvents")
        .withIndex("by_operation_sequence", (q) =>
          q.eq("operationId", args.operationId),
        )
        .take(DIAGNOSTIC_MAX_EVENTS_PER_OPERATION);
      if (existing.length >= DIAGNOSTIC_MAX_EVENTS_PER_OPERATION) return;
    }

    const now = Date.now();
    await ctx.db.insert("diagnosticEvents", {
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
    await ctx.db.insert("diagnosticEvents", {
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
    const take = Math.min(
      Math.max(limit ?? DIAGNOSTIC_MAX_EVENTS_PER_CLEANUP, 1),
      500,
    );
    const now = Date.now();
    const events = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(take);
    for (const event of events) await ctx.db.delete(event._id);

    const operations = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(take);
    for (const operation of operations) await ctx.db.delete(operation._id);

    if (events.length === take || operations.length === take) {
      await ctx.scheduler.runAfter(0, internal.diagnostics.cleanupExpired, {
        limit: take,
      });
    }
    return { events: events.length, operations: operations.length };
  },
});

/** Bounded admin read: one operation and at most 100 transitions. */
export const trace = internalQuery({
  args: { operationId: v.string() },
  handler: async (ctx, { operationId }) => {
    const operation = await ctx.db
      .query("diagnosticOperations")
      .withIndex("by_operation", (q) => q.eq("operationId", operationId))
      .first();
    const events = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_operation_sequence", (q) =>
        q.eq("operationId", operationId),
      )
      .take(100);
    return { operation, events };
  },
});

/** Bounded admin read: newest summaries, never a full-table collect. */
export const recent = internalQuery({
  args: {
    storyId: v.optional(v.id("stories")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { storyId, limit }) => {
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    const operations = storyId
      ? await ctx.db
          .query("diagnosticOperations")
          .withIndex("by_story_started", (q) => q.eq("storyId", storyId))
          .order("desc")
          .take(take)
      : await ctx.db
          .query("diagnosticOperations")
          .withIndex("by_started")
          .order("desc")
          .take(take);
    return operations;
  },
});
