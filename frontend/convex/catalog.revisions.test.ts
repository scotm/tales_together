/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import heroOptions from "./fixtures/hero-options.json";
import { WORLD_PROBLEMS, WORLD_SETTINGS } from "./fixtures/legacyCatalog";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.migrations.seedCatalog, {});
  const catalog = await t.query(api.catalog.listChoices, {});
  const ref = (key: string) => {
    const option = catalog.options.find((row) => row.key === key);
    if (!option) throw new Error(`Missing ${key}`);
    return { optionId: option.optionId, revision: option.revision };
  };
  const args = {
    setting: ref("set_bakery"),
    problem: ref("prob_cake"),
    character: ref("hero_otter"),
    outfit: ref("out_chef"),
    quirk: ref("quirk_bubbles"),
    packed: [ref("item_whisk"), ref("item_jam"), ref("item_kazoo")],
    protagonistName: "  Mira  ",
    authorName: "  Alex  ",
    kidGender: "open" as const,
  };
  return { t, catalog, ref, args };
}
function content(row: Doc<"catalogOptions">) {
  return {
    key: row.key,
    category: row.category,
    sortOrder: row.sortOrder,
    label: row.label,
    displayLabel: row.displayLabel,
    promptFragment: row.promptFragment,
    isDefault: row.isDefault,
    ...(row.titleSuffix ? { titleSuffix: row.titleSuffix } : {}),
    ...(row.assetKey ? { assetKey: row.assetKey } : {}),
    ...(row.supportsGender ? { supportsGender: true } : {}),
  };
}

const newItem = {
  key: "item_lantern",
  category: "item" as const,
  sortOrder: 6,
  label: "Friendly lantern",
  displayLabel: "Lantern",
  promptFragment: "A small warm lantern",
  isDefault: false,
  expectedRevision: 0,
};

