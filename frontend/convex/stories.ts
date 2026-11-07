import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { BACKPACK_SIZE, CONVEYOR_ITEMS } from "./catalog";
import {
  CHAPTER_COUNT,
  DEFAULT_ART_STYLE,
  DEFAULT_VIBE,
  READING_LEVEL,
} from "./lib/config";
import { getArcRoleInstructions } from "./llm/promptMatrices";

const CATALOG_ITEM_IDS = new Set(CONVEYOR_ITEMS.map((item) => item.id));

// The mutation is the trust boundary: the UI limiting picks to three is a
// convenience, not a guarantee.
function requireValidBackpack(items: { id: string; name: string }[]) {
  if (items.length !== BACKPACK_SIZE) {
    throw new Error(`a backpack holds exactly ${BACKPACK_SIZE} items`);
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("backpack items must be distinct");
  }
  for (const item of items) {
    if (!CATALOG_ITEM_IDS.has(item.id)) {
      throw new Error(`unknown backpack item: ${item.id}`);
    }
  }
}

// v0 has no accounts: the story id in the URL is the only access control.
export const create = mutation({
  args: {
    title: v.string(),
    setting: v.string(),
    centralProblem: v.string(),
    protagonistName: v.string(),
    protagonistQuirk: v.string(),
    visualDescription: v.string(),
    backpackItems: v.array(v.object({ id: v.string(), name: v.string() })),
  },
  handler: async (ctx, args) => {
    requireValidBackpack(args.backpackItems);
    if (!args.title.trim() || !args.protagonistName.trim()) {
      throw new Error("a story needs a title and a hero name");
    }

    const storyId = await ctx.db.insert("stories", {
      title: args.title,
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
      createdAt: Date.now(),
    });

    await ctx.db.insert("characters", {
      storyId,
      name: args.protagonistName,
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
