/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const sample = {
  title: "Barnaby and the Runaway Cake",
  setting: "An underwater bakery inside a giant sunken teapot",
  centralProblem:
    "The Royal Sponge Cake has grown wings and floated out the chimney",
  protagonistName: "Barnaby Whiskers",
  protagonistQuirk: "Hiccups floating rainbow bubbles whenever he gets nervous",
  visualDescription:
    "A small scruffy brown river otter in a tall white chef hat",
  backpackItems: [
    { id: "item_whisk", name: "Golden Whisk" },
    { id: "item_jam", name: "Jar of Glow-Jam" },
    { id: "item_kazoo", name: "Grandma's Kazoo" },
  ],
};

test("create seeds five chapters with arc roles in order", async () => {
  const t = convexTest(schema, modules);
  const storyId = await t.mutation(api.stories.create, sample);

  const chapters = await t.run(async (ctx) =>
    ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect(),
  );

  expect(chapters).toHaveLength(5);
  expect(chapters.map((chapter) => chapter.arcRole)).toEqual([
    "HOOK_AND_INCITING_INCIDENT",
    "RISING_ACTION_COMPLICATION_2",
    "RISING_ACTION_COMPLICATION_3",
    "CLIMAX_AND_ALL_HOPE_IS_LOST",
    "RESOLUTION_AND_CELEBRATION",
  ]);
  expect(chapters.every((chapter) => chapter.status === "PITCHING")).toBe(true);
});

test("get returns story, chapters and characters", async () => {
  const t = convexTest(schema, modules);
  const storyId = await t.mutation(api.stories.create, sample);

  const result = await t.query(api.stories.get, { storyId });

  expect(result).not.toBeNull();
  expect(result?.story.title).toBe(sample.title);
  expect(result?.story.worldState.unresolvedThreads).toEqual([
    sample.centralProblem,
  ]);
  expect(result?.story.items[0].id).toBe("item_whisk");
  expect(result?.chapters).toHaveLength(5);
  expect(result?.characters[0].role).toBe("PROTAGONIST");
});
