import { ConvexError, v } from "convex/values";
import { createEventId } from "../shared/diagnostics/contract";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { queueExport } from "./exportJobs";
import { GENERATION_LEASE_MS, PROSE_MIN_WORDS } from "./lib/config";
import {
  createDiagnostics,
  type DiagnosticContext,
  diagnosticContext,
  operationIdFor,
  safeOperationId,
  traceIdFor,
} from "./lib/diagnostics";
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
import { countWords, lintProse } from "./llm/proseLint";
import { getTextProvider } from "./llm/provider";
import type { ProviderRetry } from "./llm/request";
import { beatStyle, retryProgress } from "./schema";

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
    const next =
      chapters.find((entry) => entry.index === chapter.index + 1) ?? null;

    return { story, chapter, characters, prior, next };
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
// Explicit return type: the action reads `internal.chapters.*`, so inference
// would be circular and generated types would degrade to `any`.
async function runPitch(
  ctx: ActionCtx,
  chapterId: Id<"chapters">,
  context?: DiagnosticContext,
  clientOperationId?: string,
): Promise<ParsedBeatCard[]> {
  const { story, chapter, characters, prior } = await ctx.runQuery(
    internal.chapters.getChapterContext,
    { chapterId },
  );

  const diag = createDiagnostics(ctx, {
    name: "pitch",
    traceId: context?.traceId ?? traceIdFor(story),
    operationId: context?.operationId ?? safeOperationId(clientOperationId),
    parentOperationId: context?.parentOperationId,
    runId: context?.runId,
    scheduledAt: context?.scheduledAt,
    storyId: story._id,
    chapterId,
  });
  await diag.start();

  try {
    if (chapter.beatCards.length > 0) {
      await diag.record("operation.skipped", {
        status: "skipped",
        stage: "reused_cards",
      });
      await diag.finish("succeeded");
      return chapter.beatCards;
    }
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

    const provider = getTextProvider("structured");
    const raw = await provider.complete(
      { ...prompt, jsonSchema: BEAT_PITCH_SCHEMA, maxTokens: 1200 },
      diag.providerProgress({
        provider: provider.name,
        purpose: "structured",
      }),
    );

    const pitch = parseBeatPitch(
      raw,
      new Set(story.items.map((item) => item.id)),
    );
    await diag.record("operation.validation", {
      status: "succeeded",
      stage: "beat_pitch",
    });

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
    await diag.record("operation.commit", {
      status: "succeeded",
      stage: "set_beat_cards",
    });
    await diag.finish("succeeded");
    return pitch.cards;
  } catch (cause) {
    await diag.finish("failed", cause);
    throw cause;
  }
}

export const pitchChapter = action({
  args: {
    chapterId: v.id("chapters"),
    clientOperationId: v.optional(v.string()),
  },
  handler: (ctx, { chapterId, clientOperationId }) =>
    runPitch(ctx, chapterId, undefined, clientOperationId),
});

/** Only internal functions may be scheduled; same body as the client call. */
export const pitchNextChapter = internalAction({
  args: {
    chapterId: v.id("chapters"),
    diagnostics: v.optional(diagnosticContext),
  },
  handler: (ctx, { chapterId, diagnostics }) =>
    runPitch(ctx, chapterId, diagnostics),
});

