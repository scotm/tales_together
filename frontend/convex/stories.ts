import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const TOTAL_CHAPTERS = 5;

function arcRoleFor(index: number): string {
  if (index === 1) return "HOOK_AND_INCITING_INCIDENT";
  if (index === TOTAL_CHAPTERS) return "RESOLUTION_AND_CELEBRATION";
  if (index === TOTAL_CHAPTERS - 1) return "CLIMAX_AND_ALL_HOPE_IS_LOST";
  return `RISING_ACTION_COMPLICATION_${index}`;
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
    const storyId = await ctx.db.insert("stories", {
      title: args.title,
      status: "SETUP",
      readingLevel: "AGES_7_9",
      totalChapters: TOTAL_CHAPTERS,
      vibe: "SILLY_ADVENTURE",
      artStyle:
        "Warm watercolour and ink children's storybook illustration, whimsical, vibrant",
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

    for (let index = 1; index <= TOTAL_CHAPTERS; index += 1) {
      await ctx.db.insert("chapters", {
        storyId,
        index,
        arcRole: arcRoleFor(index),
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

    return { story, chapters, characters };
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("stories").order("desc").take(10);
  },
});
