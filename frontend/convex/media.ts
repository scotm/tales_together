import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import {
  createDiagnostics,
  diagnosticContext,
  operationIdFor,
  traceIdFor,
} from "./lib/diagnostics";
import { getImageGenerator } from "./llm/imageProvider";

const NO_TEXT =
  "Children's storybook illustration, no text, no speech bubbles, no watermarks, logos or signatures.";

/** The extractor writes the prompt; this only locks style and framing. */
export function illustrationRequest(prompt: string, artStyle: string): string {
  return [prompt, `Style: ${artStyle}.`, NO_TEXT].join(" ");
}

export function coverRequest(input: {
  setting: string;
  heroVisualDescription?: string;
  artStyle: string;
}): string {
  const hero = input.heroVisualDescription
    ? `Children's storybook artwork, starring ${input.heroVisualDescription}.`
    : "Children's storybook artwork.";
  return [
    hero,
    "Portrait 2:3 composition, artwork extending to all four edges; no border, frame or paper margins.",
    "Artwork only. Do not draw any title, lettering, typography, labels or signature.",
    `Setting: ${input.setting}.`,
    `Style: ${input.artStyle}.`,
    NO_TEXT,
  ].join(" ");
}

/**
 * One still per chapter (docs/02 §5). Runs after extraction because the prompt
 * is derived from prose that will not change again. Failure is non-fatal: the
 * chapter simply has no picture.
 */
export const illustrateChapter = internalAction({
  args: {
    chapterId: v.id("chapters"),
    diagnostics: v.optional(diagnosticContext),
  },
  handler: async (ctx, { chapterId, diagnostics }): Promise<void> => {
    const { story, chapter } = await ctx.runQuery(
      internal.chapters.getChapterContext,
      { chapterId },
    );
    const diag = createDiagnostics(ctx, {
      name: "illustration",
      traceId: diagnostics?.traceId ?? traceIdFor(story),
      operationId: diagnostics?.operationId,
      parentOperationId: diagnostics?.parentOperationId,
      runId: diagnostics?.runId,
      scheduledAt: diagnostics?.scheduledAt,
      storyId: story._id,
      chapterId,
      purpose: "illustration",
    });
    await diag.start();

    try {
      if (chapter.illustrationFileId) {
        await diag.record("media.skipped", {
          status: "skipped",
          stage: "reused_artwork",
        });
        await diag.finish("succeeded");
        return;
      }
      if (!chapter.illustrationPrompt) {
        await diag.record("media.skipped", {
          status: "skipped",
          stage: "absent_prompt",
        });
        await diag.finish("succeeded");
        return;
      }

      const generate = getImageGenerator();
      if (!generate) {
        await diag.record("media.skipped", {
          status: "skipped",
          stage: "generation_disabled",
        });
        await diag.finish("succeeded");
        return;
      }

      const image = await generate({
        prompt: illustrationRequest(chapter.illustrationPrompt, story.artStyle),
        aspectRatio: "4:3",
        progress: diag.providerProgress({
          provider: "image",
          purpose: "illustration",
        }),
      });
      await diag.record("media.generated", {
        status: "succeeded",
        stage: "generation",
        message:
          `image_bytes=${image.bytes.byteLength} format=${image.contentType}` +
          ` request_id=${image.requestId ?? "unknown"}` +
          ` cost_micro_usd=${image.costMicroUsd ?? "unknown"}`,
      });

      const original = await ctx.storage.store(
        new Blob([image.bytes], { type: image.contentType }),
      );
      const fileId = await ctx.runAction(internal.mediaNode.recompress, {
        fileId: original,
        diagnostics: diag.child({ name: "compression" }),
      });
      if (fileId !== original) {
        try {
          await ctx.storage.delete(original);
        } catch {
          await diag.record("media.cleanup_failed", {
            level: "warn",
            status: "degraded",
            stage: "delete_original",
            errorCode: "STORAGE_CLEANUP_FAILED",
            message: "The original image could not be deleted.",
          });
        }
      }

      await ctx.runMutation(internal.chapters.setIllustration, {
        chapterId,
        fileId,
      });
      await diag.record("media.commit", {
        status: "succeeded",
        stage: "attach_illustration",
      });
      await diag.finish("succeeded");
    } catch (cause) {
      await diag.finish("failed", cause);
      throw cause;
    }
  },
});

