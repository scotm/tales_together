/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const sample = {
  title: "Barnaby and the Runaway Cake",
  setting: "An underwater bakery inside a giant sunken teapot",
  centralProblem: "The Royal Sponge Cake has grown wings",
  protagonistName: "Barnaby Whiskers",
  protagonistQuirk: "Hiccups bubbles when nervous",
  visualDescription: "A scruffy brown river otter in a tall white chef hat",
  backpackItems: [
    { id: "item_whisk", name: "Golden Whisk" },
    { id: "item_jam", name: "Jar of Glow-Jam" },
    { id: "item_kazoo", name: "Grandma's Kazoo" },
  ],
};

const extraction = {
  chapterTitle: "The Cake Flies",
  summaryBullets: [
    "The cake grew wings and floated up the chimney.",
    "Barnaby grabbed his whisk and chased it.",
    "The cake vanished over the reef.",
  ],
  itemsUsed: ["item_whisk"],
  newItems: [{ id: "item_feather", name: "Rainbow Feather" }],
  unresolvedThreads: ["Catch the cake before the Coral Queen arrives"],
  illustrationPrompt: "An otter in a chef hat whisking a flying cake.",
  videoMotionPrompt: "Crumbs drift upward as the cake rises.",
};

async function seedStory() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.migrations.seedCatalog, {});
  const storyId = await t.mutation(internal.stories.create, sample);
  const chapterId = await t.run(async (ctx) => {
    const chapter = (
      await ctx.db
        .query("chapters")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect()
    ).find((entry) => entry.index === 1);
    if (!chapter) throw new Error("chapter 1 missing");
    return chapter._id;
  });
  return { t, storyId, chapterId };
}

test("applyExtraction moves the chapter state forward", async () => {
  const { t, storyId, chapterId } = await seedStory();

  await t.mutation(internal.chapters.applyExtraction, {
    chapterId,
    ...extraction,
  });

  const { chapter, story } = await t.run(async (ctx) => ({
    chapter: await ctx.db.get(chapterId),
    story: await ctx.db.get(storyId),
  }));

  expect(chapter?.title).toBe("The Cake Flies");
  expect(chapter?.summaryBullets).toHaveLength(3);
  expect(chapter?.illustrationPrompt).toContain("flying cake");
  expect(chapter?.extractionStatus).toBe("DONE");

  const whisk = story?.items.find((item) => item.id === "item_whisk");
  expect(whisk?.status).toBe("USED");
  expect(whisk?.usedInChapter).toBe(1);
  expect(story?.items.find((item) => item.id === "item_jam")?.status).toBe(
    "IN_BACKPACK",
  );
  expect(story?.items.find((item) => item.id === "item_feather")?.status).toBe(
    "IN_BACKPACK",
  );
  expect(story?.worldState.unresolvedThreads).toEqual(
    extraction.unresolvedThreads,
  );
});

test("a second extraction replaces threads instead of appending", async () => {
  const { t, storyId, chapterId } = await seedStory();

  await t.mutation(internal.chapters.applyExtraction, {
    chapterId,
    ...extraction,
  });
  await t.mutation(internal.chapters.applyExtraction, {
    chapterId,
    ...extraction,
    unresolvedThreads: ["The feather is humming"],
  });

  const story = await t.run(async (ctx) => ctx.db.get(storyId));
  expect(story?.worldState.unresolvedThreads).toEqual([
    "The feather is humming",
  ]);
  // Replays must not duplicate the item the story already picked up.
  expect(
    story?.items.filter((item) => item.id === "item_feather"),
  ).toHaveLength(1);
});

test("a malformed extraction is rejected before anything is written", async () => {
  const { t, storyId, chapterId } = await seedStory();

  await expect(
    t.mutation(internal.chapters.applyExtraction, {
      chapterId,
      ...extraction,
      summaryBullets: ["too short"],
    }),
  ).rejects.toThrow(/exactly 3/);

  const { chapter, story } = await t.run(async (ctx) => ({
    chapter: await ctx.db.get(chapterId),
    story: await ctx.db.get(storyId),
  }));
  expect(chapter?.extractionStatus).toBe("PENDING");
  expect(chapter?.title).toBeUndefined();
  expect(story?.worldState.unresolvedThreads).toEqual([sample.centralProblem]);
});

test("locking the first chapter moves the story to IN_PROGRESS", async () => {
  const { t, storyId, chapterId } = await seedStory();
  await t.mutation(internal.chapters.setChapterProse, {
    chapterId,
    paragraphs: ["Mira ran."],
  });

  await t.mutation(api.chapters.lockChapter, { chapterId });
  // Idempotent: a second tap must not move the story backwards.
  await t.mutation(api.chapters.lockChapter, { chapterId });

  const { chapter, story } = await t.run(async (ctx) => ({
    chapter: await ctx.db.get(chapterId),
    story: await ctx.db.get(storyId),
  }));
  expect(chapter?.status).toBe("LOCKED");
  expect(story?.status).toBe("IN_PROGRESS");
});

test("five locked chapters finish the book in order", async () => {
  const { t, storyId } = await seedStory();
  const chapters = await t.run(async (ctx) =>
    ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect(),
  );
  expect(chapters.map((entry) => entry.index)).toEqual([1, 2, 3, 4, 5]);

  for (const entry of chapters) {
    await t.mutation(internal.chapters.setChapterProse, {
      chapterId: entry._id,
      paragraphs: [`Chapter ${entry.index} prose.`],
    });
    await t.mutation(api.chapters.lockChapter, { chapterId: entry._id });
  }

  const after = await t.run(async (ctx) =>
    ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect(),
  );
  expect(after.every((entry) => entry.status === "LOCKED")).toBe(true);
  const story = await t.run(async (ctx) => ctx.db.get(storyId));
  expect(story?.status).toBe("COMPLETED");
});

test("a chapter with no prose cannot be locked", async () => {
  const { t, chapterId } = await seedStory();

  await expect(
    t.mutation(api.chapters.lockChapter, { chapterId }),
  ).rejects.toThrow(/no prose/);
});