/** The child's card pick. Kept so the prose prompt has one fixed target. */
export const chooseBeat = mutation({
  args: { chapterId: v.id("chapters"), cardId: v.string() },
  handler: async (ctx, { chapterId, cardId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) throw new Error("chapter not found");
    if (chapter.paragraphs.length > 0 || chapter.status === "WRITING") {
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
    if (
      chapter.status !== "DIRECTING" &&
      !(chapter.status === "WRITING" && !chapter.writingRunId)
    ) {
      throw new Error(
        `chapter ${chapter.index} is ${chapter.status}, not DIRECTING`,
      );
    }
    const runId = `${Date.now()}-${Math.random()}`;
    await ctx.db.patch(chapterId, {
      status: "WRITING",
      writingRunId: runId,
      writingStartedAt: Date.now(),
      writingError: undefined,
      writingRetry: undefined,
    });
    await ctx.scheduler.runAfter(
      GENERATION_LEASE_MS,
      internal.chapters.recoverWriting,
      { chapterId, runId },
    );
    return runId;
  },
});

/** Roll back to the card pick when the model's prose never lands. */
export const abandonWriting = internalMutation({
  args: { chapterId: v.id("chapters"), runId: v.string(), error: v.string() },
  handler: async (ctx, { chapterId, runId, error }) => {
    const chapter = await ctx.db.get(chapterId);
    if (chapter?.status !== "WRITING" || chapter.writingRunId !== runId) return;
    await ctx.db.patch(chapterId, {
      status: "DIRECTING",
      writingRunId: undefined,
      writingStartedAt: undefined,
      writingRetry: undefined,
      writingError: error,
    });
  },
});

/** Also runs if an action crashes or is terminated before its catch block. */
export const recoverWriting = internalMutation({
  args: { chapterId: v.id("chapters"), runId: v.string() },
  handler: async (ctx, { chapterId, runId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (chapter?.status !== "WRITING" || chapter.writingRunId !== runId) return;
    await ctx.db.patch(chapterId, {
      status: "DIRECTING",
      writingRunId: undefined,
      writingStartedAt: undefined,
      writingRetry: undefined,
      writingError: "Writing was interrupted. Your choice is saved. Try again.",
    });
    await ctx.scheduler.runAfter(0, internal.diagnostics.noteOperation, {
      operationId: operationIdFor("write", runId),
      name: "operation.recovered",
      status: "recovered",
      stage: "writing_watchdog",
      errorCode: "WRITING_WATCHDOG_RECOVERED",
      safeMessage: "The writing watchdog released the chapter.",
    });
  },
});

export const writingRetry = internalMutation({
  args: {
    chapterId: v.id("chapters"),
    runId: v.string(),
    retry: retryProgress,
  },
  handler: async (ctx, { chapterId, runId, retry }) => {
    const chapter = await ctx.db.get(chapterId);
    if (chapter?.status !== "WRITING" || chapter.writingRunId !== runId) {
      throw new Error("writing attempt is no longer active");
    }
    await ctx.db.patch(chapterId, { writingRetry: retry });
  },
});

export const setChapterProse = internalMutation({
  args: {
    chapterId: v.id("chapters"),
    paragraphs: v.array(v.string()),
    runId: v.optional(v.string()),
    diagnostics: v.optional(diagnosticContext),
  },
  handler: async (ctx, args) => {
    if (args.paragraphs.length === 0) {
      throw new Error("refusing to store an empty chapter");
    }
    const chapter = await ctx.db.get(args.chapterId);
    if (!chapter) throw new Error("chapter not found");
    if (
      (args.runId || chapter.writingRunId) &&
      (chapter.status !== "WRITING" || chapter.writingRunId !== args.runId)
    ) {
      throw new Error("writing attempt is no longer active");
    }
    await ctx.db.patch(args.chapterId, {
      paragraphs: args.paragraphs,
      status: "REVIEWING",
      writingRunId: undefined,
      writingStartedAt: undefined,
      writingRetry: undefined,
      writingError: undefined,
    });
    // The production write and its follow-up work commit together. The
    // tokenless form remains useful for seeding prose in tests and CLI fixtures.
    if (args.runId) {
      await ctx.scheduler.runAfter(0, internal.chapters.extractChapter, {
        chapterId: args.chapterId,
        diagnostics: args.diagnostics,
      });
    }
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
  args: {
    chapterId: v.id("chapters"),
    clientOperationId: v.optional(v.string()),
  },
  handler: async (ctx, { chapterId, clientOperationId }): Promise<string[]> => {
    const { story, chapter, characters, prior } = await ctx.runQuery(
      internal.chapters.getChapterContext,
      { chapterId },
    );

    if (chapter.paragraphs.length > 0) return chapter.paragraphs;
    if (
      chapter.status !== "DIRECTING" &&
      !(chapter.status === "WRITING" && !chapter.writingRunId)
    ) {
      throw new Error(
        `chapter ${chapter.index} is ${chapter.status}, not DIRECTING`,
      );
    }
    const chosenBeat = chapter.chosenBeat;
    if (!chosenBeat) throw new Error("pick a beat card before writing");

    const runId = await ctx.runMutation(internal.chapters.beginWriting, {
      chapterId,
    });
    const diag = createDiagnostics(ctx, {
      name: "write",
      traceId: traceIdFor(story),
      operationId:
        safeOperationId(clientOperationId) ?? operationIdFor("write", runId),
      runId,
      storyId: story._id,
      chapterId,
      purpose: "prose",
    });
    try {
      await diag.start();
      const provider = getTextProvider("prose");
      const retryProgress = {
        onRetry: async (retry: ProviderRetry) => {
          await ctx.runMutation(internal.chapters.writingRetry, {
            chapterId,
            runId,
            retry,
          });
        },
      };
      const progress = diag.providerProgress({
        provider: provider.name,
        purpose: "prose",
        business: retryProgress,
      });
      const expansionProgress = diag.providerProgress({
        provider: provider.name,
        purpose: "prose_expansion",
        business: retryProgress,
      });

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
      const raw = await provider.complete(
        { ...prompt, maxTokens: 2400 },
        progress,
      );
      let paragraphs = splitParagraphs(raw);
      let lint = lintProse(paragraphs);

      // One corrective call, never a loop and never a block: a short chapter is
      // better than an error screen, but it should not go unnoticed either.
      if (lint.ok && countWords(paragraphs) < PROSE_MIN_WORDS) {
        try {
          const retry = await provider.complete(
            {
              system: prompt.system,
              user:
                `${prompt.user}\n\nYour previous attempt was ` +
                `${countWords(paragraphs)} words. Rewrite the chapter inside the ` +
                `target range. Keep the same events and ending; add dialogue and ` +
                `sensory detail, not new plot.`,
              maxTokens: 2400,
            },
            expansionProgress,
          );
          const retried = splitParagraphs(retry);
          const retriedLint = lintProse(retried);
          if (retriedLint.ok && countWords(retried) > countWords(paragraphs)) {
            paragraphs = retried;
            lint = retriedLint;
          }
        } catch {
          // Expansion is optional. Keep the valid first draft if the provider
          // exhausts retries rather than losing a chapter the child could read.
          await diag.record("operation.degraded", {
            level: "warn",
            status: "degraded",
            stage: "prose_expansion",
            errorCode: "PROSE_EXPANSION_FAILED",
            message: "The optional expansion failed; the first draft was kept.",
            retryable: false,
          });
        }
      }

      const verdict = await moderate(paragraphs.join("\n\n"));
      if (!verdict.ok) {
        throw new Error(`moderation rejected the chapter: ${verdict.reason}`);
      }

      if (!lint.ok) {
        throw new Error(`prose lint rejected the chapter: ${lint.reason}`);
      }

      // shortcut: the whole chapter lands in one write; stream paragraph by
      // paragraph once the adapter can stream (docs/03 §6).
      await ctx.runMutation(internal.chapters.setChapterProse, {
        chapterId,
        paragraphs,
        runId,
        // Background work inherits the trace but gets its own operation.
        diagnostics: diag.child({ name: "extraction" }),
      });
      await diag.record("operation.commit", {
        status: "succeeded",
        stage: "set_chapter_prose",
      });

      await diag.finish("succeeded");
      return paragraphs;
    } catch (cause) {
      const superseded =
        cause instanceof Error && cause.message.includes("no longer active");
      await diag.finish(superseded ? "superseded" : "failed", cause);
      const error =
        "We couldn't finish this chapter. Your choice is saved. Try again.";
      await ctx.runMutation(internal.chapters.abandonWriting, {
        chapterId,
        runId,
        error,
      });
      throw new ConvexError(error);
    }
  },
});

export const setIllustration = internalMutation({
  args: { chapterId: v.id("chapters"), fileId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chapterId, { illustrationFileId: args.fileId });
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
  args: {
    chapterId: v.id("chapters"),
    diagnostics: v.optional(diagnosticContext),
  },
  handler: async (ctx, { chapterId, diagnostics }): Promise<void> => {
    const { story, chapter, characters, next } = await ctx.runQuery(
      internal.chapters.getChapterContext,
      { chapterId },
    );
    if (chapter.extractionStatus === "DONE") return;

    const diag = createDiagnostics(ctx, {
      name: "extraction",
      traceId: diagnostics?.traceId ?? traceIdFor(story),
      operationId: diagnostics?.operationId,
      parentOperationId: diagnostics?.parentOperationId,
      runId: diagnostics?.runId,
      scheduledAt: diagnostics?.scheduledAt,
      storyId: story._id,
      chapterId,
      purpose: "structured",
    });
    await diag.start();

    try {
      await ctx.runMutation(internal.chapters.beginExtraction, { chapterId });

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

      const provider = getTextProvider("structured");
      const raw = await provider.complete(
        { ...prompt, jsonSchema: EXTRACTION_SCHEMA, maxTokens: 1200 },
        diag.providerProgress({
          provider: provider.name,
          purpose: "structured",
        }),
      );

      const extraction = parseExtraction(
        raw,
        new Set(story.items.map((item) => item.id)),
      );
      await diag.record("operation.validation", {
        status: "succeeded",
        stage: "extraction",
      });

      await ctx.runMutation(internal.chapters.applyExtraction, {
        chapterId,
        ...extraction,
      });
      await diag.record("operation.commit", {
        status: "succeeded",
        stage: "apply_extraction",
      });

      // Art and the next chapter's cards are background work from here on.
      await ctx.scheduler.runAfter(0, internal.media.illustrateChapter, {
        chapterId,
        diagnostics: diag.child({ name: "illustration" }),
      });

      if (next && next.beatCards.length === 0) {
        await ctx.scheduler.runAfter(0, internal.chapters.pitchNextChapter, {
          chapterId: next._id,
          diagnostics: diag.child({ name: "pitch" }),
        });
      }
      await diag.finish("succeeded");
    } catch (cause) {
      await diag.finish("failed", cause);
      await ctx.runMutation(internal.chapters.failExtraction, { chapterId });
      throw cause;
    }
  },
});

/**
 * "Next Chapter!" — the only transition that advances the book. Locking flips
 * the story to IN_PROGRESS on the first chapter and COMPLETED on the last.
 */
export const lockChapter = mutation({
  args: {
    chapterId: v.id("chapters"),
    clientOperationId: v.optional(v.string()),
  },
  handler: async (ctx, { chapterId, clientOperationId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) throw new Error("chapter not found");
    if (chapter.status === "LOCKED") return;

    if (chapter.paragraphs.length === 0) {
      throw new Error("chapter has no prose to lock");
    }

    const story = await ctx.db.get(chapter.storyId);
    if (!story) throw new Error("story not found");

    await ctx.db.patch(chapterId, { status: "LOCKED" });
    await ctx.db.patch(story._id, {
      status:
        chapter.index === story.totalChapters ? "COMPLETED" : "IN_PROGRESS",
    });

    if (chapter.index === story.totalChapters) {
      await queueExport(ctx, story._id);
    }

    // The EPUB needs the extraction even if it failed while the child read on.
    if (chapter.extractionStatus !== "DONE") {
      await ctx.scheduler.runAfter(0, internal.chapters.extractChapter, {
        chapterId,
        diagnostics: {
          traceId: traceIdFor(story),
          operationId:
            safeOperationId(clientOperationId) ?? createEventId("extract"),
          scheduledAt: Date.now(),
        },
      });
    }
  },
});