export const illustrateCover = internalAction({
  args: {
    storyId: v.id("stories"),
    regenerate: v.optional(v.boolean()),
    exportRunId: v.optional(v.string()),
    diagnostics: v.optional(diagnosticContext),
  },
  handler: async (
    ctx,
    { storyId, regenerate, exportRunId, diagnostics },
  ): Promise<void> => {
    const story = await ctx.runQuery(internal.stories.getForCover, { storyId });
    if (!story) return;
    const runId =
      exportRunId ??
      (await ctx.runMutation(internal.exportJobs.begin, {
        storyId,
        stage: "PREPARING_COVER",
      }));
    if (!runId) return;

    const diag = createDiagnostics(ctx, {
      name: "cover",
      traceId: diagnostics?.traceId ?? traceIdFor(story),
      operationId: diagnostics?.operationId ?? operationIdFor("cover", runId),
      parentOperationId: diagnostics?.parentOperationId,
      runId,
      scheduledAt: diagnostics?.scheduledAt,
      storyId,
      purpose: "cover",
    });
    await diag.start();

    if (exportRunId && story.exportRunId !== exportRunId) {
      await diag.record("operation.superseded", {
        level: "warn",
        status: "superseded",
        stage: "stale_cover_worker",
      });
      await diag.finish("superseded");
      return;
    }

    let failure: unknown;
    let degraded = false;
    try {
      if (!story.coverFileId || regenerate) {
        const generate = getImageGenerator();
        if (!generate) {
          await diag.record("media.skipped", {
            status: "skipped",
            stage: "generation_disabled",
          });
        } else {
          const image = await generate({
            prompt: coverRequest({
              setting: story.worldState.setting,
              heroVisualDescription: story.heroVisualDescription,
              artStyle: story.artStyle,
            }),
            aspectRatio: "2:3",
            progress: diag.providerProgress({
              provider: "image",
              purpose: "cover",
              business: {
                onRetry: async (retry) => {
                  await ctx.runMutation(internal.exportJobs.retrying, {
                    storyId,
                    runId,
                    retry,
                  });
                },
              },
            }),
          });
          await diag.record("media.generated", {
            status: "succeeded",
            stage: "cover_generation",
            message:
              `image_bytes=${image.bytes.byteLength} format=${image.contentType}` +
              ` request_id=${image.requestId ?? "unknown"}` +
              ` cost_micro_usd=${image.costMicroUsd ?? "unknown"}`,
          });

          const original = await ctx.storage.store(
            new Blob([image.bytes], { type: image.contentType }),
          );
          const fileId = await ctx.runAction(internal.mediaNode.recompress, {
            fileId: original,
            diagnostics: diag.child({ name: "compression" }),
          });
          if (fileId !== original) {
            try {
              await ctx.storage.delete(original);
            } catch {
              degraded = true;
              await diag.record("media.cleanup_failed", {
                level: "warn",
                status: "degraded",
                stage: "delete_original",
                errorCode: "STORAGE_CLEANUP_FAILED",
                message: "The original cover could not be deleted.",
              });
            }
          }

          await ctx.runMutation(internal.stories.setCover, {
            storyId,
            fileId,
            exportRunId: runId,
          });
          if (story.coverFileId) {
            try {
              await ctx.storage.delete(story.coverFileId);
            } catch {
              degraded = true;
              await diag.record("media.cleanup_failed", {
                level: "warn",
                status: "degraded",
                stage: "delete_old_cover",
                errorCode: "STORAGE_CLEANUP_FAILED",
                message: "The old cover could not be deleted.",
              });
            }
          }
        }
      } else {
        await diag.record("media.skipped", {
          status: "skipped",
          stage: "reused_cover",
        });
      }
    } catch (cause) {
      failure = cause;
      degraded = true;
      await diag.record("export.degraded", {
        level: "warn",
        status: "degraded",
        stage: "cover_generation",
        message: "The cover failed; the book will be built without it.",
      });
      await ctx.runMutation(internal.exportJobs.coverFailed, {
        storyId,
        runId,
      });
    }

    await diag.finish(degraded ? "degraded" : "succeeded", failure);

    // Export last, so the cover is in the archive. Runs even when the image
    // call fails: a coverless book beats no book.
    await ctx.scheduler.runAfter(0, internal.epub.build.buildEpubInternal, {
      storyId,
      runId,
      diagnostics: {
        traceId: diag.scope.traceId,
        operationId: operationIdFor("export", runId),
        parentOperationId: diag.scope.operationId,
        runId,
        scheduledAt: Date.now(),
      },
    });
  },
});

/** Every stored image that still has an owner; used by the recompress pass. */
export const listImages = internalQuery({
  args: {},
  handler: async (ctx) => {
    const chapters = await ctx.db.query("chapters").collect();
    const stories = await ctx.db.query("stories").collect();

    return [
      ...chapters.flatMap((chapter) =>
        chapter.illustrationFileId
          ? [{ fileId: chapter.illustrationFileId, chapterId: chapter._id }]
          : [],
      ),
      ...stories.flatMap((story) =>
        story.coverFileId
          ? [{ fileId: story.coverFileId, storyId: story._id }]
          : [],
      ),
    ];
  },
});
