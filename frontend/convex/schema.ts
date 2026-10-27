import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const readingLevel = v.union(
  v.literal("AGES_4_6"),
  v.literal("AGES_7_9"),
  v.literal("AGES_10_12"),
);

export const storyStatus = v.union(
  v.literal("SETUP"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
);

export const chapterStatus = v.union(
  v.literal("PITCHING"),
  v.literal("DIRECTING"),
  v.literal("WRITING"),
  v.literal("REVIEWING"),
  v.literal("LOCKED"),
);

export const extractionStatus = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("DONE"),
  v.literal("FAILED"),
);

export const itemStatus = v.union(
  v.literal("IN_BACKPACK"),
  v.literal("RESERVED_THIS_CHAPTER"),
  v.literal("USED"),
);

export const beatStyle = v.union(
  v.literal("BOLD_ACTION"),
  v.literal("CLEVER_TRICK"),
  v.literal("SILLY_TWIST"),
  v.literal("KID_WILDCARD"),
);

export const beatCard = v.object({
  cardId: v.string(),
  style: beatStyle,
  title: v.string(),
  kidFriendlyPitch: v.string(),
  iconEmoji: v.string(),
  suggestedItemId: v.optional(v.string()),
});

export const directorModifiers = v.object({
  useItemId: v.optional(v.string()),
  spotlightCharacterId: v.optional(v.id("characters")),
  weatherOrMood: v.optional(
    v.union(
      v.literal("SUNNY"),
      v.literal("STORMY"),
      v.literal("SPOOKY_NIGHT"),
      v.literal("BUBBLY_CHAOS"),
    ),
  ),
  soundEffectsBoost: v.boolean(),
  endingStyle: v.union(v.literal("CLIFFHANGER"), v.literal("COZY_PAUSE")),
});

export default defineSchema({
  stories: defineTable({
    title: v.string(),
    status: storyStatus,
    readingLevel,
    totalChapters: v.number(),
    vibe: v.string(),
    artStyle: v.string(),
    worldState: v.object({
      setting: v.string(),
      centralProblem: v.string(),
      unresolvedThreads: v.array(v.string()),
    }),
    items: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        status: itemStatus,
        usedInChapter: v.optional(v.number()),
      }),
    ),
    coverFileId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }),

  characters: defineTable({
    storyId: v.id("stories"),
    name: v.string(),
    role: v.union(
      v.literal("PROTAGONIST"),
      v.literal("SIDEKICK"),
      v.literal("PET"),
      v.literal("ANTAGONIST"),
    ),
    quirk: v.string(),
    visualDescription: v.string(),
    referenceFileId: v.optional(v.id("_storage")),
  }).index("by_story", ["storyId"]),

  chapters: defineTable({
    storyId: v.id("stories"),
    index: v.number(),
    arcRole: v.string(),
    status: chapterStatus,
    beatCards: v.array(beatCard),
    chosenBeat: v.optional(beatCard),
    modifiers: v.optional(directorModifiers),
    paragraphs: v.array(v.string()),
    summaryBullets: v.array(v.string()),
    vocabNotes: v.array(
      v.object({ word: v.string(), kidDefinition: v.string() }),
    ),
    extractionStatus,
    illustrationFileId: v.optional(v.id("_storage")),
  })
    .index("by_story", ["storyId", "index"])
    .index("by_story_status", ["storyId", "status"]),
});
