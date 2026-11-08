import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import heroOptions from "./fixtures/hero-options.json";
import {
  CONVEYOR_ITEMS,
  WORLD_PROBLEMS,
  WORLD_SETTINGS,
} from "./fixtures/legacyCatalog";
import { snapshot } from "./lib/resolveSetup";

/** Insert missing logical keys once; never overwrite or reactivate published revisions. */
export const seedCatalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    const groups = [
      ["setting", WORLD_SETTINGS],
      ["problem", WORLD_PROBLEMS],
      ["character", heroOptions.characters],
      ["outfit", heroOptions.outfits],
      ["quirk", heroOptions.quirks],
      ["item", CONVEYOR_ITEMS],
    ] as const;
    for (const [category, options] of groups) {
      for (const [sortOrder, option] of options.entries()) {
        const existing = await ctx.db
          .query("catalogOptions")
          .withIndex("by_key_revision", (q) => q.eq("key", option.id))
          .first();
        if (existing) continue;
        await ctx.db.insert("catalogOptions", {
          key: option.id,
          category,
          revision: 1,
          active: true,
          sortOrder,
          label: option.label,
          displayLabel:
            "displayLabel" in option && typeof option.displayLabel === "string"
              ? option.displayLabel
              : option.label,
          promptFragment: option.promptFragment,
          ...("titleSuffix" in option && typeof option.titleSuffix === "string"
            ? { titleSuffix: option.titleSuffix }
            : {}),
          assetKey: option.id,
          previewLayout:
            category === "character" || category === "outfit"
              ? "layer"
              : "icon",
          isDefault: category === "item" ? sortOrder < 3 : sortOrder === 0,
          ...(option.id === "hero_kid" ? { supportsGender: true } : {}),
          createdAt: Date.now(),
        });
        inserted += 1;
      }
    }
    return { inserted };
  },
});

/** Optional bounded backfill: exact original seed matches only, never guess provenance. */
export const backfillSetupChoices = internalMutation({
  args: { paginationOpts: paginationOptsValidator, dryRun: v.boolean() },
  handler: async (ctx, { paginationOpts, dryRun }) => {
    if (paginationOpts.numItems > 100)
      throw new Error("Use batches of at most 100 stories.");
    const page = await ctx.db.query("stories").paginate(paginationOpts);
    const originalKeys = [
      ...WORLD_SETTINGS,
      ...WORLD_PROBLEMS,
      ...CONVEYOR_ITEMS,
      ...heroOptions.characters,
      ...heroOptions.outfits,
      ...heroOptions.quirks,
    ].map((option) => option.id);
    const seed = (
      await Promise.all(
        originalKeys.map((key) =>
          ctx.db
            .query("catalogOptions")
            .withIndex("by_key_revision", (q) =>
              q.eq("key", key).eq("revision", 1),
            )
            .unique(),
        ),
      )
    ).filter((row) => row !== null);
    let stories = 0;
    let heroes = 0;
    for (const story of page.page) {
      if (!story.setupChoices) {
        const setting = seed.find(
          (row) =>
            row.category === "setting" &&
            row.promptFragment === story.worldState.setting,
        );
        const problem = seed.find(
          (row) =>
            row.category === "problem" &&
            row.promptFragment === story.worldState.centralProblem,
        );
        const packed = story.items.map((item) =>
          seed.find(
            (row) =>
              row.category === "item" &&
              row.key === item.id &&
              row.label === item.name,
          ),
        );
        // Used inventories cannot establish the original bag; leave them untouched.
        if (
          setting &&
          problem &&
          packed.length === 3 &&
          new Set(packed.map((row) => row?.key)).size === 3 &&
          packed.every((row) => row !== undefined) &&
          story.items.every((item) => item.status === "IN_BACKPACK")
        ) {
          stories += 1;
          if (!dryRun)
            await ctx.db.patch(story._id, {
              setupChoices: {
                setting: snapshot(setting),
                problem: snapshot(problem),
                packed: packed.filter((row) => row !== undefined).map(snapshot),
              },
            });
        }
      }
      const characters = await ctx.db
        .query("characters")
        .withIndex("by_story", (q) => q.eq("storyId", story._id))
        .collect();
      for (const hero of characters.filter(
        (row) => row.role === "PROTAGONIST" && !row.setupChoices,
      )) {
        const pairs = seed
          .filter((row) => row.category === "character")
          .flatMap((character) =>
            seed
              .filter(
                (row) =>
                  row.category === "outfit" &&
                  `${character.promptFragment} ${row.promptFragment}` ===
                    hero.visualDescription,
              )
              .map((outfit) => ({ character, outfit })),
          );
        const quirks = seed.filter(
          (row) =>
            row.category === "quirk" && row.promptFragment === hero.quirk,
        );
        const pair = pairs[0];
        const quirk = quirks[0];
        if (pairs.length === 1 && quirks.length === 1 && pair && quirk) {
          heroes += 1;
          if (!dryRun)
            await ctx.db.patch(hero._id, {
              setupChoices: {
                character: snapshot(pair.character),
                outfit: snapshot(pair.outfit),
                quirk: snapshot(quirk),
                kidGender: "open",
              },
            });
        }
      }
    }
    return {
      stories,
      heroes,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
