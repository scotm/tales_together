import { v } from "convex/values";
import { contextKey } from "../shared/heroIdeas";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireMember } from "./lib/access";
import {
  catalogReference,
  heroContext,
  ideaPart,
} from "./lib/catalogValidators";
import { capabilityHash, digest } from "./lib/heroCapabilities";
import {
  IDEA_DAILY_SESSIONS,
  IDEA_DAILY_UNITS,
  IDEA_RUN_MS,
  IDEA_SESSION_WINDOW_MS,
  IDEA_SESSION_WINDOW_UNITS,
  IDEA_TTL_MS,
} from "./lib/heroIdeaConfig";
import { resolveHeroChoice } from "./lib/resolveSetup";

export const open = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const now = Date.now();
    const key = new Date(now).toISOString().slice(0, 10);
    const quota = await ctx.db
      .query("heroIdeaQuota")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if ((quota?.sessions ?? 0) >= IDEA_DAILY_SESSIONS)
      throw new Error("The idea workshop is busy. Please try later.");
    if (quota) await ctx.db.patch(quota._id, { sessions: quota.sessions + 1 });
    else
      await ctx.db.insert("heroIdeaQuota", {
        key,
        units: 0,
        sessions: 1,
        expiresAt: now + 2 * IDEA_TTL_MS,
      });
    return ctx.db.insert("heroIdeaSessions", {
      tokenHash,
      createdAt: now,
      expiresAt: now + IDEA_TTL_MS,
      windowStartedAt: now,
      units: 0,
    });
  },
});
export const claim = internalMutation({
  args: {
    tokenHash: v.string(),
    requestId: v.string(),
    fingerprint: v.string(),
    baseFingerprint: v.string(),
    kind: v.union(v.literal("idea"), v.literal("speech")),
    source: v.union(v.literal("typed"), v.literal("spoken")),
  },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(args.requestId))
      throw new Error("Invalid idea request.");
    const now = Date.now();
    const session = await ctx.db
      .query("heroIdeaSessions")
      .withIndex("by_token", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!session || session.expiresAt <= now)
      throw new Error(
        "This idea session expired. Reopen the editor; your choices are kept.",
      );
    const existing = await ctx.db
      .query("heroIdeas")
      .withIndex("by_request", (q) =>
        q.eq("sessionId", session._id).eq("requestId", args.requestId),
      )
      .unique();
    if (existing) {
      if (
        existing.fingerprint !== args.fingerprint ||
        existing.kind !== args.kind
      )
        throw new Error("Please start a new idea request.");
      return { idea: existing, claimed: false };
    }
    if ((session.requests ?? 0) >= 32)
      throw new Error(
        "This idea session has reached its limit. Try later; your choices are kept.",
      );
    const units = args.kind === "idea" ? 12 : 4;
    const windowUnits =
      now - session.windowStartedAt >= IDEA_SESSION_WINDOW_MS
        ? 0
        : session.units;
    if (windowUnits + units > IDEA_SESSION_WINDOW_UNITS)
      throw new Error(
        "You’ve tried lots of ideas. Keep your choices and try again in a little while.",
      );
    const key = new Date(now).toISOString().slice(0, 10);
    const quota = await ctx.db
      .query("heroIdeaQuota")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if ((quota?.units ?? 0) + units > IDEA_DAILY_UNITS)
      throw new Error(
        "The idea workshop has reached today’s limit. Your choices are kept.",
      );
    if (quota) await ctx.db.patch(quota._id, { units: quota.units + units });
    else
      await ctx.db.insert("heroIdeaQuota", {
        key,
        units,
        sessions: 0,
        expiresAt: now + 2 * IDEA_TTL_MS,
      });
    await ctx.db.patch(session._id, {
      requests: (session.requests ?? 0) + 1,
      units: windowUnits + units,
      ...(windowUnits === 0 ? { windowStartedAt: now } : {}),
    });
    const ideaId = await ctx.db.insert("heroIdeas", {
      sessionId: session._id,
      requestId: args.requestId,
      kind: args.kind,
      source: args.source,
      fingerprint: args.fingerprint,
      interpretationVersion: "v1",
      baseFingerprint: args.baseFingerprint,
      state: "PENDING",
      createdAt: now,
      expiresAt: now + IDEA_TTL_MS,
    });
    await ctx.scheduler.runAfter(
      IDEA_RUN_MS,
      internal.heroIdeaState.failStuck,
      { ideaId },
    );
    const idea = await ctx.db.get(ideaId);
    if (!idea) throw new Error("Could not start that idea.");
    return { idea, claimed: true };
  },
});
export const getBase = internalQuery({
  args: { ideaId: v.id("heroIdeas"), context: heroContext },
  handler: async (ctx, { ideaId, context }) => {
    const idea = await ctx.db.get(ideaId);
    if (idea?.state !== "PENDING" || idea.expiresAt <= Date.now())
      throw new Error("This idea request is no longer active.");
    const parts = [];
    for (const part of ["character", "outfit", "quirk", "details"] as const) {
      const ref = context[part];
      if (ref) {
        try {
          parts.push({
            part,
            ...(await resolveHeroChoice(ctx, ref, part, idea.sessionId))
              .snapshot,
          });
        } catch (error) {
          if (!("kind" in ref)) throw error;
          parts.push({
            part,
            description: "An earlier private custom choice needs review again.",
          });
        }
      }
    }
    return parts.map(({ part, description }) => ({ part, description }));
  },
});
export const active = internalQuery({
  args: { ideaId: v.id("heroIdeas") },
  handler: async (ctx, { ideaId }) =>
    (await ctx.db.get(ideaId))?.state === "PENDING",
});
export const finish = internalMutation({
  args: {
    ideaId: v.id("heroIdeas"),
    state: v.union(
      v.literal("READY"),
      v.literal("FAILED"),
      v.literal("REJECTED"),
    ),
    parts: v.optional(v.array(ideaPart)),
  },
  handler: async (ctx, { ideaId, ...patch }) => {
    const idea = await ctx.db.get(ideaId);
    if (idea?.state !== "PENDING") return false;
    await ctx.db.patch(ideaId, patch);
    return true;
  },
});
export const confirm = mutation({
  args: {
    capability: v.string(),
    ideaId: v.id("heroIdeas"),
    context: heroContext,
    text: v.string(),
  },
  handler: async (ctx, { capability, ideaId, context, text }) => {
    await requireMember(ctx);
    const hash = await capabilityHash(capability);
    const idea = await ctx.db.get(ideaId);
    const session = idea ? await ctx.db.get(idea.sessionId) : null;
    if (
      !idea ||
      session?.tokenHash !== hash ||
      session.expiresAt <= Date.now() ||
      idea.expiresAt <= Date.now() ||
      !["READY", "CONFIRMED"].includes(idea.state) ||
      !idea.parts?.length
    )
      throw new Error(
        "This idea expired. Review it again; your choices are kept.",
      );
    const base = await digest(contextKey(context));
    if (
      base !== idea.baseFingerprint ||
      (await digest(JSON.stringify([text.trim(), base, idea.source]))) !==
        idea.fingerprint
    )
      throw new Error(
        "Your hero changed. Review this idea again before applying it.",
      );
    await ctx.db.patch(ideaId, {
      state: "CONFIRMED",
      confirmedText: text.trim(),
    });
    return idea.parts;
  },
});
export const cancel = mutation({
  args: { capability: v.string(), requestId: v.string() },
  handler: async (ctx, { capability, requestId }) => {
    await requireMember(ctx);
    const hash = await capabilityHash(capability);
    const session = await ctx.db
      .query("heroIdeaSessions")
      .withIndex("by_token", (q) => q.eq("tokenHash", hash))
      .unique();
    if (!session || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return;
    const idea = await ctx.db
      .query("heroIdeas")
      .withIndex("by_request", (q) =>
        q.eq("sessionId", session._id).eq("requestId", requestId),
      )
      .unique();
    if (!idea) {
      if ((session.requests ?? 0) >= 32) return;
      await ctx.db.patch(session._id, {
        requests: (session.requests ?? 0) + 1,
      });
      await ctx.db.insert("heroIdeas", {
        sessionId: session._id,
        requestId,
        kind: "idea",
        source: "typed",
        state: "CANCELLED",
        fingerprint: "cancelled",
        baseFingerprint: "",
        createdAt: Date.now(),
        expiresAt: session.expiresAt,
      });
      return;
    }
    if (idea.state !== "CONFIRMED")
      await ctx.db.patch(idea._id, { state: "CANCELLED", parts: undefined });
  },
});
export const failStuck = internalMutation({
  args: { ideaId: v.id("heroIdeas") },
  handler: async (ctx, { ideaId }) => {
    const idea = await ctx.db.get(ideaId);
    if (idea?.state === "PENDING")
      await ctx.db.patch(ideaId, { state: "FAILED" });
  },
});
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    let removed = 0;
    for (const table of [
      "heroIdeas",
      "heroIdeaSessions",
      "heroIdeaQuota",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_expires", (q) => q.lte("expiresAt", Date.now()))
        .take(100);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
      if (rows.length === 100)
        await ctx.scheduler.runAfter(0, internal.heroIdeaState.cleanup, {});
    }
    return removed;
  },
});

export const characterGender = internalQuery({
  args: { reference: catalogReference },
  handler: async (ctx, { reference }) => {
    const row = await ctx.db.get(reference.optionId);
    return Boolean(
      row &&
        row.category === "character" &&
        row.revision === reference.revision &&
        row.supportsGender,
    );
  },
});
