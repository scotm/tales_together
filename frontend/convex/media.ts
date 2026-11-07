import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
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
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }): Promise<void> => {
    const { story, chapter } = await ctx.runQuery(
      internal.chapters.getChapterContext,
      { chapterId },
    );
    if (chapter.illustrationFileId || !chapter.illustrationPrompt) return;

    const generate = getImageGenerator();
    if (!generate) return;
    const image = await generate({
      prompt: illustrationRequest(chapter.illustrationPrompt, story.artStyle),
      aspectRatio: "4:3",
    });

    const original = await ctx.storage.store(
      new Blob([image.bytes], { type: image.contentType }),
    );
    const fileId = await ctx.runAction(internal.mediaNode.recompress, {
      fileId: original,
    });
    if (fileId !== original) await ctx.storage.delete(original);

    await ctx.runMutation(internal.chapters.setIllustration, {
      chapterId,
      fileId,
    });
  },
});

export const illustrateCover = internalAction({
  args: {
    storyId: v.id("stories"),
    regenerate: v.optional(v.boolean()),
    exportRunId: v.optional(v.string()),
  },
  handler: async (ctx, { storyId, regenerate, exportRunId }): Promise<void> => {
    const story = await ctx.runQuery(internal.stories.getForCover, { storyId });
    if (!story) return;
    const runId =
      exportRunId ??
      (await ctx.runMutation(internal.exportJobs.begin, {
        storyId,
        stage: "PREPARING_COVER",
      }));
    if (!runId) return;
    if (exportRunId && story.exportRunId !== exportRunId) return;

    try {
      if (!story.coverFileId || regenerate) {
        const generate = getImageGenerator();
        if (!generate) return;
        const image = await generate({
          prompt: coverRequest({
            setting: story.worldState.setting,
            heroVisualDescription: story.heroVisualDescription,
            artStyle: story.artStyle,
          }),
          aspectRatio: "2:3",
          progress: {
            onRetry: async (retry) => {
              await ctx.runMutation(internal.exportJobs.retrying, {
                storyId,
                runId,
                retry,
              });
            },
          },
        });

        const original = await ctx.storage.store(
          new Blob([image.bytes], { type: image.contentType }),
        );
        const fileId = await ctx.runAction(internal.mediaNode.recompress, {
          fileId: original,
        });
        if (fileId !== original) await ctx.storage.delete(original);

        await ctx.runMutation(internal.stories.setCover, {
          storyId,
          fileId,
          exportRunId: runId,
        });
        if (story.coverFileId) await ctx.storage.delete(story.coverFileId);
      }
    } catch {
      await ctx.runMutation(internal.exportJobs.coverFailed, {
        storyId,
        runId,
      });
    } finally {
      // Export last, so the cover is in the archive. Runs even when the image
      // call fails: a coverless book beats no book.
      await ctx.scheduler.runAfter(0, internal.epub.build.buildEpubInternal, {
        storyId,
        runId,
      });
    }
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
