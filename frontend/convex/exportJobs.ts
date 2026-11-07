import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
} from "./_generated/server";
import { GENERATION_LEASE_MS } from "./lib/config";
import { operationIdFor } from "./lib/diagnostics";
import { retryProgress } from "./schema";

const stages = v.union(v.literal("PREPARING_COVER"), v.literal("BUILDING"));

async function claim(
  ctx: MutationCtx,
  storyId: Id<"stories">,
  stage: "PREPARING_COVER" | "BUILDING",
): Promise<string | null> {
  const story = await ctx.db.get(storyId);
  if (!story) throw new ConvexError("Story not found.");
  if (story.exportRunId) return null;
  const runId = `${Date.now()}-${Math.random()}`;
  await ctx.db.patch(storyId, {
    exportRunId: runId,
    exportStartedAt: Date.now(),
    exportStatus: stage,
    exportError: undefined,
    exportWarning: undefined,
    exportRetry: undefined,
  });
  await ctx.scheduler.runAfter(
    GENERATION_LEASE_MS,
    internal.exportJobs.expire,
    { storyId, runId },
  );
  return runId;
}

/** Called in the same transaction that locks the last chapter. */
export async function queueExport(
  ctx: MutationCtx,
  storyId: Id<"stories">,
): Promise<void> {
  const previous = await ctx.db.get(storyId);
  const runId = await claim(ctx, storyId, "PREPARING_COVER");
  if (!runId) return;
  await ctx.scheduler.runAfter(0, internal.media.illustrateCover, {
    storyId,
    exportRunId: runId,
    regenerate: Boolean(previous?.exportWarning),
  });
}

export const retry = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (story?.status !== "COMPLETED") {
      throw new ConvexError("Finish the book before exporting it.");
    }
    await queueExport(ctx, storyId);
  },
});

/** Also used by direct CLI cover generation and EPUB builds. */
export const begin = internalMutation({
  args: { storyId: v.id("stories"), stage: stages },
  handler: async (ctx, { storyId, stage }): Promise<string | null> =>
    claim(ctx, storyId, stage),
});

export const building = internalMutation({
  args: { storyId: v.id("stories"), runId: v.string() },
  handler: async (ctx, { storyId, runId }): Promise<void> => {
    const story = await ctx.db.get(storyId);
    if (story?.exportRunId !== runId)
      throw new Error("export attempt is no longer active");
    await ctx.db.patch(storyId, {
      exportStatus: "BUILDING",
      exportRetry: undefined,
    });
  },
});

export const retrying = internalMutation({
  args: { storyId: v.id("stories"), runId: v.string(), retry: retryProgress },
  handler: async (ctx, { storyId, runId, retry }): Promise<void> => {
    const story = await ctx.db.get(storyId);
    if (story?.exportRunId !== runId)
      throw new Error("export attempt is no longer active");
    await ctx.db.patch(storyId, { exportRetry: retry });
  },
});

export const coverFailed = internalMutation({
  args: { storyId: v.id("stories"), runId: v.string() },
  handler: async (ctx, { storyId, runId }): Promise<void> => {
    const story = await ctx.db.get(storyId);
    if (story?.exportRunId !== runId) return;
    await ctx.db.patch(storyId, {
      exportWarning:
        "The cover could not be made. Your book is still readable.",
    });
  },
});

export const complete = internalMutation({
  args: {
    storyId: v.id("stories"),
    runId: v.string(),
    fileId: v.id("_storage"),
  },
  handler: async (ctx, { storyId, runId, fileId }): Promise<void> => {
    const story = await ctx.db.get(storyId);
    if (story?.exportRunId !== runId)
      throw new Error("export attempt is no longer active");
    await ctx.db.patch(storyId, {
      epubFileId: fileId,
      exportStatus: "READY",
      exportRunId: undefined,
      exportStartedAt: undefined,
      exportRetry: undefined,
      exportError: undefined,
    });
  },
});

export const fail = internalMutation({
  args: { storyId: v.id("stories"), runId: v.string() },
  handler: async (ctx, { storyId, runId }): Promise<void> => {
    const story = await ctx.db.get(storyId);
    if (story?.exportRunId !== runId) return;
    await ctx.db.patch(storyId, {
      exportStatus: "FAILED",
      exportRunId: undefined,
      exportStartedAt: undefined,
      exportRetry: undefined,
      exportError:
        "We couldn't prepare your download. Your chapters are saved. Try again.",
    });
  },
});

export const expire = internalMutation({
  args: { storyId: v.id("stories"), runId: v.string() },
  handler: async (ctx, { storyId, runId }): Promise<void> => {
    const story = await ctx.db.get(storyId);
    if (story?.exportRunId !== runId) return;
    await ctx.db.patch(storyId, {
      exportStatus: "FAILED",
      exportRunId: undefined,
      exportStartedAt: undefined,
      exportRetry: undefined,
      exportError:
        "Preparing the download was interrupted. Your chapters are saved. Try again.",
    });
    await ctx.scheduler.runAfter(0, internal.diagnostics.noteOperation, {
      operationId: operationIdFor("export", runId),
      name: "export.watchdog",
      status: "recovered",
      stage: "export_watchdog",
      errorCode: "EXPORT_WATCHDOG_RECOVERED",
      safeMessage: "The export watchdog released the interrupted job.",
    });
  },
});
