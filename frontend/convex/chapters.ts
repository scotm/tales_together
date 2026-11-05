import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { type ParsedBeatCard, parseBeatPitch } from "./llm/beatCards";
import { parseExtraction } from "./llm/extraction";
import { BEAT_PITCH_SCHEMA, EXTRACTION_SCHEMA } from "./llm/jsonSchemas";
import { moderate } from "./llm/moderation";
import { getArcRoleInstructions } from "./llm/promptMatrices";
import {
  beatPitchPrompt,
  chapterProsePrompt,
  extractionPrompt,
} from "./llm/prompts";
import { lintProse } from "./llm/proseLint";
import { getTextProvider } from "./llm/provider";
import { beatStyle } from "./schema";

/** Everything a prompt needs about one chapter, in one query. */
export const getChapterContext = internalQuery({
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
      internal.chapters.getChapterContext,
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

/** The child's card pick. Kept so the prose prompt has one fixed target. */
export const chooseBeat = mutation({
  args: { chapterId: v.id("chapters"), cardId: v.string() },
  handler: async (ctx, { chapterId, cardId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) throw new Error("chapter not found");
    if (chapter.paragraphs.length > 0) {
      throw new Error("chapter is already written");
    }

    const beat = chapter.beatCards.find((card) => card.cardId === cardId);
    if (!beat) throw new Error(`no beat card ${cardId} in this chapter`);

    await ctx.db.patch(chapterId, { chosenBeat: beat });
    return beat;
  },
});

export const beginWriting = internalMutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) throw new Error("chapter not found");
    if (chapter.status !== "DIRECTING") {
      throw new Error(
        `chapter ${chapter.index} is ${chapter.status}, not DIRECTING`,
      );
    }
    await ctx.db.patch(chapterId, { status: "WRITING" });
  },
});

/** Roll back to the card pick when the model's prose never lands. */
export const abandonWriting = internalMutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    await ctx.db.patch(chapterId, { status: "DIRECTING" });
  },
});

export const setChapterProse = internalMutation({
  args: { chapterId: v.id("chapters"), paragraphs: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.paragraphs.length === 0) {
      throw new Error("refusing to store an empty chapter");
    }
    await ctx.db.patch(args.chapterId, {
      paragraphs: args.paragraphs,
      status: "REVIEWING",
    });
  },
});

function splitParagraphs(raw: string): string[] {
  const blocks = (text: string) =>
    text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

  const paragraphs = blocks(raw);
  // Models usually emit double newlines; some use single ones.
  return paragraphs.length > 1
    ? paragraphs
    : blocks(raw.replace(/\n+/g, "\n\n"));
}

/**
 * Prompt 3 (docs/03 §6). Idempotent: a chapter that already has prose is
 * returned without spending another call.
 *
 * shortcut: no spend ledger yet (BOOK_BUDGET_USD is unused) — add the budget
 * check before strangers can press the button.
 */
export const writeChapter = action({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }): Promise<string[]> => {
    const { story, chapter, characters, prior } = await ctx.runQuery(
      internal.chapters.getChapterContext,
      { chapterId },
    );

    if (chapter.paragraphs.length > 0) return chapter.paragraphs;
    if (chapter.status !== "DIRECTING") {
      throw new Error(
        `chapter ${chapter.index} is ${chapter.status}, not DIRECTING`,
      );
    }
    const chosenBeat = chapter.chosenBeat;
    if (!chosenBeat) throw new Error("pick a beat card before writing");

    await ctx.runMutation(internal.chapters.beginWriting, { chapterId });

    const previous = prior.at(-1);
    const useItem = story.items.find(
      (item) => item.id === chosenBeat.suggestedItemId,
    );

    const prompt = chapterProsePrompt({
      storyTitle: story.title,
      chapterIndex: chapter.index,
      totalChapters: story.totalChapters,
      arc: getArcRoleInstructions(chapter.index, story.totalChapters),
      setting: story.worldState.setting,
      vibe: story.vibe,
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
        summaryBullets: entry.summaryBullets,
      })),
      previousChapterTail: previous?.paragraphs.slice(-2).join("\n\n"),
      chosenBeat: {
        title: chosenBeat.title,
        kidFriendlyPitch: chosenBeat.kidFriendlyPitch,
      },
      useItemName: useItem?.name,
      endingStyle: "CLIFFHANGER",
    });

    // On Gemini 3.x thinking tokens are charged against this budget, so a cap
    // sized for the prose alone can return a truncated chapter.
    const raw = await getTextProvider("prose").complete({
      ...prompt,
      maxTokens: 2400,
    });
    const paragraphs = splitParagraphs(raw);

    const verdict = await moderate(paragraphs.join("\n\n"));
    if (!verdict.ok) {
      await ctx.runMutation(internal.chapters.abandonWriting, { chapterId });
      throw new Error(`moderation rejected the chapter: ${verdict.reason}`);
    }

    const lint = lintProse(paragraphs);
    if (!lint.ok) {
      await ctx.runMutation(internal.chapters.abandonWriting, { chapterId });
      throw new Error(`prose lint rejected the chapter: ${lint.reason}`);
    }

    // shortcut: the whole chapter lands in one write; stream paragraph by
    // paragraph once the adapter can stream (docs/03 §6).
    await ctx.runMutation(internal.chapters.setChapterProse, {
      chapterId,
      paragraphs,
    });

    // Background work: continuity for the next chapter, art prompts for later.
    await ctx.scheduler.runAfter(0, internal.chapters.extractChapter, {
      chapterId,
    });
    return paragraphs;
  },
});

