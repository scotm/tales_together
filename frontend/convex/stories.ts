import { type Infer, v } from "convex/values";
import { createEventId } from "../shared/diagnostics/contract";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
import { BACKPACK_SIZE } from "./catalog";
import {
  catalogReference,
  heroSetupChoices,
  kidGender,
  storySetupChoices,
} from "./lib/catalogValidators";
import {
  CHAPTER_COUNT,
  DEFAULT_ART_STYLE,
  DEFAULT_VIBE,
  READING_LEVEL,
} from "./lib/config";
import { resolveChoice, snapshot } from "./lib/resolveSetup";
import { getArcRoleInstructions } from "./llm/promptMatrices";

const legacyArgs = {
  title: v.string(),
  setting: v.string(),
  centralProblem: v.string(),
  protagonistName: v.string(),
  protagonistQuirk: v.string(),
  visualDescription: v.string(),
  authorName: v.optional(v.string()),
  backpackItems: v.array(v.object({ id: v.string(), name: v.string() })),
};
const creationInput = v.object({
  ...legacyArgs,
  setupChoices: v.optional(storySetupChoices),
  heroChoices: v.optional(heroSetupChoices),
});

function requireValidBackpack(items: { id: string }[]) {
  if (items.length !== BACKPACK_SIZE)
    throw new Error(`a backpack holds exactly ${BACKPACK_SIZE} items`);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error("backpack items must be distinct");
}

async function createBook(ctx: MutationCtx, args: Infer<typeof creationInput>) {
  if (!args.title.trim() || !args.protagonistName.trim())
    throw new Error("a story needs a title and a hero name");
  const authorName = args.authorName?.trim();

  const storyId = await ctx.db.insert("stories", {
    title: args.title.trim(),
    ...(args.setupChoices ? { setupChoices: args.setupChoices } : {}),
    status: "SETUP",
    readingLevel: READING_LEVEL,
    totalChapters: CHAPTER_COUNT,
    vibe: DEFAULT_VIBE,
    artStyle: DEFAULT_ART_STYLE,
    worldState: {
      setting: args.setting,
      centralProblem: args.centralProblem,
      unresolvedThreads: [args.centralProblem],
    },
    items: args.backpackItems.map((item) => ({
      id: item.id,
      name: item.name,
      status: "IN_BACKPACK" as const,
    })),
    ...(authorName ? { authorName } : {}),
    traceId: createEventId("trace"),
    createdAt: Date.now(),
  });

  await ctx.db.insert("characters", {
    storyId,
    name: args.protagonistName.trim(),
    ...(args.heroChoices ? { setupChoices: args.heroChoices } : {}),
    role: "PROTAGONIST",
    quirk: args.protagonistQuirk,
    visualDescription: args.visualDescription,
  });

  for (let index = 1; index <= CHAPTER_COUNT; index += 1) {
    await ctx.db.insert("chapters", {
      storyId,
      index,
      arcRole: getArcRoleInstructions(index, CHAPTER_COUNT).role,
      status: "PITCHING",
      beatCards: [],
      paragraphs: [],
      summaryBullets: [],
      vocabNotes: [],
      extractionStatus: "PENDING",
    });
  }

  return storyId;
}

/** Compatibility endpoint for older clients; inventory still resolves against Convex. */
export const create = mutation({
  args: legacyArgs,
  handler: async (ctx, args) => {
    requireValidBackpack(args.backpackItems);
    const backpackItems = [];
    for (const item of args.backpackItems) {
      const options = await ctx.db
        .query("catalogOptions")
        .withIndex("by_key_revision", (q) => q.eq("key", item.id))
        .collect();
      const row = options.find(
        (row) =>
          row.active &&
          row.category === "item" &&
          row.withdrawnAt === undefined,
      );
      if (!row) throw new Error(`unknown backpack item: ${item.id}`);
      backpackItems.push({ id: row.key, name: row.label });
    }
    return await createBook(ctx, { ...args, backpackItems });
  },
});

