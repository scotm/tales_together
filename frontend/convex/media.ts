import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { GEMINI_IMAGE_MODEL } from "./lib/config";
import { createGeminiImageGenerator } from "./llm/image";

const NO_TEXT =
  "Children's storybook illustration, no text, no speech bubbles.";

function requireKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set on this Convex deployment: npx convex env set GEMINI_API_KEY …",
    );
  }
  return apiKey;
}

/** The extractor writes the prompt; this only locks style and framing. */
export function illustrationRequest(prompt: string, artStyle: string): string {
  return [prompt, `Style: ${artStyle}.`, NO_TEXT].join(" ");
}

export function coverRequest(input: {
  title: string;
  setting: string;
  heroVisualDescription?: string;
  artStyle: string;
}): string {
  const hero = input.heroVisualDescription
    ? `Front cover of a children's book called "${input.title}", starring ${
        input.heroVisualDescription
      }.`
    : `Front cover of a children's book called "${input.title}".`;
  return [
    hero,
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

    const generate = createGeminiImageGenerator({
      apiKey: requireKey(),
      model: GEMINI_IMAGE_MODEL,
    });
    const image = await generate({
      prompt: illustrationRequest(chapter.illustrationPrompt, story.artStyle),
      aspectRatio: "4:3",
    });

    const fileId = await ctx.storage.store(
      new Blob([image.bytes], { type: image.contentType }),
    );
    await ctx.runMutation(internal.chapters.setIllustration, {
      chapterId,
      fileId,
    });
  },
});

export const illustrateCover = internalAction({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }): Promise<void> => {
    const story = await ctx.runQuery(internal.stories.getForCover, { storyId });
    if (!story || story.coverFileId) return;

    const generate = createGeminiImageGenerator({
      apiKey: requireKey(),
      model: GEMINI_IMAGE_MODEL,
    });
    const image = await generate({
      prompt: coverRequest({
        title: story.title,
        setting: story.worldState.setting,
        heroVisualDescription: story.heroVisualDescription,
        artStyle: story.artStyle,
      }),
      aspectRatio: "4:3",
    });

    const fileId = await ctx.storage.store(
      new Blob([image.bytes], { type: image.contentType }),
    );
    await ctx.runMutation(internal.stories.setCover, { storyId, fileId });
  },
});