describe("catalogue migration and publishing", () => {
  test("seed is idempotent, preserves all original fragments and returns display data only", async () => {
    const { t, catalog } = await setup();
    expect(catalog.options).toHaveLength(62);
    for (const category of ["character", "outfit", "quirk"]) {
      expect(
        catalog.options.filter((row) => row.category === category),
      ).toHaveLength(16);
    }
    expect(await t.mutation(internal.migrations.seedCatalog, {})).toEqual({
      inserted: 0,
    });
    const rows = await t.run((ctx) => ctx.db.query("catalogOptions").collect());
    const originals = [
      ...heroOptions.characters,
      ...heroOptions.outfits,
      ...heroOptions.quirks,
      ...WORLD_SETTINGS,
      ...WORLD_PROBLEMS,
    ];
    for (const original of originals) {
      expect(rows.find((row) => row.key === original.id)?.promptFragment).toBe(
        original.promptFragment,
      );
    }
    for (const option of catalog.options) {
      expect(option).not.toHaveProperty("promptFragment");
      expect(option).not.toHaveProperty("titleSuffix");
    }
  });

  test("publication retires the old version, keeps it pinned and survives reseeding", async () => {
    const { t, ref } = await setup();
    const oldId = ref("hero_otter").optionId;
    const old = await t.run((ctx) => ctx.db.get(oldId));
    if (!old) throw new Error("Missing original");
    const newId = await t.mutation(internal.catalog.publish, {
      ...content(old),
      label: "Curious otter",
      promptFragment: "a blue otter",
      expectedRevision: 1,
    });
    const active = await t.query(api.catalog.listChoices, {});
    expect(active.options.filter((row) => row.key === "hero_otter")).toEqual([
      expect.objectContaining({
        optionId: newId,
        revision: 2,
        label: "Curious otter",
      }),
    ]);
    const pinned = await t.query(api.catalog.listChoices, { pinned: [oldId] });
    expect(pinned.options.find((row) => row.optionId === oldId)).toMatchObject({
      active: false,
      withdrawn: false,
      revision: 1,
    });
    await t.mutation(internal.migrations.seedCatalog, {});
    expect(await t.run((ctx) => ctx.db.get(newId))).toMatchObject({
      active: true,
      label: "Curious otter",
    });
    expect(await t.run((ctx) => ctx.db.get(oldId))).toMatchObject({
      active: false,
    });
    await expect(
      t.mutation(internal.catalog.publish, {
        ...content(old),
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/revision changed/);
  });

  test("simultaneous publishes cannot create duplicate logical revisions", async () => {
    const { t } = await setup();
    const results = await Promise.allSettled([
      t.mutation(internal.catalog.publish, newItem),
      t.mutation(internal.catalog.publish, newItem),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const choices = await t.query(api.catalog.listChoices, {});
    expect(
      choices.options.filter((row) => row.key === newItem.key),
    ).toHaveLength(1);
  });

  test("validates problem titles, categories, gender and defaults at publication", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.catalog.publish, { ...newItem, category: "problem" }),
    ).rejects.toThrow(/title suffix/);
    await expect(
      t.mutation(internal.catalog.publish, {
        ...newItem,
        supportsGender: true,
      }),
    ).rejects.toThrow(/Only characters/);
    await expect(
      t.mutation(internal.catalog.publish, {
        ...newItem,
        category: "character",
        isDefault: true,
      }),
    ).rejects.toThrow(/Another default/);
    await expect(
      t.mutation(internal.catalog.publish, { ...newItem, promptFragment: " " }),
    ).rejects.toThrow(/text/);
    await t.mutation(internal.catalog.publish, newItem);
    await expect(
      t.mutation(internal.catalog.publish, {
        ...newItem,
        category: "outfit",
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/change category/);
  });
});

describe("structured setup", () => {
  test("server resolves descriptions and immutable snapshots; future catalogue changes do not alter the book", async () => {
    const { t, args } = await setup();
    const storyId = await t.mutation(api.stories.createFromSetup, args);
    const book = await t.query(api.stories.get, { storyId });
    expect(book?.story).toMatchObject({
      title: "Mira and the Royal Cake Escape",
      authorName: "Alex",
      setupChoices: {
        setting: { key: "set_bakery", revision: 1 },
        packed: [
          { key: "item_whisk" },
          { key: "item_jam" },
          { key: "item_kazoo" },
        ],
      },
    });
    expect(book?.characters[0]).toMatchObject({
      name: "Mira",
      visualDescription: `${heroOptions.characters[0]?.promptFragment} ${heroOptions.outfits[0]?.promptFragment}`,
      setupChoices: {
        kidGender: "open",
        character: { key: "hero_otter", revision: 1 },
      },
    });
    const old = await t.run((ctx) => ctx.db.get(args.character.optionId));
    if (!old) throw new Error("Missing original");
    await t.mutation(internal.catalog.publish, {
      ...content(old),
      promptFragment: "a blue otter",
      expectedRevision: 1,
    });
    expect(await t.query(api.stories.get, { storyId })).toEqual(book);
    // A retired selection in a draft still creates its exact old version.
    const second = await t.mutation(api.stories.createFromSetup, args);
    const restored = await t.query(api.stories.get, { storyId: second });
    expect(restored?.characters[0]?.visualDescription).toBe(
      book?.characters[0]?.visualDescription,
    );
  });

  test("withdrawal requires replacement while saved books remain readable", async () => {
    const { t, args } = await setup();
    const storyId = await t.mutation(api.stories.createFromSetup, args);
    await t.mutation(internal.catalog.withdraw, {
      optionId: args.outfit.optionId,
    });
    await expect(t.mutation(api.stories.createFromSetup, args)).rejects.toThrow(
      /withdrawn/,
    );
    expect(
      (
        await t.query(api.catalog.listChoices, {
          pinned: [args.outfit.optionId],
        })
      ).options.find((row) => row.optionId === args.outfit.optionId),
    ).toMatchObject({ withdrawn: true, active: false });
    const savedOutfit = (await t.query(api.stories.get, { storyId }))
      ?.characters[0]?.setupChoices?.outfit;
    expect(savedOutfit?.kind === "catalog" ? savedOutfit.key : undefined).toBe(
      "out_chef",
    );
    await t.mutation(internal.migrations.seedCatalog, {});
    expect(
      (await t.query(api.catalog.listChoices, {})).options.some(
        (row) => row.optionId === args.outfit.optionId,
      ),
    ).toBe(false);
  });

  test("rejects wrong categories, forged revisions, duplicate/short bags and blank names atomically", async () => {
    const { t, args } = await setup();
    for (const patch of [
      { character: args.outfit },
      { character: { ...args.character, revision: 200 } },
      { packed: [args.packed[0], args.packed[0], args.packed[1]] },
      { packed: args.packed.slice(0, 2) },
      { protagonistName: "   " },
    ])
      await expect(
        t.mutation(api.stories.createFromSetup, { ...args, ...patch }),
      ).rejects.toThrow();
    expect(await t.query(api.stories.listRecent, {})).toHaveLength(0);
  });

  test("supports new database items and labels without source-code changes", async () => {
    const { t, args } = await setup();
    const optionId = await t.mutation(internal.catalog.publish, newItem);
    const storyId = await t.mutation(api.stories.createFromSetup, {
      ...args,
      packed: [...args.packed.slice(0, 2), { optionId, revision: 1 }],
    });
    expect(
      (await t.query(api.stories.get, { storyId }))?.story.items[2],
    ).toMatchObject({ id: "item_lantern", name: "Friendly lantern" });
  });

  test("keeps gender open by default and only appends an explicitly selected child gender", async () => {
    const { t, args, ref } = await setup();
    await expect(
      t.mutation(api.stories.createFromSetup, { ...args, kidGender: "girl" }),
    ).rejects.toThrow(/gender/);
    const storyId = await t.mutation(api.stories.createFromSetup, {
      ...args,
      character: ref("hero_kid"),
      kidGender: "non-binary",
    });
    expect(
      (await t.query(api.stories.get, { storyId }))?.characters[0]
        ?.visualDescription,
    ).toContain("The child is non-binary.");
  });
});

test("bounded backfill previews exact legacy matches, is repeatable and preserves ambiguous/used records", async () => {
  const { t } = await setup();
  const legacy = {
    title: "Old book",
    setting: WORLD_SETTINGS[0]?.promptFragment ?? "",
    centralProblem: WORLD_PROBLEMS[0]?.promptFragment ?? "",
    protagonistName: "Mira",
    protagonistQuirk: heroOptions.quirks[0]?.promptFragment ?? "",
    visualDescription: `${heroOptions.characters[0]?.promptFragment} ${heroOptions.outfits[0]?.promptFragment}`,
    backpackItems: [
      { id: "item_whisk", name: "Golden Whisk" },
      { id: "item_jam", name: "Jar of Glow-Jam" },
      { id: "item_kazoo", name: "Grandma's Kazoo" },
    ],
  };
  const exact = await t.mutation(internal.stories.create, legacy);
  const unknown = await t.mutation(internal.stories.create, {
    ...legacy,
    visualDescription: "a child-designed cloud",
    setting: "a completely different place",
  });
  const used = await t.mutation(internal.stories.create, legacy);
  await t.run(async (ctx) => {
    const book = await ctx.db.get(used);
    if (book)
      await ctx.db.patch(used, {
        items: book.items.map((item) => ({ ...item, status: "USED" })),
      });
  });
  const opts = { paginationOpts: { cursor: null, numItems: 100 } };
  const preview = await t.mutation(internal.migrations.backfillSetupChoices, {
    ...opts,
    dryRun: true,
  });
  expect(preview).toMatchObject({ stories: 1, heroes: 2, isDone: true });
  expect(
    (await t.query(api.stories.get, { storyId: exact }))?.story.setupChoices,
  ).toBeUndefined();
  expect(
    await t.mutation(internal.migrations.backfillSetupChoices, {
      ...opts,
      dryRun: false,
    }),
  ).toEqual(preview);
  expect(
    (await t.query(api.stories.get, { storyId: exact }))?.story.setupChoices
      ?.setting.key,
  ).toBe("set_bakery");
  expect(
    (await t.query(api.stories.get, { storyId: unknown }))?.characters[0]
      ?.setupChoices,
  ).toBeUndefined();
  expect(
    (await t.query(api.stories.get, { storyId: used }))?.story.setupChoices,
  ).toBeUndefined();
  expect(
    await t.mutation(internal.migrations.backfillSetupChoices, {
      ...opts,
      dryRun: false,
    }),
  ).toMatchObject({ stories: 0, heroes: 0 });
});

test("publishes storage-backed previews without client assets and rejects non-image files", async () => {
  const { t } = await setup();
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
    ),
    (char) => char.charCodeAt(0),
  );
  const previewFileId = await t.run((ctx) =>
    ctx.storage.store(new Blob([png], { type: "image/png" })),
  );
  const optionId = await t.mutation(internal.catalog.publish, {
    ...newItem,
    previewFileId,
  });
  const choices = await t.query(api.catalog.listChoices, {});
  expect(
    choices.options.find((row) => row.optionId === optionId)?.previewUrl,
  ).toMatch(/^https?:/);
  const text = await t.run((ctx) =>
    ctx.storage.store(new Blob(["not an image"], { type: "text/plain" })),
  );
  await expect(
    t.mutation(internal.catalog.publish, {
      ...newItem,
      expectedRevision: 1,
      previewFileId: text,
    }),
  ).rejects.toThrow(/Previews must be/);
});