/** Client submits references only; canonical descriptions and titles are server-owned. */
export const createFromSetup = mutation({
  args: {
    setting: catalogReference,
    problem: catalogReference,
    character: catalogReference,
    outfit: catalogReference,
    quirk: catalogReference,
    packed: v.array(catalogReference),
    protagonistName: v.string(),
    authorName: v.optional(v.string()),
    kidGender,
  },
  handler: async (ctx, args) => {
    const name = args.protagonistName.trim();
    if (!name || name.length > 40)
      throw new Error("Give your hero a name of 1–40 characters.");
    if ((args.authorName?.trim().length ?? 0) > 60)
      throw new Error("Author credit must be at most 60 characters.");
    if (args.packed.length !== BACKPACK_SIZE)
      throw new Error(`a backpack holds exactly ${BACKPACK_SIZE} items`);
    const setting = await resolveChoice(ctx, args.setting, "setting");
    const problem = await resolveChoice(ctx, args.problem, "problem");
    const character = await resolveChoice(ctx, args.character, "character");
    const outfit = await resolveChoice(ctx, args.outfit, "outfit");
    const quirk = await resolveChoice(ctx, args.quirk, "quirk");
    const packed = await Promise.all(
      args.packed.map((ref) => resolveChoice(ctx, ref, "item")),
    );
    requireValidBackpack(packed.map((row) => ({ id: row.key })));
    if (!problem.titleSuffix)
      throw new Error("This problem needs a title. Please choose another.");
    if (args.kidGender !== "open" && !character.supportsGender)
      throw new Error("This character does not support a gender choice.");
    const gender =
      args.kidGender === "open"
        ? ""
        : ` The child is ${args.kidGender === "non-binary" ? "non-binary" : `a ${args.kidGender}`}.`;
    return await createBook(ctx, {
      title: `${name} and ${problem.titleSuffix}`,
      setting: setting.promptFragment,
      centralProblem: problem.promptFragment,
      protagonistName: name,
      authorName: args.authorName,
      protagonistQuirk: quirk.promptFragment,
      visualDescription: `${character.promptFragment} ${outfit.promptFragment}${gender}`,
      backpackItems: packed.map((row) => ({ id: row.key, name: row.label })),
      setupChoices: {
        setting: snapshot(setting),
        problem: snapshot(problem),
        packed: packed.map(snapshot),
      },
      heroChoices: {
        character: snapshot(character),
        outfit: snapshot(outfit),
        quirk: snapshot(quirk),
        kidGender: args.kidGender,
      },
    });
  },
});

export const get = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);
    if (!story) return null;

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .collect();

    const characters = await ctx.db
      .query("characters")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .collect();

    return {
      story: {
        ...story,
        coverUrl: story.coverFileId
          ? await ctx.storage.getUrl(story.coverFileId)
          : null,
        epubUrl: story.epubFileId
          ? await ctx.storage.getUrl(story.epubFileId)
          : null,
      },
      chapters: await Promise.all(
        chapters.map(async (chapter) => ({
          ...chapter,
          illustrationUrl: chapter.illustrationFileId
            ? await ctx.storage.getUrl(chapter.illustrationFileId)
            : null,
        })),
      ),
      characters,
    };
  },
});

/** The cover prompt wants the hero's canonical description, not a name. */
export const getForCover = internalQuery({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;

    const characters = await ctx.db
      .query("characters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    const hero = characters.find(
      (character) => character.role === "PROTAGONIST",
    );

    return { ...story, heroVisualDescription: hero?.visualDescription };
  },
});

export const getForExport = internalQuery({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("story not found");

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();

    return { story, chapters };
  },
});

export const setCover = internalMutation({
  args: {
    storyId: v.id("stories"),
    fileId: v.id("_storage"),
    exportRunId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.exportRunId) {
      const story = await ctx.db.get(args.storyId);
      if (story?.exportRunId !== args.exportRunId)
        throw new Error("export attempt is no longer active");
    }
    await ctx.db.patch(args.storyId, { coverFileId: args.fileId });
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("stories").order("desc").take(10);
  },
});