export const beginExtraction = internalMutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) throw new Error("chapter not found");
    if (chapter.paragraphs.length === 0) {
      throw new Error("chapter has no prose to extract");
    }
    if (chapter.extractionStatus === "DONE") return;
    await ctx.db.patch(chapterId, { extractionStatus: "RUNNING" });
  },
});

/** A failed extraction never blocks the reader; it is retried on lock. */
export const failExtraction = internalMutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    await ctx.db.patch(chapterId, { extractionStatus: "FAILED" });
  },
});

/**
 * Prompt 4 lands here (docs/02 §4): the argument validator is the contract, so
 * a malformed object is rejected before any table changes.
 */
/** Shared with the schema-parity test; keep in step with EXTRACTION_SCHEMA. */
export const extractionFields = {
  chapterTitle: v.string(),
  summaryBullets: v.array(v.string()),
  itemsUsed: v.array(v.string()),
  newItems: v.array(v.object({ id: v.string(), name: v.string() })),
  unresolvedThreads: v.array(v.string()),
  illustrationPrompt: v.string(),
  videoMotionPrompt: v.string(),
};

export const applyExtraction = internalMutation({
  args: {
    chapterId: v.id("chapters"),
    ...extractionFields,
  },
  handler: async (ctx, args) => {
    if (args.summaryBullets.length !== 3) {
      throw new Error("extraction must return exactly 3 summary bullets");
    }

    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) throw new Error("chapter not found");
    const story = await ctx.db.get(chapter.storyId);
    if (!story) throw new Error("story not found");

    const used = new Set(args.itemsUsed);
    const known = new Set(story.items.map((item) => item.id));
    const items = story.items.map((item) =>
      used.has(item.id)
        ? { ...item, status: "USED" as const, usedInChapter: chapter.index }
        : item,
    );
    for (const item of args.newItems) {
      // A new id that collides with something already in the story is the
      // model repeating an item, not picking up a second one.
      if (known.has(item.id)) continue;
      known.add(item.id);
      items.push({ id: item.id, name: item.name, status: "IN_BACKPACK" });
    }

    await ctx.db.patch(args.chapterId, {
      title: args.chapterTitle,
      summaryBullets: args.summaryBullets,
      illustrationPrompt: args.illustrationPrompt,
      videoMotionPrompt: args.videoMotionPrompt,
      extractionStatus: "DONE",
    });

    await ctx.db.patch(story._id, {
      items,
      // Replaced, not appended: the extractor reports every open thread.
      worldState: {
        ...story.worldState,
        unresolvedThreads: args.unresolvedThreads,
      },
    });
  },
});

/**
 * Runs during REVIEWING, after the prose is stored. Scheduled rather than
 * awaited by `writeChapter`, so a provider failure cannot take the chapter the
 * child is reading with it.
 */
export const extractChapter = internalAction({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }): Promise<void> => {
    const { story, chapter, characters } = await ctx.runQuery(
      internal.chapters.getChapterContext,
      { chapterId },
    );
    if (chapter.extractionStatus === "DONE") return;

    await ctx.runMutation(internal.chapters.beginExtraction, { chapterId });

    try {
      const prompt = extractionPrompt({
        chapterIndex: chapter.index,
        chapterParagraphs: chapter.paragraphs,
        characters: characters.map((character) => ({
          name: character.name,
          visualDescription: character.visualDescription,
        })),
        artStyle: story.artStyle,
        availableItems: story.items
          .filter((item) => item.status === "IN_BACKPACK")
          .map((item) => ({ id: item.id, name: item.name })),
      });

      const raw = await getTextProvider("structured").complete({
        ...prompt,
        jsonSchema: EXTRACTION_SCHEMA,
        maxTokens: 1200,
      });

      const extraction = parseExtraction(
        raw,
        new Set(story.items.map((item) => item.id)),
      );

      await ctx.runMutation(internal.chapters.applyExtraction, {
        chapterId,
        ...extraction,
      });
    } catch (cause) {
      await ctx.runMutation(internal.chapters.failExtraction, { chapterId });
      throw cause;
    }
  },
});
