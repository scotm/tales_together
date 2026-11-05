import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { type ParsedBeatCard, parseBeatPitch } from "./llm/beatCards";
import { BEAT_PITCH_SCHEMA } from "./llm/jsonSchemas";
import { moderate } from "./llm/moderation";
import { getArcRoleInstructions } from "./llm/promptMatrices";
import { beatPitchPrompt } from "./llm/prompts";
import { getTextProvider } from "./llm/provider";
import { beatStyle } from "./schema";

export const getForPitch = internalQuery({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) throw new Error("chapter not found");

    const story = await ctx.db.get(chapter.storyId);
    if (!story) throw new Error("story not found");

    const characters = await ctx.db
      .query("characters")
      .withIndex("by_story", (q) => q.eq("storyId", story._id))
      .collect();

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", story._id))
      .collect();

    const prior = chapters
      .filter((entry) => entry.index < chapter.index)
      .sort((a, b) => a.index - b.index);

    return { story, chapter, characters, prior };
  },
});

export const setBeatCards = internalMutation({
  args: {
    chapterId: v.id("chapters"),
    recapOneLiner: v.string(),
    cards: v.array(
      v.object({
        cardId: v.string(),
        style: beatStyle,
        title: v.string(),
        kidFriendlyPitch: v.string(),
        iconEmoji: v.string(),
        suggestedItemId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.cards.length !== 3) {
      throw new Error("expected exactly 3 beat cards");
    }
    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) throw new Error("chapter not found");

    await ctx.db.patch(args.chapterId, {
      beatCards: args.cards,
      recapOneLiner: args.recapOneLiner,
      // Only the first pitch advances the chapter. Re-pitching a DIRECTING
      // chapter must not reset a card the child already picked.
      ...(chapter.status === "PITCHING"
        ? { status: "DIRECTING" as const }
        : {}),
    });
  },
});

/**
 * Prompt 2 (docs/03 §5). Idempotent on purpose: a second tap while cards
 * already exist must not spend another call.
 */
export const pitchChapter = action({
  args: { chapterId: v.id("chapters") },
  // Explicit return type: the action reads `internal.chapters.*`, so inference
  // would be circular and generated types would degrade to `any`.
  handler: async (ctx, { chapterId }): Promise<ParsedBeatCard[]> => {
    const { story, chapter, characters, prior } = await ctx.runQuery(
      internal.chapters.getForPitch,
      { chapterId },
    );

    if (chapter.beatCards.length > 0) return chapter.beatCards;
    if (chapter.status !== "PITCHING") {
      throw new Error(
        `chapter ${chapter.index} is ${chapter.status}, not PITCHING`,
      );
    }

    const prompt = beatPitchPrompt({
      storyTitle: story.title,
      vibe: story.vibe,
      setting: story.worldState.setting,
      characters: characters.map((character) => ({
        name: character.name,
        role: character.role,
        visualDescription: character.visualDescription,
        quirk: character.quirk,
      })),
      availableItems: story.items
        .filter((item) => item.status === "IN_BACKPACK")
        .map((item) => ({ id: item.id, name: item.name })),
      unresolvedThreads: story.worldState.unresolvedThreads,
      priorChapters: prior.map((entry) => ({
        index: entry.index,
        title: entry.title,
        summaryBullets: entry.summaryBullets,
      })),
      chapterIndex: chapter.index,
      totalChapters: story.totalChapters,
      arc: getArcRoleInstructions(chapter.index, story.totalChapters),
    });

    const raw = await getTextProvider("structured").complete({
      ...prompt,
      jsonSchema: BEAT_PITCH_SCHEMA,
      maxTokens: 1200,
    });

    const pitch = parseBeatPitch(
      raw,
      new Set(story.items.map((item) => item.id)),
    );

    const verdict = await moderate(
      pitch.cards
        .map((card) => `${card.title}: ${card.kidFriendlyPitch}`)
        .join("\n"),
    );
    if (!verdict.ok) {
      throw new Error(`moderation rejected the pitch: ${verdict.reason}`);
    }

    await ctx.runMutation(internal.chapters.setBeatCards, {
      chapterId,
      recapOneLiner: pitch.recapOneLiner,
      cards: pitch.cards,
    });

    return pitch.cards;
  },
});
